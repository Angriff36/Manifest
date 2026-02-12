export { executeScript, createInMemoryRuntime } from './core/executor.js';
export { parseScript, validateScript } from './core/script-schema.js';
export { formatOutput, formatForSnapshot, stripVolatileFields } from './core/output-formatter.js';
export { prepareForSnapshot, createSnapshotName } from './core/snapshot-manager.js';

export type {
  TestScript,
  ExecutionResult,
  ExecutionStep,
  StepResult,
  StepCommand,
  AssertionDetail,
  StepAssertions,
  GuardFailure,
  ExecuteScriptOptions,
} from './types/index.js';

export type {
  IR,
  IREntity,
  IRCommand,
  IRProperty,
  IRGuard,
  IRMutation,
  IREvent,
  IRCommandParam,
  RuntimeEngine,
  CommandResult,
  ManifestAdapter,
} from './adapters/manifest-core.js';
