/**
 * Canonical defaults for the Next.js projection.
 *
 * This module is the single source of truth for every default value the
 * Next.js projection applies when an option is not explicitly set. It is
 * consumed by:
 *   - `generator.ts` — the projection itself, when normalising user options
 *   - `packages/cli/src/utils/config.ts` — when resolving an effective config
 *   - `manifest config print-defaults` — to render defaults for inspection
 *
 * Defaults are intentionally minimal: no auth, no tenant filtering, no
 * soft-delete. A basic `entity User { name: string }` should produce
 * runnable code against a standard Next.js project without any config.
 * Monorepo/auth/tenant setups opt in via `manifest.config.yaml`.
 */
import type { NextJsProjectionOptions } from '../interface';

/**
 * Default values applied to every Next.js projection option.
 *
 * Every key here corresponds to a documented option in
 * `docs/spec/config/manifest.config.md` and a schema entry in
 * `docs/spec/config/manifest.config.schema.json`. Adding a default here
 * without updating both is a documentation drift.
 */
export const NEXTJS_DEFAULTS = {
  authProvider: 'none',
  authImportPath: '@/lib/auth',
  databaseImportPath: '@/lib/database',
  responseImportPath: '@/lib/manifest-response',
  runtimeImportPath: '@/lib/manifest-runtime',
  includeTenantFilter: false,
  includeSoftDeleteFilter: false,
  tenantIdProperty: 'tenantId',
  deletedAtProperty: 'deletedAt',
  appDir: 'app/api',
  strictMode: true,
  includeComments: true,
  indentSize: 2,
  /**
   * HTTP status returned when the auth check fails OR when the auth helper
   * itself throws (e.g. invalid/expired token). 401 by default; some apps
   * standardise on 403 to avoid leaking "user exists but unauthorized".
   * Configurable per goal step 4 — auth failures must NEVER surface as 500.
   */
  unauthorizedStatus: 401,

  /** Route segment casing. `'lowercase'` (legacy) flattens `PrepTask` → `preptask`; `'kebab-case'` → `prep-task`, etc. */
  routeCasing: 'lowercase',

  /** date/datetime → `Date` by default; `'iso-string'` emits `string` for JSON transport. */
  dateSerialization: 'date',
} as const satisfies Required<Omit<
  NextJsProjectionOptions,
  | 'tenantProvider'
  | 'dispatcher'
  | 'concreteCommandRoutes'
  | 'readRoutes'
  | 'generatedDir'
  | 'paths'
  | 'naming'
  | 'accessorNames'
  | 'routeSegments'
>>;

/**
 * Default tenant provider hook.
 *
 * The projection assumes a tenant lookup helper of shape
 *   `(id: string) => Promise<string | null>`
 * imported from `importPath`. The lookup key (`orgId` vs `userId`) selects
 * which auth-context field is passed in. Override via
 * `projections.nextjs.options.tenantProvider`.
 */
export const DEFAULT_TENANT_PROVIDER = {
  importPath: '@/app/lib/tenant',
  functionName: 'getTenantIdForOrg',
  lookupKey: 'orgId',
} as const;

/**
 * Default Next.js dispatcher configuration.
 *
 * The dispatcher is the canonical write path at
 *   POST /api/manifest/[entity]/commands/[command]
 *
 * `executionMode` controls *how* the dispatcher invokes Manifest:
 *   - `inline`            — emit `createManifestRuntime` + `runtime.runCommand`
 *                           inline in the handler (default, preserves
 *                           historical behaviour).
 *   - `externalExecutor`  — import an app-owned executor function and
 *                           delegate to it. The handler becomes a thin
 *                           transport adapter. Required when downstream
 *                           apps centralise runtime construction.
 *
 * `deriveInstanceId` injects an `instanceId` derived from the URL/body
 * into the executor call when true. Off by default to avoid surprising
 * non-instance command callers.
 */
export const DISPATCHER_DEFAULTS = {
  enabled: true,
  executionMode: 'inline' as const,
  executorImportPath: '@/lib/manifest-executor',
  executorImportName: 'executeManifestCommand',
  /**
   * Whether the dispatcher extracts an `instanceId` from `body.instanceId`
   * or `body.id` and forwards it to runCommand / the executor.
   *
   * Default: true. Non-create commands (release, archive, update, ...) are
   * the common case and Manifest's `runCommand` accepts `instanceId` via
   * its third-argument options bag. Extracting always — even for create
   * commands that don't need it — is safe because runtime ignores it when
   * the action is a create-only path.
   */
  deriveInstanceId: true,
  /**
   * Canonical dispatcher path relative to `appDir`. Exposed so apps that
   * want a different prefix (e.g. `/api/v1/manifest/...`) can override
   * without forking the projection.
   */
  path: '/manifest/[entity]/commands/[command]/route.ts',
} as const;

/**
 * Default policy for the deprecated per-command "concrete" routes.
 *
 * When `enabled` is false, `nextjs.command` artifacts are suppressed
 * entirely. When `legacyAliasesOnly` is true (default), generated concrete
 * routes carry the DEPRECATED ALIAS banner and delegate to the dispatcher
 * — they exist only for back-compat. Set both to true to keep emitting
 * them but signal they are not the canonical surface.
 */
/**
 * Default policy for the deprecated per-command "concrete" routes.
 *
 * `enabled` is **false by default** so the canonical-only write surface
 * (the dispatcher) is the single entry point. Apps that still need
 * per-command routes for legacy callers must opt in explicitly with
 * `enabled: true`. When `legacyAliasesOnly` is true (default), generated
 * concrete routes carry the DEPRECATED ALIAS banner pointing at the
 * dispatcher.
 *
 * This was reversed from the previous default (true) per the
 * dispatcher-only-by-default goal.
 */
export const CONCRETE_COMMAND_ROUTES_DEFAULTS = {
  enabled: false,
  legacyAliasesOnly: true,
} as const;

/**
 * Default policy for direct database read routes (GET list, GET detail).
 *
 * Both `enabled` and `directDbReads` default to true to preserve the
 * historical behaviour of the projection emitting Prisma-backed read
 * routes. Apps that prefer to author reads by hand or route them through
 * a separate query layer can set `enabled: false` (no read routes at all)
 * or `directDbReads: false` (route stubs only; no Prisma call inlined).
 *
 * Direct read routes assume a Prisma-compatible client. Manifest cannot
 * fully decouple from that assumption without emitting a different
 * surface; see docs/spec/config/manifest.config.md.
 */
export const READ_ROUTES_DEFAULTS = {
  enabled: true,
  directDbReads: true,
} as const;

/**
 * Default options for the Canonical Routes projection.
 *
 * These mirror the inline defaults in `routes/generator.ts` so the routes
 * projection and the `manifest config` CLI agree on a single source of
 * truth.
 */
export const ROUTES_DEFAULTS = {
  basePath: '/api',
  includeAuth: true,
  includeTenant: true,
} as const;

/**
 * Snapshot type for `manifest config print-defaults` output. Captures
 * everything a downstream repo would need to reason about Manifest's
 * unforced behaviour without reading source.
 */
export interface ManifestDefaultsSnapshot {
  nextjs: typeof NEXTJS_DEFAULTS;
  tenantProvider: typeof DEFAULT_TENANT_PROVIDER;
  dispatcher: typeof DISPATCHER_DEFAULTS;
  concreteCommandRoutes: typeof CONCRETE_COMMAND_ROUTES_DEFAULTS;
  readRoutes: typeof READ_ROUTES_DEFAULTS;
  routes: typeof ROUTES_DEFAULTS;
}

/**
 * Build the full defaults snapshot. Used by the CLI and tests to render
 * a stable, schema-aligned view of what Manifest will do when no user
 * config is present.
 */
export function getManifestDefaultsSnapshot(): ManifestDefaultsSnapshot {
  return {
    nextjs: NEXTJS_DEFAULTS,
    tenantProvider: DEFAULT_TENANT_PROVIDER,
    dispatcher: DISPATCHER_DEFAULTS,
    concreteCommandRoutes: CONCRETE_COMMAND_ROUTES_DEFAULTS,
    readRoutes: READ_ROUTES_DEFAULTS,
    routes: ROUTES_DEFAULTS,
  };
}
