/**
 * Configuration options for the Express/Fastify projection.
 *
 * Controls framework selection, auth middleware integration,
 * request validation, and route structure for standalone
 * router module generation from Manifest IR.
 */

/**
 * Options for the Express/Fastify route handler projection.
 */
export interface ExpressProjectionOptions {
  /**
   * Target framework: 'express' or 'fastify'.
   * Controls handler signature shapes, middleware registration,
   * and validation integration.
   * Default: 'express'
   */
  framework?: 'express' | 'fastify';

  /**
   * Auth middleware import path.
   * The module must export a middleware function matching the
   * chosen framework's middleware signature.
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
   * When true, generates `req.user.tenantId` extraction.
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
   * `authImportPath`). Default **true**, so `manifest generate -p express`
   * produces code that compiles without hand-authored glue.
   *
   * Set to `false` to keep the historical workflow where those modules are
   * hand-written. A companion is skipped (never overwritten) when its import
   * path is a package specifier rather than a local relative module.
   */
  emitCompanions?: boolean;
}
