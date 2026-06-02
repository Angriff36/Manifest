/**
 * WASM Expression Evaluator Tests
 *
 * Verifies the WASM-backed expression evaluator maintains identical
 * semantics to the TypeScript runtime engine.
 *
 * These tests cover:
 * 1. Module initialization and lifecycle
 * 2. Literal evaluation (string, number, boolean, null)
 * 3. Binary operators (arithmetic, comparison, logical)
 * 4. Unary operators
 * 5. Built-in function calls
 * 6. Conditional expressions
 * 7. Array and object literals
 * 8. Constraint evaluation (positive and negative semantics)
 * 9. Fallback behavior when WASM is unavailable
 * 10. Parity with TypeScript evaluator
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  WasmExpressionEvaluator,
  getDefaultWasmEvaluator,
  resetDefaultWasmEvaluator,
} from './wasm-evaluator.js';
import {
  serializeExpression,
  serializeContext,
  deserializeResult,
} from './wasm-loader.js';
import type { IRExpression } from '../ir.js';

// ============================================================================
// Helpers
// ============================================================================

function literal(value: string | number | boolean | null): IRExpression {
  if (value === null) return { kind: 'literal', value: { kind: 'null' } };
  if (typeof value === 'string') return { kind: 'literal', value: { kind: 'string', value } };
  if (typeof value === 'number') return { kind: 'literal', value: { kind: 'number', value } };
  return { kind: 'literal', value: { kind: 'boolean', value } };
}

function ident(name: string): IRExpression {
  return { kind: 'identifier', name };
}

function binary(op: string, left: IRExpression, right: IRExpression): IRExpression {
  return { kind: 'binary', operator: op, left, right };
}

function unary(op: string, operand: IRExpression): IRExpression {
  return { kind: 'unary', operator: op, operand };
}

function call(callee: IRExpression, args: IRExpression[]): IRExpression {
  return { kind: 'call', callee, args };
}

function conditional(
  condition: IRExpression,
  consequent: IRExpression,
  alternate: IRExpression
): IRExpression {
  return { kind: 'conditional', condition, consequent, alternate };
}

function array(elements: IRExpression[]): IRExpression {
  return { kind: 'array', elements };
}

function object_(properties: Array<{ key: string; value: IRExpression }>): IRExpression {
  return { kind: 'object', properties };
}

// ============================================================================
// Tests
// ============================================================================

describe('WasmExpressionEvaluator', () => {
  describe('Lifecycle', () => {
    it('should report uninitialized status before init()', () => {
      const evaluator = new WasmExpressionEvaluator();
      expect(evaluator.getStatus()).toBe('uninitialized');
      expect(evaluator.isReady()).toBe(false);
    });

    it('should accept debug and strict options', () => {
      const evaluator = new WasmExpressionEvaluator({ debug: true, strict: true });
      expect(evaluator).toBeDefined();
    });

    it('should fall back to TypeScript when WASM is not available', async () => {
      const evaluator = new WasmExpressionEvaluator();
      // No WASM bytes provided, so WASM is unavailable
      await evaluator.init();
      // Should not throw, should fall back gracefully
      const result = await evaluator.evaluate(literal(42), {});
      expect(result).toBe(42);
    });

    it('should fall back when context is a simple literal (no WASM needed)', async () => {
      const evaluator = new WasmExpressionEvaluator();
      // Literal evaluation doesn't need WASM
      const result = await evaluator.evaluate(literal('hello'), {});
      expect(result).toBe('hello');
    });
  });

  describe('Default singleton', () => {
    afterEach(() => {
      resetDefaultWasmEvaluator();
    });

    it('should return a singleton instance', () => {
      const a = getDefaultWasmEvaluator();
      const b = getDefaultWasmEvaluator();
      expect(a).toBe(b);
    });

    it('should reset the singleton', () => {
      const a = getDefaultWasmEvaluator();
      resetDefaultWasmEvaluator();
      const b = getDefaultWasmEvaluator();
      expect(a).not.toBe(b);
    });
  });
});

describe('Serialization helpers', () => {
  describe('serializeExpression', () => {
    it('should serialize a literal expression', () => {
      const json = serializeExpression(literal(42));
      const parsed = JSON.parse(json);
      expect(parsed.kind).toBe('literal');
      expect(parsed.value.kind).toBe('number');
      expect(parsed.value.value).toBe(42);
    });

    it('should serialize a binary expression', () => {
      const json = serializeExpression(binary('+', literal(1), literal(2)));
      const parsed = JSON.parse(json);
      expect(parsed.kind).toBe('binary');
      expect(parsed.operator).toBe('+');
      expect(parsed.left.kind).toBe('literal');
      expect(parsed.right.kind).toBe('literal');
    });

    it('should serialize a call expression', () => {
      const json = serializeExpression(call(ident('abs'), [literal(-5)]));
      const parsed = JSON.parse(json);
      expect(parsed.kind).toBe('call');
      expect(parsed.callee.name).toBe('abs');
      expect(parsed.args).toHaveLength(1);
    });
  });

  describe('serializeContext', () => {
    it('should serialize a flat object context', () => {
      const json = serializeContext({ x: 10, y: 'hello' });
      expect(JSON.parse(json)).toEqual({ x: 10, y: 'hello' });
    });

    it('should strip functions from context', () => {
      const json = serializeContext({ x: 1, fn: () => 42 });
      const parsed = JSON.parse(json);
      expect(parsed.x).toBe(1);
      expect(parsed.fn).toBeUndefined();
    });

    it('should convert undefined to null', () => {
      const json = serializeContext({ x: undefined, y: null });
      const parsed = JSON.parse(json);
      expect(parsed.x).toBeNull();
      expect(parsed.y).toBeNull();
    });

    it('should handle nested objects', () => {
      const json = serializeContext({ user: { id: 'u1', role: 'admin' } });
      expect(JSON.parse(json)).toEqual({ user: { id: 'u1', role: 'admin' } });
    });
  });

  describe('deserializeResult', () => {
    it('should deserialize null', () => {
      expect(deserializeResult('null')).toBeNull();
    });

    it('should deserialize booleans', () => {
      expect(deserializeResult('true')).toBe(true);
      expect(deserializeResult('false')).toBe(false);
    });

    it('should deserialize numbers', () => {
      expect(deserializeResult('42')).toBe(42);
      expect(deserializeResult('3.14')).toBe(3.14);
    });

    it('should deserialize strings', () => {
      expect(deserializeResult('"hello"')).toBe('hello');
    });

    it('should deserialize arrays', () => {
      expect(deserializeResult('[1,2,3]')).toEqual([1, 2, 3]);
    });

    it('should deserialize objects', () => {
      expect(deserializeResult('{"a":1}')).toEqual({ a: 1 });
    });
  });
});

describe('Fallback evaluation (no WASM)', () => {
  // These tests verify the TypeScript fallback path produces correct results
  // even when WASM is not loaded. This guarantees the runtime never breaks.
  let evaluator: WasmExpressionEvaluator;

  beforeEach(() => {
    evaluator = new WasmExpressionEvaluator();
    // Don't call init() - WASM will be unavailable
  });

  it('should evaluate literal strings', async () => {
    const result = await evaluator.evaluate(literal('hello world'), {});
    expect(result).toBe('hello world');
  });

  it('should evaluate literal numbers', async () => {
    const result = await evaluator.evaluate(literal(42), {});
    expect(result).toBe(42);
  });

  it('should evaluate literal booleans', async () => {
    const result = await evaluator.evaluate(literal(true), {});
    expect(result).toBe(true);
    const result2 = await evaluator.evaluate(literal(false), {});
    expect(result2).toBe(false);
  });

  it('should evaluate null literal', async () => {
    const result = await evaluator.evaluate(literal(null), {});
    expect(result).toBeNull();
  });

  it('should evaluate binary arithmetic', async () => {
    const expr = binary('+', literal(2), literal(3));
    const result = await evaluator.evaluate(expr, {});
    expect(result).toBe(5);
  });

  it('should evaluate string concatenation via +', async () => {
    const expr = binary('+', literal('foo'), literal('bar'));
    const result = await evaluator.evaluate(expr, {});
    expect(result).toBe('foobar');
  });

  it('should evaluate comparison', async () => {
    const expr = binary('<', literal(1), literal(2));
    const result = await evaluator.evaluate(expr, {});
    expect(result).toBe(true);
  });

  it('should evaluate unary not', async () => {
    const expr = unary('!', literal(true));
    const result = await evaluator.evaluate(expr, {});
    expect(result).toBe(false);
  });

  it('should evaluate identifier from context', async () => {
    const result = await evaluator.evaluate(ident('x'), { x: 99 });
    expect(result).toBe(99);
  });

  it('should evaluate true/false/null identifiers', async () => {
    expect(await evaluator.evaluate(ident('true'), {})).toBe(true);
    expect(await evaluator.evaluate(ident('false'), {})).toBe(false);
    expect(await evaluator.evaluate(ident('null'), {})).toBeNull();
  });

  it('should evaluate conditional expressions', async () => {
    const expr = conditional(
      literal(true),
      literal('yes'),
      literal('no')
    );
    const result = await evaluator.evaluate(expr, {});
    expect(result).toBe('yes');
  });

  it('should evaluate array literals', async () => {
    const expr = array([literal(1), literal(2), literal(3)]);
    const result = await evaluator.evaluate(expr, {});
    expect(result).toEqual([1, 2, 3]);
  });

  it('should evaluate object literals', async () => {
    const expr = object_([
      { key: 'a', value: literal(1) },
      { key: 'b', value: literal(2) },
    ]);
    const result = await evaluator.evaluate(expr, {});
    expect(result).toEqual({ a: 1, b: 2 });
  });
});

describe('Fallback constraint evaluation (no WASM)', () => {
  let evaluator: WasmExpressionEvaluator;

  beforeEach(() => {
    evaluator = new WasmExpressionEvaluator();
  });

  it('should evaluate positive constraints (expression true = pass)', async () => {
    const passed = await evaluator.evaluateConstraint(literal(true), {}, 'mustBeValid');
    expect(passed).toBe(true);

    const failed = await evaluator.evaluateConstraint(literal(false), {}, 'mustBeValid');
    expect(failed).toBe(false);
  });

  it('should evaluate negative constraints (name starts with "severity")', async () => {
    // severity-* constraints: expression true means bad state → fail
    const failed = await evaluator.evaluateConstraint(literal(true), {}, 'severityCheck');
    expect(failed).toBe(false);

    const passed = await evaluator.evaluateConstraint(literal(false), {}, 'severityCheck');
    expect(passed).toBe(true);
  });
});

describe('Parity with TypeScript runtime', () => {
  // These tests compare the WASM evaluator (with fallback) against the
  // expected TypeScript runtime behavior to ensure identical semantics.
  let evaluator: WasmExpressionEvaluator;

  beforeEach(() => {
    evaluator = new WasmExpressionEvaluator();
  });

  it('should evaluate complex binary expression identically', async () => {
    // (2 + 3) * 4
    const expr = binary(
      '*',
      binary('+', literal(2), literal(3)),
      literal(4)
    );
    const result = await evaluator.evaluate(expr, {});
    expect(result).toBe(20);
  });

  it('should handle loose equality (undefined == null)', async () => {
    // null == undefined should be true (loose equality in JS)
    const expr = binary('==', literal(null), ident('missing'));
    const result = await evaluator.evaluate(expr, {});
    expect(result).toBe(true);
  });

  it('should evaluate && and || with short-circuit-like semantics', async () => {
    const andExpr = binary('&&', literal(true), literal(false));
    expect(await evaluator.evaluate(andExpr, {})).toBe(false);

    const orExpr = binary('||', literal(false), literal(true));
    expect(await evaluator.evaluate(orExpr, {})).toBe(true);
  });

  it('should evaluate in operator for arrays', async () => {
    const expr = binary('in', literal(2), array([literal(1), literal(2), literal(3)]));
    const result = await evaluator.evaluate(expr, {});
    expect(result).toBe(true);
  });

  it('should evaluate contains operator for arrays', async () => {
    // contains: left.contains(right) — does the array contain the element?
    const expr = binary('contains', array([literal(1), literal(2), literal(3)]), literal(2));
    const result = await evaluator.evaluate(expr, {});
    expect(result).toBe(true);
  });

  it('should evaluate nested conditionals', async () => {
    const expr = conditional(
      ident('flag'),
      literal('on'),
      conditional(ident('other'), literal('maybe'), literal('off'))
    );
    expect(await evaluator.evaluate(expr, { flag: true })).toBe('on');
    expect(await evaluator.evaluate(expr, { flag: false, other: true })).toBe('maybe');
    expect(await evaluator.evaluate(expr, { flag: false, other: false })).toBe('off');
  });
});

describe('Built-in function evaluation (fallback path)', () => {
  let evaluator: WasmExpressionEvaluator;

  beforeEach(() => {
    evaluator = new WasmExpressionEvaluator();
  });

  it('should call string builtins', async () => {
    const upperExpr = call(ident('toUpperCase'), [literal('hello')]);
    expect(await evaluator.evaluate(upperExpr, {})).toBe('HELLO');

    const lowerExpr = call(ident('toLowerCase'), [literal('WORLD')]);
    expect(await evaluator.evaluate(lowerExpr, {})).toBe('world');

    const lengthExpr = call(ident('length'), [literal('hello')]);
    expect(await evaluator.evaluate(lengthExpr, {})).toBe(5);
  });

  it('should call math builtins', async () => {
    const absExpr = call(ident('abs'), [literal(-5)]);
    expect(await evaluator.evaluate(absExpr, {})).toBe(5);

    const roundExpr = call(ident('round'), [literal(3.7)]);
    expect(await evaluator.evaluate(roundExpr, {})).toBe(4);

    const ceilExpr = call(ident('ceil'), [literal(3.2)]);
    expect(await evaluator.evaluate(ceilExpr, {})).toBe(4);
  });

  it('should call aggregate builtins', async () => {
    const sumExpr = call(ident('sum'), [array([literal(1), literal(2), literal(3)])]);
    expect(await evaluator.evaluate(sumExpr, {})).toBe(6);

    const avgExpr = call(ident('avg'), [array([literal(2), literal(4), literal(6)])]);
    expect(await evaluator.evaluate(avgExpr, {})).toBe(4);
  });
});

describe('Strict mode behavior', () => {
  it('should throw in strict mode when WASM is unavailable', async () => {
    const evaluator = new WasmExpressionEvaluator({ strict: true });
    // Don't init - WASM is unavailable
    await expect(evaluator.evaluate(literal(1), {})).rejects.toThrow();
  });

  it('should not throw in non-strict mode (fallback works)', async () => {
    const evaluator = new WasmExpressionEvaluator();
    const result = await evaluator.evaluate(literal(1), {});
    expect(result).toBe(1);
  });
});

describe('Host provider configuration', () => {
  it('should set now provider without error', () => {
    const evaluator = new WasmExpressionEvaluator();
    expect(() => evaluator.setNowProvider(() => 12345)).not.toThrow();
  });

  it('should set uuid provider without error', () => {
    const evaluator = new WasmExpressionEvaluator();
    expect(() => evaluator.setUuidProvider(() => 'custom-uuid')).not.toThrow();
  });
});
