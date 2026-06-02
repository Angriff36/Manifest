/**
 * Health check projection types.
 *
 * Configuration options for the health check endpoint projection.
 * Generates IR integrity, store connectivity, and outbox health check
 * handlers for Next.js, Express, and framework-agnostic targets.
 */

/**
 * Configuration options for the health check projection.
 */
export interface HealthCheckProjectionOptions {
  /**
   * Path hint for the Next.js App Router health route.
   * Default: 'app/api/manifest/health/route.ts'
   */
  nextjsPathHint?: string;

  /**
   * Path hint for the Express middleware handler.
   * Default: 'src/middleware/manifest-health.ts'
   */
  expressPathHint?: string;

  /**
   * Path hint for the framework-agnostic handler.
   * Default: 'src/lib/manifest-health-handler.ts'
   */
  handlerPathHint?: string;

  /**
   * Import path for the health check handler module.
   * Used by Next.js and Express wrappers to import the core handler.
   * Default: '@/lib/manifest-health-handler'
   */
  handlerImportPath?: string;

  /**
   * HTTP status code for healthy responses.
   * Default: 200
   */
  healthyStatus?: number;

  /**
   * HTTP status code for unhealthy responses.
   * Default: 503
   */
  unhealthyStatus?: number;

  /**
   * Whether to include the IR integrity check.
   * Default: true
   */
  includeIRCheck?: boolean;

  /**
   * Whether to include store connectivity checks.
   * Default: true
   */
  includeStoreChecks?: boolean;

  /**
   * Whether to include outbox queue depth check (only for postgres/supabase stores).
   * Default: true
   */
  includeOutboxCheck?: boolean;
}

/**
 * Resolved defaults for health check projection options.
 */
export const HEALTH_DEFAULTS: Required<HealthCheckProjectionOptions> = {
  nextjsPathHint: 'app/api/manifest/health/route.ts',
  expressPathHint: 'src/middleware/manifest-health.ts',
  handlerPathHint: 'src/lib/manifest-health-handler.ts',
  handlerImportPath: '@/lib/manifest-health-handler',
  healthyStatus: 200,
  unhealthyStatus: 503,
  includeIRCheck: true,
  includeStoreChecks: true,
  includeOutboxCheck: true,
};

/**
 * Normalize user-provided options with defaults.
 */
export function normalizeHealthOptions(
  opts?: Partial<HealthCheckProjectionOptions>,
): Required<HealthCheckProjectionOptions> {
  return { ...HEALTH_DEFAULTS, ...opts };
}
