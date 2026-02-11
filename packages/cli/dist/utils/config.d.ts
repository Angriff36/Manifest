/**
 * Configuration management for Manifest CLI
 *
 * Handles loading, creating, and validating manifest.config.yaml
 */
export interface ManifestConfig {
    $schema?: string;
    src?: string;
    output?: string;
    projections?: Record<string, {
        output?: string;
        options?: Record<string, any>;
    }>;
}
/**
 * Find and load the config file
 */
export declare function loadConfig(cwd?: string): Promise<ManifestConfig | null>;
/**
 * Get config with defaults applied
 */
export declare function getConfig(cwd?: string): Promise<ManifestConfig>;
/**
 * Save config to file
 */
export declare function saveConfig(config: ManifestConfig, cwd?: string): Promise<void>;
/**
 * Check if config exists
 */
export declare function configExists(cwd?: string): Promise<boolean>;
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
//# sourceMappingURL=config.d.ts.map