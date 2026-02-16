/**
 * Tests for the Canonical Routes projection.
 *
 * Verifies:
 * - Route manifest determinism (identical IR → identical output)
 * - Entity read route derivation (list + detail)
 * - Command route derivation (POST handlers)
 * - Manual route merge
 * - Typed path builder generation
 * - Diagnostic correctness (collisions, duplicates, missing entity)
 * - encodeURIComponent in path builders
 */

import { describe, it, expect } from 'vitest';
import { compileToIR } from '../../ir-compiler';
import { RoutesProjection } from './generator';

describe('RoutesProjection', () => {
  const projection = new RoutesProjection();

  function firstCode(result: ReturnType<typeof projection.generate>): string {
    expect(result.artifacts.length).toBeGreaterThan(0);
    return result.artifacts[0].code;
  }

  function parseManifest(result: ReturnType<typeof projection.generate>) {
    const code = firstCode(result);
    return JSON.parse(code);
  }

  // ========================================================================
  // Projection metadata
  // ========================================================================

  describe('projection metadata', () => {
    it('has correct name, description, and surfaces', () => {
      expect(projection.name).toBe('routes');
      expect(projection.description).toContain('route');
      expect(projection.surfaces).toContain('routes.manifest');
      expect(projection.surfaces).toContain('routes.ts');
    });
  });

  // ========================================================================
  // routes.manifest surface
  // ========================================================================

  describe('routes.manifest surface', () => {
    it('generates route manifest from IR entities', async () => {
      const source = `
        entity Recipe {
          property id: string
          property name: string
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const routeResult = projection.generate(result.ir!, {
        surface: 'routes.manifest',
        options: { generatedAt: '2026-01-01T00:00:00.000Z' },
      });

      const manifest = parseManifest(routeResult);

      expect(manifest.version).toBe('1.0');
      expect(manifest.basePath).toBe('/api');
      expect(manifest.generatedAt).toBe('2026-01-01T00:00:00.000Z');

      // Should have list + detail routes for Recipe
      const recipeRoutes = manifest.routes.filter(
        (r: any) => r.source.kind === 'entity-read' && r.source.entity === 'Recipe'
      );
      expect(recipeRoutes).toHaveLength(2);

      const listRoute = recipeRoutes.find((r: any) => r.path.endsWith('/list'));
      expect(listRoute).toBeDefined();
      expect(listRoute.method).toBe('GET');
      expect(listRoute.params).toHaveLength(0);

      const detailRoute = recipeRoutes.find((r: any) => r.path.includes(':id'));
      expect(detailRoute).toBeDefined();
      expect(detailRoute.method).toBe('GET');
      expect(detailRoute.params).toHaveLength(1);
      expect(detailRoute.params[0].name).toBe('id');
      expect(detailRoute.params[0].location).toBe('path');
    });

    it('generates command routes from IR commands', async () => {
      const source = `
        entity Recipe {
          property id: string
          property name: string

          command create(name: string) {
            guard name != ""
            mutate name = name
          }
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const routeResult = projection.generate(result.ir!, {
        surface: 'routes.manifest',
        options: { generatedAt: '2026-01-01T00:00:00.000Z' },
      });

      const manifest = parseManifest(routeResult);

      const commandRoute = manifest.routes.find(
        (r: any) => r.source.kind === 'command' && r.source.command === 'create'
      );
      expect(commandRoute).toBeDefined();
      expect(commandRoute.method).toBe('POST');
      expect(commandRoute.path).toBe('/api/recipe/create');
      expect(commandRoute.params).toHaveLength(1);
      expect(commandRoute.params[0].name).toBe('name');
      expect(commandRoute.params[0].type).toBe('string');
      expect(commandRoute.params[0].location).toBe('body');
    });

    it('is deterministic — identical IR produces identical output', async () => {
      const source = `
        entity Recipe {
          property id: string
          property name: string

          command create(name: string) {
            mutate name = name
          }
        }

        entity User {
          property id: string
          property email: string
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const opts = { generatedAt: '2026-01-01T00:00:00.000Z' };

      const result1 = firstCode(projection.generate(result.ir!, { surface: 'routes.manifest', options: opts }));
      const result2 = firstCode(projection.generate(result.ir!, { surface: 'routes.manifest', options: opts }));

      // Byte-identical
      expect(result1).toBe(result2);
    });

    it('sorts entities and commands alphabetically for determinism', async () => {
      const source = `
        entity Zebra {
          property id: string
        }

        entity Apple {
          property id: string
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const routeResult = projection.generate(result.ir!, {
        surface: 'routes.manifest',
        options: { generatedAt: '2026-01-01T00:00:00.000Z' },
      });

      const manifest = parseManifest(routeResult);
      const entityRoutes = manifest.routes.filter((r: any) => r.source.kind === 'entity-read');

      // Apple routes should come before Zebra routes
      const firstEntity = entityRoutes[0].source.entity;
      expect(firstEntity).toBe('Apple');
    });

    it('respects custom basePath', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);

      const routeResult = projection.generate(result.ir!, {
        surface: 'routes.manifest',
        options: { basePath: '/v2/api', generatedAt: '2026-01-01T00:00:00.000Z' },
      });

      const manifest = parseManifest(routeResult);
      expect(manifest.basePath).toBe('/v2/api');
      expect(manifest.routes[0].path).toContain('/v2/api/');
    });

    it('merges manual routes into manifest', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);

      const routeResult = projection.generate(result.ir!, {
        surface: 'routes.manifest',
        options: {
          generatedAt: '2026-01-01T00:00:00.000Z',
          manualRoutes: [
            {
              id: 'health-check',
              path: '/api/health',
              method: 'GET',
              auth: false,
              tenant: false,
            },
          ],
        },
      });

      const manifest = parseManifest(routeResult);
      const manualRoute = manifest.routes.find((r: any) => r.source.kind === 'manual');
      expect(manualRoute).toBeDefined();
      expect(manualRoute.path).toBe('/api/health');
      expect(manualRoute.source.id).toBe('health-check');
      expect(manualRoute.auth).toBe(false);
      expect(manualRoute.tenant).toBe(false);
    });

    it('reports diagnostic on duplicate manual route IDs', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);

      const routeResult = projection.generate(result.ir!, {
        surface: 'routes.manifest',
        options: {
          generatedAt: '2026-01-01T00:00:00.000Z',
          manualRoutes: [
            { id: 'dup', path: '/a', method: 'GET' },
            { id: 'dup', path: '/b', method: 'POST' },
          ],
        },
      });

      expect(routeResult.diagnostics).toHaveLength(1);
      expect(routeResult.diagnostics[0].code).toBe('DUPLICATE_MANUAL_ROUTE');
    });

    it('reports warning on route path collisions', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);

      // Manual route that collides with entity-derived list route
      const routeResult = projection.generate(result.ir!, {
        surface: 'routes.manifest',
        options: {
          generatedAt: '2026-01-01T00:00:00.000Z',
          manualRoutes: [
            { id: 'collision', path: '/api/recipe/list', method: 'GET' },
          ],
        },
      });

      const collisionDiag = routeResult.diagnostics.find(d => d.code === 'ROUTE_COLLISION');
      expect(collisionDiag).toBeDefined();
    });

    it('includes auth and tenant expectations', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);

      // Default: auth=true, tenant=true
      const withDefaults = parseManifest(projection.generate(result.ir!, {
        surface: 'routes.manifest',
        options: { generatedAt: '2026-01-01T00:00:00.000Z' },
      }));
      expect(withDefaults.routes[0].auth).toBe(true);
      expect(withDefaults.routes[0].tenant).toBe(true);

      // Disabled
      const withoutAuth = parseManifest(projection.generate(result.ir!, {
        surface: 'routes.manifest',
        options: {
          generatedAt: '2026-01-01T00:00:00.000Z',
          includeAuth: false,
          includeTenant: false,
        },
      }));
      expect(withoutAuth.routes[0].auth).toBe(false);
      expect(withoutAuth.routes[0].tenant).toBe(false);
    });
  });

  // ========================================================================
  // routes.ts surface
  // ========================================================================

  describe('routes.ts surface', () => {
    it('generates typed path builders for entity reads', async () => {
      const source = `
        entity Recipe {
          property id: string
          property name: string
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const routeResult = projection.generate(result.ir!, {
        surface: 'routes.ts',
        options: { generatedAt: '2026-01-01T00:00:00.000Z' },
      });

      const code = firstCode(routeResult);

      // List path builder
      expect(code).toContain('export function recipeListPath(): string');
      expect(code).toContain('return "/api/recipe/list"');

      // Detail path builder with encodeURIComponent
      expect(code).toContain('export function recipeDetailPath(id: string): string');
      expect(code).toContain('encodeURIComponent(id)');
    });

    it('generates typed path builders for commands', async () => {
      const source = `
        entity Recipe {
          property id: string
          property name: string

          command create(name: string) {
            mutate name = name
          }
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const routeResult = projection.generate(result.ir!, {
        surface: 'routes.ts',
        options: { generatedAt: '2026-01-01T00:00:00.000Z' },
      });

      const code = firstCode(routeResult);

      // Command path builder
      expect(code).toContain('export function recipeCreatePath(): string');
      expect(code).toContain('return "/api/recipe/create"');
    });

    it('generates typed path builders for manual routes', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);

      const routeResult = projection.generate(result.ir!, {
        surface: 'routes.ts',
        options: {
          generatedAt: '2026-01-01T00:00:00.000Z',
          manualRoutes: [
            { id: 'health-check', path: '/api/health', method: 'GET' },
          ],
        },
      });

      const code = firstCode(routeResult);
      expect(code).toContain('export function healthCheckPath(): string');
      expect(code).toContain('return "/api/health"');
    });

    it('generates manual route path builders with path params', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);

      const routeResult = projection.generate(result.ir!, {
        surface: 'routes.ts',
        options: {
          generatedAt: '2026-01-01T00:00:00.000Z',
          manualRoutes: [
            {
              id: 'user-profile',
              path: '/api/users/:userId/profile',
              method: 'GET',
              params: [{ name: 'userId', type: 'string', location: 'path' }],
            },
          ],
        },
      });

      const code = firstCode(routeResult);
      expect(code).toContain('export function userProfilePath(userId: string): string');
      expect(code).toContain('encodeURIComponent(userId)');
    });

    it('includes ROUTE_MANIFEST metadata array', async () => {
      const source = `
        entity Recipe {
          property id: string

          command create(name: string) {
            mutate name = name
          }
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const routeResult = projection.generate(result.ir!, {
        surface: 'routes.ts',
        options: { generatedAt: '2026-01-01T00:00:00.000Z' },
      });

      const code = firstCode(routeResult);

      expect(code).toContain('export const ROUTE_MANIFEST: readonly RouteMetadata[]');
      expect(code).toContain('"entity-read"');
      expect(code).toContain('"command"');
    });

    it('includes DO NOT EDIT header and spec reference', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);

      const routeResult = projection.generate(result.ir!, {
        surface: 'routes.ts',
        options: { generatedAt: '2026-01-01T00:00:00.000Z' },
      });

      const code = firstCode(routeResult);
      expect(code).toContain('DO NOT EDIT');
      expect(code).toContain('Canonical Routes');
    });

    it('artifact has correct id and pathHint', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);

      const routeResult = projection.generate(result.ir!, {
        surface: 'routes.ts',
        options: { generatedAt: '2026-01-01T00:00:00.000Z' },
      });

      expect(routeResult.artifacts[0].id).toBe('routes.ts');
      expect(routeResult.artifacts[0].pathHint).toBe('src/routes.ts');
      expect(routeResult.artifacts[0].contentType).toBe('typescript');
    });
  });

  // ========================================================================
  // Error handling
  // ========================================================================

  describe('error handling', () => {
    it('returns error diagnostic for unknown surface', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);

      const routeResult = projection.generate(result.ir!, {
        surface: 'routes.unknown',
      });

      expect(routeResult.artifacts).toHaveLength(0);
      expect(routeResult.diagnostics).toHaveLength(1);
      expect(routeResult.diagnostics[0].severity).toBe('error');
      expect(routeResult.diagnostics[0].code).toBe('UNKNOWN_SURFACE');
    });

    it('warns on commands without entity', async () => {
      // Construct IR directly with a command that has no entity
      const ir = {
        version: '1.0' as const,
        provenance: {
          contentHash: 'test',
          compilerVersion: '0.0.0',
          schemaVersion: '1.0',
          compiledAt: '2026-01-01T00:00:00.000Z',
        },
        modules: [],
        entities: [],
        stores: [],
        events: [],
        commands: [{
          name: 'orphanCommand',
          parameters: [],
          guards: [],
          actions: [],
          emits: [],
        }],
        policies: [],
      };

      const routeResult = projection.generate(ir, {
        surface: 'routes.manifest',
        options: { generatedAt: '2026-01-01T00:00:00.000Z' },
      });

      const warningDiag = routeResult.diagnostics.find(d => d.code === 'COMMAND_NO_ENTITY');
      expect(warningDiag).toBeDefined();
    });
  });
});
