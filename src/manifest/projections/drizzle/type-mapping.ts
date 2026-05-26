/**
 * Default mapping from IR `type.name` strings to Drizzle column builder functions.
 *
 * This table is the projection's sole interpreter of Manifest's open
 * type vocabulary for Drizzle ORM. The projection knows what any given
 * IR type name means for Drizzle; nothing upstream carries Drizzle knowledge.
 *
 * Consumers can override per-property via `typeMappings`. Anything not
 * in this table and not overridden produces a hard diagnostic — no
 * fallback, no guessing. That is the contract.
 *
 * IMPORTANT: `'number'` is INTENTIONALLY ABSENT from this table.
 * Manifest's `number` is ambiguous between integers, real numbers, and
 * money. Silently mapping it to `integer` is exactly the class of silent
 * bug this project exists to prevent (rounding in financial values).
 * Authors must pick a precise type:
 *   - `int` / `bigint` for counts and ids
 *   - `float` for measurements where rounding is acceptable
 *   - `money` / `decimal` for currency and other exact-decimal values
 * Bare `number` produces a hard DRIZZLE_AMBIGUOUS_NUMBER diagnostic
 * (see the generator). Override via `typeMappings` if you really do
 * want to attach a specific Drizzle column type to a `number`-typed field.
 */

/** Dialect controls which Drizzle import set and column types to use. */
export type DrizzleDialect = 'postgresql' | 'mysql' | 'sqlite';

/**
 * Maps an IR type name to a Drizzle column builder call.
 * The value is the Drizzle builder method name (e.g. 'varchar', 'integer').
 * The generator wraps it with the correct module prefix (pgTable, mysqlTable, sqliteTable).
 */
export interface DrizzleColumnType {
  /** Drizzle column builder function name (e.g. 'varchar', 'integer', 'boolean') */
  builder: string;
  /** Whether this type requires a length/precision parameter (e.g. varchar(255), numeric(12,2)) */
  hasParams?: boolean;
  /** Default params when hasParams is true */
  defaultParams?: string;
}

const DEFAULT_TYPE_MAPPING: Readonly<Record<string, DrizzleColumnType>> = Object.freeze({
  // String family
  string: { builder: 'varchar', hasParams: true, defaultParams: '255' },
  text: { builder: 'text' },
  uuid: { builder: 'uuid' },

  // Boolean
  boolean: { builder: 'boolean' },
  bool: { builder: 'boolean' },

  // Integer family
  int: { builder: 'integer' },
  bigint: { builder: 'bigint', hasParams: true, defaultParams: '{ mode: "number" }' },

  // Real number family
  float: { builder: 'real' },

  // Exact decimal family
  decimal: { builder: 'numeric', hasParams: true, defaultParams: '' },
  money: { builder: 'numeric', hasParams: true, defaultParams: '' },

  // Temporal
  date: { builder: 'date' },
  datetime: { builder: 'timestamp' },

  // Structured
  json: { builder: 'jsonb' },
  bytes: { builder: 'bytea' },
});

export { DEFAULT_TYPE_MAPPING };

/**
 * Default precision/scale applied when a property's resolved Drizzle type
 * is `numeric` and no entry exists in `precision` config.
 *
 * `(12, 2)` is the conservative money default: it represents values up to
 * 9,999,999,999.99 with cent-level scale.
 */
export const DEFAULT_DECIMAL_PRECISION = 12;
export const DEFAULT_DECIMAL_SCALE = 2;

/**
 * Drizzle builder name used to detect the decimal/numeric family.
 */
export const DRIZZLE_NUMERIC_BUILDER = 'numeric';

/**
 * Resolve a Drizzle column type for an IR `type.name`, given optional per-property
 * overrides from projection config. Returns `undefined` when the name is
 * unknown and no override is supplied — the caller MUST emit a diagnostic.
 */
export function resolveDrizzleColumnType(
  irTypeName: string,
  overrides: Readonly<Record<string, string>> | undefined,
  propertyName: string,
): DrizzleColumnType | undefined {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, propertyName)) {
    // Override is a raw builder name string — wrap it in a DrizzleColumnType.
    return { builder: overrides[propertyName] };
  }
  return DEFAULT_TYPE_MAPPING[irTypeName];
}

/**
 * Return true iff the resolved Drizzle column type is the numeric/decimal family.
 * Used by the generator to decide whether to apply default precision/scale.
 */
export function isNumericType(colType: DrizzleColumnType): boolean {
  return colType.builder === DRIZZLE_NUMERIC_BUILDER;
}

/**
 * Resolve the Drizzle schema module import name based on dialect.
 * e.g. 'pgTable' for postgresql, 'mysqlTable' for mysql, 'sqliteTable' for sqlite.
 */
export function tableFunctionForDialect(dialect: DrizzleDialect): string {
  switch (dialect) {
    case 'postgresql': return 'pgTable';
    case 'mysql': return 'mysqlTable';
    case 'sqlite': return 'sqliteTable';
  }
}

/**
 * Resolve the Drizzle schema module import path based on dialect.
 */
export function importPathForDialect(dialect: DrizzleDialect): string {
  switch (dialect) {
    case 'postgresql': return 'drizzle-orm/pg-core';
    case 'mysql': return 'drizzle-orm/mysql-core';
    case 'sqlite': return 'drizzle-orm/sqlite-core';
  }
}
