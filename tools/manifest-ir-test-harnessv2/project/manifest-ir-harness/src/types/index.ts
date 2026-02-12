export interface TestScript {
  description: string;

  context?: {
    user?: {
      id: string;
      role?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };

  seedEntities?: Array<{
    entity: string;
    id: string;
    properties: Record<string, unknown>;
  }>;

  commands: Array<{
    step: number;
    entity: string;
    id: string;
    command: string;
    params?: Record<string, unknown>;

    expect: {
      success: boolean;

      error?: {
        type: 'guard' | 'policy' | 'constraint';
        message?: string;
        guardIndex?: number;
      };

      stateAfter?: Record<string, unknown>;
      emittedEvents?: string[];
      constraintWarnings?: string[];
    };
  }>;
}

export interface StepCommand {
  entity: string;
  id: string;
  name: string;
  params: Record<string, unknown>;
}

export interface AssertionDetail {
  check: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
}

export interface StepAssertions {
  passed: number;
  failed: number;
  details: AssertionDetail[];
}

export interface GuardFailure {
  guardIndex: number;
  expression: string;
  resolvedValues: Record<string, unknown>;
  evaluatedTo: boolean;
}

export interface StepResult {
  success: boolean;
  entityStateAfter?: Record<string, unknown>;
  emittedEvents?: Array<{ name: string; data: unknown }>;
  guardFailures?: GuardFailure[];
  constraintWarnings?: string[];
  error?: string;
}

export interface ExecutionStep {
  step: number;
  command: StepCommand;
  result: StepResult;
  assertions: StepAssertions;
}

export interface ExecutionResult {
  harness: {
    version: string;
    executedAt: string;
  };
  source: {
    type: 'manifest' | 'ir';
    path: string;
    irHash?: string;
  };
  script: {
    path: string;
    description: string;
  };
  execution: {
    context: Record<string, unknown>;
    steps: ExecutionStep[];
  };
  summary: {
    totalSteps: number;
    passed: number;
    failed: number;
    assertionsPassed: number;
    assertionsFailed: number;
  };
}

export interface ExecuteScriptOptions {
  ir: import('../adapters/manifest-core.js').IR;
  script: TestScript;
  sourcePath?: string;
  sourceType?: 'manifest' | 'ir';
  scriptPath?: string;
  irHash?: string;
  executedAt?: string;
}
