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
 * Values intentionally mirror the historical hardcoded defaults so that
 * downstream consumers see no behavioural drift when defaults move here.
 *
 * Keys describing *how generated code looks* (import paths, app dir, etc.)
 * are Manifest-generic — they must not embed any downstream-app-specific
 * branding. Where the existing defaults reflect a turborepo + `apps/api`
 * convention, they are preserved for backward compatibility but every value
 * MUST be overridable from `manifest.config.yaml`.
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
  authProvider: 'clerk',
  authImportPath: '@repo/auth/server',
  databaseImportPath: '@repo/database',
  responseImportPath: '@/lib/manifest-response',
  runtimeImportPath: '@/lib/manifest-runtime',
  includeTenantFilter: true,
  includeSoftDeleteFilter: true,
  tenantIdProperty: 'tenantId',
  deletedAtProperty: 'deletedAt',
  appDir: 'apps/api/app/api',
  strictMode: true,
  includeComments: true,
  indentSize: 2,
} as const satisfies Required<Omit<
  NextJsProjectionOptions,
  'tenantProvider' | 'dispatcher' | 'concreteCommandRoutes'
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
  deriveInstanceId: false,
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
export const CONCRETE_COMMAND_ROUTES_DEFAULTS = {
  enabled: true,
  legacyAliasesOnly: true,
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
    routes: ROUTES_DEFAULTS,
  };
}
