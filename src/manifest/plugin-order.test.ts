/**
 * Unit tests for Config G9 plugin order + capability helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizePluginCapabilities,
  sortPluginDeclarations,
  PLUGIN_CAPABILITY_KINDS,
} from './plugin-order';
import { loadPlugins } from './plugin-loader';
import { fileURLToPath } from 'node:url';

const FIXTURE_PLUGIN = fileURLToPath(
  new URL('./__fixtures__/manifest-plugin-fixture.mjs', import.meta.url),
);

describe('sortPluginDeclarations', () => {
  it('orders by order ascending then module name', () => {
    const sorted = sortPluginDeclarations([
      { module: 'z-late', order: 10 },
      { module: 'a-first', order: 1 },
      { module: 'b-mid', order: 5 },
    ]);
    expect(sorted.map((d) => d.module)).toEqual(['a-first', 'b-mid', 'z-late']);
  });

  it('places unordered modules after ordered ones, sorted by module', () => {
    const sorted = sortPluginDeclarations([
      { module: 'unordered-b' },
      { module: 'ordered', order: 0 },
      { module: 'unordered-a' },
    ]);
    expect(sorted.map((d) => d.module)).toEqual([
      'ordered',
      'unordered-a',
      'unordered-b',
    ]);
  });

  it('does not mutate the input array', () => {
    const input = [{ module: 'b', order: 2 }, { module: 'a', order: 1 }];
    const copy = [...input];
    sortPluginDeclarations(input);
    expect(input).toEqual(copy);
  });
});

describe('normalizePluginCapabilities', () => {
  it('dedupes and lists unknown tags', () => {
    const result = normalizePluginCapabilities([
      'storeAdapter',
      'storeAdapter',
      'customHost',
      '  ',
    ]);
    expect(result.capabilities).toEqual(['storeAdapter', 'customHost']);
    expect(result.unknown).toEqual(['customHost']);
  });

  it('knows the standard capability kinds', () => {
    expect(PLUGIN_CAPABILITY_KINDS).toContain('projection');
    expect(normalizePluginCapabilities([...PLUGIN_CAPABILITY_KINDS]).unknown).toEqual([]);
  });
});

describe('loadPlugins Config G9', () => {
  it('records loadOrder and declaredCapabilities for a successful load', async () => {
    const registries = await loadPlugins(
      [
        {
          module: FIXTURE_PLUGIN,
          order: 1,
          capabilities: ['storeAdapter', 'builtin'],
        },
      ],
      { manifestVersion: '1.0.0' },
    );
    expect(registries.loadedPlugins).toHaveLength(1);
    expect(registries.loadOrder).toEqual([FIXTURE_PLUGIN]);
    expect(registries.declaredCapabilities.get('manifest-plugin-fixture')).toEqual([
      'storeAdapter',
      'builtin',
    ]);
  });
});
