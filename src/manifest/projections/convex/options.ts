/**
 * Configuration surface for the Convex projection.
 *
 * THIS IS THE CONSUMER-FACING CONFIG SCHEMA.
 *
 * Every Convex-specific concept (table name, validator override, indexes,
 * reference field naming, identity mode) is supplied here at projection time.
 * NONE of these enter Manifest core grammar or IR. The projection translates
 * IR + this options bag into Convex artifacts.
 *
 * Shape invariant (matches the Prisma projection): all per-property options use
 * the NESTED form `Record<EntityName, Record<PropertyName, X>>`. No dotted-string
 * `"Entity.property"` keys exist anywhere on this surface.
 *
 * ## Naming precedence
 *
 * 1. App-wide `naming.normalization` (via Manifest config) owns identifier
 *    spelling when enabled. Canonical IR names and Manifest table forms win.
 * 2. Convex-local `naming` is a **compatibility escape hatch** only. When
 *    app-wide normalization is on, local `naming` is ignored so this projection
 *    cannot silently invent a second spelling.
 * 3. `tableMappings` / `references` are storage escape hatches (legacy DBs /
 *    imported schemas). They never change Manifest’s canonical names.
 */

import type { NamingConventionInput } from '../shared/naming.js';
import type { ResolvedNamingConfig } from '../../naming-config.js';
import type { ProjectionDiagnostic } from '../interface.js';
import type { IR } from '../../ir.js';
import { canonicalTableName } from '../../canonical-names.js';
import { resolveTableName } from '../shared/naming.js';

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
 * - `'convexId'` (default) → `<fk>: v.id("<targetTable>")`. Idiomatic Convex
 *   for **new** Manifest-generated apps.
 * - `'stringId'` → `<fk>: v.string()`. **Compatibility escape hatch** when
 *   references must carry external/app-level string ids (imported data or an
 *   outside system). New greenfield apps should keep `'convexId'`.
 */
export type ReferenceMode = 'convexId' | 'stringId';

/**
 * @internal Injected by `resolveProjectionOptions` — not a consumer option.
 * Carries app-wide naming policy (normalization + legacy storage remaps).
 */
export type ManifestNamingInjection = ResolvedNamingConfig;

/**
 * Internal options bag keys that may appear on `request.options` after config
 * resolution. Kept off {@link ConvexProjectionOptions} so consumers never set them.
 */
export interface ConvexInternalOptionsBag {
  __manifestNaming?: ManifestNamingInjection;
}

export interface ConvexProjectionOptions {
  /**
   * Output path hint for the emitted artifact. The projection does not write
   * files; this flows through to `ProjectionArtifact.pathHint`.
   * Default: `"convex/schema.ts"`.
   */
  output?: string;

  /**
   * **Compatibility escape hatch** — not for normal greenfield apps.
   * Maps a Manifest entity to an existing Convex table name (legacy DB,
   * imported schema, or an outside system you cannot rename). Prefer fixing
   * Manifest naming / reporting a generator bug over hand-mapping new apps.
   *   tableMappings: { CateringEvent: "events" }
   */
  tableMappings?: Record<EntityName, string>;

  /**
   * **Compatibility escape hatch** — not for normal greenfield apps.
   * Per-property Convex validator literal when the default mapping is wrong
   * for a deployed/imported column. Incorrect generated validators for
   * ordinary Manifest types should be reported as Manifest bugs, not papered
   * over here.
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
   * **Compatibility escape hatch** — not for normal greenfield apps.
   * Renames a relationship’s foreign-key field at the Convex storage boundary
   * only (e.g. Manifest `author` → stored `writerId`). Application-facing /
   * Manifest names stay canonical. Use for legacy columns; do not invent
   * divergent FK names in new apps.
   *   references: { Book: { author: "writerId" } }
   */
  references?: Record<EntityName, Record<string, string>>;

  /**
   * Identity representation for references. Default `'convexId'` (prefer for
   * new apps). See {@link ReferenceMode}. `'stringId'` is a compatibility
   * escape hatch for external string ids.
   */
  referenceMode?: ReferenceMode;

  /**
   * **Compatibility escape hatch** — physical table casing for this projection
   * only. Prefer app-wide `naming` / `naming.normalization` in Manifest config.
   * When app-wide normalization is enabled, this option is **ignored** so Convex
   * cannot silently emit a second spelling. Defaults to Convex-idiomatic
   * `{ table: 'camelCase', pluralizeTables: true }` only when app-wide
   * normalization is off and no convention was inherited from config.
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
   * `'enforce'`. Requires {@link authContextImport} whenever the IR has
   * authorization policies — Manifest identity is not available on bare
   * `ctx.auth`. Set `'skip'` only for local demos with no auth (also turn off
   * tenant filtering if you have no identity module).
   */
  policyMode?: 'enforce' | 'skip';

  /**
   * Module that maps Convex’s real identity (`ctx.auth.getUserIdentity()` and
   * your claims) into Manifest’s `{ role, <tenantProp>, … }` shape via
   * `getAuthContext(ctx)`. **Required** when tenant filtering or policy
   * enforcement is active — without it, generation fails with
   * `CONVEX_AUTH_CONTEXT_REQUIRED` instead of emitting ineffective
   * `(ctx as any).auth` reads. Example: `"./lib/authContext"`.
   */
  authContextImport?: string;

  /**
   * Keep list/get results inside the caller’s tenant. Default `true`.
   * When on, generated reads never take a client-supplied tenant id; they use
   * the authenticated tenant from {@link authContextImport}. Requires that
   * import whenever the IR declares a tenant column.
   */
  includeTenantFilter?: boolean;

  /**
   * Hide soft-deleted rows from list/get. Default `true`.
   * Rows with a non-null soft-delete timestamp (see {@link deletedAtProperty})
   * are filtered out of reads when the entity declares that column.
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
   * How callers receive computed fields. Default `'helpers'`.
   * - `'helpers'` → separate `compute<Entity>(doc)` helpers you call from app code
   * - `'inline'` → fold self-only computeds into get/list return values
   * Missing/unresolved computeds always surface as diagnostics (no silent drop).
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
 * Convex-idiomatic physical table convention when app-wide normalization is
 * off and no inherited/local naming escape hatch is set.
 */
export const CONVEX_DEFAULT_NAMING: NamingConventionInput = {
  table: 'camelCase',
  pluralizeTables: true,
};

export type NormalizedConvexOptions = Required<
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
  Pick<ConvexProjectionOptions, 'naming' | 'tenantIdProperty' | 'authContextImport'> & {
    /** @internal App-wide naming policy when injected by config resolution. */
    manifestNaming?: ManifestNamingInjection;
  };

/**
 * Normalize a raw `request.options` bag into a fully-typed options object.
 * Single trust boundary: after this, the projection trusts the contents.
 * Strips `__manifestNaming` from the consumer shape and keeps it internal.
 */
export function normalizeOptions(
  raw: Record<string, unknown> | undefined,
): NormalizedConvexOptions {
  const input = (raw ?? {}) as Partial<ConvexProjectionOptions> & ConvexInternalOptionsBag;
  const manifestNaming = input.__manifestNaming;
  const tableMappings = { ...(input.tableMappings ?? {}) };
  const references = { ...(input.references ?? {}) };
  const legacy = manifestNaming?.projections?.convex;
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

  // App-wide normalization owns spelling — drop local naming so it cannot
  // silently recreate different table names in this projection.
  const naming =
    manifestNaming?.normalization === true ? undefined : input.naming;

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
    naming,
    manifestNaming,
  };
}

/** Diagnostics for local naming ignored under app-wide normalization. */
export function collectConvexNamingPrecedenceDiagnostics(
  raw: Record<string, unknown> | undefined,
  options: NormalizedConvexOptions,
): ProjectionDiagnostic[] {
  const input = (raw ?? {}) as Partial<ConvexProjectionOptions> & ConvexInternalOptionsBag;
  if (options.manifestNaming?.normalization !== true) return [];
  if (input.naming === undefined) return [];
  return [
    {
      severity: 'warning',
      code: 'CONVEX_LOCAL_NAMING_IGNORED',
      message:
        'Convex options.naming is ignored because app-wide naming.normalization is enabled. ' +
        'Manifest owns identifier spelling; use naming.projections.convex.tables/fields ' +
        '(or options.tableMappings/references) only as legacy storage escape hatches.',
    },
  ];
}

/**
 * Resolve the Convex table key for an entity.
 * Precedence: tableMappings → app-wide normalized table form → local/default naming.
 */
export function resolveConvexTableName(
  entityName: string,
  options: NormalizedConvexOptions,
): string {
  const override = options.tableMappings[entityName];
  if (override) return override;
  if (options.manifestNaming?.normalization) {
    return canonicalTableName(entityName, options.manifestNaming);
  }
  return resolveTableName(entityName, options.naming ?? CONVEX_DEFAULT_NAMING);
}

/**
 * Fail closed when authorization or tenant protection would otherwise depend on
 * the ineffective legacy `(ctx as any).auth` bag.
 */
export function collectConvexAuthConfigDiagnostics(
  ir: IR,
  options: NormalizedConvexOptions,
): ProjectionDiagnostic[] {
  if (options.authContextImport) return [];

  const tenantProp = options.tenantIdProperty ?? ir.tenant?.property;
  const tenantFilterActive =
    options.includeTenantFilter &&
    !!tenantProp &&
    ir.entities.some((e) => e.properties.some((p) => p.name === tenantProp));

  const hasPolicies =
    (ir.policies?.length ?? 0) > 0 ||
    (ir.commands ?? []).some((c) => (c.policies?.length ?? 0) > 0);
  const policyEnforceActive = options.policyMode === 'enforce' && hasPolicies;

  if (!tenantFilterActive && !policyEnforceActive) return [];

  const reasons: string[] = [];
  if (tenantFilterActive) {
    reasons.push('tenant read filtering is on and this IR declares a tenant column');
  }
  if (policyEnforceActive) {
    reasons.push("policyMode is 'enforce' and this IR declares authorization policies");
  }

  return [
    {
      severity: 'error',
      code: 'CONVEX_AUTH_CONTEXT_REQUIRED',
      message:
        `Convex projection requires options.authContextImport because ${reasons.join('; ')}. ` +
        'The real Convex runtime does not populate Manifest identity on ctx.auth ' +
        '(only getUserIdentity()). Provide a module exporting getAuthContext(ctx), ' +
        "or for unauthenticated local demos set policyMode: 'skip' and includeTenantFilter: false.",
    },
  ];
}
