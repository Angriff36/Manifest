import { describe, it, expect } from 'vitest';
import { compileToIR } from '../../ir-compiler';
import { NextJsProjection } from './generator';

/**
 * Tests the nextjs.dispatcher surface — the canonical /api/manifest path
 * required by capsule-pro/constitution.md §6.
 */

describe('nextjs.dispatcher surface', () => {
  const target = new NextJsProjection();

  async function compileSample() {
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
    expect(result.diagnostics).toHaveLength(0);
    expect(result.ir).not.toBeNull();
    return result.ir!;
  }

  it('declares nextjs.dispatcher as a supported surface', () => {
    expect(target.surfaces).toContain('nextjs.dispatcher');
  });

  it('emits one artifact at the canonical pathHint', async () => {
    const ir = await compileSample();
    const result = target.generate(ir, { surface: 'nextjs.dispatcher' });
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].pathHint).toBe(
      'apps/api/app/api/manifest/[entity]/commands/[command]/route.ts'
    );
    expect(result.artifacts[0].id).toBe('nextjs.dispatcher');
    expect(result.artifacts[0].contentType).toBe('typescript');
  });

  it('generated code is a POST handler that reads entity/command from route params', async () => {
    const ir = await compileSample();
    const code = target.generate(ir, { surface: 'nextjs.dispatcher' }).artifacts[0].code;

    expect(code).toMatch(/export async function POST/);
    // The handler must accept the dispatcher params shape and pull entity+command from it.
    expect(code).toMatch(/params:\s*\{\s*entity:\s*string;\s*command:\s*string/);
    expect(code).toMatch(/entity,\s*command/);
  });

  it('delegates to runtime.runCommand and surfaces the result verbatim', async () => {
    const ir = await compileSample();
    const code = target.generate(ir, { surface: 'nextjs.dispatcher' }).artifacts[0].code;

    expect(code).toMatch(/runCommand\(/);
    // Constitution §6 step 4: result MUST NOT be reshaped — same path as
    // the per-command route uses normalizeCommandResult.
    expect(code).toContain('normalizeCommandResult');
  });

  it('populates a typed RuntimeContext from auth state', async () => {
    const ir = await compileSample();
    const code = target.generate(ir, { surface: 'nextjs.dispatcher' }).artifacts[0].code;

    expect(code).toContain('actorId');
    expect(code).toContain('source');
  });

  it('does NOT hardcode any entity or command name into the route', async () => {
    const ir = await compileSample();
    const code = target.generate(ir, { surface: 'nextjs.dispatcher' }).artifacts[0].code;

    // The dispatcher is generic. None of the entity/command names from the
    // sample IR should leak into the route (would indicate per-entity
    // specialization, which defeats the dispatcher pattern).
    expect(code).not.toContain('Recipe');
    expect(code).not.toContain('"create"');
    expect(code).not.toContain('"release"');
  });

  it('returns an empty pathHint segment for the surface when no entities exist', async () => {
    const result = await compileToIR('');
    const empty = result.ir!;
    const out = target.generate(empty, { surface: 'nextjs.dispatcher' });
    // Empty IR is still a valid dispatcher target — the route is generic.
    expect(out.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(out.artifacts).toHaveLength(1);
  });

  it('marks legacy per-command routes as deprecated aliases of the dispatcher', async () => {
    const ir = await compileSample();
    const result = target.generate(ir, {
      surface: 'nextjs.command',
      entity: 'Recipe',
      command: 'create',
    });
    expect(result.artifacts).toHaveLength(1);
    const code = result.artifacts[0].code;
    expect(code).toMatch(/DEPRECATED ALIAS/);
    expect(code).toContain('/api/manifest/[entity]/commands/[command]');
  });

  it('honors authProvider option (none disables the auth import)', async () => {
    const ir = await compileSample();
    const code = target.generate(ir, {
      surface: 'nextjs.dispatcher',
      options: { authProvider: 'none' },
    }).artifacts[0].code;

    expect(code).not.toContain('@clerk/nextjs');
    expect(code).toMatch(/Auth disabled/);
  });
});
