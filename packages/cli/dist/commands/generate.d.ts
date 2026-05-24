/**
 * manifest generate command
 *
 * Generates code from IR using a projection.
 */
interface GenerateOptions {
    projection: string;
    surface: string;
    output: string;
    auth: string;
    database: string;
    runtime: string;
    response: string;
    /**
     * Pre-resolved projection options sourced from manifest.config.{yaml,ts}.
     * The CLI layer in index.ts merges these with --auth/--database/etc.
     * flag overrides before invoking generateCommand.
     *
     * Keeping this generic (`Record<string, unknown>`) means we never have
     * to update GenerateOptions when new projection-level config keys land
     * — the projection's normalizeOptions is the contract.
     */
    projectionOptionsFromConfig?: Record<string, unknown>;
}
/**
 * Generate command handler
 */
export declare function generateCommand(ir: string, options: GenerateOptions): Promise<void>;
export {};
//# sourceMappingURL=generate.d.ts.map