/**
 * Tests for the health check projection.
 *
 * Verifies:
 * - Projection metadata (name, surfaces, description)
 * - health.handler surface: types, provenance, IR check, store checks, outbox, orchestrator
 * - health.nextjs surface: GET handler, import path, status codes
 * - health.express surface: handler function, import path, status codes
 * - Edge cases (empty IR, unknown surfaces, memory-only stores, no irHash)
 * - Deterministic output
 * - Options (custom paths, disabling checks)
 */

import { describe, it, expect } from 'vitest';
import { HealthCheckProjection } from './generator';
// Static import: pulling the full registry graph through a dynamic import
// inside a test body can exceed the 5s test timeout under full-suite load.
// Registration stays lazy — it happens inside getProjection(), not at import.
import { getProjection } from '../registry';
import type { IR } from '../../ir';

describe('HealthCheckProjection', () => {
  const projection = new HealthCheckProjection();

  function firstCode(result: ReturnType<typeof projection.generate>): string {
    expect(result.artifacts.length).toBeGreaterThan(0);
    return result.artifacts[0].code;
  }

  function makeMinimalIR(overrides: Partial<IR> = {}): IR {
    return {
      version: '1.0' as const,
      provenance: {
        contentHash: 'abc123',
        compilerVersion: '0.3.21',
        schemaVersion: '1.0',
        compiledAt: '2026-01-01T00:00:00.000Z',
      },
      modules: [],
      values: [],
      entities: [],
      enums: [],
      stores: [],
      events: [],
      commands: [],
      policies: [],
      ...overrides,
    };
  }

  // ========================================================================
  // Projection metadata
  // ========================================================================

  describe('projection metadata', () => {
    it('has correct name, description, and surfaces', () => {
      expect(projection.name).toBe('health');
      expect(projection.description).toContain('Health check');
      expect(projection.surfaces).toContain('health.handler');
      expect(projection.surfaces).toContain('health.nextjs');
      expect(projection.surfaces).toContain('health.express');
    });

    it('is registered as a built-in projection', () => {
      const p = getProjection('health');
      expect(p).toBeDefined();
      expect(p!.name).toBe('health');
    });
  });

  // ========================================================================
  // health.handler surface
  // ========================================================================

  describe('health.handler surface', () => {
    it('generates handler with header comment', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'health.handler' });
      const code = firstCode(result);

      expect(code).toContain('Generated Manifest health check handler');
      expect(code).toContain('Do not edit manually');
    });

    it('includes type declarations', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'health.handler' });
      const code = firstCode(result);

      expect(code).toContain("export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy'");
      expect(code).toContain('export interface ComponentHealth');
      expect(code).toContain('export interface HealthReport');
    });

    it('bakes MANIFEST_IR_META from provenance', () => {
      const ir = makeMinimalIR({
        provenance: {
          contentHash: 'sha256-test-hash',
          irHash: 'ir-hash-value',
          compilerVersion: '1.0.0',
          schemaVersion: '1.0',
          compiledAt: '2026-06-01T12:00:00.000Z',
        },
      });

      const result = projection.generate(ir, { surface: 'health.handler' });
      const code = firstCode(result);

      expect(code).toContain('MANIFEST_IR_META');
      expect(code).toContain("contentHash: 'sha256-test-hash'");
      expect(code).toContain("irHash: 'ir-hash-value'");
      expect(code).toContain("compilerVersion: '1.0.0'");
      expect(code).toContain("schemaVersion: '1.0'");
      expect(code).toContain("compiledAt: '2026-06-01T12:00:00.000Z'");
    });

    it('omits irHash from MANIFEST_IR_META when not present', () => {
      const ir = makeMinimalIR({
        provenance: {
          contentHash: 'abc123',
          compilerVersion: '0.3.21',
          schemaVersion: '1.0',
          compiledAt: '2026-01-01T00:00:00.000Z',
        },
      });

      const result = projection.generate(ir, { surface: 'health.handler' });
      const code = firstCode(result);

      expect(code).toContain('MANIFEST_IR_META');
      expect(code).toContain("contentHash: 'abc123'");
      expect(code).not.toContain('irHash');
    });

    it('generates checkIR with live probe hook and stub fallback', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'health.handler' });
      const code = firstCode(result);

      expect(code).toContain('async function checkIR(probes?: HealthProbes)');
      expect(code).toContain('IR provenance baked (not live-checked)');
      expect(code).toContain('getLiveContentHash');
      expect(code).toContain('IR contentHash matches live hash');
      expect(code).toContain('configureHealthProbes');
      expect(code).toContain('stub: true');
    });

    it('generates store check functions for each unique target', () => {
      const ir = makeMinimalIR({
        stores: [
          { entity: 'Widget', target: 'postgres', config: {} },
          { entity: 'Gadget', target: 'postgres', config: {} },
          { entity: 'Cache', target: 'memory', config: {} },
        ],
      });

      const result = projection.generate(ir, { surface: 'health.handler' });
      const code = firstCode(result);

      // Should have one check per unique target, not per store instance
      expect(code).toContain('async function checkMemoryStore(probes?: HealthProbes)');
      expect(code).toContain('async function checkPostgresStore(probes?: HealthProbes)');
      // Memory stores return healthy immediately
      expect(code).toContain('memory store is always available');
      // Non-memory stores: live via probes.checkStore, else honest stub
      expect(code).toContain("probes.checkStore('postgres')");
      expect(code).toContain('postgres store check not implemented (scaffolding)');
      expect(code).toContain("target: 'postgres'");
    });

    it('generates outbox check only when postgres/supabase stores exist', () => {
      const irWithPostgres = makeMinimalIR({
        stores: [{ entity: 'Widget', target: 'postgres', config: {} }],
      });

      const resultWith = projection.generate(irWithPostgres, { surface: 'health.handler' });
      expect(firstCode(resultWith)).toContain('async function checkOutbox(probes?: HealthProbes)');
      expect(firstCode(resultWith)).toContain('getOutboxDepth');
      expect(firstCode(resultWith)).toContain('Outbox depth not queried (scaffolding)');

      const irMemoryOnly = makeMinimalIR({
        stores: [{ entity: 'Widget', target: 'memory', config: {} }],
      });

      const resultWithout = projection.generate(irMemoryOnly, { surface: 'health.handler' });
      expect(firstCode(resultWithout)).not.toContain(
        'async function checkOutbox(probes?: HealthProbes)',
      );
    });

    it('generates runHealthCheck orchestrator', () => {
      const ir = makeMinimalIR({
        stores: [{ entity: 'Widget', target: 'postgres', config: {} }],
      });

      const result = projection.generate(ir, { surface: 'health.handler' });
      const code = firstCode(result);

      expect(code).toContain(
        'export async function runHealthCheck(probes?: HealthProbes): Promise<HealthReport>',
      );
      expect(code).toContain('const active = probes ?? configuredProbes');
      expect(code).toContain("overallStatus: HealthStatus = 'healthy'");
      expect(code).toContain('timestamp: new Date().toISOString()');
    });

    it('returns correct artifact metadata', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'health.handler' });

      expect(result.artifacts).toHaveLength(1);
      const artifact = result.artifacts[0];
      expect(artifact.id).toBe('health.handler');
      expect(artifact.pathHint).toBe('src/lib/manifest-health-handler.ts');
      expect(artifact.contentType).toBe('typescript');
    });

    it('handles supabase stores with outbox support', () => {
      const ir = makeMinimalIR({
        stores: [{ entity: 'Widget', target: 'supabase', config: {} }],
      });

      const result = projection.generate(ir, { surface: 'health.handler' });
      const code = firstCode(result);

      expect(code).toContain('async function checkSupabaseStore(probes?: HealthProbes)');
      expect(code).toContain('async function checkOutbox(probes?: HealthProbes)');
    });

    it('handles localStorage stores as always healthy', () => {
      const ir = makeMinimalIR({
        stores: [{ entity: 'Widget', target: 'localStorage', config: {} }],
      });

      const result = projection.generate(ir, { surface: 'health.handler' });
      const code = firstCode(result);

      expect(code).toContain('async function checkLocalStorageStore(probes?: HealthProbes)');
      expect(code).toContain('localStorage store is always available');
    });

    it('handles no stores gracefully', () => {
      const ir = makeMinimalIR({ stores: [] });
      const result = projection.generate(ir, { surface: 'health.handler' });
      const code = firstCode(result);

      // No store check functions generated (checkIR still present)
      expect(code).toContain('async function checkIR(probes?: HealthProbes)');
      expect(code).not.toContain('Store()');
      expect(code).not.toContain('storeResults');
    });
  });

  // ========================================================================
  // health.nextjs surface
  // ========================================================================

  describe('health.nextjs surface', () => {
    it('generates Next.js GET handler', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'health.nextjs' });
      const code = firstCode(result);

      expect(code).toContain('export async function GET()');
      expect(code).toContain('Response.json(report, { status: statusCode })');
    });

    it('imports runHealthCheck from default handler path', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'health.nextjs' });
      const code = firstCode(result);

      expect(code).toContain("import { runHealthCheck } from '@/lib/manifest-health-handler'");
    });

    it('uses custom handler import path', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, {
        surface: 'health.nextjs',
        options: { handlerImportPath: '@/custom/health' },
      });
      const code = firstCode(result);

      expect(code).toContain("from '@/custom/health'");
    });

    it('uses correct HTTP status codes', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'health.nextjs' });
      const code = firstCode(result);

      expect(code).toContain("report.status === 'healthy' ? 200 : 503");
    });

    it('respects custom status codes', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, {
        surface: 'health.nextjs',
        options: { healthyStatus: 200, unhealthyStatus: 500 },
      });
      const code = firstCode(result);

      expect(code).toContain("report.status === 'healthy' ? 200 : 500");
    });

    it('returns correct artifact metadata', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'health.nextjs' });

      expect(result.artifacts).toHaveLength(1);
      const artifact = result.artifacts[0];
      expect(artifact.id).toBe('health.nextjs');
      expect(artifact.pathHint).toBe('app/api/manifest/health/route.ts');
      expect(artifact.contentType).toBe('typescript');
    });

    it('includes Next.js header comment', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'health.nextjs' });
      const code = firstCode(result);

      expect(code).toContain('Next.js App Router route');
      expect(code).toContain('GET /api/manifest/health');
    });
  });

  // ========================================================================
  // health.express surface
  // ========================================================================

  describe('health.express surface', () => {
    it('generates Express handler function', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'health.express' });
      const code = firstCode(result);

      expect(code).toContain('export async function manifestHealthHandler');
      expect(code).toContain('res.status(statusCode).json(report)');
    });

    it('imports runHealthCheck from default handler path', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'health.express' });
      const code = firstCode(result);

      expect(code).toContain("import { runHealthCheck } from '@/lib/manifest-health-handler'");
    });

    it('imports Express types', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'health.express' });
      const code = firstCode(result);

      expect(code).toContain("import type { Request, Response } from 'express'");
    });

    it('uses correct HTTP status codes', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'health.express' });
      const code = firstCode(result);

      expect(code).toContain("report.status === 'healthy' ? 200 : 503");
    });

    it('returns correct artifact metadata', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'health.express' });

      expect(result.artifacts).toHaveLength(1);
      const artifact = result.artifacts[0];
      expect(artifact.id).toBe('health.express');
      expect(artifact.pathHint).toBe('src/middleware/manifest-health.ts');
      expect(artifact.contentType).toBe('typescript');
    });

    it('includes Express usage comment', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'health.express' });
      const code = firstCode(result);

      expect(code).toContain('Express middleware');
      expect(code).toContain('app.get("/manifest/health"');
    });
  });

  // ========================================================================
  // Options
  // ========================================================================

  describe('options', () => {
    it('disabling IR check removes checkIR from handler', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, {
        surface: 'health.handler',
        options: { includeIRCheck: false },
      });
      const code = firstCode(result);

      expect(code).not.toContain('async function checkIR(probes?: HealthProbes)');
      expect(code).not.toContain('ir: ComponentHealth');
    });

    it('disabling store checks removes store functions from handler', () => {
      const ir = makeMinimalIR({
        stores: [{ entity: 'Widget', target: 'postgres', config: {} }],
      });
      const result = projection.generate(ir, {
        surface: 'health.handler',
        options: { includeStoreChecks: false },
      });
      const code = firstCode(result);

      expect(code).not.toContain('checkPostgresStore');
      expect(code).not.toContain('stores: Record<string, ComponentHealth>');
    });

    it('disabling outbox check removes outbox function from handler', () => {
      const ir = makeMinimalIR({
        stores: [{ entity: 'Widget', target: 'postgres', config: {} }],
      });
      const result = projection.generate(ir, {
        surface: 'health.handler',
        options: { includeOutboxCheck: false },
      });
      const code = firstCode(result);

      expect(code).not.toContain('async function checkOutbox(probes?: HealthProbes)');
      expect(code).not.toContain('outbox: ComponentHealth');
    });

    it('uses custom path hints', () => {
      const ir = makeMinimalIR();

      const handlerResult = projection.generate(ir, {
        surface: 'health.handler',
        options: { handlerPathHint: 'custom/handler.ts' },
      });
      expect(handlerResult.artifacts[0].pathHint).toBe('custom/handler.ts');

      const nextjsResult = projection.generate(ir, {
        surface: 'health.nextjs',
        options: { nextjsPathHint: 'custom/nextjs.ts' },
      });
      expect(nextjsResult.artifacts[0].pathHint).toBe('custom/nextjs.ts');

      const expressResult = projection.generate(ir, {
        surface: 'health.express',
        options: { expressPathHint: 'custom/express.ts' },
      });
      expect(expressResult.artifacts[0].pathHint).toBe('custom/express.ts');
    });
  });

  // ========================================================================
  // Determinism
  // ========================================================================

  describe('determinism', () => {
    it('produces identical output for identical IR', () => {
      const ir = makeMinimalIR({
        stores: [
          { entity: 'Zebra', target: 'postgres', config: {} },
          { entity: 'Alpha', target: 'memory', config: {} },
          { entity: 'Beta', target: 'supabase', config: {} },
        ],
      });

      const result1 = projection.generate(ir, { surface: 'health.handler' });
      const result2 = projection.generate(ir, { surface: 'health.handler' });

      expect(firstCode(result1)).toBe(firstCode(result2));
    });

    it('sorts store targets deterministically', () => {
      const ir = makeMinimalIR({
        stores: [
          { entity: 'Widget', target: 'supabase', config: {} },
          { entity: 'Gadget', target: 'memory', config: {} },
          { entity: 'Cache', target: 'postgres', config: {} },
        ],
      });

      const result = projection.generate(ir, { surface: 'health.handler' });
      const code = firstCode(result);

      // memory should come before postgres, postgres before supabase (alphabetical)
      const memoryIdx = code.indexOf('checkMemoryStore');
      const postgresIdx = code.indexOf('checkPostgresStore');
      const supabaseIdx = code.indexOf('checkSupabaseStore');

      expect(memoryIdx).toBeLessThan(postgresIdx);
      expect(postgresIdx).toBeLessThan(supabaseIdx);
    });
  });

  // ========================================================================
  // Edge cases
  // ========================================================================

  describe('edge cases', () => {
    it('handles empty IR', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'health.handler' });
      const code = firstCode(result);

      expect(code).toContain('runHealthCheck');
      expect(code).toContain('MANIFEST_IR_META');
    });

    it('returns error for unknown surface', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'unknown.surface' });

      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].severity).toBe('error');
      expect(result.diagnostics[0].code).toBe('UNKNOWN_SURFACE');
    });

    it('handles durable store target', () => {
      const ir = makeMinimalIR({
        stores: [{ entity: 'Widget', target: 'durable', config: {} }],
      });

      const result = projection.generate(ir, { surface: 'health.handler' });
      const code = firstCode(result);

      expect(code).toContain('async function checkDurableStore(probes?: HealthProbes)');
      // durable is not a memory target, should have try/catch
      expect(code).toContain('durable store check not implemented (scaffolding)');
      // durable is not an outbox target, no outbox check
      expect(code).not.toContain('async function checkOutbox(probes?: HealthProbes)');
    });

    it('handles mongodb store target', () => {
      const ir = makeMinimalIR({
        stores: [{ entity: 'Widget', target: 'mongodb', config: {} }],
      });

      const result = projection.generate(ir, { surface: 'health.handler' });
      const code = firstCode(result);

      expect(code).toContain('async function checkMongodbStore(probes?: HealthProbes)');
      expect(code).not.toContain('async function checkOutbox(probes?: HealthProbes)');
    });

    it('deduplicates store targets', () => {
      const ir = makeMinimalIR({
        stores: [
          { entity: 'Widget', target: 'postgres', config: {} },
          { entity: 'Gadget', target: 'postgres', config: {} },
          { entity: 'Thing', target: 'postgres', config: {} },
        ],
      });

      const result = projection.generate(ir, { surface: 'health.handler' });
      const code = firstCode(result);

      // Should have exactly one postgres check function
      const matches = code.match(/function checkPostgresStore/g);
      expect(matches).toHaveLength(1);
    });

    it('no diagnostics for valid surfaces', () => {
      const ir = makeMinimalIR();

      for (const surface of ['health.handler', 'health.nextjs', 'health.express']) {
        const result = projection.generate(ir, { surface });
        expect(result.diagnostics).toHaveLength(0);
      }
    });
  });
});
