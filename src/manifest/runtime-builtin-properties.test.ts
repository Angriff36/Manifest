/**
 * Property-based tests for Runtime Engine Built-in Functions
 *
 * Uses fast-check to verify properties of built-in functions like
 * string operations, math functions, and array operations.
 */

import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { RuntimeEngine } from './runtime-engine';
import type { IR, IRExpression, IRValue } from './ir';

/**
 * Create a minimal IR for builtin testing
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
 * Helper to create a runtime engine
 */
function createTestRuntime() {
  const ir = createTestIR();
  return new RuntimeEngine(
    ir,
    {},
    {
      generateId: () => `test-${Math.random().toString(36).slice(2)}`,
      now: () => 1234567890,
    },
  );
}

/**
 * Helper to convert JavaScript value to IR literal value
 */
function jsToIRValue(value: unknown): { kind: string; value?: unknown; elements?: unknown[] } {
  if (value === null) return { kind: 'null', value: null };
  if (typeof value === 'number') return { kind: 'number', value };
  if (typeof value === 'string') return { kind: 'string', value };
  if (typeof value === 'boolean') return { kind: 'boolean', value };
  if (Array.isArray(value)) {
    return { kind: 'array', elements: value.map((v) => jsToIRValue(v)) };
  }
  return { kind: 'null', value: null };
}

/**
 * Helper to call a builtin function via expression evaluation
 */
async function callBuiltin(name: string, args: unknown[]): Promise<unknown> {
  const runtime = createTestRuntime();
  const calleeExpr: IRExpression = { kind: 'identifier', name };
  const argExprs: IRExpression[] = args.map((arg) => ({
    kind: 'literal',
    value: jsToIRValue(arg) as IRValue,
  }));
  const callExpr: IRExpression = { kind: 'call', callee: calleeExpr, args: argExprs };
  return runtime['evaluateExpression'](callExpr, {});
}

/**
 * Helper for fast lowercase strings (a-z) - using a simple approach
 */
const lowercaseString = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')))
  .map((chars) => chars.join(''));

/**
 * Helper for fast uppercase strings (A-Z) - using a simple approach
 */
const uppercaseString = fc
  .array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')))
  .map((chars) => chars.join(''));

describe('Runtime Built-in Functions - Property Tests', () => {
  describe('String Built-ins', () => {
    describe('trim', () => {
      it('should remove leading and trailing whitespace', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.string(),
            fc.string(),
            fc.string(),
            async (prefix, middle, suffix) => {
              // Skip if middle is only whitespace or starts/ends with whitespace (would cause issues)
              if (middle.trim().length === 0 || middle.startsWith(' ') || middle.endsWith(' '))
                return;

              const whitespace = '  \t\n';
              const s = prefix + whitespace + middle + whitespace + suffix;
              const trimmed = (await callBuiltin('trim', [s])) as string;

              // Should not start or end with whitespace
              expect(trimmed.trim()).toBe(trimmed);
              // Middle should be preserved
              expect(trimmed).toContain(middle);
            },
          ),
        );
      });

      it('should be idempotent', async () => {
        await fc.assert(
          fc.asyncProperty(fc.string(), async (s) => {
            const trimmed1 = await callBuiltin('trim', [s]);
            const trimmed2 = await callBuiltin('trim', [trimmed1]);
            expect(trimmed1).toEqual(trimmed2);
          }),
        );
      });
    });

    describe('toUpperCase / toLowerCase', () => {
      it('toUpperCase should convert lowercase to uppercase', async () => {
        await fc.assert(
          fc.asyncProperty(lowercaseString, async (s) => {
            const upper = (await callBuiltin('toUpperCase', [s])) as string;
            for (const c of upper) {
              expect(c).toBe(c.toUpperCase());
            }
          }),
        );
      });

      it('toLowerCase should convert uppercase to lowercase', async () => {
        await fc.assert(
          fc.asyncProperty(uppercaseString, async (s) => {
            const lower = (await callBuiltin('toLowerCase', [s])) as string;
            for (const c of lower) {
              expect(c).toBe(c.toLowerCase());
            }
          }),
        );
      });

      it('case conversion should be idempotent', async () => {
        await fc.assert(
          fc.asyncProperty(fc.string(), async (s) => {
            const upper1 = await callBuiltin('toUpperCase', [s]);
            const upper2 = await callBuiltin('toUpperCase', [upper1]);
            expect(upper1).toEqual(upper2);

            const lower1 = await callBuiltin('toLowerCase', [s]);
            const lower2 = await callBuiltin('toLowerCase', [lower1]);
            expect(lower1).toEqual(lower2);
          }),
        );
      });
    });

    describe('startsWith / endsWith', () => {
      it('startsWith should be true for matching prefix', async () => {
        await fc.assert(
          fc.asyncProperty(fc.string(), fc.string(), async (prefix, suffix) => {
            const s = prefix + suffix;
            const result = await callBuiltin('startsWith', [s, prefix]);
            expect(result).toBe(true);
          }),
        );
      });

      it('endsWith should be true for matching suffix', async () => {
        await fc.assert(
          fc.asyncProperty(fc.string(), fc.string(), async (prefix, suffix) => {
            const s = prefix + suffix;
            const result = await callBuiltin('endsWith', [s, suffix]);
            expect(result).toBe(true);
          }),
        );
      });

      it('startsWith/endsWith should be false for non-matching', async () => {
        await fc.assert(
          fc.asyncProperty(fc.string(), fc.string(), fc.string(), async (a, b, c) => {
            // Skip cases where strings are equal or search is empty (empty string matches everything)
            if (a === b || a === c || b === c || b.length === 0) return;

            const s = a + c;
            // Skip if s naturally starts or ends with b (that's valid behavior)
            if (s.startsWith(b) || s.endsWith(b)) return;

            const startsResult = await callBuiltin('startsWith', [s, b]);
            expect(startsResult).toBe(false);

            const endsResult = await callBuiltin('endsWith', [s, b]);
            expect(endsResult).toBe(false);
          }),
        );
      });
    });

    describe('substring', () => {
      it('should return substring from start index', async () => {
        await fc.assert(
          fc.asyncProperty(fc.string(), fc.nat({ max: 100 }), async (s, start) => {
            if (start >= s.length) return; // Skip out of bounds

            const result = (await callBuiltin('substring', [s, start])) as string;
            const expected = s.substring(start);
            expect(result).toBe(expected);
          }),
        );
      });

      it('should return substring between start and end', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.string(),
            fc.nat({ max: 50 }),
            fc.nat({ max: 50 }),
            async (s, start, end) => {
              const adjustedStart = Math.min(start, s.length);
              const adjustedEnd = Math.min(end, s.length);

              const result = (await callBuiltin('substring', [
                s,
                adjustedStart,
                adjustedEnd,
              ])) as string;
              const expected = s.substring(adjustedStart, adjustedEnd);
              expect(result).toBe(expected);
            },
          ),
        );
      });
    });

    describe('indexOf', () => {
      it('should return index when substring is found', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.string(),
            fc.string(),
            fc.string(),
            async (prefix, search, suffix) => {
              if (search.length === 0) return; // Skip empty search
              const s = prefix + search + suffix;
              const result = await callBuiltin('indexOf', [s, search]);
              expect(result).toBeGreaterThanOrEqual(0);
              expect(result).toBeLessThan(s.length);
            },
          ),
        );
      });

      it('should return -1 when substring is not found', async () => {
        await fc.assert(
          fc.asyncProperty(fc.string(), fc.string(), async (s, search) => {
            if (s.includes(search)) return; // Skip if search is in s
            const result = await callBuiltin('indexOf', [s, search]);
            expect(result).toBe(-1);
          }),
        );
      });
    });

    describe('replace', () => {
      it('should replace all occurrences with different string', async () => {
        await fc.assert(
          fc.asyncProperty(fc.string(), fc.string(), async (search, replacement) => {
            // Skip empty search or when search equals replacement
            if (search.length === 0 || search === replacement) return;
            // Skip if replacement contains search (would cause false positive)
            if (replacement.includes(search)) return;

            const s = search + search; // Double the search string
            const result = (await callBuiltin('replace', [s, search, replacement])) as string;

            // Should not contain the search string anymore
            expect(result).not.toContain(search);
            // Should contain the replacement string twice
            expect(result).toEqual(replacement + replacement);
          }),
        );
      });
    });

    describe('split', () => {
      it('should split string by separator', async () => {
        await fc.assert(
          fc.asyncProperty(fc.string(), fc.string(), async (s, sep) => {
            const result = await callBuiltin('split', [s, sep]);
            expect(Array.isArray(result)).toBe(true);
          }),
        );
      });

      it('splitting empty string should return single element', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.string().filter((s) => s.length > 0),
            async (sep) => {
              const result = (await callBuiltin('split', ['', sep])) as unknown[];
              expect(result.length).toBe(1);
              expect(result[0]).toBe('');
            },
          ),
        );
      });
    });

    describe('matches', () => {
      it('should match valid regex patterns', async () => {
        await fc.assert(
          fc.asyncProperty(
            lowercaseString.filter((s) => s.length > 0),
            async (s) => {
              const pattern = '^[a-z]+$';
              const result = await callBuiltin('matches', [s, pattern]);
              expect(result).toBe(true);
            },
          ),
        );
      });

      it('should not match invalid patterns', async () => {
        await fc.assert(
          fc.asyncProperty(uppercaseString, async (s) => {
            const pattern = '^[a-z]+$';
            const result = await callBuiltin('matches', [s, pattern]);
            expect(result).toBe(false);
          }),
        );
      });
    });

    describe('length', () => {
      it('should return string length', async () => {
        await fc.assert(
          fc.asyncProperty(fc.string(), async (s) => {
            const result = await callBuiltin('length', [s]);
            expect(result).toBe(s.length);
          }),
        );
      });
    });
  });

  describe('Math Built-ins', () => {
    describe('abs', () => {
      it('should return non-negative result', async () => {
        await fc.assert(
          fc.asyncProperty(fc.float({ max: 1e6, min: -1e6, noNaN: true }), async (n) => {
            const result = await callBuiltin('abs', [n]);
            expect(typeof result).toBe('number');
            expect((result as number) >= 0).toBe(true);
          }),
        );
      });

      it('should satisfy abs(abs(n)) = abs(n)', async () => {
        await fc.assert(
          fc.asyncProperty(fc.float({ max: 1e6, min: -1e6, noNaN: true }), async (n) => {
            const abs1 = await callBuiltin('abs', [n]);
            const abs2 = await callBuiltin('abs', [abs1]);
            expect(abs1).toEqual(abs2);
          }),
        );
      });
    });

    describe('round / floor / ceil', () => {
      it('should return integer results', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.float({ max: 1e6, min: -1e6, noNaN: true }),
            fc.constantFrom('round', 'floor', 'ceil'),
            async (n, fn) => {
              const result = await callBuiltin(fn, [n]);
              expect(Number.isInteger(result)).toBe(true);
            },
          ),
        );
      });

      it('round should satisfy round(n) >= n - 0.5 and round(n) <= n + 0.5', async () => {
        await fc.assert(
          fc.asyncProperty(fc.float({ max: 1e6, min: -1e6, noNaN: true }), async (n) => {
            const result = (await callBuiltin('round', [n])) as number;
            expect(result).toBeGreaterThanOrEqual(n - 0.5);
            expect(result).toBeLessThanOrEqual(n + 0.5);
          }),
        );
      });

      it('floor should satisfy floor(n) <= n', async () => {
        await fc.assert(
          fc.asyncProperty(fc.float({ max: 1e6, min: -1e6, noNaN: true }), async (n) => {
            const result = (await callBuiltin('floor', [n])) as number;
            expect(result).toBeLessThanOrEqual(n);
          }),
        );
      });

      it('ceil should satisfy ceil(n) >= n', async () => {
        await fc.assert(
          fc.asyncProperty(fc.float({ max: 1e6, min: -1e6, noNaN: true }), async (n) => {
            const result = (await callBuiltin('ceil', [n])) as number;
            expect(result).toBeGreaterThanOrEqual(n);
          }),
        );
      });
    });

    describe('min / max', () => {
      it('min should return the smallest value', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(fc.float({ max: 1e6, min: -1e6, noNaN: true }), {
              minLength: 1,
              maxLength: 10,
            }),
            async (numbers) => {
              const result = await callBuiltin('min', numbers);
              const expected = Math.min(...numbers);
              expect(result).toEqual(expected);
            },
          ),
        );
      });

      it('max should return the largest value', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(fc.float({ max: 1e6, min: -1e6, noNaN: true }), {
              minLength: 1,
              maxLength: 10,
            }),
            async (numbers) => {
              const result = await callBuiltin('max', numbers);
              const expected = Math.max(...numbers);
              expect(result).toEqual(expected);
            },
          ),
        );
      });
    });

    describe('between', () => {
      it('should return true when value in range', async () => {
        await fc.assert(
          fc.asyncProperty(fc.float({ max: 1e6, min: -1e6, noNaN: true }), async (value) => {
            const low = value - 10;
            const high = value + 10;
            const result = await callBuiltin('between', [value, low, high]);
            expect(result).toBe(true);
          }),
        );
      });

      it('should return false when value out of range', async () => {
        await fc.assert(
          fc.asyncProperty(fc.float({ max: 1e6, min: -1e6, noNaN: true }), async (value) => {
            const low = value + 10;
            const high = value + 20;
            const result = await callBuiltin('between', [value, low, high]);
            expect(result).toBe(false);
          }),
        );
      });
    });
  });

  describe('Array/Aggregate Built-ins', () => {
    describe('count / length', () => {
      it('should return array length', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(fc.float({ max: 1e6, min: -1e6, noNaN: true }), { maxLength: 20 }),
            async (arr) => {
              const result = await callBuiltin('count', [arr]);
              expect(result).toBe(arr.length);
            },
          ),
        );
      });
    });

    describe('sum', () => {
      it('should sum numeric arrays', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(fc.float({ max: 100, min: -100, noNaN: true }), {
              minLength: 1,
              maxLength: 20,
            }),
            async (arr) => {
              const result = await callBuiltin('sum', [arr]);
              const expected = arr.reduce((a, b) => a + b, 0);
              expect(result as number).toBeCloseTo(expected, 10);
            },
          ),
        );
      });

      it('empty array should return 0 or null', async () => {
        const result = await callBuiltin('sum', [[]]);
        // Runtime might return 0 or null for empty arrays
        expect(result === 0 || result === null).toBe(true);
      });

      it('single element should return that element', async () => {
        await fc.assert(
          fc.asyncProperty(fc.float({ max: 1e6, min: -1e6, noNaN: true }), async (n) => {
            const result = await callBuiltin('sum', [[n]]);
            // Handle -0/+0 comparison explicitly (they're equal for our purposes)
            if (Object.is(result, n) || (result === 0 && n === 0)) {
              return; // Test passes
            }
            throw new Error(`Expected ${n} but got ${result}`);
          }),
        );
      });
    });

    describe('avg', () => {
      it('should average numeric arrays', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(fc.float({ max: 100, min: -100, noNaN: true }), {
              minLength: 1,
              maxLength: 20,
            }),
            async (arr) => {
              const result = await callBuiltin('avg', [arr]);
              const expected = arr.reduce((a, b) => a + b, 0) / arr.length;
              expect(result as number).toBeCloseTo(expected, 9);
            },
          ),
        );
      });

      it('avg should be between min and max', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(fc.float({ max: 100, min: -100, noNaN: true }), {
              minLength: 2,
              maxLength: 20,
            }),
            async (arr) => {
              const result = (await callBuiltin('avg', [arr])) as number;
              const min = Math.min(...arr);
              const max = Math.max(...arr);
              expect(result).toBeGreaterThanOrEqual(min);
              expect(result).toBeLessThanOrEqual(max);
            },
          ),
        );
      });
    });

    describe('min_of / max_of', () => {
      it('min_of should return minimum', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(fc.float({ max: 1e6, min: -1e6, noNaN: true }), {
              minLength: 1,
              maxLength: 20,
            }),
            async (arr) => {
              const result = await callBuiltin('min_of', [arr]);
              const expected = Math.min(...arr);
              expect(result).toEqual(expected);
            },
          ),
        );
      });

      it('max_of should return maximum', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(fc.float({ max: 1e6, min: -1e6, noNaN: true }), {
              minLength: 1,
              maxLength: 20,
            }),
            async (arr) => {
              const result = await callBuiltin('max_of', [arr]);
              const expected = Math.max(...arr);
              expect(result).toEqual(expected);
            },
          ),
        );
      });
    });
  });

  describe('Special Built-ins', () => {
    describe('now', () => {
      it('should return a number', async () => {
        const result = await callBuiltin('now', []);
        expect(typeof result).toBe('number');
      });

      it('should be consistent with runtime.now', async () => {
        const runtime = createTestRuntime();
        const nowValue = 1234567890;
        (runtime as any).options.now = () => nowValue;

        const calleeExpr: IRExpression = { kind: 'identifier', name: 'now' };
        const callExpr: IRExpression = { kind: 'call', callee: calleeExpr, args: [] };
        const result = await runtime['evaluateExpression'](callExpr, {});

        expect(result).toBe(nowValue);
      });
    });

    describe('uuid', () => {
      it('should return a string', async () => {
        const result = await callBuiltin('uuid', []);
        expect(typeof result).toBe('string');
      });

      it('should generate unique values', async () => {
        const ids = await Promise.all([
          callBuiltin('uuid', []),
          callBuiltin('uuid', []),
          callBuiltin('uuid', []),
          callBuiltin('uuid', []),
        ] as const);

        // All IDs should be unique
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(4);
      });
    });
  });

  describe('Builtin Function Purity', () => {
    it('should be pure (same inputs = same outputs)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ max: 100, min: -100, noNaN: true }),
          fc.constantFrom('abs', 'round', 'floor', 'ceil'),
          async (n, fn) => {
            const result1 = await callBuiltin(fn, [n]);
            const result2 = await callBuiltin(fn, [n]);
            expect(result1).toEqual(result2);
          },
        ),
      );
    });
  });
});
