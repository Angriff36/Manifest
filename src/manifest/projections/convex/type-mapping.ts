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
 * Numeric mapping — aligned with Manifest runtime semantics:
 *   - `number` is INTENTIONALLY ABSENT. Bare `number` → hard
 *     CONVEX_AMBIGUOUS_NUMBER so authors pick a precise name.
 *   - `int`/`bigint`/`float`/`decimal`/`money` all → `v.number()` (Convex
 *     Float64). The Manifest reference runtime treats every numeric type as an
 *     ordinary JS number — decimal/money precision and integer width are
 *     projection metadata, NOT runtime-enforced. Emitting `v.int64()` (bigint)
 *     or `v.string()` (text transport) here would diverge from that and break
 *     generated guard/mutation arithmetic at runtime (mixed bigint/number throws;
 *     string operands concatenate or compare lexically). A consumer that truly
 *     needs lossless decimal or 64-bit width can opt in per-property via
 *     `typeMappings` (`"v.int64()"` / `"v.string()"`).
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

  // All numeric types → Convex Float64, matching Manifest runtime semantics
  // (the runtime treats int/bigint/float/decimal/money as ordinary JS numbers).
  // Keeps generated arithmetic correct; per-property typeMappings can opt back
  // into v.int64()/v.string() where lossless transport is genuinely required.
  int: 'v.number()',
  bigint: 'v.number()',
  float: 'v.number()',
  decimal: 'v.number()',
  money: 'v.number()',

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

/**
 * Convex `.searchIndex` requires `searchField` to be a string column.
 * True when the default IR→Convex mapping is `v.string()`.
 */
export function isConvexSearchIndexFieldType(irTypeName: string): boolean {
  return DEFAULT_TYPE_MAPPING[irTypeName] === 'v.string()';
}
