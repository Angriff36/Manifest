/**
 * manifest compile command
 *
 * Compiles .manifest source files to IR (Intermediate Representation).
 */
interface CompileOptions {
    output?: string;
    glob?: string;
    diagnostics?: boolean;
    pretty?: boolean;
}
/**
 * Compile command handler
 */
export declare function compileCommand(source: string | undefined, options?: CompileOptions): Promise<void>;
export {};
//# sourceMappingURL=compile.d.ts.map