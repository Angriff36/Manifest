import { describe, it, expect } from 'vitest';
import { normalizeCommandResult } from './api-diagnostics.js';
import type { CommandResult } from './runtime-engine.js';

describe('normalizeCommandResult', () => {
  it('should normalize successful result with data and events', () => {
    const result: CommandResult = {
      success: true,
      result: { id: '123', name: 'Test' },
      emittedEvents: [
        {
          name: 'Created',
          channel: 'test.created',
          payload: {},
          timestamp: 1000000000000,
        },
      ],
    };

    const normalized = normalizeCommandResult('TestEntity', 'create', result);

    expect(normalized.success).toBe(true);
    expect(normalized.data).toEqual({ id: '123', name: 'Test' });
    expect(normalized.events).toHaveLength(1);
    expect(normalized.events[0].name).toBe('Created');
    expect(normalized.diagnostics).toBeUndefined();
  });

  it('should include constraint warnings in successful result', () => {
    const result: CommandResult = {
      success: true,
      result: { id: '123' },
      emittedEvents: [],
      constraintOutcomes: [
        {
          code: 'WARN_001',
          constraintName: 'test_warning',
          severity: 'warn',
          formatted: 'value > 100',
          message: 'Value exceeds recommended limit',
          passed: false,
          resolved: [{ expression: 'value', value: 150 }],
          details: { threshold: 100 },
        },
      ],
    };

    const normalized = normalizeCommandResult('TestEntity', 'update', result);

    expect(normalized.success).toBe(true);
    expect(normalized.diagnostics).toHaveLength(1);
    expect(normalized.diagnostics![0].kind).toBe('constraint_warn');
    expect(normalized.diagnostics![0].ruleName).toBe('WARN_001');
    expect(normalized.diagnostics![0].message).toBe('Value exceeds recommended limit');
  });

  it('should normalize guard failure', () => {
    const result: CommandResult = {
      success: false,
      error: "Guard condition failed for command 'update'",
      guardFailure: {
        index: 2,
        expression: { kind: 'binary', operator: '!=', left: { kind: 'identifier', name: 'status' }, right: { kind: 'literal', value: { kind: 'string', value: 'completed' } } },
        formatted: 'status != "completed"',
        resolved: [
          { expression: 'status', value: 'completed' },
        ],
      },
      emittedEvents: [],
    };

    const normalized = normalizeCommandResult('Task', 'update', result);

    expect(normalized.success).toBe(false);
    expect(normalized.error).toBe("Guard condition failed for command 'update'");
    expect(normalized.diagnostics).toHaveLength(1);
    expect(normalized.diagnostics![0].kind).toBe('guard_failure');
    expect(normalized.diagnostics![0].entity).toBe('Task');
    expect(normalized.diagnostics![0].command).toBe('update');
    expect(normalized.diagnostics![0].ruleName).toBe('guard[2]');
    expect(normalized.diagnostics![0].message).toBe('status != "completed"');
    expect(normalized.diagnostics![0].resolved).toHaveLength(1);
    expect(normalized.diagnostics![0].resolved![0].expression).toBe('status');
    expect(normalized.diagnostics![0].resolved![0].value).toBe('completed');
  });

  it('should normalize policy denial', () => {
    const result: CommandResult = {
      success: false,
      error: 'Policy denied',
      policyDenial: {
        policyName: 'AdminOnly',
        expression: { kind: 'binary', operator: '==', left: { kind: 'member', object: { kind: 'identifier', name: 'user' }, property: 'role' }, right: { kind: 'literal', value: { kind: 'string', value: 'admin' } } },
        formatted: 'user.role == "admin"',
        message: 'Only administrators can perform this action',
        contextKeys: ['user.role'],
        resolved: [
          { expression: 'user.role', value: 'user' },
        ],
      },
      emittedEvents: [],
    };

    const normalized = normalizeCommandResult('User', 'delete', result);

    expect(normalized.success).toBe(false);
    expect(normalized.diagnostics).toHaveLength(1);
    expect(normalized.diagnostics![0].kind).toBe('policy_denial');
    expect(normalized.diagnostics![0].entity).toBe('User');
    expect(normalized.diagnostics![0].command).toBe('delete');
    expect(normalized.diagnostics![0].ruleName).toBe('AdminOnly');
    expect(normalized.diagnostics![0].message).toBe('Only administrators can perform this action');
    expect(normalized.diagnostics![0].resolved).toHaveLength(1);
  });

  it('should normalize constraint block', () => {
    const result: CommandResult = {
      success: false,
      error: 'Constraint violation',
      constraintOutcomes: [
        {
          code: 'BLOCK_001',
          constraintName: 'max_quantity',
          severity: 'block',
          formatted: 'quantity <= 1000',
          message: 'Quantity exceeds maximum allowed',
          passed: false,
          resolved: [{ expression: 'quantity', value: 1500 }],
          details: { max: 1000, actual: 1500 },
        },
      ],
      emittedEvents: [],
    };

    const normalized = normalizeCommandResult('Order', 'create', result);

    expect(normalized.success).toBe(false);
    expect(normalized.diagnostics).toHaveLength(1);
    expect(normalized.diagnostics![0].kind).toBe('constraint_block');
    expect(normalized.diagnostics![0].entity).toBe('Order');
    expect(normalized.diagnostics![0].command).toBe('create');
    expect(normalized.diagnostics![0].ruleName).toBe('BLOCK_001');
    expect(normalized.diagnostics![0].message).toBe('Quantity exceeds maximum allowed');
    expect(normalized.diagnostics![0].details).toEqual({ max: 1000, actual: 1500 });
  });

  it('should normalize generic runtime error', () => {
    const result: CommandResult = {
      success: false,
      error: 'Database connection failed',
      emittedEvents: [],
    };

    const normalized = normalizeCommandResult('Product', 'update', result);

    expect(normalized.success).toBe(false);
    expect(normalized.error).toBe('Database connection failed');
    expect(normalized.diagnostics).toHaveLength(1);
    expect(normalized.diagnostics![0].kind).toBe('runtime_error');
    expect(normalized.diagnostics![0].entity).toBe('Product');
    expect(normalized.diagnostics![0].command).toBe('update');
    expect(normalized.diagnostics![0].message).toBe('Database connection failed');
  });

  it('should handle multiple constraint blocks', () => {
    const result: CommandResult = {
      success: false,
      error: 'Multiple constraint violations',
      constraintOutcomes: [
        {
          code: 'BLOCK_001',
          constraintName: 'min_price',
          severity: 'block',
          formatted: 'price >= 0',
          passed: false,
        },
        {
          code: 'BLOCK_002',
          constraintName: 'max_price',
          severity: 'block',
          formatted: 'price <= 10000',
          passed: false,
        },
      ],
      emittedEvents: [],
    };

    const normalized = normalizeCommandResult('Product', 'create', result);

    expect(normalized.success).toBe(false);
    expect(normalized.diagnostics).toHaveLength(2);
    expect(normalized.diagnostics![0].kind).toBe('constraint_block');
    expect(normalized.diagnostics![0].ruleName).toBe('BLOCK_001');
    expect(normalized.diagnostics![1].kind).toBe('constraint_block');
    expect(normalized.diagnostics![1].ruleName).toBe('BLOCK_002');
  });

  it('should preserve events even on failure', () => {
    const result: CommandResult = {
      success: false,
      error: 'Guard failed',
      guardFailure: {
        index: 1,
        expression: { kind: 'literal', value: { kind: 'boolean', value: false } },
        formatted: 'false',
      },
      emittedEvents: [
        {
          name: 'OverrideApplied',
          channel: 'system.override',
          payload: {},
          timestamp: 1000000000000,
        },
      ],
    };

    const normalized = normalizeCommandResult('Test', 'action', result);

    expect(normalized.success).toBe(false);
    expect(normalized.events).toHaveLength(1);
    expect(normalized.events[0].name).toBe('OverrideApplied');
  });
});
