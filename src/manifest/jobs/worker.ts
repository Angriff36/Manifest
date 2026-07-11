/**
 * Async-command job worker — the shipped drain loop.
 *
 * Async commands enqueue a JobRecord and return immediately; the actions run
 * later when something drains the queue. In tests that "something" is a direct
 * `drainJobs()` call, but in production a long-lived worker must poll. This
 * module IS that worker, so consumers no longer hand-write the drain loop.
 *
 *   import { runJobWorker } from '@angriff36/manifest/jobs/worker';
 *
 *   const worker = runJobWorker(runtime);
 *   // later, on shutdown:
 *   await worker.stop();
 *
 * Each tick calls `runtime.drainJobs()`, which claims the pending jobs,
 * re-enters each command with `context.source === 'job'` (running its actions
 * and emitting completion/failure events), and records the terminal status via
 * the configured JobQueue. Delivery is at-least-once with respect to job
 * status: a durable queue that flips pending→running before execution (see
 * PostgresJobQueue) will not re-run a job that reached a terminal status, but
 * a worker crash mid-execution can leave a job 'running' for out-of-band
 * recovery. Command bodies should tolerate re-execution.
 *
 * Time is injectable (`setTimeoutFn`/`clearTimeoutFn`) so tests run without
 * real timers; nothing in this module reads the wall clock directly.
 */

import type { CommandResult } from '../runtime-engine';

/** Default back-off between polls that drain no jobs (ms). */
const DEFAULT_POLL_INTERVAL_MS = 1000;

/** The slice of RuntimeEngine this worker needs. RuntimeEngine satisfies it. */
export interface JobDrainable {
  drainJobs(): Promise<CommandResult[]>;
}

export interface JobWorkerOptions {
  /** Back-off between polls that drain no jobs (ms). Default: 1000. */
  pollIntervalMs?: number;
  /** Abort signal that stops the loop (in addition to the returned `stop()`). */
  signal?: AbortSignal;
  /**
   * Called when `drainJobs()` itself throws (i.e. queue/store infrastructure
   * failure). The loop backs off and continues; it does not crash. Individual
   * command failures are NOT surfaced here — they are recorded as failed jobs
   * by the runtime. Defaults to a no-op.
   */
  onError?: (err: unknown) => void;
  /** Timer injection for deterministic tests. Defaults to global setTimeout. */
  setTimeoutFn?: (callback: () => void, ms: number) => unknown;
  /** Paired with `setTimeoutFn`. Defaults to global clearTimeout. */
  clearTimeoutFn?: (handle: unknown) => void;
}

/** Handle for a running {@link runJobWorker} loop. */
export interface JobWorkerHandle {
  /** Stop the loop and resolve once the in-flight iteration settles. */
  stop(): Promise<void>;
  /** Resolves when the loop exits (via `stop()` or an aborted signal). */
  readonly done: Promise<void>;
}

/**
 * Drain the pending jobs once and return the executed command results. Usable
 * directly from a cron route or serverless handler that wants a single pass
 * rather than a long-lived loop.
 */
export function drainJobsOnce(runtime: JobDrainable): Promise<CommandResult[]> {
  return runtime.drainJobs();
}

/**
 * Sleep for `ms`, resolving early if any signal aborts. Uses the injected
 * timer so tests can control (or freeze) the clock.
 */
function delay(
  ms: number,
  signals: AbortSignal[],
  setTimeoutFn: (callback: () => void, ms: number) => unknown,
  clearTimeoutFn: (handle: unknown) => void,
): Promise<void> {
  if (signals.some((s) => s.aborted)) return Promise.resolve();
  return new Promise<void>((resolve) => {
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
 * Run a continuous job-drain loop until stopped. Returns immediately with a
 * handle; the loop runs in the background.
 *
 * Cadence: after a tick that executed at least one job, the loop drains again
 * immediately (works through a backlog). After a tick that found nothing, it
 * backs off `pollIntervalMs`. The back-off is interruptible, so `stop()` / an
 * aborted signal wakes the loop promptly.
 *
 * Multiple workers over the same durable queue are safe when the queue's
 * `drainPending` uses row-level locking (e.g. PostgresJobQueue's SELECT … FOR
 * UPDATE SKIP LOCKED) — each worker drains a disjoint set of jobs.
 */
export function runJobWorker(runtime: JobDrainable, opts: JobWorkerOptions = {}): JobWorkerHandle {
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const setTimeoutFn = opts.setTimeoutFn ?? ((cb, ms) => setTimeout(cb, ms));
  const clearTimeoutFn =
    opts.clearTimeoutFn ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));

  const controller = new AbortController();
  const signals: AbortSignal[] = [controller.signal];
  if (opts.signal) signals.push(opts.signal);
  const stopped = () => signals.some((s) => s.aborted);

  const loop = (async () => {
    while (!stopped()) {
      let results: CommandResult[];
      try {
        results = await runtime.drainJobs();
      } catch (err) {
        opts.onError?.(err);
        await delay(pollIntervalMs, signals, setTimeoutFn, clearTimeoutFn);
        continue;
      }
      if (results.length === 0) {
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
