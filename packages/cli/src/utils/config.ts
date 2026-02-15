/**
 * Configuration management for Manifest CLI
 *
 * Handles loading, creating, and validating manifest.config.yaml and manifest.config.ts
 *
 * Config precedence: manifest.config.ts > manifest.config.js > manifest.config.yaml
 *
 * YAML config: Build-level settings (src, output, projections)
 * TS/JS config: Runtime bindings (stores, resolveUser)
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Build-level configuration (YAML-based)
 *
 * These settings control compilation and code generation.
 */
export interface ManifestConfig {
  $schema?: string;
  src?: string;
  output?: string;

  // Optional: Projection settings for code generation
  projections?: Record<string, {
    output?: string;
    options?: Record<string, unknown>;
  }>;
}

/**
 * Store binding configuration for an entity
 */
export interface StoreBinding {
  /** Store implementation class or factory function */
  implementation: unknown;
  /** Optional: Prisma model name for property alignment checks */
  prismaModel?: string;
  /** Optional: Property mapping (manifest property -> database column) */
  propertyMapping?: Record<string, string>;
}

/**
 * User context resolved from authentication
 */
export interface UserContext {
  id: string;
  role?: string;
  tenantId?: string;
  [key: string]: unknown;
}

/**
 * Authentication context from request
 */
export interface AuthContext {
  userId?: string;
  claims?: Record<string, unknown>;
  headers?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Runtime-level configuration (TypeScript-based)
 *
 * These settings control store bindings and user resolution at runtime.
 */
export interface ManifestRuntimeConfig {
  /**
   * Store implementation bindings per entity
   *
   * Example:
   * ```ts
   * stores: {
   *   User: { implementation: PrismaUserStore, prismaModel: 'User' },
   *   Order: { implementation: PrismaOrderStore, prismaModel: 'orders' },
   * }
   * ```
   */
  stores?: Record<string, StoreBinding>;

  /**
   * User resolution function
   *
   * Called by generated routes to extract user context from authentication.
   * This eliminates per-route user context boilerplate.
   *
   * Example:
   * ```ts
   * resolveUser: async (auth) => {
   *   const session = await getSession(auth.headers);
   *   return { id: session.userId, role: session.role, tenantId: session.orgId };
   * }
   * ```
   */
  resolveUser?: (auth: AuthContext) => Promise<UserContext | null>;

  /**
   * Build-level settings (shared with YAML config)
   */
  build?: ManifestConfig;
}

/**
 * Combined configuration (build + runtime)
 */
export interface CombinedConfig {
  build: ManifestConfig;
  runtime: ManifestRuntimeConfig | null;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: ManifestConfig = {
  $schema: 'https://manifest.dev/config.schema.json',
  src: '**/*.manifest',
  output: 'ir/',
};

// Config paths in precedence order (highest to lowest)
const TS_CONFIG_PATHS = [
  'manifest.config.ts',
  'manifest.config.js',
];

const YAML_CONFIG_PATHS = [
  'manifest.config.yaml',
  'manifest.config.yml',
  '.manifestrc.yaml',
  '.manifestrc.yml',
];

// All config paths for existence checking
const ALL_CONFIG_PATHS = [...TS_CONFIG_PATHS, ...YAML_CONFIG_PATHS];

// ============================================================================
// YAML Config Loading
// ============================================================================

/**
 * Load YAML configuration file
 */
async function loadYamlConfig(cwd: string): Promise<ManifestConfig | null> {
  for (const configFile of YAML_CONFIG_PATHS) {
    const configPath = path.resolve(cwd, configFile);
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config = yaml.load(content) as ManifestConfig;
      return config;
    } catch {
      // File doesn't exist or can't be read - try next one
      continue;
    }
  }

  return null;
}

// ============================================================================
// TypeScript/JavaScript Config Loading
// ============================================================================

/**
 * Load TypeScript/JavaScript configuration file using jiti
 *
 * jiti provides runtime TypeScript support with caching, making it ideal
 * for config file loading without a build step.
 */
async function loadTsConfig(cwd: string): Promise<ManifestRuntimeConfig | null> {
  for (const configFile of TS_CONFIG_PATHS) {
    const configPath = path.resolve(cwd, configFile);

    try {
      // Check if file exists
      await fs.access(configPath);
    } catch {
      continue;
    }

    try {
      // Use dynamic import with jiti for TS/JS support
      const config = await loadModule(configPath);

      if (config && typeof config === 'object') {
        // Handle both default export and named export
        const runtimeConfig = config.default ?? config;

        if (isValidRuntimeConfig(runtimeConfig)) {
          return runtimeConfig;
        }
      }
    } catch (error) {
      // Provide helpful error message for config loading failures
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load config from ${configFile}: ${message}`);
    }
  }

  return null;
}

/**
 * Load a module dynamically, handling both ESM and CommonJS
 */
async function loadModule(modulePath: string): Promise<unknown> {
  // Try jiti first for TypeScript support
  try {
    const jiti = await import('jiti').then(m => m.default || m);
    const load = jiti(typeof __filename !== 'undefined' ? path.dirname(__filename) : process.cwd(), {
      esmResolve: true,
      interopDefault: true,
      requireCache: false, // Always reload config
    });

    const module = load(modulePath);
    return module;
  } catch {
    // Fall back to dynamic import for ESM
    const url = pathToFileURL(modulePath).href;
    const module = await import(url);
    return module;
  }
}

/**
 * Validate that an object is a valid runtime config
 */
function isValidRuntimeConfig(config: unknown): config is ManifestRuntimeConfig {
  if (!config || typeof config !== 'object') {
    return false;
  }

  const c = config as Record<string, unknown>;

  // At least one of these should be defined for a runtime config
  const hasStores = c.stores && typeof c.stores === 'object';
  const hasResolveUser = typeof c.resolveUser === 'function';
  const hasBuild = c.build && typeof c.build === 'object';

  // Allow empty config objects that just have build settings
  return hasStores || hasResolveUser || hasBuild || Object.keys(c).length === 0;
}

// ============================================================================
// Config Merging
// ============================================================================

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
  };
}

/**
 * Merge build config from runtime config with YAML config
 * Runtime config's build settings take precedence over YAML.
 */
function mergeBuildConfig(
  yamlConfig: ManifestConfig | null,
  runtimeBuildConfig: ManifestConfig | undefined
): ManifestConfig {
  return mergeConfig(
    mergeConfig(DEFAULT_CONFIG, yamlConfig),
    runtimeBuildConfig ?? null
  );
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Find and load all configuration files
 *
 * Returns both build (YAML) and runtime (TS/JS) configs separately.
 */
export async function loadAllConfigs(cwd: string = process.cwd()): Promise<CombinedConfig> {
  const [yamlConfig, tsConfig] = await Promise.all([
    loadYamlConfig(cwd),
    loadTsConfig(cwd),
  ]);

  const build = mergeBuildConfig(yamlConfig, tsConfig?.build);

  return {
    build,
    runtime: tsConfig,
  };
}

/**
 * Load only the YAML configuration (backward compatible)
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<ManifestConfig | null> {
  return loadYamlConfig(cwd);
}

/**
 * Get config with defaults applied (backward compatible)
 *
 * For new code, prefer loadAllConfigs() which includes runtime config.
 */
export async function getConfig(cwd: string = process.cwd()): Promise<ManifestConfig> {
  const userConfig = await loadConfig(cwd);
  return mergeConfig(DEFAULT_CONFIG, userConfig);
}

/**
 * Get the runtime configuration
 */
export async function getRuntimeConfig(cwd: string = process.cwd()): Promise<ManifestRuntimeConfig | null> {
  return loadTsConfig(cwd);
}

/**
 * Save config to YAML file
 *
 * Note: This only saves build-level settings to YAML.
 * Runtime config (TS/JS) must be managed manually.
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
 * Check if any config file exists (YAML or TS/JS)
 */
export async function configExists(cwd: string = process.cwd()): Promise<boolean> {
  for (const configFile of ALL_CONFIG_PATHS) {
    const configPath = path.resolve(cwd, configFile);
    try {
      await fs.access(configPath);
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

/**
 * Check which config file is being used
 */
export async function getActiveConfigPath(cwd: string = process.cwd()): Promise<string | null> {
  for (const configFile of ALL_CONFIG_PATHS) {
    const configPath = path.resolve(cwd, configFile);
    try {
      await fs.access(configPath);
      return configPath;
    } catch {
      continue;
    }
  }

  return null;
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
  const { build } = await loadAllConfigs(cwd);
  const options = build.projections?.nextjs?.options || build.projections?.['nextjs']?.options || {};

  return {
    authProvider: options.authProvider as string || 'clerk',
    authImportPath: options.authImportPath as string || '@/lib/auth',
    databaseImportPath: options.databaseImportPath as string || '@/lib/database',
    runtimeImportPath: options.runtimeImportPath as string || '@/lib/manifest-runtime',
    responseImportPath: options.responseImportPath as string || '@/lib/manifest-response',
    includeTenantFilter: options.includeTenantFilter as boolean ?? true,
    includeSoftDeleteFilter: options.includeSoftDeleteFilter as boolean ?? true,
    tenantIdProperty: options.tenantIdProperty as string || 'tenantId',
    deletedAtProperty: options.deletedAtProperty as string || 'deletedAt',
    appDir: options.appDir as string || 'app',
  };
}

/**
 * Get output paths from config
 */
export async function getOutputPaths(cwd: string = process.cwd()): Promise<{
  irOutput: string;
  codeOutput: string;
}> {
  const { build } = await loadAllConfigs(cwd);

  return {
    irOutput: build.output || 'ir/',
    codeOutput: build.projections?.nextjs?.output || build.projections?.['nextjs']?.output || 'generated/',
  };
}

// ============================================================================
// Store Provider Factory (P2-B)
// ============================================================================

/**
 * Store interface matching runtime-engine.ts
 */
export interface Store {
  getAll(): Promise<unknown[]>;
  getById(id: string): Promise<unknown | undefined>;
  create(data: Partial<unknown>): Promise<unknown>;
  update(id: string, data: Partial<unknown>): Promise<unknown | undefined>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<void>;
}

/**
 * Store provider function type matching runtime-engine.ts RuntimeOptions
 */
export type StoreProvider = (entityName: string) => Store | undefined;

/**
 * Cache for store instances to avoid recreating them on each call
 */
const storeCache = new Map<string, Store>();

/**
 * Create a store provider function from runtime config
 *
 * This enables config-driven store binding for the runtime engine.
 * The returned function can be passed as `storeProvider` option to RuntimeEngine.
 *
 * @example
 * ```typescript
 * // manifest.config.ts
 * export default {
 *   stores: {
 *     User: { implementation: PrismaUserStore },
 *     Order: { implementation: new PostgresStore({ tableName: 'orders' }) },
 *   }
 * }
 *
 * // In your application
 * const config = await getRuntimeConfig();
 * const storeProvider = createStoreProvider(config);
 * const runtime = new RuntimeEngine(ir, context, { storeProvider });
 * ```
 */
export function createStoreProvider(config: ManifestRuntimeConfig | null): StoreProvider {
  // Reset cache when creating a new provider
  storeCache.clear();

  return (entityName: string): Store | undefined => {
    // Check cache first
    const cached = storeCache.get(entityName);
    if (cached) {
      return cached;
    }

    // No config means no custom stores
    if (!config?.stores) {
      return undefined;
    }

    const binding = config.stores[entityName];
    if (!binding) {
      return undefined;
    }

    const { implementation } = binding;

    // Handle different implementation types
    let store: Store | undefined;

    if (typeof implementation === 'function') {
      // It's a constructor or factory function
      try {
        // Try calling as constructor (with new)
        const instance = new (implementation as new () => Store)();
        store = instance as Store;
      } catch {
        // If that fails, try calling as factory function (without new)
        try {
          const instance = (implementation as () => Store)();
          store = instance as Store;
        } catch {
          // If both fail, return undefined
          return undefined;
        }
      }
    } else if (typeof implementation === 'object' && implementation !== null) {
      // It's already an instance
      store = implementation as Store;
    }

    if (store) {
      // Cache for future calls
      storeCache.set(entityName, store);
    }

    return store;
  };
}

/**
 * Clear the store cache (useful for testing)
 */
export function clearStoreCache(): void {
  storeCache.clear();
}

/**
 * Get store bindings info for validation/scanning
 *
 * Returns information about configured stores without instantiating them.
 */
export function getStoreBindingsInfo(config: ManifestRuntimeConfig | null): {
  entityNames: string[];
  hasStore: (entityName: string) => boolean;
  getPrismaModel: (entityName: string) => string | undefined;
  getPropertyMapping: (entityName: string) => Record<string, string> | undefined;
} {
  const entityNames = config?.stores ? Object.keys(config.stores) : [];

  return {
    entityNames,
    hasStore: (entityName: string) => !!(config?.stores?.[entityName]),
    getPrismaModel: (entityName: string) => config?.stores?.[entityName]?.prismaModel,
    getPropertyMapping: (entityName: string) => config?.stores?.[entityName]?.propertyMapping,
  };
}

// ============================================================================
// User Context Resolution (P2-C)
// ============================================================================

/**
 * Create a user resolver function from runtime config
 *
 * This enables config-driven user context resolution for routes and runtime.
 * The returned function wraps the config's resolveUser with error handling.
 *
 * @example
 * ```typescript
 * // manifest.config.ts
 * export default {
 *   resolveUser: async (auth) => {
 *     const session = await getSession(auth.headers);
 *     return { id: session.userId, role: session.role };
 *   }
 * }
 *
 * // In your route handler
 * const resolver = createUserResolver(config);
 * const user = await resolver({ userId: session.user.id, headers: request.headers });
 * const runtime = new RuntimeEngine(ir, { user, ...otherContext });
 * ```
 */
export function createUserResolver(config: ManifestRuntimeConfig | null): (auth: AuthContext) => Promise<UserContext | null> {
  if (!config?.resolveUser) {
    // Return a pass-through resolver that returns null
    return async () => null;
  }

  return async (auth: AuthContext): Promise<UserContext | null> => {
    try {
      return await config.resolveUser!(auth);
    } catch (error) {
      // Log error but don't throw - return null to indicate resolution failure
      console.error('Failed to resolve user:', error instanceof Error ? error.message : error);
      return null;
    }
  };
}

/**
 * Check if a runtime config has user resolution configured
 */
export function hasUserResolver(config: ManifestRuntimeConfig | null): boolean {
  return typeof config?.resolveUser === 'function';
}

// Re-export types for consumers
export type { StoreBinding, UserContext, AuthContext };
