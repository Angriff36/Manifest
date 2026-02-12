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
}
/**
 * Generate command handler
 */
export declare function generateCommand(ir: string, options: GenerateOptions): Promise<void>;
export {};
//# sourceMappingURL=generate.d.ts.map