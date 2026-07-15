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
export type IndexEntry = string[] | { fields: string[]; name?: string };

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

  /**
   * Name of the system events table. Default `"manifestEvents"`. If the
   * resolved name collides with an entity's table, it is deterministically
   * suffixed to stay unique (with a diagnostic).
   */
  eventsTable?: string;

  /**
   * Name of the webhook idempotency-keys table auto-emitted in the schema when
   * any webhook declares `idempotencyHeader`. Default `"webhookIdempotencyKeys"`.
   * The generated http surface also references this table name.
   */
  idempotencyTable?: string;

  /**
   * Authorization-policy enforcement in generated mutations. Default
   * `'enforce'`. Set to `'skip'` for dev/demo builds that have no auth context
   * configured: the role/policy (authorization) checks are omitted, while
   * guards and constraints (state validation) are still enforced. Production
   * builds should keep the default `'enforce'`.
   */
  policyMode?: 'enforce' | 'skip';

  /**
   * Module specifier of an author-owned auth-context module (e.g.
   * `"./lib/authContext"`, resolved relative to the generated files). When set,
   * generated functions derive identity through its exported
   * `getAuthContext(ctx)` instead of reading `(ctx as any).auth` — a bag the
   * real Convex runtime never populates (`ctx.auth` only exposes
   * `getUserIdentity()`), so without this seam every role/tenant read
   * evaluates against `undefined`. Two write-side protections also activate
   * for tenant-scoped entities:
   * - `create` mutations set the tenant column from the auth context; it is
   *   no longer a client-supplied argument.
   * - instance mutations throw when the target document belongs to another
   *   tenant.
   * Contract: `getAuthContext(ctx)` returns (or resolves to) an object
   * carrying at least `role` and the tenant property. Crons/sagas/webhooks
   * invoke the same governed mutations, so the module must also handle
   * identity-less system calls. Unset (default) keeps the legacy inline
   * `ctx.auth` reads.
   */
  authContextImport?: string;

  /**
   * Scope the unfiltered `list<Entity>` / `get<Entity>` reads to the current
   * tenant. Default `true`. Field-aware: only applied to entities that actually
   * declare the tenant column. The tenant id is derived from the authenticated
   * identity (`ctx.auth.<tenantProp>`), never from a client argument — so an
   * un-scoped `list<Entity>()` cannot return rows across tenants. Mirrors the
   * Next.js projection's `includeTenantFilter`.
   */
  includeTenantFilter?: boolean;

  /**
   * Exclude soft-deleted rows (`<deletedAtProperty> != null`) from generated
   * reads. Default `true`. Field-aware: only applied to entities that declare
   * the soft-delete column. Mirrors the Next.js projection's
   * `includeSoftDeleteFilter`.
   */
  includeSoftDeleteFilter?: boolean;

  /**
   * Override the tenant property name used for read scoping. Defaults to the
   * IR's declared tenant property (`ir.tenant.property`) when omitted.
   */
  tenantIdProperty?: string;

  /**
   * Soft-delete property name. Default `"deletedAt"`. A read excludes rows
   * whose value for this property is non-null when `includeSoftDeleteFilter`
   * is on and the entity declares the column.
   */
  deletedAtProperty?: string;

  /**
   * How computed properties are emitted. Default `'helpers'`.
   * - `'helpers'` → `convex/computed.ts` with `compute<Entity>(doc)` pure functions
   * - `'inline'` → materialize self-only computeds into get/list returns
   * There is no `'off'`: unresolved computeds always emit diagnostics.
   */
  computedProperties?: 'helpers' | 'inline';
}

/**
 * Defaults, exported so consumers and tests can introspect them.
 */
export const CONVEX_PROJECTION_DEFAULTS = {
  output: 'convex/schema.ts',
  referenceMode: 'convexId' as ReferenceMode,
  emitEventsTable: true,
  eventsTable: 'manifestEvents',
  idempotencyTable: 'webhookIdempotencyKeys',
  policyMode: 'enforce' as 'enforce' | 'skip',
  includeTenantFilter: true,
  includeSoftDeleteFilter: true,
  deletedAtProperty: 'deletedAt',
  computedProperties: 'helpers' as 'helpers' | 'inline',
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
export function normalizeOptions(
  raw: Record<string, unknown> | undefined,
): Required<
  Pick<
    ConvexProjectionOptions,
    | 'output'
    | 'referenceMode'
    | 'tableMappings'
    | 'typeMappings'
    | 'indexes'
    | 'references'
    | 'emitEventsTable'
    | 'eventsTable'
    | 'idempotencyTable'
    | 'policyMode'
    | 'includeTenantFilter'
    | 'includeSoftDeleteFilter'
    | 'deletedAtProperty'
    | 'computedProperties'
  >
> &
  Pick<ConvexProjectionOptions, 'naming' | 'tenantIdProperty' | 'authContextImport'> {
  const input = (raw ?? {}) as Partial<ConvexProjectionOptions> & {
    __manifestNaming?: {
      projections?: { convex?: { tables?: Record<string, string>; fields?: Record<string, string> } };
    };
  };
  const tableMappings = { ...(input.tableMappings ?? {}) };
  const references = { ...(input.references ?? {}) };
  const legacy = input.__manifestNaming?.projections?.convex;
  if (legacy?.tables) {
    for (const [entity, table] of Object.entries(legacy.tables)) {
      if (tableMappings[entity] === undefined) tableMappings[entity] = table;
    }
  }
  if (legacy?.fields) {
    for (const [key, col] of Object.entries(legacy.fields)) {
      const dot = key.indexOf('.');
      if (dot <= 0) continue;
      const entity = key.slice(0, dot);
      const rel = key.slice(dot + 1);
      if (!references[entity]) references[entity] = {};
      if (references[entity]![rel] === undefined) references[entity]![rel] = col;
    }
  }
  return {
    output: input.output ?? CONVEX_PROJECTION_DEFAULTS.output,
    referenceMode: input.referenceMode ?? CONVEX_PROJECTION_DEFAULTS.referenceMode,
    tableMappings,
    typeMappings: input.typeMappings ?? {},
    indexes: input.indexes ?? {},
    references,
    emitEventsTable: input.emitEventsTable ?? CONVEX_PROJECTION_DEFAULTS.emitEventsTable,
    eventsTable: input.eventsTable ?? CONVEX_PROJECTION_DEFAULTS.eventsTable,
    idempotencyTable: input.idempotencyTable ?? CONVEX_PROJECTION_DEFAULTS.idempotencyTable,
    policyMode: input.policyMode ?? CONVEX_PROJECTION_DEFAULTS.policyMode,
    includeTenantFilter:
      input.includeTenantFilter ?? CONVEX_PROJECTION_DEFAULTS.includeTenantFilter,
    includeSoftDeleteFilter:
      input.includeSoftDeleteFilter ?? CONVEX_PROJECTION_DEFAULTS.includeSoftDeleteFilter,
    deletedAtProperty: input.deletedAtProperty ?? CONVEX_PROJECTION_DEFAULTS.deletedAtProperty,
    computedProperties: input.computedProperties ?? CONVEX_PROJECTION_DEFAULTS.computedProperties,
    tenantIdProperty: input.tenantIdProperty,
    authContextImport: input.authContextImport,
    naming: input.naming,
  };
}
