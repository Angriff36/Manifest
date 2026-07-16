/**
 * Canonical routes conformance (vNext).
 * Spec: docs/spec/manifest-vnext.md § Canonical Routes — Conformance.
 *
 * Locks the three Required conformance items:
 * 1. Route manifest determinism
 * 2. Manual route merge
 * 3. Linter correctness (hardcoded routes detected; clean code passes)
 */
import { describe, it, expect } from 'vitest';
import { compileToIR } from '../../ir-compiler';
import { RoutesProjection } from './generator';
import { scanFileForRoutes } from '../../../../packages/cli/src/commands/lint-routes';
import type { LintRoutesConfig } from '../../../../packages/cli/src/commands/lint-routes';

const LINT_CONFIG: LintRoutesConfig = {
  dirs: ['src'],
  prefixes: ['/api/'],
  allowlist: [],
  exclude: [],
};

describe('Canonical routes conformance (vNext)', () => {
  const projection = new RoutesProjection();

  it('Route manifest determinism: identical IR + config → byte-identical manifest', async () => {
    const source = `
      entity Recipe {
        property id: string
        property name: string
        command create(name: string) {
          mutate name = name
        }
      }
      entity Ingredient {
        property id: string
        command add(name: string) {
          mutate name = name
        }
      }
    `;
    const compiled = await compileToIR(source);
    expect(compiled.ir).not.toBeNull();

    const opts = { surface: 'routes.manifest' as const, options: { generatedAt: '2026-01-01T00:00:00.000Z' } };
    const a = projection.generate(compiled.ir!, opts);
    const b = projection.generate(compiled.ir!, opts);

    expect(a.artifacts[0].code).toBe(b.artifacts[0].code);
    expect(JSON.parse(a.artifacts[0].code)).toEqual(JSON.parse(b.artifacts[0].code));
  });

  it('Manual route merge: manual routes appear alongside IR-derived routes', async () => {
    const compiled = await compileToIR(`
      entity Recipe {
        property id: string
      }
    `);
    expect(compiled.ir).not.toBeNull();

    const result = projection.generate(compiled.ir!, {
      surface: 'routes.manifest',
      options: {
        generatedAt: '2026-01-01T00:00:00.000Z',
        manualRoutes: [
          {
            id: 'health-check',
            path: '/api/custom/health',
            method: 'GET',
            auth: false,
            tenant: false,
          },
        ],
      },
    });

    const manifest = JSON.parse(result.artifacts[0].code);
    const entityReads = manifest.routes.filter((r: { source: { kind: string } }) => r.source.kind === 'entity-read');
    const manuals = manifest.routes.filter((r: { source: { kind: string } }) => r.source.kind === 'manual');

    expect(entityReads.length).toBeGreaterThanOrEqual(2);
    expect(manuals).toHaveLength(1);
    expect(manuals[0].path).toBe('/api/custom/health');
    expect(manuals[0].source.id).toBe('health-check');
  });

  it('Linter correctness: detects hardcoded routes and passes clean code', () => {
    const dirty = `const url = "/api/recipe/list";\nfetch(url);`;
    const dirtyHits = scanFileForRoutes(dirty, 'src/app.ts', LINT_CONFIG);
    expect(dirtyHits.length).toBeGreaterThanOrEqual(1);
    expect(dirtyHits[0].match).toContain('/api/');

    const clean = `import { recipeListPath } from './routes';\nfetch(recipeListPath());`;
    const cleanHits = scanFileForRoutes(clean, 'src/app.ts', LINT_CONFIG);
    expect(cleanHits).toHaveLength(0);
  });
});
