/**
 * Engine transaction-boundary tests (provider mode).
 *
 * When RuntimeOptions.transactionProvider is supplied, runCommand wraps each
 * command attempt — the command body, its outbox enqueue, and its idempotency
 * record — in ONE transaction. These tests prove, deterministically and without
 * a database, that:
 *
 *   (a) success: one begin+commit; mutation + outbox + idempotency all persist;
 *   (b) a mutation/flush store error rolls the attempt back;
 *   (c) an outbox enqueue failure rolls back and fails with OUTBOX_ENQUEUE_FAILED;
 *   (d) a duplicate idempotency key replays the cached result without a 2nd tx;
 *   (e) a reaction cascade joins the SAME transaction (one begin for both writes);
 *   (f) retry opens a fresh transaction per attempt (failed attempt rolls back);
 *   (g) without a provider, behavior is unchanged (outbox stays fail-open).
 *
 * The fakes below model a single-transaction-at-a-time engine (the engine never
 * nests withTransaction): writes apply to the backing store immediately (so a
 * command reads its own writes) and register an inverse on the transaction's
 * undo log; commit drops the undo log, rollback replays it in reverse.
 */

import { describe, it, expect } from 'vitest';
import {
  RuntimeEngine,
  type RuntimeContext,
  type RuntimeOptions,
  type Store,
  type EntityInstance,
  type CommandResult,
  type TransactionProvider,
  type TransactionHandle,
  type IdempotencyStore,
} from './runtime-engine';
import type { IR } from './ir';
import type { OutboxEntry, OutboxStore } from './outbox/outbox-store';
import { IRCompiler } from './ir-compiler';

// ── Fakes ────────────────────────────────────────────────────────────────

/** Transaction handle carrying the undo log for the attempt in flight. */
class FakeTx {
  readonly undo: Array<() => void> = [];
}

/** Records begin/commit/rollback and replays undos on rollback. */
class FakeTransactionProvider implements TransactionProvider {
  readonly journal: string[] = [];

  get begins(): number { return this.journal.filter(e => e === 'begin').length; }
  get commits(): number { return this.journal.filter(e => e === 'commit').length; }
  get rollbacks(): number { return this.journal.filter(e => e === 'rollback').length; }

  async withTransaction<T>(fn: (tx: TransactionHandle) => Promise<T>): Promise<T> {
    const tx = new FakeTx();
    this.journal.push('begin');
    try {
      const result = await fn(tx);
      this.journal.push('commit');
      tx.undo.length = 0; // committed — keep the applied writes
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

/** In-memory store that participates in FakeTx (apply-now, undo-on-rollback). */
class TxStore implements Store {
  readonly map = new Map<string, EntityInstance>();
  /** When true, update() throws to simulate a flush/store failure. */
  failUpdate = false;
  /** Optional read hook to override the version field per attempt (test f). */
  versionOverride?: (base: EntityInstance) => number;

  seed(inst: EntityInstance): void { this.map.set(inst.id, { ...inst }); }

  async getAll(): Promise<EntityInstance[]> {
    return [...this.map.values()].map(v => this.read(v));
  }
  async getById(id: string): Promise<EntityInstance | undefined> {
    const v = this.map.get(id);
    return v ? this.read(v) : undefined;
  }
  private read(v: EntityInstance): EntityInstance {
    const copy = { ...v };
    if (this.versionOverride && 'version' in copy) copy.version = this.versionOverride(v);
    return copy;
  }
  async create(data: Partial<EntityInstance>, tx?: TransactionHandle): Promise<EntityInstance> {
    const id = String(data.id ?? `gen-${this.map.size + 1}`);
    const inst = { ...data, id } as EntityInstance;
    const prev = this.map.get(id);
    this.map.set(id, inst);
    pushUndo(tx, () => { if (prev) this.map.set(id, prev); else this.map.delete(id); });
    return { ...inst };
  }
  async update(id: string, data: Partial<EntityInstance>, tx?: TransactionHandle): Promise<EntityInstance | undefined> {
    if (this.failUpdate) throw new Error('update failed (simulated flush error)');
    const existing = this.map.get(id);
    if (!existing) return undefined;
    const prev = { ...existing };
    const next = { ...existing, ...data };
    this.map.set(id, next);
    pushUndo(tx, () => { this.map.set(id, prev); });
    return { ...next };
  }
  async delete(id: string, tx?: TransactionHandle): Promise<boolean> {
    const prev = this.map.get(id);
    const existed = this.map.delete(id);
    if (existed) pushUndo(tx, () => { this.map.set(id, prev!); });
    return existed;
  }
  async clear(): Promise<void> { this.map.clear(); }
}

/** Outbox store that participates in FakeTx and can be forced to throw. */
class TxOutbox implements OutboxStore {
  readonly entries: OutboxEntry[] = [];
  fail = false;
  async enqueue(newEntries: OutboxEntry[], tx?: unknown): Promise<void> {
    if (this.fail) throw new Error('outbox unavailable');
    const before = this.entries.length;
    this.entries.push(...newEntries.map(e => ({ ...e })));
    pushUndo(tx as TransactionHandle, () => { this.entries.length = before; });
  }
  async claim(): Promise<OutboxEntry[]> { return []; }
  async markDelivered(): Promise<void> {}
  async markFailed(): Promise<void> {}
}

/** Idempotency store that participates in FakeTx. */
class TxIdempotency implements IdempotencyStore {
  readonly map = new Map<string, CommandResult>();
  async has(key: string): Promise<boolean> { return this.map.has(key); }
  async get(key: string): Promise<CommandResult | undefined> { return this.map.get(key); }
  async set(key: string, result: CommandResult, tx?: TransactionHandle): Promise<void> {
    const had = this.map.has(key);
    const prev = this.map.get(key);
    this.map.set(key, result);
    pushUndo(tx, () => { if (had) this.map.set(key, prev!); else this.map.delete(key); });
  }
}

// ── Harness ──────────────────────────────────────────────────────────────

async function compile(source: string): Promise<IR> {
  const result = await new IRCompiler().compileToIR(source);
  if (!result.ir) {
    throw new Error(`Compile failed: ${result.diagnostics.map(d => d.message).join(', ')}`);
  }
  return result.ir;
}

/** Build a runtime whose stores are per-entity TxStores (shared via the map). */
function makeRuntime(
  ir: IR,
  stores: Map<string, TxStore>,
  context: RuntimeContext = { tenantId: 't1' },
  extra: Partial<RuntimeOptions> = {},
): RuntimeEngine {
  let n = 0;
  const getStore = (name: string): TxStore => {
    let s = stores.get(name);
    if (!s) { s = new TxStore(); stores.set(name, s); }
    return s;
  };
  return new RuntimeEngine(ir, context, {
    storeProvider: (name) => getStore(name),
    generateId: () => `id-${++n}`,
    now: () => 1700_000_000_000,
    sleep: async () => {},
    ...extra,
  });
}

const createIR = `
  entity Account {
    property balance: number = 0
    event AccountCreated
    command create(balance: number) {
      mutate balance = balance
      emit AccountCreated
    }
  }
`;

// ── (a) success path ───────────────────────────────────────────────────────

describe('provider mode — success path', () => {
  it('commits mutation, outbox, and idempotency in one transaction', async () => {
    const ir = await compile(createIR);
    const stores = new Map<string, TxStore>();
    const provider = new FakeTransactionProvider();
    const outbox = new TxOutbox();
    const idem = new TxIdempotency();
    const seen: string[] = [];
    const rt = makeRuntime(ir, stores, { tenantId: 't1' }, {
      transactionProvider: provider,
      outboxStore: outbox,
      idempotencyStore: idem,
    });
    rt.onEvent(e => seen.push(e.name));

    const result = await rt.runCommand('create', { balance: 100 }, {
      entityName: 'Account',
      idempotencyKey: 'k1',
    });

    expect(result.success).toBe(true);
    // exactly one begin + commit, no rollback
    expect(provider.journal).toEqual(['begin', 'commit']);
    // mutation persisted
    const accounts = await stores.get('Account')!.getAll();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].balance).toBe(100);
    // outbox + idempotency persisted
    expect(outbox.entries.map(e => e.event.name)).toEqual(['AccountCreated']);
    expect(idem.map.has('k1')).toBe(true);
    // external listener notified after commit
    expect(seen).toEqual(['AccountCreated']);
  });
});

// ── (b) mutation/flush failure rolls back ──────────────────────────────────

describe('provider mode — mutation/flush failure', () => {
  it('rolls back and leaves no outbox/idempotency writes when the store throws', async () => {
    const ir = await compile(`
      entity Widget {
        property label: string = ""
        event WidgetRenamed
        command rename(label: string) {
          mutate label = label
          emit WidgetRenamed
        }
      }
    `);
    const stores = new Map<string, TxStore>();
    const widget = new TxStore();
    widget.seed({ id: 'w1', label: 'old' });
    stores.set('Widget', widget);
    widget.failUpdate = true;

    const provider = new FakeTransactionProvider();
    const outbox = new TxOutbox();
    const idem = new TxIdempotency();
    const seen: string[] = [];
    const rt = makeRuntime(ir, stores, { tenantId: 't1' }, {
      transactionProvider: provider,
      outboxStore: outbox,
      idempotencyStore: idem,
    });
    rt.onEvent(e => seen.push(e.name));

    await expect(
      rt.runCommand('rename', { label: 'new' }, { entityName: 'Widget', instanceId: 'w1', idempotencyKey: 'k1' }),
    ).rejects.toThrow(/update failed/);

    expect(provider.journal).toEqual(['begin', 'rollback']);
    expect((await widget.getById('w1'))!.label).toBe('old');
    expect(outbox.entries).toHaveLength(0);
    expect(idem.map.size).toBe(0);
    // no phantom notification from the rolled-back attempt
    expect(seen).toEqual([]);
  });
});

// ── (c) outbox enqueue failure rolls back ──────────────────────────────────

describe('provider mode — outbox enqueue failure', () => {
  it('rolls back the mutation and returns OUTBOX_ENQUEUE_FAILED', async () => {
    const ir = await compile(createIR);
    const stores = new Map<string, TxStore>();
    const provider = new FakeTransactionProvider();
    const outbox = new TxOutbox();
    outbox.fail = true;
    const idem = new TxIdempotency();
    const seen: string[] = [];
    const rt = makeRuntime(ir, stores, { tenantId: 't1' }, {
      transactionProvider: provider,
      outboxStore: outbox,
      idempotencyStore: idem,
    });
    rt.onEvent(e => seen.push(e.name));

    const result = await rt.runCommand('create', { balance: 50 }, {
      entityName: 'Account',
      idempotencyKey: 'k1',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/^OUTBOX_ENQUEUE_FAILED/);
    expect(provider.journal).toEqual(['begin', 'rollback']);
    // mutation rolled back — the eager auto-create is undone
    expect(await stores.get('Account')!.getAll()).toHaveLength(0);
    expect(outbox.entries).toHaveLength(0);
    expect(idem.map.size).toBe(0);
    expect(seen).toEqual([]);
  });
});

// ── (d) idempotency dedup does not open a second transaction ────────────────

describe('provider mode — idempotency dedup', () => {
  it('replays the cached result on a duplicate key without a second transaction', async () => {
    const ir = await compile(createIR);
    const stores = new Map<string, TxStore>();
    const provider = new FakeTransactionProvider();
    const idem = new TxIdempotency();
    const rt = makeRuntime(ir, stores, { tenantId: 't1' }, {
      transactionProvider: provider,
      idempotencyStore: idem,
    });

    const first = await rt.runCommand('create', { balance: 10 }, { entityName: 'Account', idempotencyKey: 'dup' });
    const second = await rt.runCommand('create', { balance: 10 }, { entityName: 'Account', idempotencyKey: 'dup' });

    expect(first.success).toBe(true);
    expect(second).toEqual(first);
    // exactly one execution → one Account, one begin+commit, no second tx
    expect(await stores.get('Account')!.getAll()).toHaveLength(1);
    expect(provider.journal).toEqual(['begin', 'commit']);
  });
});

// ── (e) reaction cascade joins the same transaction ─────────────────────────

describe('provider mode — reaction cascade', () => {
  it('runs parent and reaction writes inside a single transaction', async () => {
    const ir = await compile(`
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
        command create(message: string) {
          mutate message = message
        }
      }
      store Order in memory
      store Note in memory
      event OrderPlaced: "order.placed" { }
      on OrderPlaced run Note.create
        resolve "note-1"
        params {
          message: "placed"
        }
    `);
    const stores = new Map<string, TxStore>();
    const provider = new FakeTransactionProvider();
    const rt = makeRuntime(ir, stores, { tenantId: 't1' }, { transactionProvider: provider });

    const result = await rt.runCommand('create', { total: 5 }, { entityName: 'Order' });

    expect(result.success).toBe(true);
    // ONE transaction for parent + reaction (single begin, single commit)
    expect(provider.journal).toEqual(['begin', 'commit']);
    expect(await stores.get('Order')!.getAll()).toHaveLength(1);
    const notes = await stores.get('Note')!.getAll();
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toBe('placed');
  });
});

// ── (f) retry opens a fresh transaction per attempt ────────────────────────

describe('provider mode — retry', () => {
  it('rolls back the failed attempt and commits the retry (two begins, one rollback, one commit)', async () => {
    const ir = await compile(`
      entity Counter {
        property amount: number = 0
        versionProperty version: number
        event Bumped
        command bump(version: number, amount: number) {
          mutate version = version
          mutate amount = amount
          emit Bumped
          retry {
            maxAttempts: 3
            retryOn: CONCURRENCY_CONFLICT
          }
        }
      }
      event Bumped: "counter.bumped" { }
    `);
    const stores = new Map<string, TxStore>();
    const counter = new TxStore();
    counter.seed({ id: 'c1', amount: 0, version: 1 });
    stores.set('Counter', counter);

    // First attempt reads a stale (mismatched) version → concurrency conflict;
    // from the second attempt on it reads the real version and succeeds.
    const provider = new FakeTransactionProvider();
    counter.versionOverride = (base) => (provider.begins <= 1 ? 99 : (base.version as number));

    const rt = makeRuntime(ir, stores, { tenantId: 't1' }, { transactionProvider: provider });

    const result = await rt.runCommand('bump', { version: 1, amount: 7 }, {
      entityName: 'Counter',
      instanceId: 'c1',
    });

    expect(result.success).toBe(true);
    expect(provider.begins).toBe(2);
    expect(provider.rollbacks).toBe(1);
    expect(provider.commits).toBe(1);
    expect(provider.journal).toEqual(['begin', 'rollback', 'begin', 'commit']);
    expect((await counter.getById('c1'))!.amount).toBe(7);
  });
});

// ── (g) non-provider mode is unchanged ─────────────────────────────────────

describe('non-provider mode — unchanged (fail-open outbox, no transaction)', () => {
  it('does not roll back the mutation when outbox enqueue fails (fail-open)', async () => {
    const ir = await compile(createIR);
    const stores = new Map<string, TxStore>();
    const outbox = new TxOutbox();
    outbox.fail = true;
    const rt = makeRuntime(ir, stores, { tenantId: 't1' }, { outboxStore: outbox });

    const result = await rt.runCommand('create', { balance: 5 }, { entityName: 'Account' });

    // Command still succeeds; the mutation survives despite the outbox failure.
    expect(result.success).toBe(true);
    expect(await stores.get('Account')!.getAll()).toHaveLength(1);
    expect(outbox.entries).toHaveLength(0);
  });

  it('notifies listeners synchronously (no deferral) without a provider', async () => {
    const ir = await compile(createIR);
    const stores = new Map<string, TxStore>();
    const seen: string[] = [];
    const rt = makeRuntime(ir, stores);
    rt.onEvent(e => seen.push(e.name));

    await rt.runCommand('create', { balance: 1 }, { entityName: 'Account' });
    expect(seen).toEqual(['AccountCreated']);
  });
});
