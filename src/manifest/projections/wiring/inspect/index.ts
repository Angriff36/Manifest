/**
 * Automatic application consumer inspection for Manifest wiring.
 */

export type {
  ConsumerProofLevel,
  ConsumerTraceVia,
  InspectCoverageStatus,
  ProductRealityBucket,
  SourceLocation,
  TraceHop,
  ConsumerEvidence,
  ContractMismatchKind,
  ContractMismatch,
  InspectCoverageFinding,
  WiringInspectConfig,
  WiringInspectReport,
} from './types.js';
export { WIRING_INSPECT_REPORT_SCHEMA } from './types.js';

export {
  inspectWiringConsumers,
  inspectWiringConsumersSync,
  formatInspectReportText,
  fileMapFromRecord,
  loadApplicationSources,
} from './inspector.js';
export type { InspectWiringOptions } from './inspector.js';

export { ConsumerTracer } from './consumer-tracer.js';
export { analyzeContractMismatches } from './mismatch-analyzer.js';
export { ProductSurfaceClassifier } from './surface-classifier.js';
export { ProductionFlowParser } from './production-flow-parser.js';
export { RouteHelperIndex, bracketRoutePathToRegex, dynamicRouteProbePath } from './route-helper-index.js';
export {
  extractAllManifestInvocations,
  extractApiManifestPosts,
  extractGeneratedClientCalls,
  clientFunctionName,
} from './invocation-extractor.js';
