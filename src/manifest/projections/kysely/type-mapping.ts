/**
 * Default mapping from IR `type.name` strings to Kysely TypeScript column types.
 *
 * This table is the projection's sole interpreter of Manifest's open
 * type vocabulary for Kysely. The projection knows what any given
 * IR type name means for Kysely; nothing upstream carries Kysely knowledge.
 *
 * Kysely uses a `Database` interface where each table is a row type. Column
 * types are TypeScript types, not DDL. The values here represent the
 * TypeScript types that will appear in the generated row interfaces.
 *
 * Consumers can override per-property via `typeMappings`. Anything not
 * in this table and not overridden produces a hard diagnostic — no
 * fallback, no guessing. That is the contract.
 *
 * IMPORTANT: `'number'` is INTENTIONALLY ABSENT from this table.
 * Manifest's `number` is ambiguous between integers, real numbers, and
 * money. Silently mapping it to `number` is exactly the class of silent
 * bug this project exists to prevent (rounding in financial values).
 * Authors must pick a precise type:
 *   - `int` / `bigint` for counts and ids
 *   - `float` for measurements where rounding is acceptable
 *   - `money` / `decimal` for currency and other exact-decimal values
 * Bare `number` produces a hard KYSELY_AMBIGUOUS_NUMBER diagnostic
 * (see the generator). Override via `typeMappings` if you really do
 * want to attach a specific TypeScript type to a `number`-typed field.
 */

/**
 * Kysely dialect controls which dialect import is emitted in the
 * generated factory function.
 */
export type KyselyDialect = 'postgresql' | 'mysql' | 'sqlite';

/**
 * Maps an IR type name to a Kysely TypeScript column type.
 * The value is the TypeScript type expression (e.g. 'string', 'number', 'Date').
 */
export interface KyselyColumnType {
  /** TypeScript type expression (e.g. 'string', 'number', 'Date') */
  tsType: string;
  /** Whether this column should be wrapped in Generated<T> (auto-default columns) */
  generated?: boolean;
  /** Whether this column should use ColumnType for select/insert/update transforms */
  columnType?: boolean;
}

const DEFAULT_TYPE_MAPPING: Readonly<Record<string, KyselyColumnType>> = Object.freeze({
  // String family
  string: { tsType: 'string' },
  text: { tsType: 'string' },
  uuid: { tsType: 'string' },

  // Boolean
  boolean: { tsType: 'boolean' },
  bool: { tsType: 'boolean' },

  // Integer family
  int: { tsType: 'number' },
  bigint: { tsType: 'string' }, // Kysely recommends string for bigint to avoid precision loss

  // Real number family
  float: { tsType: 'number' },

  // Exact decimal family — Kysely uses string for exact decimals to avoid JS float issues
  decimal: { tsType: 'string' },
  money: { tsType: 'string' },

  // Temporal — use ColumnType for Date columns that may accept strings on insert
  date: { tsType: 'Date', columnType: true },
  datetime: { tsType: 'Date', columnType: true },
  timestamp: { tsType: 'Date', columnType: true }, // alias of datetime

  // Structured
  json: { tsType: 'unknown' },
  bytes: { tsType: 'Uint8Array' },
});

export { DEFAULT_TYPE_MAPPING };

/**
 * Resolve a Kysely TypeScript column type for an IR `type.name`, given optional
 * per-property overrides from projection config. Returns `undefined` when the
 * name is unknown and no override is supplied — the caller MUST emit a diagnostic.
 */
export function resolveKyselyColumnType(
  irTypeName: string,
  overrides: Readonly<Record<string, string>> | undefined,
  propertyName: string,
): KyselyColumnType | undefined {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, propertyName)) {
    // Override is a raw TypeScript type string — wrap it in a KyselyColumnType.
    return { tsType: overrides[propertyName] };
  }
  return DEFAULT_TYPE_MAPPING[irTypeName];
}

/**
 * Resolve the Kysely dialect class name and import path based on dialect.
 */
export function dialectClassName(dialect: KyselyDialect): string {
  switch (dialect) {
    case 'postgresql':
      return 'PostgresDialect';
    case 'mysql':
      return 'MysqlDialect';
    case 'sqlite':
      return 'SqliteDialect';
  }
}

/**
 * Resolve the Kysely dialect config type name for a given dialect.
 */
export function dialectConfigTypeName(dialect: KyselyDialect): string {
  switch (dialect) {
    case 'postgresql':
      return 'PostgresDialectConfig';
    case 'mysql':
      return 'MysqlDialectConfig';
    case 'sqlite':
      return 'SqliteDialectConfig';
  }
}
