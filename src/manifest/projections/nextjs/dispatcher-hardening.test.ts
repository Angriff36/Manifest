/**
 * Tests pinning the v0.7-hardening goals on the nextjs.dispatcher and
 * read-route generators. These complement dispatcher-modes.test.ts; this
 * file specifically verifies:
 *
 *   - Goal step 3: default --surface all path does NOT emit concrete
 *     per-command routes; explicit opt-in does.
 *   - Goal step 4: dispatcher extracts instanceId from request body for
 *     non-create commands and passes it through (inline + executor modes).
 *   - Goal step 4: auth-thrown errors map to unauthorizedStatus, not 500.
 *   - Goal step 4: runtime catch-all returns the stable Manifest error
 *     shape, not a bare string.
 *   - Goal step 5: detail routes use Prisma findFirst (not findUnique)
 *     when the where clause has more than `id` (Prisma 7 compatibility).
 */
import { describe, it, expect } from 'vitest';
import { compileToIR } from '../../ir-compiler';
import { NextJsProjection } from './generator';

describe('default --surface all: dispatcher emitted, concrete commands suppressed', () => {
  const target = new NextJsProjection();

  async function sample() {
    const src = `
      entity Recipe {
        property tenantId: string
        property title: string

        command create() {
          emit RecipeCreated
        }

        command release() {
          emit RecipeReleased
        }
      }

      event RecipeCreated: "recipe.created" { recipeId: string }
      event RecipeReleased: "recipe.released" { recipeId: string }
    `;
    const result = await compileToIR(src);
    expect(result.ir).not.toBeNull();
    return result.ir!;
  }

  it('nextjs.dispatcher is emitted by default', async () => {
    const ir = await sample();
    const result = target.generate(ir, { surface: 'nextjs.dispatcher' });
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].id).toBe('nextjs.dispatcher');
  });

  it('nextjs.command with no options is suppressed (info diagnostic) — opt-in required', async () => {
    const ir = await sample();
    for (const cmd of ['create', 'release']) {
      const result = target.generate(ir, {
        surface: 'nextjs.command',
        entity: 'Recipe',
        command: cmd,
      });
      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ code: 'CONCRETE_COMMAND_ROUTES_DISABLED', severity: 'info' })
      );
    }
  });

  it('nextjs.command with concreteCommandRoutes.enabled:true emits the artifact', async () => {
    const ir = await sample();
    const result = target.generate(ir, {
      surface: 'nextjs.command',
      entity: 'Recipe',
      command: 'create',
      options: { concreteCommandRoutes: { enabled: true } },
    });
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].id).toBe('nextjs.command:Recipe.create');
  });
});

describe('dispatcher instanceId extraction (goal step 4)', () => {
  const target = new NextJsProjection();

  async function sample() {
    const src = `
      entity Recipe {
        property title: string
        command release() { emit RecipeReleased }
      }
      event RecipeReleased: "recipe.released" { recipeId: string }
    `;
    const result = await compileToIR(src);
    return result.ir!;
  }

  it('inline dispatcher extracts instanceId from body and passes it to runCommand', async () => {
    const ir = await sample();
    const code = target.generate(ir, { surface: 'nextjs.dispatcher' }).artifacts[0].code;

    // Universal extraction block must be present (deriveInstanceId default = true)
    expect(code).toMatch(/const\s+instanceId\s*=/);
    expect(code).toContain('body?.instanceId');
    expect(code).toContain('body?.id');

    // Inline mode must forward instanceId through the runCommand options bag
    expect(code).toMatch(/runtime\.runCommand\(command, body, \{[\s\S]*entityName: entity,[\s\S]*instanceId,/);
  });

  it('externalExecutor dispatcher extracts instanceId and passes it to the executor call', async () => {
    const ir = await sample();
    const code = target.generate(ir, {
      surface: 'nextjs.dispatcher',
      options: { dispatcher: { executionMode: 'externalExecutor' } },
    }).artifacts[0].code;

    expect(code).toMatch(/const\s+instanceId\s*=/);
    // Executor call must include instanceId in the call object
    expect(code).toMatch(/await\s+executeManifestCommand\(\{[\s\S]*instanceId,/);
  });

  it('opting out (deriveInstanceId:false) suppresses extraction and pass-through', async () => {
    const ir = await sample();
    const code = target.generate(ir, {
      surface: 'nextjs.dispatcher',
      options: { dispatcher: { deriveInstanceId: false } },
    }).artifacts[0].code;

    expect(code).not.toMatch(/const\s+instanceId\s*=/);
    // runCommand third-arg must NOT include instanceId field
    expect(code).not.toMatch(/instanceId,/);
  });
});

describe('auth failures map to unauthorizedStatus, not 500 (goal step 4)', () => {
  const target = new NextJsProjection();

  async function sample() {
    const src = `entity Recipe { property title: string command create() { emit RecipeCreated } }
                 event RecipeCreated: "recipe.created" { recipeId: string }`;
    const result = await compileToIR(src);
    return result.ir!;
  }

  it('dispatcher catch block classifies auth-thrown errors and returns unauthorizedStatus', async () => {
    const ir = await sample();
    const code = target.generate(ir, { surface: 'nextjs.dispatcher' }).artifacts[0].code;

    // Must contain the auth-error classifier
    expect(code).toMatch(/isAuthError/);
    expect(code).toMatch(/\/unauth\/i\.test\(error\.message\)/);
    // Must return 401 for auth errors (default unauthorizedStatus)
    expect(code).toMatch(/manifestErrorResponse\(\{ error: "Unauthorized"[^)]*\}, 401\)/);
  });

  it('configurable unauthorizedStatus is honored (e.g. 403)', async () => {
    const ir = await sample();
    const code = target.generate(ir, {
      surface: 'nextjs.dispatcher',
      options: { unauthorizedStatus: 403 },
    }).artifacts[0].code;

    // Both the inline auth check AND the catch-block classifier must use 403
    const matches = code.match(/manifestErrorResponse\(\{ error: "Unauthorized"[^)]*\}, 403\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(code).not.toMatch(/manifestErrorResponse\(\{ error: "Unauthorized"[^)]*\}, 401\)/);
  });
});

describe('runtime catch-all returns stable Manifest error shape (goal step 4)', () => {
  const target = new NextJsProjection();

  async function sample() {
    const result = await compileToIR(
      `entity Recipe { property title: string command create() { emit RecipeCreated } } event RecipeCreated: "recipe.created" { recipeId: string }`
    );
    return result.ir!;
  }

  it('dispatcher catch returns Manifest shape, not a bare string', async () => {
    const ir = await sample();
    const code = target.generate(ir, { surface: 'nextjs.dispatcher' }).artifacts[0].code;

    // The bare-string return path is the regression we are guarding against.
    expect(code).not.toMatch(/manifestErrorResponse\("Internal server error"/);

    // Must use the object shape with `error` + `diagnostics`.
    expect(code).toMatch(/error: "Internal server error"/);
    expect(code).toMatch(/diagnostics: \[\{ kind: "runtime_error"/);
    expect(code).toMatch(/500/);
  });

  it('read routes also use the stable Manifest shape', async () => {
    const ir = await sample();
    const code = target.generate(ir, { surface: 'nextjs.route', entity: 'Recipe' }).artifacts[0].code;
    expect(code).not.toMatch(/manifestErrorResponse\("Internal server error"/);
    expect(code).toMatch(/diagnostics: \[\{ kind: "runtime_error"/);
  });
});

describe('Prisma 7 detail route findFirst vs findUnique (goal step 5)', () => {
  const target = new NextJsProjection();

  async function sample() {
    const result = await compileToIR(
      `entity Recipe { property id: string property title: string }`
    );
    return result.ir!;
  }

  it('default detail (tenant + soft-delete on) uses findFirst, never findUnique', async () => {
    const ir = await sample();
    const code = target.generate(ir, { surface: 'nextjs.detail', entity: 'Recipe' }).artifacts[0].code;

    expect(code).toContain('database.recipe.findFirst');
    expect(code).not.toContain('database.recipe.findUnique');
    // Multi-field where shape must include id + tenantId + deletedAt
    expect(code).toContain('tenantId');
    expect(code).toContain('deletedAt: null');
  });

  it('id-only detail (filters off) uses findUnique (single unique-constraint shape)', async () => {
    const ir = await sample();
    const code = target.generate(ir, {
      surface: 'nextjs.detail',
      entity: 'Recipe',
      options: { includeTenantFilter: false, includeSoftDeleteFilter: false },
    }).artifacts[0].code;

    expect(code).toContain('database.recipe.findUnique');
    expect(code).not.toContain('database.recipe.findFirst');
  });

  it('readRoutes.directDbReads:false emits no Prisma call (opt-out)', async () => {
    const ir = await sample();
    const code = target.generate(ir, {
      surface: 'nextjs.detail',
      entity: 'Recipe',
      options: { readRoutes: { directDbReads: false } },
    }).artifacts[0].code;

    expect(code).not.toContain('database.recipe.findFirst');
    expect(code).not.toContain('database.recipe.findUnique');
    expect(code).toMatch(/Wire your read source here/);
  });

  it('readRoutes.enabled:false suppresses the detail surface entirely', async () => {
    const ir = await sample();
    const result = target.generate(ir, {
      surface: 'nextjs.detail',
      entity: 'Recipe',
      options: { readRoutes: { enabled: false } },
    });
    expect(result.artifacts).toHaveLength(0);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'READ_ROUTES_DISABLED', severity: 'info' })
    );
  });
});
