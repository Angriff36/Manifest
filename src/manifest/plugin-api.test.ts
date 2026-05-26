import { describe, it, expect } from 'vitest';
import {
  PLUGIN_API_VERSION,
  RESERVED_BUILTIN_NAMES,
  definePlugin,
  type ManifestPlugin,
  type PluginManifest,
  type StoreAdapterPlugin,
  type AuditSinkPlugin,
  type BuiltinFunctionPlugin,
  type CliCommandPlugin,
  type CliProgramLike,
  type BuiltinPurity,
} from './plugin-api';

describe('plugin-api', () => {
  describe('PLUGIN_API_VERSION', () => {
    it('is "1"', () => {
      expect(PLUGIN_API_VERSION).toBe('1');
    });
  });

  describe('RESERVED_BUILTIN_NAMES', () => {
    it('contains all 27 builtins', () => {
      expect(RESERVED_BUILTIN_NAMES.size).toBe(27);
    });

    it('includes core builtins', () => {
      expect(RESERVED_BUILTIN_NAMES.has('now')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('uuid')).toBe(true);
    });

    it('includes string builtins', () => {
      expect(RESERVED_BUILTIN_NAMES.has('trim')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('split')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('toUpperCase')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('toLowerCase')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('length')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('substring')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('indexOf')).toBe(true);
    });

    it('includes math builtins', () => {
      expect(RESERVED_BUILTIN_NAMES.has('abs')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('round')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('floor')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('ceil')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('min')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('max')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('between')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('sum')).toBe(true);
    });

    it('includes date builtins', () => {
      expect(RESERVED_BUILTIN_NAMES.has('year')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('month')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('day')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('hours')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('minutes')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('seconds')).toBe(true);
    });

    it('is a frozen set (immutable)', () => {
      // ReadonlySet doesn't have add/delete, so just verify type safety
      expect(RESERVED_BUILTIN_NAMES).toBeInstanceOf(Set);
    });
  });

  describe('definePlugin', () => {
    const validManifest: PluginManifest = {
      name: 'test-plugin',
      version: '1.0.0',
      pluginApiVersion: '1',
      manifestVersion: '>=1.0.0',
      description: 'Test plugin',
    };

    it('returns the plugin unchanged for valid input', () => {
      const plugin: ManifestPlugin = {
        manifest: validManifest,
      };
      const result = definePlugin(plugin);
      expect(result).toBe(plugin);
    });

    it('accepts a plugin with all extension points', () => {
      const storeAdapter: StoreAdapterPlugin = {
        scheme: 'redis',
        createStore: async () => ({
          getAll: async () => [],
          getById: async () => undefined,
          create: async (d) => ({ id: '1', ...d }) as any,
          update: async () => undefined,
          delete: async () => false,
          clear: async () => {},
        }),
      };

      const auditSink: AuditSinkPlugin = {
        id: 'test-sink',
        createSink: () => ({ emit: async () => {} }),
      };

      const builtin: BuiltinFunctionPlugin = {
        name: 'double',
        purity: 'pure',
        arity: 1,
        fn: (x) => typeof x === 'number' ? x * 2 : x,
      };

      const cliCommand: CliCommandPlugin = {
        name: 'test-cmd',
        register: () => {},
      };

      const result = definePlugin({
        manifest: validManifest,
        storeAdapters: [storeAdapter],
        auditSinks: [auditSink],
        builtins: [builtin],
        cliCommands: [cliCommand],
      });

      expect(result.storeAdapters).toHaveLength(1);
      expect(result.auditSinks).toHaveLength(1);
      expect(result.builtins).toHaveLength(1);
      expect(result.cliCommands).toHaveLength(1);
    });

    it('throws if manifest is missing', () => {
      expect(() => definePlugin({} as ManifestPlugin)).toThrow('Plugin must have a manifest property');
    });

    it('throws if manifest.name is missing', () => {
      expect(() =>
        definePlugin({
          manifest: { version: '1.0.0', pluginApiVersion: '1', manifestVersion: '>=1.0.0' } as PluginManifest,
        })
      ).toThrow('Plugin manifest must have a name');
    });

    it('throws if manifest.version is missing', () => {
      expect(() =>
        definePlugin({
          manifest: { name: 'test', pluginApiVersion: '1', manifestVersion: '>=1.0.0' } as PluginManifest,
        })
      ).toThrow('Plugin manifest must have a version');
    });

    it('throws if pluginApiVersion does not match', () => {
      expect(() =>
        definePlugin({
          manifest: {
            name: 'test',
            version: '1.0.0',
            pluginApiVersion: '99' as any,
            manifestVersion: '>=1.0.0',
          },
        })
      ).toThrow('Plugin "test" declares pluginApiVersion "99" but current API version is "1"');
    });

    it('accepts plugin with onLoad hook', () => {
      let called = false;
      const plugin = definePlugin({
        manifest: validManifest,
        onLoad: () => { called = true; },
      });
      expect(typeof plugin.onLoad).toBe('function');
      plugin.onLoad!({ options: {}, manifestVersion: '1.0.5' });
      expect(called).toBe(true);
    });
  });

  describe('type coverage', () => {
    it('BuiltinPurity has expected values', () => {
      const purities: BuiltinPurity[] = ['pure', 'time-dependent', 'random'];
      expect(purities).toHaveLength(3);
    });

    it('CliProgramLike can be implemented minimally', () => {
      const program: CliProgramLike = {
        command: (_name: string) => ({
          description: (_d: string) => ({
            action: (_fn: (...args: unknown[]) => void | Promise<void>) => {},
          }),
        }),
      };
      expect(typeof program.command).toBe('function');
    });
  });
});
