export { runScript } from './core/executor.js';
export { validateScript } from './core/validator.js';
export { formatOutput, normalizeForSnapshot, hashIR, prettyFormat } from './core/output-formatter.js';
export { toSnapshotString, extractAssertionSummary } from './core/snapshot-manager.js';

export type {
  TestScript,
  ScriptCommand,
  CommandExpectation,
  ErrorExpectation,
  SeedEntity,
  RuntimeContext,
  UserContext,
  CommandResult,
  EmittedEvent,
  GuardFailure,
  ExecutionError,
  HarnessOutput,
  StepOutput,
  AssertionDetail,
  AssertionSummary,
  SourceInfo,
  ExecutionOutput,
  ExecutionSummary,
  RunOptions,
  ValidationResult,
  ManifestAdapter,
  RuntimeEngine,
  IR,
  CompileResult,
  Diagnostic,
} from './types/index.js';
