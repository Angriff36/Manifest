/**
 * manifest check command
 *
 * Runs compile + validate as a single verification workflow.
 */
interface CheckOptions {
    output?: string;
    glob?: string;
    diagnostics?: boolean;
    pretty?: boolean;
    schema?: string;
    strict?: boolean;
}
/**
 * Check command handler
 *
 * Compile .manifest files to IR, then validate generated IR.
 */
export declare function checkCommand(source: string | undefined, options?: CheckOptions): Promise<void>;
export {};
//# sourceMappingURL=check.d.ts.map