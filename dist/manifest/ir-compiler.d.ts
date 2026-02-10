import { CompileToIRResult } from './ir';
import { type IRCache } from './ir-cache';
export declare class IRCompiler {
    private diagnostics;
    private cache;
    constructor(cache?: IRCache);
    compileToIR(source: string, options?: {
        useCache?: boolean;
    }): Promise<CompileToIRResult>;
    private transformProgram;
    private transformModule;
    private transformEntity;
    private transformProperty;
    private transformComputedProperty;
    private transformRelationship;
    private transformConstraint;
    private transformStore;
    private transformEvent;
    private transformCommand;
    private transformParameter;
    private transformAction;
    private transformPolicy;
    private transformType;
    private transformExpression;
    private transformExprToValue;
    private literalToValue;
}
export declare function compileToIR(source: string): Promise<CompileToIRResult>;
//# sourceMappingURL=ir-compiler.d.ts.map