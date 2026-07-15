/**
 * IR type → Elasticsearch field type mapping table.
 *
 * Mirrors the Drizzle projection's `DEFAULT_TYPE_MAPPING` pattern:
 * a frozen record of IR type names to ES field type definitions.
 *
 * CRITICAL: 'number' is INTENTIONALLY ABSENT — it is ambiguous in Manifest
 * (could be int, float, or decimal). Mapping it silently would produce
 * incorrect ES types. The generator emits a hard `ELASTICSEARCH_AMBIGUOUS_NUMBER`
 * diagnostic instead. No silent fallback, ever.
 *
 * Additional unsupported types (e.g. 'bytes', 'uuid' as text) produce
 * `ELASTICSEARCH_UNSUPPORTED_TYPE` diagnostics.
 */

export interface ESFieldType {
  /** Elasticsearch field type (keyword, text, integer, long, etc.) */
  type: string;
  /** Whether doc_values are enabled (default: true for keyword/numeric) */
  doc_values?: boolean;
  /** Optional index setting (e.g. false for large text fields) */
  index?: boolean;
  /** Scaling factor for scaled_float */
  scaling_factor?: number;
  /** Optional analyzer hint (standard, simple, whitespace) */
  analyzer?: string;
}

export const ES_TYPE_MAPPING: Readonly<Record<string, ESFieldType>> = Object.freeze({
  string: { type: 'keyword' },
  text: { type: 'text' },
  uuid: { type: 'keyword' },
  int: { type: 'integer' },
  bigint: { type: 'long' },
  float: { type: 'float' },
  decimal: { type: 'scaled_float', scaling_factor: 100 },
  boolean: { type: 'boolean' },
  date: { type: 'date' },
  datetime: { type: 'date' },
  timestamp: { type: 'date' }, // alias of datetime
  json: { type: 'object', doc_values: false, index: false },
  // 'number' is deliberately absent — see file header.
});

/** Types that the generator will refuse to map (produces diagnostic). */
export const UNSUPPORTED_ES_TYPES: ReadonlySet<string> = new Set([
  'number', // ambiguous — see file header
  'bytes', // binary — not representable as a search field
]);
