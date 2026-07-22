/**
 * Health check endpoint projection for Manifest IR.
 *
 * Generates runtime health-check handlers that return structured JSON for
 * Kubernetes liveness/readiness probes and load balancers.
 *
 * Scaffolding (2026-07-22): IR/store/outbox probes bake provenance and
 * report `details.stub: true` for non-memory checks. They do not perform
 * live hash recompute, store I/O, or outbox queries yet.
 *
 * Surfaces:
 *   - health.handler  → Framework-agnostic TypeScript handler (core logic)
 *   - health.nextjs   → Next.js App Router GET route wrapper
 *   - health.express  → Express middleware wrapper
 *
 * Projections are TOOLING, not runtime semantics.
 */

import type { IR } from '../../ir';
import type {
  ProjectionTarget,
  ProjectionRequest,
  ProjectionResult,
  ProjectionArtifact,
} from '../interface';
import type { HealthCheckProjectionOptions } from './types';
import { normalizeHealthOptions } from './types.js';
import { HEALTH_DESCRIPTOR_META } from './descriptor-meta.js';

// ============================================================================
// Surface identifiers
// ============================================================================

const SURFACE_HANDLER = 'health.handler' as const;
const SURFACE_NEXTJS = 'health.nextjs' as const;
const SURFACE_EXPRESS = 'health.express' as const;
const SURFACES = [SURFACE_HANDLER, SURFACE_NEXTJS, SURFACE_EXPRESS] as const;

// ============================================================================
// Store target classification
// ============================================================================

/** Store targets that represent in-process memory (always healthy). */
const MEMORY_TARGETS = new Set(['memory', 'localStorage']);

/** Store targets that support outbox queues. */
const OUTBOX_TARGETS = new Set(['postgres', 'supabase']);

// ============================================================================
// Code generation helpers
// ============================================================================

/**
 * Collect unique store targets from IR, sorted for determinism.
 */
function collectUniqueTargets(ir: IR): string[] {
  const targets = new Set<string>();
  for (const store of ir.stores) {
    targets.add(store.target);
  }
  return Array.from(targets).sort((a, b) => a.localeCompare(b));
}

/**
 * Determine if any store targets support outbox queues.
 */
function hasOutboxCapableStores(ir: IR): boolean {
  return ir.stores.some((s) => OUTBOX_TARGETS.has(s.target));
}

/**
 * Convert a store target name to a PascalCase function suffix.
 * e.g. "postgres" → "Postgres", "localStorage" → "LocalStorage"
 */
function targetToFunctionSuffix(target: string): string {
  // Handle camelCase targets like "localStorage"
  if (target === 'localStorage') return 'LocalStorage';
  return target[0].toUpperCase() + target.slice(1);
}

// ============================================================================
// Handler code generation (core logic)
// ============================================================================

/**
 * Build the framework-agnostic health check handler code.
 */
function buildHandlerCode(ir: IR, opts: Required<HealthCheckProjectionOptions>): string {
  const lines: string[] = [];
  const targets = collectUniqueTargets(ir);
  const hasOutbox = hasOutboxCapableStores(ir);

  // Header
  lines.push('/**');
  lines.push(' * Generated Manifest health check handler.');
  lines.push(' * Do not edit manually — regenerate from IR.');
  lines.push(' *');
  lines.push(' * Checks: IR integrity, store connectivity, outbox queue depth.');
  lines.push(' * Compatible with Kubernetes liveness/readiness probes.');
  lines.push(' */');
  lines.push('');

  // Type declarations
  lines.push("export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';");
  lines.push('');
  lines.push('export interface ComponentHealth {');
  lines.push('  status: HealthStatus;');
  lines.push('  message?: string;');
  lines.push('  details?: Record<string, unknown>;');
  lines.push('}');
  lines.push('');
  lines.push('export interface HealthReport {');
  lines.push('  status: HealthStatus;');
  lines.push('  timestamp: string;');
  lines.push('  checks: {');
  if (opts.includeIRCheck) {
    lines.push('    ir: ComponentHealth;');
  }
  if (opts.includeStoreChecks && targets.length > 0) {
    lines.push('    stores: Record<string, ComponentHealth>;');
  }
  if (opts.includeOutboxCheck && hasOutbox) {
    lines.push('    outbox: ComponentHealth;');
  }
  lines.push('  };');
  lines.push('}');
  lines.push('');

  // Baked provenance metadata
  lines.push('/** Baked IR provenance from compilation. */');
  lines.push('const MANIFEST_IR_META = {');
  lines.push(`  contentHash: '${ir.provenance.contentHash}',`);
  if (ir.provenance.irHash) {
    lines.push(`  irHash: '${ir.provenance.irHash}',`);
  }
  lines.push(`  compilerVersion: '${ir.provenance.compilerVersion}',`);
  lines.push(`  schemaVersion: '${ir.provenance.schemaVersion}',`);
  lines.push(`  compiledAt: '${ir.provenance.compiledAt}',`);
  lines.push('} as const;');
  lines.push('');

  // IR integrity check (scaffolding: baked provenance only — not a live hash)
  if (opts.includeIRCheck) {
    lines.push('/**');
    lines.push(' * Report baked IR provenance from compilation.');
    lines.push(' * Scaffolding only: does not recompute or compare a live IR hash.');
    lines.push(' */');
    lines.push('function checkIR(): ComponentHealth {');
    lines.push('  return {');
    lines.push("    status: 'healthy',");
    lines.push("    message: 'IR provenance baked (not live-checked)',");
    lines.push('    details: { ...MANIFEST_IR_META, stub: true },');
    lines.push('  };');
    lines.push('}');
    lines.push('');
  }

  // Store connectivity checks
  if (opts.includeStoreChecks && targets.length > 0) {
    for (const target of targets) {
      const suffix = targetToFunctionSuffix(target);
      const isMemory = MEMORY_TARGETS.has(target);

      lines.push(`/**`);
      lines.push(` * Check connectivity for ${target} stores.`);
      if (!isMemory) {
        lines.push(
          ` * Scaffolding only: no live ${target} probe until a store client is injected.`,
        );
      }
      lines.push(` */`);
      lines.push(`async function check${suffix}Store(): Promise<ComponentHealth> {`);

      if (isMemory) {
        lines.push(
          `  return { status: 'healthy', message: '${target} store is always available', details: { stub: false } };`,
        );
      } else {
        lines.push('  // Scaffolding: always reports healthy until a real probe is wired.');
        lines.push('  return {');
        lines.push("    status: 'healthy',");
        lines.push(
          `    message: '${target} store check not implemented (scaffolding)',`,
        );
        lines.push("    details: { stub: true, target: '" + target + "' },");
        lines.push('  };');
      }

      lines.push('}');
      lines.push('');
    }
  }

  // Outbox queue depth check (scaffolding: no table query yet)
  if (opts.includeOutboxCheck && hasOutbox) {
    lines.push('/**');
    lines.push(' * Report outbox queue depth for event delivery.');
    lines.push(' * Scaffolding only: does not query manifest_outbox_entries.');
    lines.push(' */');
    lines.push('async function checkOutbox(): Promise<ComponentHealth> {');
    lines.push('  return {');
    lines.push("    status: 'healthy',");
    lines.push("    message: 'Outbox depth not queried (scaffolding)',");
    lines.push("    details: { stub: true, depth: null },");
    lines.push('  };');
    lines.push('}');
    lines.push('');
  }

  // Main orchestrator
  lines.push('/**');
  lines.push(' * Run all health checks and return an aggregated report.');
  lines.push(' *');
  lines.push(' * Status logic:');
  lines.push(" *   - 'healthy'   — all checks pass");
  lines.push(" *   - 'degraded'  — some non-critical checks fail (stores)");
  lines.push(" *   - 'unhealthy' — IR check fails or all stores unreachable");
  lines.push(' */');
  lines.push('export async function runHealthCheck(): Promise<HealthReport> {');
  lines.push("  const checks: HealthReport['checks'] = {} as HealthReport['checks'];");
  lines.push("  let overallStatus: HealthStatus = 'healthy';");
  lines.push('');

  if (opts.includeIRCheck) {
    lines.push('  // IR integrity');
    lines.push('  const irHealth = checkIR();');
    lines.push('  (checks as Record<string, unknown>).ir = irHealth;');
    lines.push("  if (irHealth.status === 'unhealthy') {");
    lines.push("    overallStatus = 'unhealthy';");
    lines.push('  }');
    lines.push('');
  }

  if (opts.includeStoreChecks && targets.length > 0) {
    lines.push('  // Store connectivity');
    lines.push('  const storeResults: Record<string, ComponentHealth> = {};');
    for (const target of targets) {
      const suffix = targetToFunctionSuffix(target);
      lines.push(`  storeResults['${target}'] = await check${suffix}Store();`);
    }
    lines.push('  (checks as Record<string, unknown>).stores = storeResults;');
    lines.push('');
    lines.push('  const storeStatuses = Object.values(storeResults);');
    lines.push("  const anyStoreUnhealthy = storeStatuses.some(s => s.status === 'unhealthy');");
    lines.push("  const allStoresUnhealthy = storeStatuses.every(s => s.status === 'unhealthy');");
    lines.push("  if (allStoresUnhealthy && overallStatus !== 'unhealthy') {");
    lines.push("    overallStatus = 'unhealthy';");
    lines.push("  } else if (anyStoreUnhealthy && overallStatus === 'healthy') {");
    lines.push("    overallStatus = 'degraded';");
    lines.push('  }');
    lines.push('');
  }

  if (opts.includeOutboxCheck && hasOutbox) {
    lines.push('  // Outbox queue depth');
    lines.push('  const outboxHealth = await checkOutbox();');
    lines.push('  (checks as Record<string, unknown>).outbox = outboxHealth;');
    lines.push("  if (outboxHealth.status === 'unhealthy' && overallStatus === 'healthy') {");
    lines.push("    overallStatus = 'degraded';");
    lines.push('  }');
    lines.push('');
  }

  lines.push('  return {');
  lines.push('    status: overallStatus,');
  lines.push('    timestamp: new Date().toISOString(),');
  lines.push('    checks,');
  lines.push('  };');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// Next.js wrapper code generation
// ============================================================================

/**
 * Build the Next.js App Router GET route handler.
 */
function buildNextjsCode(_ir: IR, opts: Required<HealthCheckProjectionOptions>): string {
  const lines: string[] = [];

  lines.push('/**');
  lines.push(' * Generated Manifest health check — Next.js App Router route.');
  lines.push(' * Do not edit manually — regenerate from IR.');
  lines.push(' *');
  lines.push(' * GET /api/manifest/health');
  lines.push(' * Returns: { status, timestamp, checks }');
  lines.push(' * HTTP 200 = healthy, HTTP 503 = unhealthy/degraded');
  lines.push(' */');
  lines.push('');
  lines.push(`import { runHealthCheck } from '${opts.handlerImportPath}';`);
  lines.push('');
  lines.push('export async function GET(): Promise<Response> {');
  lines.push('  const report = await runHealthCheck();');
  lines.push(
    `  const statusCode = report.status === 'healthy' ? ${opts.healthyStatus} : ${opts.unhealthyStatus};`,
  );
  lines.push('  return Response.json(report, { status: statusCode });');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// Express wrapper code generation
// ============================================================================

/**
 * Build the Express middleware/route handler.
 */
function buildExpressCode(_ir: IR, opts: Required<HealthCheckProjectionOptions>): string {
  const lines: string[] = [];

  lines.push('/**');
  lines.push(' * Generated Manifest health check — Express middleware.');
  lines.push(' * Do not edit manually — regenerate from IR.');
  lines.push(' *');
  lines.push(' * Usage: app.get("/manifest/health", manifestHealthHandler);');
  lines.push(' * Returns: { status, timestamp, checks }');
  lines.push(' * HTTP 200 = healthy, HTTP 503 = unhealthy/degraded');
  lines.push(' */');
  lines.push('');
  lines.push(`import { runHealthCheck } from '${opts.handlerImportPath}';`);
  lines.push('');
  lines.push("import type { Request, Response } from 'express';");
  lines.push('');
  lines.push(
    'export async function manifestHealthHandler(_req: Request, res: Response): Promise<void> {',
  );
  lines.push('  const report = await runHealthCheck();');
  lines.push(
    `  const statusCode = report.status === 'healthy' ? ${opts.healthyStatus} : ${opts.unhealthyStatus};`,
  );
  lines.push('  res.status(statusCode).json(report);');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// Projection implementation
// ============================================================================

/**
 * Health check endpoint projection.
 *
 * Generates runtime health check handlers from Manifest IR that validate
 * IR integrity, store connectivity, and outbox queue depth.
 *
 * Surfaces:
 *   - health.handler  → Framework-agnostic handler (manifest-health-handler.ts)
 *   - health.nextjs   → Next.js App Router GET route (route.ts)
 *   - health.express  → Express middleware (manifest-health.ts)
 */
export class HealthCheckProjection implements ProjectionTarget {
  readonly name = 'health';
  readonly description =
    'Health check endpoint generation with IR integrity, store connectivity, and outbox checks';
  readonly surfaces = SURFACES;
  readonly descriptorMeta = HEALTH_DESCRIPTOR_META;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const opts = normalizeHealthOptions(
      (request.options ?? {}) as Partial<HealthCheckProjectionOptions>,
    );

    switch (request.surface) {
      case SURFACE_HANDLER: {
        const code = buildHandlerCode(ir, opts);
        const artifact: ProjectionArtifact = {
          id: 'health.handler',
          pathHint: opts.handlerPathHint,
          contentType: 'typescript',
          code,
        };
        return { artifacts: [artifact], diagnostics: [] };
      }

      case SURFACE_NEXTJS: {
        const code = buildNextjsCode(ir, opts);
        const artifact: ProjectionArtifact = {
          id: 'health.nextjs',
          pathHint: opts.nextjsPathHint,
          contentType: 'typescript',
          code,
        };
        return { artifacts: [artifact], diagnostics: [] };
      }

      case SURFACE_EXPRESS: {
        const code = buildExpressCode(ir, opts);
        const artifact: ProjectionArtifact = {
          id: 'health.express',
          pathHint: opts.expressPathHint,
          contentType: 'typescript',
          code,
        };
        return { artifacts: [artifact], diagnostics: [] };
      }

      default:
        return {
          artifacts: [],
          diagnostics: [
            {
              severity: 'error',
              code: 'UNKNOWN_SURFACE',
              message: `Unknown surface: "${request.surface}". Available: health.handler, health.nextjs, health.express`,
            },
          ],
        };
    }
  }
}

// Re-export types
export type { HealthCheckProjectionOptions } from './types';
