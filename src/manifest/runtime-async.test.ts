/**
 * Unit tests for Async Command Execution
 *
 * Tests the async command modifier feature including:
 * - Async command enqueues job and returns JobId immediately
 * - Guard/policy validation runs synchronously (fail-fast)
 * - drainJobs() executes deferred work and emits completion/failure events
 * - Sync commands remain unaffected
 * - Re-entry via context.source = 'job' bypasses async branch
 * - Missing job queue produces diagnostic error
 */

import { describe, it, expect } from 'vitest';
import { RuntimeEngine, MemoryJobQueue } from './runtime-engine';
import { IRCompiler } from './ir-compiler';
import type { IR } from './ir';

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

  command cancelOrder() {
    guard self.status == "pending"
    mutate status = "cancelled"
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
    throw new Error(`Compilation failed: ${result.diagnostics.map(d => d.message).join(', ')}`);
  }
  return result.ir;
}

describe('Async Command Execution', () => {
  let ir: IR;
  let idCounter: number;

  async function createRuntime(opts?: { withJobQueue?: boolean; source?: string }) {
    ir = await compileToIR(ASYNC_MANIFEST);
    idCounter = 0;
    const jobQueue = opts?.withJobQueue !== false ? new MemoryJobQueue() : undefined;
    const runtime = new RuntimeEngine(
      ir,
      { source: opts?.source || 'test' },
      {
        generateId: () => `id-${++idCounter}`,
        now: () => 1000000,
        jobQueue,
      }
    );
    return { runtime, jobQueue: jobQueue! };
  }

  describe('IR compilation', () => {
    it('should set async: true on async commands', async () => {
      ir = await compileToIR(ASYNC_MANIFEST);
      const processOrder = ir.commands.find(c => c.name === 'processOrder');
      expect(processOrder?.async).toBe(true);
      expect(processOrder?.completionEvent).toBe('processOrderCompleted');
      expect(processOrder?.failureEvent).toBe('processOrderFailed');
    });

    it('should not set async on non-async commands', async () => {
      ir = await compileToIR(ASYNC_MANIFEST);
      const cancelOrder = ir.commands.find(c => c.name === 'cancelOrder');
      expect(cancelOrder?.async).toBeUndefined();
      expect(cancelOrder?.completionEvent).toBeUndefined();
      expect(cancelOrder?.failureEvent).toBeUndefined();
    });

    it('should synthesize completion and failure events', async () => {
      ir = await compileToIR(ASYNC_MANIFEST);
      const eventNames = ir.events.map(e => e.name);
      expect(eventNames).toContain('processOrderCompleted');
      expect(eventNames).toContain('processOrderFailed');

      const completionEvent = ir.events.find(e => e.name === 'processOrderCompleted');
      expect(completionEvent?.channel).toBe('jobs.processOrder');

      const failureEvent = ir.events.find(e => e.name === 'processOrderFailed');
      expect(failureEvent?.channel).toBe('jobs.processOrder');
    });

    it('should preserve user-declared events alongside synthesized events', async () => {
      ir = await compileToIR(ASYNC_MANIFEST);
      const eventNames = ir.events.map(e => e.name);
      expect(eventNames).toContain('OrderProcessed');
      expect(eventNames).toContain('processOrderCompleted');
      expect(eventNames).toContain('processOrderFailed');
      expect(ir.events.length).toBe(3);
    });

    it('should emit diagnostic on event name collision', async () => {
      const collisionManifest = `
        entity Foo {
          property required id: string
          async command doWork() {
            mutate id = "done"
          }
        }
        event doWorkCompleted: "collision" {
          data: string
        }
      `;
      const compiler = new IRCompiler();
      const result = await compiler.compileToIR(collisionManifest);
      expect(result.diagnostics.some(d =>
        d.severity === 'error' && d.message.includes('collides with a user-declared event')
      )).toBe(true);
    });
  });

  describe('async command enqueue', () => {
    it('should return jobId immediately without executing actions', async () => {
      const { runtime } = await createRuntime();

      // Create an order instance
      const store = runtime.getStore('Order')!;
      await store.create({ id: 'order-1', status: 'pending', total: 0 });

      const result = await runtime.runCommand('processOrder', { amount: 100 }, {
        entityName: 'Order',
        instanceId: 'order-1',
      });

      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        jobId: 'id-1',
        status: 'pending',
        enqueuedAt: 1000000,
      });
      // No events emitted on enqueue
      expect(result.emittedEvents).toEqual([]);

      // Instance should NOT be mutated yet (actions deferred)
      const instance = await store.getById('order-1');
      expect(instance?.status).toBe('pending');
      expect(instance?.total).toBe(0);
    });

    it('should fail-fast on guard failure without enqueuing', async () => {
      const { runtime, jobQueue } = await createRuntime();

      const store = runtime.getStore('Order')!;
      await store.create({ id: 'order-2', status: 'shipped', total: 0 });

      const result = await runtime.runCommand('processOrder', { amount: 50 }, {
        entityName: 'Order',
        instanceId: 'order-2',
      });

      expect(result.success).toBe(false);
      expect(result.guardFailure).toBeDefined();
      expect(result.emittedEvents).toEqual([]);

      // No job should be enqueued
      const jobs = jobQueue.getAll();
      expect(jobs.length).toBe(0);
    });

    it('should error when jobQueue is not configured', async () => {
      const { runtime } = await createRuntime({ withJobQueue: false });

      const store = runtime.getStore('Order')!;
      await store.create({ id: 'order-3', status: 'pending', total: 0 });

      const result = await runtime.runCommand('processOrder', { amount: 75 }, {
        entityName: 'Order',
        instanceId: 'order-3',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('MISSING_JOB_QUEUE');
    });
  });

  describe('sync commands unaffected', () => {
    it('should execute sync commands normally', async () => {
      const { runtime } = await createRuntime();

      const store = runtime.getStore('Order')!;
      await store.create({ id: 'order-4', status: 'pending', total: 0 });

      const result = await runtime.runCommand('cancelOrder', {}, {
        entityName: 'Order',
        instanceId: 'order-4',
      });

      expect(result.success).toBe(true);
      // Instance should be mutated immediately
      const instance = await store.getById('order-4');
      expect(instance?.status).toBe('cancelled');
    });
  });

  describe('drainJobs', () => {
    it('should execute deferred work and emit completion event', async () => {
      const { runtime, jobQueue } = await createRuntime();

      const store = runtime.getStore('Order')!;
      await store.create({ id: 'order-5', status: 'pending', total: 0 });

      // Enqueue async command
      await runtime.runCommand('processOrder', { amount: 200 }, {
        entityName: 'Order',
        instanceId: 'order-5',
      });

      // Verify job was enqueued
      const jobs = jobQueue.getAll();
      expect(jobs.length).toBe(1);
      expect(jobs[0].status).toBe('pending');

      // Drain jobs - executes the deferred work
      const drainResults = await runtime.drainJobs();

      expect(drainResults.length).toBe(1);
      expect(drainResults[0].success).toBe(true);

      // Instance should now be mutated
      const instance = await store.getById('order-5');
      expect(instance?.status).toBe('processing');
      expect(instance?.total).toBe(200);

      // Completion event should be emitted
      const completionEvent = drainResults[0].emittedEvents.find(
        e => e.name === 'processOrderCompleted'
      );
      expect(completionEvent).toBeDefined();
      expect(completionEvent?.channel).toBe('jobs.processOrder');
      expect((completionEvent?.payload as Record<string, unknown>)?.jobId).toBe('id-1');

      // Job status should be updated
      const updatedJobs = jobQueue.getAll();
      expect(updatedJobs[0].status).toBe('completed');
    });

    it('should emit failure event when deferred execution fails', async () => {
      const { runtime, jobQueue } = await createRuntime();

      const store = runtime.getStore('Order')!;
      await store.create({ id: 'order-6', status: 'pending', total: 0 });

      // Enqueue async command
      await runtime.runCommand('processOrder', { amount: 100 }, {
        entityName: 'Order',
        instanceId: 'order-6',
      });

      // Mutate the instance so the guard fails during drain
      await store.update('order-6', { status: 'shipped' });

      const drainResults = await runtime.drainJobs();

      expect(drainResults.length).toBe(1);
      expect(drainResults[0].success).toBe(false);

      // Failure event should be emitted
      const failureEvent = drainResults[0].emittedEvents.find(
        e => e.name === 'processOrderFailed'
      );
      expect(failureEvent).toBeDefined();
      expect(failureEvent?.channel).toBe('jobs.processOrder');
      expect((failureEvent?.payload as Record<string, unknown>)?.jobId).toBe('id-1');

      // Job status should be updated to failed
      const updatedJobs = jobQueue.getAll();
      expect(updatedJobs[0].status).toBe('failed');
    });

    it('should return empty array when no jobQueue configured', async () => {
      const { runtime } = await createRuntime({ withJobQueue: false });
      const results = await runtime.drainJobs();
      expect(results).toEqual([]);
    });

    it('should return empty array when no pending jobs', async () => {
      const { runtime } = await createRuntime();
      const results = await runtime.drainJobs();
      expect(results).toEqual([]);
    });
  });

  describe('MemoryJobQueue', () => {
    it('should enqueue and drain pending jobs', async () => {
      const queue = new MemoryJobQueue();

      await queue.enqueue({
        jobId: 'j1',
        commandName: 'processOrder',
        input: { amount: 100 },
        enqueuedAt: 1000,
        status: 'pending',
      });

      const pending = await queue.drainPending();
      expect(pending.length).toBe(1);
      expect(pending[0].jobId).toBe('j1');
      expect(pending[0].status).toBe('running');

      // Second drain should return empty
      const secondDrain = await queue.drainPending();
      expect(secondDrain.length).toBe(0);
    });

    it('should update job status', async () => {
      const queue = new MemoryJobQueue();

      await queue.enqueue({
        jobId: 'j2',
        commandName: 'test',
        input: {},
        enqueuedAt: 2000,
        status: 'pending',
      });

      await queue.updateStatus('j2', 'completed', { result: { success: true } });

      const all = queue.getAll();
      expect(all[0].status).toBe('completed');
    });
  });
});
