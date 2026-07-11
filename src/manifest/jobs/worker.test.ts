/**
 * Tests for the async-command job worker.
 *
 * - drainJobsOnce / runJobWorker loop mechanics against a fake runtime
 *   (timers injected — no real setTimeout fires).
 * - Integration: a real RuntimeEngine + MemoryJobQueue proves an async
 *   command reaches 'completed' and its mutation actually lands once drained
 *   (the Cluster B milestone: the engine enqueues, the worker drains).
 */

import { describe, it, expect, vi } from 'vitest';
import { drainJobsOnce, runJobWorker } from './worker';
import type { JobDrainable, JobWorkerHandle } from './worker';
import { RuntimeEngine, MemoryJobQueue } from '../runtime-engine';
import type { CommandResult } from '../runtime-engine';
import { IRCompiler } from '../ir-compiler';
import type { IR } from '../ir';

const ASYNC_MANIFEST = `
entity Order {
  property required id: string
  property status: string = "pending"
  property total: number = 0

  async command processOrder(amount: number) {
    guard self.status == "pending"
    mutate status = "processing"
    mutate total = amount
    emit OrderProcessed
  }
}

event OrderProcessed: "order.processed" {
  orderId: string
  total: number
}
`;

async function compileToIR(source: string): Promise<IR> {
  const compiler = new IRCompiler();
  const result = await compiler.compileToIR(source);
  if (!result.ir) {
    throw new Error(`Compilation failed: ${result.diagnostics.map((d) => d.message).join(', ')}`);
  }
  return result.ir;
}

/** A setTimeout stand-in that records but never fires — freezes the poll back-off. */
const neverFire = () => 0;

function ok(): CommandResult {
  return { success: true, emittedEvents: [] };
}

describe('drainJobsOnce', () => {
  it('delegates to runtime.drainJobs and returns its results', async () => {
    const results = [ok(), ok()];
    const runtime: JobDrainable = { drainJobs: vi.fn(async () => results) };

    const out = await drainJobsOnce(runtime);

    expect(out).toBe(results);
    expect(runtime.drainJobs).toHaveBeenCalledTimes(1);
  });
});

describe('runJobWorker (loop mechanics)', () => {
  it('drains until empty then parks until stopped', async () => {
    let calls = 0;
    const runtime: JobDrainable = {
      drainJobs: vi.fn(async () => {
        calls++;
        // Two ticks with work, then always empty.
        return calls <= 2 ? [ok()] : [];
      }),
    };

    let handle: JobWorkerHandle;
    const parked = new Promise<void>((resolve) => {
      handle = runJobWorker(runtime, {
        setTimeoutFn: () => {
          // The loop only reaches a back-off after it has drained everything.
          resolve();
          return 0;
        },
      });
    });

    await parked;
    await handle!.stop();

    // 2 ticks with work + at least the empty tick that triggered the back-off.
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  it('stops promptly when the provided AbortSignal fires', async () => {
    const controller = new AbortController();
    const runtime: JobDrainable = { drainJobs: async () => [] };

    const handle = runJobWorker(runtime, { signal: controller.signal, setTimeoutFn: neverFire });
    controller.abort();

    await expect(handle.done).resolves.toBeUndefined();
  });

  it('reports drain failures to onError and keeps running', async () => {
    let calls = 0;
    const runtime: JobDrainable = {
      drainJobs: async () => {
        calls++;
        if (calls === 1) throw new Error('queue offline');
        return [];
      },
    };

    let releaseBackoff: (() => void) | undefined;
    const setTimeoutFn = (cb: () => void) => {
      releaseBackoff = cb;
      return 0;
    };
    const errors: unknown[] = [];

    const handle = runJobWorker(runtime, { setTimeoutFn, onError: (err) => errors.push(err) });

    // Tick 1: drainJobs throws -> onError -> parked in the back-off.
    while (!releaseBackoff) await Promise.resolve();
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('queue offline');

    await handle.stop();
    expect(calls).toBeGreaterThanOrEqual(1);
  });
});

describe('async command end-to-end (RuntimeEngine + MemoryJobQueue)', () => {
  async function createRuntime() {
    const ir = await compileToIR(ASYNC_MANIFEST);
    let idCounter = 0;
    const jobQueue = new MemoryJobQueue();
    const runtime = new RuntimeEngine(
      ir,
      { source: 'test' },
      { generateId: () => `id-${++idCounter}`, now: () => 1000000, jobQueue },
    );
    return { runtime, jobQueue };
  }

  it('drainJobsOnce runs the enqueued job to completion and applies its mutation', async () => {
    const { runtime, jobQueue } = await createRuntime();

    const store = runtime.getStore('Order')!;
    await store.create({ id: 'order-1', status: 'pending', total: 0 });

    // Invoke the async command: it enqueues a pending job, does not mutate yet.
    const enqueueResult = await runtime.runCommand(
      'processOrder',
      { amount: 250 },
      {
        entityName: 'Order',
        instanceId: 'order-1',
      },
    );
    expect(enqueueResult.success).toBe(true);
    expect((enqueueResult.result as { status: string }).status).toBe('pending');
    expect(jobQueue.getAll().map((j) => j.status)).toEqual(['pending']);
    expect((await store.getById('order-1'))?.status).toBe('pending');

    // Drain once: the worker executes the deferred command.
    const results = await drainJobsOnce(runtime);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);

    // The job reached 'completed' and the mutation actually landed.
    expect(jobQueue.getAll()[0].status).toBe('completed');
    const instance = await store.getById('order-1');
    expect(instance?.status).toBe('processing');
    expect(instance?.total).toBe(250);
  });

  it('runJobWorker drives the real engine to completion on one tick', async () => {
    const { runtime, jobQueue } = await createRuntime();

    const store = runtime.getStore('Order')!;
    await store.create({ id: 'order-2', status: 'pending', total: 0 });
    await runtime.runCommand(
      'processOrder',
      { amount: 99 },
      {
        entityName: 'Order',
        instanceId: 'order-2',
      },
    );

    // Wrap drainJobs so we can observe deterministically when the job ran,
    // without relying on any timer.
    let handle: JobWorkerHandle;
    const drained = new Promise<CommandResult[]>((resolve) => {
      const observed: JobDrainable = {
        drainJobs: async () => {
          const r = await runtime.drainJobs();
          if (r.length > 0) resolve(r);
          return r;
        },
      };
      handle = runJobWorker(observed, { setTimeoutFn: neverFire });
    });

    const results = await drained;
    await handle!.stop();

    expect(results[0].success).toBe(true);
    expect(jobQueue.getAll()[0].status).toBe('completed');
    const instance = await store.getById('order-2');
    expect(instance?.status).toBe('processing');
    expect(instance?.total).toBe(99);
  });
});
