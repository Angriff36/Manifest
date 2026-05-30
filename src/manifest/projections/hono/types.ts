/**
 * Configuration options for the Hono projection.
 *
 * Controls auth middleware integration, request validation,
 * and route structure for edge-runtime-optimized router
 * generation from Manifest IR. Designed for Cloudflare Workers,
 * Vercel Edge, and Deno Deploy with zero Node.js dependencies.
 */

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
   * Base route prefix for all generated routes.
   * Default: '/api'
   */
  basePath?: string;

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
}
