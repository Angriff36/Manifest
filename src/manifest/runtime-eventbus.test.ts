/**
 * Engine ⇆ EventBus seam tests.
 *
 * When RuntimeOptions.eventBus is supplied, RuntimeEngine bridges its in-process
 * event stream to the bus. These tests prove, deterministically and without a
 * network, that:
 *
 *   OUTBOUND
 *   (a) non-provider: a command's events publish as ONE message on completion;
 *   (b) provider mode: ONE message post-commit with the whole committed set;
 *   (c) a rolled-back attempt (provider mode) publishes NOTHING;
 *   (d) a reaction cascade publishes ONE message containing parent + reaction
 *       events, with no intermediate publishes (both modes);
 *   (e) a duplicate idempotency key does NOT publish a second time;
 *   (f) a publish failure is logged but does NOT fail the command.
 *
 *   INBOUND
 *   (g) two engines sharing one bus: engine A's command reaches engine B's
 *       listener, and A's own listener is notified exactly once (self-echo
 *       filtered by originId);
 *   (h) connectEventBus is idempotent (a second connect does not double-deliver);
 *
 *   INTEGRATION
 *   (i) a subscriber on engine B receives an event emitted by a command on
 *       engine A through the configured bus, with a transaction provider active
 *       on A (the acceptance criterion).
 *
 * originId is derived from RuntimeOptions.generateId, so each engine is given a
 * DISTINCT generator (real deployments use crypto.randomUUID, always distinct);
 * a shared constant generator would collapse two engines to one origin and is
 * the caller's bug, not the engine's.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  RuntimeEngine,
  type RuntimeContext,
  type RuntimeOptions,
  type Store,
  type EntityInstance,
  type CommandResult,
  type EmittedEvent,
  type TransactionProvider,
  type TransactionHandle,
  type IdempotencyStore,
} from './runtime-engine';
import type { IR } from './ir';
import type { OutboxEntry, OutboxStore } from './outbox/outbox-store';
import { MemoryEventBus, type EventBus, type EventBusMessage } from './events/event-bus';
import { IRCompiler } from './ir-compiler';

// ── Harness ────────────────────────────────────────────────────────────────

async function compile(source: string): Promise<IR> {
  const result = await new IRCompiler().compileToIR(source);
  if (!result.ir) {
    throw new Error(`Compile failed: ${result.diagnostics.map((d) => d.message).join(', ')}`);
  }
  return result.ir;
}

let engineSeq = 0;
/** Build an engine with a DISTINCT deterministic id source → distinct originId. */
function makeEngine(
  ir: IR,
  extra: Partial<RuntimeOptions> = {},
  context: RuntimeContext = {},
): RuntimeEngine {
  const prefix = `e${++engineSeq}`;
  let n = 0;
  return new RuntimeEngine(ir, context, {
    generateId: () => `${prefix}-${++n}`,
    now: () => 1_700_000_000_000,
    sleep: async () => {},
    ...extra,
  });
}

// ── Provider-mode fakes (mirrors runtime-transactions.test.ts) ───────────────

class FakeTx {
  readonly undo: Array<() => void> = [];
}
class FakeTransactionProvider implements TransactionProvider {
  readonly journal: string[] = [];
  async withTransaction<T>(fn: (tx: TransactionHandle) => Promise<T>): Promise<T> {
    const tx = new FakeTx();
    this.journal.push('begin');
    try {
      const result = await fn(tx);
      this.journal.push('commit');
      tx.undo.length = 0;
      return result;
    } catch (e) {
      for (let i = tx.undo.length - 1; i >= 0; i--) tx.undo[i]();
      this.journal.push('rollback');
      throw e;
    }
  }
}
function pushUndo(tx: TransactionHandle | undefined, undo: () => void): void {
  if (tx instanceof FakeTx) tx.undo.push(undo);
}
class TxStore implements Store {
  readonly map = new Map<string, EntityInstance>();
  async getAll(): Promise<EntityInstance[]> {
    return [...this.map.values()].map((v) => ({ ...v }));
  }
  async getById(id: string): Promise<EntityInstance | undefined> {
    const v = this.map.get(id);
    return v ? { ...v } : undefined;
  }
  async create(data: Partial<EntityInstance>, tx?: TransactionHandle): Promise<EntityInstance> {
    const id = String(data.id ?? `gen-${this.map.size + 1}`);
    const inst = { ...data, id } as EntityInstance;
    const prev = this.map.get(id);
    this.map.set(id, inst);
    pushUndo(tx, () => {
      if (prev) this.map.set(id, prev);
      else this.map.delete(id);
    });
    return { ...inst };
  }
  async update(
    id: string,
    data: Partial<EntityInstance>,
    tx?: TransactionHandle,
  ): Promise<EntityInstance | undefined> {
    const existing = this.map.get(id);
    if (!existing) return undefined;
    const prev = { ...existing };
    const next = { ...existing, ...data };
    this.map.set(id, next);
    pushUndo(tx, () => {
      this.map.set(id, prev);
    });
    return { ...next };
  }
  async delete(id: string, tx?: TransactionHandle): Promise<boolean> {
    const prev = this.map.get(id);
    const existed = this.map.delete(id);
    if (existed)
      pushUndo(tx, () => {
        this.map.set(id, prev!);
      });
    return existed;
  }
  async clear(): Promise<void> {
    this.map.clear();
  }
}
class TxOutbox implements OutboxStore {
  readonly entries: OutboxEntry[] = [];
  fail = false;
  async enqueue(newEntries: OutboxEntry[], tx?: unknown): Promise<void> {
    if (this.fail) throw new Error('outbox unavailable');
    const before = this.entries.length;
    this.entries.push(...newEntries.map((e) => ({ ...e })));
    pushUndo(tx as TransactionHandle, () => {
      this.entries.length = before;
    });
  }
  async claim(): Promise<OutboxEntry[]> {
    return [];
  }
  async markDelivered(): Promise<void> {}
  async markFailed(): Promise<void> {}
}
class MemoryIdempotency implements IdempotencyStore {
  readonly map = new Map<string, CommandResult>();
  async has(key: string): Promise<boolean> {
    return this.map.has(key);
  }
  async get(key: string): Promise<CommandResult | undefined> {
    return this.map.get(key);
  }
  async set(key: string, result: CommandResult): Promise<void> {
    this.map.set(key, result);
  }
}

function txStores(): Map<string, TxStore> {
  const stores = new Map<string, TxStore>();
  return stores;
}
function storeProviderFor(stores: Map<string, TxStore>): (name: string) => TxStore {
  return (name: string) => {
    let s = stores.get(name);
    if (!s) {
      s = new TxStore();
      stores.set(name, s);
    }
    return s;
  };
}

// ── IR fixtures ──────────────────────────────────────────────────────────────

const emitIR = `
  entity Account {
    property balance: number = 0
    event AccountCreated
    command create(balance: number) {
      mutate balance = balance
      emit AccountCreated
    }
  }
  store Account in memory
`;

const cascadeIR = `
  entity Order {
    property total: number = 0
    event OrderPlaced
    command create(total: number) {
      mutate total = total
      emit OrderPlaced
    }
  }
  entity Note {
    property message: string = ""
    event NoteAdded
    command create(message: string) {
      mutate message = message
      emit NoteAdded
    }
  }
  store Order in memory
  store Note in memory
  event OrderPlaced: "order.placed" { }
  event NoteAdded: "note.added" { }
  on OrderPlaced run Note.create
    resolve "note-1"
    params { message: "placed" }
`;

// ── OUTBOUND ─────────────────────────────────────────────────────────────────

describe('event bus — outbound (non-provider)', () => {
  it('publishes ONE message with the command events on completion', async () => {
    const ir = await compile(emitIR);
    const bus = new MemoryEventBus();
    const seen: EventBusMessage[] = [];
    await bus.subscribe((m) => seen.push(m));

    const rt = makeEngine(ir, { eventBus: bus });
    const result = await rt.runCommand('create', { balance: 10 }, { entityName: 'Account' });

    expect(result.success).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0].events.map((e) => e.name)).toEqual(['AccountCreated']);
    // originId is the engine's stable instance id (derived from generateId) —
    // a non-empty string, identical across every message from this engine.
    expect(typeof seen[0].originId).toBe('string');
    expect(seen[0].originId.length).toBeGreaterThan(0);
    expect(rt.hasEventBus()).toBe(true);
  });

  it('a command that emits nothing publishes no message', async () => {
    const ir = await compile(`
      entity Thing {
        property n: number = 0
        command bump() { mutate n = 1 }
      }
      store Thing in memory
    `);
    const bus = new MemoryEventBus();
    const seen: EventBusMessage[] = [];
    await bus.subscribe((m) => seen.push(m));

    const rt = makeEngine(ir, { eventBus: bus });
    await rt.runCommand('bump', {}, { entityName: 'Thing' });

    expect(seen).toEqual([]);
  });
});

describe('event bus — outbound (provider mode)', () => {
  it('publishes ONE message post-commit with the committed events', async () => {
    const ir = await compile(emitIR);
    const bus = new MemoryEventBus();
    const seen: EventBusMessage[] = [];
    await bus.subscribe((m) => seen.push(m));
    const provider = new FakeTransactionProvider();
    const stores = txStores();

    const rt = makeEngine(ir, {
      eventBus: bus,
      transactionProvider: provider,
      storeProvider: storeProviderFor(stores),
    });
    const result = await rt.runCommand('create', { balance: 10 }, { entityName: 'Account' });

    expect(result.success).toBe(true);
    expect(provider.journal).toEqual(['begin', 'commit']);
    expect(seen).toHaveLength(1);
    expect(seen[0].events.map((e) => e.name)).toEqual(['AccountCreated']);
  });

  it('a rolled-back attempt publishes NOTHING', async () => {
    const ir = await compile(emitIR);
    const bus = new MemoryEventBus();
    const seen: EventBusMessage[] = [];
    await bus.subscribe((m) => seen.push(m));
    const provider = new FakeTransactionProvider();
    const outbox = new TxOutbox();
    outbox.fail = true; // outbox enqueue throws → whole attempt rolls back
    const stores = txStores();

    const rt = makeEngine(ir, {
      eventBus: bus,
      transactionProvider: provider,
      outboxStore: outbox,
      storeProvider: storeProviderFor(stores),
    });
    const result = await rt.runCommand('create', { balance: 10 }, { entityName: 'Account' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/OUTBOX_ENQUEUE_FAILED/);
    expect(provider.journal).toEqual(['begin', 'rollback']);
    expect(seen).toEqual([]); // events that would have published were suppressed
  });
});

describe('event bus — reaction cascade', () => {
  it('non-provider: ONE message carries parent + reaction events', async () => {
    const ir = await compile(cascadeIR);
    const bus = new MemoryEventBus();
    const seen: EventBusMessage[] = [];
    await bus.subscribe((m) => seen.push(m));

    const rt = makeEngine(ir, { eventBus: bus });
    const result = await rt.runCommand('create', { total: 5 }, { entityName: 'Order' });

    expect(result.success).toBe(true);
    // Exactly one publish — no intermediate message for the parent alone.
    expect(seen).toHaveLength(1);
    expect(seen[0].events.map((e) => e.name)).toEqual(['OrderPlaced', 'NoteAdded']);
  });

  it('provider mode: ONE message post-commit carries parent + reaction events', async () => {
    const ir = await compile(cascadeIR);
    const bus = new MemoryEventBus();
    const seen: EventBusMessage[] = [];
    await bus.subscribe((m) => seen.push(m));
    const provider = new FakeTransactionProvider();
    const stores = txStores();

    const rt = makeEngine(ir, {
      eventBus: bus,
      transactionProvider: provider,
      storeProvider: storeProviderFor(stores),
    });
    const result = await rt.runCommand('create', { total: 5 }, { entityName: 'Order' });

    expect(result.success).toBe(true);
    expect(provider.journal).toEqual(['begin', 'commit']); // single tx for both
    expect(seen).toHaveLength(1);
    expect(seen[0].events.map((e) => e.name)).toEqual(['OrderPlaced', 'NoteAdded']);
  });
});

describe('event bus — idempotency', () => {
  it('a duplicate idempotency key does NOT publish a second time', async () => {
    const ir = await compile(emitIR);
    const bus = new MemoryEventBus();
    const seen: EventBusMessage[] = [];
    await bus.subscribe((m) => seen.push(m));
    const idem = new MemoryIdempotency();

    const rt = makeEngine(ir, { eventBus: bus, idempotencyStore: idem });
    const first = await rt.runCommand(
      'create',
      { balance: 10 },
      { entityName: 'Account', idempotencyKey: 'dup' },
    );
    const second = await rt.runCommand(
      'create',
      { balance: 10 },
      { entityName: 'Account', idempotencyKey: 'dup' },
    );

    expect(first.success).toBe(true);
    expect(second).toEqual(first); // replayed from cache, not re-executed
    expect(seen).toHaveLength(1); // only the first execution published
  });
});

describe('event bus — publish failure is fail-open', () => {
  it('logs a warning but the command still succeeds', async () => {
    const ir = await compile(emitIR);
    const failingBus: EventBus = {
      publish: async () => {
        throw new Error('bus down');
      },
      subscribe: async () => async () => {},
      close: async () => {},
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const rt = makeEngine(ir, { eventBus: failingBus });
    const result = await rt.runCommand('create', { balance: 10 }, { entityName: 'Account' });

    expect(result.success).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('EventBus.publish failed'),
      expect.anything(),
    );
    warn.mockRestore();
  });
});

// ── INBOUND ──────────────────────────────────────────────────────────────────

describe('event bus — inbound cross-instance delivery', () => {
  it("A's command reaches B's listener; A's own listener fires exactly once", async () => {
    const ir = await compile(emitIR);
    const bus = new MemoryEventBus();

    const a = makeEngine(ir, { eventBus: bus });
    const b = makeEngine(ir, { eventBus: bus });
    await a.connectEventBus();
    await b.connectEventBus();

    const aSeen: string[] = [];
    const bSeen: string[] = [];
    a.onEvent((e) => aSeen.push(e.name));
    b.onEvent((e) => bSeen.push(e.name));

    await a.runCommand('create', { balance: 1 }, { entityName: 'Account' });

    // A delivered locally once; its own bus echo is filtered by originId.
    expect(aSeen).toEqual(['AccountCreated']);
    // B received the remote event through the bus.
    expect(bSeen).toEqual(['AccountCreated']);
  });

  it('connectEventBus is idempotent — a second connect does not double-deliver', async () => {
    const ir = await compile(emitIR);
    const bus = new MemoryEventBus();
    const a = makeEngine(ir, { eventBus: bus });
    const b = makeEngine(ir, { eventBus: bus });

    const first = await b.connectEventBus();
    const second = await b.connectEventBus();
    expect(second).toBe(first); // same unsubscribe, no second subscription

    const bSeen: string[] = [];
    b.onEvent((e) => bSeen.push(e.name));

    await a.runCommand('create', { balance: 1 }, { entityName: 'Account' });
    expect(bSeen).toEqual(['AccountCreated']); // once, not twice

    // After disconnect, no further remote delivery.
    await first();
    await a.runCommand('create', { balance: 2 }, { entityName: 'Account' });
    expect(bSeen).toEqual(['AccountCreated']);
  });

  it('connectEventBus throws when no bus is configured', async () => {
    const ir = await compile(emitIR);
    const rt = makeEngine(ir);
    expect(rt.hasEventBus()).toBe(false);
    await expect(rt.connectEventBus()).rejects.toThrow(/not configured/);
  });
});

// ── INTEGRATION (acceptance) ─────────────────────────────────────────────────

describe('event bus — integration', () => {
  it('B.subscribe receives an event emitted by a command on A, with a provider active on A', async () => {
    const ir = await compile(emitIR);
    const bus = new MemoryEventBus();

    // A: provider mode + bus (publishes post-commit).
    const provider = new FakeTransactionProvider();
    const a = makeEngine(ir, {
      eventBus: bus,
      transactionProvider: provider,
      storeProvider: storeProviderFor(txStores()),
    });

    // B: bus + connected; a subscribe() listener for Account.
    const b = makeEngine(ir, { eventBus: bus });
    await b.connectEventBus();
    const received: EmittedEvent[] = [];
    b.subscribe('Account', (e) => received.push(e));

    const result = await a.runCommand('create', { balance: 42 }, { entityName: 'Account' });

    expect(result.success).toBe(true);
    expect(provider.journal).toEqual(['begin', 'commit']);
    expect(received.map((e) => e.name)).toEqual(['AccountCreated']);
    expect(received[0].subject?.entity).toBe('Account');
  });
});
