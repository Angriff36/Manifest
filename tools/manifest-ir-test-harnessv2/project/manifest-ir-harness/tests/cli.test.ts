import { describe, it, expect } from 'vitest';
import { validateScript, parseScript } from '../src/core/script-schema.js';
import { formatOutput, stripVolatileFields, formatForSnapshot } from '../src/core/output-formatter.js';
import type { ExecutionResult } from '../src/types/index.js';

describe('Script Validation', () => {
  it('validates a correct script', () => {
    const script = {
      description: 'Test script',
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
    expect(result.errors.some(e => e.path === 'description')).toBe(true);
  });

  it('rejects script with missing commands', () => {
    const script = {
      description: 'Test',
    };

    const result = validateScript(script);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'commands')).toBe(true);
  });

  it('rejects script with invalid command', () => {
    const script = {
      description: 'Test',
      commands: [
        {
          step: 'not-a-number',
          entity: '',
          id: 'order-1',
          command: 'submit',
          expect: { success: true },
        },
      ],
    };

    const result = validateScript(script);
    expect(result.valid).toBe(false);
  });

  it('rejects non-object input', () => {
    const result = validateScript('not an object');
    expect(result.valid).toBe(false);
  });

  it('validates seed entities', () => {
    const script = {
      description: 'Test',
      seedEntities: [
        {
          entity: 'Order',
          id: 'order-1',
          properties: { status: 'draft' },
        },
      ],
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
  });

  it('parseScript throws on invalid input', () => {
    expect(() => parseScript({ bad: true })).toThrow('Invalid test script');
  });

  it('parseScript returns valid script', () => {
    const script = {
      description: 'Test',
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

    const parsed = parseScript(script);
    expect(parsed.description).toBe('Test');
    expect(parsed.commands).toHaveLength(1);
  });
});

describe('Output Formatter', () => {
  const sampleResult: ExecutionResult = {
    harness: {
      version: '1.0.0',
      executedAt: '2025-01-01T00:00:00.000Z',
    },
    source: {
      type: 'ir',
      path: '/test/path.ir.json',
    },
    script: {
      path: '/test/script.json',
      description: 'Test output',
    },
    execution: {
      context: {},
      steps: [
        {
          step: 1,
          command: {
            entity: 'Order',
            id: 'order-1',
            name: 'submit',
            params: {},
          },
          result: {
            success: true,
            entityStateAfter: { status: 'submitted' },
          },
          assertions: {
            passed: 1,
            failed: 0,
            details: [
              {
                check: 'success',
                expected: true,
                actual: true,
                passed: true,
              },
            ],
          },
        },
      ],
    },
    summary: {
      totalSteps: 1,
      passed: 1,
      failed: 0,
      assertionsPassed: 1,
      assertionsFailed: 0,
    },
  };

  it('produces valid JSON output', () => {
    const output = formatOutput(sampleResult);
    const parsed = JSON.parse(output);
    expect(parsed).toBeDefined();
  });

  it('sorts keys deterministically', () => {
    const output = formatOutput(sampleResult);
    const keys = Object.keys(JSON.parse(output) as Record<string, unknown>);
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
  });

  it('strips volatile fields for snapshots', () => {
    const stripped = stripVolatileFields(sampleResult);
    expect(stripped.harness.executedAt).toBe('[TIMESTAMP]');
    expect(stripped.harness.version).toBe('1.0.0');
  });

  it('formatForSnapshot produces stable output', () => {
    const output1 = formatForSnapshot(sampleResult);
    const output2 = formatForSnapshot(sampleResult);
    expect(output1).toBe(output2);
  });
});
