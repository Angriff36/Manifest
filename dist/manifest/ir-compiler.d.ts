import { CompileToIRResult } from './ir';
import { type IRCache } from './ir-cache.js';
export declare class IRCompiler {
    private diagnostics;
    private cache;
    constructor(cache?: IRCache);
    /**
     * Emit a semantic diagnostic during IR compilation.
     * This is the compiler's mechanism for reporting semantic errors
     * beyond what the parser catches (e.g., duplicate constraint codes).
     */
    private emitDiagnostic;
    compileToIR(source: string, options?: {
        useCache?: boolean;
    }): Promise<CompileToIRResult>;
    private transformProgram;
    private transformModule;
    private transformEntity;
    private transformTransition;
    private transformProperty;
    private transformComputedProperty;
    private transformRelationship;
    private transformConstraint;
    /**
     * Validate that constraint codes are unique within a scope (entity or command).
     * Per spec (manifest-vnext.md, Constraint Blocks): "Within a single entity,
     * code values MUST be unique. Within a single command's constraints array,
     * code values MUST be unique. Compiler MUST emit diagnostic error on duplicates."
     *
     * Uses the AST nodes for source location (line/column) and IR constraints
     * for the resolved code values (which default to name if not explicit).
     */
    private validateConstraintCodeUniqueness;
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