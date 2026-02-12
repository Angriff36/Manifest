import { describe, it, expect } from 'vitest';
import { runScript, validateScript } from '../src/index.js';
import type { TestScript, IR } from '../src/types/index.js';

const ORDER_IR: IR = {
  version: '1.0',
  entities: {
    Order: {
      properties: {
        status: { type: 'string' },
        items: { type: 'array' },
      },
      commands: {
        submit: {
          guards: [
            {
              expression: "self.status == 'draft'",
              check: { path: 'status', operator: 'eq', value: 'draft' },
            },
            {
              expression: 'self.items.length > 0',
              check: { path: 'items.length', operator: 'gt', value: 0 },
            },
          ],
          transitions: { status: 'submitted' },
          events: ['orderSubmitted'],
        },
        confirm: {
          guards: [
            {
              expression: "self.status == 'submitted'",
              check: { path: 'status', operator: 'eq', value: 'submitted' },
            },
          ],
          transitions: { status: 'confirmed' },
          events: ['orderConfirmed', 'notificationSent'],
        },
      },
    },
  },
};

describe('runScript', () => {
  it('executes a passing command successfully', async () => {
    const script: TestScript = {
      description: 'Simple passing test',
      context: { user: { id: 'user-1', role: 'customer' } },
      seedEntities: [
        {
          entity: 'Order',
          id: 'order-1',
          properties: {
            status: 'draft',
            items: [{ id: 'item-1', price: 10, quantity: 2 }],
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

    const result = await runScript({
      irSource: ORDER_IR,
      script,
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    expect(result.summary.totalSteps).toBe(1);
    expect(result.summary.passed).toBe(1);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.assertionsFailed).toBe(0);
    expect(result.execution.steps[0]?.result.success).toBe(true);
    expect(result.execution.steps[0]?.result.entityStateAfter?.status).toBe('submitted');
    expect(result.execution.steps[0]?.result.emittedEvents).toEqual([
      { name: 'orderSubmitted', data: {} },
    ]);
  });

  it('detects guard denial with diagnostics', async () => {
    const script: TestScript = {
      description: 'Guard denial test',
      context: { user: { id: 'user-1' } },
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
              message: 'items.length > 0',
            },
          },
        },
      ],
    };

    const result = await runScript({
      irSource: ORDER_IR,
      script,
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    expect(result.summary.passed).toBe(1);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.assertionsFailed).toBe(0);

    const step = result.execution.steps[0];
    expect(step?.result.success).toBe(false);
    expect(step?.result.guardFailures).toHaveLength(1);
    expect(step?.result.guardFailures?.[0]?.guardIndex).toBe(1);
    expect(step?.result.guardFailures?.[0]?.expression).toBe('self.items.length > 0');
    expect(step?.result.guardFailures?.[0]?.resolvedValues).toEqual({
      'self.items.length': 0,
    });
  });

  it('preserves deterministic event ordering across multi-step execution', async () => {
    const script: TestScript = {
      description: 'Event ordering test',
      context: { user: { id: 'user-1', role: 'admin' } },
      seedEntities: [
        {
          entity: 'Order',
          id: 'order-3',
          properties: {
            status: 'draft',
            items: [{ id: 'item-1', price: 25, quantity: 1 }],
          },
        },
      ],
      commands: [
        {
          step: 1,
          entity: 'Order',
          id: 'order-3',
          command: 'submit',
          params: {},
          expect: {
            success: true,
            emittedEvents: ['orderSubmitted'],
          },
        },
        {
          step: 2,
          entity: 'Order',
          id: 'order-3',
          command: 'confirm',
          params: {},
          expect: {
            success: true,
            stateAfter: { status: 'confirmed' },
            emittedEvents: ['orderConfirmed', 'notificationSent'],
          },
        },
      ],
    };

    const result = await runScript({
      irSource: ORDER_IR,
      script,
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    expect(result.summary.totalSteps).toBe(2);
    expect(result.summary.passed).toBe(2);
    expect(result.summary.failed).toBe(0);

    const step1Events = result.execution.steps[0]?.result.emittedEvents.map((e) => e.name);
    expect(step1Events).toEqual(['orderSubmitted']);

    const step2Events = result.execution.steps[1]?.result.emittedEvents.map((e) => e.name);
    expect(step2Events).toEqual(['orderConfirmed', 'notificationSent']);
  });

  it('detects assertion failures when expectations are wrong', async () => {
    const script: TestScript = {
      description: 'Wrong expectation test',
      context: { user: { id: 'user-1' } },
      seedEntities: [
        {
          entity: 'Order',
          id: 'order-4',
          properties: {
            status: 'draft',
            items: [{ id: 'item-1', price: 10, quantity: 1 }],
          },
        },
      ],
      commands: [
        {
          step: 1,
          entity: 'Order',
          id: 'order-4',
          command: 'submit',
          params: {},
          expect: {
            success: true,
            stateAfter: { status: 'cancelled' },
          },
        },
      ],
    };

    const result = await runScript({
      irSource: ORDER_IR,
      script,
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    expect(result.summary.failed).toBe(1);
    expect(result.summary.assertionsFailed).toBeGreaterThan(0);

    const failedAssertion = result.execution.steps[0]?.assertions.details.find(
      (d) => !d.passed && d.check === 'stateAfter.status'
    );
    expect(failedAssertion).toBeDefined();
    expect(failedAssertion?.expected).toBe('cancelled');
    expect(failedAssertion?.actual).toBe('submitted');
  });

  it('throws on invalid script', async () => {
    const badScript = { commands: [] } as unknown as TestScript;

    await expect(
      runScript({
        irSource: ORDER_IR,
        script: badScript,
        timestamp: '2026-01-01T00:00:00.000Z',
      })
    ).rejects.toThrow('Invalid script');
  });

  it('throws when neither irSource nor manifestSource is provided', async () => {
    const script: TestScript = {
      description: 'Missing source test',
      commands: [
        {
          step: 1,
          entity: 'Order',
          id: 'order-1',
          command: 'submit',
          expect: { success: true },
        },
      ],
    };

    await expect(
      runScript({ script, timestamp: '2026-01-01T00:00:00.000Z' })
    ).rejects.toThrow('Either irSource or manifestSource must be provided');
  });
});

describe('validateScript', () => {
  it('validates a correct script', () => {
    const script = {
      description: 'Valid script',
      commands: [
        {
          step: 1,
          entity: 'Order',
          id: 'order-1',
          command: 'submit',
          expect: { success: true },
        },
      ],
    };
    const result = validateScript(script);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects script with missing description', () => {
    const script = {
      commands: [
        {
          step: 1,
          entity: 'Order',
          id: 'order-1',
          command: 'submit',
          expect: { success: true },
        },
      ],
    };
    const result = validateScript(script);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('description'))).toBe(true);
  });

  it('rejects script with empty commands', () => {
    const script = {
      description: 'Empty commands',
      commands: [],
    };
    const result = validateScript(script);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('commands'))).toBe(true);
  });

  it('rejects script with invalid command structure', () => {
    const script = {
      description: 'Bad command',
      commands: [{ step: 'not-a-number' }],
    };
    const result = validateScript(script);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects non-object input', () => {
    const result = validateScript('not an object');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toBe('Script must be an object');
  });

  it('validates seed entities', () => {
    const script = {
      description: 'Bad seed',
      seedEntities: [{ entity: '', id: 'x', properties: {} }],
      commands: [
        {
          step: 1,
          entity: 'Order',
          id: 'order-1',
          command: 'submit',
          expect: { success: true },
        },
      ],
    };
    const result = validateScript(script);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('seedEntities[0].entity'))).toBe(true);
  });
});
