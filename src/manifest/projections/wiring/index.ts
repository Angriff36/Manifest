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
