/**
 * Configuration management for Manifest CLI
 *
 * Handles loading, creating, and validating manifest.config.yaml
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

export interface ManifestConfig {
  $schema?: string;
  src?: string;
  output?: string;

  projections?: {
    nextjs?: {
      output?: string;
      options?: {
        authProvider?: string;
        authImportPath?: string;
        databaseImportPath?: string;
        runtimeImportPath?: string;
        responseImportPath?: string;
        includeTenantFilter?: boolean;
        includeSoftDeleteFilter?: boolean;
        tenantIdProperty?: string;
        deletedAtProperty?: string;
        appDir?: string;
      };
    };
  };

  dev?: {
    port?: number;
    watch?: boolean;
  };

  test?: {
    coverage?: boolean;
  };
}

const DEFAULT_CONFIG: ManifestConfig = {
  $schema: 'https://manifest.dev/config.schema.json',
  src: 'modules/**/*.manifest',
  output: 'ir/',
  projections: {
    nextjs: {
      output: 'app/api/',
      options: {
        authProvider: 'clerk',
        authImportPath: '@/lib/auth',
        databaseImportPath: '@/lib/database',
        runtimeImportPath: '@/lib/manifest-runtime',
        responseImportPath: '@/lib/manifest-response',
        includeTenantFilter: true,
        includeSoftDeleteFilter: true,
        tenantIdProperty: 'tenantId',
        deletedAtProperty: 'deletedAt',
        appDir: 'app',
      },
    },
  },
  dev: {
    port: 5173,
    watch: true,
  },
  test: {
    coverage: true,
  },
};

const CONFIG_PATHS = [
  'manifest.config.yaml',
  'manifest.config.yml',
  '.manifestrc.yaml',
  '.manifestrc.yml',
];

/**
 * Find and load the config file
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<ManifestConfig | null> {
  for (const configFile of CONFIG_PATHS) {
    const configPath = path.resolve(cwd, configFile);
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config = yaml.load(content) as ManifestConfig;
      return config;
    } catch (error) {
      // File doesn't exist or can't be read - try next one
      continue;
    }
  }

  return null;
}

/**
 * Get config with defaults applied
 */
export async function getConfig(cwd: string = process.cwd()): Promise<ManifestConfig> {
  const userConfig = await loadConfig(cwd);
  return mergeConfig(DEFAULT_CONFIG, userConfig);
}

/**
 * Merge user config with defaults
 */
function mergeConfig(defaults: ManifestConfig, user: ManifestConfig | null): ManifestConfig {
  if (!user) {
    return defaults;
  }

  return {
    ...defaults,
    ...user,
    projections: {
      ...defaults.projections,
      ...user.projections,
      nextjs: {
        ...defaults.projections?.nextjs,
        ...user.projections?.nextjs,
        options: {
          ...defaults.projections?.nextjs?.options,
          ...user.projections?.nextjs?.options,
        },
      },
    },
    dev: {
      ...defaults.dev,
      ...user.dev,
    },
    test: {
      ...defaults.test,
      ...user.test,
    },
  };
}

/**
 * Save config to file
 */
export async function saveConfig(
  config: ManifestConfig,
  cwd: string = process.cwd()
): Promise<void> {
  const configPath = path.resolve(cwd, 'manifest.config.yaml');
  const yamlContent = yaml.dump(config, {
    indent: 2,
    lineWidth: 120,
    quotingType: '"',
    forceQuotes: false,
  });
  await fs.writeFile(configPath, yamlContent, 'utf-8');
}

/**
 * Check if config exists
 */
export async function configExists(cwd: string = process.cwd()): Promise<boolean> {
  return (await loadConfig(cwd)) !== null;
}

/**
 * Get Next.js projection options from config
 */
export async function getNextJsOptions(cwd: string = process.cwd()): Promise<{
  authProvider: string;
  authImportPath: string;
  databaseImportPath: string;
  runtimeImportPath: string;
  responseImportPath: string;
  includeTenantFilter: boolean;
  includeSoftDeleteFilter: boolean;
  tenantIdProperty: string;
  deletedAtProperty: string;
  appDir: string;
}> {
  const config = await getConfig(cwd);
  const nextjsConfig = config.projections?.nextjs;
  const options = nextjsConfig?.options || {};

  return {
    authProvider: options.authProvider || 'clerk',
    authImportPath: options.authImportPath || '@/lib/auth',
    databaseImportPath: options.databaseImportPath || '@/lib/database',
    runtimeImportPath: options.runtimeImportPath || '@/lib/manifest-runtime',
    responseImportPath: options.responseImportPath || '@/lib/manifest-response',
    includeTenantFilter: options.includeTenantFilter ?? true,
    includeSoftDeleteFilter: options.includeSoftDeleteFilter ?? true,
    tenantIdProperty: options.tenantIdProperty || 'tenantId',
    deletedAtProperty: options.deletedAtProperty || 'deletedAt',
    appDir: options.appDir || 'app',
  };
}

/**
 * Get output paths from config
 */
export async function getOutputPaths(cwd: string = process.cwd()): Promise<{
  irOutput: string;
  codeOutput: string;
}> {
  const config = await getConfig(cwd);

  return {
    irOutput: config.output || 'ir/',
    codeOutput: config.projections?.nextjs?.output || 'app/api/',
  };
}
