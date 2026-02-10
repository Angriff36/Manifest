import { ManifestProgram } from './types';
export declare class StandaloneGenerator {
    private out;
    private indent;
    private provenance;
    generate(program: ManifestProgram): string;
    private emitImports;
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
//# sourceMappingURL=standalone-generator.d.ts.map