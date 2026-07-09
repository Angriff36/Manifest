/**
 * Public entry for the product wiring projection.
 */

export { WiringProjection } from './generator.js';
export { buildWiringContract, parameterTsType } from './contract-builder.js';
export { generateWiringBindings } from './bindings-generator.js';
export { validateWiringCoverage, parseConsumersRegistry } from './coverage.js';
export type {
  WiringContract,
  WiringCommandDescriptor,
  WiringParameterDescriptor,
  WiringConsumersRegistry,
  WiringConsumerEntry,
  WiringCoverageReport,
  WiringCoverageFinding,
  WiringProjectionOptions,
  WiringLifecycleTransition,
  WiringInvalidationTarget,
} from './types.js';
export {
  WIRING_CONTRACT_SCHEMA,
  WIRING_CONSUMERS_SCHEMA,
} from './types.js';

export {
  inspectWiringConsumers,
  inspectWiringConsumersSync,
  formatInspectReportText,
  fileMapFromRecord,
  loadApplicationSources,
  WIRING_INSPECT_REPORT_SCHEMA,
} from './inspect/index.js';
export type {
  InspectWiringOptions,
  WiringInspectConfig,
  WiringInspectReport,
  ConsumerEvidence,
  ContractMismatch,
  InspectCoverageFinding,
} from './inspect/index.js';

export {
  planWiringRepairs,
  applyRepairPlan,
  applyRepairPlans,
  verifyRepair,
  remediateWiring,
  remediateWiringSync,
  selectNextAutoFixable,
  formatRemediateReportText,
  WIRING_REPAIR_PLAN_SCHEMA,
  WIRING_REMEDIATE_REPORT_SCHEMA,
  PatternAdapter,
} from './remediate/index.js';
export type {
  RepairKind,
  RepairDecisionClass,
  RepairPlan,
  RepairPlanBundle,
  RemediateReport,
  RemediateOptions,
  RemediateMode,
  AppliedRepairResult,
} from './remediate/index.js';
