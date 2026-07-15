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
  createUserResolver,
  hasUserResolver,
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
    expect(config.build?.projections?.nextjs.output).toBe('app/api');
  });
});

describe('resolveProjectionOptions — global naming inheritance', () => {
  it('inherits the global naming default when the projection has none', () => {
    const opts = resolveProjectionOptions(
      { naming: 'snake_case', projections: { prisma: { options: { provider: 'postgresql' } } } },
      'prisma',
    );
    expect(opts).toEqual({ provider: 'postgresql', naming: 'snake_case' });
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
    expect(opts).toEqual({ provider: 'mysql' });
    expect(opts.naming).toBeUndefined();
  });

  it('returns an empty bag (no naming) for an unknown projection with no global', () => {
    expect(resolveProjectionOptions({}, 'prisma')).toEqual({});
    expect(resolveProjectionOptions(undefined, 'prisma')).toEqual({});
  });

  it('surfaces the global naming even when the projection block is absent', () => {
    expect(resolveProjectionOptions({ naming: 'snake_case' }, 'prisma')).toEqual({
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
