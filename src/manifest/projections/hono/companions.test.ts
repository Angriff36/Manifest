/**
 * Tests for the Hono `hono.companions` surface.
 *
 * The surface emits the modules the generated router imports but no other
 * surface writes: the runtime factory (`createManifestRuntime`) and the auth
 * middleware (`requireAuth`). Hono's monolithic router lives at `src/routes.ts`
 * while per-entity routers live at `routes/<entity>.ts`, so a relative import
 * resolves to a different directory per importer — these tests pin that the
 * companion is emitted at BOTH locations, and the full-surface walk asserts no
 * local import is left dangling. (The runtime factory is identical to the
 * Express projection's; its execution is proven by the jiti test there.)
 */

import { describe, it, expect, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { compileToIR } from '../../ir-compiler';
import { HonoProjection } from './generator';
import { resolveLocalImportPathHint } from '../shared/companions';
import type { ProjectionArtifact, ProjectionResult } from '../interface';

const __dirname = dirname(fileURLToPath(import.meta.url));
// The emitted factory imports `@angriff36/manifest`; jiti resolves that alias
// to the in-tree runtime engine so the executed facade uses the real engine.
const RUNTIME_ENGINE_PATH = resolve(__dirname, '../../runtime-engine.ts');

const projection = new HonoProjection();

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
  return projection.generate(compiled.ir!, { surface: 'hono.companions', options });
}

function byPath(result: ProjectionResult, pathHint: string): ProjectionArtifact | undefined {
  return result.artifacts.find((a) => a.pathHint === pathHint);
}

/**
 * Walk every surface globally + per-entity, deduplicating by artifact id —
 * mirrors the CLI's `generateWithRegistryProjection` and the snapshot suite.
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

describe('hono.companions surface', () => {
  it('emits the runtime factory and auth middleware at both src/ and routes/', async () => {
    const result = await companions();

    // Monolithic router (src/routes.ts) and per-entity routers (routes/<e>.ts)
    // resolve the same relative import to different directories, so both exist.
    const runtimeSrc = byPath(result, 'src/lib/manifest-runtime.ts');
    const runtimeRoutes = byPath(result, 'routes/lib/manifest-runtime.ts');
    const authSrc = byPath(result, 'src/middleware/auth.ts');
    const authRoutes = byPath(result, 'routes/middleware/auth.ts');

    expect(runtimeSrc).toBeDefined();
    expect(runtimeRoutes).toBeDefined();
    expect(authSrc).toBeDefined();
    expect(authRoutes).toBeDefined();

    // Runtime companion: inner engine factory + router-facing facade, IR embedded.
    expect(runtimeSrc!.code).toContain('import { RuntimeEngine } from "@angriff36/manifest";');
    expect(runtimeSrc!.code).toContain('export async function createManifestEngine(');
    expect(runtimeSrc!.code).toContain('export async function createManifestRuntime(');
    expect(runtimeSrc!.code).toContain('"name": "Widget"');
    // Facade exposes exactly the surface the routers call.
    expect(runtimeSrc!.code).toContain('list(entityName: string');
    expect(runtimeSrc!.code).toContain('get(entityName: string, id: string');
    expect(runtimeSrc!.code).toContain('runCommand(');
    // Identical content emitted at both locations.
    expect(runtimeRoutes!.code).toBe(runtimeSrc!.code);

    // Auth middleware: a Hono MiddlewareHandler named per authMiddlewareName,
    // fail-closed with a 401.
    expect(authSrc!.code).toContain("import type { MiddlewareHandler } from 'hono';");
    expect(authSrc!.code).toContain('export const requireAuth: MiddlewareHandler =');
    expect(authSrc!.code).toContain('401');
    expect(authRoutes!.code).toBe(authSrc!.code);
  });

  it('honors a custom authMiddlewareName in the emitted export', async () => {
    const result = await companions({ authMiddlewareName: 'ensureUser' });
    expect(byPath(result, 'src/middleware/auth.ts')!.code).toContain(
      'export const ensureUser: MiddlewareHandler =',
    );
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
    expect(byPath(result, 'src/server/runtime.ts')).toBeDefined();
    expect(byPath(result, 'routes/server/runtime.ts')).toBeDefined();
    expect(byPath(result, 'src/auth/guard.ts')).toBeDefined();
    expect(byPath(result, 'routes/auth/guard.ts')).toBeDefined();
    // The default paths are NOT used when overridden.
    expect(byPath(result, 'src/lib/manifest-runtime.ts')).toBeUndefined();
    expect(byPath(result, 'routes/middleware/auth.ts')).toBeUndefined();
  });

  it('skips (does not emit) a companion whose import path is a package specifier', async () => {
    const result = await companions({ runtimeImportPath: '@acme/manifest-runtime' });
    expect(result.artifacts.some((a) => a.id.startsWith('hono.companions.runtime'))).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'COMPANION_SKIPPED_PACKAGE_PATH')).toBe(true);
    // The always-on auth middleware is still emitted (at both locations).
    expect(byPath(result, 'src/middleware/auth.ts')).toBeDefined();
    expect(byPath(result, 'routes/middleware/auth.ts')).toBeDefined();
  });

  it('produces deterministic output', async () => {
    const a = await companions();
    const b = await companions();
    expect(a.artifacts.map((x) => `${x.id} ${x.pathHint} ${x.code}`)).toEqual(
      b.artifacts.map((x) => `${x.id} ${x.pathHint} ${x.code}`),
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
          framework: 'hono',
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

describe('emitted hono runtime facade executes against the real engine', () => {
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

    const companionResult = projection.generate(ir, { surface: 'hono.companions' });
    const runtimeArtifact = companionResult.artifacts.find(
      (a) => a.pathHint === 'routes/lib/manifest-runtime.ts',
    );
    expect(runtimeArtifact).toBeDefined();

    const routerCode = projection
      .generate(ir, { surface: 'hono.router' })
      .artifacts.map((a) => a.code)
      .join('\n');
    const calledMethods = new Set<string>();
    const callRe = /\bruntime\.(\w+)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = callRe.exec(routerCode)) !== null) calledMethods.add(m[1]);
    expect([...calledMethods].sort()).toEqual(['get', 'list', 'runCommand']);

    const dir = await fs.mkdtemp(join(tmpdir(), 'manifest-hono-companion-'));
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

    for (const method of calledMethods) {
      expect(typeof runtime[method], `facade.${method} exists`).toBe('function');
    }

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
