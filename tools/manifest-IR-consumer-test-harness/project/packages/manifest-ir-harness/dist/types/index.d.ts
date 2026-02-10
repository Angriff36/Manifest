export interface UserContext {
    id: string;
    role?: string;
    [key: string]: unknown;
}
export interface RuntimeContext {
    user?: UserContext;
    [key: string]: unknown;
}
export interface SeedEntity {
    entity: string;
    id: string;
    properties: Record<string, unknown>;
}
export interface ErrorExpectation {
    type: 'guard' | 'policy' | 'constraint';
    message?: string;
    guardIndex?: number;
}
export interface CommandExpectation {
    success: boolean;
    error?: ErrorExpectation;
    stateAfter?: Record<string, unknown>;
    emittedEvents?: string[];
    constraintWarnings?: string[];
}
export interface ScriptCommand {
    step: number;
    entity: string;
    id: string;
    command: string;
    params?: Record<string, unknown>;
    expect: CommandExpectation;
}
export interface TestScript {
    description: string;
    context?: RuntimeContext;
    seedEntities?: SeedEntity[];
    commands: ScriptCommand[];
}
export interface EmittedEvent {
    name: string;
    data: Record<string, unknown>;
}
export interface GuardFailure {
    guardIndex: number;
    expression: string;
    resolvedValues: Record<string, unknown>;
    evaluatedTo: boolean;
}
export interface ExecutionError {
    type: 'guard' | 'policy' | 'constraint';
    message: string;
    guardIndex?: number;
}
export interface CommandResult {
    success: boolean;
    entityStateAfter: Record<string, unknown> | null;
    emittedEvents: EmittedEvent[];
    guardFailures: GuardFailure[] | null;
    constraintWarnings: string[];
    error?: ExecutionError;
}
export interface Diagnostic {
    severity: 'error' | 'warning' | 'info';
    message: string;
    location?: {
        line: number;
        column: number;
    };
}
export type IR = Record<string, unknown>;
export interface CompileResult {
    ir: IR | null;
    diagnostics: Diagnostic[];
}
export interface RuntimeEngine {
    seedEntity(entity: string, id: string, properties: Record<string, unknown>): void;
    executeCommand(entity: string, id: string, command: string, params: Record<string, unknown>, context: RuntimeContext): CommandResult;
    getEntityState(entity: string, id: string): Record<string, unknown> | null;
}
export interface ManifestAdapter {
    compile(source: string): Promise<CompileResult>;
    createRuntime(ir: IR): RuntimeEngine;
}
export interface AssertionDetail {
    check: string;
    expected: unknown;
    actual: unknown;
    passed: boolean;
}
export interface AssertionSummary {
    passed: number;
    failed: number;
    details: AssertionDetail[];
}
export interface StepOutput {
    step: number;
    command: {
        entity: string;
        id: string;
        name: string;
        params: Record<string, unknown>;
    };
    result: CommandResult;
    assertions: AssertionSummary;
}
export interface SourceInfo {
    type: 'ir' | 'manifest';
    path: string;
    irHash: string;
}
export interface ExecutionOutput {
    context: RuntimeContext;
    steps: StepOutput[];
}
export interface ExecutionSummary {
    totalSteps: number;
    passed: number;
    failed: number;
    assertionsPassed: number;
    assertionsFailed: number;
}
export interface HarnessOutput {
    harness: {
        version: string;
        executedAt: string;
    };
    source: SourceInfo;
    script: {
        path: string;
        description: string;
    };
    execution: ExecutionOutput;
    summary: ExecutionSummary;
}
export interface RunOptions {
    irSource?: IR;
    manifestSource?: string;
    script: TestScript;
    sourcePath?: string;
    scriptPath?: string;
    timestamp?: string;
}
export interface ValidationResult {
    valid: boolean;
    errors: string[];
}
//# sourceMappingURL=index.d.ts.map