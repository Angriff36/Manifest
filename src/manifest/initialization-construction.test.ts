import { describe, expect, it } from 'vitest';
import { IRCompiler } from './ir-compiler';
import type { IR } from './ir';
import { RuntimeEngine, type EntityInstance, type Store } from './runtime-engine';
import { buildInitializationPlan } from './initialization-plan.js';

async function compile(source: string): Promise<IR> {
  const compiler = new IRCompiler();
  const result = await compiler.compileToIR(source);
  if (!result.ir) {
    throw new Error(`Compilation failed: ${result.diagnostics.map((d) => d.message).join(', ')}`);
  }
  return result.ir;
}

class TrackingStore implements Store<EntityInstance> {
  readonly created: EntityInstance[] = [];
  readonly deleted: string[] = [];
  private readonly rows = new Map<string, EntityInstance>();

  async getAll(): Promise<EntityInstance[]> {
    return [...this.rows.values()];
  }

  async getById(id: string): Promise<EntityInstance | undefined> {
    return this.rows.get(id);
  }

  async create(data: Partial<EntityInstance>): Promise<EntityInstance> {
    const row = { ...data } as EntityInstance;
    this.created.push(row);
    this.rows.set(row.id, row);
    return row;
  }

  async update(id: string, data: Partial<EntityInstance>): Promise<EntityInstance | undefined> {
    const existing = this.rows.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data, id };
    this.rows.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    this.deleted.push(id);
    return this.rows.delete(id);
  }

  async clear(): Promise<void> {
    this.rows.clear();
    this.created.length = 0;
    this.deleted.length = 0;
  }
}

describe('Atomic initialization construction', () => {
  it('allows a required final field to be assigned by the initialization command without a placeholder default', async () => {
    const ir = await compile(`
      entity Item {
        property id: string
        property label: string
        property required createdAt: datetime

        command create(label: string) {
          mutate label = label
          mutate createdAt = now()
        }
      }
    `);
    const create = ir.commands.find((command) => command.name === 'create')!;
    expect(create.initialization?.commandOwnedFields).toContain('createdAt');
    expect(create.initialization?.declaredDefaults.some((d) => d.property === 'createdAt')).toBe(
      false,
    );

    const runtime = new RuntimeEngine(ir, {}, { generateId: () => 'item-1', now: () => 99 });
    const result = await runtime.runCommand('create', { label: 'A' }, { entityName: 'Item' });
    expect(result.success).toBe(true);
    expect(result.instance).toMatchObject({ id: 'item-1', label: 'A', createdAt: 99 });
  });

  it('keeps a command-owned timestamp absent from the draft and present on the final document', async () => {
    const ir = await compile(`
      entity Note {
        property id: string
        property title: string
        property introducedAt: datetime?

        command introduce(title: string) {
          guard self.introducedAt == null
          mutate title = title
          mutate introducedAt = now()
        }
      }
    `);
    const entity = ir.entities[0]!;
    const command = ir.commands.find((item) => item.name === 'introduce')!;
    const plan = command.initialization ?? buildInitializationPlan(entity, command)!;
    expect(plan.commandOwnedFields).toContain('introducedAt');
    expect(plan.draftFields).not.toContain('introducedAt');

    const store = new TrackingStore();
    const runtime = new RuntimeEngine(
      ir,
      {},
      {
        generateId: () => 'note-1',
        now: () => 1234,
        storeProvider: (name) => (name === 'Note' ? store : undefined),
      },
    );
    const result = await runtime.runCommand(
      'introduce',
      { title: 'Hello' },
      { entityName: 'Note' },
    );
    expect(result.success).toBe(true);
    expect(store.created).toHaveLength(1);
    expect(store.created[0]).toMatchObject({
      id: 'note-1',
      title: 'Hello',
      introducedAt: 1234,
    });
    expect('introducedAt' in store.created[0]!).toBe(true);
  });

  it('omits optional undefined fields and preserves explicit null', async () => {
    const ir = await compile(`
      entity Card {
        property id: string
        property title: string
        property notes: string?

        command create(title: string, optional notes: string?) {
          mutate title = title
          mutate notes = notes
        }
      }
    `);
    const runtime = new RuntimeEngine(ir, {}, { generateId: () => 'card-1' });
    const omitted = await runtime.runCommand(
      'create',
      { title: 'T' },
      { entityName: 'Card' },
    );
    expect(omitted.success).toBe(true);
    expect(omitted.instance).toMatchObject({ id: 'card-1', title: 'T' });
    expect('notes' in (omitted.instance as object)).toBe(false);

    const runtime2 = new RuntimeEngine(ir, {}, { generateId: () => 'card-2' });
    const nullable = await runtime2.runCommand(
      'create',
      { title: 'T', notes: null },
      { entityName: 'Card' },
    );
    expect(nullable.success).toBe(true);
    expect(nullable.instance).toMatchObject({ id: 'card-2', title: 'T', notes: null });
  });

  it('denies unauthorized initialization before persistence', async () => {
    const store = new TrackingStore();
    const ir = await compile(`
      entity Secret {
        property id: string
        property title: string
        default policy OwnerOnly execute: user.role == "admin"

        command create(title: string) {
          mutate title = title
        }
      }
    `);
    const runtime = new RuntimeEngine(
      ir,
      { user: { id: 'u1', role: 'guest' } },
      {
        generateId: () => 'secret-1',
        storeProvider: (name) => (name === 'Secret' ? store : undefined),
      },
    );
    const result = await runtime.runCommand(
      'create',
      { title: 'nope' },
      { entityName: 'Secret' },
    );
    expect(result.success).toBe(false);
    expect(result.policyDenial).toBeDefined();
    expect(store.created).toHaveLength(0);
  });

  it('still evaluates genuine dynamic guards and persists nothing on failure', async () => {
    const store = new TrackingStore();
    const ir = await compile(`
      entity Task {
        property id: string
        property title: string

        command create(title: string) {
          guard length(title) > 3
          mutate title = title
        }
      }
    `);
    const runtime = new RuntimeEngine(
      ir,
      {},
      {
        generateId: () => 'task-1',
        storeProvider: (name) => (name === 'Task' ? store : undefined),
      },
    );
    const result = await runtime.runCommand('create', { title: 'ab' }, { entityName: 'Task' });
    expect(result.success).toBe(false);
    expect(result.guardFailure).toBeDefined();
    expect(store.created).toHaveLength(0);
  });

  it('does not require handwritten lifecycle transition guards for initialization', async () => {
    const ir = await compile(`
      entity Ticket {
        property id: string
        property required title: string
        property status: string = "open"
        transition status from "open" to ["closed"]

        command open(title: string) {
          mutate title = title
          mutate status = "open"
        }
      }
    `);
    expect(ir.commands.find((command) => command.name === 'open')?.initialization).toBeDefined();
    const runtime = new RuntimeEngine(ir, {}, { generateId: () => 'ticket-1' });
    const result = await runtime.runCommand(
      'open',
      { title: 'T' },
      { entityName: 'Ticket' },
    );
    expect(result.success).toBe(true);
    expect(result.instance).toMatchObject({ id: 'ticket-1', title: 'T', status: 'open' });
  });

  it('emits events against the final persisted state after a single create', async () => {
    const store = new TrackingStore();
    const ir = await compile(`
      entity Widget {
        property id: string
        property title: string
        property stampedAt: datetime
        event WidgetCreated

        command create(title: string) {
          mutate title = title
          mutate stampedAt = now()
          emit WidgetCreated
        }
      }
    `);
    const runtime = new RuntimeEngine(
      ir,
      {},
      {
        generateId: () => 'widget-1',
        now: () => 55,
        storeProvider: (name) => (name === 'Widget' ? store : undefined),
      },
    );
    const result = await runtime.runCommand(
      'create',
      { title: 'W' },
      { entityName: 'Widget' },
    );
    expect(result.success).toBe(true);
    expect(store.created).toHaveLength(1);
    expect(store.created[0]).toMatchObject({ stampedAt: 55 });
    expect(result.emittedEvents[0]?.subject).toEqual({
      entity: 'Widget',
      command: 'create',
      id: 'widget-1',
    });
  });
});
