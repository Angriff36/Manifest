/**
 * Default mapping from IR `type.name` strings to Prisma scalar types.
 *
 * This table is the projection's sole interpreter of Manifest's open
 * type vocabulary. Core grammar carries `type.name` as an arbitrary
 * string (decided at Checkpoint 1); only the projection knows what
 * any given name means for Prisma.
 *
 * Consumers can override per-property via `typeMappings`. Anything not
 * in this table and not overridden produces a hard diagnostic — no
 * fallback, no guessing. That is the contract.
 *
 * IMPORTANT: `'number'` is INTENTIONALLY ABSENT from this table.
 * Manifest's `number` is ambiguous between integers, real numbers, and
 * money. Silently mapping it to `Float` is exactly the class of silent
 * bug this project exists to prevent (rounding in financial values).
 * Authors must pick a precise type:
 *   - `int` / `bigint` for counts and ids
 *   - `float` for measurements where rounding is acceptable
 *   - `money` / `decimal` for currency and other exact-decimal values
 * Bare `number` produces a hard PRISMA_AMBIGUOUS_NUMBER diagnostic
 * (see the generator). Override via `typeMappings` if you really do
 * want to attach a specific Prisma scalar to a `number`-typed field.
 *
 * Entries here MUST stay backend-neutral on the IR side: keys are
 * Manifest-language type names, values are Prisma scalar names.
 */
export const DEFAULT_TYPE_MAPPING: Readonly<Record<string, string>> = Object.freeze({
  // Lexer-blessed primitives (string and boolean are keywords).
  string: 'String',
  boolean: 'Boolean',
  // `number` is intentionally omitted — see header comment.

  // Integer-family.
  int: 'Int',
  bigint: 'BigInt',
  // Real-number-family. Explicit choice; the author has said "rounding here is OK".
  float: 'Float',

  // Exact-decimal-family. Both render as Prisma `Decimal` and pick up the
  // default precision/scale below unless overridden in `precision` config.
  decimal: 'Decimal',
  money: 'Decimal',

  // Temporal.
  date: 'DateTime',
  datetime: 'DateTime',

  // Structured.
  json: 'Json',
  bytes: 'Bytes',
  uuid: 'String',

  // Convenience aliases that map to the same Prisma scalar as their
  // canonical form. Adding more aliases is safe; removing them is a
  // breaking change for consumers' .manifest files.
  text: 'String',
  bool: 'Boolean',
});

/**
 * Default precision/scale applied when a property's resolved Prisma scalar
 * is `Decimal` and no entry exists in `precision.<Entity>.<Property>` config.
 *
 * `(12, 2)` is the conservative money default: it represents values up to
 * 9,999,999,999.99 with cent-level scale. Consumers needing different
 * precision (high-scale scientific decimals, multi-currency aggregations,
 * etc.) override per property via the `precision` projection option.
 *
 * This is NOT applied to anything other than the literal Prisma `Decimal`
 * scalar — it does NOT modify Int/Float/etc.
 */
export const DEFAULT_DECIMAL_PRECISION = 12;
export const DEFAULT_DECIMAL_SCALE = 2;

/**
 * Prisma scalar name used to detect the decimal family. Centralised here
 * so the generator does not duplicate the literal string.
 */
export const PRISMA_DECIMAL_SCALAR = 'Decimal';

/**
 * Resolve a Prisma scalar for an IR `type.name`, given optional per-property
 * overrides from projection config. Returns `undefined` when the name is
 * unknown and no override is supplied — the caller MUST emit a diagnostic
 * in that case.
 */
export function resolvePrismaScalar(
  irTypeName: string,
  overrides: Readonly<Record<string, string>> | undefined,
  propertyName: string,
): string | undefined {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, propertyName)) {
    return overrides[propertyName];
  }
  return DEFAULT_TYPE_MAPPING[irTypeName];
}

/**
 * Return true iff the resolved Prisma scalar belongs to the decimal family.
 * Used by the generator to decide whether to apply default precision/scale.
 */
export function isDecimalScalar(prismaScalar: string): boolean {
  return prismaScalar === PRISMA_DECIMAL_SCALAR;
}
