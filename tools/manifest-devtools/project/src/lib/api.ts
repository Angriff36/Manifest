// API client for DevTools — Electron IPC transport

export interface ScanResult {
  errors: Array<{
    file: string;
    line?: number;
    entityName: string;
    commandName: string;
    message: string;
    suggestion: string;
  }>;
  warnings: Array<{
    file: string;
    line?: number;
    message: string;
    suggestion?: string;
  }>;
  filesScanned: number;
  commandsChecked: number;
  routesScanned: number;
}

export interface ManifestFile {
  path: string;
  relative: string;
  name: string;
}

export interface CompileResult {
  ir: {
    entities?: Array<{
      name: string;
      properties?: Array<{ name: string; type: string }>;
    }>;
    commands?: Array<{
      name: string;
      entity: string;
      guards?: Array<{ expression: string }>;
      policies?: string[];
    }>;
    policies?: Array<{
      name: string;
      entity?: string;
      action: string;
      expression?: string;
    }>;
    stores?: Array<{
      entity: string;
      target: string;
    }>;
  } | null;
  diagnostics: Array<{
    severity: string;
    message: string;
    line?: number;
  }>;
  source: string;
  file: string;
}

export interface CompileAllResult {
  results: Array<{
    file: string;
    name: string;
    ir: CompileResult['ir'];
    diagnostics: CompileResult['diagnostics'];
  }>;
  filesCompiled: number;
}

// --- Profiling types ---

export interface CompileProfileFileResult {
  file: string;
  name: string;
  sourceBytes: number;
  sourceLines: number;
  compileTimeMs: number;
  success: boolean;
  diagnosticCount: number;
  metrics: {
    entities: number;
    commands: number;
    policies: number;
    events: number;
    stores: number;
    properties: number;
    guards: number;
    actions: number;
    constraints: number;
    relationships: number;
    computedProperties: number;
  } | null;
}

export interface CompileProfileResult {
  results: CompileProfileFileResult[];
  totalCompileMs: number;
  filesCompiled: number;
}

export interface RuntimeProfileCommand {
  name: string;
  entity: string | null;
  paramCount: number;
  guardCount: number;
  actionCount: number;
  policyCount: number;
}

export interface RuntimeProfileResult {
  success: boolean;
  error?: string;
  diagnostics?: Array<{ severity: string; message: string }>;
  availableCommands?: RuntimeProfileCommand[];
  commandResult?: {
    success: boolean;
    result?: unknown;
    error?: string;
    guardFailure?: unknown;
    policyDenial?: unknown;
    emittedEvents: Array<unknown>;
  };
  phases: {
    compile: number;
    init?: number;
    execute?: number;
    total?: number;
  };
}

export interface StaticCommandAnalysis {
  name: string;
  guardCount: number;
  maxGuardDepth: number;
  totalGuardNodes: number;
  actionCount: number;
  policyRefs: number;
  emitCount: number;
  paramCount: number;
  constraintCount: number;
  complexityScore: number;
}

export interface StaticEntityAnalysis {
  name: string;
  propertyCount: number;
  relationshipCount: number;
  relComplexity: number;
  commandCount: number;
  policyCount: number;
  constraintCount: number;
  computedPropertyCount: number;
  commands: StaticCommandAnalysis[];
  constraints: Array<{
    name: string;
    severity: string;
    depth: number;
    nodes: number;
    overrideable: boolean;
  }>;
  computedProperties: Array<{
    name: string;
    dependencyCount: number;
    expressionDepth: number;
    expressionNodes: number;
  }>;
  complexityScore: number;
}

export interface StaticAnalysisResult {
  results: Array<{
    file: string;
    name: string;
    error?: string;
    analysis: {
      entities: StaticEntityAnalysis[];
      policies: Array<{
        name: string;
        entity: string;
        action: string;
        expressionDepth: number;
        expressionNodes: number;
      }>;
      summary: {
        entityCount: number;
        commandCount: number;
        policyCount: number;
        eventCount: number;
        storeCount: number;
        totalGuards: number;
        maxGuardDepth: number;
        totalExprNodes: number;
        totalComplexity: number;
      };
    } | null;
  }>;
  filesAnalyzed: number;
}

// --- IR Schema Validation types ---

export interface IRValidationError {
  path: string;
  message: string;
  keyword: string;
  params: Record<string, unknown>;
}

export interface IRValidationFileResult {
  file: string;
  name: string;
  valid: boolean;
  errors: IRValidationError[];
  compileError: string | null;
  entityCount?: number;
  commandCount?: number;
}

export interface IRValidationResult {
  results: IRValidationFileResult[];
  total: number;
  passed: number;
  failed: number;
}

// --- IR Diff types ---

export interface IRDiffChange {
  path: string;
  changeType: 'added' | 'removed' | 'changed';
  beforeHash: string | null;
  afterHash: string | null;
  label: string | null;
  risk: 'high' | 'low';
}

export interface IRDiffSummary {
  totalChanges: number;
  added: number;
  removed: number;
  changed: number;
  highRiskCount: number;
  changes: IRDiffChange[];
}

export interface IRDiffResult {
  success: boolean;
  error?: string;
  fileA?: { path: string; name: string };
  fileB?: { path: string; name: string };
  diff?: IRDiffSummary;
}

// --- Test Harness types ---

export interface HarnessAssertionDetail {
  check: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
}

export interface HarnessStepResult {
  step: number;
  command: {
    entity: string;
    id: string;
    name: string;
    params: Record<string, unknown>;
  };
  result: {
    success: boolean;
    entityStateAfter: Record<string, unknown> | null;
    emittedEvents: Array<{ name: string; data: Record<string, unknown> }>;
    guardFailures: Array<{
      guardIndex: number;
      expression: string;
      resolvedValues: Record<string, unknown>;
      evaluatedTo: boolean;
    }> | null;
    constraintWarnings: string[];
    error?: { type: string; message: string; guardIndex?: number };
  };
  assertions: {
    passed: number;
    failed: number;
    details: HarnessAssertionDetail[];
  };
}

export interface HarnessOutput {
  harness: { version: string; executedAt: string };
  source: { type: string; path: string; irHash: string };
  script: { path: string; description: string };
  execution: {
    context: Record<string, unknown>;
    steps: HarnessStepResult[];
  };
  summary: {
    totalSteps: number;
    passed: number;
    failed: number;
    assertionsPassed: number;
    assertionsFailed: number;
  };
}

export interface HarnessResult {
  success: boolean;
  error?: string;
  validationErrors?: string[];
  output?: HarnessOutput;
}

export interface ScriptValidation {
  valid: boolean;
  errors: string[];
}

// --- IR Structure types (for script generation) ---

export interface IRPropertyInfo {
  name: string;
  type: string;
  required: boolean;
  default: unknown;
}

export interface IRCommandInfo {
  name: string;
  parameters: Array<{ name: string; type: string }>;
  guardCount: number;
  actionCount: number;
  emitCount: number;
}

export interface IREntityInfo {
  name: string;
  properties: IRPropertyInfo[];
  commands: IRCommandInfo[];
}

export interface IRStructureResult {
  success: boolean;
  error?: string;
  entities?: IREntityInfo[];
}

// --- Electron IPC bridge type ---

declare global {
  interface Window {
    electronAPI?: {
      getManifestRoot: () => Promise<string>;
      setManifestRoot: (root: string) => Promise<{ success: boolean }>;
      listFiles: (root: string) => Promise<{ files: ManifestFile[]; root: string }>;
      readFile: (filePath: string) => Promise<{ content: string; path: string }>;
      compileFile: (filePath: string) => Promise<CompileResult>;
      compileAll: (root: string) => Promise<CompileAllResult>;
      scanFile: (filePath: string) => Promise<ScanResult>;
      scanAll: (root: string) => Promise<ScanResult>;
      pickDirectory: () => Promise<string | null>;
      profileCompile: (root: string) => Promise<CompileProfileResult>;
      profileRuntime: (opts: { filePath: string; commandName?: string; input?: Record<string, unknown>; context?: Record<string, unknown> }) => Promise<RuntimeProfileResult>;
      profileStatic: (root: string) => Promise<StaticAnalysisResult>;
      validateIR: (root: string) => Promise<IRValidationResult>;
      diffIR: (opts: { fileA: string; fileB: string }) => Promise<IRDiffResult>;
      getIRStructure: (filePath: string) => Promise<IRStructureResult>;
      runTestScript: (opts: { filePath: string; script: Record<string, unknown> }) => Promise<HarnessResult>;
      validateTestScript: (script: Record<string, unknown>) => Promise<ScriptValidation>;
    };
  }
}

// --- Module state ---

let _manifestRoot = '';

export function setManifestRoot(root: string) {
  _manifestRoot = root;
}

export function getManifestRoot() {
  return _manifestRoot;
}

// --- Electron-specific helpers ---

function requireElectronAPI(): NonNullable<Window['electronAPI']> {
  if (!window.electronAPI) {
    throw new Error('Not running in Electron — window.electronAPI is not available');
  }
  return window.electronAPI;
}

export async function loadSavedRoot(): Promise<string> {
  return requireElectronAPI().getManifestRoot();
}

export async function saveRoot(root: string): Promise<void> {
  await requireElectronAPI().setManifestRoot(root);
  _manifestRoot = root;
}

export async function pickDirectory(): Promise<string | null> {
  return requireElectronAPI().pickDirectory();
}

// --- Data operations (same signatures as before) ---

export async function listFiles(): Promise<{ files: ManifestFile[]; root: string }> {
  return requireElectronAPI().listFiles(_manifestRoot);
}

export async function readFile(filePath: string): Promise<{ content: string; path: string }> {
  return requireElectronAPI().readFile(filePath);
}

export async function scanFile(filePath: string): Promise<ScanResult> {
  return requireElectronAPI().scanFile(filePath);
}

export async function scanAll(): Promise<ScanResult> {
  return requireElectronAPI().scanAll(_manifestRoot);
}

export async function compileFile(filePath: string): Promise<CompileResult> {
  return requireElectronAPI().compileFile(filePath);
}

export async function compileAll(): Promise<CompileAllResult> {
  return requireElectronAPI().compileAll(_manifestRoot);
}

// --- Profiling operations ---

export async function profileCompile(): Promise<CompileProfileResult> {
  return requireElectronAPI().profileCompile(_manifestRoot);
}

export async function profileRuntime(opts: {
  filePath: string;
  commandName?: string;
  input?: Record<string, unknown>;
  context?: Record<string, unknown>;
}): Promise<RuntimeProfileResult> {
  return requireElectronAPI().profileRuntime(opts);
}

export async function profileStatic(): Promise<StaticAnalysisResult> {
  return requireElectronAPI().profileStatic(_manifestRoot);
}

// --- IR Schema Validation operations ---

export async function validateIR(): Promise<IRValidationResult> {
  return requireElectronAPI().validateIR(_manifestRoot);
}

// --- IR Diff operations ---

export async function diffIR(fileA: string, fileB: string): Promise<IRDiffResult> {
  return requireElectronAPI().diffIR({ fileA, fileB });
}

// --- Test Harness operations ---

export async function runTestScript(filePath: string, script: Record<string, unknown>): Promise<HarnessResult> {
  return requireElectronAPI().runTestScript({ filePath, script });
}

export async function validateTestScript(script: Record<string, unknown>): Promise<ScriptValidation> {
  return requireElectronAPI().validateTestScript(script);
}

// --- IR Structure operations ---

export async function getIRStructure(filePath: string): Promise<IRStructureResult> {
  return requireElectronAPI().getIRStructure(filePath);
}
