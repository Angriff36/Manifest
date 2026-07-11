/**
 * Unit tests for the outbox delivery worker.
 *
 * Exercises drainOutboxOnce (single pass) and runOutboxWorker (loop) against
 * MemoryOutboxStore. Timers are injected so the loop tests are deterministic
 * — no real setTimeout ever fires.
 */

import { describe, it, expect, vi } from 'vitest';
import { drainOutboxOnce, runOutboxWorker } from './worker';
import type { OutboxWorkerHandle } from './worker';
import { MemoryOutboxStore } from './stores/memory';
import type { OutboxEntry } from './outbox-store';
import type { EmittedEvent } from '../runtime-engine';

function event(name: string): EmittedEvent {
  return { name, channel: name.toLowerCase(), payload: { ts: 0 }, timestamp: 0 };
}

function entry(id: string, enqueuedAt = 0): OutboxEntry {
  return { entryId: id, enqueuedAt, event: event(id), status: 'pending', attempts: 0 };
}

/** A setTimeout stand-in that records but never fires — freezes the poll back-off. */
const neverFire = () => 0;

describe('drainOutboxOnce', () => {
  it('delivers every pending entry and marks them delivered', async () => {
    const store = new MemoryOutboxStore();
    await store.enqueue([entry('a', 1), entry('b', 2), entry('c', 3)]);

    const deliver = vi.fn(async () => {});
    const result = await drainOutboxOnce(store, deliver);

    expect(result).toEqual({ claimed: 3, delivered: 3, failed: 0 });
    expect(deliver).toHaveBeenCalledTimes(3);
    expect(store.list().map((e) => e.status)).toEqual(['delivered', 'delivered', 'delivered']);
  });

  it('returns zeros and does not call deliver when nothing is pending', async () => {
    const store = new MemoryOutboxStore();
    const deliver = vi.fn(async () => {});

    const result = await drainOutboxOnce(store, deliver);

    expect(result).toEqual({ claimed: 0, delivered: 0, failed: 0 });
    expect(deliver).not.toHaveBeenCalled();
  });

  it('marks a failing entry failed with its error message and still delivers the rest', async () => {
    const store = new MemoryOutboxStore();
    await store.enqueue([entry('ok1', 1), entry('bad', 2), entry('ok2', 3)]);

    const deliver = vi.fn(async (e: OutboxEntry) => {
      if (e.entryId === 'bad') throw new Error('publish timeout');
    });
    const result = await drainOutboxOnce(store, deliver);

    expect(result).toEqual({ claimed: 3, delivered: 2, failed: 1 });
    const byId = Object.fromEntries(store.list().map((e) => [e.entryId, e]));
    expect(byId.ok1.status).toBe('delivered');
    expect(byId.ok2.status).toBe('delivered');
    expect(byId.bad.status).toBe('failed');
    expect(byId.bad.lastError).toBe('publish timeout');
  });

  it('honors batchSize — claims at most batchSize entries per pass', async () => {
    const store = new MemoryOutboxStore();
    await store.enqueue([
      entry('a', 1),
      entry('b', 2),
      entry('c', 3),
      entry('d', 4),
      entry('e', 5),
    ]);

    const deliver = vi.fn(async () => {});
    const first = await drainOutboxOnce(store, deliver, { batchSize: 2 });
    expect(first.claimed).toBe(2);

    const second = await drainOutboxOnce(store, deliver, { batchSize: 2 });
    expect(second.claimed).toBe(2);

    const third = await drainOutboxOnce(store, deliver, { batchSize: 2 });
    expect(third.claimed).toBe(1);

    expect(deliver).toHaveBeenCalledTimes(5);
    expect(store.list().every((e) => e.status === 'delivered')).toBe(true);
  });
});

describe('runOutboxWorker', () => {
  it('drains pending entries then stays parked until stopped', async () => {
    const store = new MemoryOutboxStore();
    await store.enqueue([entry('a', 1), entry('b', 2), entry('c', 3)]);

    const delivered: string[] = [];
    let handle: OutboxWorkerHandle;
    const allDelivered = new Promise<void>((resolve) => {
      handle = runOutboxWorker(
        store,
        async (e) => {
          delivered.push(e.entryId);
          if (delivered.length === 3) resolve();
        },
        { batchSize: 10, setTimeoutFn: neverFire },
      );
    });

    await allDelivered;
    await handle!.stop();

    expect([...delivered].sort()).toEqual(['a', 'b', 'c']);
    expect(store.list().every((e) => e.status === 'delivered')).toBe(true);
  });

  it('stops promptly when the provided AbortSignal fires', async () => {
    const store = new MemoryOutboxStore();
    const controller = new AbortController();

    const handle = runOutboxWorker(store, async () => {}, {
      signal: controller.signal,
      setTimeoutFn: neverFire,
    });
    controller.abort();

    await expect(handle.done).resolves.toBeUndefined();
  });

  it('reports store failures to onError and keeps running', async () => {
    let claimCalls = 0;
    const store = new MemoryOutboxStore();
    const originalClaim = store.claim.bind(store);
    // First claim throws (infra error), later claims behave normally.
    store.claim = async (batchSize: number) => {
      claimCalls++;
      if (claimCalls === 1) throw new Error('connection reset');
      return originalClaim(batchSize);
    };
    await store.enqueue([entry('a', 1)]);

    // Capture the back-off callback instead of firing it, so we control when
    // the loop retries.
    let releaseBackoff: (() => void) | undefined;
    const setTimeoutFn = (cb: () => void) => {
      releaseBackoff = cb;
      return 0;
    };

    const errors: unknown[] = [];
    const delivered: string[] = [];
    let handle: OutboxWorkerHandle;
    const done = new Promise<void>((resolve) => {
      handle = runOutboxWorker(
        store,
        async (e) => {
          delivered.push(e.entryId);
          resolve();
        },
        { setTimeoutFn, onError: (err) => errors.push(err) },
      );
    });

    // Iteration 1: claim throws -> onError -> loop parks in the back-off.
    while (!releaseBackoff) await Promise.resolve();
    releaseBackoff(); // wake it -> iteration 2 claims and delivers 'a'.

    await done;
    await handle!.stop();

    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('connection reset');
    expect(delivered).toEqual(['a']);
  });
});
