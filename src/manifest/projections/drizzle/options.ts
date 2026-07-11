/**
 * Configuration surface for the Drizzle projection.
 *
 * Every relational concept (table name, column name, decimal precision,
 * composite indexes, type overrides) is supplied here at projection time.
 * NONE of these enter Manifest core grammar or IR. The projection translates
 * IR + this options bag into a Drizzle schema artifact.
 */

/** Entity name as it appears in IR (`IREntity.name`). */
export type EntityName = string;
/** Property name as it appears in IR (`IRProperty.name`). */
export type PropertyName = string;

/**
 * One index entry. Plain `string[]` means a composite index on those columns;
 * the object form lets the consumer supply a Drizzle index name.
 */
export type IndexEntry = string[] | { fields: string[]; name?: string };

/**
 * Structured foreign-key config for the `foreignKeys` option.
 */
export interface ForeignKeyConfig {
  /** Local FK column names */
  fields: string[];
  /** Remote/referenced column names. Defaults to `["id"]` when absent. */
  references?: string[];
  /** Drizzle referential action for onDelete. */
  onDelete?: string;
  /** Drizzle referential action for onUpdate. */
  onUpdate?: string;
}

export interface DrizzleProjectionOptions {
  /**
   * Drizzle dialect. Controls which column types and imports are emitted.
   * Default: 'postgresql'.
   */
  dialect?: 'postgresql' | 'mysql' | 'sqlite';

  /**
   * Per-entity table-name override.
   *   tableMappings: { Widget: "widgets" }
   * → emits `export const widgets = pgTable("widgets", { ... })`
   */
  tableMappings?: Record<EntityName, string>;

  /**
   * Per-entity, per-property column-name override.
   *   columnMappings: { Widget: { createdAt: "created_at" } }
   * → emits `createdAt: varchar("created_at", { length: 255 })`
   */
  columnMappings?: Record<EntityName, Record<PropertyName, string>>;

  /**
   * Per-entity, per-property decimal precision/scale for numeric columns.
   *   precision: { Widget: { price: { precision: 12, scale: 2 } } }
   * → emits `price: numeric("price", { precision: 12, scale: 2 })`
   */
  precision?: Record<EntityName, Record<PropertyName, { precision: number; scale: number }>>;

  /**
   * Per-entity composite/named index definitions.
   *   indexes: { Widget: [["sku", "createdAt"], { fields: ["name"], name: "widget_name_idx" }] }
   */
  indexes?: Record<EntityName, IndexEntry[]>;

  /**
   * Per-entity, per-property type override. Bypasses the default
   * IR-`type.name` → Drizzle-type mapping. The value is the *literal* Drizzle
   * builder name (e.g. `"integer"`, `"text"`, `"uuid"`, `"timestamp"`).
   */
  typeMappings?: Record<EntityName, Record<PropertyName, string>>;

  /**
   * Per-entity, per-relationship foreign-key override.
   *
   * For `belongsTo` / `ref` relationships, the projection emits an FK
   * column. The FK column name defaults to `${relationshipName}Id`.
   */
  foreignKeys?: Record<EntityName, Record<string, string | ForeignKeyConfig>>;

  /**
   * Schema file name for imports (e.g. "schema" means import from './schema').
   * Default: 'schema'.
   */
  schemaExportName?: string;

  /**
   * Output path hint for the emitted artifact. Default: 'schema.ts'.
   */
  output?: string;
}

export const DRIZZLE_PROJECTION_DEFAULTS: Required<
  Pick<DrizzleProjectionOptions, 'output' | 'dialect' | 'schemaExportName'>
> = {
  output: 'schema.ts',
  dialect: 'postgresql',
  schemaExportName: 'schema',
} as const;

/**
 * Normalize a raw `request.options` bag into a fully-typed options object.
 */
export function normalizeOptions(
  raw: Record<string, unknown> | undefined,
): DrizzleProjectionOptions {
  const input = (raw ?? {}) as Partial<DrizzleProjectionOptions>;
  return {
    dialect: input.dialect ?? DRIZZLE_PROJECTION_DEFAULTS.dialect,
    tableMappings: input.tableMappings ?? {},
    columnMappings: input.columnMappings ?? {},
    precision: input.precision ?? {},
    indexes: input.indexes ?? {},
    typeMappings: input.typeMappings ?? {},
    foreignKeys: input.foreignKeys ?? {},
    schemaExportName: input.schemaExportName ?? DRIZZLE_PROJECTION_DEFAULTS.schemaExportName,
    output: input.output ?? DRIZZLE_PROJECTION_DEFAULTS.output,
  };
}
