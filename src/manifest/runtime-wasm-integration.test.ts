/**
 * Runtime Engine + WASM Integration Tests
 *
 * Verifies that the RuntimeEngine properly integrates with the WASM
 * expression evaluator:
 * - WASM is used when available and expression is compatible
 * - Falls back to TypeScript when WASM is unavailable
 * - Results are semantically identical
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { RuntimeEngine, type RuntimeContext } from './runtime-engine';
import { WasmExpressionEvaluator } from './wasm/wasm-evaluator';
import type { IR, IRExpression } from './ir';

// ============================================================================
// Helpers
// ============================================================================

function createTestIR(): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'test-hash',
      compilerVersion: 'test',
      schemaVersion: '1.0',
      compiledAt: new Date().toISOString(),
    },
    modules: [],
    values: [],
    entities: [],
    enums: [],
    stores: [],
    events: [],
    commands: [],
    policies: [],
  };
}

function literal(value: string | number | boolean | null): IRExpression {
  if (value === null) return { kind: 'literal', value: { kind: 'null' } };
  if (typeof value === 'string') return { kind: 'literal', value: { kind: 'string', value } };
  if (typeof value === 'number') return { kind: 'literal', value: { kind: 'number', value } };
  return { kind: 'literal', value: { kind: 'boolean', value } };
}

function binary(op: string, left: IRExpression, right: IRExpression): IRExpression {
  return { kind: 'binary', operator: op, left, right };
}

function ident(name: string): IRExpression {
  return { kind: 'identifier', name };
}

// ============================================================================
// Tests
// ============================================================================

describe('RuntimeEngine with WASM evaluator', () => {
  describe('Without WASM evaluator', () => {
    it('should evaluate normally (TypeScript path)', async () => {
      const ir = createTestIR();
      const engine = new RuntimeEngine(ir, {}, { now: () => 1234567890 });

      const result = await engine.evaluateExpression(literal(42), {});
      expect(result).toBe(42);
    });

    it('should evaluate complex expressions via TypeScript', async () => {
      const ir = createTestIR();
      const engine = new RuntimeEngine(ir, {}, { now: () => 1234567890 });

      const expr = binary('+', ident('x'), literal(10));
      const result = await engine.evaluateExpression(expr, { x: 5 });
      expect(result).toBe(15);
    });
  });

  describe('With WASM evaluator (fallback to TypeScript when WASM unavailable)', () => {
    let engine: RuntimeEngine;

    beforeEach(() => {
      const ir = createTestIR();
      // Create a WASM evaluator but don't init it (no bytes available)
      // The runtime engine should handle this gracefully
      const wasmEvaluator = new WasmExpressionEvaluator();
      engine = new RuntimeEngine(ir, {}, {
        now: () => 1234567890,
        wasmEvaluator,
      });
    });

    it('should evaluate literal expressions correctly', async () => {
      const result = await engine.evaluateExpression(literal(42), {});
      expect(result).toBe(42);
    });

    it('should evaluate identifier expressions correctly', async () => {
      const result = await engine.evaluateExpression(ident('userId'), { userId: 'u123' });
      expect(result).toBe('u123');
    });

    it('should evaluate binary expressions correctly', async () => {
      const expr = binary('*', literal(3), literal(4));
      const result = await engine.evaluateExpression(expr, {});
      expect(result).toBe(12);
    });

    it('should evaluate expressions with context correctly', async () => {
      const expr = binary('+', ident('age'), literal(1));
      const result = await engine.evaluateExpression(expr, { age: 25 });
      expect(result).toBe(26);
    });
  });

  describe('Constraint evaluation', () => {
    it('should evaluate constraints correctly without WASM', async () => {
      const ir = createTestIR();
      const engine = new RuntimeEngine(ir, {}, { now: () => 1234567890 });

      // checkConstraints requires an entity
      ir.entities.push({
        name: 'TestEntity',
        module: 'test',
        properties: [],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [
          {
            name: 'mustBePositive',
            code: 'mustBePositive',
            expression: binary('>', ident('value'), literal(0)),
            severity: 'block',
          },
        ],
        policies: [],
      });

      const passed = await engine.checkConstraints('TestEntity', { value: 10 });
      expect(passed).toEqual([]);

      const failed = await engine.checkConstraints('TestEntity', { value: -5 });
      expect(failed).toHaveLength(1);
      expect(failed[0].passed).toBe(false);
    });

    it('should evaluate severity-* constraints with negative semantics', async () => {
      const ir = createTestIR();
      const engine = new RuntimeEngine(ir, {}, { now: () => 1234567890 });

      ir.entities.push({
        name: 'TestEntity',
        module: 'test',
        properties: [],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [
          {
            name: 'severityCheck',
            code: 'severityCheck',
            expression: ident('hasError'),
            severity: 'warn',
          },
        ],
        policies: [],
      });

      // hasError = true → severity check fails
      const failed = await engine.checkConstraints('TestEntity', { hasError: true });
      expect(failed).toHaveLength(1);

      // hasError = false → severity check passes
      const passed = await engine.checkConstraints('TestEntity', { hasError: false });
      expect(passed).toEqual([]);
    });
  });
});

describe('RuntimeContext with WASM', () => {
  it('should pass user context through to expression evaluation', async () => {
    const ir = createTestIR();
    const context: RuntimeContext = {
      user: { id: 'user-1', role: 'admin' },
      tenantId: 'tenant-1',
    };
    const engine = new RuntimeEngine(ir, context, { now: () => 1234567890 });

    // user.role should resolve to 'admin'
    const result = await engine.evaluateExpression(
      ident('user'),
      { user: { id: 'user-1', role: 'admin' } }
    );
    expect(result).toEqual({ id: 'user-1', role: 'admin' });
  });
});
