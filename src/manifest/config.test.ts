/**
 * Tests for the public typed config helper (G1).
 *
 * `defineConfig` is an identity function for editor/type support; the value it
 * returns must be byte-for-byte what was passed in (no normalization, no
 * defaults injected — that would diverge from the loader contract).
 */

import { describe, it, expect } from 'vitest';
import {
  defineConfig,
  resolveProjectionOptions,
  listConfiguredProjectionNames,
  isProjectionMetaKey,
  createUserResolver,
  hasUserResolver,
  getProjectionBlock,
  type ManifestRuntimeConfig,
} from './config';

describe('defineConfig', () => {
  it('returns its argument unchanged (identity)', () => {
    const input: ManifestRuntimeConfig = {
      build: { src: 'modules/**/*.manifest', output: 'ir/' },
    };
    const result = defineConfig(input);
    expect(result).toBe(input);
    expect(result).toEqual(input);
  });

  it('does not inject defaults', () => {
    const result = defineConfig({});
    expect(result).toEqual({});
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('preserves a full runtime config including build hooks/plugins', () => {
    const resolveUser = async () => ({ id: 'u1' });
    const config = defineConfig({
      stores: { Order: { implementation: class {}, prismaModel: 'orders' } },
      resolveUser,
      build: {
        src: '**/*.manifest',
        output: 'ir/',
        projections: { nextjs: { output: 'app/api', options: { authProvider: 'clerk' } } },
        env: { stores: { DATABASE_URL: { name: 'DATABASE_URL', required: true } } },
        hooks: { provider: 'husky', runValidate: true },
        plugins: [{ module: '@acme/manifest-audit', enabled: true }],
      },
    });

    expect(config.resolveUser).toBe(resolveUser);
    expect(config.build?.hooks?.provider).toBe('husky');
    expect(config.build?.plugins?.[0].module).toBe('@acme/manifest-audit');
    expect(getProjectionBlock(config.build?.projections, 'nextjs')?.output).toBe('app/api');
  });
});

describe('projections.enabled / defaults (Config G5)', () => {
  it('isProjectionMetaKey recognizes enabled and defaults only', () => {
    expect(isProjectionMetaKey('enabled')).toBe(true);
    expect(isProjectionMetaKey('defaults')).toBe(true);
    expect(isProjectionMetaKey('nextjs')).toBe(false);
    expect(isProjectionMetaKey('zod')).toBe(false);
  });

  it('listConfiguredProjectionNames returns all non-meta keys when enabled is absent', () => {
    expect(
      listConfiguredProjectionNames({
        defaults: { includeComments: true },
        nextjs: { output: 'app/' },
        zod: { output: 'schemas/' },
      }),
    ).toEqual(['nextjs', 'zod']);
  });

  it('listConfiguredProjectionNames honors projections.enabled order', () => {
    expect(
      listConfiguredProjectionNames({
        enabled: ['zod', 'nextjs'],
        nextjs: { output: 'app/' },
        zod: { output: 'schemas/' },
        prisma: { output: 'schema.prisma' },
      }),
    ).toEqual(['zod', 'nextjs']);
  });

  it('resolveProjectionOptions merges projections.defaults under per-projection options', () => {
    const opts = resolveProjectionOptions(
      {
        projections: {
          defaults: { includeComments: true, indentSize: 2 },
          zod: { options: { indentSize: 4, strict: true } },
        },
      },
      'zod',
    );
    // Exclude internal metadata keys (__manifestRuntime) from assertion
    const { __manifestRuntime, ...userOptions } = opts;
    expect(userOptions).toEqual({
      includeComments: true,
      indentSize: 4,
      strict: true,
    });
  });

  it('resolveProjectionOptions ignores meta keys as projection names', () => {
    const build = {
      projections: {
        defaults: { includeComments: true },
        enabled: ['zod'] as string[],
        zod: { options: { strict: true } },
      },
    };
    expect(resolveProjectionOptions(build, 'enabled')).toEqual({});
    expect(resolveProjectionOptions(build, 'defaults')).toEqual({});
  });
});

describe('resolveProjectionOptions — global naming inheritance', () => {
  it('inherits the global naming default when the projection has none', () => {
    const opts = resolveProjectionOptions(
      { naming: 'snake_case', projections: { prisma: { options: { provider: 'postgresql' } } } },
      'prisma',
    );
    // Exclude internal metadata keys (__manifestRuntime, __manifestNaming) from assertion
    const { __manifestRuntime, __manifestNaming, ...userOptions } = opts;
    expect(userOptions).toEqual({ provider: 'postgresql', naming: 'snake_case' });
  });

  it('lets a per-projection naming override the global default', () => {
    const opts = resolveProjectionOptions(
      {
        naming: 'snake_case',
        projections: { prisma: { options: { naming: { table: 'PascalCase' } } } },
      },
      'prisma',
    );
    expect(opts.naming).toEqual({ table: 'PascalCase' });
  });

  it('returns the projection options untouched when no global naming is set', () => {
    const opts = resolveProjectionOptions(
      { projections: { prisma: { options: { provider: 'mysql' } } } },
      'prisma',
    );
    // Exclude internal metadata keys (__manifestRuntime) from assertion
    const { __manifestRuntime, ...userOptions } = opts;
    expect(userOptions).toEqual({ provider: 'mysql' });
    expect(opts.naming).toBeUndefined();
  });

  it('returns an empty bag (no naming) for an unknown projection with no global', () => {
    // Exclude internal metadata keys (__manifestRuntime) from assertion
    const opts1 = resolveProjectionOptions({}, 'prisma');
    const { __manifestRuntime: _, ...userOpts1 } = opts1;
    expect(userOpts1).toEqual({});

    const opts2 = resolveProjectionOptions(undefined, 'prisma');
    const { __manifestRuntime: __, ...userOpts2 } = opts2;
    expect(userOpts2).toEqual({});
  });

  it('surfaces the global naming even when the projection block is absent', () => {
    const opts = resolveProjectionOptions({ naming: 'snake_case' }, 'prisma');
    // Exclude internal metadata keys (__manifestRuntime, __manifestNaming) from assertion
    const { __manifestRuntime, __manifestNaming, ...userOptions } = opts;
    expect(userOptions).toEqual({
      naming: 'snake_case',
    });
  });

  it('does not mutate the input config', () => {
    const build = { naming: 'snake_case' as const, projections: { prisma: { options: {} } } };
    resolveProjectionOptions(build, 'prisma');
    expect(build.projections.prisma.options).toEqual({});
  });
});

describe('createUserResolver', () => {
  it('returns null when config has no resolveUser', async () => {
    const resolver = createUserResolver(null);
    expect(await resolver({ userId: 'u1' })).toBeNull();
    expect(hasUserResolver(null)).toBe(false);
  });

  it('delegates to config.resolveUser', async () => {
    const config = defineConfig({
      resolveUser: async (auth) => ({ id: String(auth.userId), role: 'admin' }),
    });
    expect(hasUserResolver(config)).toBe(true);
    const resolver = createUserResolver(config);
    expect(await resolver({ userId: 'u42' })).toEqual({ id: 'u42', role: 'admin' });
  });

  it('fail-softs when resolveUser throws', async () => {
    const config = defineConfig({
      resolveUser: async () => {
        throw new Error('boom');
      },
    });
    const resolver = createUserResolver(config);
    expect(await resolver({})).toBeNull();
  });
});
