/**
 * Default mapping from IR `type.name` strings to Convex value validators
 * (`convex/values` `v.*` expressions).
 *
 * This table is the projection's sole interpreter of Manifest's open type
 * vocabulary for Convex. Core grammar carries `type.name` as an arbitrary
 * string; only the projection knows what any given name means for Convex.
 *
 * Consumers override per-property via `typeMappings` (the value is the literal
 * validator expression, e.g. `"v.number()"`). Anything not in this table and
 * not overridden produces a hard diagnostic — no fallback, no guessing.
 *
 * Numeric safety (mirrors the Prisma projection's stance):
 *   - `number` is INTENTIONALLY ABSENT. It is ambiguous between integers, real
 *     numbers, and money; mapping it silently would reintroduce the rounding
 *     bug Manifest exists to prevent. Bare `number` → hard CONVEX_AMBIGUOUS_NUMBER.
 *   - `int`/`bigint` → `v.int64()` (Convex Int64 / JS bigint) — lossless for
 *     ids and counts.
 *   - `float` → `v.number()` (Convex Float64) — author accepted rounding.
 *   - `decimal`/`money` → `v.string()` — LOSSLESS exact-decimal transport
 *     (Convex has no native decimal). Override to `v.number()` per property if
 *     ergonomics are preferred over exactness.
 *
 * Temporal values map to `v.number()` (epoch milliseconds), the Convex-idiomatic
 * timestamp representation. Override to `v.string()` for ISO-8601 storage.
 *
 * Entries here keep the IR side backend-neutral: keys are Manifest-language type
 * names, values are Convex validator expressions.
 */
export const DEFAULT_TYPE_MAPPING: Readonly<Record<string, string>> = Object.freeze({
  // Lexer-blessed primitives.
  string: 'v.string()',
  boolean: 'v.boolean()',
  // `number` is intentionally omitted — see header.

  // Integer-family → Convex Int64 (bigint), lossless.
  int: 'v.int64()',
  bigint: 'v.int64()',

  // Real-number-family → Convex Float64. Author opted into rounding.
  float: 'v.number()',

  // Exact-decimal-family → lossless string transport (Convex has no Decimal).
  decimal: 'v.string()',
  money: 'v.string()',

  // Temporal → epoch milliseconds (Convex-idiomatic).
  date: 'v.number()',
  datetime: 'v.number()',
  time: 'v.number()',
  duration: 'v.number()',

  // Structured.
  json: 'v.any()',
  bytes: 'v.bytes()',
  uuid: 'v.string()',

  // Convenience aliases.
  text: 'v.string()',
  bool: 'v.boolean()',
});

/**
 * Resolve a Convex validator expression for an IR `type.name`, given optional
 * per-property overrides from projection config. Returns `undefined` when the
 * name is unknown and no override is supplied — the caller MUST emit a
 * diagnostic in that case (no fallback).
 */
export function resolveConvexValidator(
  irTypeName: string,
  overrides: Readonly<Record<string, string>> | undefined,
  propertyName: string,
): string | undefined {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, propertyName)) {
    return overrides[propertyName];
  }
  return DEFAULT_TYPE_MAPPING[irTypeName];
}
