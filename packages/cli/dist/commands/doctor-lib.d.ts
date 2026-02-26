export type Severity = 'error' | 'warning' | 'info';
export interface DiagnosticFinding {
    severity: Severity;
    code: string;
    message: string;
    file?: string;
    line?: number;
    details?: Record<string, unknown>;
    suggestion?: string;
}
export interface EntitySurfaceShape {
    exists: boolean;
    commands: string[];
    properties: string[];
    emits: string[];
}
export interface EntitySurfaceDiff {
    entityName: string;
    hasDrift: boolean;
    entityMissingInSource: boolean;
    entityMissingInIR: boolean;
    commands: {
        missingInIR: string[];
        extraInIR: string[];
    };
    properties: {
        missingInIR: string[];
        extraInIR: string[];
    };
    emits: {
        missingInIR: string[];
        extraInIR: string[];
    };
}
export declare function diffEntitySurface(input: {
    entityName: string;
    source: EntitySurfaceShape;
    ir: EntitySurfaceShape;
}): EntitySurfaceDiff;
export declare function detectEntitySourceParseHeuristics(input: {
    entityName: string;
    source: string;
    parsedCommandCount: number;
}): DiagnosticFinding[];
export interface DuplicateReportEntry {
    type: string;
    key: string;
    keptFrom: string | null;
    droppedFrom: string | null;
    classification: 'known' | 'suspicious';
    sourceReport: string;
    raw: Record<string, unknown>;
}
export declare function normalizeMergeReportEntries(report: unknown, sourceReport: string): DuplicateReportEntry[];
export interface SourceEntityDefinition {
    entityName: string;
    file: string;
    line?: number;
    properties: string[];
    commands: string[];
    policies: string[];
    emits: string[];
    parserHeuristics: DiagnosticFinding[];
    parserErrors: Array<{
        message: string;
        line?: number;
        column?: number;
        severity?: string;
    }>;
}
export interface SourceInspectionResult {
    entities: Map<string, SourceEntityDefinition[]>;
    filesScanned: number;
    filesWithParseErrors: number;
}
export interface IREntityDefinition {
    entityName: string;
    irFile: string;
    properties: string[];
    commands: string[];
    policies: string[];
    emits: string[];
    events: string[];
    provenance?: Record<string, unknown>;
}
export interface IRInspectionResult {
    entities: Map<string, IREntityDefinition[]>;
    filesScanned: number;
}
export declare function findManifestSourceFiles(cwd: string, srcPattern?: string): Promise<string[]>;
export declare function inspectSourceEntities(options?: {
    cwd?: string;
    srcPattern?: string;
}): Promise<SourceInspectionResult>;
export declare function discoverIRFiles(options?: {
    cwd?: string;
    irRoots?: string[];
}): Promise<string[]>;
export declare function inspectCompiledIR(options?: {
    cwd?: string;
    irRoots?: string[];
}): Promise<IRInspectionResult>;
export declare function mergeSourceEntityDefinitions(defs: SourceEntityDefinition[] | undefined): EntitySurfaceShape & {
    files: Array<{
        file: string;
        line?: number;
    }>;
    parserFindings: DiagnosticFinding[];
    parserErrors: SourceEntityDefinition['parserErrors'];
    policies: string[];
};
export declare function mergeIREntityDefinitions(defs: IREntityDefinition[] | undefined): EntitySurfaceShape & {
    files: Array<{
        file: string;
        provenance?: Record<string, unknown>;
    }>;
    policies: string[];
    events: string[];
};
export interface RouteManifestCommandHit {
    routePath: string;
    method: string;
    sourceKind: string;
    sourceEntity: string;
    sourceCommand: string;
    manifestFile: string;
}
export declare function findRoutesManifestFiles(cwd?: string): Promise<string[]>;
export declare function inspectRouteSurfaceForCommand(options: {
    entityName: string;
    commandName: string;
    routePath?: string;
    cwd?: string;
}): Promise<{
    routeExists: boolean;
    matches: RouteManifestCommandHit[];
}>;
export declare function readMergeReports(options?: {
    cwd?: string;
    pattern?: string;
}): Promise<Array<{
    file: string;
    entries: DuplicateReportEntry[];
    parseError?: string;
}>>;
export declare function formatRelative(cwd: string, filePath: string): string;
//# sourceMappingURL=doctor-lib.d.ts.map