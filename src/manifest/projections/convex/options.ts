/**
 * Configuration surface for the Convex projection.
 *
 * THIS IS THE CONSUMER-FACING CONFIG SCHEMA.
 *
 * Every Convex-specific concept (table name, validator override, indexes,
 * reference field naming, identity mode) is supplied here at projection time.
 * NONE of these enter Manifest core grammar or IR. The projection translates
 * IR + this options bag into a `convex/schema.ts` artifact.
 *
 * Shape invariant (matches the Prisma projection): all per-property options use
 * the NESTED form `Record<EntityName, Record<PropertyName, X>>`. No dotted-string
 * `"Entity.property"` keys exist anywhere on this surface.
 */

import type { NamingConventionInput } from '../shared/naming.js';

export type { NamingConventionInput };

/** Entity name as it appears in IR (`IREntity.name`). */
export type EntityName = string;
/** Property name as it appears in IR (`IRProperty.name`). */
export type PropertyName = string;

/**
 * One index entry. Plain `string[]` is a composite index over those columns;
 * the object form lets the consumer supply an explicit Convex index name.
 */
export type IndexEntry =
  | string[]
  | { fields: string[]; name?: string };

/**
 * How `belongsTo` / `ref` relationships are represented in the schema.
 *
 * - `'convexId'` (default) → `<fk>: v.id("<targetTable>")`. Idiomatic Convex;
 *   the projection treats Convex's document `_id` as identity and drops the
 *   IR `id` scalar. References must therefore carry the parent's Convex `_id`
 *   (a Phase 2 / create-mutation concern).
 * - `'stringId'` → `<fk>: v.string()`. Use when references carry app-level
 *   string ids (UUIDs) rather than Convex document ids.
 */
export type ReferenceMode = 'convexId' | 'stringId';

export interface ConvexProjectionOptions {
  /**
   * Output path hint for the emitted artifact. The projection does not write
   * files; this flows through to `ProjectionArtifact.pathHint`.
   * Default: `"convex/schema.ts"`.
   */
  output?: string;

  /**
   * Per-entity table-name override. Always wins over the naming convention.
   *   tableMappings: { CateringEvent: "events" }
   */
  tableMappings?: Record<EntityName, string>;

  /**
   * Per-entity, per-property validator override. The value is the *literal*
   * Convex validator expression (e.g. `"v.number()"`, `"v.int64()"`).
   *   typeMappings: { Invoice: { total: "v.number()" } }
   */
  typeMappings?: Record<EntityName, Record<PropertyName, string>>;

  /**
   * Per-entity composite/named index definitions. Each entry becomes a
   * `.index("name", [...])` call on the table.
   *   indexes: { Order: [["tenantId", "createdAt"], { fields: ["sku"], name: "by_sku" }] }
   */
  indexes?: Record<EntityName, IndexEntry[]>;

  /**
   * Per-entity, per-relationship foreign-key field-name override. By default
   * the FK field name is the relationship's non-tenant `foreignKey.fields`
   * column (or `${relationshipName}Id`).
   *   references: { Book: { author: "writerId" } }
   */
  references?: Record<EntityName, Record<string, string>>;

  /**
   * Identity representation for references. Default `'convexId'`. See
   * {@link ReferenceMode}.
   */
  referenceMode?: ReferenceMode;

  /**
   * Table-name casing/pluralization convention. Defaults to Convex-idiomatic
   * `{ table: 'camelCase', pluralizeTables: true }` when omitted. Explicit
   * `tableMappings` is the escape hatch for irregular plurals.
   */
  naming?: NamingConventionInput;

  /**
   * Emit a system events table in the schema (the reactive event log that
   * governed mutations append to). Default `true`. The functions surface
   * inserts event rows into this table.
   */
  emitEventsTable?: boolean;

  /** Name of the system events table. Default `"events"`. */
  eventsTable?: string;

  /**
   * Authorization-policy enforcement in generated mutations. Default
   * `'enforce'`. Set to `'skip'` for dev/demo builds that have no auth context
   * configured: the role/policy (authorization) checks are omitted, while
   * guards and constraints (state validation) are still enforced. Production
   * builds should keep the default `'enforce'`.
   */
  policyMode?: 'enforce' | 'skip';
}

/**
 * Defaults, exported so consumers and tests can introspect them.
 */
export const CONVEX_PROJECTION_DEFAULTS = {
  output: 'convex/schema.ts',
  referenceMode: 'convexId' as ReferenceMode,
  emitEventsTable: true,
  eventsTable: 'events',
  policyMode: 'enforce' as 'enforce' | 'skip',
} as const;

/**
 * The Convex-idiomatic default naming convention applied when the consumer
 * supplies none: lower-camel-first, pluralized table keys.
 */
export const CONVEX_DEFAULT_NAMING: NamingConventionInput = {
  table: 'camelCase',
  pluralizeTables: true,
};

/**
 * Normalize a raw `request.options` bag into a fully-typed options object.
 * Single trust boundary: after this, the projection trusts the contents.
 */
export function normalizeOptions(raw: Record<string, unknown> | undefined): Required<
  Pick<ConvexProjectionOptions, 'output' | 'referenceMode' | 'tableMappings' | 'typeMappings' | 'indexes' | 'references' | 'emitEventsTable' | 'eventsTable' | 'policyMode'>
> & Pick<ConvexProjectionOptions, 'naming'> {
  const input = (raw ?? {}) as Partial<ConvexProjectionOptions>;
  return {
    output: input.output ?? CONVEX_PROJECTION_DEFAULTS.output,
    referenceMode: input.referenceMode ?? CONVEX_PROJECTION_DEFAULTS.referenceMode,
    tableMappings: input.tableMappings ?? {},
    typeMappings: input.typeMappings ?? {},
    indexes: input.indexes ?? {},
    references: input.references ?? {},
    emitEventsTable: input.emitEventsTable ?? CONVEX_PROJECTION_DEFAULTS.emitEventsTable,
    eventsTable: input.eventsTable ?? CONVEX_PROJECTION_DEFAULTS.eventsTable,
    policyMode: input.policyMode ?? CONVEX_PROJECTION_DEFAULTS.policyMode,
    // Absent → Convex-idiomatic default applied by the generator.
    naming: input.naming,
  };
}
