/**
 * Tests for the Express `express.companions` surface.
 *
 * The surface emits the modules the generated router imports but no other
 * surface writes: the runtime factory (`createManifestRuntime`) and the auth
 * middleware (`requireAuth`). These tests pin which companions are emitted and
 * when, that pathHints follow the CONFIGURED import paths (resolved against the
 * router's directory), that a full-surface walk leaves no local import
 * dangling, and — via jiti against the real RuntimeEngine — that the emitted
 * runtime factory actually constructs a working engine.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { compileToIR } from '../../ir-compiler';
import { ExpressProjection } from './generator';
import { resolveLocalImportPathHint } from '../shared/companions';
import type { ProjectionArtifact, ProjectionResult } from '../interface';

const __dirname = dirname(fileURLToPath(import.meta.url));
// The emitted factory imports `@angriff36/manifest`; jiti resolves that alias
// to the in-tree runtime engine so the executed factory uses the real engine.
const RUNTIME_ENGINE_PATH = resolve(__dirname, '../../runtime-engine.ts');

const projection = new ExpressProjection();

const SOURCE = `
  entity Widget {
    property name: string
    event WidgetCreated
    command create(name: string) {
      mutate result = true
      emit WidgetCreated
    }
  }
`;

async function companions(options?: Record<string, unknown>): Promise<ProjectionResult> {
  const compiled = await compileToIR(SOURCE);
  expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return projection.generate(compiled.ir!, { surface: 'express.companions', options });
}

function byPath(result: ProjectionResult, pathHint: string): ProjectionArtifact | undefined {
  return result.artifacts.find((a) => a.pathHint === pathHint);
}

/**
 * Walk every surface globally + per-entity, deduplicating by artifact id —
 * mirrors the CLI's `generateWithRegistryProjection` and the snapshot suite,
 * so the collected set is what a real `manifest generate --surface all` writes.
 */
async function walkAllSurfaces(options?: Record<string, unknown>): Promise<ProjectionArtifact[]> {
  const compiled = await compileToIR(SOURCE);
  expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const ir = compiled.ir!;
  const artifacts: ProjectionArtifact[] = [];
  const seen = new Set<string>();
  const collect = (result: ProjectionResult) => {
    for (const a of result.artifacts) {
      if (!seen.has(a.id)) {
        seen.add(a.id);
        artifacts.push(a);
      }
    }
  };
  for (const surface of projection.surfaces) {
    collect(projection.generate(ir, { surface, options }));
    for (const entity of ir.entities) {
      collect(projection.generate(ir, { surface, entity: entity.name, options }));
    }
  }
  return artifacts;
}

describe('express.companions surface', () => {
  it('emits the runtime factory and auth middleware with default options', async () => {
    const result = await companions();

    const runtime = byPath(result, 'routes/lib/manifest-runtime.ts');
    const auth = byPath(result, 'routes/middleware/auth.ts');

    expect(runtime).toBeDefined();
    expect(auth).toBeDefined();

    // Runtime companion: inner engine factory + router-facing facade, IR embedded.
    expect(runtime!.code).toContain('import { RuntimeEngine } from "@angriff36/manifest";');
    expect(runtime!.code).toContain('export async function createManifestEngine(');
    expect(runtime!.code).toContain('export async function createManifestRuntime(');
    expect(runtime!.code).toContain('"name": "Widget"');
    // Facade exposes exactly the surface the routers call.
    expect(runtime!.code).toContain('list(entityName: string');
    expect(runtime!.code).toContain('get(entityName: string, id: string');
    expect(runtime!.code).toContain('runCommand(');

    // Auth middleware: an Express RequestHandler named per authMiddlewareName,
    // fail-closed with a 401.
    expect(auth!.code).toContain("import type { RequestHandler } from 'express';");
    expect(auth!.code).toContain('export const requireAuth: RequestHandler =');
    expect(auth!.code).toContain('.status(401)');
  });

  it('honors a custom authMiddlewareName in the emitted export', async () => {
    const result = await companions({ authMiddlewareName: 'ensureUser' });
    const auth = byPath(result, 'routes/middleware/auth.ts');
    expect(auth!.code).toContain('export const ensureUser: RequestHandler =');
  });

  it('emits clerk getAuth binding when authProvider is clerk', async () => {
    const result = await companions({ authProvider: 'clerk' });
    const auth = byPath(result, 'routes/middleware/auth.ts')!.code;
    expect(auth).toContain("import { getAuth } from '@clerk/express'");
    expect(auth).toContain('auth.userId');
    expect(auth).toContain('.status(401)');
  });

  it('emits anonymous pass-through when authProvider is none', async () => {
    const result = await companions({ authProvider: 'none' });
    const auth = byPath(result, 'routes/middleware/auth.ts')!.code;
    expect(auth).toContain("user = { id: 'anonymous' }");
    expect(auth).toContain('next()');
    expect(auth).not.toContain('.status(401)');
  });

  it('emits a Fastify preHandler stub in fastify mode', async () => {
    const result = await companions({ framework: 'fastify' });
    const auth = byPath(result, 'routes/middleware/auth.ts');
    expect(auth).toBeDefined();
    expect(auth!.code).toContain("import type { FastifyRequest, FastifyReply } from 'fastify';");
    expect(auth!.code).toContain('export async function requireAuth(');
    expect(auth!.code).toContain('reply.code(401)');
    // The runtime factory is unchanged by framework.
    expect(byPath(result, 'routes/lib/manifest-runtime.ts')).toBeDefined();
  });

  it('emits nothing when emitCompanions is false', async () => {
    const result = await companions({ emitCompanions: false });
    expect(result.artifacts).toEqual([]);
    expect(result.diagnostics.some((d) => d.code === 'COMPANIONS_DISABLED')).toBe(true);
  });

  it('relocates companions to the configured import paths', async () => {
    const result = await companions({
      runtimeImportPath: './server/runtime',
      authImportPath: './auth/guard',
    });
    expect(byPath(result, 'routes/server/runtime.ts')).toBeDefined();
    expect(byPath(result, 'routes/auth/guard.ts')).toBeDefined();
    // The default paths are NOT used when overridden.
    expect(byPath(result, 'routes/lib/manifest-runtime.ts')).toBeUndefined();
    expect(byPath(result, 'routes/middleware/auth.ts')).toBeUndefined();
  });

  it('skips (does not emit) a companion whose import path is a package specifier', async () => {
    const result = await companions({ runtimeImportPath: '@acme/manifest-runtime' });
    // No runtime artifact is emitted at any path — the package is the user's.
    expect(result.artifacts.some((a) => a.id.startsWith('express.companions.runtime'))).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'COMPANION_SKIPPED_PACKAGE_PATH')).toBe(true);
    // The always-on auth middleware is still emitted.
    expect(byPath(result, 'routes/middleware/auth.ts')).toBeDefined();
  });

  it('produces deterministic output', async () => {
    const a = await companions();
    const b = await companions();
    expect(a.artifacts.map((x) => `${x.id}\u0000${x.pathHint}\u0000${x.code}`)).toEqual(
      b.artifacts.map((x) => `${x.id}\u0000${x.pathHint}\u0000${x.code}`),
    );
  });

  it('leaves no local import dangling across a full-surface walk', async () => {
    const artifacts = await walkAllSurfaces();
    const importRe = /from\s+['"]([^'"]+)['"]/g;
    for (const artifact of artifacts) {
      if (!artifact.pathHint) continue;
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(artifact.code)) !== null) {
        const spec = m[1];
        const resolved = resolveLocalImportPathHint(spec, {
          framework: 'express',
          importerPathHint: artifact.pathHint,
        });
        if (resolved === null) continue; // package specifier — the app's to provide
        const satisfied = artifacts.some((a) => a.pathHint === resolved);
        expect(
          satisfied,
          `import "${spec}" from ${artifact.pathHint} → ${resolved} must be emitted`,
        ).toBe(true);
      }
    }
  });
});

describe('emitted express runtime facade executes against the real engine', () => {
  const tempDirs: string[] = [];

  afterAll(async () => {
    for (const dir of tempDirs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('the router only calls facade methods, and each runs end-to-end', async () => {
    const compiled = await compileToIR(SOURCE);
    expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const ir = compiled.ir!;

    // Emit the runtime companion + the router, and collect the method names the
    // generated router actually calls on `runtime`.
    const companionResult = projection.generate(ir, { surface: 'express.companions' });
    const runtimeArtifact = companionResult.artifacts.find(
      (a) => a.pathHint === 'routes/lib/manifest-runtime.ts',
    );
    expect(runtimeArtifact).toBeDefined();

    const routerCode = projection
      .generate(ir, { surface: 'express.router' })
      .artifacts.map((a) => a.code)
      .join('\n');
    const calledMethods = new Set<string>();
    const callRe = /\bruntime\.(\w+)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = callRe.exec(routerCode)) !== null) calledMethods.add(m[1]);
    // The router must actually exercise the facade's read + write surface.
    expect([...calledMethods].sort()).toEqual(['get', 'list', 'runCommand']);

    // Load the emitted facade via jiti, aliasing the package import to the
    // in-tree engine, and construct the runtime.
    const dir = await fs.mkdtemp(join(tmpdir(), 'manifest-express-companion-'));
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
      createManifestRuntime: (
        context?: Record<string, unknown>,
      ) => Promise<Record<string, (...args: unknown[]) => Promise<unknown>>>;
    };
    expect(typeof mod.createManifestRuntime).toBe('function');

    const runtime = await mod.createManifestRuntime();

    // Every method the router calls must exist on the facade's return object.
    for (const method of calledMethods) {
      expect(typeof runtime[method], `facade.${method} exists`).toBe('function');
    }

    // Each facade method runs end-to-end against the real engine and returns a
    // real result (the sample create command does not persist an instance, so
    // list is asserted as a real array rather than non-empty).
    const commandResult = (await runtime.runCommand('Widget', 'create', {
      params: { name: 'Sprocket' },
    })) as { success: boolean };
    expect(commandResult.success).toBe(true);

    const listResult = await runtime.list('Widget');
    expect(Array.isArray(listResult)).toBe(true);

    const getResult = await runtime.get('Widget', 'does-not-exist');
    expect(getResult ?? null).toBeNull();
  });
});
