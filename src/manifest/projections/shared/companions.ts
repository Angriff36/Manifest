/**
 * Framework-neutral helpers for emitting the "companion" modules that generated
 * server code imports but the projections themselves never wrote — the runtime
 * factory (`createManifestRuntime`), the HTTP envelope helpers, the database
 * client, and auth/tenant shims. Historically these had to be hand-authored;
 * emitting them closes the "generated code doesn't compile out of the box" gap
 * (docs/internal/plans/2026-07-01-docs-feature-reconciliation-audit.md,
 * Cluster A).
 *
 * This module is consumed by every server projection (Next.js, Express, Hono,
 * Remix, SvelteKit), so it stays framework-neutral: the two exports below take
 * only the import specifier / IR and return strings or pathHints. Per-framework
 * decisions (which companions to emit, what NextResponse vs. json to use) live
 * in each projection's generator.
 */

import type { IR } from '../../ir';

/**
 * Server frameworks that consume companion modules. Passed to
 * `resolveLocalImportPathHint` so call sites are self-documenting and so future
 * per-framework resolution can key off it without a signature change.
 */
export type CompanionFramework = 'nextjs' | 'express' | 'hono' | 'remix' | 'sveltekit';

/** Context for resolving where a local import specifier's module must be emitted. */
export interface ResolveImportPathContext {
  /** The framework whose generated code emits the import (self-documenting). */
  framework: CompanionFramework;
  /**
   * pathHint of the module doing the importing. Required only to resolve
   * relative specifiers (`./x`, `../x`); ignored for alias specifiers.
   */
  importerPathHint?: string;
}

/** Append `.ts` unless the path already carries a TS/JS extension. */
function withTsExtension(pathWithoutExt: string): string {
  if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(pathWithoutExt)) return pathWithoutExt;
  return `${pathWithoutExt}.ts`;
}

/** POSIX dirname over a `/`-separated pathHint (no filesystem access). */
function posixDirname(pathHint: string): string {
  const idx = pathHint.lastIndexOf('/');
  return idx < 0 ? '' : pathHint.slice(0, idx);
}

/**
 * Resolve a relative specifier (`./x`, `../x`) against a base directory,
 * collapsing `.` and `..` segments. Pure string math — no `path` module so the
 * result is OS-independent (pathHints are always POSIX-style).
 */
function resolveRelative(baseDir: string, relative: string): string {
  const segments: string[] = baseDir ? baseDir.split('/').filter(Boolean) : [];
  for (const part of relative.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (segments.length > 0) segments.pop();
      continue;
    }
    segments.push(part);
  }
  return segments.join('/');
}

/**
 * Map a LOCAL import specifier to the artifact pathHint (relative to the
 * projection's output directory) where the corresponding module must be
 * emitted. Returns `null` for package specifiers — those resolve from
 * node_modules and are the app's responsibility, never emitted.
 *
 * Alias rules (recognized regardless of `framework`, so a shared emitter can
 * resolve any framework's specifiers):
 *   - `@/x`     → `x.ts`          (Next.js root alias; the `@/` prefix — a slash
 *                                  as the second char — distinguishes it from a
 *                                  scoped package like `@scope/pkg`)
 *   - `~/x`     → `app/x.ts`      (Remix root alias)
 *   - `$lib/x`  → `src/lib/x.ts`  (SvelteKit `$lib` alias)
 *   - `./x` / `../x` → resolved against `dirname(importerPathHint)`, `.ts` appended
 *   - anything else (bare or scoped package) → `null`
 */
export function resolveLocalImportPathHint(
  importSpecifier: string,
  { importerPathHint }: ResolveImportPathContext,
): string | null {
  // Next.js root alias. `@/` (slash as second char) is an alias; `@scope/pkg`
  // is a package and falls through to the null return below.
  if (importSpecifier.startsWith('@/')) {
    const rest = importSpecifier.slice('@/'.length);
    return rest ? withTsExtension(rest) : null;
  }

  // SvelteKit `$lib` alias → `src/lib/...`.
  if (importSpecifier.startsWith('$lib/')) {
    const rest = importSpecifier.slice('$lib/'.length);
    return rest ? withTsExtension(`src/lib/${rest}`) : null;
  }

  // Remix root alias → `app/...`.
  if (importSpecifier.startsWith('~/')) {
    const rest = importSpecifier.slice('~/'.length);
    return rest ? withTsExtension(`app/${rest}`) : null;
  }

  // Relative specifier: resolve against the importer's directory.
  if (importSpecifier.startsWith('./') || importSpecifier.startsWith('../')) {
    const baseDir = importerPathHint ? posixDirname(importerPathHint) : '';
    return withTsExtension(resolveRelative(baseDir, importSpecifier));
  }

  // Bare or scoped package specifier — not an emitted companion.
  return null;
}

/** Input to {@link generateRuntimeFactoryModule}. */
export interface RuntimeFactoryModuleInput {
  /** Compiled IR embedded verbatim (deterministically) into the module. */
  ir: IR;
  /**
   * Optional import specifier for the app's `manifest.config` (default export,
   * `ManifestRuntimeConfig` shape). When provided, the factory composes a
   * `storeProvider` from `config.stores` and a `createUserResolver` from
   * `config.resolveUser` (mirrors `@angriff36/manifest/config` + CLI utils).
   * When omitted (the zero-config default), the engine uses its built-in
   * stores (memory, localStorage) so a config-free project still runs.
   */
  runtimeConfigImport?: string;
  /**
   * Name of the exported factory function. Defaults to `createManifestRuntime`.
   * Projections that expose a `runtimeFactoryName` option (sveltekit, express,
   * hono) MUST pass it here so the emitted export name matches the name their
   * generated routes import.
   */
  exportName?: string;
}

/**
 * Emit the `createManifestRuntime` factory module — the single file every
 * server projection imports but none previously generated. The IR is embedded
 * as JSON (deterministic; identical IR yields identical output), and the module
 * depends only on the `@angriff36/manifest` root export, so it type-checks in a
 * downstream app with just that package installed.
 *
 * The engine's IR / context / options types are recovered via
 * `ConstructorParameters<typeof RuntimeEngine>` rather than named type imports,
 * so no type-only subpath (which may not exist in the package `exports` map)
 * needs to resolve in the app.
 */
export function generateRuntimeFactoryModule(input: RuntimeFactoryModuleInput): string {
  const { ir, runtimeConfigImport, exportName = 'createManifestRuntime' } = input;
  const durableStores = ir.stores.filter(
    (store) => !['memory', 'localStorage'].includes(store.target),
  );
  const durableStoreSummary = durableStores
    .map((store) => `${store.entity} (${store.target})`)
    .join(', ');
  const irJson = JSON.stringify(ir, null, 2);

  const lines: string[] = [];
  lines.push('// Auto-generated Manifest runtime factory.');
  lines.push('// DO NOT EDIT — generated by the Manifest projection (companions surface).');
  lines.push('//');
  lines.push('// Builds a RuntimeEngine from the embedded IR. Writes MUST flow through');
  lines.push('// runtime.runCommand() so guards, policies, and constraints are enforced.');
  lines.push('');
  lines.push('import { RuntimeEngine } from "@angriff36/manifest";');
  if (runtimeConfigImport) {
    lines.push(`import manifestConfig from ${JSON.stringify(runtimeConfigImport)};`);
  }
  lines.push('');
  lines.push('type ManifestIR = ConstructorParameters<typeof RuntimeEngine>[0];');
  lines.push('type ManifestContext = NonNullable<ConstructorParameters<typeof RuntimeEngine>[1]>;');
  if (runtimeConfigImport) {
    lines.push(
      'type ManifestOptions = NonNullable<ConstructorParameters<typeof RuntimeEngine>[2]>;',
    );
    lines.push('type StoreProvider = NonNullable<ManifestOptions["storeProvider"]>;');
    lines.push('type Store = NonNullable<ReturnType<StoreProvider>>;');
    lines.push('');
    lines.push('interface RuntimeConfigLike {');
    lines.push('  stores?: Record<string, { implementation: unknown }>;');
    lines.push(
      '  resolveUser?: (auth: Record<string, unknown>) => Promise<Record<string, unknown> | null>;',
    );
    lines.push('}');
  }
  lines.push('');
  lines.push(`const ir = ${irJson} as unknown as ManifestIR;`);
  lines.push('');

  if (runtimeConfigImport) {
    lines.push('// Mirrors createStoreProvider from @angriff36/manifest (CLI utils): resolves a');
    lines.push('// per-entity Store from config.stores, accepting a class, a factory function,');
    lines.push('// or a ready-made instance. Cached per entity name.');
    lines.push(
      'function createStoreProvider(config: RuntimeConfigLike | undefined): StoreProvider {',
    );
    lines.push('  const cache = new Map<string, Store>();');
    lines.push('  return (entityName: string): Store | undefined => {');
    lines.push('    const cached = cache.get(entityName);');
    lines.push('    if (cached) return cached;');
    lines.push('    const binding = config?.stores?.[entityName];');
    lines.push('    if (!binding) return undefined;');
    lines.push('    const implementation = binding.implementation;');
    lines.push('    let store: Store | undefined;');
    lines.push('    if (typeof implementation === "function") {');
    lines.push('      try {');
    lines.push('        store = new (implementation as new () => Store)();');
    lines.push('      } catch {');
    lines.push('        try {');
    lines.push('          store = (implementation as () => Store)();');
    lines.push('        } catch {');
    lines.push('          return undefined;');
    lines.push('        }');
    lines.push('      }');
    lines.push('    } else if (typeof implementation === "object" && implementation !== null) {');
    lines.push('      store = implementation as Store;');
    lines.push('    }');
    lines.push('    if (store) cache.set(entityName, store);');
    lines.push('    return store;');
    lines.push('  };');
    lines.push('}');
    lines.push('');
    lines.push('// Mirrors createUserResolver from @angriff36/manifest/config: fail-soft');
    lines.push('// wrapper around config.resolveUser (errors → null).');
    lines.push(
      'function createUserResolver(config: RuntimeConfigLike | undefined): (auth: Record<string, unknown>) => Promise<Record<string, unknown> | null> {',
    );
    lines.push('  const resolveUser = config?.resolveUser;');
    lines.push('  if (typeof resolveUser !== "function") {');
    lines.push('    return async () => null;');
    lines.push('  }');
    lines.push('  return async (auth) => {');
    lines.push('    try {');
    lines.push('      return await resolveUser(auth);');
    lines.push('    } catch (error) {');
    lines.push(
      '      console.error("Failed to resolve user:", error instanceof Error ? error.message : error);',
    );
    lines.push('      return null;');
    lines.push('    }');
    lines.push('  };');
    lines.push('}');
    lines.push('');
    lines.push('const storeProvider = createStoreProvider(');
    lines.push('  manifestConfig as unknown as RuntimeConfigLike | undefined,');
    lines.push(');');
    lines.push('const resolveUser = createUserResolver(');
    lines.push('  manifestConfig as unknown as RuntimeConfigLike | undefined,');
    lines.push(');');
    lines.push('');
    lines.push(`export async function ${exportName}(`);
    lines.push('  context: ManifestContext = {},');
    lines.push('  auth?: Record<string, unknown>,');
    lines.push('): Promise<RuntimeEngine> {');
    lines.push('  let resolvedContext: ManifestContext = context;');
    lines.push(
      '  if (typeof (manifestConfig as RuntimeConfigLike | undefined)?.resolveUser === "function") {',
    );
    lines.push('    const authInput = auth ?? {');
    lines.push(
      '      userId: (context as { actorId?: string }).actorId ?? (context as { user?: { id?: string } }).user?.id,',
    );
    lines.push('    };');
    lines.push('    const user = await resolveUser(authInput);');
    lines.push('    if (user && typeof user === "object") {');
    lines.push('      const userRecord = user as { id?: string; tenantId?: string };');
    lines.push('      resolvedContext = {');
    lines.push('        ...context,');
    lines.push('        user: { ...(context as { user?: object }).user, ...user },');
    lines.push('        actorId: (context as { actorId?: string }).actorId ?? userRecord.id,');
    lines.push(
      '        tenantId: (context as { tenantId?: string }).tenantId ?? userRecord.tenantId,',
    );
    lines.push('      } as ManifestContext;');
    lines.push('    }');
    lines.push('  }');
    lines.push('  return new RuntimeEngine(ir, resolvedContext, { storeProvider });');
    lines.push('}');
  } else {
    lines.push(`export async function ${exportName}(`);
    lines.push('  context: ManifestContext = {},');
    lines.push('): Promise<RuntimeEngine> {');
    if (durableStores.length > 0) {
      lines.push(
        `  throw new Error(${JSON.stringify(`A storeProvider is required for durable stores: ${durableStoreSummary}. Configure runtimeConfigImport; zero-config runtime creation is fail-closed.`)});`,
      );
    } else {
      lines.push('  return new RuntimeEngine(ir, context);');
    }
    lines.push('}');
  }
  lines.push('');

  return lines.join('\n');
}
