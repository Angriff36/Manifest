import { describe, it, expect } from 'vitest';
import { satisfiesSemVerRange, validatePluginShape } from './plugin-loader';
import type { ManifestPlugin } from './plugin-api';

describe('plugin-loader', () => {
  describe('satisfiesSemVerRange', () => {
    it('matches exact version', () => {
      expect(satisfiesSemVerRange('1.0.5', '1.0.5')).toBe(true);
    });

    it('rejects non-matching exact version', () => {
      expect(satisfiesSemVerRange('1.0.5', '1.0.4')).toBe(false);
    });

    it('matches >= operator', () => {
      expect(satisfiesSemVerRange('1.0.5', '>=1.0.0')).toBe(true);
      expect(satisfiesSemVerRange('2.0.0', '>=1.0.0')).toBe(true);
      expect(satisfiesSemVerRange('0.9.0', '>=1.0.0')).toBe(false);
    });

    it('matches < operator', () => {
      expect(satisfiesSemVerRange('1.0.5', '<2.0.0')).toBe(true);
      expect(satisfiesSemVerRange('1.9.9', '<2.0.0')).toBe(true);
      expect(satisfiesSemVerRange('2.0.0', '<2.0.0')).toBe(false);
    });

    it('matches compound range (>=X <Y)', () => {
      expect(satisfiesSemVerRange('1.5.0', '>=1.0.0 <2.0.0')).toBe(true);
      expect(satisfiesSemVerRange('1.0.0', '>=1.0.0 <2.0.0')).toBe(true);
      expect(satisfiesSemVerRange('0.9.0', '>=1.0.0 <2.0.0')).toBe(false);
      expect(satisfiesSemVerRange('2.0.0', '>=1.0.0 <2.0.0')).toBe(false);
    });

    it('matches ^ (caret) range', () => {
      // ^1.2.3 := >=1.2.3 <2.0.0
      expect(satisfiesSemVerRange('1.2.3', '^1.2.3')).toBe(true);
      expect(satisfiesSemVerRange('1.9.9', '^1.2.3')).toBe(true);
      expect(satisfiesSemVerRange('2.0.0', '^1.2.3')).toBe(false);
      expect(satisfiesSemVerRange('1.2.2', '^1.2.3')).toBe(false);
    });

    it('matches ^0.x (caret zero-major) range', () => {
      // ^0.2.3 := >=0.2.3 <0.3.0
      expect(satisfiesSemVerRange('0.2.3', '^0.2.3')).toBe(true);
      expect(satisfiesSemVerRange('0.2.9', '^0.2.3')).toBe(true);
      expect(satisfiesSemVerRange('0.3.0', '^0.2.3')).toBe(false);
    });

    it('matches ~ (tilde) range', () => {
      // ~1.2.3 := >=1.2.3 <1.3.0
      expect(satisfiesSemVerRange('1.2.3', '~1.2.3')).toBe(true);
      expect(satisfiesSemVerRange('1.2.9', '~1.2.3')).toBe(true);
      expect(satisfiesSemVerRange('1.3.0', '~1.2.3')).toBe(false);
      expect(satisfiesSemVerRange('1.2.2', '~1.2.3')).toBe(false);
    });

    it('returns false for invalid version strings', () => {
      expect(satisfiesSemVerRange('not-a-version', '1.0.0')).toBe(false);
    });

    it('returns false for invalid range strings', () => {
      expect(satisfiesSemVerRange('1.0.0', 'not-a-range')).toBe(false);
    });
  });

  describe('validatePluginShape', () => {
    it('accepts valid plugin with default export', () => {
      const plugin: ManifestPlugin = {
        manifest: {
          name: 'test-plugin',
          version: '1.0.0',
          pluginApiVersion: '1',
          manifestVersion: '>=1.0.0',
        },
      };
      const { errors } = validatePluginShape({ default: plugin }, 'test-module');
      expect(errors).toHaveLength(0);
    });

    it('accepts valid plugin without default export', () => {
      const plugin: ManifestPlugin = {
        manifest: {
          name: 'test-plugin',
          version: '1.0.0',
          pluginApiVersion: '1',
          manifestVersion: '>=1.0.0',
        },
      };
      const { errors } = validatePluginShape(plugin, 'test-module');
      expect(errors).toHaveLength(0);
    });

    it('rejects null/undefined', () => {
      const { errors } = validatePluginShape(null, 'test-module');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('did not export an object');
    });

    it('rejects missing manifest', () => {
      const { errors } = validatePluginShape({}, 'test-module');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('missing required "manifest"');
    });

    it('rejects missing manifest.name', () => {
      const { errors } = validatePluginShape(
        {
          manifest: { version: '1.0.0', pluginApiVersion: '1', manifestVersion: '>=1.0.0' },
        },
        'test-module',
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('manifest.name is missing');
    });

    it('rejects missing manifest.version', () => {
      const { errors } = validatePluginShape(
        {
          manifest: { name: 'test', pluginApiVersion: '1', manifestVersion: '>=1.0.0' },
        },
        'test-module',
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('manifest.version is missing');
    });

    it('rejects wrong pluginApiVersion', () => {
      const { errors } = validatePluginShape(
        {
          manifest: {
            name: 'test',
            version: '1.0.0',
            pluginApiVersion: '2',
            manifestVersion: '>=1.0.0',
          },
        },
        'test-module',
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('pluginApiVersion is "2"');
    });
  });
});
