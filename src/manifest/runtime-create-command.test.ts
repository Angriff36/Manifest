import { describe, expect, it } from 'vitest';
import { IRCompiler } from './ir-compiler';
import type { IR } from './ir';
import { RuntimeEngine, type EntityInstance, type Store } from './runtime-engine';
import { MemoryOutboxStore } from './outbox/stores/memory';

async function compile(source: string): Promise<IR> {
  const compiler = new IRCompiler();
  const result = await compiler.compileToIR(source);
  if (!result.ir) {
    throw new Error(`Compilation failed: ${result.diagnostics.map(d => d.message).join(', ')}`);
  }
  return result.ir;
}

class TrackingStore implements Store<EntityInstance> {
  readonly created: EntityInstance[] = [];
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
    return this.rows.delete(id);
  }

  async clear(): Promise<void> {
    this.rows.clear();
    this.created.length = 0;
  }
}

async function compileTodoCreate(): Promise<IR> {
  return compile(`
    entity Todo {
      property id: string
      property title: string
      property completed: boolean
      property createdAt: timestamp

      command create(title: string) {
        guard title != ""
        guard length(title) < 100
        mutate title = title
        mutate completed = false
        mutate createdAt = now()
      }
    }
  `);
}

describe('RuntimeEngine create command auto-instantiation', () => {
  it('persists the quickstart Todo.create command without pre-seeded bootstrap state', async () => {
    const ir = await compileTodoCreate();
    const runtime = new RuntimeEngine(ir, {}, {
      generateId: () => 'todo-1',
      now: () => 12345,
    });

    const result = await runtime.runCommand('create', { title: 'Learn Manifest' }, {
      entityName: 'Todo',
    });

    const persisted = await runtime.getInstance('Todo', 'todo-1');
    expect(result.success).toBe(true);
    expect(result.result).toEqual(persisted);
    expect(result.instance).toEqual(persisted);
    expect(persisted).toMatchObject({
      id: 'todo-1',
      title: 'Learn Manifest',
      completed: false,
      createdAt: 12345,
    });
  });

  it('uses body.id when provided', async () => {
    const ir = await compileTodoCreate();
    const runtime = new RuntimeEngine(ir, {}, {
      generateId: () => 'generated-id',
      now: () => 1,
    });

    const result = await runtime.runCommand('create', {
      id: 'provided-id',
      title: 'Provided',
    }, { entityName: 'Todo' });

    expect(result.success).toBe(true);
    expect(result.instance).toMatchObject({ id: 'provided-id', title: 'Provided' });
    expect(await runtime.getInstance('Todo', 'provided-id')).toBeDefined();
    expect(await runtime.getInstance('Todo', 'generated-id')).toBeUndefined();
  });

  it('does not persist when a create guard fails', async () => {
    const ir = await compileTodoCreate();
    const runtime = new RuntimeEngine(ir, {}, { generateId: () => 'todo-guard' });

    const result = await runtime.runCommand('create', { title: '' }, { entityName: 'Todo' });

    expect(result.success).toBe(false);
    expect(result.guardFailure).toBeDefined();
    expect(await runtime.getAllInstances('Todo')).toEqual([]);
  });

  it('evaluates create guards against the seeded candidate instance before persisting', async () => {
    const ir = await compile(`
      entity Todo {
        property id: string
        property title: string

        command create(title: string) {
          guard self.title == "Candidate"
          mutate title = title
        }
      }
    `);
    const runtime = new RuntimeEngine(ir, {}, { generateId: () => 'todo-self-guard' });

    const result = await runtime.runCommand('create', { title: 'Candidate' }, {
      entityName: 'Todo',
    });

    expect(result.success).toBe(true);
    expect(result.instance).toMatchObject({
      id: 'todo-self-guard',
      title: 'Candidate',
    });
  });

  it('evaluates create command constraints against the seeded candidate instance', async () => {
    const ir = await compile(`
      entity Todo {
        property id: string
        property title: string

        command create(title: string) {
          constraint titlePresent: self.title == "Candidate"
          mutate title = title
        }
      }
    `);
    const runtime = new RuntimeEngine(ir, {}, { generateId: () => 'todo-command-constraint' });

    const result = await runtime.runCommand('create', { title: 'Candidate' }, {
      entityName: 'Todo',
    });

    expect(result.success).toBe(true);
    expect(result.instance).toMatchObject({
      id: 'todo-command-constraint',
      title: 'Candidate',
    });
  });

  it('does not persist when a create policy denies the seeded candidate instance', async () => {
    const ir = await compile(`
      entity Todo {
        property id: string
        property title: string
        default policy TitleAllowed execute: self.title != "blocked"

        command create(title: string) {
          mutate title = title
        }
      }
    `);
    const runtime = new RuntimeEngine(ir, {}, { generateId: () => 'todo-policy' });

    const result = await runtime.runCommand('create', { title: 'blocked' }, {
      entityName: 'Todo',
    });

    expect(result.success).toBe(false);
    expect(result.policyDenial?.policyName).toBe('TitleAllowed');
    expect(await runtime.getAllInstances('Todo')).toEqual([]);
  });

  it('does not persist when a create body fails an entity block constraint', async () => {
    const ir = await compile(`
      entity Todo {
        property id: string
        property title: string
        constraint shortTitle: length(self.title) < 5

        command create(title: string) {
          mutate title = title
        }
      }
    `);
    const runtime = new RuntimeEngine(ir, {}, { generateId: () => 'todo-block' });

    const result = await runtime.runCommand('create', { title: 'too long' }, {
      entityName: 'Todo',
    });

    expect(result.success).toBe(false);
    expect(result.constraintOutcomes?.[0]).toMatchObject({
      code: 'shortTitle',
      passed: false,
      severity: 'block',
    });
    expect(await runtime.getAllInstances('Todo')).toEqual([]);
  });

  it('emits events with created subject id and enqueues them to the outbox', async () => {
    const outbox = new MemoryOutboxStore();
    const ir = await compile(`
      entity Todo {
        property id: string
        property title: string
        event TodoCreated

        command create(title: string) {
          mutate title = title
          emit TodoCreated
        }
      }
    `);
    const runtime = new RuntimeEngine(ir, {}, {
      generateId: () => 'todo-event',
      outboxStore: outbox,
    });

    const result = await runtime.runCommand('create', { title: 'Events' }, {
      entityName: 'Todo',
    });

    expect(result.success).toBe(true);
    expect(result.emittedEvents).toHaveLength(1);
    expect(result.emittedEvents[0].subject).toEqual({
      entity: 'Todo',
      command: 'create',
      id: 'todo-event',
    });
    expect(outbox.size()).toBe(1);
    expect(outbox.list()[0].event.subject).toEqual(result.emittedEvents[0].subject);
  });

  it('persists through the configured Store.create path', async () => {
    const store = new TrackingStore();
    const ir = await compileTodoCreate();
    const runtime = new RuntimeEngine(ir, {}, {
      generateId: () => 'todo-store',
      storeProvider: entityName => entityName === 'Todo' ? store : undefined,
    });

    const result = await runtime.runCommand('create', { title: 'Store path' }, {
      entityName: 'Todo',
    });

    expect(result.success).toBe(true);
    expect(store.created).toHaveLength(1);
    expect(store.created[0]).toMatchObject({ id: 'todo-store', title: 'Store path' });
  });

  it('keeps existing update-style commands with instanceId unchanged', async () => {
    const ir = await compile(`
      entity Todo {
        property id: string
        property title: string

        command rename(title: string) {
          mutate title = title
        }
      }
    `);
    const runtime = new RuntimeEngine(ir);
    await runtime.createInstance('Todo', { id: 'todo-update', title: 'Old' });

    const result = await runtime.runCommand('rename', { title: 'New' }, {
      entityName: 'Todo',
      instanceId: 'todo-update',
    });

    expect(result.success).toBe(true);
    expect(await runtime.getInstance('Todo', 'todo-update')).toMatchObject({
      id: 'todo-update',
      title: 'New',
    });
  });

  it('keeps command-name create with instanceId on the existing update path', async () => {
    const ir = await compile(`
      entity Todo {
        property id: string
        property title: string

        command create(title: string) {
          mutate title = title
        }
      }
    `);
    const runtime = new RuntimeEngine(ir, {}, { generateId: () => 'unexpected-create' });
    await runtime.createInstance('Todo', { id: 'todo-existing', title: 'Old' });

    const result = await runtime.runCommand('create', { title: 'Updated' }, {
      entityName: 'Todo',
      instanceId: 'todo-existing',
    });

    expect(result.success).toBe(true);
    expect(result.instance).toBeUndefined();
    expect(await runtime.getAllInstances('Todo')).toEqual([
      expect.objectContaining({ id: 'todo-existing', title: 'Updated' }),
    ]);
  });

  it('does not auto-create arbitrary non-create commands without instanceId', async () => {
    const ir = await compile(`
      entity Todo {
        property id: string
        property title: string

        command rename(title: string) {
          mutate title = title
        }
      }
    `);
    const runtime = new RuntimeEngine(ir, {}, { generateId: () => 'todo-renamed' });

    const result = await runtime.runCommand('rename', { title: 'No row' }, {
      entityName: 'Todo',
    });

    expect(result.success).toBe(true);
    expect(result.instance).toBeUndefined();
    expect(await runtime.getAllInstances('Todo')).toEqual([]);
  });
});
