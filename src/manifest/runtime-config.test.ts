/**
 * Unit tests for Config G7 runtime build config.
 */

import { describe, expect, it } from 'vitest';
import { resolveProjectionOptions } from './config.js';
import {
  MANIFEST_RUNTIME_BAG_KEY,
  applyRuntimeConfigToProjectionOptions,
  resolveRuntimeConfig,
  resolveRuntimeFactoryFanIn,
} from './runtime-config.js';

describe('resolveRuntimeConfig', () => {
  it('defaults to inline + non-deterministic', () => {
    expect(resolveRuntimeConfig(undefined)).toEqual({
      executionMode: 'inline',
      deterministicMode: false,
      storesPath: undefined,
      forbidWallClock: false,
      seed: undefined,
      defaultContext: undefined,
      maxParallelCommands: undefined,
    });
  });

  it('honors executionMode, determinism, stores, defaultContext, and concurrency', () => {
    expect(
      resolveRuntimeConfig({
        executionMode: 'externalExecutor',
        determinism: { deterministicMode: true, forbidWallClock: true, seed: 42 },
        stores: './manifest.config',
        defaultContext: { source: 'api' },
        concurrency: { maxParallelCommands: 8 },
      }),
    ).toEqual({
      executionMode: 'externalExecutor',
      deterministicMode: true,
      storesPath: './manifest.config',
      forbidWallClock: true,
      seed: 42,
      defaultContext: { source: 'api' },
      maxParallelCommands: 8,
    });
  });

  it('ignores non-positive maxParallelCommands', () => {
    expect(
      resolveRuntimeConfig({ concurrency: { maxParallelCommands: 0 } }).maxParallelCommands,
    ).toBeUndefined();
  });
});

describe('applyRuntimeConfigToProjectionOptions', () => {
  it('injects __manifestRuntime meta for any projection', () => {
    const bag: Record<string, unknown> = {};
    applyRuntimeConfigToProjectionOptions(
      { determinism: { deterministicMode: true } },
      'express',
      bag,
    );
    expect(bag[MANIFEST_RUNTIME_BAG_KEY]).toMatchObject({
      executionMode: 'inline',
      deterministicMode: true,
      forbidWallClock: false,
    });
    expect(bag.dispatcher).toBeUndefined();
  });

  it('sets nextjs dispatcher.executionMode when unset', () => {
    const bag: Record<string, unknown> = {};
    applyRuntimeConfigToProjectionOptions(
      { executionMode: 'externalExecutor' },
      'nextjs',
      bag,
    );
    expect(bag.dispatcher).toEqual({ executionMode: 'externalExecutor' });
  });

  it('does not override explicit nextjs dispatcher.executionMode', () => {
    const bag: Record<string, unknown> = {
      dispatcher: { executionMode: 'inline', enabled: true },
    };
    applyRuntimeConfigToProjectionOptions(
      { executionMode: 'externalExecutor' },
      'nextjs',
      bag,
    );
    expect(bag.dispatcher).toEqual({ executionMode: 'inline', enabled: true });
  });

  it('fans stores into runtimeConfigImport for web projections', () => {
    for (const name of ['nextjs', 'express', 'hono', 'remix', 'sveltekit'] as const) {
      const bag: Record<string, unknown> = {};
      applyRuntimeConfigToProjectionOptions({ stores: '../../manifest.config' }, name, bag);
      expect(bag.runtimeConfigImport).toBe('../../manifest.config');
    }
  });

  it('does not override explicit runtimeConfigImport', () => {
    const bag: Record<string, unknown> = { runtimeConfigImport: './keep-me' };
    applyRuntimeConfigToProjectionOptions({ stores: './other' }, 'express', bag);
    expect(bag.runtimeConfigImport).toBe('./keep-me');
  });
});

describe('resolveRuntimeFactoryFanIn', () => {
  it('reads determinism + defaultContext from bag meta', () => {
    const bag: Record<string, unknown> = {};
    applyRuntimeConfigToProjectionOptions(
      {
        determinism: { deterministicMode: true, forbidWallClock: true, seed: 7 },
        stores: './cfg',
        defaultContext: { source: 'api' },
      },
      'express',
      bag,
    );
    expect(resolveRuntimeFactoryFanIn(bag)).toEqual({
      deterministicMode: true,
      runtimeConfigImport: './cfg',
      forbidWallClock: true,
      seed: 7,
      defaultContext: { source: 'api' },
      maxParallelCommands: undefined,
    });
  });

  it('fans concurrency.maxParallelCommands into factory fan-in', () => {
    const bag: Record<string, unknown> = {};
    applyRuntimeConfigToProjectionOptions(
      { concurrency: { maxParallelCommands: 3 } },
      'express',
      bag,
    );
    expect(resolveRuntimeFactoryFanIn(bag).maxParallelCommands).toBe(3);
  });
});

describe('resolveProjectionOptions + runtime', () => {
  it('fans runtime into nextjs options via resolveProjectionOptions', () => {
    const bag = resolveProjectionOptions(
      {
        runtime: {
          executionMode: 'externalExecutor',
          determinism: { deterministicMode: true },
          stores: './manifest.config',
        },
      },
      'nextjs',
    );
    expect(bag[MANIFEST_RUNTIME_BAG_KEY]).toMatchObject({
      executionMode: 'externalExecutor',
      deterministicMode: true,
      storesPath: './manifest.config',
    });
    expect(bag.dispatcher).toEqual({ executionMode: 'externalExecutor' });
    expect(bag.runtimeConfigImport).toBe('./manifest.config');
  });
});
