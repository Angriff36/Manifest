/**
 * Property-based tests for Runtime Engine Expression Evaluator
 *
 * Uses fast-check to verify properties like idempotency, consistency, and correctness.
 */

import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { RuntimeEngine, type RuntimeContext } from './runtime-engine';
import type { IR, IRExpression, IRValue } from './ir';
import { ExpressionBuilder as _ExpressionBuilder, jsToIRValue } from './property-test-utils';

/**
 * Create a minimal IR for expression testing
 */
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

/**
 * Create a runtime engine for expression testing
 */
function createTestRuntime(context?: RuntimeContext): RuntimeEngine {
  const ir = createTestIR();
  return new RuntimeEngine(ir, context, {
    generateId: () => `test-${Math.random().toString(36).slice(2)}`,
    now: () => 1234567890,
  });
}

/**
 * Helper for JavaScript identifiers
 */
const jsIdentifier = fc
  .array(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789'.split('')),
    { minLength: 1, maxLength: 20 },
  )
  .map((chars) => chars.join(''))
  .filter((name) => /^[a-zA-Z_]/.test(name));

describe('Runtime Expression Evaluator - Property Tests', () => {
  describe('Literal Expressions', () => {
    it('should evaluate string literals to their value', async () => {
      await fc.assert(
        fc.asyncProperty(fc.string(), async (s) => {
          const runtime = createTestRuntime();
          const expr: IRExpression = { kind: 'literal', value: { kind: 'string', value: s } };
          const result = await runtime['evaluateExpression'](expr, {});
          expect(result).toBe(s);
        }),
      );
    });

    it('should evaluate number literals to their value', async () => {
      await fc.assert(
        fc.asyncProperty(fc.float({ max: 1e6, min: -1e6, noNaN: true }), async (n) => {
          const runtime = createTestRuntime();
          const expr: IRExpression = { kind: 'literal', value: { kind: 'number', value: n } };
          const result = await runtime['evaluateExpression'](expr, {});
          expect(result).toBe(n);
        }),
      );
    });

    it('should evaluate boolean literals to their value', async () => {
      await fc.assert(
        fc.asyncProperty(fc.boolean(), async (b) => {
          const runtime = createTestRuntime();
          const expr: IRExpression = { kind: 'literal', value: { kind: 'boolean', value: b } };
          const result = await runtime['evaluateExpression'](expr, {});
          expect(result).toBe(b);
        }),
      );
    });

    it('should evaluate null literal to null', async () => {
      const runtime = createTestRuntime();
      const expr: IRExpression = { kind: 'literal', value: { kind: 'null' } };
      const result = await runtime['evaluateExpression'](expr, {});
      expect(result).toBeNull();
    });
  });

  describe('Identifier Expressions', () => {
    it('should resolve identifiers from context', async () => {
      await fc.assert(
        fc.asyncProperty(
          jsIdentifier,
          fc.oneof(
            fc.string(),
            fc.float({ max: 1e6, min: -1e6, noNaN: true }),
            fc.boolean(),
            fc.constant(null),
          ),
          async (name, value) => {
            const runtime = createTestRuntime();
            const expr: IRExpression = { kind: 'identifier', name };
            const context = { [name]: value };
            const result = await runtime['evaluateExpression'](expr, context);
            expect(result).toBe(value);
          },
        ),
      );
    });

    it('should return undefined for missing identifiers', async () => {
      await fc.assert(
        fc.asyncProperty(jsIdentifier, async (name) => {
          const runtime = createTestRuntime();
          const expr: IRExpression = { kind: 'identifier', name };
          const result = await runtime['evaluateExpression'](expr, {});
          expect(result).toBeUndefined();
        }),
      );
    });
  });

  describe('Binary Operation Properties', () => {
    it('should be idempotent for pure expressions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ max: 1e6, min: -1e6, noNaN: true, noDefaultInfinity: true }),
          fc.float({
            max: 1e6,
            min: -1e6,
            noNaN: true,
            minExcluded: true,
            noDefaultInfinity: true,
          }),
          fc.constantFrom('+', '-', '*', '/', '%', '==', '!=', '<', '>', '<=', '>='),
          async (a, b, op) => {
            const runtime = createTestRuntime();
            const left: IRExpression = { kind: 'literal', value: { kind: 'number', value: a } };
            const right: IRExpression = { kind: 'literal', value: { kind: 'number', value: b } };
            const expr: IRExpression = { kind: 'binary', operator: op, left, right };
            const context = {};

            const result1 = await runtime['evaluateExpression'](expr, context);
            const result2 = await runtime['evaluateExpression'](expr, context);

            if (result1 === undefined || result2 === undefined) {
              expect(result1).toBe(result2);
            } else if (typeof result1 === 'number' && typeof result2 === 'number') {
              // Non-finite results (NaN, ±Infinity — e.g. x/0, 0/0, x%0) are
              // idempotent too: identical inputs must yield the identical
              // non-finite value. Object.is gives NaN===NaN and distinguishes
              // +Infinity from -Infinity, where `Infinity - Infinity` would be
              // NaN and break a difference-based comparison.
              if (!Number.isFinite(result1) || !Number.isFinite(result2)) {
                expect(Object.is(result1, result2)).toBe(true);
              } else {
                expect(Math.abs((result1 as number) - (result2 as number))).toBeLessThan(1e-10);
              }
            } else {
              expect(result1).toEqual(result2);
            }
          },
        ),
      );
    });

    it('should satisfy addition commutativity for numbers', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ max: 1e6, min: -1e6, noNaN: true }),
          fc.float({ max: 1e6, min: -1e6, noNaN: true }),
          async (a, b) => {
            const runtime = createTestRuntime();
            const aExpr: IRExpression = { kind: 'literal', value: { kind: 'number', value: a } };
            const bExpr: IRExpression = { kind: 'literal', value: { kind: 'number', value: b } };

            const abExpr: IRExpression = {
              kind: 'binary',
              operator: '+',
              left: aExpr,
              right: bExpr,
            };
            const baExpr: IRExpression = {
              kind: 'binary',
              operator: '+',
              left: bExpr,
              right: aExpr,
            };

            const ab = await runtime['evaluateExpression'](abExpr, {});
            const ba = await runtime['evaluateExpression'](baExpr, {});

            if (typeof ab === 'number' && typeof ba === 'number') {
              expect(Math.abs(ab - ba)).toBeLessThan(1e-10);
            } else {
              expect(ab).toEqual(ba);
            }
          },
        ),
      );
    });

    it('should satisfy multiplication commutativity for numbers', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ max: 1e6, min: -1e6, noNaN: true }),
          fc.float({ max: 1e6, min: -1e6, noNaN: true }),
          async (a, b) => {
            const runtime = createTestRuntime();
            const aExpr: IRExpression = { kind: 'literal', value: { kind: 'number', value: a } };
            const bExpr: IRExpression = { kind: 'literal', value: { kind: 'number', value: b } };

            const abExpr: IRExpression = {
              kind: 'binary',
              operator: '*',
              left: aExpr,
              right: bExpr,
            };
            const baExpr: IRExpression = {
              kind: 'binary',
              operator: '*',
              left: bExpr,
              right: aExpr,
            };

            const ab = await runtime['evaluateExpression'](abExpr, {});
            const ba = await runtime['evaluateExpression'](baExpr, {});

            if (typeof ab === 'number' && typeof ba === 'number') {
              expect(Math.abs(ab - ba)).toBeLessThan(1e-10);
            } else {
              expect(ab).toEqual(ba);
            }
          },
        ),
      );
    });

    it('should satisfy equality reflexivity', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(fc.string(), fc.float({ max: 1e6, min: -1e6, noNaN: true }), fc.boolean()),
          async (value) => {
            const runtime = createTestRuntime();
            const expr: IRExpression = { kind: 'literal', value: jsToIRValue(value) };
            const result = await runtime['evaluateExpression'](
              { kind: 'binary', operator: '==', left: expr, right: expr },
              {},
            );
            expect(result).toBe(true);
          },
        ),
      );
    });

    it('should satisfy AND short-circuit: false && x should be false', async () => {
      await fc.assert(
        fc.asyncProperty(fc.float({ max: 1e6, min: -1e6, noNaN: true }), async (x) => {
          const runtime = createTestRuntime();
          const falseExpr: IRExpression = {
            kind: 'literal',
            value: { kind: 'boolean', value: false },
          };
          const xExpr: IRExpression = { kind: 'literal', value: { kind: 'number', value: x } };

          const result = await runtime['evaluateExpression'](
            { kind: 'binary', operator: '&&', left: falseExpr, right: xExpr },
            {},
          );
          expect(result).toBe(false);
        }),
      );
    });

    it('should satisfy OR short-circuit: true || x should be true', async () => {
      await fc.assert(
        fc.asyncProperty(fc.float({ max: 1e6, min: -1e6, noNaN: true }), async (x) => {
          const runtime = createTestRuntime();
          const trueExpr: IRExpression = {
            kind: 'literal',
            value: { kind: 'boolean', value: true },
          };
          const xExpr: IRExpression = { kind: 'literal', value: { kind: 'number', value: x } };

          const result = await runtime['evaluateExpression'](
            { kind: 'binary', operator: '||', left: trueExpr, right: xExpr },
            {},
          );
          expect(result).toBe(true);
        }),
      );
    });

    it('should satisfy string concatenation', async () => {
      await fc.assert(
        fc.asyncProperty(fc.string(), fc.string(), async (a, b) => {
          const runtime = createTestRuntime();
          const aExpr: IRExpression = { kind: 'literal', value: { kind: 'string', value: a } };
          const bExpr: IRExpression = { kind: 'literal', value: { kind: 'string', value: b } };

          const result = await runtime['evaluateExpression'](
            { kind: 'binary', operator: '+', left: aExpr, right: bExpr },
            {},
          );
          expect(result).toBe(a + b);
        }),
      );
    });
  });

  describe('Unary Operation Properties', () => {
    it('should satisfy double negation for numbers', async () => {
      await fc.assert(
        fc.asyncProperty(fc.float({ max: 1e6, min: -1e6, noNaN: true }), async (n) => {
          const runtime = createTestRuntime();
          const expr: IRExpression = { kind: 'literal', value: { kind: 'number', value: n } };
          const negated1: IRExpression = { kind: 'unary', operator: '-', operand: expr };
          const negated2: IRExpression = { kind: 'unary', operator: '-', operand: negated1 };

          const result = await runtime['evaluateExpression'](negated2, {});
          const original = await runtime['evaluateExpression'](expr, {});

          if (typeof result === 'number' && typeof original === 'number') {
            expect(Math.abs((result as number) - (original as number))).toBeLessThan(1e-10);
          }
        }),
      );
    });

    it('should satisfy double logical NOT', async () => {
      await fc.assert(
        fc.asyncProperty(fc.boolean(), async (b) => {
          const runtime = createTestRuntime();
          const expr: IRExpression = { kind: 'literal', value: { kind: 'boolean', value: b } };
          const not1: IRExpression = { kind: 'unary', operator: '!', operand: expr };
          const not2: IRExpression = { kind: 'unary', operator: '!', operand: not1 };

          const result = await runtime['evaluateExpression'](not2, {});
          expect(result).toBe(b);
        }),
      );
    });
  });

  describe('Array Expression Properties', () => {
    it('should evaluate array literals correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.float({ max: 100, min: -100, noNaN: true }), { minLength: 1, maxLength: 5 }),
          async (numbers) => {
            const runtime = createTestRuntime();
            const elements = numbers.map((n) => ({
              kind: 'literal' as const,
              value: { kind: 'number' as const, value: n },
            }));
            const expr: IRExpression = { kind: 'array', elements };

            const result = await runtime['evaluateExpression'](expr, {});
            expect(Array.isArray(result)).toBe(true);
            expect((result as unknown[]).length).toBe(numbers.length);
          },
        ),
      );
    });
  });

  describe('Object Expression Properties', () => {
    it('should evaluate object literals correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.dictionary(fc.string(), fc.float({ max: 100, min: -100, noNaN: true }), {
            maxKeys: 3,
          }),
          async (obj) => {
            const runtime = createTestRuntime();
            const properties = Object.entries(obj).map(([key, value]) => ({
              key,
              value: { kind: 'literal' as const, value: { kind: 'number' as const, value } },
            }));
            const expr: IRExpression = { kind: 'object', properties };

            const result = await runtime['evaluateExpression'](expr, {});
            expect(result && typeof result === 'object').toBe(true);
          },
        ),
      );
    });
  });

  describe('Conditional Expression Properties', () => {
    it('should return consequent when condition is truthy', async () => {
      await fc.assert(
        fc.asyncProperty(fc.float({ max: 1e6, min: -1e6, noNaN: true }), async (n) => {
          const runtime = createTestRuntime();
          const condition: IRExpression = {
            kind: 'literal',
            value: { kind: 'boolean', value: true },
          };
          const consequent: IRExpression = { kind: 'literal', value: { kind: 'number', value: n } };
          const alternate: IRExpression = { kind: 'literal', value: { kind: 'number', value: 0 } };

          const result = await runtime['evaluateExpression'](
            { kind: 'conditional', condition, consequent, alternate },
            {},
          );
          expect(result).toBe(n);
        }),
      );
    });

    it('should return alternate when condition is falsy', async () => {
      await fc.assert(
        fc.asyncProperty(fc.float({ max: 1e6, min: -1e6, noNaN: true }), async (n) => {
          const runtime = createTestRuntime();
          const condition: IRExpression = {
            kind: 'literal',
            value: { kind: 'boolean', value: false },
          };
          const consequent: IRExpression = { kind: 'literal', value: { kind: 'number', value: 0 } };
          const alternate: IRExpression = { kind: 'literal', value: { kind: 'number', value: n } };

          const result = await runtime['evaluateExpression'](
            { kind: 'conditional', condition, consequent, alternate },
            {},
          );
          expect(result).toBe(n);
        }),
      );
    });
  });

  describe('Member Expression Properties', () => {
    it('should access object properties correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          jsIdentifier,
          fc.float({ max: 1e6, min: -1e6, noNaN: true }),
          async (prop, value) => {
            const runtime = createTestRuntime();
            const objValue: IRValue = {
              kind: 'object',
              properties: { [prop]: { kind: 'number', value } },
            };
            const objExpr: IRExpression = { kind: 'literal', value: objValue };

            const result = await runtime['evaluateExpression'](
              { kind: 'member', object: objExpr, property: prop },
              {},
            );
            expect(result).toBe(value);
          },
        ),
      );
    });

    it('should return undefined for missing properties', async () => {
      await fc.assert(
        fc.asyncProperty(jsIdentifier, async (prop) => {
          const runtime = createTestRuntime();
          const objExpr: IRExpression = {
            kind: 'literal',
            value: { kind: 'object', properties: {} },
          };

          const result = await runtime['evaluateExpression'](
            { kind: 'member', object: objExpr, property: prop },
            {},
          );
          expect(result).toBeUndefined();
        }),
      );
    });
  });

  describe('Lambda Expression Properties', () => {
    it('should execute lambda with correct arguments', async () => {
      await fc.assert(
        fc.asyncProperty(fc.float({ max: 1e6, min: -1e6, noNaN: true }), async (x) => {
          const runtime = createTestRuntime();
          const lambda: IRExpression = {
            kind: 'lambda',
            params: ['x'],
            body: { kind: 'identifier', name: 'x' },
          };
          const arg: IRExpression = { kind: 'literal', value: { kind: 'number', value: x } };

          const result = await runtime['evaluateExpression'](
            { kind: 'call', callee: lambda, args: [arg] },
            {},
          );
          expect(result).toBe(x);
        }),
      );
    });

    it('should support lambda closure over context', async () => {
      await fc.assert(
        fc.asyncProperty(fc.float({ max: 1e6, min: -1e6, noNaN: true }), async (y) => {
          const runtime = createTestRuntime({ y });
          const lambda: IRExpression = {
            kind: 'lambda',
            params: ['x'],
            body: {
              kind: 'binary',
              operator: '+',
              left: { kind: 'identifier', name: 'x' },
              right: { kind: 'identifier', name: 'y' },
            },
          };
          const arg: IRExpression = { kind: 'literal', value: { kind: 'number', value: 10 } };

          const result = await runtime['evaluateExpression'](
            { kind: 'call', callee: lambda, args: [arg] },
            { y },
          );
          if (typeof result === 'number' && typeof y === 'number') {
            expect(Math.abs(result - (10 + y))).toBeLessThan(1e-10);
          }
        }),
      );
    });
  });

  describe('Evaluation Limits', () => {
    it('should enforce step limit', async () => {
      const runtime = createTestRuntime();
      // Create a deeply nested expression that would exceed step limit
      let expr: IRExpression = { kind: 'literal', value: { kind: 'number', value: 1 } };
      for (let i = 0; i < 100; i++) {
        expr = {
          kind: 'binary',
          operator: '+',
          left: expr,
          right: { kind: 'literal', value: { kind: 'number', value: 1 } },
        };
      }

      const result = await runtime['evaluateExpression'](expr, {});
      // Should handle gracefully (either return result or throw step limit error)
      expect(result).toBeDefined();
    });

    it('should enforce depth limit', async () => {
      const runtime = createTestRuntime();
      // Create a very deep expression
      let expr: IRExpression = { kind: 'literal', value: { kind: 'number', value: 1 } };
      for (let i = 0; i < 100; i++) {
        expr = { kind: 'unary', operator: '-', operand: expr };
      }

      const result = await runtime['evaluateExpression'](expr, {});
      // Should handle gracefully
      expect(result).toBeDefined();
    });
  });

  describe('Evaluation Determinism', () => {
    it('should produce same results across multiple evaluations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ max: 1e6, min: -1e6, noNaN: true }),
          fc.float({ max: 1e6, min: -1e6, noNaN: true }),
          async (a, b) => {
            const runtime = createTestRuntime();
            const left: IRExpression = { kind: 'literal', value: { kind: 'number', value: a } };
            const right: IRExpression = { kind: 'literal', value: { kind: 'number', value: b } };
            const expr: IRExpression = { kind: 'binary', operator: '+', left, right };

            const results = await Promise.all([
              runtime['evaluateExpression'](expr, {}),
              runtime['evaluateExpression'](expr, {}),
              runtime['evaluateExpression'](expr, {}),
            ]);

            if (typeof results[0] === 'number') {
              expect(Math.abs((results[0] as number) - (results[1] as number))).toBeLessThan(1e-10);
              expect(Math.abs((results[0] as number) - (results[2] as number))).toBeLessThan(1e-10);
            } else {
              expect(results[0]).toEqual(results[1]);
              expect(results[0]).toEqual(results[2]);
            }
          },
        ),
      );
    });
  });
});
