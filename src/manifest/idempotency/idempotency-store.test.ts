/**
 * Idempotency store tests.
 *
 * Two layers:
 *   1. MemoryIdempotencyStore unit tests — the has/get/set contract and the
 *      first-write-wins policy shared with the durable Postgres adapter.
 *   2. RuntimeEngine integration (the acceptance requirement) — a mutating
 *      command replayed with the SAME idempotencyKey returns the cached
 *      CommandResult and mutates state exactly once; distinct keys execute
 *      independently; a configured store with no key fails the command.
 */

import { describe, it, expect } from 'vitest';
import { RuntimeEngine } from '../runtime-engine';
import type { CommandResult } from '../runtime-engine';
import type { IR } from '../ir';
import { IRCompiler } from '../ir-compiler';
import { MemoryIdempotencyStore } from './stores/memory';

async function compile(source: string): Promise<IR> {
  const compiler = new IRCompiler();
  const result = await compiler.compileToIR(source);
  if (!result.ir) {
    throw new Error(`Compile failed: ${result.diagnostics.map(d => d.message).join(', ')}`);
  }
  return result.ir;
}

const COUNTER_SOURCE = `
  entity Counter {
    property value: number = 0

    command increment(amount: number) {
      mutate value = self.value + amount
    }
  }
`;

function makeCounterRuntime(ir: IR, store: MemoryIdempotencyStore): RuntimeEngine {
  return new RuntimeEngine(ir, {}, { idempotencyStore: store, generateId: () => 'c1' });
}

describe('MemoryIdempotencyStore', () => {
  const sample: CommandResult = { success: true, result: 42, emittedEvents: [] };

  it('has() is false for an unknown key and true after set', async () => {
    const store = new MemoryIdempotencyStore();
    expect(await store.has('k1')).toBe(false);
    await store.set('k1', sample);
    expect(await store.has('k1')).toBe(true);
  });

  it('get() returns undefined for an unknown key and the stored result otherwise', async () => {
    const store = new MemoryIdempotencyStore();
    expect(await store.get('missing')).toBeUndefined();
    await store.set('k1', sample);
    expect(await store.get('k1')).toEqual(sample);
  });

  it('set() is first-write-wins — a second set on the same key is a no-op', async () => {
    const store = new MemoryIdempotencyStore();
    const first: CommandResult = { success: true, result: 'first', emittedEvents: [] };
    const second: CommandResult = { success: false, error: 'second', emittedEvents: [] };
    await store.set('k1', first);
    await store.set('k1', second);
    expect(await store.get('k1')).toEqual(first);
  });

  it('size() and clear() reflect cached keys', async () => {
    const store = new MemoryIdempotencyStore();
    await store.set('k1', sample);
    await store.set('k2', sample);
    expect(store.size()).toBe(2);
    store.clear();
    expect(store.size()).toBe(0);
    expect(await store.has('k1')).toBe(false);
  });
});

describe('RuntimeEngine idempotency integration', () => {
  it('replaying a command with the same key returns the cached result and mutates once', async () => {
    const ir = await compile(COUNTER_SOURCE);
    const store = new MemoryIdempotencyStore();
    const rt = makeCounterRuntime(ir, store);
    await rt.createInstance('Counter', { id: 'c1', value: 0 });

    const first = await rt.runCommand(
      'increment',
      { amount: 5 },
      { entityName: 'Counter', instanceId: 'c1', idempotencyKey: 'k1' },
    );
    expect(first.success).toBe(true);

    const second = await rt.runCommand(
      'increment',
      { amount: 5 },
      { entityName: 'Counter', instanceId: 'c1', idempotencyKey: 'k1' },
    );

    // The replay returns the exact cached CommandResult (reference identity),
    // proving the command body was NOT re-executed.
    expect(second).toBe(first);

    // The mutation ran exactly once: value is 5, not 10.
    const instance = await rt.getStore('Counter')!.getById('c1');
    expect(instance!.value).toBe(5);
    expect(store.size()).toBe(1);
  });

  it('distinct keys execute independently', async () => {
    const ir = await compile(COUNTER_SOURCE);
    const store = new MemoryIdempotencyStore();
    const rt = makeCounterRuntime(ir, store);
    await rt.createInstance('Counter', { id: 'c1', value: 0 });

    await rt.runCommand(
      'increment',
      { amount: 5 },
      { entityName: 'Counter', instanceId: 'c1', idempotencyKey: 'k1' },
    );
    await rt.runCommand(
      'increment',
      { amount: 3 },
      { entityName: 'Counter', instanceId: 'c1', idempotencyKey: 'k2' },
    );

    const instance = await rt.getStore('Counter')!.getById('c1');
    expect(instance!.value).toBe(8);
    expect(store.size()).toBe(2);
  });

  it('fails the command when a store is configured but no key is provided', async () => {
    const ir = await compile(COUNTER_SOURCE);
    const rt = makeCounterRuntime(ir, new MemoryIdempotencyStore());
    await rt.createInstance('Counter', { id: 'c1', value: 0 });

    const result = await rt.runCommand(
      'increment',
      { amount: 5 },
      { entityName: 'Counter', instanceId: 'c1' },
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('IdempotencyStore is configured but no idempotencyKey was provided');

    // The command body never ran — the counter is untouched.
    const instance = await rt.getStore('Counter')!.getById('c1');
    expect(instance!.value).toBe(0);
  });
});
