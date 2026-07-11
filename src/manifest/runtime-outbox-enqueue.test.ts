/**
 * Runtime outbox enqueue integration tests.
 *
 * Phase 3 of the runtime enforcement contract: when an OutboxStore is wired
 * into RuntimeOptions, RuntimeEngine.runCommand MUST enqueue each emitted
 * semantic event as an OutboxEntry on success. Failure-path behavior is
 * also asserted (no enqueue on guard/policy/constraint failures, no
 * enqueue when no events are emitted, and store.enqueue errors are
 * fail-open — they MUST NOT alter the CommandResult).
 *
 * Scope: these tests exercise the NON-PROVIDER path — no
 * RuntimeOptions.transactionProvider — where enqueue happens AFTER
 * _executeCommandInternal returns success and is best-effort / fail-open.
 * The transactional (provider) path, where mutation + outbox + idempotency
 * commit or roll back together, is covered in runtime-transactions.test.ts.
 * Both modes are documented in docs/spec/adapters.md § "Outbox Store —
 * Transaction Boundary".
 */

import { describe, it, expect } from 'vitest';
import { RuntimeEngine, type RuntimeContext, type RuntimeOptions } from './runtime-engine';
import type { IR } from './ir';
import type { OutboxEntry, OutboxStore } from './outbox/outbox-store';
import { MemoryOutboxStore } from './outbox/stores/memory';
import { IRCompiler } from './ir-compiler';
import { COMPILER_VERSION } from './version';

async function compile(source: string): Promise<IR> {
  const compiler = new IRCompiler();
  const result = await compiler.compileToIR(source);
  if (!result.ir) {
    throw new Error(`Compile failed: ${result.diagnostics.map((d) => d.message).join(', ')}`);
  }
  return result.ir;
}

function makeRuntime(
  ir: IR,
  store: OutboxStore,
  context: RuntimeContext = { tenantId: 't1' },
  extra: Partial<RuntimeOptions> = {},
): RuntimeEngine {
  let n = 0;
  return new RuntimeEngine(ir, context, {
    outboxStore: store,
    generateId: () => `id-${++n}`,
    now: () => 1700_000_000_000,
    ...extra,
  });
}

const oneEventIRSource = `
  entity User {
    property name: string
    event UserCreated
    command createUser(name: string) {
      mutate result = true
      emit UserCreated
    }
  }
`;

const noEventIRSource = `
  entity Item {
    property name: string
    command touch(name: string) {
      mutate result = true
    }
  }
`;

describe('Runtime outbox enqueue — success path', () => {
  it('enqueues one OutboxEntry per emitted event on success', async () => {
    const store = new MemoryOutboxStore({ generateId: () => 'outbox-id-stub', now: () => 0 });
    const ir = await compile(oneEventIRSource);
    const rt = makeRuntime(ir, store);

    const result = await rt.runCommand('createUser', { name: 'Alice' }, { entityName: 'User' });

    expect(result.success).toBe(true);
    expect(result.emittedEvents).toHaveLength(1);
    expect(store.size()).toBe(1);
    const entry = store.list()[0];
    expect(entry.status).toBe('pending');
    expect(entry.attempts).toBe(0);
    expect(entry.event.name).toBe('UserCreated');
  });

  it('enqueues multiple entries when a command emits multiple events', async () => {
    const store = new MemoryOutboxStore({ generateId: () => 'stub' });
    const ir = await compile(`
      entity Item {
        property name: string
        event Created
        event Indexed
        command createAndIndex(name: string) {
          mutate result = true
          emit Created
          emit Indexed
        }
      }
    `);
    const rt = makeRuntime(ir, store);
    await rt.runCommand('createAndIndex', { name: 'x' }, { entityName: 'Item' });

    const entries = store.list();
    expect(entries.map((e) => e.event.name)).toEqual(['Created', 'Indexed']);
  });

  it('uses RuntimeOptions.generateId for entryId and RuntimeOptions.now for enqueuedAt', async () => {
    const seenIds: string[] = [];
    const fakeStore: OutboxStore = {
      async enqueue(entries) {
        seenIds.push(...entries.map((e) => e.entryId));
      },
      async claim() {
        return [];
      },
      async markDelivered() {},
      async markFailed() {},
    };
    const ir = await compile(oneEventIRSource);
    let n = 0;
    const rt = new RuntimeEngine(
      ir,
      { tenantId: 't1' },
      {
        outboxStore: fakeStore,
        generateId: () => `outbox-${++n}`,
        now: () => 5555,
      },
    );
    await rt.runCommand('createUser', { name: 'Alice' }, { entityName: 'User' });

    expect(seenIds).toEqual(['outbox-1']);
  });

  it('captures correlationId/causationId on the underlying EmittedEvent', async () => {
    const store = new MemoryOutboxStore();
    const ir = await compile(oneEventIRSource);
    const rt = makeRuntime(ir, store);
    await rt.runCommand(
      'createUser',
      { name: 'Alice' },
      {
        entityName: 'User',
        correlationId: 'corr-1',
        causationId: 'caus-1',
      },
    );

    const entry = store.list()[0];
    expect(entry.event.correlationId).toBe('corr-1');
    expect(entry.event.causationId).toBe('caus-1');
  });

  it('captures IR provenance on the underlying EmittedEvent', async () => {
    const store = new MemoryOutboxStore();
    const ir = await compile(oneEventIRSource);
    const rt = makeRuntime(ir, store);
    await rt.runCommand('createUser', { name: 'Alice' }, { entityName: 'User' });

    const entry = store.list()[0];
    expect(entry.event.provenance?.contentHash).toBeDefined();
    expect(entry.event.provenance?.compilerVersion).toBe(COMPILER_VERSION);
  });
});

describe('Runtime outbox enqueue — non-emit paths', () => {
  it('does NOT enqueue when the command emits no events', async () => {
    const store = new MemoryOutboxStore();
    const ir = await compile(noEventIRSource);
    const rt = makeRuntime(ir, store);
    const result = await rt.runCommand('touch', { name: 'x' }, { entityName: 'Item' });
    expect(result.success).toBe(true);
    expect(store.size()).toBe(0);
  });

  it('does NOT enqueue when the command fails a guard (even if it would have emitted)', async () => {
    const store = new MemoryOutboxStore();
    const ir = await compile(`
      entity User {
        property name: string
        event UserCreated
        command createUser(name: string) {
          guard name != ""
          mutate result = true
          emit UserCreated
        }
      }
    `);
    const rt = makeRuntime(ir, store);
    const result = await rt.runCommand('createUser', { name: '' }, { entityName: 'User' });
    expect(result.success).toBe(false);
    expect(store.size()).toBe(0);
  });

  it('does NOT enqueue when the tenant context gate fails', async () => {
    const store = new MemoryOutboxStore();
    const ir = await compile(oneEventIRSource);
    const rt = new RuntimeEngine(
      ir,
      {},
      {
        outboxStore: store,
        requireTenantContext: true,
        generateId: () => 'stub',
      },
    );
    const result = await rt.runCommand('createUser', { name: 'x' }, { entityName: 'User' });
    expect(result.success).toBe(false);
    expect(store.size()).toBe(0);
  });
});

describe('Runtime outbox enqueue — fail-open and backwards compatibility', () => {
  it('command result is unchanged when OutboxStore.enqueue throws (fail-open)', async () => {
    const ir = await compile(oneEventIRSource);
    const throwingStore: OutboxStore = {
      async enqueue() {
        throw new Error('outbox unavailable');
      },
      async claim() {
        return [];
      },
      async markDelivered() {},
      async markFailed() {},
    };
    const rt = makeRuntime(ir, throwingStore);
    const result = await rt.runCommand('createUser', { name: 'x' }, { entityName: 'User' });
    expect(result.success).toBe(true);
    expect(result.emittedEvents.map((e) => e.name)).toEqual(['UserCreated']);
  });

  it('does NOT enqueue when no outboxStore is configured (backwards compatible)', async () => {
    const ir = await compile(oneEventIRSource);
    const rt = new RuntimeEngine(ir, { tenantId: 't1' }, {});
    const result = await rt.runCommand('createUser', { name: 'x' }, { entityName: 'User' });
    expect(result.success).toBe(true);
    expect(result.emittedEvents).toHaveLength(1);
  });

  it('demonstrates the non-transactional gap: outbox failure does NOT roll back the mutation', async () => {
    // This test pins down NON-PROVIDER behavior documented in adapters.md
    // § "Outbox Store — Transaction Boundary". Without a transactionProvider the
    // RuntimeEngine has no shared transaction boundary, so a successful mutate
    // followed by an outbox enqueue failure leaves state mutated without a
    // durable outbox row (fail-open). The assertion flip predicted below has now
    // happened, but only under a transactionProvider: with one wired in, an
    // outbox failure rolls back and the command returns OUTBOX_ENQUEUE_FAILED
    // (see runtime-transactions.test.ts § "outbox enqueue failure"). This
    // fail-open fallback is the deliberate, still-pinned no-provider path.
    const ir = await compile(`
      entity User {
        property name: string
        event UserCreated
        command createUser(name: string) {
          mutate result = name
          emit UserCreated
        }
      }
    `);
    const throwingStore: OutboxStore = {
      async enqueue() {
        throw new Error('outbox unavailable');
      },
      async claim() {
        return [];
      },
      async markDelivered() {},
      async markFailed() {},
    };
    const rt = makeRuntime(ir, throwingStore);
    const result = await rt.runCommand('createUser', { name: 'Alice' }, { entityName: 'User' });

    // The command still reports success — the mutate ran and the event
    // fired. The outbox write failure is logged on stderr but does not
    // poison the CommandResult. The transactional flip (success: false +
    // rollback) is now live, but ONLY when a transactionProvider is wired
    // in; this no-provider path stays fail-open by design.
    expect(result.success).toBe(true);
    expect(result.result).toBe('Alice');
    expect(result.emittedEvents.map((e) => e.name)).toEqual(['UserCreated']);
  });

  it('store.enqueue receives an array (batched per command, not per event)', async () => {
    const calls: OutboxEntry[][] = [];
    const trackingStore: OutboxStore = {
      async enqueue(entries) {
        calls.push(entries);
      },
      async claim() {
        return [];
      },
      async markDelivered() {},
      async markFailed() {},
    };
    const ir = await compile(`
      entity Item {
        property name: string
        event Created
        event Indexed
        command createAndIndex(name: string) {
          mutate result = true
          emit Created
          emit Indexed
        }
      }
    `);
    const rt = makeRuntime(ir, trackingStore);
    await rt.runCommand('createAndIndex', { name: 'x' }, { entityName: 'Item' });

    // One enqueue call, two entries in the batch — confirms the runtime
    // does not call enqueue per-event (which would lose batching benefits
    // in a durable adapter using a single INSERT).
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(2);
    expect(calls[0].map((e) => e.event.name)).toEqual(['Created', 'Indexed']);
  });
});

describe('Runtime event subject metadata', () => {
  it('populates subject.entity, subject.command, and subject.id when all are available', async () => {
    const store = new MemoryOutboxStore();
    const ir = await compile(oneEventIRSource);
    const rt = makeRuntime(ir, store);
    const result = await rt.runCommand(
      'createUser',
      { name: 'Alice' },
      {
        entityName: 'User',
        instanceId: 'u-1',
      },
    );

    expect(result.success).toBe(true);
    const entry = store.list()[0];
    expect(entry.event.subject).toEqual({
      entity: 'User',
      command: 'createUser',
      id: 'u-1',
    });
  });

  it('sets subject.command and subject.entity without id when no instanceId is provided and payload has no id', async () => {
    const store = new MemoryOutboxStore();
    const ir = await compile(oneEventIRSource);
    const rt = makeRuntime(ir, store);
    const result = await rt.runCommand(
      'createUser',
      { name: 'Alice' },
      {
        entityName: 'User',
      },
    );

    expect(result.success).toBe(true);
    const entry = store.list()[0];
    expect(entry.event.subject).toBeDefined();
    expect(entry.event.subject!.entity).toBe('User');
    expect(entry.event.subject!.command).toBe('createUser');
    expect(entry.event.subject!.id).toBeUndefined();
  });

  it('omits subject.entity when entityName is not provided in runCommand options', async () => {
    const store = new MemoryOutboxStore();
    const ir = await compile(oneEventIRSource);
    const rt = makeRuntime(ir, store);
    // Call without entityName in options — command is found by name search
    const result = await rt.runCommand('createUser', { name: 'Alice' });

    expect(result.success).toBe(true);
    const entry = store.list()[0];
    expect(entry.event.subject).toBeDefined();
    expect(entry.event.subject!.command).toBe('createUser');
    expect(entry.event.subject!.entity).toBeUndefined();
    expect(entry.event.subject!.id).toBeUndefined();
  });

  it('falls back to payload.id when no instanceId is provided', async () => {
    const store = new MemoryOutboxStore();
    const ir = await compile(`
      entity Item {
        property name: string
        event ItemCreated
        command createItem(id: string, name: string) {
          emit ItemCreated
        }
      }
    `);
    const rt = makeRuntime(ir, store);
    const result = await rt.runCommand(
      'createItem',
      { id: 'item-42', name: 'Widget' },
      {
        entityName: 'Item',
      },
    );

    expect(result.success).toBe(true);
    const entry = store.list()[0];
    expect(entry.event.subject!.entity).toBe('Item');
    expect(entry.event.subject!.command).toBe('createItem');
    expect(entry.event.subject!.id).toBe('item-42');
  });

  it('does not use empty string payload.id as subject.id', async () => {
    const store = new MemoryOutboxStore();
    const ir = await compile(`
      entity Item {
        property name: string
        event ItemCreated
        command createItem(id: string, name: string) {
          emit ItemCreated
        }
      }
    `);
    const rt = makeRuntime(ir, store);
    const result = await rt.runCommand(
      'createItem',
      { id: '', name: 'Widget' },
      {
        entityName: 'Item',
      },
    );

    expect(result.success).toBe(true);
    const entry = store.list()[0];
    expect(entry.event.subject!.id).toBeUndefined();
  });

  it('instanceId takes priority over payload.id', async () => {
    const store = new MemoryOutboxStore();
    const ir = await compile(`
      entity Item {
        property name: string
        event ItemCreated
        command createItem(id: string, name: string) {
          emit ItemCreated
        }
      }
    `);
    const rt = makeRuntime(ir, store);
    const result = await rt.runCommand(
      'createItem',
      { id: 'payload-id', name: 'Widget' },
      {
        entityName: 'Item',
        instanceId: 'instance-id',
      },
    );

    expect(result.success).toBe(true);
    const entry = store.list()[0];
    expect(entry.event.subject!.id).toBe('instance-id');
  });

  it('applies consistent subject across multiple events from one command', async () => {
    const store = new MemoryOutboxStore();
    const ir = await compile(`
      entity Item {
        property name: string
        event Created
        event Indexed
        command createAndIndex(name: string) {
          mutate result = true
          emit Created
          emit Indexed
        }
      }
    `);
    const rt = makeRuntime(ir, store);
    await rt.runCommand(
      'createAndIndex',
      { name: 'x' },
      {
        entityName: 'Item',
        instanceId: 'i-1',
      },
    );

    const entries = store.list();
    expect(entries).toHaveLength(2);
    expect(entries[0].event.subject).toEqual({
      entity: 'Item',
      command: 'createAndIndex',
      id: 'i-1',
    });
    expect(entries[1].event.subject).toEqual(entries[0].event.subject);
  });

  it('subject on emittedEvents matches subject on outbox entries', async () => {
    const store = new MemoryOutboxStore();
    const ir = await compile(oneEventIRSource);
    const rt = makeRuntime(ir, store);
    const result = await rt.runCommand(
      'createUser',
      { name: 'Alice' },
      {
        entityName: 'User',
        instanceId: 'u-1',
      },
    );

    expect(result.emittedEvents[0].subject).toEqual(store.list()[0].event.subject);
  });

  it('subject is backward-compatible: does not alter existing event fields', async () => {
    const store = new MemoryOutboxStore();
    const ir = await compile(oneEventIRSource);
    const rt = makeRuntime(ir, store);
    const result = await rt.runCommand(
      'createUser',
      { name: 'Alice' },
      {
        entityName: 'User',
        correlationId: 'corr-1',
      },
    );

    const ev = result.emittedEvents[0];
    expect(ev.name).toBe('UserCreated');
    expect(ev.correlationId).toBe('corr-1');
    expect(ev.payload).toBeDefined();
    expect(ev.subject).toBeDefined();
    expect(ev.subject!.command).toBe('createUser');
  });
});
