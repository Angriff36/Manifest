/**
 * Configuration options for the Hono projection.
 *
 * Controls auth middleware integration, request validation,
 * and route structure for edge-runtime-optimized router
 * generation from Manifest IR. Designed for Cloudflare Workers,
 * Vercel Edge, and Deno Deploy with zero Node.js dependencies.
 */

import type { RouteCasing } from '../shared/naming.js';

/**
 * Options for the Hono route handler projection.
 */
export interface HonoProjectionOptions {
  /**
   * Auth middleware import path.
   * The module must export a Hono middleware that sets
   * `c.set('user', ...)` on the context.
   * Default: './middleware/auth'
   */
  authImportPath?: string;

  /**
   * Auth provider template for the emitted companion middleware.
   * - `custom` (default): fail-closed stub — replace the body with real auth
   * - `clerk`: middleware that reads `@hono/clerk-auth` `getAuth` and sets `user`
   * - `none`: pass-through with `{ id: 'anonymous' }` (dev / open surfaces)
   */
  authProvider?: 'clerk' | 'custom' | 'none';

  /**
   * Named export for the auth middleware function.
   * Default: 'requireAuth'
   */
  authMiddlewareName?: string;

  /**
   * Import path for the Manifest runtime factory.
   * The module must export a function that returns a runtime
   * instance with `runCommand(entity, command, params, context)`.
   * Default: './lib/manifest-runtime'
   */
  runtimeImportPath?: string;

  /**
   * Named export for the runtime factory function.
   * Default: 'createManifestRuntime'
   */
  runtimeFactoryName?: string;

  /**
   * Import path for request validation schemas (Zod).
   * When provided, generated handlers validate request bodies
   * against Zod schemas before dispatching to the runtime.
   * Default: undefined (no validation emitted)
   */
  validationImportPath?: string;

  /**
   * Base route prefix for all generated routes. Applied to every emitted route
   * path via the shared route contract (so `/recipe/list` is emitted as
   * `${basePath}/recipe/list`).
   * Default: '/api'
   */
  basePath?: string;

  /**
   * URL casing for entity route segments, resolved through the shared route
   * contract so hono routes agree with the zod schema names and every other
   * projection's paths. Default: `'lowercase'` (`PrepTask` → `preptask`, the
   * historical `toEntitySegment` behavior).
   */
  routeCasing?: RouteCasing;

  /**
   * Explicit per-entity route segment overrides (used verbatim). Escape hatch
   * when the derived casing is wrong for a specific entity.
   */
  routeSegments?: Record<string, string>;

  /**
   * Whether to include tenant context extraction from auth.
   * When true, generates `c.get('user').tenantId` extraction.
   * Default: true
   */
  includeTenantContext?: boolean;

  /**
   * Name of the tenant ID property on the auth user object.
   * Default: 'tenantId'
   */
  tenantIdProperty?: string;

  /**
   * Whether to emit TypeScript type annotations.
   * Default: true
   */
  emitTypes?: boolean;

  /**
   * Whether to emit a header comment with generation metadata.
   * Default: true
   */
  emitHeader?: boolean;

  /**
   * Whether to skip auth middleware on read routes (GET).
   * Default: false
   */
  publicReads?: boolean;

  /**
   * Whether to emit inline JSDoc comments describing guards,
   * constraints, and policies for each command handler.
   * Default: true
   */
  includeComments?: boolean;

  /**
   * ISO timestamp override for deterministic output (testing).
   */
  generatedAt?: string;

  /**
   * Emit the companion modules the generated router imports but no other
   * surface writes — the runtime factory (`createManifestRuntime` at
   * `runtimeImportPath`) and the auth middleware (`authMiddlewareName` at
   * `authImportPath`). Default **true**, so a generated Hono app compiles
   * without hand-authored glue.
   *
   * Set to `false` to keep the historical workflow where those modules are
   * hand-written. A companion is skipped (never overwritten) when its import
   * path is a package specifier rather than a local relative module.
   */
  emitCompanions?: boolean;
}
