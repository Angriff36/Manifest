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
        }
      `;

      const result = await compileToIR(source);
      expect(result.diagnostics).toHaveLength(0);
      expect(result.ir).not.toBeNull();

      const routeResult = projection.generate(result.ir!, { surface: 'nextjs.route', entity: 'Recipe' });

      const code = firstCode(routeResult);

      // Contract: Must use Prisma directly for reads
      expect(code).toContain('database.recipe.findMany');
      expect(code).not.toContain('runtime.query');
      expect(code).not.toContain('runtime.get');

      // Contract: Must filter by tenant (when enabled by default)
      expect(code).toContain('tenantId');
      expect(code).toContain('deletedAt: null');

      // Contract: Must have proper error handling
      expect(code).toContain('try {');
      expect(code).toContain('} catch (error)');
      expect(code).toContain('manifestErrorResponse');

      // Contract: Must have auth check
      expect(code).toContain('Unauthorized');

      expect(routeResult.diagnostics).toHaveLength(0);
    });

    it('returns error diagnostic if entity not found in IR', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);

      expect(result.diagnostics).toHaveLength(0);

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
      expect(noFilterCode).not.toContain('userTenantMapping');

      const withFilterResult = projection.generate(result.ir!, {
        surface: 'nextjs.route',
        entity: 'Recipe',
      });

      const withFilterCode = firstCode(withFilterResult);
      expect(withFilterCode).toContain('tenantId');
      expect(withFilterCode).toContain('userTenantMapping');
    });

    it('respects includeSoftDeleteFilter option', async () => {
      const source = `
        entity Recipe {
          property id: string
          property name: string
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
        options: { authProvider: 'clerk' },
      });
      expect(firstCode(clerkResult)).toContain('@clerk/nextjs');
      expect(firstCode(clerkResult)).toContain('const { userId } = await auth()');

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
      expect(code).toContain('from "@myapp/auth"');
      expect(code).toContain('from "@myapp/responses"');
    });

    it('respects custom tenant and soft delete property names', async () => {
      const source = `
        entity Recipe {
          property id: string
        }
      `;

      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const customPropsResult = projection.generate(result.ir!, {
        surface: 'nextjs.route',
        entity: 'Recipe',
        options: {
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
  });

  describe('ts.client surface', () => {
    it('generates client SDK functions', async () => {
      const source = `
        entity Recipe {
          property id: string
        }
      `;

      const result = await compileToIR(source);
      expect(result.ir).not.toBeNull();

      const clientResult = projection.generate(result.ir!, { surface: 'ts.client' });

      const code = firstCode(clientResult);
      expect(code).toContain('export async function getRecipes()');
      expect(code).toContain('fetch(`/api/recipe`)');
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
      expect(result.diagnostics).toHaveLength(0);
      expect(result.ir).not.toBeNull();

      const commandResult = projection.generate(result.ir!, {
        surface: 'nextjs.command',
        entity: 'Recipe',
        command: 'create',
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

      // Contract: Must handle guard failure with 422
      expect(code).toContain('guardFailure');
      expect(code).toContain('422');

      // Contract: Must handle policy denial with 403
      expect(code).toContain('policyDenial');
      expect(code).toContain('403');

      // Contract: Must have auth check
      expect(code).toContain('Unauthorized');

      // Contract: Must be a POST handler
      expect(code).toContain('export async function POST');

      expect(commandResult.diagnostics).toHaveLength(0);
    });

    it('includes tenant lookup and passes tenantId to runtime context (default)', async () => {
      const result = await compileToIR(commandSource);
      expect(result.ir).not.toBeNull();

      const commandResult = projection.generate(result.ir!, {
        surface: 'nextjs.command',
        entity: 'Recipe',
        command: 'create',
      });

      const code = firstCode(commandResult);

      // Tenant lookup must be present
      expect(code).toContain('userTenantMapping');
      expect(code).toContain('tenantId');
      // Tenant must be passed into runtime context, not just body
      expect(code).toContain('tenantId: tenantId');
      // Database must be imported for tenant lookup
      expect(code).toContain('from "@/lib/database"');
    });

    it('omits tenant lookup when includeTenantFilter is false', async () => {
      const result = await compileToIR(commandSource);
      expect(result.ir).not.toBeNull();

      const commandResult = projection.generate(result.ir!, {
        surface: 'nextjs.command',
        entity: 'Recipe',
        command: 'create',
        options: { includeTenantFilter: false },
      });

      const code = firstCode(commandResult);
      expect(code).not.toContain('userTenantMapping');
      expect(code).not.toContain('tenantId');
    });

    it('returns error diagnostic if entity not found', async () => {
      const source = `entity Recipe { property id: string }`;
      const result = await compileToIR(source);

      const commandResult = projection.generate(result.ir!, {
        surface: 'nextjs.command',
        entity: 'NonExistent',
        command: 'create',
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
        options: { runtimeImportPath: '@myapp/runtime' },
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
        options: { authProvider: 'clerk' },
      });
      expect(firstCode(clerkResult)).toContain('@clerk/nextjs');

      const noAuthResult = projection.generate(result.ir!, {
        surface: 'nextjs.command',
        entity: 'Recipe',
        command: 'create',
        options: { authProvider: 'none' },
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
      });

      expect(commandResult.artifacts[0].id).toBe('nextjs.command:Recipe.create');
      expect(commandResult.artifacts[0].pathHint).toContain('recipe/commands/create/route.ts');
    });
  });

  describe('projection metadata', () => {
    it('has correct name, description, and surfaces', () => {
      expect(projection.name).toBe('nextjs');
      expect(projection.description).toContain('Next.js App Router');
      expect(projection.surfaces).toContain('nextjs.route');
      expect(projection.surfaces).toContain('nextjs.command');
      expect(projection.surfaces).toContain('ts.types');
      expect(projection.surfaces).toContain('ts.client');
    });
  });
});
