import { CompilationResult, ManifestProgram } from './types.js';
export declare class ManifestCompiler {
    private parser;
    private generator;
    compile(source: string): CompilationResult;
    parse(source: string): {
        program: ManifestProgram;
        errors: unknown[];
    };
}
export * from './types.js';
//# sourceMappingURL=compiler.d.ts.map