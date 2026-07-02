/**
 * Smoke tests for Next.js projection generator.
 *
 * Tests verify the critical contract:
 * - Must use Prisma directly for reads (NOT runtime.query or runtime.get)
 * - Must include tenantId + deletedAt filtering (when enabled)
 * - Must handle entity not found errors
 */

import { describe, it, expect } from 'vitest';
import { compileToIR } from '../../ir-compiler';
import { NextJsProjection } from './generator';

function expectNoCompileErrors(result: Awaited<ReturnType<typeof compileToIR>>) {
  expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  expect(result.ir).not.toBeNull();
}

describe('NextJsProjection', () => {
  const projection = new NextJsProjection();

  function firstCode(result: ReturnType<typeof projection.generate>): string {
    expect(result.artifacts.length).toBeGreaterThan(0);
    return result.artifacts[0].code;
  }

  describe('nextjs.route surface', () => {
    it('generates route with direct Prisma query (not runtime.query)', async () => {
      const source = `
        entity Recipe {
          property id: string
          property name: string
          property category: string?
          property createdAt: datetime
          property deletedAt: datetime?
        }
      `;

      const result = await compileToIR(source);
      expectNoCompileErrors(result);

      const routeResult = projection.generate(result.ir!, { surface: 'nextjs.route', entity: 'Recipe' });

      const code = firstCode(routeResult);

      // Contract: Must use Prisma directly for reads
      expect(code).toContain('database.recipe.findMany');
      expect(code).not.toContain('runtime.query');
      expect(code).not.toContain('runtime.get');

      // Contract: With new defaults, no tenant or soft-delete filters
      expect(code).not.toContain('tenantId');
      expect(code).not.toContain('deletedAt');
      // orderBy references the real createdAt column.
      expect(code).toContain('createdAt: "desc"');

      // Contract: Must have proper error handling
      expect(code).toContain('try {');
      expect(code).toContain('} catch (error)');
      expect(code).toContain('manifestErrorResponse');

      // Contract: Must have auth check
      expect(code).toContain('Unauthorized');

      expect(routeResult.diagnostics).toHaveLength(0);
    });

    it('routeCasing controls the default segment (lowercase default; kebab/snake/preserve)', async () => {
      const source = `entity PrepTask { property id: string }`;
      const result = await compileToIR(source);
      expectNoCompileErrors(result);

      const seg = (opts?: Record<string, unknown>) =>
        projection.generate(result.ir!, { surface: 'nextjs.route', entity: 'PrepTask', options: opts })
          .artifacts[0].pathHint;

      // Default (legacy): flattened lowercase, no word boundaries.
      expect(seg()).toContain('/preptask/list/route.ts');
      expect(seg({ routeCasing: 'kebab-case' })).toContain('/prep-task/list/route.ts');
      expect(seg({ routeCasing: 'snake_case' })).toContain('/prep_task/list/route.ts');
      expect(seg({ routeCasing: 'preserve' })).toContain('/PrepTask/list/route.ts');

      // Explicit routeSegments still wins over casing.
      expect(seg({ routeCasing: 'kebab-case', routeSegments: { PrepTask: 'kitchen/prep-tasks' } }))
        .toContain('/kitchen/prep-tasks/list/route.ts');
    });

    it('routeSegments accepts a multi-segment domain path (no post-process remap needed)', async () => {
      const source = `entity Event { property id: string }`;
      const result = await compileToIR(source);
      expectNoCompileErrors(result);

      const pathFor = (surface: string) =>
        projection.generate(result.ir!, {
          surface,
          entity: 'Event',
          options: { appDir: 'app/api', routeSegments: { Event: 'events/event' } },
        }).artifacts[0]?.pathHint;

      // The domain path flows verbatim into list + detail route paths.
      expect(pathFor('nextjs.route')).toBe('app/api/events/event/list/route.ts');
      expect(pathFor('nextjs.detail')).toBe('app/api/events/event/[id]/route.ts');
    });

    it('returns error diagnostic if entity not found in IR', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);

      expectNoCompileErrors(result);

      const routeResult = projection.generate(result.ir!, { surface: 'nextjs.route', entity: 'NonExistent' });

      expect(routeResult.artifacts).toHaveLength(0);
      expect(routeResult.diagnostics).toHaveLength(1);
      expect(routeResult.diagnostics[0].severity).toBe('error');
      expect(routeResult.diagnostics[0].message).toContain('Entity "NonExistent" not found');
      expect(routeResult.diagnostics[0].entity).toBe('NonExistent');
    });

    it('returns error diagnostic if entity not provided', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);

      const routeResult = projection.generate(result.ir!, { surface: 'nextjs.route' });

      expect(routeResult.artifacts).toHaveLength(0);
      expect(routeResult.diagnostics).toHaveLength(1);
      expect(routeResult.diagnostics[0].severity).toBe('error');
      expect(routeResult.diagnostics[0].message).toContain('requires entity');
    });

    it('respects includeTenantFilter option', async () => {
      const source = `
        entity Recipe {
          property id: string
          property name: string
        }
      `;

      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const noFilterResult = projection.generate(result.ir!, {
        surface: 'nextjs.route',
        entity: 'Recipe',
        options: { includeTenantFilter: false },
      });

      const noFilterCode = firstCode(noFilterResult);
      expect(noFilterCode).not.toContain('tenantId');

      const withFilterResult = projection.generate(result.ir!, {
        surface: 'nextjs.route',
        entity: 'Recipe',
        options: { includeTenantFilter: true },
      });

      const withFilterCode = firstCode(withFilterResult);
      expect(withFilterCode).toContain('tenantId');
      expect(withFilterCode).toContain('getTenantIdForOrg');
    });

    it('respects includeSoftDeleteFilter option', async () => {
      const source = `
        entity Recipe {
          property id: string
          property name: string
          property deletedAt: datetime?
        }
      `;

      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const noSoftDeleteResult = projection.generate(result.ir!, {
        surface: 'nextjs.route',
        entity: 'Recipe',
        options: { includeSoftDeleteFilter: false },
      });

      expect(firstCode(noSoftDeleteResult)).not.toContain('deletedAt');

      const withSoftDeleteResult = projection.generate(result.ir!, {
        surface: 'nextjs.route',
        entity: 'Recipe',
        options: { includeSoftDeleteFilter: true },
      });

      expect(firstCode(withSoftDeleteResult)).toContain('deletedAt');
    });

    it('supports different auth providers', async () => {
      const source = `
        entity Recipe {
          property id: string
        }
      `;

      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const clerkResult = projection.generate(result.ir!, {
        surface: 'nextjs.route',
        entity: 'Recipe',
        options: { authProvider: 'clerk', authImportPath: '@repo/auth/server' },
      });
      expect(firstCode(clerkResult)).toContain('from "@repo/auth/server"');
      expect(firstCode(clerkResult)).toContain('const { orgId, userId } = await auth()');

      const nextAuthResult = projection.generate(result.ir!, {
        surface: 'nextjs.route',
        entity: 'Recipe',
        options: { authProvider: 'nextauth' },
      });
      expect(firstCode(nextAuthResult)).toContain('getServerSession');

      const noAuthResult = projection.generate(result.ir!, {
        surface: 'nextjs.route',
        entity: 'Recipe',
        options: { authProvider: 'none' },
      });
      expect(firstCode(noAuthResult)).toContain('Auth disabled');
      expect(firstCode(noAuthResult)).toContain('const userId = "anonymous"');
    });

    it('respects custom import paths', async () => {
      const source = `
        entity Recipe {
          property id: string
        }
      `;

      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const customPathsResult = projection.generate(result.ir!, {
        surface: 'nextjs.route',
        entity: 'Recipe',
        options: {
          databaseImportPath: '@myapp/db',
          authImportPath: '@myapp/auth',
          responseImportPath: '@myapp/responses',
        },
      });

      const code = firstCode(customPathsResult);
      expect(code).toContain('from "@myapp/db"');
      // Test auth import only if auth is enabled
      if (code.includes('Auth disabled')) {
        expect(code).not.toContain('from "@myapp/auth"');
      } else {
        expect(code).toContain('from "@myapp/auth"');
      }
      expect(code).toContain('from "@myapp/responses"');
    });

    it('respects custom tenant and soft delete property names', async () => {
      const source = `
        entity Recipe {
          property id: string
          property removedAt: datetime?
        }
      `;

      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const customPropsResult = projection.generate(result.ir!, {
        surface: 'nextjs.route',
        entity: 'Recipe',
        options: {
          includeTenantFilter: true,
          includeSoftDeleteFilter: true,
          tenantIdProperty: 'orgId',
          deletedAtProperty: 'removedAt',
        },
      });

      const code = firstCode(customPropsResult);
      expect(code).toContain('orgId');
      expect(code).toContain('removedAt: null');
      expect(code).not.toContain('tenantId');
      expect(code).not.toContain('deletedAt');
    });
  });

  describe('nextjs.detail surface', () => {
    it('generates detail route with direct Prisma findUnique (not runtime.query)', async () => {
      const source = `
        entity Recipe {
          property id: string
          property name: string
          property category: string?
          property deletedAt: datetime?
        }
      `;

      const result = await compileToIR(source);
      expectNoCompileErrors(result);

      const detailResult = projection.generate(result.ir!, { surface: 'nextjs.detail', entity: 'Recipe' });

      const code = firstCode(detailResult);

      // Contract: Must use Prisma findUnique for single-field reads
      expect(code).toContain('database.recipe.findUnique');
      expect(code).not.toContain('database.recipe.findFirst');
      expect(code).not.toContain('runtime.query');
      expect(code).not.toContain('runtime.get');
      expect(code).not.toContain('findMany');

      // Contract: Must extract id from URL params
      expect(code).toContain('const { id } = await params;');

      // Contract: With new defaults, no tenant or soft-delete filters
      expect(code).not.toContain('tenantId');
      expect(code).not.toContain('deletedAt');

      // Contract: Must return 404 when not found
      expect(code).toContain('not found');
      expect(code).toContain('404');

      // Contract: Must have proper error handling
      expect(code).toContain('try {');
      expect(code).toContain('} catch (error)');
      expect(code).toContain('manifestErrorResponse');

      // Contract: Must have auth check
      expect(code).toContain('Unauthorized');

      // Contract: Must use Next.js App Router params pattern
      expect(code).toContain('params: Promise<{ id: string }>');

      expect(detailResult.diagnostics).toHaveLength(0);
    });

    it('artifact has correct id and pathHint with [id] dynamic segment', async () => {
      const source = `
        entity Recipe {
          property id: string
        }
      `;

      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const detailResult = projection.generate(result.ir!, { surface: 'nextjs.detail', entity: 'Recipe' });

      expect(detailResult.artifacts[0].id).toBe('nextjs.detail:Recipe');
      expect(detailResult.artifacts[0].pathHint).toContain('recipe/[id]/route.ts');
    });

    it('returns error diagnostic if entity not found in IR', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);

      expectNoCompileErrors(result);

      const detailResult = projection.generate(result.ir!, { surface: 'nextjs.detail', entity: 'NonExistent' });

      expect(detailResult.artifacts).toHaveLength(0);
      expect(detailResult.diagnostics).toHaveLength(1);
      expect(detailResult.diagnostics[0].severity).toBe('error');
      expect(detailResult.diagnostics[0].message).toContain('Entity "NonExistent" not found');
      expect(detailResult.diagnostics[0].entity).toBe('NonExistent');
    });

    it('returns error diagnostic if entity not provided', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);

      const detailResult = projection.generate(result.ir!, { surface: 'nextjs.detail' });

      expect(detailResult.artifacts).toHaveLength(0);
      expect(detailResult.diagnostics).toHaveLength(1);
      expect(detailResult.diagnostics[0].severity).toBe('error');
      expect(detailResult.diagnostics[0].message).toContain('requires entity');
    });

    it('respects includeTenantFilter option', async () => {
      const source = `
        entity Recipe {
          property id: string
          property name: string
        }
      `;

      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const noFilterResult = projection.generate(result.ir!, {
        surface: 'nextjs.detail',
        entity: 'Recipe',
        options: { includeTenantFilter: false },
      });

      const noFilterCode = firstCode(noFilterResult);
      expect(noFilterCode).not.toContain('tenantId');

      const withFilterResult = projection.generate(result.ir!, {
        surface: 'nextjs.detail',
        entity: 'Recipe',
        options: { includeTenantFilter: true },
      });

      const withFilterCode = firstCode(withFilterResult);
      expect(withFilterCode).toContain('tenantId');
      expect(withFilterCode).toContain('getTenantIdForOrg');
    });

    it('respects includeSoftDeleteFilter option', async () => {
      const source = `
        entity Recipe {
          property id: string
          property name: string
          property deletedAt: datetime?
        }
      `;

      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const noSoftDeleteResult = projection.generate(result.ir!, {
        surface: 'nextjs.detail',
        entity: 'Recipe',
        options: { includeSoftDeleteFilter: false },
      });

      expect(firstCode(noSoftDeleteResult)).not.toContain('deletedAt');

      const withSoftDeleteResult = projection.generate(result.ir!, {
        surface: 'nextjs.detail',
        entity: 'Recipe',
        options: { includeSoftDeleteFilter: true },
      });

      expect(firstCode(withSoftDeleteResult)).toContain('deletedAt');
    });

    it('supports different auth providers', async () => {
      const source = `
        entity Recipe {
          property id: string
        }
      `;

      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const clerkResult = projection.generate(result.ir!, {
        surface: 'nextjs.detail',
        entity: 'Recipe',
        options: { authProvider: 'clerk', authImportPath: '@repo/auth/server' },
      });
      expect(firstCode(clerkResult)).toContain('from "@repo/auth/server"');
      expect(firstCode(clerkResult)).toContain('const { orgId, userId } = await auth()');

      const nextAuthResult = projection.generate(result.ir!, {
        surface: 'nextjs.detail',
        entity: 'Recipe',
        options: { authProvider: 'nextauth' },
      });
      expect(firstCode(nextAuthResult)).toContain('getServerSession');

      const noAuthResult = projection.generate(result.ir!, {
        surface: 'nextjs.detail',
        entity: 'Recipe',
        options: { authProvider: 'none' },
      });
      expect(firstCode(noAuthResult)).toContain('Auth disabled');
      expect(firstCode(noAuthResult)).toContain('const userId = "anonymous"');
    });

    it('respects custom import paths', async () => {
      const source = `
        entity Recipe {
          property id: string
        }
      `;

      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const customPathsResult = projection.generate(result.ir!, {
        surface: 'nextjs.detail',
        entity: 'Recipe',
        options: {
          databaseImportPath: '@myapp/db',
          authImportPath: '@myapp/auth',
          responseImportPath: '@myapp/responses',
        },
      });

      const code = firstCode(customPathsResult);
      expect(code).toContain('from "@myapp/db"');
      // Test auth import only if auth is enabled
      if (code.includes('Auth disabled')) {
        expect(code).not.toContain('from "@myapp/auth"');
      } else {
        expect(code).toContain('from "@myapp/auth"');
      }
      expect(code).toContain('from "@myapp/responses"');
    });

    it('respects custom tenant and soft delete property names', async () => {
      const source = `
        entity Recipe {
          property id: string
          property removedAt: datetime?
        }
      `;

      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const customPropsResult = projection.generate(result.ir!, {
        surface: 'nextjs.detail',
        entity: 'Recipe',
        options: {
          includeTenantFilter: true,
          includeSoftDeleteFilter: true,
          tenantIdProperty: 'orgId',
          deletedAtProperty: 'removedAt',
        },
      });

      const code = firstCode(customPropsResult);
      expect(code).toContain('orgId');
      expect(code).toContain('removedAt: null');
      expect(code).not.toContain('tenantId');
      expect(code).not.toContain('deletedAt');
    });
  });

  // Regression: the read-query builders must be field-aware. They previously
  // emitted `deletedAt: null` and `orderBy: { createdAt }` for EVERY entity,
  // regardless of whether the entity declared those columns. Prisma rejects
  // such queries at runtime ("Unknown argument deletedAt"). See generator.ts
  // generatePrismaQuery / _generateDetailRoute.
  describe('field-aware read queries (deletedAt / createdAt)', () => {
    it('list route omits soft-delete filter when entity has no deletedAt column', async () => {
      const source = `
        entity BankAccount {
          property id: string
          property balance: number
          property createdAt: datetime
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const code = firstCode(
        projection.generate(result.ir!, { surface: 'nextjs.route', entity: 'BankAccount', options: { includeSoftDeleteFilter: false } })
      );

      // No deletedAt column → must NOT emit the soft-delete filter, even when
      // includeSoftDeleteFilter is explicitly false.
      expect(code).not.toContain('deletedAt');
      // createdAt column present → orderBy uses it.
      expect(code).toContain('createdAt: "desc"');
    });

    it('list route falls back to orderBy id when entity has no createdAt column', async () => {
      const source = `
        entity Menu {
          property id: string
          property label: string
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const code = firstCode(
        projection.generate(result.ir!, { surface: 'nextjs.route', entity: 'Menu' })
      );

      // No createdAt column → orderBy must reference the always-present id,
      // never a non-existent createdAt.
      expect(code).toContain('id: "desc"');
      expect(code).not.toContain('createdAt');
      expect(code).not.toContain('deletedAt');
    });

    it('detail route omits soft-delete filter when entity has no deletedAt column', async () => {
      const source = `
        entity Invoice {
          property id: string
          property total: number
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const code = firstCode(
        projection.generate(result.ir!, { surface: 'nextjs.detail', entity: 'Invoice', options: { includeSoftDeleteFilter: false, includeTenantFilter: false } })
      );

      expect(code).not.toContain('deletedAt');
      // No tenant filter → id is single field → findUnique should be used.
      expect(code).toContain('database.invoice.findUnique');
    });
  });

  describe('ts.types surface', () => {
    it('generates TypeScript types from IR entities', async () => {
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

      const typesResult = projection.generate(result.ir!, { surface: 'ts.types' });

      const code = firstCode(typesResult);
      expect(code).toContain('export interface Recipe');
      expect(code).toContain('id: string;');
      expect(code).toContain('name: string;');
      expect(code).toContain('category?: string | null;');
      expect(code).toContain('rating?: number;');
    });

    it('maps money/decimal to number and emits enum declarations', async () => {
      const source = `
        enum Status {
          active
          inactive
        }

        entity Product {
          property required price: money
          property required amount: decimal
          property required status: Status
        }
      `;

      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const code = firstCode(projection.generate(result.ir!, { surface: 'ts.types' }));

      // money/decimal → number (no raw, non-compiling tokens)
      expect(code).toContain('price: number;');
      expect(code).toContain('amount: number;');
      expect(code).not.toContain('price: money;');
      expect(code).not.toContain('amount: decimal;');

      // enum declared as a string-literal union and referenced by the property
      expect(code).toContain('export type Status = "active" | "inactive";');
      expect(code).toContain('status: Status;');
    });

    it('maps float/bigint/array; honors dateSerialization', async () => {
      const source = `
        entity Sensor {
          property required id: string
          property reading: float
          property big: bigint
          property labels: string[]
          property occurredAt: datetime
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const dflt = firstCode(projection.generate(result.ir!, { surface: 'ts.types' }));
      expect(dflt).toContain('reading: number;');
      expect(dflt).toContain('big: number;');
      expect(dflt).toContain('labels: string[];');
      expect(dflt).toContain('occurredAt: Date;');
      expect(dflt).not.toContain(': float');
      expect(dflt).not.toContain(': array');

      const iso = firstCode(
        projection.generate(result.ir!, { surface: 'ts.types', options: { dateSerialization: 'iso-string' } }),
      );
      expect(iso).toContain('occurredAt: string;');
      expect(iso).not.toContain(': Date;');
    });
  });

  describe('ts.client surface', () => {
    it('generates client SDK functions for list and detail', async () => {
      const source = `
        entity Recipe {
          property id: string
        }
      `;

      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const clientResult = projection.generate(result.ir!, { surface: 'ts.client' });

      const code = firstCode(clientResult);

      // List function — reads via apiFetch at the contract-derived URL and
      // extracts the shared list-envelope key.
      expect(code).toContain('export async function getRecipes()');
      expect(code).toContain('apiFetch<{ recipes: Recipe[] }>(`/api/recipe/list`)');
      expect(code).toContain('return data.recipes;');

      // Detail function
      expect(code).toContain('export async function getRecipe(id: string): Promise<Recipe>');
      expect(code).toContain('`/api/recipe/${encodeURIComponent(id)}`');
      expect(code).toContain('return data.recipe;');
    });
  });

  describe('nextjs.command surface', () => {
    const commandSource = `
      entity Recipe {
        property id: string
        property name: string

        command create(name: string) {
          guard name != ""
          mutate name = name
        }
      }
    `;

    it('generates POST handler that calls runtime.runCommand (not database)', async () => {
      const result = await compileToIR(commandSource);
      expectNoCompileErrors(result);

      const commandResult = projection.generate(result.ir!, {
        surface: 'nextjs.command',
        entity: 'Recipe',
        command: 'create',
        options: { concreteCommandRoutes: { enabled: true } },
      });

      const code = firstCode(commandResult);

      // Contract: Must call runtime.runCommand for the mutation, not direct DB writes
      expect(code).toContain('runtime.runCommand');
      expect(code).not.toContain('database.recipe');
      expect(code).not.toContain('findMany');
      expect(code).not.toContain('create(');
      expect(code).not.toContain('update(');

      // Contract: Must pass command name and entityName
      expect(code).toContain('"create"');
      expect(code).toContain('entityName: "Recipe"');

      // Contract: Must use createManifestRuntime with user context (including tenantId by default)
      expect(code).toContain('createManifestRuntime');
      expect(code).toContain('user: { id: userId');

      // Contract: Must use normalizeCommandResult for error handling
      expect(code).toContain('normalizeCommandResult');
      expect(code).toContain('normalized.success');

      // Contract: Must handle different diagnostic kinds with appropriate status codes
      expect(code).toContain('guard_failure');
      expect(code).toContain('policy_denial');
      expect(code).toContain('422');
      expect(code).toContain('403');

      // Contract: Must have auth check
      expect(code).toContain('Unauthorized');

      // Contract: Must be a POST handler
      expect(code).toContain('export async function POST');

      expect(commandResult.diagnostics).toHaveLength(0);
    });

    it('includes tenant lookup and passes tenantId to runtime context (explicit)', async () => {
      const result = await compileToIR(commandSource);
      expect(result.ir).not.toBeNull();

      const commandResult = projection.generate(result.ir!, {
        surface: 'nextjs.command',
        entity: 'Recipe',
        command: 'create',
        options: { includeTenantFilter: true, concreteCommandRoutes: { enabled: true } },
      });

      const code = firstCode(commandResult);

      // Tenant lookup must be present
      expect(code).toContain('getTenantIdForOrg');
      expect(code).toContain('tenantId');
      // Tenant must be passed into runtime context, not just body
      expect(code).toContain('tenantId: tenantId');
      // Tenant resolver import should be used for tenant lookup
      expect(code).toContain('from "@/app/lib/tenant"');
    });

    it('omits tenant lookup when includeTenantFilter is false', async () => {
      const result = await compileToIR(commandSource);
      expect(result.ir).not.toBeNull();

      const commandResult = projection.generate(result.ir!, {
        surface: 'nextjs.command',
        entity: 'Recipe',
        command: 'create',
        options: { includeTenantFilter: false,  concreteCommandRoutes: { enabled: true } },
      });

      const code = firstCode(commandResult);
      expect(code).not.toContain('getTenantIdForOrg');
      // When includeTenantFilter is false, tenantId is still included but with a placeholder
      expect(code).toContain('tenantId: "__no_tenant__"');
    });

    it('returns error diagnostic if entity not found', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);

      const commandResult = projection.generate(result.ir!, {
        surface: 'nextjs.command',
        entity: 'NonExistent',
        command: 'create',
        options: { concreteCommandRoutes: { enabled: true } },
      });

      expect(commandResult.artifacts).toHaveLength(0);
      expect(commandResult.diagnostics).toHaveLength(1);
      expect(commandResult.diagnostics[0].severity).toBe('error');
      expect(commandResult.diagnostics[0].code).toBe('ENTITY_NOT_FOUND');
      expect(commandResult.diagnostics[0].message).toContain('Entity "NonExistent" not found');
    });

    it('returns error diagnostic if command not found', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);

      const commandResult = projection.generate(result.ir!, {
        surface: 'nextjs.command',
        entity: 'Recipe',
        command: 'nonExistentCommand',
        options: { concreteCommandRoutes: { enabled: true } },
      });

      expect(commandResult.artifacts).toHaveLength(0);
      expect(commandResult.diagnostics).toHaveLength(1);
      expect(commandResult.diagnostics[0].severity).toBe('error');
      expect(commandResult.diagnostics[0].code).toBe('COMMAND_NOT_FOUND');
      expect(commandResult.diagnostics[0].message).toContain('Command "nonExistentCommand" not found');
    });

    it('returns error diagnostic if entity not provided', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);

      const commandResult = projection.generate(result.ir!, {
        surface: 'nextjs.command',
        command: 'create',
        options: { concreteCommandRoutes: { enabled: true } },
      });

      expect(commandResult.artifacts).toHaveLength(0);
      expect(commandResult.diagnostics[0].code).toBe('MISSING_ENTITY');
      expect(commandResult.diagnostics[0].message).toContain('requires entity');
    });

    it('returns error diagnostic if command not provided', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);

      const commandResult = projection.generate(result.ir!, {
        surface: 'nextjs.command',
        entity: 'Recipe',
        options: { concreteCommandRoutes: { enabled: true } },
      });

      expect(commandResult.artifacts).toHaveLength(0);
      expect(commandResult.diagnostics[0].code).toBe('MISSING_COMMAND');
      expect(commandResult.diagnostics[0].message).toContain('requires command');
    });

    it('uses custom runtimeImportPath', async () => {
      const result = await compileToIR(commandSource);
      expect(result.ir).not.toBeNull();

      const commandResult = projection.generate(result.ir!, {
        surface: 'nextjs.command',
        entity: 'Recipe',
        command: 'create',
        options: { runtimeImportPath: '@myapp/runtime',  concreteCommandRoutes: { enabled: true } },
      });

      expect(firstCode(commandResult)).toContain('from "@myapp/runtime"');
    });

    it('supports different auth providers', async () => {
      const result = await compileToIR(commandSource);
      expect(result.ir).not.toBeNull();

      const clerkResult = projection.generate(result.ir!, {
        surface: 'nextjs.command',
        entity: 'Recipe',
        command: 'create',
        options: { authProvider: 'clerk', authImportPath: '@repo/auth/server', concreteCommandRoutes: { enabled: true } },
      });
      expect(firstCode(clerkResult)).toContain('from "@repo/auth/server"');

      const noAuthResult = projection.generate(result.ir!, {
        surface: 'nextjs.command',
        entity: 'Recipe',
        command: 'create',
        options: { authProvider: 'none',  concreteCommandRoutes: { enabled: true } },
      });
      expect(firstCode(noAuthResult)).toContain('Auth disabled');
    });

    it('artifact has correct id and pathHint', async () => {
      const result = await compileToIR(commandSource);
      expect(result.ir).not.toBeNull();

      const commandResult = projection.generate(result.ir!, {
        surface: 'nextjs.command',
        entity: 'Recipe',
        command: 'create',
        options: { concreteCommandRoutes: { enabled: true } },
      });

      expect(commandResult.artifacts[0].id).toBe('nextjs.command:Recipe.create');
      expect(commandResult.artifacts[0].pathHint).toContain('recipe/create/route.ts');
    });

    it('uses normalizeCommandResult for structured diagnostics', async () => {
      const result = await compileToIR(commandSource);
      expect(result.ir).not.toBeNull();

      const commandResult = projection.generate(result.ir!, {
        surface: 'nextjs.command',
        entity: 'Recipe',
        command: 'create',
        options: { concreteCommandRoutes: { enabled: true } },
      });

      const code = firstCode(commandResult);

      // Contract: Must import normalizeCommandResult
      expect(code).toContain('normalizeCommandResult');

      // Contract: Must call normalizeCommandResult with entity and command names
      expect(code).toContain('normalizeCommandResult("Recipe", "create", result)');

      // Contract: Must use normalized.success instead of result.success
      expect(code).toContain('if (!normalized.success)');

      // Contract: Must return structured diagnostics in error responses
      expect(code).toContain('diagnostics: normalized.diagnostics');

      // Contract: Must NOT manually format guard failures
      expect(code).not.toContain('Guard ${result.guardFailure.index} failed');
    });
  });

  describe('realtime SSE surfaces', () => {
    const realtimeSource = `
      entity Order {
        property id: string
        property status: string = "draft"
        realtime

        command submit() {
          mutate status = "submitted"
          emit OrderSubmitted
        }
      }

      entity Plain {
        property id: string
      }

      store Order in memory
      store Plain in memory

      event OrderSubmitted: "order.submitted" {
        id: string
      }
    `;

    async function realtimeIR() {
      const result = await compileToIR(realtimeSource);
      expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
      expect(result.ir).not.toBeNull();
      return result.ir!;
    }

    it('nextjs.subscribe emits an SSE route for a realtime entity', async () => {
      const ir = await realtimeIR();
      const result = projection.generate(ir, { surface: 'nextjs.subscribe', entity: 'Order' });

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].id).toBe('nextjs.subscribe:Order');
      expect(result.artifacts[0].pathHint).toContain('order/subscribe/route.ts');

      const code = result.artifacts[0].code;
      // SSE transport contract
      expect(code).toContain('text/event-stream');
      expect(code).toContain('ReadableStream');
      expect(code).toContain('no-cache, no-transform');
      // Shared engine wiring: SSE must use the module-scoped singleton
      expect(code).toContain('getSharedRuntime');
      expect(code).toContain('runtime.subscribe("Order"');
      // Cleanup: unsubscribe on client disconnect
      expect(code).toContain('unsubscribe()');
      expect(code).toContain('request.signal.addEventListener');
      // Auth check (default provider) still applies
      expect(code).toContain('Unauthorized');
    });

    it('nextjs.subscribe emits nothing for a non-realtime entity', async () => {
      const ir = await realtimeIR();
      const result = projection.generate(ir, { surface: 'nextjs.subscribe', entity: 'Plain' });

      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].severity).toBe('info');
      expect(result.diagnostics[0].code).toBe('REALTIME_NOT_ENABLED');
    });

    it('nextjs.subscribe errors without an entity', async () => {
      const ir = await realtimeIR();
      const result = projection.generate(ir, { surface: 'nextjs.subscribe' });
      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics[0].code).toBe('MISSING_ENTITY');
    });

    it('nextjs.subscriptionHook emits a typed EventSource hook with backoff', async () => {
      const ir = await realtimeIR();
      const result = projection.generate(ir, { surface: 'nextjs.subscriptionHook', entity: 'Order' });

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].id).toBe('nextjs.subscriptionHook:Order');
      expect(result.artifacts[0].pathHint).toBe('src/hooks/useOrderSubscription.ts');

      const code = result.artifacts[0].code;
      expect(code).toContain('"use client"');
      expect(code).toContain('export function useOrderSubscription');
      expect(code).toContain('new EventSource');
      expect(code).toContain('/api/order/subscribe');
      // Typed event payloads
      expect(code).toContain('OrderSubscriptionEvent');
      // Reconnect with exponential backoff
      expect(code).toContain('initialRetryDelayMs');
      expect(code).toContain('maxRetryDelayMs');
      expect(code).toContain('Math.min(retryDelay * 2, maxRetryDelayMs)');
    });

    it('nextjs.subscriptionHook emits nothing for a non-realtime entity', async () => {
      const ir = await realtimeIR();
      const result = projection.generate(ir, { surface: 'nextjs.subscriptionHook', entity: 'Plain' });
      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics[0].code).toBe('REALTIME_NOT_ENABLED');
    });

    it('nextjs.sharedRuntime emits the module-scoped singleton accessor when any entity is realtime', async () => {
      const ir = await realtimeIR();
      const result = projection.generate(ir, { surface: 'nextjs.sharedRuntime' });

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].id).toBe('nextjs.sharedRuntime');
      expect(result.artifacts[0].pathHint).toBe('src/lib/manifest-shared-runtime.ts');

      const code = result.artifacts[0].code;
      expect(code).toContain('export function getSharedRuntime');
      expect(code).toContain('createManifestRuntime');
      // Module-scoped memoization (singleton)
      expect(code).toContain('let sharedRuntimePromise');
      // Documented single-instance constraint
      expect(code).toContain('single-instance');
    });

    it('nextjs.sharedRuntime emits nothing when no entity is realtime', async () => {
      const result = await compileToIR(`
        entity Plain {
          property id: string
        }
      `);
      const sharedResult = projection.generate(result.ir!, { surface: 'nextjs.sharedRuntime' });
      expect(sharedResult.artifacts).toHaveLength(0);
      expect(sharedResult.diagnostics).toHaveLength(1);
      expect(sharedResult.diagnostics[0].severity).toBe('info');
      expect(sharedResult.diagnostics[0].code).toBe('REALTIME_NOT_ENABLED');
    });

    it('dispatcher uses the shared runtime when realtime entities exist (inline mode)', async () => {
      const ir = await realtimeIR();
      const result = projection.generate(ir, { surface: 'nextjs.dispatcher' });

      const code = firstCode(result);
      expect(code).toContain('getSharedRuntime');
      expect(code).toContain('await getSharedRuntime()');
      expect(code).toContain('runtime.replaceContext(');
      expect(code).not.toContain('createManifestRuntime(');
    });

    it('dispatcher is unchanged when no entity is realtime', async () => {
      const result = await compileToIR(`
        entity Plain {
          property id: string
        }
      `);
      const dispatcherResult = projection.generate(result.ir!, { surface: 'nextjs.dispatcher' });

      const code = firstCode(dispatcherResult);
      expect(code).toContain('createManifestRuntime(');
      expect(code).not.toContain('getSharedRuntime');
    });

    it('concrete command route uses the shared runtime when realtime entities exist (inline mode)', async () => {
      const ir = await realtimeIR();
      const result = projection.generate(ir, {
        surface: 'nextjs.command',
        entity: 'Order',
        command: 'submit',
        options: { concreteCommandRoutes: { enabled: true } },
      });

      const code = firstCode(result);
      expect(code).toContain('await getSharedRuntime()');
      expect(code).toContain('runtime.replaceContext(');
      expect(code).not.toContain('createManifestRuntime(');
    });

    it('externalExecutor mode is unaffected by realtime entities', async () => {
      const ir = await realtimeIR();
      const result = projection.generate(ir, {
        surface: 'nextjs.dispatcher',
        options: { dispatcher: { executionMode: 'externalExecutor' } },
      });

      const code = firstCode(result);
      expect(code).toContain('executeManifestCommand');
      expect(code).not.toContain('getSharedRuntime');
    });
  });

  describe('naming and route overrides', () => {
    const orderLineSource = `
      entity OrderLine {
        property id: string
        property quantity: number
        property createdAt: datetime
      }
    `;

    it('accessorNames override changes database delegate but keeps camelCase response keys', async () => {
      const result = await compileToIR(orderLineSource);
      expect(result.ir).not.toBeNull();

      const routeResult = projection.generate(result.ir!, {
        surface: 'nextjs.route',
        entity: 'OrderLine',
        options: { accessorNames: { OrderLine: 'order_lines' } },
      });
      const routeCode = firstCode(routeResult);
      expect(routeCode).toContain('database.order_lines.findMany');
      expect(routeCode).not.toContain('database.orderLine.findMany');
      expect(routeCode).toContain('manifestSuccessResponse({ orderLines })');

      const detailResult = projection.generate(result.ir!, {
        surface: 'nextjs.detail',
        entity: 'OrderLine',
        options: { accessorNames: { OrderLine: 'order_lines' } },
      });
      const detailCode = firstCode(detailResult);
      expect(detailCode).toContain('database.order_lines.findUnique');
      expect(detailCode).toContain('manifestSuccessResponse({ orderLine })');
    });

    it('routeSegments override changes pathHints and client fetch paths consistently', async () => {
      const result = await compileToIR(orderLineSource);
      expect(result.ir).not.toBeNull();

      const options = { routeSegments: { OrderLine: 'order-lines' } };

      const routeResult = projection.generate(result.ir!, {
        surface: 'nextjs.route',
        entity: 'OrderLine',
        options,
      });
      expect(routeResult.artifacts[0].pathHint).toContain('order-lines/list/route.ts');

      const detailResult = projection.generate(result.ir!, {
        surface: 'nextjs.detail',
        entity: 'OrderLine',
        options,
      });
      expect(detailResult.artifacts[0].pathHint).toContain('order-lines/[id]/route.ts');

      const clientResult = projection.generate(result.ir!, {
        surface: 'ts.client',
        options,
      });
      const clientCode = firstCode(clientResult);
      expect(clientCode).toContain('`/api/order-lines/list`');
      expect(clientCode).toContain('`/api/order-lines/${encodeURIComponent(id)}`');
      expect(clientCode).toContain('return data.orderLines;');
      expect(clientCode).toContain('return data.orderLine;');
    });

    it("naming: 'snake_case' maps database accessor via resolveTableName", async () => {
      const result = await compileToIR(orderLineSource);
      expect(result.ir).not.toBeNull();

      const routeResult = projection.generate(result.ir!, {
        surface: 'nextjs.route',
        entity: 'OrderLine',
        options: { naming: 'snake_case' },
      });
      const code = firstCode(routeResult);
      expect(code).toContain('database.order_lines.findMany');
      expect(code).toContain('manifestSuccessResponse({ orderLines })');
    });

    it('explicit accessorNames takes precedence over naming convention', async () => {
      const result = await compileToIR(orderLineSource);
      expect(result.ir).not.toBeNull();

      const routeResult = projection.generate(result.ir!, {
        surface: 'nextjs.route',
        entity: 'OrderLine',
        options: {
          naming: 'snake_case',
          accessorNames: { OrderLine: 'custom_accessor' },
        },
      });
      const code = firstCode(routeResult);
      expect(code).toContain('database.custom_accessor.findMany');
      expect(code).not.toContain('database.order_lines.findMany');
    });

    it('defaults unchanged when no naming or override options are set', async () => {
      const source = `
        entity Recipe {
          property id: string
          property createdAt: datetime
        }
      `;
      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const routeResult = projection.generate(result.ir!, {
        surface: 'nextjs.route',
        entity: 'Recipe',
      });
      const code = firstCode(routeResult);
      expect(code).toContain('database.recipe.findMany');
      expect(routeResult.artifacts[0].pathHint).toContain('recipe/list/route.ts');
    });
  });

  describe('projection metadata', () => {
    it('has correct name, description, and surfaces', () => {
      expect(projection.name).toBe('nextjs');
      expect(projection.description).toContain('Next.js App Router');
      expect(projection.surfaces).toContain('nextjs.route');
      expect(projection.surfaces).toContain('nextjs.detail');
      expect(projection.surfaces).toContain('nextjs.command');
      expect(projection.surfaces).toContain('nextjs.subscribe');
      expect(projection.surfaces).toContain('nextjs.subscriptionHook');
      expect(projection.surfaces).toContain('nextjs.sharedRuntime');
      expect(projection.surfaces).toContain('ts.types');
      expect(projection.surfaces).toContain('ts.client');
    });
  });
});
