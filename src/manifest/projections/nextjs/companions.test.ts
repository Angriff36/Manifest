/**
 * Tests for the Next.js `nextjs.companions` surface.
 *
 * The surface emits the modules generated route/dispatcher code imports but no
 * other surface writes (runtime factory, HTTP envelope, database client, auth
 * stub, tenant helper). These tests pin: which companions are emitted and when,
 * that pathHints follow the CONFIGURED import paths, and — crucially — that the
 * emitted runtime factory actually constructs a working engine (executed via
 * jiti against the real RuntimeEngine, so the embedded-IR path is proven, not
 * just string-matched).
 */

import { describe, it, expect, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { compileToIR } from '../../ir-compiler';
import { NextJsProjection } from './generator';
import type { ProjectionResult } from '../interface';

const __dirname = dirname(fileURLToPath(import.meta.url));
// The emitted factory imports `@angriff36/manifest`; jiti resolves that alias
// to the in-tree runtime engine so the executed factory uses the real engine.
const RUNTIME_ENGINE_PATH = resolve(__dirname, '../../runtime-engine.ts');

const projection = new NextJsProjection();

async function companions(options?: Record<string, unknown>): Promise<ProjectionResult> {
  const source = `
    entity Recipe {
      property id: string
      property name: string
    }
  `;
  const compiled = await compileToIR(source);
  expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return projection.generate(compiled.ir!, { surface: 'nextjs.companions', options });
}

function byPath(result: ProjectionResult, pathHint: string) {
  return result.artifacts.find((a) => a.pathHint === pathHint);
}

describe('nextjs.companions surface', () => {
  it('emits runtime, response, and database companions with default options', async () => {
    const result = await companions();

    const runtime = byPath(result, 'lib/manifest-runtime.ts');
    const response = byPath(result, 'lib/manifest-response.ts');
    const database = byPath(result, 'lib/database.ts');

    expect(runtime).toBeDefined();
    expect(response).toBeDefined();
    expect(database).toBeDefined();

    // Runtime factory: exports createManifestRuntime and embeds the IR.
    expect(runtime!.code).toContain('import { RuntimeEngine } from "@angriff36/manifest";');
    expect(runtime!.code).toContain('export async function createManifestRuntime(');
    expect(runtime!.code).toContain('"name": "Recipe"');

    // Response helpers: every symbol the generated routes import, over NextResponse.
    expect(response!.code).toContain('import { NextResponse } from "next/server";');
    expect(response!.code).toContain('export function manifestSuccessResponse(');
    expect(response!.code).toContain('export function manifestErrorResponse(');
    expect(response!.code).toContain('export function normalizeCommandResult<T = unknown>(');

    // Database: Prisma client singleton.
    expect(database!.code).toContain('import { PrismaClient } from "@prisma/client";');
    expect(database!.code).toContain('export const database =');

    // Default provider is 'none' and tenant filtering is off → no auth/tenant.
    expect(byPath(result, 'lib/auth.ts')).toBeUndefined();
    expect(byPath(result, 'app/lib/tenant.ts')).toBeUndefined();
  });

  it('emits nothing when emitCompanions is false', async () => {
    const result = await companions({ emitCompanions: false });
    expect(result.artifacts).toEqual([]);
    expect(result.diagnostics.some((d) => d.code === 'COMPANIONS_DISABLED')).toBe(true);
  });

  it('relocates companions to the configured import paths', async () => {
    const result = await companions({
      responseImportPath: '@/shared/rsp',
      runtimeImportPath: '@/server/rt',
    });
    expect(byPath(result, 'shared/rsp.ts')).toBeDefined();
    expect(byPath(result, 'server/rt.ts')).toBeDefined();
    // The default paths are NOT used when overridden.
    expect(byPath(result, 'lib/manifest-response.ts')).toBeUndefined();
    expect(byPath(result, 'lib/manifest-runtime.ts')).toBeUndefined();
  });

  it('skips (does not emit) a companion whose import path is a package specifier', async () => {
    const result = await companions({ responseImportPath: '@acme/manifest-response' });
    // No response artifact is emitted at any path — the package is the user's.
    expect(result.artifacts.some((a) => a.id === 'nextjs.companions.response')).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'COMPANION_SKIPPED_PACKAGE_PATH')).toBe(true);
    // The always-on runtime factory is still emitted.
    expect(byPath(result, 'lib/manifest-runtime.ts')).toBeDefined();
  });

  it('emits a fail-closed auth stub only for the custom provider', async () => {
    const custom = await companions({ authProvider: 'custom' });
    const auth = byPath(custom, 'lib/auth.ts');
    expect(auth).toBeDefined();
    expect(auth!.code).toContain('export async function getUser(');
    expect(auth!.code).toContain('throw new Error(');

    // clerk / none default to package imports (or no import) → no auth companion.
    expect(byPath(await companions({ authProvider: 'clerk' }), 'lib/auth.ts')).toBeUndefined();
    expect(byPath(await companions({ authProvider: 'none' }), 'lib/auth.ts')).toBeUndefined();
  });

  it('emits the tenant helper only when includeTenantFilter is on', async () => {
    const withTenant = await companions({ includeTenantFilter: true });
    const tenant = byPath(withTenant, 'app/lib/tenant.ts');
    expect(tenant).toBeDefined();
    // Uses the configured provider function name + lookup key and the db client.
    expect(tenant!.code).toContain('export async function getTenantIdForOrg(orgId: string)');
    expect(tenant!.code).toContain('import { database } from "@/lib/database";');

    // Off by default.
    expect(byPath(await companions(), 'app/lib/tenant.ts')).toBeUndefined();
  });

  it('composes a storeProvider from config when runtimeConfigImport is set', async () => {
    const result = await companions({ runtimeConfigImport: '../../manifest.config' });
    const runtime = byPath(result, 'lib/manifest-runtime.ts');
    expect(runtime!.code).toContain('import manifestConfig from "../../manifest.config";');
    expect(runtime!.code).toContain('{ storeProvider }');
  });

  it('produces deterministic output', async () => {
    const a = await companions();
    const b = await companions();
    expect(a.artifacts.map((x) => x.code)).toEqual(b.artifacts.map((x) => x.code));
  });
});

describe('emitted runtime factory executes', () => {
  const tempDirs: string[] = [];

  afterAll(async () => {
    for (const dir of tempDirs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('constructs a working RuntimeEngine and runs a command to success', async () => {
    // A tiny program with a create-style command that succeeds.
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

    const result = projection.generate(compiled.ir!, { surface: 'nextjs.companions' });
    const runtimeArtifact = result.artifacts.find((a) => a.id === 'nextjs.companions.runtime');
    expect(runtimeArtifact).toBeDefined();

    // Write the emitted factory verbatim to a temp dir and load it via jiti,
    // aliasing the package import to the in-tree runtime engine.
    const dir = await fs.mkdtemp(join(tmpdir(), 'manifest-companion-'));
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
    expect(typeof runtime.replaceContext).toBe('function');

    const commandResult = await runtime.runCommand('create', { name: 'Sprocket' });
    expect(commandResult.success).toBe(true);
  });
});
