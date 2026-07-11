/**
 * Constraint analysis utilities for projections.
 *
 * Extracts static range/bounds information from IR constraint expressions
 * that use built-in constraint functions (min, max, between, length).
 *
 * This enables projections to emit:
 * - SQL CHECK constraints (Prisma @@check, raw SQL)
 * - Zod .min()/.max() validators
 * - OpenAPI schema minimum/maximum
 *
 * IMPORTANT: This is projection-side analysis only. It does NOT alter
 * IR semantics or runtime behavior. Constraints that cannot be statically
 * analyzed are silently skipped — the runtime still evaluates them.
 */

import type { IRExpression, IRConstraint } from './ir';

// ============================================================================
// Types
// ============================================================================

/** Extracted numeric range for a property */
export interface NumericRange {
  /** Minimum value (inclusive), if known */
  min?: number;
  /** Maximum value (inclusive), if known */
  max?: number;
  /** The property path this range applies to (e.g., "self.price") */
  propertyPath: string;
}

/** Extracted string length constraint */
export interface LengthConstraint {
  /** Minimum length, if known */
  minLength?: number;
  /** Maximum length, if known */
  maxLength?: number;
  /** The property path this constraint applies to */
  propertyPath: string;
}

/** Extracted regex pattern constraint for a property */
export interface PatternConstraint {
  /** The regex pattern string */
  pattern: string;
  /** The property path this pattern applies to */
  propertyPath: string;
}

/** Result of analyzing all constraints on an entity */
export interface ConstraintAnalysis {
  /** Numeric ranges extracted from min/max/between calls */
  numericRanges: NumericRange[];
  /** Length constraints extracted from length() comparisons */
  lengthConstraints: LengthConstraint[];
  /** Regex pattern constraints extracted from matches() calls */
  patternConstraints: PatternConstraint[];
}

// ============================================================================
// Helpers
// ============================================================================

/** Extract a literal number value from an IRExpression, or undefined */
function extractLiteralNumber(expr: IRExpression): number | undefined {
  if (expr.kind === 'literal' && expr.value?.kind === 'number') {
    return expr.value.value;
  }
  return undefined;
}

/** Extract a literal string value from an IRExpression, or undefined */
function extractLiteralString(expr: IRExpression): string | undefined {
  if (expr.kind === 'literal' && expr.value?.kind === 'string') {
    return expr.value.value;
  }
  return undefined;
}

/** Format an IRExpression as a human-readable property path */
function formatPropertyPath(expr: IRExpression): string | undefined {
  if (expr.kind === 'identifier') return expr.name;
  if (expr.kind === 'member') {
    const obj = formatPropertyPath(expr.object);
    if (obj) return `${obj}.${expr.property}`;
  }
  return undefined;
}

/**
 * Extract the property being constrained and the literal bound
 * from a binary comparison like `self.price > 0`.
 */
function extractBinaryRange(expr: IRExpression): NumericRange | undefined {
  if (expr.kind !== 'binary') return undefined;

  const { operator, left, right } = expr;
  const leftNum = extractLiteralNumber(left);
  const rightNum = extractLiteralNumber(right);
  const leftPath = formatPropertyPath(left);
  const rightPath = formatPropertyPath(right);

  // Property on left, literal on right: self.price > 0
  if (leftPath && rightNum !== undefined) {
    switch (operator) {
      case '>':
        return { min: rightNum + 1, propertyPath: leftPath }; // exclusive > becomes >= min+epsilon
      case '>=':
        return { min: rightNum, propertyPath: leftPath };
      case '<':
        return { max: rightNum - 1, propertyPath: leftPath };
      case '<=':
        return { max: rightNum, propertyPath: leftPath };
    }
  }

  // Literal on left, property on right: 0 < self.price
  if (rightPath && leftNum !== undefined) {
    switch (operator) {
      case '<':
        return { min: leftNum + 1, propertyPath: rightPath };
      case '<=':
        return { min: leftNum, propertyPath: rightPath };
      case '>':
        return { max: leftNum - 1, propertyPath: rightPath };
      case '>=':
        return { max: leftNum, propertyPath: rightPath };
    }
  }

  return undefined;
}

// ============================================================================
// Main analysis
// ============================================================================

/**
 * Analyze a single constraint expression and extract range information.
 *
 * Recognized patterns:
 *   - `between(self.prop, minVal, maxVal)` → NumericRange
 *   - `min(self.prop, minVal)` → NumericRange (lower bound)
 *   - `max(self.prop, maxVal)` → NumericRange (upper bound)
 *   - `length(self.prop) >= N` → LengthConstraint
 *   - `length(self.prop) <= N` → LengthConstraint
 *   - `self.prop >= N` / `self.prop > N` → NumericRange
 *   - `self.prop <= N` / `self.prop < N` → NumericRange
 *   - `matches(self.prop, "pattern")` → PatternConstraint
 */
export function analyzeConstraintExpression(expression: IRExpression): {
  numericRanges: NumericRange[];
  lengthConstraints: LengthConstraint[];
  patternConstraints: PatternConstraint[];
} {
  const numericRanges: NumericRange[] = [];
  const lengthConstraints: LengthConstraint[] = [];
  const patternConstraints: PatternConstraint[] = [];

  // Handle `between(self.prop, min, max)` calls
  if (
    expression.kind === 'call' &&
    expression.callee.kind === 'identifier' &&
    expression.callee.name === 'between' &&
    expression.args.length === 3
  ) {
    const propPath = formatPropertyPath(expression.args[0]);
    const low = extractLiteralNumber(expression.args[1]);
    const high = extractLiteralNumber(expression.args[2]);
    if (propPath && low !== undefined && high !== undefined) {
      numericRanges.push({ min: low, max: high, propertyPath: propPath });
    }
    return { numericRanges, lengthConstraints, patternConstraints };
  }

  // Handle `matches(self.prop, "pattern")` calls
  if (
    expression.kind === 'call' &&
    expression.callee.kind === 'identifier' &&
    expression.callee.name === 'matches' &&
    expression.args.length === 2
  ) {
    const propPath = formatPropertyPath(expression.args[0]);
    const pattern = extractLiteralString(expression.args[1]);
    if (propPath && pattern !== undefined) {
      patternConstraints.push({ pattern, propertyPath: propPath });
    }
    return { numericRanges, lengthConstraints, patternConstraints };
  }

  // Handle `min(self.prop, minVal)` as lower bound
  if (
    expression.kind === 'call' &&
    expression.callee.kind === 'identifier' &&
    expression.callee.name === 'min' &&
    expression.args.length >= 2
  ) {
    const propPath = formatPropertyPath(expression.args[0]);
    const minVal = extractLiteralNumber(expression.args[1]);
    if (propPath && minVal !== undefined) {
      numericRanges.push({ min: minVal, propertyPath: propPath });
    }
    return { numericRanges, lengthConstraints, patternConstraints };
  }

  // Handle `max(self.prop, maxVal)` as upper bound
  if (
    expression.kind === 'call' &&
    expression.callee.kind === 'identifier' &&
    expression.callee.name === 'max' &&
    expression.args.length >= 2
  ) {
    const propPath = formatPropertyPath(expression.args[0]);
    const maxVal = extractLiteralNumber(expression.args[1]);
    if (propPath && maxVal !== undefined) {
      numericRanges.push({ max: maxVal, propertyPath: propPath });
    }
    return { numericRanges, lengthConstraints, patternConstraints };
  }

  // Handle binary comparisons involving `length()` calls
  if (expression.kind === 'binary') {
    const { operator, left, right } = expression;

    // `length(self.prop) >= N` or `length(self.prop) > N`
    if (
      left.kind === 'call' &&
      left.callee.kind === 'identifier' &&
      left.callee.name === 'length'
    ) {
      const propPath = formatPropertyPath(left.args[0]);
      const rightNum = extractLiteralNumber(right);
      if (propPath && rightNum !== undefined) {
        if (operator === '>=') {
          lengthConstraints.push({ minLength: rightNum, propertyPath: propPath });
        } else if (operator === '>') {
          lengthConstraints.push({ minLength: rightNum + 1, propertyPath: propPath });
        } else if (operator === '<=') {
          lengthConstraints.push({ maxLength: rightNum, propertyPath: propPath });
        } else if (operator === '<') {
          lengthConstraints.push({ maxLength: rightNum - 1, propertyPath: propPath });
        }
        return { numericRanges, lengthConstraints, patternConstraints };
      }
    }

    // `N >= length(self.prop)` → length <= N
    if (
      right.kind === 'call' &&
      right.callee.kind === 'identifier' &&
      right.callee.name === 'length'
    ) {
      const propPath = formatPropertyPath(right.args[0]);
      const leftNum = extractLiteralNumber(left);
      if (propPath && leftNum !== undefined) {
        if (operator === '>=') {
          lengthConstraints.push({ maxLength: leftNum, propertyPath: propPath });
        } else if (operator === '>') {
          lengthConstraints.push({ maxLength: leftNum - 1, propertyPath: propPath });
        } else if (operator === '<=') {
          lengthConstraints.push({ minLength: leftNum, propertyPath: propPath });
        } else if (operator === '<') {
          lengthConstraints.push({ minLength: leftNum + 1, propertyPath: propPath });
        }
        return { numericRanges, lengthConstraints, patternConstraints };
      }
    }

    // Handle simple binary comparisons: `self.prop >= N`, `self.prop <= N`, etc.
    const binaryRange = extractBinaryRange(expression);
    if (binaryRange) {
      numericRanges.push(binaryRange);
    }
  }

  return { numericRanges, lengthConstraints, patternConstraints };
}

/**
 * Analyze all constraints on an entity and aggregate range/length information.
 *
 * Multiple constraints on the same property are merged (tightest bounds win).
 */
export function analyzeConstraints(constraints: IRConstraint[]): ConstraintAnalysis {
  const allRanges: Map<string, NumericRange> = new Map();
  const allLengths: Map<string, LengthConstraint> = new Map();
  const allPatterns: PatternConstraint[] = [];

  for (const constraint of constraints) {
    const { numericRanges, lengthConstraints, patternConstraints } = analyzeConstraintExpression(
      constraint.expression,
    );

    for (const range of numericRanges) {
      const key = range.propertyPath;
      const existing = allRanges.get(key);
      if (existing) {
        // Merge: take tighter bounds
        if (range.min !== undefined) {
          existing.min = existing.min !== undefined ? Math.max(existing.min, range.min) : range.min;
        }
        if (range.max !== undefined) {
          existing.max = existing.max !== undefined ? Math.min(existing.max, range.max) : range.max;
        }
      } else {
        allRanges.set(key, { ...range });
      }
    }

    for (const lc of lengthConstraints) {
      const key = lc.propertyPath;
      const existing = allLengths.get(key);
      if (existing) {
        // Merge: take tighter bounds
        if (lc.minLength !== undefined) {
          existing.minLength =
            existing.minLength !== undefined
              ? Math.max(existing.minLength, lc.minLength)
              : lc.minLength;
        }
        if (lc.maxLength !== undefined) {
          existing.maxLength =
            existing.maxLength !== undefined
              ? Math.min(existing.maxLength, lc.maxLength)
              : lc.maxLength;
        }
      } else {
        allLengths.set(key, { ...lc });
      }
    }

    // Pattern constraints: collect all (multiple patterns on same property are all kept)
    for (const pc of patternConstraints) {
      allPatterns.push({ ...pc });
    }
  }

  return {
    numericRanges: Array.from(allRanges.values()),
    lengthConstraints: Array.from(allLengths.values()),
    patternConstraints: allPatterns,
  };
}

/**
 * Convert a NumericRange to a SQL CHECK constraint expression.
 *
 * @param range - The numeric range to convert
 * @param column - The SQL column name (defaults to property path stripped of "self.")
 * @returns SQL CHECK expression or undefined if no bounds
 */
export function numericRangeToCheckConstraint(
  range: NumericRange,
  column?: string,
): string | undefined {
  const col = column ?? range.propertyPath.replace(/^self\./, '');
  const conditions: string[] = [];

  if (range.min !== undefined) {
    conditions.push(`${col} >= ${range.min}`);
  }
  if (range.max !== undefined) {
    conditions.push(`${col} <= ${range.max}`);
  }

  return conditions.length > 0 ? conditions.join(' AND ') : undefined;
}

/**
 * Convert a LengthConstraint to a SQL CHECK constraint expression.
 *
 * @param lc - The length constraint
 * @param column - The SQL column name
 * @returns SQL CHECK expression or undefined if no bounds
 */
export function lengthConstraintToCheckConstraint(
  lc: LengthConstraint,
  column?: string,
): string | undefined {
  const col = column ?? lc.propertyPath.replace(/^self\./, '');
  const conditions: string[] = [];

  if (lc.minLength !== undefined) {
    conditions.push(`length(${col}) >= ${lc.minLength}`);
  }
  if (lc.maxLength !== undefined) {
    conditions.push(`length(${col}) <= ${lc.maxLength}`);
  }

  return conditions.length > 0 ? conditions.join(' AND ') : undefined;
}

/**
 * Convert a NumericRange to a Zod method chain (e.g., ".min(0).max(100)").
 *
 * @param range - The numeric range
 * @returns Zod method chain string
 */
export function numericRangeToZodChain(range: NumericRange): string {
  const parts: string[] = [];
  if (range.min !== undefined) parts.push(`.min(${range.min})`);
  if (range.max !== undefined) parts.push(`.max(${range.max})`);
  return parts.join('');
}

/**
 * Convert a LengthConstraint to a Zod method chain (e.g., ".min(1).max(255)").
 *
 * @param lc - The length constraint
 * @returns Zod method chain string
 */
export function lengthConstraintToZodChain(lc: LengthConstraint): string {
  const parts: string[] = [];
  if (lc.minLength !== undefined) parts.push(`.min(${lc.minLength})`);
  if (lc.maxLength !== undefined) parts.push(`.max(${lc.maxLength})`);
  return parts.join('');
}

/**
 * Convert a PatternConstraint to a SQL CHECK constraint expression.
 *
 * Uses the ~ operator (PostgreSQL regex match). Other DBs may need adaptation.
 *
 * @param pc - The pattern constraint
 * @param column - The SQL column name
 * @returns SQL CHECK expression
 */
export function patternConstraintToCheckConstraint(pc: PatternConstraint, column?: string): string {
  const col = column ?? pc.propertyPath.replace(/^self\./, '');
  // Escape single quotes in pattern for SQL
  const escapedPattern = pc.pattern.replace(/'/g, "''");
  return `${col} ~ '${escapedPattern}'`;
}

/**
 * Convert a PatternConstraint to a Zod method chain (e.g., ".regex(/pattern/)").
 *
 * @param pc - The pattern constraint
 * @returns Zod method chain string
 */
export function patternConstraintToZodChain(pc: PatternConstraint): string {
  // Escape forward slashes in pattern for regex literal
  const escapedPattern = pc.pattern.replace(/\//g, '\\/');
  return `.regex(/${escapedPattern}/)`;
}
