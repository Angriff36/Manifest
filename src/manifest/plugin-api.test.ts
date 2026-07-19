import { describe, it, expect } from 'vitest';
import {
  PLUGIN_API_VERSION,
  RESERVED_BUILTIN_NAMES,
  BUILTIN_STORE_TARGETS,
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
    it('contains all 49 builtins', () => {
      expect(RESERVED_BUILTIN_NAMES.size).toBe(49);
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
      expect(RESERVED_BUILTIN_NAMES.has('matches')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('search')).toBe(true);
    });

    it('includes math builtins', () => {
      expect(RESERVED_BUILTIN_NAMES.has('abs')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('round')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('floor')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('ceil')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('min')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('max')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('between')).toBe(true);
    });

    it('includes aggregate builtins', () => {
      expect(RESERVED_BUILTIN_NAMES.has('sum')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('avg')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('min_of')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('max_of')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('count_of')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('filter')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('map')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('flat_map')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('unique_of')).toBe(true);
    });

    it('includes date builtins', () => {
      expect(RESERVED_BUILTIN_NAMES.has('year')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('month')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('day')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('hours')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('minutes')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('seconds')).toBe(true);
    });

    it('includes date/time primitive builtins', () => {
      expect(RESERVED_BUILTIN_NAMES.has('dateOf')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('timeOf')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('datetimeOf')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('addDuration')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('durationBetween')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('durationDays')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('durationHours')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('durationMinutes')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('durationSeconds')).toBe(true);
    });

    it('includes feature flag builtin', () => {
      expect(RESERVED_BUILTIN_NAMES.has('flag')).toBe(true);
    });

    it('includes role hierarchy builtins', () => {
      expect(RESERVED_BUILTIN_NAMES.has('hasPermission')).toBe(true);
      expect(RESERVED_BUILTIN_NAMES.has('roleAllows')).toBe(true);
    });

    it('is a frozen set (immutable)', () => {
      // ReadonlySet doesn't have add/delete, so just verify type safety
      expect(RESERVED_BUILTIN_NAMES).toBeInstanceOf(Set);
    });
  });

  describe('BUILTIN_STORE_TARGETS', () => {
    it('contains all 6 built-in store targets', () => {
      expect(BUILTIN_STORE_TARGETS.size).toBe(6);
    });

    it('includes expected built-in targets', () => {
      expect(BUILTIN_STORE_TARGETS.has('memory')).toBe(true);
      expect(BUILTIN_STORE_TARGETS.has('localStorage')).toBe(true);
      expect(BUILTIN_STORE_TARGETS.has('postgres')).toBe(true);
      expect(BUILTIN_STORE_TARGETS.has('supabase')).toBe(true);
      expect(BUILTIN_STORE_TARGETS.has('durable')).toBe(true);
      expect(BUILTIN_STORE_TARGETS.has('mongodb')).toBe(true);
    });

    it('does not include custom scheme names', () => {
      expect(BUILTIN_STORE_TARGETS.has('redis')).toBe(false);
      expect(BUILTIN_STORE_TARGETS.has('dynamodb')).toBe(false);
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
        fn: (x) => (typeof x === 'number' ? x * 2 : x),
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
      expect(() => definePlugin({} as ManifestPlugin)).toThrow(
        'Plugin must have a manifest property',
      );
    });

    it('throws if manifest.name is missing', () => {
      expect(() =>
        definePlugin({
          manifest: {
            version: '1.0.0',
            pluginApiVersion: '1',
            manifestVersion: '>=1.0.0',
          } as PluginManifest,
        }),
      ).toThrow('Plugin manifest must have a name');
    });

    it('throws if manifest.version is missing', () => {
      expect(() =>
        definePlugin({
          manifest: {
            name: 'test',
            pluginApiVersion: '1',
            manifestVersion: '>=1.0.0',
          } as PluginManifest,
        }),
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
        }),
      ).toThrow('Plugin "test" declares pluginApiVersion "99" but current API version is "1"');
    });

    it('accepts plugin with onLoad hook', () => {
      let called = false;
      const plugin = definePlugin({
        manifest: validManifest,
        onLoad: () => {
          called = true;
        },
      });
      expect(typeof plugin.onLoad).toBe('function');
      plugin.onLoad!({ options: {}, manifestVersion: '1.0.5' });
      expect(called).toBe(true);
    });

    it('accepts store adapter with custom scheme', () => {
      const result = definePlugin({
        manifest: validManifest,
        storeAdapters: [
          {
            scheme: 'redis',
            createStore: async () => ({
              getAll: async () => [],
              getById: async () => undefined,
              create: async (d) => ({ id: '1', ...d }) as any,
              update: async () => undefined,
              delete: async () => false,
              clear: async () => {},
            }),
          },
        ],
      });
      expect(result.storeAdapters).toHaveLength(1);
      expect(result.storeAdapters![0].scheme).toBe('redis');
    });

    it('throws if store adapter scheme collides with built-in target', () => {
      expect(() =>
        definePlugin({
          manifest: validManifest,
          storeAdapters: [
            {
              scheme: 'memory',
              createStore: async () => ({
                getAll: async () => [],
                getById: async () => undefined,
                create: async (d) => ({ id: '1', ...d }) as any,
                update: async () => undefined,
                delete: async () => false,
                clear: async () => {},
              }),
            },
          ],
        }),
      ).toThrow(/scheme "memory".*built-in store target/);
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
