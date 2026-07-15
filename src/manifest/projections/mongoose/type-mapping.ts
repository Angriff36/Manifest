/**
 * Default mapping from IR `type.name` strings to Mongoose schema type strings.
 *
 * This table is the projection's sole interpreter of Manifest's open type
 * vocabulary for Mongoose. The projection knows what any given IR type name
 * means for Mongoose; nothing upstream carries Mongoose knowledge.
 *
 * Consumers can override per-property via `typeMappings`. Anything not in
 * this table and not overridden produces a hard diagnostic — no fallback,
 * no guessing. That is the contract.
 *
 * IMPORTANT: `'number'` is INTENTIONALLY ABSENT from this table.
 * Manifest's `number` is ambiguous between integers, real numbers, and
 * money. Silently mapping it to `Number` is exactly the class of silent
 * bug this project exists to prevent. Authors must pick a precise type:
 *   - `int` / `bigint` for counts and ids
 *   - `float` for measurements where rounding is acceptable
 *   - `money` / `decimal` for currency and other exact-decimal values
 * Bare `number` produces a hard MONGOOSE_AMBIGUOUS_NUMBER diagnostic.
 */

/**
 * Mongoose schema type representation.
 *
 * `schemaType` is the string used in Mongoose schema definitions:
 *   - Simple types: 'String', 'Number', 'Boolean', 'Date', 'Buffer'
 *   - Special types: 'Schema.Types.ObjectId', 'Schema.Types.Mixed',
 *     'Schema.Types.Decimal128', 'Schema.Types.BigInt'
 */
export interface MongooseSchemaType {
  /** Mongoose SchemaType string (e.g. 'String', 'Number', 'Date') */
  schemaType: string;
}

const DEFAULT_TYPE_MAPPING: Readonly<Record<string, MongooseSchemaType>> = Object.freeze({
  // String family
  string: { schemaType: 'String' },
  text: { schemaType: 'String' },
  uuid: { schemaType: 'String' },
  email: { schemaType: 'String' },
  url: { schemaType: 'String' },

  // Boolean
  boolean: { schemaType: 'Boolean' },
  bool: { schemaType: 'Boolean' },

  // Integer family — MongoDB Number is IEEE 754 double; fine for int32 range
  int: { schemaType: 'Number' },
  integer: { schemaType: 'Number' },

  // Real number family
  float: { schemaType: 'Number' },

  // Exact decimal family — use Decimal128 for financial accuracy
  decimal: { schemaType: 'Schema.Types.Decimal128' },
  money: { schemaType: 'Schema.Types.Decimal128' },

  // BigInt — supported natively in MongoDB 6.0+ via BSON Long
  bigint: { schemaType: 'Schema.Types.BigInt' },

  // Temporal
  date: { schemaType: 'Date' },
  datetime: { schemaType: 'Date' },
  timestamp: { schemaType: 'Date' }, // alias of datetime

  // Structured
  json: { schemaType: 'Schema.Types.Mixed' },
  object: { schemaType: 'Schema.Types.Mixed' },
  any: { schemaType: 'Schema.Types.Mixed' },

  // Binary
  bytes: { schemaType: 'Buffer' },
});

export { DEFAULT_TYPE_MAPPING };

/**
 * Resolve a Mongoose schema type for an IR `type.name`, given optional
 * per-property overrides from projection config. Returns `undefined` when
 * the name is unknown and no override is supplied — the caller MUST emit
 * a diagnostic.
 */
export function resolveMongooseType(
  irTypeName: string,
  overrides: Readonly<Record<string, string>> | undefined,
  propertyName: string,
): MongooseSchemaType | undefined {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, propertyName)) {
    return { schemaType: overrides[propertyName] };
  }
  return DEFAULT_TYPE_MAPPING[irTypeName];
}
