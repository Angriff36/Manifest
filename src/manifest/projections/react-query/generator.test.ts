/**
 * Tests for the TanStack Query (React Query) projection.
 *
 * Verifies:
 * - Projection metadata (name, surfaces, description)
 * - Hook generation for entity list and detail queries
 * - Query key factory generation
 * - Command mutation hook generation with cache invalidation
 * - Provider generation with QueryClient setup
 * - Options normalization (custom API paths, staleTime, error boundaries)
 * - Type generation (entity types, command input types)
 * - Edge cases (empty IR, unknown surfaces, orphan commands)
 * - Deterministic output
 */

import { describe, it, expect } from 'vitest';
import { compileToIR } from '../../ir-compiler';
import { ReactQueryProjection } from './generator';
// Static import: pulling the full registry graph through a dynamic import
// inside a test body can exceed the 5s test timeout under full-suite load.
// Registration stays lazy — it happens inside getProjection(), not at import.
import { getProjection } from '../registry';
import type { IR } from '../../ir';

describe('ReactQueryProjection', () => {
  const projection = new ReactQueryProjection();

  function firstCode(result: ReturnType<typeof projection.generate>): string {
    expect(result.artifacts.length).toBeGreaterThan(0);
    return result.artifacts[0].code;
  }

  function makeMinimalIR(overrides: Record<string, unknown> = {}): IR {
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
      expect(projection.name).toBe('react-query');
      expect(projection.description).toContain('TanStack Query');
      expect(projection.surfaces).toContain('react-query.hooks');
      expect(projection.surfaces).toContain('react-query.provider');
    });

    it('is registered as a built-in projection', () => {
      const p = getProjection('react-query');
      expect(p).toBeDefined();
      expect(p!.name).toBe('react-query');
    });
  });

  // ========================================================================
  // Unknown surface handling
  // ========================================================================

  describe('unknown surface', () => {
    it('returns error diagnostic for unknown surface', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'react-query.unknown' });
      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].severity).toBe('error');
      expect(result.diagnostics[0].code).toBe('UNKNOWN_SURFACE');
    });
  });

  // ========================================================================
  // react-query.hooks surface — entity queries
  // ========================================================================

  describe('react-query.hooks surface — entity queries', () => {
    it('generates list and detail hooks for a single entity', async () => {
      const source = `
        entity Recipe {
          property required id: string
          property required name: string
          property category: string?
          property rating: number = 5
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const hooksResult = projection.generate(result.ir!, { surface: 'react-query.hooks' });
      const code = firstCode(hooksResult);

      // Imports
      expect(code).toContain("from '@tanstack/react-query'");
      expect(code).toContain('useQuery');
      expect(code).toContain('useMutation');
      expect(code).toContain('useQueryClient');

      // Entity type
      expect(code).toContain('export interface Recipe {');
      expect(code).toContain('id: string;');
      expect(code).toContain('name: string;');
      expect(code).toContain('category?: string | null;');
      expect(code).toContain('rating?: number;');

      // Query key factory
      expect(code).toContain("all: ['recipe'] as const");
      expect(code).toContain('queryKeys.recipe.lists()');
      expect(code).toContain('queryKeys.recipe.detail(id)');

      // List hook
      expect(code).toContain('export function useRecipeList(');
      expect(code).toContain('queryKey: queryKeys.recipe.lists()');
      expect(code).toContain('/api/recipe/list');
      expect(code).toContain('data.recipes');

      // Detail hook
      expect(code).toContain('export function useRecipeDetail(');
      expect(code).toContain('queryKey: queryKeys.recipe.detail(id)');
      expect(code).toContain('encodeURIComponent(id)');
      expect(code).toContain('data.recipe');
      expect(code).toContain('enabled: !!id');
    });

    it('maps all numeric scalar types to number (no bare token leak)', async () => {
      const source = `
        entity Reading {
          property required id: string
          property usageHours: float
          property count: int
          property big: bigint
          property price: money
          property exact: decimal
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const code = firstCode(projection.generate(result.ir!, { surface: 'react-query.hooks' }));

      expect(code).toContain('usageHours: number;');
      expect(code).toContain('count: number;');
      expect(code).toContain('big: number;');
      expect(code).toContain('price: number;');
      expect(code).toContain('exact: number;');
      // The raw scalar token must never leak into the emitted TS type.
      expect(code).not.toContain(': float');
      expect(code).not.toContain(': bigint');
    });

    it('maps canonical TypeScript scalars without leaking Manifest tokens', async () => {
      const result = await compileToIR(
        `entity Asset { property id: uuid property metadata: json property createdAt: timestamp property content: bytes }`,
      );
      expect(result.ir).not.toBeNull();
      const code = firstCode(projection.generate(result.ir!, { surface: 'react-query.hooks' }));
      expect(code).toContain('id: string;');
      expect(code).toContain('metadata: unknown;');
      expect(code).toContain('createdAt: Date;');
      expect(code).toContain('content: Uint8Array;');
    });

    it('emits a valid zero-parameter mutation while retaining void options typing', async () => {
      const result = await compileToIR(
        `entity Task { property id: string command archive() { mutate id = self.id } }`,
      );
      expect(result.ir).not.toBeNull();
      const code = firstCode(projection.generate(result.ir!, { surface: 'react-query.hooks' }));
      expect(code).toContain('UseMutationOptions<ManifestCommandResponse<unknown>, Error, void>');
      expect(code).toContain('mutationFn: () =>');
      expect(code).not.toContain('mutationFn: (: void)');
    });

    it('emits Date for datetime by default, string under dateSerialization:iso-string', async () => {
      const source = `
        entity Log {
          property required id: string
          property occurredAt: datetime
          property due: date
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const dflt = firstCode(projection.generate(result.ir!, { surface: 'react-query.hooks' }));
      expect(dflt).toContain('occurredAt: Date;');
      expect(dflt).toContain('due: Date;');

      const iso = firstCode(
        projection.generate(result.ir!, {
          surface: 'react-query.hooks',
          options: { dateSerialization: 'iso-string' },
        }),
      );
      expect(iso).toContain('occurredAt: string;');
      expect(iso).toContain('due: string;');
      expect(iso).not.toContain(': Date;');
    });

    it('routeCasing controls the default fetch path segment', async () => {
      const source = `entity PrepTask { property required id: string }`;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const dflt = firstCode(projection.generate(result.ir!, { surface: 'react-query.hooks' }));
      expect(dflt).toContain('/api/preptask/list');

      const kebab = firstCode(
        projection.generate(result.ir!, {
          surface: 'react-query.hooks',
          options: { routeCasing: 'kebab-case' },
        }),
      );
      expect(kebab).toContain('/api/prep-task/list');
      expect(kebab).not.toContain('/api/preptask/list');
    });

    it('maps array types to T[] (no raw array token leak)', async () => {
      const source = `
        entity Bag {
          property required id: string
          property labels: string[]
          property scores: int[]
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const code = firstCode(projection.generate(result.ir!, { surface: 'react-query.hooks' }));

      expect(code).toContain('labels: string[];');
      expect(code).toContain('scores: number[];');
      // The bare `array` token must never reach the emitted TS.
      expect(code).not.toContain(': array');
    });

    it('generates hooks for multiple entities', async () => {
      const source = `
        entity Recipe {
          property required id: string
          property required name: string
        }
        entity Ingredient {
          property required id: string
          property required label: string
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const hooksResult = projection.generate(result.ir!, { surface: 'react-query.hooks' });
      const code = firstCode(hooksResult);

      expect(code).toContain('export function useRecipeList(');
      expect(code).toContain('export function useRecipeDetail(');
      expect(code).toContain('export function useIngredientList(');
      expect(code).toContain('export function useIngredientDetail(');

      // Query keys for both
      expect(code).toContain("all: ['recipe'] as const");
      expect(code).toContain("all: ['ingredient'] as const");
    });

    it('handles empty IR with no entities', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'react-query.hooks' });
      const code = firstCode(result);

      expect(code).toContain("from '@tanstack/react-query'");
      expect(code).toContain('queryKeys');
      expect(code).not.toContain('useRecipe');
    });
  });

  // ========================================================================
  // react-query.hooks surface — command mutations
  // ========================================================================

  describe('react-query.hooks surface — command mutations', () => {
    it('generates mutation hook for entity command with parameters', async () => {
      const source = `
        entity Task {
          property required id: string
          property required title: string = ""
          property status: string = "pending"

          command create(title: string, description: string?) {
            mutate title = title
            mutate status = "pending"
          }
        }

        store Task in memory
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const hooksResult = projection.generate(result.ir!, { surface: 'react-query.hooks' });
      const code = firstCode(hooksResult);

      // Command input type
      expect(code).toContain('export interface TaskCreateInput {');
      expect(code).toContain('title: string;');

      // Mutation hook — POSTs the dispatcher with the RAW entity + command names
      // (the dispatcher resolves by exact name; a lowercased/kebab URL misses it).
      expect(code).toContain('export function useTaskCreate(');
      expect(code).toContain("method: 'POST'");
      expect(code).toContain('/api/manifest/Task/commands/create');
      expect(code).toContain('JSON.stringify(input)');

      // Cache invalidation
      expect(code).toContain('queryClient.invalidateQueries({ queryKey: queryKeys.task.all }');
    });

    it('generates mutation hook for command without parameters', async () => {
      const source = `
        entity Counter {
          property required id: string
          property count: number = 0

          command increment() {
            mutate count = count + 1
          }
        }

        store Counter in memory
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const hooksResult = projection.generate(result.ir!, { surface: 'react-query.hooks' });
      const code = firstCode(hooksResult);

      expect(code).toContain('export function useCounterIncrement(');
      expect(code).toContain('JSON.stringify({})');
      // Should not generate an input type for parameterless command
      expect(code).not.toContain('CounterIncrementInput');
    });

    it('generates multiple mutation hooks for multi-command entity', async () => {
      const source = `
        entity Order {
          property required id: string
          property status: string = "draft"
          property note: string = ""

          command submit(note: string) {
            mutate status = "submitted"
            mutate note = note
          }

          command cancel() {
            mutate status = "cancelled"
          }
        }

        store Order in memory
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const hooksResult = projection.generate(result.ir!, { surface: 'react-query.hooks' });
      const code = firstCode(hooksResult);

      expect(code).toContain('export function useOrderSubmit(');
      expect(code).toContain('export function useOrderCancel(');
      expect(code).toContain('/api/manifest/Order/commands/submit');
      expect(code).toContain('/api/manifest/Order/commands/cancel');
    });
  });

  // ========================================================================
  // react-query.hooks surface — options
  // ========================================================================

  describe('react-query.hooks surface — options', () => {
    it('uses custom apiBasePath', async () => {
      const source = `entity Foo { property id: string }`;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const hooksResult = projection.generate(result.ir!, {
        surface: 'react-query.hooks',
        options: { apiBasePath: '/v2' },
      });
      const code = firstCode(hooksResult);

      expect(code).toContain('/v2/foo/list');
    });

    it('uses custom dispatcherBasePath', async () => {
      const source = `
        entity Foo {
          property id: string
          property val: string = ""

          command doIt(val: string) {
            mutate val = val
          }
        }

        store Foo in memory
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const hooksResult = projection.generate(result.ir!, {
        surface: 'react-query.hooks',
        options: { dispatcherBasePath: '/api/v2/manifest' },
      });
      const code = firstCode(hooksResult);

      // Raw entity + command names on the custom dispatcher base.
      expect(code).toContain('/api/v2/manifest/Foo/commands/doIt');
    });

    it('uses custom staleTime', async () => {
      const source = `entity Foo { property id: string }`;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const hooksResult = projection.generate(result.ir!, {
        surface: 'react-query.hooks',
        options: { defaultStaleTime: 60_000 },
      });
      const code = firstCode(hooksResult);

      expect(code).toContain('staleTime: 60000');
    });
  });

  // ========================================================================
  // react-query.hooks surface — query key factories
  // ========================================================================

  describe('react-query.hooks surface — query key factories', () => {
    it('generates deterministic query key factories', async () => {
      const source = `
        entity UserProfile {
          property required id: string
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const hooksResult = projection.generate(result.ir!, { surface: 'react-query.hooks' });
      const code = firstCode(hooksResult);

      expect(code).toContain('export const queryKeys = {');
      expect(code).toContain("all: ['userProfile'] as const");
      expect(code).toContain("...queryKeys.userProfile.all, 'list'");
      expect(code).toContain("...queryKeys.userProfile.all, 'detail', id");
    });
  });

  // ========================================================================
  // react-query.hooks surface — apiFetch helper
  // ========================================================================

  describe('react-query.hooks surface — apiFetch helper', () => {
    it('includes typed apiFetch helper', async () => {
      const source = `entity Foo { property id: string }`;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const hooksResult = projection.generate(result.ir!, { surface: 'react-query.hooks' });
      const code = firstCode(hooksResult);

      expect(code).toContain('async function apiFetch<T>(url: string');
      expect(code).toContain('response.ok');
      expect(code).toContain('return response.json()');
    });
  });

  // ========================================================================
  // react-query.provider surface
  // ========================================================================

  describe('react-query.provider surface', () => {
    it('generates QueryClientProvider component', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'react-query.provider' });
      const code = firstCode(result);

      expect(code).toContain("'use client'");
      expect(code).toContain("from '@tanstack/react-query'");
      expect(code).toContain("from 'react'");
      expect(code).toContain('export function ManifestQueryProvider');
      expect(code).toContain('QueryClientProvider');
      expect(code).toContain('new QueryClient');
    });

    it('includes throwOnError when errorBoundaryIntegration is true (default)', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'react-query.provider' });
      const code = firstCode(result);

      expect(code).toContain('throwOnError: true');
    });

    it('omits throwOnError when errorBoundaryIntegration is false', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, {
        surface: 'react-query.provider',
        options: { errorBoundaryIntegration: false },
      });
      const code = firstCode(result);

      expect(code).not.toContain('throwOnError');
    });

    it('uses custom staleTime in provider', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, {
        surface: 'react-query.provider',
        options: { defaultStaleTime: 10_000 },
      });
      const code = firstCode(result);

      expect(code).toContain('staleTime: 10000');
    });
  });

  // ========================================================================
  // Artifact metadata
  // ========================================================================

  describe('artifact metadata', () => {
    it('hooks artifact has correct id, pathHint, and contentType', async () => {
      const source = `entity Foo { property id: string }`;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const hooksResult = projection.generate(result.ir!, { surface: 'react-query.hooks' });
      expect(hooksResult.artifacts).toHaveLength(1);
      expect(hooksResult.artifacts[0].id).toBe('react-query.hooks');
      expect(hooksResult.artifacts[0].pathHint).toBe('src/hooks/manifest-hooks.ts');
      expect(hooksResult.artifacts[0].contentType).toBe('typescript');
    });

    it('provider artifact has correct id, pathHint, and contentType', () => {
      const ir = makeMinimalIR();
      const result = projection.generate(ir, { surface: 'react-query.provider' });
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].id).toBe('react-query.provider');
      expect(result.artifacts[0].pathHint).toBe('src/providers/manifest-query-provider.tsx');
      expect(result.artifacts[0].contentType).toBe('typescript');
    });
  });

  // ========================================================================
  // react-query.hooks surface — D23 options (routes, envelope, adapter, command envelope)
  // ========================================================================

  describe('react-query.hooks surface — entityRoutes override', () => {
    it('routes reads and writes to domain paths with original casing', async () => {
      const source = `
        entity Event {
          property required id: string
          property name: string = ""

          command announce(name: string) {
            mutate name = name
          }
        }

        store Event in memory
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const hooksResult = projection.generate(result.ir!, {
        surface: 'react-query.hooks',
        options: {
          entityRoutes: {
            Event: { readBase: '/api/events/event', writeBase: '/api/manifest/Event/commands' },
          },
        },
      });
      const code = firstCode(hooksResult);

      expect(code).toContain('`/api/events/event/list`');
      expect(code).toContain('`/api/events/event/${encodeURIComponent(id)}`');
      expect(code).toContain('/api/manifest/Event/commands/announce');
      // Default flattened path must NOT appear.
      expect(code).not.toContain('/api/event/list');
    });
  });

  describe('react-query.hooks surface — readEnvelope override', () => {
    it('uses overridden envelope keys and a fallback key', async () => {
      const source = `
        entity Dish {
          property required id: string
          property name: string = ""
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const hooksResult = projection.generate(result.ir!, {
        surface: 'react-query.hooks',
        options: {
          readEnvelope: {
            Dish: { listKey: 'dishes', detailKey: 'dish', fallbackKey: 'data' },
          },
        },
      });
      const code = firstCode(hooksResult);

      expect(code).toContain('data.dishes ?? data.data');
      expect(code).toContain('data.dish ?? data.data');
      // Default `+s` pluralization (dishs) must not leak.
      expect(code).not.toContain('data.dishs');
    });
  });

  describe('react-query.hooks surface — fetchAdapter import', () => {
    it('imports the host adapter and omits the inline helper', async () => {
      const source = `entity Foo { property id: string }`;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const hooksResult = projection.generate(result.ir!, {
        surface: 'react-query.hooks',
        options: { fetchAdapter: { importPath: '@/lib/api', importName: 'apiFetch' } },
      });
      const code = firstCode(hooksResult);

      expect(code).toContain("import { apiFetch } from '@/lib/api';");
      expect(code).not.toContain('async function apiFetch<T>');
    });

    it('aliases a differently-named adapter export to apiFetch', async () => {
      const source = `entity Foo { property id: string }`;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const hooksResult = projection.generate(result.ir!, {
        surface: 'react-query.hooks',
        options: { fetchAdapter: { importPath: '@/lib/api', importName: 'authedFetch' } },
      });
      const code = firstCode(hooksResult);

      expect(code).toContain("import { authedFetch as apiFetch } from '@/lib/api';");
    });
  });

  describe('react-query.hooks surface — commandEnvelope', () => {
    it('types mutations as CommandEnvelope when enabled', async () => {
      const source = `
        entity Foo {
          property id: string
          property val: string = ""

          command doIt(val: string) {
            mutate val = val
          }
        }

        store Foo in memory
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const hooksResult = projection.generate(result.ir!, {
        surface: 'react-query.hooks',
        options: { commandEnvelope: true },
      });
      const code = firstCode(hooksResult);

      expect(code).toContain('export interface CommandEnvelope<T> {');
      expect(code).toContain('CommandEnvelope<');
    });

    it('does not emit CommandEnvelope by default', async () => {
      const source = `
        entity Foo {
          property id: string
          property val: string = ""

          command doIt(val: string) {
            mutate val = val
          }
        }

        store Foo in memory
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const hooksResult = projection.generate(result.ir!, { surface: 'react-query.hooks' });
      const code = firstCode(hooksResult);

      expect(code).not.toContain('CommandEnvelope');
    });

    it('defaults mutations to ManifestCommandResponse (the real dispatcher wire body)', async () => {
      const source = `
        entity Foo {
          property id: string
          property val: string = ""

          command doIt(val: string) {
            mutate val = val
          }
        }

        store Foo in memory
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const hooksResult = projection.generate(result.ir!, { surface: 'react-query.hooks' });
      const code = firstCode(hooksResult);

      // The interface models the { data, events, diagnostics } success body.
      expect(code).toContain('export interface ManifestCommandResponse<T = unknown> {');
      expect(code).toContain('data?: T;');
      // The mutation hook types its response as that envelope, not the bare return.
      expect(code).toContain('ManifestCommandResponse<');
    });
  });

  // ========================================================================
  // Determinism
  // ========================================================================

  describe('determinism', () => {
    it('produces identical output for identical IR', async () => {
      const source = `
        entity Recipe {
          property required id: string
          property required name: string = ""

          command create(name: string) {
            mutate name = name
          }
        }

        store Recipe in memory
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const first = projection.generate(result.ir!, { surface: 'react-query.hooks' });
      const second = projection.generate(result.ir!, { surface: 'react-query.hooks' });

      expect(firstCode(first)).toBe(firstCode(second));
    });
  });
});
