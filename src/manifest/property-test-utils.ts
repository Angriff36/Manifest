/**
 * Property-based testing utilities for Manifest runtime engine.
 *
 * Provides fast-check arbitraries for generating IR values and expressions,
 * along with test helpers for common runtime scenarios.
 */

import type { IRValue, IRExpression } from './ir';
import * as fc from 'fast-check';

/**
 * Arbitrary for IR literal values (strings, numbers, booleans, null)
 */
export const irLiteralValue: fc.Arbitrary<IRValue> = fc.oneof(
  fc.string().map((s) => ({ kind: 'string' as const, value: s })),
  fc
    .float({ max: 1e6, min: -1e6, noNaN: true })
    .map((n) => ({ kind: 'number' as const, value: n })),
  fc.boolean().map((b) => ({ kind: 'boolean' as const, value: b })),
  fc.constant({ kind: 'null' as const }),
);

/**
 * Arbitrary for IR values including nested arrays and objects
 * Note: fast-check v4 uses letrec instead of lazyRecursion
 */
export const irValue: fc.Arbitrary<IRValue> = fc.letrec<{ oneof: IRValue }>((tie) => ({
  oneof: fc.oneof(
    irLiteralValue,
    fc.array(tie('oneof')).map((elements: IRValue[]) => ({ kind: 'array' as const, elements })),
    fc.dictionary(fc.string(), tie('oneof')).map((properties: Record<string, IRValue>) => ({
      kind: 'object' as const,
      properties,
    })),
  ),
})).oneof;

/**
 * Arbitrary for literal expressions
 */
export const literalExpression: fc.Arbitrary<IRExpression> = irValue.map((value) => ({
  kind: 'literal' as const,
  value,
}));

/**
 * Arbitrary for identifier expressions (restricted to safe names)
 * Note: Using a simpler approach since stringMatching has issues in fast-check v4
 */
export const identifierExpression = fc
  .array(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789'.split('')),
    { minLength: 1, maxLength: 20 },
  )
  .map((chars) => {
    const name = chars.join('');
    return { kind: 'identifier' as const, name };
  })
  .filter((expr) => /^[a-zA-Z_]/.test(expr.name));

/**
 * Operators for binary expressions
 */
const binaryOperators = [
  '+',
  '-',
  '*',
  '/',
  '%',
  '==',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
  '&&',
  '||',
] as const;

/**
 * Arbitrary for binary expressions (simple, limited depth)
 */
export const binaryExpression: fc.Arbitrary<IRExpression> = fc
  .tuple(literalExpression, literalExpression)
  .chain(([left, right]) =>
    fc.constantFrom(...binaryOperators).map((operator) => ({
      kind: 'binary' as const,
      operator,
      left,
      right,
    })),
  );

/**
 * Operators for unary expressions
 */
const unaryOperators = ['!', '-'] as const;

/**
 * Arbitrary for unary expressions
 */
export const unaryExpression: fc.Arbitrary<IRExpression> = fc
  .tuple(literalExpression)
  .chain(([operand]) =>
    fc.constantFrom(...unaryOperators).map((operator) => ({
      kind: 'unary' as const,
      operator,
      operand,
    })),
  );

/**
 * Arbitrary for basic expressions (literals, identifiers, binary, unary)
 */
export const basicExpression: fc.Arbitrary<IRExpression> = fc.oneof(
  literalExpression,
  identifierExpression,
  binaryExpression,
  unaryExpression,
);

/**
 * Arbitrary for array expressions
 */
export const arrayExpression = fc
  .array(literalExpression, { maxLength: 5 })
  .map((elements) => ({ kind: 'array' as const, elements }));

/**
 * Helper for identifier names (first char must be letter or underscore)
 */
const identifierName = fc
  .array(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789'.split('')),
    { minLength: 1, maxLength: 20 },
  )
  .map((chars) => chars.join(''))
  .filter((name) => /^[a-zA-Z_]/.test(name));

/**
 * Arbitrary for object expressions
 */
export const objectExpression = fc
  .array(fc.tuple(identifierName, literalExpression), { maxLength: 5 })
  .map((properties) => ({
    kind: 'object' as const,
    properties: properties.map(([key, value]) => ({ key, value })),
  }));

/**
 * Arbitrary for lambda expressions
 */
export const lambdaExpression = fc
  .array(identifierName, { minLength: 1, maxLength: 3 })
  .chain((params) =>
    literalExpression.map((body) => ({
      kind: 'lambda' as const,
      params,
      body,
    })),
  );

/**
 * All expression types
 */
export const anyExpression: fc.Arbitrary<IRExpression> = fc.oneof(
  literalExpression,
  identifierExpression,
  binaryExpression,
  unaryExpression,
  arrayExpression,
  objectExpression,
  lambdaExpression,
);

/**
 * Context values for expression evaluation
 */
export const contextValue = fc.oneof(
  fc.string(),
  fc.float({ max: 1e6, min: -1e6, noNaN: true }),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.oneof(fc.string(), fc.float({ max: 1e6, min: -1e6, noNaN: true }), fc.boolean()), {
    maxLength: 5,
  }),
  fc.dictionary(
    fc.string(),
    fc.oneof(fc.string(), fc.float({ max: 1e6, min: -1e6, noNaN: true }), fc.boolean()),
    { maxKeys: 5 },
  ),
);

/**
 * Runtime context for expression evaluation
 */
export const runtimeContext = fc.dictionary(
  fc.string().filter((s) => /^[a-zA-Z_]/.test(s)),
  contextValue,
);

/**
 * Property test helpers
 */

/**
 * Creates a test IR with a simple entity for testing
 */
export function createTestIR(entityName: string = 'TestEntity') {
  return {
    version: '1.0' as const,
    provenance: {
      contentHash: 'test-hash',
      compilerVersion: 'test',
      schemaVersion: '1.0',
      compiledAt: new Date().toISOString(),
    },
    modules: [],
    values: [],
    entities: [
      {
        name: entityName,
        properties: [
          { name: 'id', type: { name: 'string', nullable: false }, modifiers: [] },
          { name: 'value', type: { name: 'number', nullable: false }, modifiers: [] },
        ],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      },
    ],
    enums: [],
    stores: [],
    events: [],
    commands: [],
    policies: [],
  };
}

/**
 * Expression builder for creating test expressions
 */
export class ExpressionBuilder {
  static literal(value: IRValue): IRExpression {
    return { kind: 'literal', value };
  }

  static identifier(name: string): IRExpression {
    return { kind: 'identifier', name };
  }

  static member(object: IRExpression, property: string): IRExpression {
    return { kind: 'member', object, property };
  }

  static binary(operator: string, left: IRExpression, right: IRExpression): IRExpression {
    return { kind: 'binary', operator, left, right };
  }

  static unary(operator: string, operand: IRExpression): IRExpression {
    return { kind: 'unary', operator, operand };
  }

  static call(callee: IRExpression, args: IRExpression[]): IRExpression {
    return { kind: 'call', callee, args };
  }

  static conditional(
    condition: IRExpression,
    consequent: IRExpression,
    alternate: IRExpression,
  ): IRExpression {
    return { kind: 'conditional', condition, consequent, alternate };
  }

  static array(elements: IRExpression[]): IRExpression {
    return { kind: 'array', elements };
  }

  static object(properties: { key: string; value: IRExpression }[]): IRExpression {
    return { kind: 'object', properties };
  }

  static lambda(params: string[], body: IRExpression): IRExpression {
    return { kind: 'lambda', params, body };
  }
}

/**
 * Convert JavaScript value to IRValue
 */
export function jsToIRValue(value: unknown): IRValue {
  if (value === null) {
    return { kind: 'null' };
  }
  if (typeof value === 'string') {
    return { kind: 'string', value };
  }
  if (typeof value === 'number') {
    return { kind: 'number', value };
  }
  if (typeof value === 'boolean') {
    return { kind: 'boolean', value };
  }
  if (Array.isArray(value)) {
    return { kind: 'array', elements: value.map((v) => jsToIRValue(v)) };
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return {
      kind: 'object',
      properties: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, jsToIRValue(v)])),
    };
  }
  return { kind: 'null' };
}
