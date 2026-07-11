/**
 * Cross-projection import-resolution gate — the Workstream 2A acceptance test.
 *
 * "Generated files must not reference missing local modules." For each server
 * projection we walk every surface with a small representative IR, collect all
 * emitted artifacts, and for every LOCAL import specifier (resolved via the
 * shared `resolveLocalImportPathHint`) assert that some emitted artifact lands
 * at the resolved pathHint. Package specifiers (node_modules) are the app's
 * responsibility and are ignored.
 *
 * This is the contract, not a description of the current tree: with
 * `emitCompanions` defaulting to true, a projection whose generated code
 * imports `@/lib/manifest-runtime`, `./manifest-response`, etc. MUST also emit
 * that module. Frameworks still mid-implementation (express/hono/remix/
 * sveltekit companions are being built in parallel) may fail here until their
 * companions land — that failure is the gate working, not a bug in this test.
 * The assertions are deliberately strict; do not weaken them to make an
 * in-progress framework pass.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { compileToIR } from '../ir-compiler';
import { getProjection } from './registry';
import { resolveLocalImportPathHint, type CompanionFramework } from './shared/companions';
import type { IR } from '../ir';
import type { ProjectionResult } from './interface';

// Small but representative program: an entity with id/name (drives read +
// detail routes), a command with a param, and an emitted event (drives command
// routes and event wiring).
const SOURCE = `
  entity Recipe {
    property id: string
    property name: string
    event RecipeCreated
    command create(name: string) {
      mutate result = true
      emit RecipeCreated
    }
  }
`;

let ir: IR;

beforeAll(async () => {
  const compiled = await compileToIR(SOURCE);
  expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  ir = compiled.ir!;
});

/** Strip a TS/JS extension so `foo.ts` and `foo` (import specifier) compare equal. */
function stripExt(pathHint: string): string {
  return pathHint.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
}

/**
 * Extract import specifiers from generated source. The generators emit
 * single-line `import ... from '...'` / `export ... from '...'` / side-effect
 * `import '...'` statements (line-array builders), so line-anchored matching is
 * both sufficient and avoids false matches inside embedded data (e.g. the IR
 * JSON blob in the runtime factory).
 */
function importSpecifiers(code: string): string[] {
  const specs: string[] = [];
  for (const raw of code.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('import') && !line.startsWith('export')) continue;
    const fromMatch = /\bfrom\s+['"]([^'"]+)['"]/.exec(line);
    if (fromMatch) {
      specs.push(fromMatch[1]);
      continue;
    }
    const sideEffectMatch = /^import\s+['"]([^'"]+)['"]/.exec(line);
    if (sideEffectMatch) specs.push(sideEffectMatch[1]);
  }
  return specs;
}

/**
 * Walk every surface of a projection (globally, per entity, and per command)
 * with the given options, collecting all emitted artifacts deduped by id.
 */
function collectArtifacts(
  projectionName: string,
  options: Record<string, unknown>,
): ProjectionResult['artifacts'] {
  const projection = getProjection(projectionName);
  expect(projection, `projection "${projectionName}" is registered`).toBeDefined();

  const seen = new Set<string>();
  const artifacts: ProjectionResult['artifacts'] = [];
  const add = (result: ProjectionResult) => {
    for (const artifact of result.artifacts) {
      if (!seen.has(artifact.id)) {
        seen.add(artifact.id);
        artifacts.push(artifact);
      }
    }
  };

  for (const surface of projection!.surfaces) {
    add(projection!.generate(ir, { surface, options }));
    for (const entity of ir.entities) {
      add(projection!.generate(ir, { surface, entity: entity.name, options }));
      for (const command of ir.commands.filter((c) => c.entity === entity.name)) {
        add(
          projection!.generate(ir, {
            surface,
            entity: entity.name,
            command: command.name,
            options,
          }),
        );
      }
    }
  }

  return artifacts;
}

interface DanglingImport {
  importer: string;
  specifier: string;
  resolvedPathHint: string;
}

/**
 * The core assertion: every local import in every emitted artifact must point
 * at another emitted artifact. Returns the list of dangling imports (empty ⇒
 * the projection's generated output is self-contained w.r.t. local modules).
 */
function findDanglingImports(
  projectionName: string,
  framework: CompanionFramework,
  options: Record<string, unknown>,
): DanglingImport[] {
  const artifacts = collectArtifacts(projectionName, options);
  const emitted = new Set(
    artifacts.filter((a) => a.pathHint).map((a) => stripExt(a.pathHint as string)),
  );

  const dangling: DanglingImport[] = [];
  for (const artifact of artifacts) {
    for (const specifier of importSpecifiers(artifact.code)) {
      // SvelteKit's `./$types` is generated by `svelte-kit sync`, not by any
      // projection — it is a framework artifact, not a companion, so it is not
      // a dangling reference. (The real companions — $lib/server/* — are still
      // checked strictly below.)
      if (specifier === './$types' || specifier.endsWith('/$types')) continue;
      const resolved = resolveLocalImportPathHint(specifier, {
        framework,
        importerPathHint: artifact.pathHint,
      });
      if (resolved === null) continue; // package specifier — the app's job
      if (!emitted.has(stripExt(resolved))) {
        dangling.push({
          importer: artifact.pathHint ?? artifact.id,
          specifier,
          resolvedPathHint: resolved,
        });
      }
    }
  }
  return dangling;
}

describe('cross-projection companion import resolution', () => {
  // nextjs is fully implemented in this workstream and MUST pass every case.
  it('nextjs — default options', () => {
    expect(findDanglingImports('nextjs', 'nextjs', {})).toEqual([]);
  });

  it('nextjs — authProvider: custom (emits the auth companion)', () => {
    expect(findDanglingImports('nextjs', 'nextjs', { authProvider: 'custom' })).toEqual([]);
  });

  it('nextjs — includeTenantFilter: true (emits the tenant + database companions)', () => {
    expect(findDanglingImports('nextjs', 'nextjs', { includeTenantFilter: true })).toEqual([]);
  });

  // The following frameworks' companions are implemented by other agents in
  // parallel. These cases assert the same contract; they may fail until those
  // companions land. Do NOT weaken them.
  it('express — default options', () => {
    expect(findDanglingImports('express', 'express', {})).toEqual([]);
  });

  it('hono — default options', () => {
    expect(findDanglingImports('hono', 'hono', {})).toEqual([]);
  });

  it('remix — default options', () => {
    expect(findDanglingImports('remix', 'remix', {})).toEqual([]);
  });

  it('remix — authProvider: remix-auth', () => {
    expect(findDanglingImports('remix', 'remix', { authProvider: 'remix-auth' })).toEqual([]);
  });

  it('remix — authProvider: custom', () => {
    expect(findDanglingImports('remix', 'remix', { authProvider: 'custom' })).toEqual([]);
  });

  it('sveltekit — default options', () => {
    expect(findDanglingImports('sveltekit', 'sveltekit', {})).toEqual([]);
  });

  it('sveltekit — authProvider: lucia', () => {
    expect(findDanglingImports('sveltekit', 'sveltekit', { authProvider: 'lucia' })).toEqual([]);
  });

  it('sveltekit — authProvider: custom', () => {
    expect(findDanglingImports('sveltekit', 'sveltekit', { authProvider: 'custom' })).toEqual([]);
  });

  // A configured tenantProvider makes the routes import + call its function;
  // the projection must both import it and emit the tenant companion at its
  // (local) import path.
  it('remix — tenantProvider (emits + imports the tenant companion)', () => {
    expect(
      findDanglingImports('remix', 'remix', {
        tenantProvider: {
          importPath: '~/utils/tenant',
          functionName: 'resolveTenantId',
          lookupKey: 'userId',
        },
      }),
    ).toEqual([]);
  });

  it('sveltekit — tenantProvider (emits + imports the tenant companion)', () => {
    expect(
      findDanglingImports('sveltekit', 'sveltekit', {
        tenantProvider: {
          importPath: '$lib/server/tenant',
          functionName: 'resolveTenantId',
          lookupKey: 'userId',
        },
      }),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Webhook surfaces (Workstream 2F): the emitted webhook routes carry a LOCAL
// runtime import (createManifestRuntime for nextjs; createManifestEngine from
// the same companion for hono/express). The module-level `ir` above has no
// webhooks, so the webhook surface stays silent there — these cases exercise a
// webhook-bearing program and assert that local import still resolves to the
// companion the projection emits.
// ---------------------------------------------------------------------------

const WEBHOOK_SOURCE = `
  entity Order {
    property amount: number
    command UpdatePayment(amountPaid: number) {
      mutate amount = amountPaid
    }
  }
  webhook StripePayment "/webhooks/stripe" run Order.UpdatePayment
    transform: {
      amountPaid: payload.amount
    }
`;

describe('cross-projection companion import resolution — webhook surfaces', () => {
  let webhookIr: IR;
  beforeAll(async () => {
    const compiled = await compileToIR(WEBHOOK_SOURCE);
    expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    webhookIr = compiled.ir!;
  });

  /** Walk every surface with the webhook IR and return dangling local imports. */
  function danglingForWebhookIr(
    projectionName: string,
    framework: CompanionFramework,
  ): DanglingImport[] {
    const projection = getProjection(projectionName);
    expect(projection, `projection "${projectionName}" is registered`).toBeDefined();

    const seen = new Set<string>();
    const artifacts: ProjectionResult['artifacts'] = [];
    const add = (result: ProjectionResult) => {
      for (const artifact of result.artifacts) {
        if (!seen.has(artifact.id)) {
          seen.add(artifact.id);
          artifacts.push(artifact);
        }
      }
    };
    for (const surface of projection!.surfaces) {
      add(projection!.generate(webhookIr, { surface, options: {} }));
      for (const entity of webhookIr.entities) {
        add(projection!.generate(webhookIr, { surface, entity: entity.name, options: {} }));
      }
    }

    const emitted = new Set(
      artifacts.filter((a) => a.pathHint).map((a) => stripExt(a.pathHint as string)),
    );
    const dangling: DanglingImport[] = [];
    for (const artifact of artifacts) {
      for (const specifier of importSpecifiers(artifact.code)) {
        const resolved = resolveLocalImportPathHint(specifier, {
          framework,
          importerPathHint: artifact.pathHint,
        });
        if (resolved === null) continue;
        if (!emitted.has(stripExt(resolved))) {
          dangling.push({
            importer: artifact.pathHint ?? artifact.id,
            specifier,
            resolvedPathHint: resolved,
          });
        }
      }
    }
    return dangling;
  }

  it('nextjs webhook route resolves createManifestRuntime to the emitted companion', () => {
    // Sanity: the webhook surface actually emitted a route for this IR.
    const webhookArtifacts = getProjection('nextjs')!.generate(webhookIr, {
      surface: 'nextjs.webhook',
      options: {},
    }).artifacts;
    expect(webhookArtifacts.length).toBeGreaterThan(0);
    expect(danglingForWebhookIr('nextjs', 'nextjs')).toEqual([]);
  });

  it('hono webhook route resolves ./lib/manifest-runtime to the emitted companion', () => {
    const webhookArtifacts = getProjection('hono')!.generate(webhookIr, {
      surface: 'hono.webhooks',
      options: {},
    }).artifacts;
    expect(webhookArtifacts.length).toBeGreaterThan(0);
    expect(danglingForWebhookIr('hono', 'hono')).toEqual([]);
  });

  it('express webhook route resolves ./lib/manifest-runtime to the emitted companion', () => {
    const webhookArtifacts = getProjection('express')!.generate(webhookIr, {
      surface: 'express.webhooks',
      options: {},
    }).artifacts;
    expect(webhookArtifacts.length).toBeGreaterThan(0);
    expect(danglingForWebhookIr('express', 'express')).toEqual([]);
  });
});
