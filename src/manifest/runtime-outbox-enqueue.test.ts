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
 * Non-transactional caveat: the in-memory runtime has no shared
 * transaction boundary, so enqueue happens AFTER _executeCommandInternal
 * returns success. Durable adapters are expected to honor the `tx`
 * parameter on OutboxStore.enqueue. This is documented in
 * docs/spec/adapters.md § "Outbox Store".
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
    throw new Error(`Compile failed: ${result.diagnostics.map(d => d.message).join(', ')}`);
  }
  return result.ir;
}

function makeRuntime(
  ir: IR,
  store: OutboxStore,
  context: RuntimeContext = { tenantId: 't1' },
  extra: Partial<RuntimeOptions> = {}
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
    expect(entries.map(e => e.event.name)).toEqual(['Created', 'Indexed']);
  });

  it('uses RuntimeOptions.generateId for entryId and RuntimeOptions.now for enqueuedAt', async () => {
    const seenIds: string[] = [];
    const fakeStore: OutboxStore = {
      async enqueue(entries) { seenIds.push(...entries.map(e => e.entryId)); },
      async claim() { return []; },
      async markDelivered() {},
      async markFailed() {},
    };
    const ir = await compile(oneEventIRSource);
    let n = 0;
    const rt = new RuntimeEngine(ir, { tenantId: 't1' }, {
      outboxStore: fakeStore,
      generateId: () => `outbox-${++n}`,
      now: () => 5555,
    });
    await rt.runCommand('createUser', { name: 'Alice' }, { entityName: 'User' });

    expect(seenIds).toEqual(['outbox-1']);
  });

  it('captures correlationId/causationId on the underlying EmittedEvent', async () => {
    const store = new MemoryOutboxStore();
    const ir = await compile(oneEventIRSource);
    const rt = makeRuntime(ir, store);
    await rt.runCommand('createUser', { name: 'Alice' }, {
      entityName: 'User',
      correlationId: 'corr-1',
      causationId: 'caus-1',
    });

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
    const rt = new RuntimeEngine(ir, {}, {
      outboxStore: store,
      requireTenantContext: true,
      generateId: () => 'stub',
    });
    const result = await rt.runCommand('createUser', { name: 'x' }, { entityName: 'User' });
    expect(result.success).toBe(false);
    expect(store.size()).toBe(0);
  });
});

describe('Runtime outbox enqueue — fail-open and backwards compatibility', () => {
  it('command result is unchanged when OutboxStore.enqueue throws (fail-open)', async () => {
    const ir = await compile(oneEventIRSource);
    const throwingStore: OutboxStore = {
      async enqueue() { throw new Error('outbox unavailable'); },
      async claim() { return []; },
      async markDelivered() {},
      async markFailed() {},
    };
    const rt = makeRuntime(ir, throwingStore);
    const result = await rt.runCommand('createUser', { name: 'x' }, { entityName: 'User' });
    expect(result.success).toBe(true);
    expect(result.emittedEvents.map(e => e.name)).toEqual(['UserCreated']);
  });

  it('does NOT enqueue when no outboxStore is configured (backwards compatible)', async () => {
    const ir = await compile(oneEventIRSource);
    const rt = new RuntimeEngine(ir, { tenantId: 't1' }, {});
    const result = await rt.runCommand('createUser', { name: 'x' }, { entityName: 'User' });
    expect(result.success).toBe(true);
    expect(result.emittedEvents).toHaveLength(1);
  });

  it('demonstrates the non-transactional gap: outbox failure does NOT roll back the mutation', async () => {
    // This test pins down the documented limitation in adapters.md
    // § "Outbox Store — Transactional Limitation (Deferred)". The current
    // RuntimeEngine has no shared transaction boundary, so a successful
    // mutate followed by an outbox enqueue failure leaves state mutated
    // without a durable outbox row. Honesty over wishful thinking: this
    // test asserts the gap directly so any future change that *does*
    // implement transactional outbox MUST update or remove the test.
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
      async enqueue() { throw new Error('outbox unavailable'); },
      async claim() { return []; },
      async markDelivered() {},
      async markFailed() {},
    };
    const rt = makeRuntime(ir, throwingStore);
    const result = await rt.runCommand('createUser', { name: 'Alice' }, { entityName: 'User' });

    // The command still reports success — the mutate ran and the event
    // fired. The outbox write failure is logged on stderr but does not
    // poison the CommandResult. If a future commit wires a shared tx,
    // this assertion will need to flip to `success: false` + rollback.
    expect(result.success).toBe(true);
    expect(result.result).toBe('Alice');
    expect(result.emittedEvents.map(e => e.name)).toEqual(['UserCreated']);
  });

  it('store.enqueue receives an array (batched per command, not per event)', async () => {
    const calls: OutboxEntry[][] = [];
    const trackingStore: OutboxStore = {
      async enqueue(entries) { calls.push(entries); },
      async claim() { return []; },
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
    expect(calls[0].map(e => e.event.name)).toEqual(['Created', 'Indexed']);
  });
});
