/**
 * Outbox delivery worker — the shipped poll/claim/deliver/mark loop.
 *
 * The runtime enqueues semantic events into an {@link OutboxStore} inside the
 * command's mutation boundary, but nothing delivers them until a worker runs.
 * This module IS that worker: consumers no longer hand-write the ~30-line
 * poll loop the docs used to prescribe.
 *
 *   import { runOutboxWorker } from '@angriff36/manifest/outbox/worker';
 *   import { PostgresOutboxStore } from '@angriff36/manifest/outbox/postgres';
 *
 *   const worker = runOutboxWorker(store, async (entry) => {
 *     await bus.publish(entry.event.channel, entry.event);
 *   });
 *   // later, on shutdown:
 *   await worker.stop();
 *
 * Delivery semantics: **at-least-once**. An entry is marked delivered only
 * after `deliver` resolves; if `deliver` rejects, the entry is marked failed
 * with the error message and is NOT retried by this worker (the caller/store
 * decides retry policy). A worker that crashes after `deliver` succeeds but
 * before `markDelivered` commits will re-claim and re-deliver the entry.
 * Consumers MUST therefore be idempotent.
 *
 * Time is injectable (`setTimeoutFn`/`clearTimeoutFn`) so tests run without
 * real timers; nothing in this module reads the wall clock directly.
 */

import type { OutboxEntry, OutboxStore } from './outbox-store';

/** Default number of entries claimed per batch. */
const DEFAULT_BATCH_SIZE = 100;
/** Default back-off between polls that find nothing to deliver (ms). */
const DEFAULT_POLL_INTERVAL_MS = 1000;

/** Deliver a single claimed entry. Reject to have the entry marked failed. */
export type OutboxDeliver = (entry: OutboxEntry) => Promise<void>;

export interface DrainOutboxOptions {
  /** Max entries to claim in one batch. Default: 100. */
  batchSize?: number;
}

export interface OutboxWorkerOptions extends DrainOutboxOptions {
  /** Back-off between polls that find no pending entries (ms). Default: 1000. */
  pollIntervalMs?: number;
  /** Abort signal that stops the loop (in addition to the returned `stop()`). */
  signal?: AbortSignal;
  /**
   * Called when a claim/mark operation (i.e. store infrastructure, not a
   * single delivery) throws. The loop backs off and continues; it does not
   * crash. Per-entry `deliver` failures are NOT surfaced here — they are
   * recorded via `markFailed`. Defaults to a no-op.
   */
  onError?: (err: unknown) => void;
  /** Timer injection for deterministic tests. Defaults to global setTimeout. */
  setTimeoutFn?: (callback: () => void, ms: number) => unknown;
  /** Paired with `setTimeoutFn`. Defaults to global clearTimeout. */
  clearTimeoutFn?: (handle: unknown) => void;
}

/** Outcome of a single {@link drainOutboxOnce} batch. */
export interface DrainOutboxResult {
  /** Entries claimed this batch. Zero means the store had nothing pending. */
  claimed: number;
  /** Entries whose `deliver` resolved (marked delivered). */
  delivered: number;
  /** Entries whose `deliver` rejected (marked failed). */
  failed: number;
}

/** Handle for a running {@link runOutboxWorker} loop. */
export interface OutboxWorkerHandle {
  /** Stop the loop and resolve once the in-flight iteration settles. */
  stop(): Promise<void>;
  /** Resolves when the loop exits (via `stop()` or an aborted signal). */
  readonly done: Promise<void>;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Claim one batch, deliver each entry, and mark the outcomes. Usable directly
 * from a cron route or serverless handler that wants a single pass rather than
 * a long-lived loop.
 *
 * Each entry is delivered under its own try/catch so one bad entry never
 * blocks the rest of the batch: successes are marked delivered in a single
 * `markDelivered` call, failures are marked individually with their own error
 * message.
 */
export async function drainOutboxOnce(
  store: OutboxStore,
  deliver: OutboxDeliver,
  opts: DrainOutboxOptions = {}
): Promise<DrainOutboxResult> {
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const claimed = await store.claim(batchSize);
  if (claimed.length === 0) {
    return { claimed: 0, delivered: 0, failed: 0 };
  }

  const deliveredIds: string[] = [];
  let failed = 0;
  for (const entry of claimed) {
    try {
      await deliver(entry);
      deliveredIds.push(entry.entryId);
    } catch (err) {
      await store.markFailed([entry.entryId], errorMessage(err));
      failed++;
    }
  }
  if (deliveredIds.length > 0) {
    await store.markDelivered(deliveredIds);
  }
  return { claimed: claimed.length, delivered: deliveredIds.length, failed };
}

/**
 * Sleep for `ms`, resolving early if any signal aborts. Uses the injected
 * timer so tests can control (or freeze) the clock.
 */
function delay(
  ms: number,
  signals: AbortSignal[],
  setTimeoutFn: (callback: () => void, ms: number) => unknown,
  clearTimeoutFn: (handle: unknown) => void
): Promise<void> {
  if (signals.some(s => s.aborted)) return Promise.resolve();
  return new Promise<void>(resolve => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeoutFn(handle);
      for (const s of signals) s.removeEventListener('abort', onAbort);
      resolve();
    };
    // The timer callback does not reference `handle`, so a test clock that
    // fires synchronously (before `handle` is assigned) is safe.
    const handle = setTimeoutFn(() => {
      if (settled) return;
      settled = true;
      for (const s of signals) s.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    if (!settled) {
      for (const s of signals) s.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/**
 * Run a continuous outbox delivery loop until stopped. Returns immediately
 * with a handle; the loop runs in the background.
 *
 * Cadence: after a batch that claims work, the loop polls again immediately
 * (drains a backlog as fast as the store allows). After a batch that finds
 * nothing, it backs off `pollIntervalMs`. The back-off is interruptible, so
 * `stop()` / an aborted signal wakes the loop promptly.
 *
 * Multiple workers over the same store are safe when the store implements
 * `claim` with row-level locking (e.g. PostgresOutboxStore's SELECT … FOR
 * UPDATE SKIP LOCKED) — each worker receives a disjoint batch.
 */
export function runOutboxWorker(
  store: OutboxStore,
  deliver: OutboxDeliver,
  opts: OutboxWorkerOptions = {}
): OutboxWorkerHandle {
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const setTimeoutFn = opts.setTimeoutFn ?? ((cb, ms) => setTimeout(cb, ms));
  const clearTimeoutFn =
    opts.clearTimeoutFn ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));

  const controller = new AbortController();
  const signals: AbortSignal[] = [controller.signal];
  if (opts.signal) signals.push(opts.signal);
  const stopped = () => signals.some(s => s.aborted);

  const loop = (async () => {
    while (!stopped()) {
      let result: DrainOutboxResult;
      try {
        result = await drainOutboxOnce(store, deliver, { batchSize: opts.batchSize });
      } catch (err) {
        opts.onError?.(err);
        await delay(pollIntervalMs, signals, setTimeoutFn, clearTimeoutFn);
        continue;
      }
      if (result.claimed === 0) {
        await delay(pollIntervalMs, signals, setTimeoutFn, clearTimeoutFn);
      }
    }
  })();

  return {
    done: loop,
    async stop() {
      controller.abort();
      await loop;
    },
  };
}
