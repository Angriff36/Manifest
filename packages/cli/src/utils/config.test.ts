/**
 * Tests for configuration management
 *
 * Tests YAML, JavaScript, and TypeScript config loading with proper precedence.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';
import {
  loadConfig,
  loadAllConfigs,
  getConfig,
  getRuntimeConfig,
  saveConfig,
  configExists,
  getActiveConfigPath,
  getNextJsOptions,
  getOutputPaths,
  type ManifestConfig,
  type ManifestRuntimeConfig,
} from './config.js';

describe('Config Loader', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'manifest-config-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('YAML Config', () => {
    it('should load manifest.config.yaml', async () => {
      const config: ManifestConfig = {
        src: 'src/**/*.manifest',
        output: 'dist/ir/',
      };
      await fs.writeFile(
        path.join(tempDir, 'manifest.config.yaml'),
        `src: src/**/*.manifest
output: dist/ir/`
      );

      const loaded = await loadConfig(tempDir);
      expect(loaded).toEqual(config);
    });

    it('should load manifest.config.yml', async () => {
      const config: ManifestConfig = {
        src: 'custom/*.manifest',
      };
      await fs.writeFile(
        path.join(tempDir, 'manifest.config.yml'),
        `src: custom/*.manifest`
      );

      const loaded = await loadConfig(tempDir);
      expect(loaded).toEqual(config);
    });

    it('should return null when no config exists', async () => {
      const loaded = await loadConfig(tempDir);
      expect(loaded).toBeNull();
    });

    it('should load projections from YAML', async () => {
      await fs.writeFile(
        path.join(tempDir, 'manifest.config.yaml'),
        `projections:
  nextjs:
    output: generated/
    options:
      authProvider: clerk
      includeTenantFilter: true`
      );

      const loaded = await loadConfig(tempDir);
      expect(loaded?.projections?.nextjs).toEqual({
        output: 'generated/',
        options: {
          authProvider: 'clerk',
          includeTenantFilter: true,
        },
      });
    });
  });

  describe('getConfig with defaults', () => {
    it('should apply defaults when no config exists', async () => {
      const config = await getConfig(tempDir);
      expect(config.src).toBe('**/*.manifest');
      expect(config.output).toBe('ir/');
    });

    it('should merge user config with defaults', async () => {
      await fs.writeFile(
        path.join(tempDir, 'manifest.config.yaml'),
        `src: custom/**/*.manifest`
      );

      const config = await getConfig(tempDir);
      expect(config.src).toBe('custom/**/*.manifest');
      expect(config.output).toBe('ir/'); // default
    });
  });

  describe('saveConfig', () => {
    it('should save config to YAML file', async () => {
      const config: ManifestConfig = {
        src: 'test/*.manifest',
        output: 'test-output/',
      };

      await saveConfig(config, tempDir);

      const content = await fs.readFile(path.join(tempDir, 'manifest.config.yaml'), 'utf-8');
      expect(content).toContain('src: test/*.manifest');
      expect(content).toContain('output: test-output/');
    });
  });

  describe('configExists', () => {
    it('should return false when no config exists', async () => {
      const exists = await configExists(tempDir);
      expect(exists).toBe(false);
    });

    it('should return true for YAML config', async () => {
      await fs.writeFile(path.join(tempDir, 'manifest.config.yaml'), 'src: test');
      const exists = await configExists(tempDir);
      expect(exists).toBe(true);
    });

    it('should return true for TypeScript config', async () => {
      await fs.writeFile(path.join(tempDir, 'manifest.config.ts'), 'export default {}');
      const exists = await configExists(tempDir);
      expect(exists).toBe(true);
    });

    it('should return true for JavaScript config', async () => {
      await fs.writeFile(path.join(tempDir, 'manifest.config.js'), 'export default {}');
      const exists = await configExists(tempDir);
      expect(exists).toBe(true);
    });
  });

  describe('getActiveConfigPath', () => {
    it('should return null when no config exists', async () => {
      const activePath = await getActiveConfigPath(tempDir);
      expect(activePath).toBeNull();
    });

    it('should return YAML config path', async () => {
      await fs.writeFile(path.join(tempDir, 'manifest.config.yaml'), 'src: test');
      const activePath = await getActiveConfigPath(tempDir);
      expect(activePath).toBe(path.join(tempDir, 'manifest.config.yaml'));
    });

    it('should prefer TypeScript over YAML', async () => {
      await fs.writeFile(path.join(tempDir, 'manifest.config.yaml'), 'src: test');
      await fs.writeFile(path.join(tempDir, 'manifest.config.ts'), 'export default {}');

      const activePath = await getActiveConfigPath(tempDir);
      expect(activePath).toBe(path.join(tempDir, 'manifest.config.ts'));
    });

    it('should prefer TypeScript over JavaScript', async () => {
      await fs.writeFile(path.join(tempDir, 'manifest.config.js'), 'export default {}');
      await fs.writeFile(path.join(tempDir, 'manifest.config.ts'), 'export default {}');

      const activePath = await getActiveConfigPath(tempDir);
      expect(activePath).toBe(path.join(tempDir, 'manifest.config.ts'));
    });

    it('should prefer JavaScript over YAML', async () => {
      await fs.writeFile(path.join(tempDir, 'manifest.config.yaml'), 'src: test');
      await fs.writeFile(path.join(tempDir, 'manifest.config.js'), 'export default {}');

      const activePath = await getActiveConfigPath(tempDir);
      expect(activePath).toBe(path.join(tempDir, 'manifest.config.js'));
    });
  });

  describe('loadAllConfigs', () => {
    it('should load combined config with defaults', async () => {
      const { build, runtime } = await loadAllConfigs(tempDir);

      expect(build.src).toBe('**/*.manifest');
      expect(build.output).toBe('ir/');
      expect(runtime).toBeNull();
    });

    it('should load YAML build config', async () => {
      await fs.writeFile(
        path.join(tempDir, 'manifest.config.yaml'),
        `src: yaml/*.manifest
output: yaml-ir/`
      );

      const { build, runtime } = await loadAllConfigs(tempDir);

      expect(build.src).toBe('yaml/*.manifest');
      expect(build.output).toBe('yaml-ir/');
      expect(runtime).toBeNull();
    });

    it('should load TypeScript runtime config', async () => {
      await fs.writeFile(
        path.join(tempDir, 'manifest.config.ts'),
        `export default {
  stores: {
    User: { implementation: class MockStore {} }
  }
}`
      );

      const { build, runtime } = await loadAllConfigs(tempDir);

      expect(runtime).not.toBeNull();
      expect(runtime?.stores).toBeDefined();
      expect(runtime?.stores?.User).toBeDefined();
    });

    it('should merge build config from TS with YAML', async () => {
      await fs.writeFile(
        path.join(tempDir, 'manifest.config.yaml'),
        `src: yaml/*.manifest
output: yaml-ir/`
      );

      await fs.writeFile(
        path.join(tempDir, 'manifest.config.ts'),
        `export default {
  build: {
    output: 'ts-ir/'
  },
  stores: {}
}`
      );

      const { build } = await loadAllConfigs(tempDir);

      // TS build.output should override YAML output
      expect(build.src).toBe('yaml/*.manifest'); // from YAML
      expect(build.output).toBe('ts-ir/'); // from TS (takes precedence)
    });

    it('should load resolveUser function from TS config', async () => {
      await fs.writeFile(
        path.join(tempDir, 'manifest.config.ts'),
        `export default {
  resolveUser: async (auth) => {
    return { id: auth.userId || 'test-user' };
  }
}`
      );

      const runtime = await getRuntimeConfig(tempDir);

      expect(runtime).not.toBeNull();
      expect(typeof runtime?.resolveUser).toBe('function');

      // Test that the function works
      const user = await runtime?.resolveUser?.({ userId: 'user-123' });
      expect(user).toEqual({ id: 'user-123' });
    });
  });

  describe('getNextJsOptions', () => {
    it('should return defaults when no config exists', async () => {
      const options = await getNextJsOptions(tempDir);

      expect(options.authProvider).toBe('clerk');
      expect(options.includeTenantFilter).toBe(true);
      expect(options.tenantIdProperty).toBe('tenantId');
    });

    it('should load options from YAML projections', async () => {
      await fs.writeFile(
        path.join(tempDir, 'manifest.config.yaml'),
        `projections:
  nextjs:
    options:
      authProvider: nextauth
      includeTenantFilter: false
      tenantIdProperty: orgId`
      );

      const options = await getNextJsOptions(tempDir);

      expect(options.authProvider).toBe('nextauth');
      expect(options.includeTenantFilter).toBe(false);
      expect(options.tenantIdProperty).toBe('orgId');
    });
  });

  describe('getOutputPaths', () => {
    it('should return defaults when no config exists', async () => {
      const paths = await getOutputPaths(tempDir);

      expect(paths.irOutput).toBe('ir/');
      expect(paths.codeOutput).toBe('generated/');
    });

    it('should load paths from config', async () => {
      await fs.writeFile(
        path.join(tempDir, 'manifest.config.yaml'),
        `output: custom-ir/
projections:
  nextjs:
    output: custom-generated/`
      );

      const paths = await getOutputPaths(tempDir);

      expect(paths.irOutput).toBe('custom-ir/');
      expect(paths.codeOutput).toBe('custom-generated/');
    });
  });

  describe('TypeScript config with store bindings', () => {
    it('should load store bindings with prismaModel', async () => {
      await fs.writeFile(
        path.join(tempDir, 'manifest.config.ts'),
        `export default {
  stores: {
    User: {
      implementation: class UserStore {},
      prismaModel: 'User'
    },
    Order: {
      implementation: class OrderStore {},
      prismaModel: 'orders',
      propertyMapping: {
        orderNumber: 'order_number'
      }
    }
  }
}`
      );

      const runtime = await getRuntimeConfig(tempDir);

      expect(runtime?.stores?.User?.prismaModel).toBe('User');
      expect(runtime?.stores?.Order?.prismaModel).toBe('orders');
      expect(runtime?.stores?.Order?.propertyMapping).toEqual({
        orderNumber: 'order_number',
      });
    });

    it('should handle ESM default export', async () => {
      await fs.writeFile(
        path.join(tempDir, 'manifest.config.js'),
        `export default {
  stores: {
    Test: { implementation: {} }
  }
}`
      );

      const runtime = await getRuntimeConfig(tempDir);
      expect(runtime?.stores?.Test).toBeDefined();
    });

    it('should handle CommonJS module.exports', async () => {
      await fs.writeFile(
        path.join(tempDir, 'manifest.config.js'),
        `module.exports = {
  stores: {
    Test: { implementation: {} }
  }
}`
      );

      const runtime = await getRuntimeConfig(tempDir);
      expect(runtime?.stores?.Test).toBeDefined();
    });
  });

  describe('Config precedence', () => {
    it('TS build config should override YAML', async () => {
      await fs.writeFile(
        path.join(tempDir, 'manifest.config.yaml'),
        `src: yaml/*.manifest
output: yaml/`
      );

      await fs.writeFile(
        path.join(tempDir, 'manifest.config.ts'),
        `export default {
  build: {
    src: 'ts/*.manifest',
    output: 'ts/'
  }
}`
      );

      const { build } = await loadAllConfigs(tempDir);

      expect(build.src).toBe('ts/*.manifest');
      expect(build.output).toBe('ts/');
    });

    it('should still load runtime config from TS even when using YAML for build', async () => {
      await fs.writeFile(
        path.join(tempDir, 'manifest.config.yaml'),
        `src: yaml/*.manifest`
      );

      await fs.writeFile(
        path.join(tempDir, 'manifest.config.ts'),
        `export default {
  stores: {
    User: { implementation: {} }
  }
}`
      );

      const { build, runtime } = await loadAllConfigs(tempDir);

      // Build comes from YAML
      expect(build.src).toBe('yaml/*.manifest');
      // Runtime comes from TS
      expect(runtime?.stores?.User).toBeDefined();
    });
  });
});
