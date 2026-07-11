import { describe, expect, it } from 'vitest';
import { IRCompiler } from './ir-compiler';
import type { IR } from './ir';
import { RuntimeEngine, type EntityInstance, type Store } from './runtime-engine';

async function compile(source: string): Promise<IR> {
  const result = await new IRCompiler().compileToIR(source);
  if (!result.ir) {
    throw new Error(`Compilation failed: ${result.diagnostics.map((d) => d.message).join(', ')}`);
  }
  return result.ir;
}

/** Memory store that counts read/write calls so we can assert persistence shape. */
class CountingStore implements Store<EntityInstance> {
  getByIdCalls = 0;
  updateCalls = 0;
  readonly rows = new Map<string, EntityInstance>();

  async getAll(): Promise<EntityInstance[]> {
    return [...this.rows.values()];
  }
  async getById(id: string): Promise<EntityInstance | undefined> {
    this.getByIdCalls += 1;
    return this.rows.get(id);
  }
  async create(data: Partial<EntityInstance>): Promise<EntityInstance> {
    const row = { ...data } as EntityInstance;
    this.rows.set(row.id, row);
    return row;
  }
  async update(id: string, data: Partial<EntityInstance>): Promise<EntityInstance | undefined> {
    this.updateCalls += 1;
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
  }
}

// Multi-field update command on an existing instance — the Event.update shape.
const SOURCE = `
  entity Event {
    property id: string
    property title: string
    property location: string
    property capacity: number
    property status: string

    command reschedule(title: string, location: string, capacity: number, status: string) {
      mutate title = title
      mutate location = location
      mutate capacity = capacity
      mutate status = status
    }
  }
`;

describe('command-scoped batched persistence', () => {
  it('persists a multi-field command once, not once per mutated field', async () => {
    const ir = await compile(SOURCE);
    const store = new CountingStore();
    store.rows.set('evt-1', {
      id: 'evt-1',
      title: 'Old',
      location: 'Old Hall',
      capacity: 10,
      status: 'draft',
    });

    const runtime = new RuntimeEngine(
      ir,
      {},
      {
        storeProvider: (name) => (name === 'Event' ? store : undefined),
      },
    );

    const result = await runtime.runCommand(
      'reschedule',
      { title: 'New', location: 'New Hall', capacity: 25, status: 'published' },
      { entityName: 'Event', instanceId: 'evt-1' },
    );

    expect(result.success).toBe(true);

    // The regression: 4 mutate actions must collapse to a single write and a
    // single read, regardless of how many fields the command touches.
    expect(store.updateCalls).toBe(1);
    expect(store.getByIdCalls).toBe(1);

    // Committed state reflects every field change (events/reads see final state).
    expect(store.rows.get('evt-1')).toMatchObject({
      id: 'evt-1',
      title: 'New',
      location: 'New Hall',
      capacity: 25,
      status: 'published',
    });
  });

  it('persists nothing when a mid-command state transition fails (atomic)', async () => {
    const ir = await compile(`
      entity Doc {
        property id: string
        property title: string
        property status: string

        transition status from "draft" to ["review"]

        command release(title: string) {
          mutate title = title
          mutate status = "published"
        }
      }
    `);
    const store = new CountingStore();
    store.rows.set('doc-1', { id: 'doc-1', title: 'Old', status: 'draft' });

    const runtime = new RuntimeEngine(
      ir,
      {},
      {
        storeProvider: (name) => (name === 'Doc' ? store : undefined),
      },
    );

    const result = await runtime.runCommand(
      'release',
      { title: 'New' },
      { entityName: 'Doc', instanceId: 'doc-1' },
    );

    expect(result.success).toBe(false);
    // No partial write: the earlier title mutation must not reach the store.
    expect(store.updateCalls).toBe(0);
    expect(store.rows.get('doc-1')).toMatchObject({ title: 'Old', status: 'draft' });
  });
});
