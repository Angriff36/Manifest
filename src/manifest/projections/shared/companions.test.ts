/**
 * Unit tests for the framework-neutral companion helpers.
 *
 * `resolveLocalImportPathHint` decides where a local import specifier's module
 * must be emitted (and returns null for packages). These edge cases pin the
 * alias contract every server projection relies on.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveLocalImportPathHint,
  generateRuntimeFactoryModule,
  type CompanionFramework,
} from './companions';
import type { IR } from '../../ir';

describe('resolveLocalImportPathHint', () => {
  const ctx = (framework: CompanionFramework, importerPathHint?: string) => ({
    framework,
    importerPathHint,
  });

  it('maps the Next.js "@/" root alias to a root-relative .ts pathHint', () => {
    expect(resolveLocalImportPathHint('@/lib/manifest-runtime', ctx('nextjs'))).toBe(
      'lib/manifest-runtime.ts',
    );
    expect(resolveLocalImportPathHint('@/lib/manifest-response', ctx('nextjs'))).toBe(
      'lib/manifest-response.ts',
    );
    expect(resolveLocalImportPathHint('@/app/lib/tenant', ctx('nextjs'))).toBe('app/lib/tenant.ts');
  });

  it('treats a scoped package ("@scope/pkg") as a package, not the "@/" alias', () => {
    expect(resolveLocalImportPathHint('@clerk/nextjs', ctx('nextjs'))).toBeNull();
    expect(resolveLocalImportPathHint('@angriff36/manifest', ctx('nextjs'))).toBeNull();
    expect(resolveLocalImportPathHint('@scope/pkg', ctx('nextjs'))).toBeNull();
  });

  it('returns null for bare package specifiers', () => {
    expect(resolveLocalImportPathHint('next-auth', ctx('nextjs'))).toBeNull();
    expect(resolveLocalImportPathHint('next/server', ctx('nextjs'))).toBeNull();
    expect(resolveLocalImportPathHint('@prisma/client', ctx('nextjs'))).toBeNull();
  });

  it('maps the SvelteKit "$lib" alias under src/lib', () => {
    expect(resolveLocalImportPathHint('$lib/server/auth', ctx('sveltekit'))).toBe(
      'src/lib/server/auth.ts',
    );
  });

  it('maps the Remix "~/" alias under app/', () => {
    expect(resolveLocalImportPathHint('~/utils/auth.server', ctx('remix'))).toBe(
      'app/utils/auth.server.ts',
    );
  });

  it('resolves relative specifiers against the importer directory', () => {
    const importer = 'app/api/manifest/[entity]/commands/[command]/route.ts';
    expect(resolveLocalImportPathHint('./helpers', ctx('nextjs', importer))).toBe(
      'app/api/manifest/[entity]/commands/[command]/helpers.ts',
    );
    expect(resolveLocalImportPathHint('../shared/env', ctx('nextjs', importer))).toBe(
      'app/api/manifest/[entity]/commands/shared/env.ts',
    );
  });

  it('collapses multiple ".." segments when resolving relative specifiers', () => {
    expect(resolveLocalImportPathHint('../../lib/db', ctx('hono', 'a/b/c/route.ts'))).toBe(
      'a/lib/db.ts',
    );
  });

  it('resolves relative specifiers against the root when no importer is given', () => {
    expect(resolveLocalImportPathHint('./manifest-response', ctx('nextjs'))).toBe(
      'manifest-response.ts',
    );
  });

  it('does not double-append an extension already present', () => {
    expect(resolveLocalImportPathHint('@/lib/db.ts', ctx('nextjs'))).toBe('lib/db.ts');
    expect(resolveLocalImportPathHint('~/utils/auth.server', ctx('remix'))).toBe(
      'app/utils/auth.server.ts',
    );
  });
});

describe('generateRuntimeFactoryModule', () => {
  const tinyIR = {
    version: '1.0',
    provenance: {
      contentHash: 'test-hash',
      compilerVersion: 'test',
      schemaVersion: '1.0',
      compiledAt: '2025-01-01T00:00:00.000Z',
    },
    modules: [],
    values: [],
    entities: [
      {
        name: 'Widget',
        properties: [
          { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        ],
        computedProperties: [],
        relationships: [],
        commands: [],
        constraints: [],
        policies: [],
      },
    ],
    enums: [],
    stores: [{ entity: 'Widget', target: 'memory', config: {} }],
    events: [],
    commands: [],
    policies: [],
  } as unknown as IR;

  it('emits a zero-config factory importing RuntimeEngine and embedding the IR', () => {
    const code = generateRuntimeFactoryModule({ ir: tinyIR });
    expect(code).toContain('import { RuntimeEngine } from "@angriff36/manifest";');
    expect(code).toContain('export async function createManifestRuntime(');
    expect(code).toContain('return new RuntimeEngine(ir, context);');
    // IR is embedded verbatim.
    expect(code).toContain('"name": "Widget"');
    // No config import in the zero-config path.
    expect(code).not.toContain('import manifestConfig');
    expect(code).not.toContain('storeProvider');
  });

  it('composes a storeProvider from config when runtimeConfigImport is set', () => {
    const code = generateRuntimeFactoryModule({
      ir: tinyIR,
      runtimeConfigImport: '../../manifest.config',
    });
    expect(code).toContain('import manifestConfig from "../../manifest.config";');
    expect(code).toContain('function createStoreProvider(config: RuntimeConfigLike | undefined)');
    expect(code).toContain('function createUserResolver(config: RuntimeConfigLike | undefined)');
    expect(code).toContain('return new RuntimeEngine(ir, resolvedContext, { storeProvider });');
  });

  it('invokes config.resolveUser when present (auth or context-derived)', () => {
    const code = generateRuntimeFactoryModule({
      ir: tinyIR,
      runtimeConfigImport: '../../manifest.config',
    });
    expect(code).toContain('auth?: Record<string, unknown>');
    expect(code).toContain('const user = await resolveUser(authInput);');
    expect(code).toContain('resolvedContext = {');
  });

  it('fails closed during generation for durable IR without runtime configuration', () => {
    const durableIR = {
      ...tinyIR,
      stores: [{ entity: 'Widget', target: 'postgres', config: {} }],
    } as unknown as IR;
    const code = generateRuntimeFactoryModule({ ir: durableIR });
    expect(code).toMatch(/throw new Error\(.*storeProvider.*Widget.*postgres/i);
  });

  it('is deterministic — identical IR yields identical output', () => {
    expect(generateRuntimeFactoryModule({ ir: tinyIR })).toBe(
      generateRuntimeFactoryModule({ ir: tinyIR }),
    );
  });

  it('Config G7 — emits deterministicMode on zero-config and config-import factories', () => {
    const zero = generateRuntimeFactoryModule({ ir: tinyIR, deterministicMode: true });
    expect(zero).toContain('return new RuntimeEngine(ir, context, { deterministicMode: true });');

    const withConfig = generateRuntimeFactoryModule({
      ir: tinyIR,
      runtimeConfigImport: '../../manifest.config',
      deterministicMode: true,
    });
    expect(withConfig).toContain(
      'return new RuntimeEngine(ir, resolvedContext, { storeProvider, deterministicMode: true });',
    );
  });

  it('Config G7 — emits now/generateId and defaultContext merge', () => {
    const code = generateRuntimeFactoryModule({
      ir: tinyIR,
      forbidWallClock: true,
      seed: 42,
      defaultContext: { source: 'api' },
    });
    expect(code).toContain('const now = () => 42;');
    expect(code).toContain('const generateId = () => "id-42-" + String(++__manifestIdSeq);');
    expect(code).toContain('"source":"api"');
    expect(code).toContain('now, generateId');
  });

  it('Config G7 — emits maxParallelCommands on the factory', () => {
    const code = generateRuntimeFactoryModule({
      ir: tinyIR,
      maxParallelCommands: 4,
    });
    expect(code).toContain(
      'return new RuntimeEngine(ir, context, { maxParallelCommands: 4 });',
    );
  });
});
