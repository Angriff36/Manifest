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
/**
 * Build-level configuration (YAML-based)
 *
 * These settings control compilation and code generation.
 */
export interface ManifestConfig {
    $schema?: string;
    src?: string;
    output?: string;
    prismaSchema?: string;
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
/**
 * Find and load all configuration files
 *
 * Returns both build (YAML) and runtime (TS/JS) configs separately.
 */
export declare function loadAllConfigs(cwd?: string): Promise<CombinedConfig>;
/**
 * Load only the YAML configuration (backward compatible)
 */
export declare function loadConfig(cwd?: string): Promise<ManifestConfig | null>;
/**
 * Get config with defaults applied (backward compatible)
 *
 * For new code, prefer loadAllConfigs() which includes runtime config.
 */
export declare function getConfig(cwd?: string): Promise<ManifestConfig>;
/**
 * Get the runtime configuration
 */
export declare function getRuntimeConfig(cwd?: string): Promise<ManifestRuntimeConfig | null>;
/**
 * Save config to YAML file
 *
 * Note: This only saves build-level settings to YAML.
 * Runtime config (TS/JS) must be managed manually.
 */
export declare function saveConfig(config: ManifestConfig, cwd?: string): Promise<void>;
/**
 * Check if any config file exists (YAML or TS/JS)
 */
export declare function configExists(cwd?: string): Promise<boolean>;
/**
 * Check which config file is being used
 */
export declare function getActiveConfigPath(cwd?: string): Promise<string | null>;
/**
 * Get Next.js projection options from config
 */
export declare function getNextJsOptions(cwd?: string): Promise<{
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
}>;
/**
 * Get output paths from config
 */
export declare function getOutputPaths(cwd?: string): Promise<{
    irOutput: string;
    codeOutput: string;
}>;
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
export declare function createStoreProvider(config: ManifestRuntimeConfig | null): StoreProvider;
/**
 * Clear the store cache (useful for testing)
 */
export declare function clearStoreCache(): void;
/**
 * Get store bindings info for validation/scanning
 *
 * Returns information about configured stores without instantiating them.
 */
export declare function getStoreBindingsInfo(config: ManifestRuntimeConfig | null): {
    entityNames: string[];
    hasStore: (entityName: string) => boolean;
    getPrismaModel: (entityName: string) => string | undefined;
    getPropertyMapping: (entityName: string) => Record<string, string> | undefined;
};
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
export declare function createUserResolver(config: ManifestRuntimeConfig | null): (auth: AuthContext) => Promise<UserContext | null>;
/**
 * Check if a runtime config has user resolution configured
 */
export declare function hasUserResolver(config: ManifestRuntimeConfig | null): boolean;
/**
 * Represents a field in a Prisma model
 */
export interface PrismaField {
    name: string;
    type: string;
    isOptional: boolean;
    isList: boolean;
    isId: boolean;
    isGenerated: boolean;
    defaultValue?: unknown;
}
/**
 * Represents a Prisma model extracted from a schema
 */
export interface PrismaModel {
    name: string;
    fields: PrismaField[];
}
/**
 * Parsed Prisma schema
 */
export interface PrismaSchema {
    models: PrismaModel[];
    datasources?: Array<{
        name: string;
        url: string;
    }>;
}
/**
 * Find Prisma schema file in the project
 *
 * Searches in order:
 * 1. Config-specified path: config.build.prismaSchema
 * 2. Default: prisma/schema.prisma
 * 3. Alternative: schema.prisma
 */
export declare function findPrismaSchemaPath(cwd: string, config: ManifestConfig | null): Promise<string | null>;
/**
 * Parse a Prisma schema file and extract models and fields
 *
 * This is a simple parser that handles common Prisma schema patterns.
 * It extracts model names and their field definitions.
 */
export declare function parsePrismaSchema(schemaPath: string): Promise<PrismaSchema>;
/**
 * Get Prisma model by name (case-insensitive search)
 */
export declare function getPrismaModel(schema: PrismaSchema, modelName: string): PrismaModel | undefined;
/**
 * Check if a property exists in a Prisma model
 * Considers both exact name and property mapping
 */
export declare function propertyExistsInModel(model: PrismaModel, propertyName: string, propertyMapping?: Record<string, string>): boolean;
/**
 * Get Prisma field names for a model
 */
export declare function getPrismaFieldNames(model: PrismaModel): string[];
//# sourceMappingURL=config.d.ts.map