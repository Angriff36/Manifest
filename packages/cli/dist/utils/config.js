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
import { pathToFileURL } from 'url';
// ============================================================================
// Constants
// ============================================================================
const DEFAULT_CONFIG = {
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
async function loadYamlConfig(cwd) {
    for (const configFile of YAML_CONFIG_PATHS) {
        const configPath = path.resolve(cwd, configFile);
        try {
            const content = await fs.readFile(configPath, 'utf-8');
            const config = yaml.load(content);
            return config;
        }
        catch {
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
async function loadTsConfig(cwd) {
    for (const configFile of TS_CONFIG_PATHS) {
        const configPath = path.resolve(cwd, configFile);
        try {
            // Check if file exists
            await fs.access(configPath);
        }
        catch {
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
        }
        catch (error) {
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
async function loadModule(modulePath) {
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
    }
    catch {
        // Fall back to dynamic import for ESM
        const url = pathToFileURL(modulePath).href;
        const module = await import(url);
        return module;
    }
}
/**
 * Validate that an object is a valid runtime config
 */
function isValidRuntimeConfig(config) {
    if (!config || typeof config !== 'object') {
        return false;
    }
    const c = config;
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
function mergeConfig(defaults, user) {
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
function mergeBuildConfig(yamlConfig, runtimeBuildConfig) {
    return mergeConfig(mergeConfig(DEFAULT_CONFIG, yamlConfig), runtimeBuildConfig ?? null);
}
// ============================================================================
// Public API
// ============================================================================
/**
 * Find and load all configuration files
 *
 * Returns both build (YAML) and runtime (TS/JS) configs separately.
 */
export async function loadAllConfigs(cwd = process.cwd()) {
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
export async function loadConfig(cwd = process.cwd()) {
    return loadYamlConfig(cwd);
}
/**
 * Get config with defaults applied (backward compatible)
 *
 * For new code, prefer loadAllConfigs() which includes runtime config.
 */
export async function getConfig(cwd = process.cwd()) {
    const userConfig = await loadConfig(cwd);
    return mergeConfig(DEFAULT_CONFIG, userConfig);
}
/**
 * Get the runtime configuration
 */
export async function getRuntimeConfig(cwd = process.cwd()) {
    return loadTsConfig(cwd);
}
/**
 * Save config to YAML file
 *
 * Note: This only saves build-level settings to YAML.
 * Runtime config (TS/JS) must be managed manually.
 */
export async function saveConfig(config, cwd = process.cwd()) {
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
export async function configExists(cwd = process.cwd()) {
    for (const configFile of ALL_CONFIG_PATHS) {
        const configPath = path.resolve(cwd, configFile);
        try {
            await fs.access(configPath);
            return true;
        }
        catch {
            continue;
        }
    }
    return false;
}
/**
 * Check which config file is being used
 */
export async function getActiveConfigPath(cwd = process.cwd()) {
    for (const configFile of ALL_CONFIG_PATHS) {
        const configPath = path.resolve(cwd, configFile);
        try {
            await fs.access(configPath);
            return configPath;
        }
        catch {
            continue;
        }
    }
    return null;
}
/**
 * Get Next.js projection options from config
 */
export async function getNextJsOptions(cwd = process.cwd()) {
    const { build } = await loadAllConfigs(cwd);
    const options = build.projections?.nextjs?.options || build.projections?.['nextjs']?.options || {};
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
export async function getOutputPaths(cwd = process.cwd()) {
    const { build } = await loadAllConfigs(cwd);
    return {
        irOutput: build.output || 'ir/',
        codeOutput: build.projections?.nextjs?.output || build.projections?.['nextjs']?.output || 'generated/',
    };
}
/**
 * Cache for store instances to avoid recreating them on each call
 */
const storeCache = new Map();
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
export function createStoreProvider(config) {
    // Reset cache when creating a new provider
    storeCache.clear();
    return (entityName) => {
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
        let store;
        if (typeof implementation === 'function') {
            // It's a constructor or factory function
            try {
                // Try calling as constructor (with new)
                const instance = new implementation();
                store = instance;
            }
            catch {
                // If that fails, try calling as factory function (without new)
                try {
                    const instance = implementation();
                    store = instance;
                }
                catch {
                    // If both fail, return undefined
                    return undefined;
                }
            }
        }
        else if (typeof implementation === 'object' && implementation !== null) {
            // It's already an instance
            store = implementation;
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
export function clearStoreCache() {
    storeCache.clear();
}
/**
 * Get store bindings info for validation/scanning
 *
 * Returns information about configured stores without instantiating them.
 */
export function getStoreBindingsInfo(config) {
    const entityNames = config?.stores ? Object.keys(config.stores) : [];
    return {
        entityNames,
        hasStore: (entityName) => !!(config?.stores?.[entityName]),
        getPrismaModel: (entityName) => config?.stores?.[entityName]?.prismaModel,
        getPropertyMapping: (entityName) => config?.stores?.[entityName]?.propertyMapping,
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
export function createUserResolver(config) {
    if (!config?.resolveUser) {
        // Return a pass-through resolver that returns null
        return async () => null;
    }
    return async (auth) => {
        try {
            return await config.resolveUser(auth);
        }
        catch (error) {
            // Log error but don't throw - return null to indicate resolution failure
            console.error('Failed to resolve user:', error instanceof Error ? error.message : error);
            return null;
        }
    };
}
/**
 * Check if a runtime config has user resolution configured
 */
export function hasUserResolver(config) {
    return typeof config?.resolveUser === 'function';
}
/**
 * Find Prisma schema file in the project
 *
 * Searches in order:
 * 1. Config-specified path: config.build.prismaSchema
 * 2. Default: prisma/schema.prisma
 * 3. Alternative: schema.prisma
 */
export async function findPrismaSchemaPath(cwd, config) {
    // Check config-specified path first
    if (config?.prismaSchema) {
        const configPath = path.resolve(cwd, config.prismaSchema);
        try {
            await fs.access(configPath);
            return configPath;
        }
        catch {
            // Config path doesn't exist, continue to defaults
        }
    }
    // Default locations
    const defaultPaths = [
        'prisma/schema.prisma',
        'schema.prisma',
        'db/schema.prisma',
    ];
    for (const schemaPath of defaultPaths) {
        const fullPath = path.resolve(cwd, schemaPath);
        try {
            await fs.access(fullPath);
            return fullPath;
        }
        catch {
            continue;
        }
    }
    return null;
}
/**
 * Parse a Prisma schema file and extract models and fields
 *
 * This is a simple parser that handles common Prisma schema patterns.
 * It extracts model names and their field definitions.
 */
export async function parsePrismaSchema(schemaPath) {
    const content = await fs.readFile(schemaPath, 'utf-8');
    const models = [];
    // Remove comments
    const cleanedContent = content
        .replace(/\/\/.*$/gm, '') // Remove single-line comments
        .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments
    // Match model blocks
    const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
    let match;
    while ((match = modelRegex.exec(cleanedContent)) !== null) {
        const modelName = match[1];
        const modelBody = match[2].trim();
        const fields = [];
        // Parse each field (line by line)
        const fieldLines = modelBody.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        for (const fieldLine of fieldLines) {
            // Skip block attributes like @@id, @@index, etc.
            if (fieldLine.startsWith('@@'))
                continue;
            // Parse field: name type options*
            const fieldMatch = fieldLine.match(/^(\w+)\s+(\w+)(\?|\[])?(\s+@.*)?$/);
            if (fieldMatch) {
                const [, fieldName, fieldType, modifier] = fieldMatch;
                // Check for @id attribute
                const hasId = /@id/.test(fieldLine);
                const hasDefault = /@default\(/.test(fieldLine);
                const isGenerated = /@default\(autoincrement\)|@updatedAt|@createdAt/.test(fieldLine);
                fields.push({
                    name: fieldName,
                    type: fieldType,
                    isOptional: modifier === '?',
                    isList: modifier === '[]',
                    isId: hasId,
                    isGenerated,
                    defaultValue: undefined, // Would need more complex parsing
                });
            }
        }
        if (fields.length > 0) {
            models.push({ name: modelName, fields });
        }
    }
    return { models };
}
/**
 * Get Prisma model by name (case-insensitive search)
 */
export function getPrismaModel(schema, modelName) {
    // Exact match first
    let model = schema.models.find(m => m.name === modelName);
    if (!model) {
        // Case-insensitive search
        model = schema.models.find(m => m.name.toLowerCase() === modelName.toLowerCase());
    }
    return model;
}
/**
 * Check if a property exists in a Prisma model
 * Considers both exact name and property mapping
 */
export function propertyExistsInModel(model, propertyName, propertyMapping) {
    // Check if property name matches a field
    const hasDirectMatch = model.fields.some(f => f.name === propertyName);
    if (hasDirectMatch)
        return true;
    // Check if there's a mapping from this property to a field
    if (propertyMapping) {
        for (const [manifestProp, dbField] of Object.entries(propertyMapping)) {
            if (manifestProp === propertyName && model.fields.some(f => f.name === dbField)) {
                return true;
            }
        }
    }
    return false;
}
/**
 * Get Prisma field names for a model
 */
export function getPrismaFieldNames(model) {
    return model.fields.map(f => f.name);
}
//# sourceMappingURL=config.js.map