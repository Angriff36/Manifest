/**
 * Tests for the SvelteKit `sveltekit.companions` surface.
 *
 * The surface emits the modules generated route code imports but no other
 * surface writes (runtime factory, Prisma client, auth stub). These tests pin:
 * which companions are emitted and when, that pathHints follow the CONFIGURED
 * import paths, an import-resolution self-check (every local import in every
 * emitted artifact resolves to an emitted module, `./$types` excepted — that is
 * SvelteKit-generated), and that the emitted runtime factory constructs a
 * working engine (executed via jiti against the real RuntimeEngine).
 */

import { describe, it, expect, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { compileToIR } from '../../ir-compiler';
import { SvelteKitProjection } from './generator';
import { resolveLocalImportPathHint } from '../shared/companions';
import type { ProjectionResult } from '../interface';

const __dirname = dirname(fileURLToPath(import.meta.url));
// The emitted factory imports `@angriff36/manifest`; jiti resolves that alias
// to the in-tree runtime engine so the executed factory uses the real engine.
const RUNTIME_ENGINE_PATH = resolve(__dirname, '../../runtime-engine.ts');

const projection = new SvelteKitProjection();

async function companions(options?: Record<string, unknown>): Promise<ProjectionResult> {
  const source = `
    entity Recipe {
      property id: string
      property name: string
    }
  `;
  const compiled = await compileToIR(source);
  expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return projection.generate(compiled.ir!, { surface: 'sveltekit.companions', options });
}

function byPath(result: ProjectionResult, pathHint: string) {
  return result.artifacts.find((a) => a.pathHint === pathHint);
}

describe('sveltekit.companions surface', () => {
  it('emits runtime, database, and auth companions with default options', async () => {
    const result = await companions();

    const runtime = byPath(result, 'src/lib/server/manifest-runtime.ts');
    const database = byPath(result, 'src/lib/server/database.ts');
    const auth = byPath(result, 'src/lib/server/auth.ts');

    expect(runtime).toBeDefined();
    expect(database).toBeDefined();
    expect(auth).toBeDefined();

    // Runtime factory: exports createManifestRuntime and embeds the IR.
    expect(runtime!.code).toContain('import { RuntimeEngine } from "@angriff36/manifest";');
    expect(runtime!.code).toContain('export async function createManifestRuntime(');
    expect(runtime!.code).toContain('"name": "Recipe"');

    // Database: Prisma client singleton.
    expect(database!.code).toContain('import { PrismaClient } from "@prisma/client";');
    expect(database!.code).toContain('export const database =');

    // Auth: default provider is 'lucia' → the lucia binding the routes import.
    expect(auth!.code).toContain('export const lucia =');
  });

  it('emits nothing when emitCompanions is false', async () => {
    const result = await companions({ emitCompanions: false });
    expect(result.artifacts).toEqual([]);
    expect(result.diagnostics.some((d) => d.code === 'COMPANIONS_DISABLED')).toBe(true);
  });

  it('relocates companions to the configured import paths', async () => {
    const result = await companions({
      runtimeImportPath: '$lib/server/rt',
      databaseImportPath: '$lib/db',
    });
    expect(byPath(result, 'src/lib/server/rt.ts')).toBeDefined();
    expect(byPath(result, 'src/lib/db.ts')).toBeDefined();
    // The default paths are NOT used when overridden.
    expect(byPath(result, 'src/lib/server/manifest-runtime.ts')).toBeUndefined();
    expect(byPath(result, 'src/lib/server/database.ts')).toBeUndefined();
  });

  it('skips (does not emit) a companion whose import path is a package specifier', async () => {
    const result = await companions({ databaseImportPath: '@acme/db' });
    expect(result.artifacts.some((a) => a.id === 'sveltekit.companions.database')).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'COMPANION_SKIPPED_PACKAGE_PATH')).toBe(true);
    // The always-on runtime factory is still emitted.
    expect(byPath(result, 'src/lib/server/manifest-runtime.ts')).toBeDefined();
  });

  it('emits a fail-closed getServerSession stub for auth-js', async () => {
    const result = await companions({ authProvider: 'auth-js' });
    const auth = byPath(result, 'src/lib/server/auth.ts');
    expect(auth).toBeDefined();
    expect(auth!.code).toContain('export async function getServerSession(');
    expect(auth!.code).toContain('throw new Error(');
  });

  it('emits a fail-closed requireUser stub for the custom provider', async () => {
    const result = await companions({ authProvider: 'custom' });
    const auth = byPath(result, 'src/lib/server/auth.ts');
    expect(auth).toBeDefined();
    expect(auth!.code).toContain('export async function requireUser(');
    expect(auth!.code).toContain('throw new Error(');
  });

  it('emits no auth companion for the none provider', async () => {
    const none = await companions({ authProvider: 'none' });
    expect(none.artifacts.some((a) => a.id === 'sveltekit.companions.auth')).toBe(false);
  });

  it('emits a tenant companion at the configured provider path when tenantProvider is set', async () => {
    const result = await companions({
      tenantProvider: { importPath: '$lib/server/tenant', functionName: 'resolveTenantId', lookupKey: 'userId' },
    });
    const tenant = byPath(result, 'src/lib/server/tenant.ts');
    expect(tenant).toBeDefined();
    expect(tenant!.code).toContain('export async function resolveTenantId(userId: string): Promise<string | null>');
    expect(tenant!.code).toContain('import { database } from "$lib/server/database";');
    // No tenant companion by default (inline userTenantMapping via the db companion).
    expect(byPath(await companions(), 'src/lib/server/tenant.ts')).toBeUndefined();
  });

  it('emits the runtime factory under a non-default runtimeFactoryName that routes import', async () => {
    const source = `
      entity Recipe {
        property id: string
        property name: string
        event RecipeRenamed
        command rename(newName: string) {
          mutate name = newName
          emit RecipeRenamed
        }
      }
    `;
    const compiled = await compileToIR(source);
    expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const ir = compiled.ir!;
    const options = { runtimeFactoryName: 'makeManifestRuntime' };

    // Export side: the emitted factory declares the custom name.
    const companionResult = projection.generate(ir, { surface: 'sveltekit.companions', options });
    const runtime = byPath(companionResult, 'src/lib/server/manifest-runtime.ts');
    expect(runtime).toBeDefined();
    expect(runtime!.code).toContain('export async function makeManifestRuntime(');
    expect(runtime!.code).not.toContain('export async function createManifestRuntime(');

    // Import side: a route imports that same name from the runtime module.
    const serverResult = projection.generate(ir, { surface: 'sveltekit.server', entity: 'Recipe', options });
    const server = serverResult.artifacts[0];
    expect(server.code).toContain('import { makeManifestRuntime } from "$lib/server/manifest-runtime";');
    expect(server.code).toContain('await makeManifestRuntime(');
  });

  it('produces deterministic output', async () => {
    const a = await companions();
    const b = await companions();
    expect(a.artifacts.map((x) => x.code)).toEqual(b.artifacts.map((x) => x.code));
  });
});

// ---------------------------------------------------------------------------
// Import-resolution self-check: every LOCAL import specifier in every emitted
// artifact must resolve (via resolveLocalImportPathHint) to a pathHint the
// projection also emits. Package specifiers resolve to null (app's
// responsibility); `./$types` is generated by `svelte-kit sync`, not Manifest.
// ---------------------------------------------------------------------------

const SVELTEKIT_FRAMEWORK_SPECIFIERS = new Set<string>(['./$types']);

function localImportSpecifiers(code: string): string[] {
  const specs: string[] = [];
  const fromRe = /\bfrom\s+["']([^"']+)["']/g;
  const dynRe = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(code)) !== null) specs.push(m[1]);
  while ((m = dynRe.exec(code)) !== null) specs.push(m[1]);
  return specs;
}

async function allArtifacts(options?: Record<string, unknown>): Promise<ProjectionResult['artifacts']> {
  const source = `
    entity Recipe {
      property id: string
      property name: string
      property tenantId: string
      event RecipeRenamed
      command rename(newName: string) {
        mutate name = newName
        emit RecipeRenamed
      }
    }
  `;
  const compiled = await compileToIR(source);
  expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const ir = compiled.ir!;

  const artifacts: ProjectionResult['artifacts'] = [];
  const add = (r: ProjectionResult) => {
    for (const a of r.artifacts) {
      if (!artifacts.some((x) => x.id === a.id)) artifacts.push(a);
    }
  };

  for (const surface of projection.surfaces) {
    add(projection.generate(ir, { surface, options }));
    for (const entity of ir.entities) {
      add(projection.generate(ir, { surface, entity: entity.name, options }));
      for (const cmd of ir.commands.filter((c) => c.entity === entity.name)) {
        add(projection.generate(ir, { surface, entity: entity.name, command: cmd.name, options }));
      }
    }
  }
  return artifacts;
}

function assertAllLocalImportsResolve(artifacts: ProjectionResult['artifacts']): void {
  const emitted = new Set(artifacts.map((a) => a.pathHint));
  for (const artifact of artifacts) {
    for (const spec of localImportSpecifiers(artifact.code)) {
      if (SVELTEKIT_FRAMEWORK_SPECIFIERS.has(spec)) continue;
      const resolved = resolveLocalImportPathHint(spec, {
        framework: 'sveltekit',
        importerPathHint: artifact.pathHint,
      });
      if (resolved === null) continue; // package specifier — app's responsibility
      expect(
        emitted.has(resolved),
        `unsatisfied local import "${spec}" in ${artifact.pathHint} → expected emitted module ${resolved}`,
      ).toBe(true);
    }
  }
}

describe('sveltekit.companions import resolution', () => {
  it.each([
    ['default', undefined],
    ['lucia', { authProvider: 'lucia' }],
    ['auth-js', { authProvider: 'auth-js' }],
    ['custom', { authProvider: 'custom' }],
    ['none', { authProvider: 'none' }],
  ] as const)('every local import resolves to an emitted module (%s)', async (_label, options) => {
    const artifacts = await allArtifacts(options as Record<string, unknown> | undefined);
    assertAllLocalImportsResolve(artifacts);
  });
});

// ---------------------------------------------------------------------------
// The emitted runtime factory must construct a real, working RuntimeEngine.
// ---------------------------------------------------------------------------

describe('emitted runtime factory executes', () => {
  const tempDirs: string[] = [];

  afterAll(async () => {
    for (const dir of tempDirs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('constructs a working RuntimeEngine and runs a command to success', async () => {
    const source = `
      entity Widget {
        property name: string
        event WidgetCreated
        command create(name: string) {
          mutate result = true
          emit WidgetCreated
        }
      }
    `;
    const compiled = await compileToIR(source);
    expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const result = projection.generate(compiled.ir!, { surface: 'sveltekit.companions' });
    const runtimeArtifact = result.artifacts.find((a) => a.id === 'sveltekit.companions.runtime');
    expect(runtimeArtifact).toBeDefined();

    const dir = await fs.mkdtemp(join(tmpdir(), 'manifest-sveltekit-companion-'));
    tempDirs.push(dir);
    const factoryPath = join(dir, 'manifest-runtime.ts');
    await fs.writeFile(factoryPath, runtimeArtifact!.code, 'utf-8');

    const jitiMod = (await import('jiti')) as unknown as {
      default: (base: string, opts: Record<string, unknown>) => (id: string) => unknown;
    };
    const jitiFactory = (jitiMod.default ?? (jitiMod as unknown)) as (
      base: string,
      opts: Record<string, unknown>,
    ) => (id: string) => unknown;
    const load = jitiFactory(RUNTIME_ENGINE_PATH, {
      interopDefault: true,
      alias: { '@angriff36/manifest': RUNTIME_ENGINE_PATH },
    });

    const mod = load(factoryPath) as {
      createManifestRuntime: (context?: Record<string, unknown>) => Promise<{
        runCommand: (
          command: string,
          input: Record<string, unknown>,
          options?: Record<string, unknown>,
        ) => Promise<{ success: boolean }>;
        replaceContext: (ctx: Record<string, unknown>) => void;
      }>;
    };

    expect(typeof mod.createManifestRuntime).toBe('function');

    const runtime = await mod.createManifestRuntime({ user: { id: 'u' } });
    expect(typeof runtime.runCommand).toBe('function');

    const commandResult = await runtime.runCommand('create', { name: 'Sprocket' });
    expect(commandResult.success).toBe(true);
  });
});
