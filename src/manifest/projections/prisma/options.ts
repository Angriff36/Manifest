/**
 * Configuration surface for the Prisma projection.
 *
 * THIS IS THE CONSUMER-FACING CONFIG SCHEMA.
 *
 * Every relational concept (table name, column name, decimal precision,
 * composite indexes, type overrides) is supplied here at projection time.
 * NONE of these enter Manifest core grammar or IR. The projection translates
 * IR + this options bag into a Prisma schema artifact.
 *
 * Shape invariant (locked at Checkpoint 1):
 *   ALL per-property options use the NESTED form
 *       Record<EntityName, Record<PropertyName, X>>
 *   No dotted-string `"Entity.property"` keys exist anywhere on this surface.
 *   This keeps the option shape uniform across keys and makes config files
 *   trivially mergeable by entity name.
 */

import type { NamingConventionInput } from '../shared/naming.js';

export type { NamingConventionInput };

/** Entity name as it appears in IR (`IREntity.name`). */
export type EntityName = string;
/** Property name as it appears in IR (`IRProperty.name`). */
export type PropertyName = string;

/**
 * Structured foreign-key config for the `foreignKeys` option.
 * When a consumer needs to supply fields, references, and/or referential
 * actions at projection time rather than in the .manifest source, they
 * use this object form instead of a plain string.
 */
export interface ForeignKeyConfig {
  /** Local FK column names */
  fields: string[];
  /** Remote/referenced column names. Defaults to `["id"]` when absent. */
  references?: string[];
  /** Prisma referential action for onDelete. */
  onDelete?: string;
  /** Prisma referential action for onUpdate. */
  onUpdate?: string;
}

/**
 * Prisma datasource provider. When set, the projection emits a `datasource`
 * block. When omitted, the projection emits only `model` blocks (consumer
 * is expected to merge them into an existing schema.prisma).
 */
export type PrismaProvider =
  | 'postgresql'
  | 'mysql'
  | 'sqlite'
  | 'sqlserver'
  | 'mongodb'
  | 'cockroachdb';

/**
 * One index entry. Plain `string[]` means a composite index on those columns;
 * the object form lets the consumer supply a Prisma `name`.
 */
export type IndexEntry =
  | string[]
  | { fields: string[]; name?: string };

/**
 * Multi-schema layout config.
 *
 * Manifest entities already carry their module membership in IR
 * (`IREntity.module`). By default the Prisma projection flattens every model
 * into the database's default schema. Enabling `multiSchema` preserves the
 * real module layout by emitting a `@@schema("...")` attribute on each model
 * and a `schemas = [...]` list on the datasource.
 *
 * Per-model schema resolution (when `enabled`):
 *   1. `entitySchema[entityName]` if present  (explicit override)
 *   2. else the entity's IR `module` name      (the real layout)
 *   3. else `defaultSchema` (default `"public"`)
 *
 * Multi-schema is a PostgreSQL / CockroachDB / SQL Server capability. Enabling
 * it with any other provider produces a hard diagnostic and the projection
 * falls back to the flat layout.
 */
export interface MultiSchemaConfig {
  /** Master switch. Default false — flat layout, fully back-compatible. */
  enabled?: boolean;
  /**
   * Explicit datasource schema list. Order is preserved; any schema actually
   * used by a model but missing here is appended (sorted) so the datasource
   * always lists every referenced schema, as Prisma requires.
   */
  schemas?: string[];
  /** Per-entity schema override. Takes precedence over the entity's module. */
  entitySchema?: Record<EntityName, string>;
  /** Schema for entities with neither an override nor a module. Default `"public"`. */
  defaultSchema?: string;
}

export interface PrismaProjectionOptions {
  /**
   * Prisma datasource provider. Drives the optional `datasource db { ... }`
   * block emitted at the top of the artifact. Omit to emit models only.
   */
  provider?: PrismaProvider;

  /**
   * Per-entity table-name override.
   *   tableMappings: { Widget: "widgets" }
   * → emits `@@map("widgets")` inside the Widget model.
   */
  tableMappings?: Record<EntityName, string>;

  /**
   * Per-entity, per-property column-name override.
   *   columnMappings: { Widget: { createdAt: "created_at" } }
   * → emits `@map("created_at")` on the createdAt field.
   */
  columnMappings?: Record<EntityName, Record<PropertyName, string>>;

  /**
   * Per-entity, per-property decimal precision/scale. The presence of a
   * mapping here implies the column maps to `Decimal` (or whatever the
   * resolved type is) with a `@db.Decimal(precision, scale)` attribute.
   *
   * Nested shape (Checkpoint 1 amendment — NO flattened "Entity.property" keys):
   *   precision: { Widget: { price: { precision: 12, scale: 2 } } }
   */
  precision?: Record<EntityName, Record<PropertyName, { precision: number; scale: number }>>;

  /**
   * Per-entity composite/named index definitions. Each entry becomes a
   * `@@index([...])` line on the model.
   *
   *   indexes: { Widget: [["tenantId", "createdAt"], { fields: ["sku"], name: "widget_sku_idx" }] }
   */
  indexes?: Record<EntityName, IndexEntry[]>;

  /**
   * Per-entity, per-property type override. Bypasses the default
   * IR-`type.name` → Prisma-type mapping. The value is the *literal* Prisma
   * scalar (e.g. `"Int"`, `"BigInt"`, `"Decimal"`, `"String"`, `"DateTime"`).
   *
   *   typeMappings: { Widget: { qty: "Int" } }
   */
  typeMappings?: Record<EntityName, Record<PropertyName, string>>;

  /**
   * Per-entity, per-relationship foreign-key override.
   *
   * For `belongsTo` / `ref` relationships, the projection emits an FK
   * scalar field plus a relation field. The FK field name defaults to
   * `${relationshipName}Id` (or the IR's `foreignKey` annotation if set).
   *
   * Two shapes are accepted:
   *
   * **String** — overrides the FK column name only:
   *   foreignKeys: { Book: { author: "writerId" } }
   * → Book emits `writerId String` + `author Author @relation(fields: [writerId], references: [id])`
   *
   * **Object** — full FK definition with fields, references, and optional onDelete:
   *   foreignKeys: { Book: { author: { fields: ["writerId"], references: ["id"], onDelete: "Cascade" } } }
   * → Same output as above, but with explicit references and referential action.
   *
   * Nested-key shape, same as every other per-property option.
   */
  foreignKeys?: Record<EntityName, Record<string, string | ForeignKeyConfig>>;

  /**
   * Per-entity, per-property native database type annotations.
   *
   * Values are the Prisma `@db.*` suffix WITHOUT the `@db.` prefix.
   * Emitted as `@db.<value>` after `@map` and before any `@db.Decimal`
   * precision annotation.
   *
   *   dbAttributes: { Widget: { id: "Uuid", createdAt: "Timestamptz(6)" } }
   * → emits `@db.Uuid` / `@db.Timestamptz(6)` on those fields.
   *
   * This is the generic `@db.*` emission path. The only other `@db.*`
   * emissions are `@db.Decimal(p,s)` (via `precision` config) and
   * `@db.ObjectId` (auto-emitted for MongoDB String ids). When both
   * a `dbAttributes` entry and a precision-derived `@db.Decimal` would
   * apply to the same field, `@db.Decimal` wins and `dbAttributes` is
   * skipped (Prisma allows only one `@db.*` per field).
   */
  dbAttributes?: Record<EntityName, Record<PropertyName, string>>;

  /**
   * Per-entity, per-property Prisma field attributes to emit verbatim.
   *
   * Each string is a complete Prisma attribute (e.g. `"@unique"`,
   * `"@default(now())"`, `"@updatedAt"`, `"@default(dbgenerated(\"...\"))"`).
   * Attributes already emitted by the standard pipeline (e.g. `@unique`
   * from `prop.modifiers`, `@default(...)` from `prop.defaultValue`) are
   * NOT duplicated — only novel attributes are added.
   *
   *   fieldAttributes: { Widget: { id: ["@unique", "@default(dbgenerated(\"gen_random_uuid()\"))"] } }
   */
  fieldAttributes?: Record<EntityName, Record<PropertyName, string[]>>;

  /**
   * Environment variable name for the database connection URL in the emitted
   * `prisma.config.ts` companion artifact. Defaults to `"DATABASE_URL"`.
   * Only relevant when `provider` is set (a `prisma.config.ts` is only emitted
   * when a datasource block is also being emitted).
   */
  urlEnvVar?: string;

  /**
   * Output path hint for the emitted artifact. The projection itself does
   * not write files; this value flows through to `ProjectionArtifact.pathHint`
   * so the CLI/consumer writer knows where to put it. Default: `"schema.prisma"`.
   */
  output?: string;

  /**
   * Datasource `relationMode`. Emitted as `relationMode = "..."` on the
   * `datasource db` block when set. Use `"prisma"` for providers/hosts that
   * enforce relations in the client (PlanetScale, Neon pooled, etc.) rather
   * than via database foreign keys. Omit for the Prisma default.
   * Only relevant when `provider` is set (a datasource block is emitted).
   */
  relationMode?: 'prisma' | 'foreignKeys';

  /**
   * Fields for the emitted `generator client { ... }` block. Each entry is
   * emitted verbatim as `key = "value"`. Defaults to
   * `{ provider: "prisma-client-js" }` (back-compatible). Override to select the
   * newer `prisma-client` generator and set `output`, `moduleFormat`,
   * `generatedFileExtension`, `importFileExtension`, etc.
   *   generator: { provider: "prisma-client", output: "../generated", moduleFormat: "esm" }
   * Only relevant when `provider` is set (a generator block is emitted).
   */
  generator?: Record<string, string>;

  /**
   * Multi-schema layout. When enabled, models are placed into database schemas
   * derived from their IR module (overridable per entity) instead of being
   * flattened into the default schema. See {@link MultiSchemaConfig}.
   */
  multiSchema?: MultiSchemaConfig;

  /**
   * Automatic identifier casing convention. Opt-in; when omitted the
   * projection emits IR names verbatim (fully back-compatible).
   *
   * The convention only ever adds `@map`/`@@map` attributes — the Prisma
   * model name and field identifiers stay as the IR name, so relation
   * `fields`/`references` and indexes are unaffected. Only the *physical*
   * database name changes.
   *
   * String shorthand:
   *   naming: 'snake_case'
   *     ≡ { table: 'snake_case', column: 'snake_case', pluralizeTables: true }
   *   → `createdAt` column emits `@map("created_at")`,
   *     `Widget` model emits `@@map("widgets")`.
   *
   * Resolution order per name:
   *   1. explicit `tableMappings` / `columnMappings` override (always wins)
   *   2. this convention (emits `@map`/`@@map` only when the physical name differs)
   *   3. IR name verbatim
   *
   * Explicit `tableMappings` is the escape hatch for irregular plurals the
   * built-in pluralizer gets wrong.
   */
  naming?: NamingConventionInput;

  /**
   * Auto-emit the inverse relation field on a target model for any
   * `belongsTo`/`ref` that lacks an explicit opposite. Opt-in; default false
   * (fully back-compatible — without it, a one-sided relation surfaces a
   * `PRISMA_RELATION_MISSING_BACKSIDE` warning and Prisma rejects the schema).
   *
   * When enabled, for every `belongsTo`/`ref` on entity E that targets T and is
   * not already covered by a declared `hasMany`/`hasOne` on T, the projection
   * emits `<pluralCamelE> E[]` on T. Ambiguous pairs (multiple relations between
   * E and T) get a deterministic `@relation("E_<rel>")` name matching the
   * FK-owning side, so both sides agree. Eliminates the need to hand-author
   * inverse `hasMany` on hub entities (User, Event, …).
   */
  autoBackRelations?: boolean;
}

/**
 * Defaults. Kept as an exported const so consumers and tests can introspect
 * them. The projection's normalizeOptions layers user input over these.
 */
export const PRISMA_PROJECTION_DEFAULTS: Required<Pick<PrismaProjectionOptions, 'output'>> = {
  output: 'schema.prisma',
} as const;

/**
 * Normalize a raw `request.options` bag into a fully-typed options object.
 *
 * The CLI/registry passes `Record<string, unknown>` through the
 * ProjectionRequest interface; this is the single funnel where we lock in
 * defaults and stop trusting the wire shape.
 *
 * NOTE: We deliberately do NOT validate option contents here beyond shape
 * coercion. Schema-level validation (e.g. ajv against the JSON schema)
 * happens earlier in the CLI's config loader. Once normalized, the
 * projection trusts the contents.
 */
export function normalizeOptions(raw: Record<string, unknown> | undefined): PrismaProjectionOptions {
  const input = (raw ?? {}) as Partial<PrismaProjectionOptions>;
  return {
    provider: input.provider,
    tableMappings: input.tableMappings ?? {},
    columnMappings: input.columnMappings ?? {},
    precision: input.precision ?? {},
    indexes: input.indexes ?? {},
    typeMappings: input.typeMappings ?? {},
    foreignKeys: input.foreignKeys ?? {},
    dbAttributes: input.dbAttributes ?? {},
    fieldAttributes: input.fieldAttributes ?? {},
    urlEnvVar: input.urlEnvVar,
    relationMode: input.relationMode,
    generator: input.generator,
    output: input.output ?? PRISMA_PROJECTION_DEFAULTS.output,
    // Passed through as-is. Absent → undefined → flat layout (back-compat).
    // resolveSchemaName in the generator guards on multiSchema?.enabled.
    multiSchema: input.multiSchema,
    // Auto-emit inverse relation fields for one-sided belongsTo/ref. Default false.
    autoBackRelations: input.autoBackRelations ?? false,
    // Passed through as-is. Absent → undefined → IR names verbatim (back-compat).
    // The generator normalizes the shorthand/object form via normalizeNaming.
    naming: input.naming,
  };
}
