/**
 * manifest build command
 *
 * Compiles .manifest to IR and generates code in one step.
 */
interface BuildOptions {
    projection: string;
    surface: string;
    irOutput: string;
    codeOutput: string;
    glob?: string;
    auth: string;
    database: string;
    runtime: string;
    response: string;
}
/**
 * Build command handler
 *
 * Combines compile + generate in a single workflow.
 */
export declare function buildCommand(source: string | undefined, options: BuildOptions): Promise<void>;
export {};
//# sourceMappingURL=build.d.ts.map