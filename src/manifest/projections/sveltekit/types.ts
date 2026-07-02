/**
 * Configuration options for the SvelteKit projection.
 *
 * Controls auth integration, request validation, route structure,
 * and SvelteKit-specific conventions (form actions, $lib imports,
 * type-safe PageData) for projection of Manifest IR into
 * SvelteKit server routes (+server.ts) and load functions.
 */

/**
 * Options for the SvelteKit route handler projection.
 */
export interface SvelteKitProjectionOptions {
  /**
   * Auth provider: 'lucia', 'auth-js', 'custom', or 'none'.
   * Controls how user/session resolution is emitted in generated
   * +server.ts and +page.server.ts files.
   * Default: 'lucia'
   */
  authProvider?: 'lucia' | 'auth-js' | 'custom' | 'none';

  /**
   * Auth utilities import path.
   * Default: '$lib/server/auth'
   *
   * The $lib alias points to src/lib in SvelteKit projects.
   */
  authImportPath?: string;

  /**
   * Import path for the Manifest runtime factory.
   * The module must export a function that returns a runtime
   * instance with `runCommand(entity, command, params, context)`.
   * Default: '$lib/server/manifest-runtime'
   */
  runtimeImportPath?: string;

  /**
   * Named export for the runtime factory function.
   * Default: 'createManifestRuntime'
   */
  runtimeFactoryName?: string;

  /**
   * Database client import path (for direct entity reads in loaders).
   * Default: '$lib/server/database'
   */
  databaseImportPath?: string;

  /**
   * Import path for request validation schemas (Zod).
   * When provided, generated handlers validate request bodies
   * against Zod schemas before dispatching to the runtime.
   * Default: undefined (no validation emitted)
   */
  validationImportPath?: string;

  /**
   * SvelteKit routes directory (default: 'src/routes').
   * All artifact pathHints will be rooted here.
   */
  routesDir?: string;

  /**
   * Whether to include tenant filtering in load functions.
   * Default: true
   */
  includeTenantFilter?: boolean;

  /**
   * Whether to include soft delete filtering (where deletedAt is null).
   * Default: true
   */
  includeSoftDeleteFilter?: boolean;

  /**
   * Name of tenant ID property on the entity and on the user session.
   * Default: 'tenantId'
   */
  tenantIdProperty?: string;

  /**
   * Name of soft delete timestamp property.
   * Default: 'deletedAt'
   */
  deletedAtProperty?: string;

  /**
   * Whether to emit TypeScript strict-mode code.
   * Default: true
   */
  strictMode?: boolean;

  /**
   * Whether to emit comments / banners explaining generated semantics.
   * Default: true
   */
  includeComments?: boolean;

  /**
   * HTTP status returned when the auth helper rejects the request OR
   * when it throws. Default 401.
   *
   * Auth failures MUST NEVER surface as 500.
   */
  unauthorizedStatus?: number;

  /**
   * Pluggable tenant resolution strategy.
   * When provided, replaces the default user-mapping pattern.
   */
  tenantProvider?: {
    /** Import path for the tenant lookup function (e.g. '$lib/server/tenant') */
    importPath: string;
    /** Function name to call (e.g. 'getTenantIdForOrg') */
    functionName: string;
    /** Which auth field to pass as the lookup key */
    lookupKey: 'orgId' | 'userId';
  };

  /**
   * Whether to emit a form `actions` export in +page.server.ts files.
   * SvelteKit Form Actions are POST-only handlers consumed by progressive
   * enhancement <form> submissions. Default: true.
   */
  emitFormActions?: boolean;

  /**
   * Whether to emit `PageServerLoad` / `Actions` type imports from
   * `./$types` (the SvelteKit-generated route types module).
   * Default: true
   */
  emitTypeImports?: boolean;

  /**
   * ISO timestamp override for deterministic output (testing).
   */
  generatedAt?: string;

  /**
   * Emit the companion modules generated SvelteKit code imports but no other
   * surface writes: the runtime factory (`createManifestRuntime`), the Prisma
   * `database` client, and — for local providers — an auth stub. Default
   * **true**, so `manifest generate` produces code that compiles without
   * hand-authored glue. Set to `false` to keep the historical workflow where
   * those modules are hand-written. A companion is skipped (never overwritten)
   * when its configured import path is a package specifier rather than a
   * `$lib`/relative alias.
   */
  emitCompanions?: boolean;
}
