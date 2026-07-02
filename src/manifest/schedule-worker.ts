/**
 * Schedule worker: drives a program's IR schedules on a tick loop, firing the
 * ones that are due and sweeping expired approvals. This is the self-contained
 * runner for hosts that do NOT get cron for free (Vercel invokes the generated
 * cron routes directly; everyone else runs this).
 *
 * Deterministic and testable: the clock and the timer are injectable, so tests
 * never sleep. Cron matching is UTC and pure (see runtime-schedule.isCronDue);
 * a same-minute dedupe means each cron schedule fires at most once per matching
 * minute even though the loop ticks several times a minute.
 *
 * Spec: docs/spec/semantics.md § "Scheduled Commands".
 */

import type { CommandResult, ApprovalRequestState } from './runtime-engine';
import type { IRSchedule, IREntity } from './ir';
import { isCronDue, isIntervalDue } from './runtime-schedule';

/**
 * The minimal runtime surface the worker depends on. `RuntimeEngine` satisfies
 * it structurally, so production passes a real engine and tests pass a
 * lightweight fake without constructing one.
 */
export interface ScheduleRuntime {
  getSchedules(): IRSchedule[];
  getEntities(): IREntity[];
  runSchedule(scheduleName: string): Promise<CommandResult>;
  expireApprovals(now?: number): ApprovalRequestState[];
}

/** Opaque timer handle — whatever the injected timer factory returns. */
export type TimerHandle = unknown;

/** Passed to `onError` so a caller can log which phase failed. */
export interface ScheduleWorkerErrorContext {
  phase: 'runSchedule' | 'expireApprovals';
  /** Present for the `runSchedule` phase. */
  scheduleName?: string;
}

export interface ScheduleWorkerOptions {
  /**
   * Tick interval in ms. Default 30_000 (30s). Must stay below 60_000 so every
   * matching minute is sampled; the same-minute dedupe keeps firing to once per
   * minute regardless.
   */
  intervalMs?: number;
  /** Clock. Default `Date.now`. Read once per tick. */
  now?: () => number;
  /** Timer factory. Default `setInterval`. Injectable so tests drive ticks by hand. */
  setTimer?: (callback: () => void, ms: number) => TimerHandle;
  /** Timer disposer. Default `clearInterval`. */
  clearTimer?: (handle: TimerHandle) => void;
  /** When aborted, the worker stops (equivalent to calling `stop()`). */
  signal?: AbortSignal;
  /** Called for any error thrown while evaluating/running a schedule or expiring approvals. */
  onError?: (error: unknown, context: ScheduleWorkerErrorContext) => void;
  /** Called after a schedule fires, with its result. Observability only. */
  onRun?: (scheduleName: string, result: CommandResult) => void;
}

export interface ScheduleWorkerHandle {
  /** Stop the loop and dispose the timer. Idempotent. */
  stop(): void;
  /**
   * Run a single tick immediately. The internal timer calls this; hosts and
   * tests may await it directly to drive the worker with their own clock.
   */
  tick(): Promise<void>;
}

const DEFAULT_INTERVAL_MS = 30_000;

/** Whether any entity declares an approval with a timeout (⇒ approvals can expire). */
function hasExpiringApprovals(runtime: ScheduleRuntime): boolean {
  return runtime
    .getEntities()
    .some((entity) => (entity.approvals ?? []).some((approval) => typeof approval.timeout === 'number'));
}

/** Per-run bookkeeping so cron dedupes per minute and interval/every track elapsed time. */
interface WorkerState {
  /** epoch-minute at which each cron schedule last fired (same-minute dedupe). */
  cronFiredMinute: Map<string, number>;
  /** epoch-ms at which each interval/every schedule last fired. */
  intervalLastRun: Map<string, number>;
  /** Baseline `lastRunAt` for interval/every schedules that have never fired. */
  startedAt: number;
}

/**
 * Decide whether a schedule is due at `now`, updating `state` when it fires.
 * Cron: due when the expression matches this UTC minute and it has not already
 * fired this minute. Interval/every: due when `now - lastRun >= durationMs`,
 * with the first fire one interval after the worker started. May throw for a
 * malformed cron expression — the caller isolates it.
 */
function claimIfDue(schedule: IRSchedule, state: WorkerState, now: number): boolean {
  const { trigger, name } = schedule;

  if (trigger.kind === 'cron') {
    if (!trigger.cron) return false;
    if (!isCronDue(trigger.cron, new Date(now))) return false;
    const minute = Math.floor(now / 60_000);
    if (state.cronFiredMinute.get(name) === minute) return false;
    state.cronFiredMinute.set(name, minute);
    return true;
  }

  // interval / every — both carry a resolved millisecond duration in the IR.
  const durationMs = trigger.durationMs;
  if (durationMs === undefined) return false;
  const lastRun = state.intervalLastRun.get(name) ?? state.startedAt;
  if (!isIntervalDue(durationMs, now, lastRun)) return false;
  state.intervalLastRun.set(name, now);
  return true;
}

/**
 * One scheduling pass: fire every due schedule once, then sweep expired
 * approvals when the IR declares any. `state` carries cron dedupe + interval
 * bookkeeping across passes. Errors are routed to `onError`, never thrown, so a
 * single bad schedule can't abort the pass.
 */
async function runTick(
  runtime: ScheduleRuntime,
  state: WorkerState,
  options: Pick<ScheduleWorkerOptions, 'now' | 'onError' | 'onRun'>,
): Promise<void> {
  const now = (options.now ?? Date.now)();

  for (const schedule of runtime.getSchedules()) {
    let due: boolean;
    try {
      due = claimIfDue(schedule, state, now);
    } catch (error) {
      // Malformed cron expression: report and skip this schedule, keep going.
      options.onError?.(error, { phase: 'runSchedule', scheduleName: schedule.name });
      continue;
    }
    if (!due) continue;
    try {
      const result = await runtime.runSchedule(schedule.name);
      options.onRun?.(schedule.name, result);
    } catch (error) {
      options.onError?.(error, { phase: 'runSchedule', scheduleName: schedule.name });
    }
  }

  if (hasExpiringApprovals(runtime)) {
    try {
      runtime.expireApprovals(now);
    } catch (error) {
      options.onError?.(error, { phase: 'expireApprovals' });
    }
  }
}

/**
 * Run a single scheduling pass immediately: fire the cron schedules due at
 * `now` (UTC, to the minute) and sweep expired approvals. Interval/every
 * schedules are inherently stateful; with no persistent worker their baseline
 * is `now`, so they do not fire from a lone pass — this is aimed at
 * platform-triggered cron-route hosting where the platform supplies the cadence.
 * Use {@link startScheduleWorker} for a self-contained loop that also drives
 * interval/every schedules.
 */
export async function runSchedulesOnce(
  runtime: ScheduleRuntime,
  options: Pick<ScheduleWorkerOptions, 'now' | 'onError' | 'onRun'> = {},
): Promise<void> {
  const now = (options.now ?? Date.now)();
  const state: WorkerState = {
    cronFiredMinute: new Map(),
    intervalLastRun: new Map(),
    startedAt: now,
  };
  await runTick(runtime, state, options);
}

/**
 * Start a long-running schedule worker. Each tick fires every due schedule
 * (cron matched in UTC with once-per-minute dedupe; interval/every by elapsed
 * time since last run, first fire one interval after start) and sweeps expired
 * approvals when the IR declares any. A throwing schedule is reported to
 * `onError` and never kills the loop. Returns a handle to stop it.
 *
 * At-least/at-most-once caveat: within a running process a cron schedule fires
 * exactly once per matching minute; across a restart it may re-fire in the
 * minute of the restart, and a schedule whose only matching minute coincides
 * with the worker's startup partial minute may be missed.
 */
export function startScheduleWorker(
  runtime: ScheduleRuntime,
  options: ScheduleWorkerOptions = {},
): ScheduleWorkerHandle {
  const now = options.now ?? Date.now;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const setTimer =
    options.setTimer ?? ((callback: () => void, ms: number): TimerHandle => setInterval(callback, ms));
  const clearTimer =
    options.clearTimer ??
    ((handle: TimerHandle): void => clearInterval(handle as Parameters<typeof clearInterval>[0]));

  const state: WorkerState = {
    cronFiredMinute: new Map(),
    intervalLastRun: new Map(),
    startedAt: now(),
  };

  let stopped = false;
  let running = false;
  let handle: TimerHandle | undefined;

  const tick = async (): Promise<void> => {
    if (stopped || running) return; // no overlapping ticks
    running = true;
    try {
      await runTick(runtime, state, { now, onError: options.onError, onRun: options.onRun });
    } finally {
      running = false;
    }
  };

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    if (handle !== undefined) clearTimer(handle);
    handle = undefined;
    options.signal?.removeEventListener('abort', stop);
  };

  if (options.signal?.aborted) {
    stopped = true;
    return { stop, tick };
  }
  options.signal?.addEventListener('abort', stop);

  handle = setTimer(() => {
    void tick();
  }, intervalMs);

  return { stop, tick };
}
