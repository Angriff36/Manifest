/**
 * Automatic application wiring remediation.
 *
 * Manifest truth → wiring contract → inspect → deterministic repair → verify.
 * Does not design UI.
 */

export type {
  RepairKind,
  RepairDecisionClass,
  RepairConfidence,
  RepairPlan,
  RepairPlanBundle,
  RepairEditSpec,
  RepairOperation,
  AppliedRepairResult,
  RepairVerificationResult,
  RemediateReport,
  RemediateFileMap,
} from './types.js';
export { WIRING_REPAIR_PLAN_SCHEMA, WIRING_REMEDIATE_REPORT_SCHEMA } from './types.js';

export { planWiringRepairs } from './planner.js';
export type { PlanRepairsOptions } from './planner.js';

export { applyRepairPlan, applyRepairPlans } from './patch-engine.js';
export type { PatchApplyResult } from './patch-engine.js';

export { verifyRepair, verifyRepairAsync } from './verifier.js';

export {
  remediateWiring,
  remediateWiringSync,
  selectNextAutoFixable,
  formatRemediateReportText,
} from './orchestrator.js';
export type { RemediateOptions, RemediateMode } from './orchestrator.js';

export { PatternAdapter } from './pattern-adapter.js';
export {
  proveControlSemanticMatch,
  verifyWiredControlSemantics,
} from './control-semantic-match.js';
export {
  resolveRequiredInputSource,
  missingRequiredClientParams,
} from './required-input-source.js';
export type {
  ProvenValueSource,
  SourceProofResult,
  ProvenSourceKind,
} from './required-input-source.js';
