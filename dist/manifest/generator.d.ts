import { ManifestProgram } from './types';
export declare class CodeGenerator {
    private out;
    private serverOut;
    private testOut;
    private indent;
    private provenance;
    generate(program: ManifestProgram): {
        code: string;
        serverCode: string;
        testCode: string;
    };
    private emitRuntime;
    private emitStoreRuntime;
    private genStore;
    private genEntity;
    private collectEvents;
    private relationType;
    private genCommandMethod;
    private genCommand;
    private genOutboxEvent;
    private genConstraintChecks;
    private genBehaviorBinding;
    private genBehaviorMethod;
    private genAction;
    private genFlow;
    private genEffect;
    private genExpose;
    private genServerCode;
    private genTestCode;
    private genComposition;
    private emitExports;
    private genExpr;
    private tsType;
    private defVal;
    private capitalize;
    private line;
    private in;
    private de;
}
//# sourceMappingURL=generator.d.ts.map