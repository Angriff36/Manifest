/**
 * Runtime Engine expression evaluation (TypeScript path).
 *
 * ~~Historically also covered a RuntimeOptions.wasmEvaluator seam.~~
 * **Correction (2026-07-15):** WASM was removed from RuntimeOptions / the
 * default engine path (never shipped a `.wasm` artifact). These tests keep
 * the TypeScript evaluator coverage that remains.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { RuntimeEngine, type RuntimeContext } from './runtime-engine';
import type { IR, IRExpression } from './ir';

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

describe('RuntimeEngine expression evaluation (TypeScript)', () => {
  describe('Basic evaluation', () => {
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

  describe('Repeated evaluation on one engine', () => {
    let engine: RuntimeEngine;

    beforeEach(() => {
      engine = new RuntimeEngine(createTestIR(), {}, { now: () => 1234567890 });
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
    it('should evaluate constraints correctly', async () => {
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

    it('should evaluate failWhen=true constraints with negative polarity', async () => {
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
            name: 'hasErrorCheck',
            code: 'hasErrorCheck',
            expression: ident('hasError'),
            severity: 'warn',
            failWhen: true,
          },
        ],
        policies: [],
      });

      const failed = await engine.checkConstraints('TestEntity', { hasError: true });
      expect(failed).toHaveLength(1);

      const passed = await engine.checkConstraints('TestEntity', { hasError: false });
      expect(passed).toEqual([]);
    });
  });
});

describe('RuntimeContext in expression evaluation', () => {
  it('should pass user context through to expression evaluation', async () => {
    const ir = createTestIR();
    const context: RuntimeContext = {
      user: { id: 'user-1', role: 'admin' },
      tenantId: 'tenant-1',
    };
    const engine = new RuntimeEngine(ir, context, { now: () => 1234567890 });

    const result = await engine.evaluateExpression(ident('user'), {
      user: { id: 'user-1', role: 'admin' },
    });
    expect(result).toEqual({ id: 'user-1', role: 'admin' });
  });
});
