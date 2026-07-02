/**
 * Tests for the Remix `remix.companions` surface.
 *
 * The surface emits the modules generated route/type code imports but no other
 * surface writes (runtime factory, shared loader/action types, Prisma client,
 * auth stub). These tests pin: which companions are emitted and when, that
 * pathHints follow the CONFIGURED import paths, an import-resolution self-check
 * (every local import in every emitted artifact resolves to an emitted module),
 * and — crucially — that the emitted runtime factory actually constructs a
 * working engine (executed via jiti against the real RuntimeEngine).
 */

import { describe, it, expect, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { compileToIR } from '../../ir-compiler';
import { RemixProjection } from './generator';
import { resolveLocalImportPathHint } from '../shared/companions';
import type { ProjectionResult } from '../interface';

const __dirname = dirname(fileURLToPath(import.meta.url));
// The emitted factory imports `@angriff36/manifest`; jiti resolves that alias
// to the in-tree runtime engine so the executed factory uses the real engine.
const RUNTIME_ENGINE_PATH = resolve(__dirname, '../../runtime-engine.ts');

const projection = new RemixProjection();

async function companions(options?: Record<string, unknown>): Promise<ProjectionResult> {
  const source = `
    entity Recipe {
      property id: string
      property name: string
    }
  `;
  const compiled = await compileToIR(source);
  expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return projection.generate(compiled.ir!, { surface: 'remix.companions', options });
}

function byPath(result: ProjectionResult, pathHint: string) {
  return result.artifacts.find((a) => a.pathHint === pathHint);
}

describe('remix.companions surface', () => {
  it('emits runtime, shared types, database, and auth companions with default options', async () => {
    const result = await companions();

    const runtime = byPath(result, 'app/utils/manifest-runtime.ts');
    const types = byPath(result, 'app/utils/manifest-types.ts');
    const database = byPath(result, 'app/utils/database.server.ts');
    const auth = byPath(result, 'app/utils/auth.server.ts');

    expect(runtime).toBeDefined();
    expect(types).toBeDefined();
    expect(database).toBeDefined();
    expect(auth).toBeDefined();

    // Runtime factory: exports createManifestRuntime and embeds the IR.
    expect(runtime!.code).toContain('import { RuntimeEngine } from "@angriff36/manifest";');
    expect(runtime!.code).toContain('export async function createManifestRuntime(');
    expect(runtime!.code).toContain('"name": "Recipe"');

    // Shared types: the exact symbols the generated `remix.types` module imports.
    expect(types!.code).toContain('export interface ManifestLoaderData');
    expect(types!.code).toContain('export interface ManifestActionResult');
    expect(types!.code).toContain('export interface ManifestDiagnostic');

    // Database: Prisma client singleton.
    expect(database!.code).toContain('import { PrismaClient } from "@prisma/client";');
    expect(database!.code).toContain('export const database =');

    // Auth: default provider is 'remix-auth' → authenticator stub.
    expect(auth!.code).toContain('export const authenticator = {');
    expect(auth!.code).toContain('isAuthenticated(');
    expect(auth!.code).toContain('throw new Error(');
  });

  it('emits nothing when emitCompanions is false', async () => {
    const result = await companions({ emitCompanions: false });
    expect(result.artifacts).toEqual([]);
    expect(result.diagnostics.some((d) => d.code === 'COMPANIONS_DISABLED')).toBe(true);
  });

  it('relocates companions to the configured import paths', async () => {
    const result = await companions({
      runtimeImportPath: '~/server/rt',
      databaseImportPath: '~/db/client',
    });
    expect(byPath(result, 'app/server/rt.ts')).toBeDefined();
    expect(byPath(result, 'app/db/client.ts')).toBeDefined();
    // The default paths are NOT used when overridden.
    expect(byPath(result, 'app/utils/manifest-runtime.ts')).toBeUndefined();
    expect(byPath(result, 'app/utils/database.server.ts')).toBeUndefined();
  });

  it('skips (does not emit) a companion whose import path is a package specifier', async () => {
    const result = await companions({ databaseImportPath: '@acme/db' });
    // No database artifact is emitted at any path — the package is the user's.
    expect(result.artifacts.some((a) => a.id === 'remix.companions.database')).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'COMPANION_SKIPPED_PACKAGE_PATH')).toBe(true);
    // The always-on runtime factory is still emitted.
    expect(byPath(result, 'app/utils/manifest-runtime.ts')).toBeDefined();
  });

  it('emits the getUser/requireUser stub for the custom provider', async () => {
    const custom = await companions({ authProvider: 'custom' });
    const auth = byPath(custom, 'app/utils/auth.server.ts');
    expect(auth).toBeDefined();
    expect(auth!.code).toContain('export async function getUser(');
    expect(auth!.code).toContain('export async function requireUser(');
    expect(auth!.code).toContain('throw new Error(');
  });

  it('emits no auth companion for clerk (package) or none', async () => {
    // clerk defaults to the @clerk/remix package import → nothing to emit.
    const clerk = await companions({ authProvider: 'clerk' });
    expect(clerk.artifacts.some((a) => a.id === 'remix.companions.auth')).toBe(false);

    const none = await companions({ authProvider: 'none' });
    expect(none.artifacts.some((a) => a.id === 'remix.companions.auth')).toBe(false);
  });

  it('emits a local clerk stub when authImportPath is a local alias', async () => {
    const result = await companions({ authProvider: 'clerk', authImportPath: '~/utils/clerk.server' });
    const auth = byPath(result, 'app/utils/clerk.server.ts');
    expect(auth).toBeDefined();
    expect(auth!.code).toContain('export async function getAuth(');
  });

  it('emits a tenant companion at the configured provider path when tenantProvider is set', async () => {
    const result = await companions({
      tenantProvider: { importPath: '~/utils/tenant', functionName: 'resolveTenantId', lookupKey: 'userId' },
    });
    const tenant = byPath(result, 'app/utils/tenant.ts');
    expect(tenant).toBeDefined();
    expect(tenant!.code).toContain('export async function resolveTenantId(userId: string): Promise<string | null>');
    expect(tenant!.code).toContain('import { database } from "~/utils/database.server";');
    // No tenant companion by default (inline userTenantMapping via the db companion).
    expect(byPath(await companions(), 'app/utils/tenant.ts')).toBeUndefined();
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
// projection also emits. Package specifiers resolve to null and are the app's
// responsibility. This is the guarantee "generated output compiles out of the
// box" reduces to for path resolution.
// ---------------------------------------------------------------------------

// Remix's only framework-magic relative specifier is none — @remix-run/*,
// react-router and @clerk/remix are all packages (resolve to null).
const REMIX_FRAMEWORK_SPECIFIERS = new Set<string>();

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
      if (REMIX_FRAMEWORK_SPECIFIERS.has(spec)) continue;
      const resolved = resolveLocalImportPathHint(spec, {
        framework: 'remix',
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

describe('remix.companions import resolution', () => {
  it.each([
    ['default', undefined],
    ['remix-auth', { authProvider: 'remix-auth' }],
    ['custom', { authProvider: 'custom' }],
    ['clerk', { authProvider: 'clerk' }],
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

    const result = projection.generate(compiled.ir!, { surface: 'remix.companions' });
    const runtimeArtifact = result.artifacts.find((a) => a.id === 'remix.companions.runtime');
    expect(runtimeArtifact).toBeDefined();

    const dir = await fs.mkdtemp(join(tmpdir(), 'manifest-remix-companion-'));
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
