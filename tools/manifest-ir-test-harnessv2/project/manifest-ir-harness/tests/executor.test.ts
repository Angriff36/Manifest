import { describe, it, expect } from 'vitest';
import { executeScript } from '../src/core/executor.js';
import type { IR } from '../src/adapters/manifest-core.js';
import type { TestScript } from '../src/types/index.js';

const orderIR: IR = {
  entities: [
    {
      name: 'Order',
      properties: [
        { name: 'id', type: 'string' },
        { name: 'status', type: 'string', default: 'draft' },
        { name: 'items', type: 'array', default: [] },
      ],
      commands: [
        {
          name: 'submit',
          params: [],
          guards: [
            { expression: 'self.status == "draft"' },
            { expression: 'self.items.length > 0' },
          ],
          mutations: [{ property: 'status', value: 'submitted' }],
          events: [{ name: 'orderSubmitted' }],
        },
        {
          name: 'complete',
          params: [],
          guards: [{ expression: 'self.status == "submitted"' }],
          mutations: [{ property: 'status', value: 'completed' }],
          events: [{ name: 'orderCompleted' }],
        },
      ],
    },
  ],
};

const FIXED_TIME = '2025-01-01T00:00:00.000Z';

describe('Script Executor', () => {
  it('executes successful command and captures state', async () => {
    const script: TestScript = {
      description: 'Submit order successfully',
      seedEntities: [
        {
          entity: 'Order',
          id: 'order-1',
          properties: {
            status: 'draft',
            items: [{ id: 'item-1', price: 10 }],
          },
        },
      ],
      commands: [
        {
          step: 1,
          entity: 'Order',
          id: 'order-1',
          command: 'submit',
          params: {},
          expect: {
            success: true,
            stateAfter: { status: 'submitted' },
            emittedEvents: ['orderSubmitted'],
          },
        },
      ],
    };

    const result = await executeScript({
      ir: orderIR,
      script,
      executedAt: FIXED_TIME,
    });

    expect(result.summary.totalSteps).toBe(1);
    expect(result.summary.passed).toBe(1);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.assertionsFailed).toBe(0);

    const step = result.execution.steps[0]!;
    expect(step.result.success).toBe(true);
    expect(step.result.entityStateAfter?.['status']).toBe('submitted');
    expect(step.result.emittedEvents).toEqual([
      { name: 'orderSubmitted', data: expect.objectContaining({ status: 'submitted' }) },
    ]);

    expect(step.assertions.failed).toBe(0);
    expect(step.assertions.passed).toBeGreaterThan(0);
  });

  it('captures guard failure with diagnostics', async () => {
    const script: TestScript = {
      description: 'Guard denial on empty items',
      seedEntities: [
        {
          entity: 'Order',
          id: 'order-2',
          properties: { status: 'draft', items: [] },
        },
      ],
      commands: [
        {
          step: 1,
          entity: 'Order',
          id: 'order-2',
          command: 'submit',
          params: {},
          expect: {
            success: false,
            error: {
              type: 'guard',
              guardIndex: 1,
              message: 'self.items.length > 0',
            },
          },
        },
      ],
    };

    const result = await executeScript({
      ir: orderIR,
      script,
      executedAt: FIXED_TIME,
    });

    expect(result.summary.totalSteps).toBe(1);
    expect(result.summary.failed).toBe(1);
    expect(result.summary.passed).toBe(0);

    const step = result.execution.steps[0]!;
    expect(step.result.success).toBe(false);
    expect(step.result.guardFailures).toHaveLength(1);
    expect(step.result.guardFailures![0]!.guardIndex).toBe(1);
    expect(step.result.guardFailures![0]!.expression).toBe('self.items.length > 0');
    expect(step.result.guardFailures![0]!.resolvedValues).toEqual({
      'self.items.length': 0,
    });

    expect(step.assertions.failed).toBe(0);
  });

  it('captures emitted events in order', async () => {
    const script: TestScript = {
      description: 'Events in order across commands',
      seedEntities: [
        {
          entity: 'Order',
          id: 'order-3',
          properties: { status: 'draft', items: [{ id: 'x' }] },
        },
      ],
      commands: [
        {
          step: 1,
          entity: 'Order',
          id: 'order-3',
          command: 'submit',
          expect: {
            success: true,
            emittedEvents: ['orderSubmitted'],
          },
        },
        {
          step: 2,
          entity: 'Order',
          id: 'order-3',
          command: 'complete',
          expect: {
            success: true,
            emittedEvents: ['orderCompleted'],
          },
        },
      ],
    };

    const result = await executeScript({
      ir: orderIR,
      script,
      executedAt: FIXED_TIME,
    });

    expect(result.summary.totalSteps).toBe(2);
    expect(result.summary.passed).toBe(2);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.assertionsFailed).toBe(0);

    const step1 = result.execution.steps[0]!;
    expect(step1.result.emittedEvents![0]!.name).toBe('orderSubmitted');

    const step2 = result.execution.steps[1]!;
    expect(step2.result.emittedEvents![0]!.name).toBe('orderCompleted');
    expect(step2.result.entityStateAfter?.['status']).toBe('completed');
  });

  it('reports assertion failures when expectations dont match', async () => {
    const script: TestScript = {
      description: 'Wrong expectation',
      seedEntities: [
        {
          entity: 'Order',
          id: 'order-4',
          properties: { status: 'draft', items: [{ id: 'a' }] },
        },
      ],
      commands: [
        {
          step: 1,
          entity: 'Order',
          id: 'order-4',
          command: 'submit',
          expect: {
            success: true,
            stateAfter: { status: 'cancelled' },
          },
        },
      ],
    };

    const result = await executeScript({
      ir: orderIR,
      script,
      executedAt: FIXED_TIME,
    });

    expect(result.summary.assertionsFailed).toBeGreaterThan(0);

    const step = result.execution.steps[0]!;
    const failedAssertion = step.assertions.details.find(
      d => d.check === 'stateAfter.status' && !d.passed
    );
    expect(failedAssertion).toBeDefined();
    expect(failedAssertion!.expected).toBe('cancelled');
    expect(failedAssertion!.actual).toBe('submitted');
  });

  it('handles missing entity gracefully', async () => {
    const script: TestScript = {
      description: 'Missing entity',
      commands: [
        {
          step: 1,
          entity: 'NonExistent',
          id: 'id-1',
          command: 'doSomething',
          expect: { success: false },
        },
      ],
    };

    const result = await executeScript({
      ir: orderIR,
      script,
      executedAt: FIXED_TIME,
    });

    expect(result.summary.failed).toBe(1);
    const step = result.execution.steps[0]!;
    expect(step.result.success).toBe(false);
    expect(step.result.error).toContain('not found');
  });

  it('handles unseeded instance gracefully', async () => {
    const script: TestScript = {
      description: 'Unseeded instance',
      commands: [
        {
          step: 1,
          entity: 'Order',
          id: 'nonexistent-id',
          command: 'submit',
          expect: { success: false },
        },
      ],
    };

    const result = await executeScript({
      ir: orderIR,
      script,
      executedAt: FIXED_TIME,
    });

    expect(result.summary.failed).toBe(1);
    const step = result.execution.steps[0]!;
    expect(step.result.success).toBe(false);
    expect(step.result.error).toContain('not found');
  });

  it('includes harness metadata in output', async () => {
    const script: TestScript = {
      description: 'Metadata test',
      seedEntities: [
        {
          entity: 'Order',
          id: 'order-m',
          properties: { status: 'draft', items: [{ id: '1' }] },
        },
      ],
      commands: [
        {
          step: 1,
          entity: 'Order',
          id: 'order-m',
          command: 'submit',
          expect: { success: true },
        },
      ],
    };

    const result = await executeScript({
      ir: orderIR,
      script,
      sourcePath: '/test/path.ir.json',
      sourceType: 'ir',
      scriptPath: '/test/script.json',
      irHash: 'abc123',
      executedAt: FIXED_TIME,
    });

    expect(result.harness.version).toBe('1.0.0');
    expect(result.harness.executedAt).toBe(FIXED_TIME);
    expect(result.source.type).toBe('ir');
    expect(result.source.path).toBe('/test/path.ir.json');
    expect(result.source.irHash).toBe('abc123');
    expect(result.script.path).toBe('/test/script.json');
    expect(result.script.description).toBe('Metadata test');
  });
});
