/**
 * Projection descriptor API — Builder-facing contract tests.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  describeProjection,
  getProjectionNames,
  listProjectionDescriptors,
  listProjections,
  UnknownProjectionError,
  validateProjectionInvocation,
} from './registry.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  exports: Record<string, { types?: string; import?: string }>;
};

describe('projection descriptors — registry parity', () => {
  it('gives every registered projection exactly one descriptor', () => {
    const registered = listProjections();
    const descriptors = listProjectionDescriptors();
    expect(descriptors).toHaveLength(registered.length);
    expect(new Set(descriptors.map((d) => d.name)).size).toBe(descriptors.length);
  });

  it('keeps descriptor identifiers synchronized with the registry', () => {
    const registered = new Set(getProjectionNames());
    const described = new Set(listProjectionDescriptors().map((d) => d.name));
    expect(described).toEqual(registered);
  });

  it('requires descriptorMeta on every registered ProjectionTarget', () => {
    for (const p of listProjections()) {
      expect(p.descriptorMeta, `${p.name} missing descriptorMeta`).toBeDefined();
    }
  });
});

describe('projection descriptors — scope examples', () => {
  it('reports convex as aggregate (entity/command not required)', () => {
    const d = describeProjection('convex');
    expect(d.safelyInvokable).toBe(true);
    for (const s of d.surfaces) {
      expect(s.scope).toBe('aggregate');
      expect(s.requiresEntity).toBe(false);
      expect(s.requiresCommand).toBe(false);
    }
  });

  it('reports nextjs entity and command surfaces correctly', () => {
    const d = describeProjection('nextjs');
    expect(d.safelyInvokable).toBe(true);
    const route = d.surfaces.find((s) => s.id === 'nextjs.route')!;
    expect(route.scope).toBe('entity');
    expect(route.requiresEntity).toBe(true);
    const command = d.surfaces.find((s) => s.id === 'nextjs.command')!;
    expect(command.scope).toBe('command');
    expect(command.requiresEntity).toBe(true);
    expect(command.requiresCommand).toBe(true);
    const dispatcher = d.surfaces.find((s) => s.id === 'nextjs.dispatcher')!;
    expect(dispatcher.scope).toBe('aggregate');
    expect(dispatcher.requiresEntity).toBe(false);
  });

  it('reports remix and sveltekit entity/command surfaces', () => {
    const remix = describeProjection('remix');
    expect(remix.surfaces.find((s) => s.id === 'remix.list')!.scope).toBe('entity');
    expect(remix.surfaces.find((s) => s.id === 'remix.command')!.scope).toBe('command');
    expect(remix.surfaces.find((s) => s.id === 'remix.types')!.scope).toBe('aggregate');

    const sk = describeProjection('sveltekit');
    expect(sk.surfaces.find((s) => s.id === 'sveltekit.server')!.scope).toBe('entity');
    expect(sk.surfaces.find((s) => s.id === 'sveltekit.command')!.scope).toBe('command');
    expect(sk.surfaces.find((s) => s.id === 'sveltekit.client')!.scope).toBe('aggregate');
  });

  it('reports materialized-views as configuration-driven', () => {
    const d = describeProjection('materialized-views');
    expect(d.safelyInvokable).toBe(true);
    expect(d.surfaces[0]!.scope).toBe('configuration-driven');
    expect(d.requiredOptions.some((o) => o.name === 'views')).toBe(true);
  });

  it('reports documentation projections (mermaid, llm-context)', () => {
    const mermaid = describeProjection('mermaid');
    expect(mermaid.safelyInvokable).toBe(true);
    expect(mermaid.artifactCategories).toContain('documentation');
    const er = mermaid.surfaces.find((s) => s.id === 'mermaid.er')!;
    expect(er.scope).toBe('aggregate');

    const llm = describeProjection('llm-context');
    expect(llm.safelyInvokable).toBe(true);
    expect(llm.surfaces.every((s) => s.scope === 'aggregate')).toBe(true);
    expect(llm.artifactCategories).toContain('documentation');
  });
});

describe('projection descriptors — options and invocation safety', () => {
  it('reports required options and validates them', () => {
    const d = describeProjection('materialized-views');
    expect(d.requiredOptions.map((o) => o.name)).toContain('views');

    const missing = validateProjectionInvocation('materialized-views', {
      surface: 'materialized-views.ddl',
      options: {},
    });
    expect(missing.ok).toBe(false);
    expect(missing.blockers.join(' ')).toMatch(/views/);

    const ok = validateProjectionInvocation('materialized-views', {
      surface: 'materialized-views.ddl',
      options: {
        views: [{ name: 'v', source: 'Order', columns: {} }],
      },
    });
    expect(ok.ok).toBe(true);
  });

  it('blocks unsafe invocation when required scope is missing', () => {
    const result = validateProjectionInvocation('nextjs', {
      surface: 'nextjs.route',
    });
    expect(result.ok).toBe(false);
    expect(result.blockers.join(' ')).toMatch(/entity/i);
  });

  it('blocks invocation when the descriptor is not safely invokable', () => {
    const unresolved = listProjectionDescriptors().find((d) => !d.safelyInvokable);
    expect(unresolved).toBeDefined();
    const result = validateProjectionInvocation(unresolved!.name, {
      surface: unresolved!.surfaceIds[0]!,
    });
    expect(result.ok).toBe(false);
    expect(result.blockers.join(' ')).toMatch(/not safely invokable/);
  });
});

describe('projection descriptors — capabilities connection', () => {
  it('connects capability-map information truthfully for convex', () => {
    const d = describeProjection('convex');
    expect(d.capabilities.declared).toBe(true);
    expect(d.capabilities.supported.length).toBeGreaterThan(0);
    const target = listProjections().find((p) => p.name === 'convex')!;
    expect(
      d.capabilities.supported.length +
        d.capabilities.partial.length +
        d.capabilities.unsupported.length,
    ).toBe(target.capabilities!.length);
  });

  it('marks undeclared capability matrices as declared:false', () => {
    const undeclared = listProjections().find((p) => p.capabilities === undefined);
    expect(undeclared).toBeDefined();
    const d = describeProjection(undeclared!.name);
    expect(d.capabilities.declared).toBe(false);
    expect(d.capabilities.supported).toEqual([]);
  });
});

describe('projection descriptors — unknown lookup', () => {
  it('fails clearly for unknown projection names', () => {
    expect(() => describeProjection('no-such-projection')).toThrow(UnknownProjectionError);
    try {
      describeProjection('no-such-projection');
    } catch (e) {
      const err = e as UnknownProjectionError;
      expect(err.code).toBe('UNKNOWN_PROJECTION');
      expect(err.projectionName).toBe('no-such-projection');
      expect(err.message).toMatch(/listProjectionDescriptors|listProjections/);
    }
  });
});

describe('projection descriptors — public package exports', () => {
  it('exposes descriptor API from the ./projections package export map', () => {
    const entry = pkg.exports['./projections'];
    expect(entry.types).toBe('./dist/manifest/projections/registry.d.ts');
    expect(entry.import).toBe('./dist/manifest/projections/registry.js');
  });

  it('is importable from the source module used to build the export', async () => {
    // Source path mirrors language-metadata-export.test.ts — avoids stale dist
    // during typecheck while still proving the public symbols exist.
    const mod = await import('./registry.js');
    expect(typeof mod.describeProjection).toBe('function');
    expect(typeof mod.listProjectionDescriptors).toBe('function');
    expect(typeof mod.validateProjectionInvocation).toBe('function');
    expect(mod.UnknownProjectionError).toBe(UnknownProjectionError);
    const d = mod.describeProjection('zod');
    expect(d.name).toBe('zod');
    expect(d.surfaceIds.length).toBeGreaterThan(0);
  });
});
