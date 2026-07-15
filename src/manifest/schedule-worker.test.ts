import { describe, it, expect } from 'vitest';
import {
  startScheduleWorker,
  runSchedulesOnce,
  type ScheduleRuntime,
  type ScheduleWorkerErrorContext,
} from './schedule-worker';
import { compileToIR } from './ir-compiler';
import { RuntimeEngine } from './runtime-engine';
import type { CommandResult } from './runtime-engine';
import type { IRSchedule, IREntity } from './ir';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/** A fake ScheduleRuntime that records what the worker asks it to do. */
function makeRuntime(config: {
  schedules?: IRSchedule[];
  entities?: IREntity[];
  runScheduleThrows?: Set<string>;
}): ScheduleRuntime & { runCalls: string[]; expireCalls: number[] } {
  const runCalls: string[] = [];
  const expireCalls: number[] = [];
  return {
    runCalls,
    expireCalls,
    getSchedules: () => config.schedules ?? [],
    getEntities: () => config.entities ?? [],
    async runSchedule(name: string): Promise<CommandResult> {
      runCalls.push(name);
      if (config.runScheduleThrows?.has(name)) throw new Error(`boom:${name}`);
      return { success: true, emittedEvents: [] };
    },
    async expireApprovals(now?: number) {
      expireCalls.push(now ?? -1);
      return [];
    },
  };
}

/** A captured-callback timer so tests drive ticks by hand and assert scheduling. */
function fakeTimer() {
  const calls: Array<{ cb: () => void; ms: number }> = [];
  let cleared = 0;
  return {
    setTimer: (cb: () => void, ms: number): unknown => {
      calls.push({ cb, ms });
      return calls.length;
    },
    clearTimer: (): void => {
      cleared += 1;
    },
    calls,
    get cleared() {
      return cleared;
    },
  };
}

function cron(name: string, expr: string): IRSchedule {
  return { name, commandName: name, trigger: { kind: 'cron', cron: expr } };
}

function interval(name: string, ms: number): IRSchedule {
  return { name, commandName: name, trigger: { kind: 'interval', durationMs: ms } };
}

function entityWithApproval(withTimeout: boolean): IREntity {
  return {
    name: 'Doc',
    properties: [],
    computedProperties: [],
    relationships: [],
    commands: [],
    constraints: [],
    policies: [],
    approvals: [
      {
        name: 'review',
        command: 'publish',
        stages: [],
        ...(withTimeout ? { timeout: 24, onTimeout: 'cancel' as const } : {}),
        emits: [],
      },
    ],
  };
}

const MIDNIGHT_JAN_1 = Date.parse('2025-01-01T00:00:00Z');

// ---------------------------------------------------------------------------
// Cron scheduling + dedupe
// ---------------------------------------------------------------------------

describe('startScheduleWorker — cron schedules', () => {
  it('fires a cron schedule once per matching minute (same-minute dedupe)', async () => {
    const runtime = makeRuntime({ schedules: [cron('daily', '0 0 * * *')] });
    let clock = MIDNIGHT_JAN_1;
    const ft = fakeTimer();
    const worker = startScheduleWorker(runtime, {
      now: () => clock,
      setTimer: ft.setTimer,
      clearTimer: ft.clearTimer,
    });

    await worker.tick(); // 00:00:00 — due
    await worker.tick(); // same instant — deduped
    clock += 30_000; // 00:00:30 — same minute, deduped
    await worker.tick();
    expect(runtime.runCalls).toEqual(['daily']);

    clock = Date.parse('2025-01-02T00:00:00Z'); // next day, matching minute again
    await worker.tick();
    expect(runtime.runCalls).toEqual(['daily', 'daily']);

    worker.stop();
  });

  it('does not fire a cron schedule outside its matching minute', async () => {
    const runtime = makeRuntime({ schedules: [cron('daily', '0 0 * * *')] });
    const ft = fakeTimer();
    const worker = startScheduleWorker(runtime, {
      now: () => Date.parse('2025-01-01T00:01:00Z'),
      setTimer: ft.setTimer,
      clearTimer: ft.clearTimer,
    });

    await worker.tick();
    expect(runtime.runCalls).toEqual([]);
    worker.stop();
  });
});

// ---------------------------------------------------------------------------
// Interval scheduling
// ---------------------------------------------------------------------------

describe('startScheduleWorker — interval schedules', () => {
  it('fires after one interval, not on the first tick, then on each elapsed interval', async () => {
    const fiveMin = 5 * 60 * 1000;
    const runtime = makeRuntime({ schedules: [interval('poll', fiveMin)] });
    let clock = 1_000_000;
    const ft = fakeTimer();
    const worker = startScheduleWorker(runtime, {
      now: () => clock,
      setTimer: ft.setTimer,
      clearTimer: ft.clearTimer,
    });

    await worker.tick(); // elapsed 0 < interval — not due
    expect(runtime.runCalls).toEqual([]);

    clock += fiveMin; // one full interval later
    await worker.tick();
    expect(runtime.runCalls).toEqual(['poll']);

    clock += fiveMin - 1; // just under the next interval
    await worker.tick();
    expect(runtime.runCalls).toEqual(['poll']);

    clock += 1; // exactly at the next interval
    await worker.tick();
    expect(runtime.runCalls).toEqual(['poll', 'poll']);

    worker.stop();
  });
});

// ---------------------------------------------------------------------------
// Approval expiry
// ---------------------------------------------------------------------------

describe('startScheduleWorker — approval expiry', () => {
  it('sweeps expiring approvals each tick with the tick clock', async () => {
    const runtime = makeRuntime({ entities: [entityWithApproval(true)] });
    let clock = 5000;
    const ft = fakeTimer();
    const worker = startScheduleWorker(runtime, {
      now: () => clock,
      setTimer: ft.setTimer,
      clearTimer: ft.clearTimer,
    });

    await worker.tick();
    clock = 6000;
    await worker.tick();
    expect(runtime.expireCalls).toEqual([5000, 6000]);
    worker.stop();
  });

  it('does not sweep when no approval declares a timeout', async () => {
    const runtime = makeRuntime({ entities: [entityWithApproval(false)] });
    const ft = fakeTimer();
    const worker = startScheduleWorker(runtime, {
      now: () => 1234,
      setTimer: ft.setTimer,
      clearTimer: ft.clearTimer,
    });

    await worker.tick();
    expect(runtime.expireCalls).toEqual([]);
    worker.stop();
  });
});

// ---------------------------------------------------------------------------
// Error isolation
// ---------------------------------------------------------------------------

describe('startScheduleWorker — error isolation', () => {
  it('reports a throwing schedule and still runs the others', async () => {
    const errors: ScheduleWorkerErrorContext[] = [];
    const runtime = makeRuntime({
      schedules: [cron('bad', '0 0 * * *'), cron('good', '0 0 * * *')],
      runScheduleThrows: new Set(['bad']),
    });
    const ft = fakeTimer();
    const worker = startScheduleWorker(runtime, {
      now: () => MIDNIGHT_JAN_1,
      setTimer: ft.setTimer,
      clearTimer: ft.clearTimer,
      onError: (_err, ctx) => errors.push(ctx),
    });

    await worker.tick();
    expect(runtime.runCalls).toEqual(['bad', 'good']);
    expect(errors).toEqual([{ phase: 'runSchedule', scheduleName: 'bad' }]);
    worker.stop();
  });

  it('reports and skips a malformed cron expression without touching valid ones', async () => {
    const errors: ScheduleWorkerErrorContext[] = [];
    const runtime = makeRuntime({
      schedules: [cron('broken', 'not a cron'), cron('ok', '* * * * *')],
    });
    const ft = fakeTimer();
    const worker = startScheduleWorker(runtime, {
      now: () => MIDNIGHT_JAN_1,
      setTimer: ft.setTimer,
      clearTimer: ft.clearTimer,
      onError: (_err, ctx) => errors.push(ctx),
    });

    await worker.tick();
    expect(runtime.runCalls).toEqual(['ok']);
    expect(errors).toEqual([{ phase: 'runSchedule', scheduleName: 'broken' }]);
    worker.stop();
  });
});

// ---------------------------------------------------------------------------
// Lifecycle: timer scheduling, stop, AbortSignal
// ---------------------------------------------------------------------------

describe('startScheduleWorker — lifecycle', () => {
  it('schedules the tick timer with the configured interval (default 30s)', () => {
    const runtime = makeRuntime({ schedules: [] });
    const ft = fakeTimer();
    startScheduleWorker(runtime, {
      now: () => 0,
      setTimer: ft.setTimer,
      clearTimer: ft.clearTimer,
    });
    expect(ft.calls).toHaveLength(1);
    expect(ft.calls[0].ms).toBe(30_000);

    const ft2 = fakeTimer();
    startScheduleWorker(runtime, {
      now: () => 0,
      intervalMs: 5000,
      setTimer: ft2.setTimer,
      clearTimer: ft2.clearTimer,
    });
    expect(ft2.calls[0].ms).toBe(5000);
  });

  it('stop() clears the timer and halts further ticks (idempotent)', async () => {
    const runtime = makeRuntime({ schedules: [cron('m', '* * * * *')] });
    const ft = fakeTimer();
    const worker = startScheduleWorker(runtime, {
      now: () => MIDNIGHT_JAN_1,
      setTimer: ft.setTimer,
      clearTimer: ft.clearTimer,
    });

    worker.stop();
    worker.stop(); // idempotent — clears only once
    expect(ft.cleared).toBe(1);

    await worker.tick(); // no-op after stop
    expect(runtime.runCalls).toEqual([]);
  });

  it('aborting the signal stops the worker', async () => {
    const controller = new AbortController();
    const runtime = makeRuntime({ schedules: [cron('m', '* * * * *')] });
    const ft = fakeTimer();
    const worker = startScheduleWorker(runtime, {
      now: () => MIDNIGHT_JAN_1,
      setTimer: ft.setTimer,
      clearTimer: ft.clearTimer,
      signal: controller.signal,
    });

    controller.abort();
    expect(ft.cleared).toBe(1);
    await worker.tick();
    expect(runtime.runCalls).toEqual([]);
  });

  it('an already-aborted signal starts stopped (no timer scheduled)', async () => {
    const controller = new AbortController();
    controller.abort();
    const runtime = makeRuntime({ schedules: [cron('m', '* * * * *')] });
    const ft = fakeTimer();
    const worker = startScheduleWorker(runtime, {
      now: () => MIDNIGHT_JAN_1,
      setTimer: ft.setTimer,
      clearTimer: ft.clearTimer,
      signal: controller.signal,
    });

    expect(ft.calls).toHaveLength(0);
    await worker.tick();
    expect(runtime.runCalls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// runSchedulesOnce
// ---------------------------------------------------------------------------

describe('runSchedulesOnce', () => {
  it('fires cron schedules due now and leaves stateful interval schedules alone', async () => {
    const runtime = makeRuntime({
      schedules: [cron('c', '0 0 * * *'), interval('i', 1000)],
    });
    await runSchedulesOnce(runtime, { now: () => MIDNIGHT_JAN_1 });
    expect(runtime.runCalls).toEqual(['c']);
  });

  it('sweeps expiring approvals with the supplied clock', async () => {
    const runtime = makeRuntime({ entities: [entityWithApproval(true)] });
    await runSchedulesOnce(runtime, { now: () => 999 });
    expect(runtime.expireCalls).toEqual([999]);
  });
});

// ---------------------------------------------------------------------------
// Integration: real RuntimeEngine, real mutation driven by a due tick
// ---------------------------------------------------------------------------

describe('startScheduleWorker — integration with RuntimeEngine', () => {
  it('runs a due schedule against a real engine and the command mutates state', async () => {
    const compiled = await compileToIR(`
      entity Todo {
        property id: string
        property createdAt: number
        command create(ts: number) {
          mutate createdAt = ts
        }
      }
      schedule seedTodo cron "0 0 * * *" run Todo.create(ts: now())
    `);
    expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const ir = compiled.ir!;

    const runtime = new RuntimeEngine(
      ir,
      {},
      {
        generateId: () => 'todo-1',
        now: () => 12345,
      },
    );

    const runResults: CommandResult[] = [];
    const ft = fakeTimer();
    const worker = startScheduleWorker(runtime, {
      now: () => MIDNIGHT_JAN_1, // matches "0 0 * * *"
      setTimer: ft.setTimer,
      clearTimer: ft.clearTimer,
      onRun: (_name, result) => runResults.push(result),
    });

    await worker.tick();
    worker.stop();

    expect(runResults).toHaveLength(1);
    expect(runResults[0].success).toBe(true);

    const persisted = await runtime.getInstance('Todo', 'todo-1');
    expect(persisted).toMatchObject({ id: 'todo-1', createdAt: 12345 });
  });
});
