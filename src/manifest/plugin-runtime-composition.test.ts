/**
 * Runtime activation of config-declared plugins.
 *
 * Proves the documented seam: `loadPlugins` → `pluginRegistriesToRuntimeOptions`
 * → `new RuntimeEngine(ir, ctx, options)`. A plugin's custom builtin becomes
 * callable from a computed expression, and its custom store scheme resolves to
 * the plugin's Store. Also proves graceful degradation when a declaration fails.
 *
 * The fixture plugin (src/manifest/__fixtures__/manifest-plugin-fixture.mjs)
 * contributes: builtin `double`, store adapter scheme `redis`, audit sink
 * `fixture-audit`, and a CLI command (exercised by the CLI activation test).
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadPlugins, pluginRegistriesToRuntimeOptions } from './plugin-loader';
import { RuntimeEngine } from './runtime-engine';
import { IRCompiler } from './ir-compiler';
import type { IR } from './ir';

const FIXTURE_PLUGIN = fileURLToPath(
  new URL('./__fixtures__/manifest-plugin-fixture.mjs', import.meta.url),
);

const GADGET_SOURCE = `entity Gadget {
  property required id: string
  property value: number = 0
  computed doubled: number = double(self.value)
}

store Gadget in redis
`;

async function compileToIR(source: string): Promise<IR> {
  const result = await new IRCompiler().compileToIR(source);
  if (!result.ir) {
    throw new Error(`Compilation failed: ${result.diagnostics.map((d) => d.message).join(', ')}`);
  }
  return result.ir;
}

describe('plugin runtime composition', () => {
  it('loads the fixture plugin and reports its contributions', async () => {
    const registries = await loadPlugins([{ module: FIXTURE_PLUGIN }], {
      manifestVersion: '1.0.0',
    });

    expect(registries.loadedPlugins).toHaveLength(1);
    expect(registries.loadedPlugins[0].manifest.name).toBe('manifest-plugin-fixture');
    expect(registries.builtins.has('double')).toBe(true);
    expect([...registries.auditSinkFactories.keys()]).toEqual(['fixture-audit']);
    expect(registries.cliCommands.map((c) => c.command.name)).toEqual(['greet']);
    // Success is reported as an info diagnostic; there are no errors.
    expect(registries.diagnostics.some((d) => d.severity === 'error')).toBe(false);
  });

  it('wires the plugin builtin and store scheme into a RuntimeEngine', async () => {
    const registries = await loadPlugins([{ module: FIXTURE_PLUGIN }], {
      manifestVersion: '1.0.0',
    });
    const ir = await compileToIR(GADGET_SOURCE);

    const runtimeOptions = await pluginRegistriesToRuntimeOptions(registries, {
      stores: ir.stores,
    });
    expect(runtimeOptions.customBuiltins?.has('double')).toBe(true);
    expect(typeof runtimeOptions.storeProvider).toBe('function');
    expect(runtimeOptions.auditSink).toBeDefined();

    const engine = new RuntimeEngine(ir, {}, runtimeOptions);

    // The custom `redis` scheme resolves to the plugin's Store (tagged id).
    const store = engine.getStore('Gadget');
    expect(store).toBeDefined();
    const instance = await store!.create({ value: 21 });
    expect(String(instance.id)).toMatch(/^redis-Gadget-/);

    // The plugin builtin `double` is callable from the computed expression.
    const doubled = await engine.evaluateComputed('Gadget', String(instance.id), 'doubled');
    expect(doubled).toBe(42);
  });

  it('omits storeProvider when no store schemes are supplied', async () => {
    const registries = await loadPlugins([{ module: FIXTURE_PLUGIN }], {
      manifestVersion: '1.0.0',
    });
    const runtimeOptions = await pluginRegistriesToRuntimeOptions(registries);
    expect(runtimeOptions.storeProvider).toBeUndefined();
    // Builtins still compose without any IR context.
    expect(runtimeOptions.customBuiltins?.has('double')).toBe(true);
  });

  it('degrades gracefully when a declaration fails to load', async () => {
    const missing = fileURLToPath(new URL('./__fixtures__/does-not-exist.mjs', import.meta.url));
    const registries = await loadPlugins([{ module: missing }], { manifestVersion: '1.0.0' });

    expect(registries.loadedPlugins).toHaveLength(0);
    const errors = registries.diagnostics.filter((d) => d.severity === 'error');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/Failed to load plugin/);
  });
});
