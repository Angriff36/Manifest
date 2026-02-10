import { CompilationResult, ManifestProgram } from './types';
export declare class ManifestCompiler {
    private parser;
    private generator;
    compile(source: string): CompilationResult;
    parse(source: string): {
        program: ManifestProgram;
        errors: unknown[];
    };
}
export * from './types';
//# sourceMappingURL=compiler.d.ts.map