/**
 * Automatic wiring remediation types.
 *
 * Manifest does not design the UI. These types describe deterministic
 * repairs when Manifest truth + existing product surface prove the fix.
 */

import type { ContractMismatch, ConsumerEvidence, SourceLocation } from '../inspect/types.js';

export const WIRING_REPAIR_PLAN_SCHEMA = 'manifest-wiring-repair-plan/v1' as const;
export const WIRING_REMEDIATE_REPORT_SCHEMA = 'manifest-wiring-remediate/v1' as const;

/** Machine-readable repair kinds — never free-form LLM prose alone. */
export type RepairKind =
  | 'replace-payload-expression'
  | 'add-required-input'
  | 'remove-invalid-literal'
  | 'replace-empty-date-sentinel'
  | 'migrate-to-safe-binding'
  | 'move-trusted-input-server-side'
  | 'wire-existing-control'
  | 'replace-fake-lifecycle-binding'
  | 'add-invalidation';

/** Whether Manifest may apply the repair without human product judgment. */
export type RepairDecisionClass =
  | 'auto-fixable'
  | 'repairable-with-existing-pattern'
  | 'ambiguous-product-decision'
  | 'unsafe-to-apply';

export type RepairConfidence = 'high' | 'medium' | 'low';

export interface RepairPrecondition {
  id: string;
  description: string;
  /** Content hash or exact snippet that must still match at apply time. */
  sourceFingerprint: string;
}

export interface RepairPostcondition {
  id: string;
  description: string;
  /** Mismatch kinds that must be absent after repair for this finding. */
  resolvedMismatchKinds: ContractMismatch['kind'][];
  /** Capability must be consumed after repair when applicable. */
  requireConsumed?: boolean;
}

export interface RepairEditSpec {
  file: string;
  /** Human-readable description of the edit. */
  description: string;
  /** Structured edit payload interpreted by the patch engine. */
  operation: RepairOperation;
}

export type RepairOperation =
  | {
      type: 'replace-object-property-value';
      parameter: string;
      /** Exact current value expression (fingerprint). */
      fromExpression: string;
      toExpression: string;
      /** Optional: locate within a specific capability invocation. */
      capabilityId: string;
    }
  | {
      type: 'remove-object-property';
      parameter: string;
      capabilityId: string;
    }
  | {
      type: 'add-object-property';
      parameter: string;
      expression: string;
      capabilityId: string;
      /** Proven local source of the value (variable/form field). */
      provenSource: string;
    }
  | {
      type: 'replace-call-expression';
      capabilityId: string;
      fromCalleePattern: string;
      toCallee: string;
      /** Import to ensure (idempotent). */
      ensureImport?: { module: string; names: string[] };
    }
  | {
      type: 'add-invalidation-after-mutation';
      capabilityId: string;
      queryKeyHints: string[];
      /** Detected local pattern: react-query | custom. */
      pattern: 'react-query' | 'custom';
    }
  | {
      type: 'rewire-lifecycle-call';
      fromCapabilityId: string;
      toCapabilityId: string;
      entity: string;
      command: string;
    }
  | {
      type: 'wire-control-to-binding';
      controlSymbol: string;
      bindingCallee: string;
      ensureImport?: { module: string; names: string[] };
    };

export interface RepairPlan {
  /** Stable finding identity. */
  findingId: string;
  entity: string;
  command: string;
  capabilityId: string;
  repairKind: RepairKind;
  decision: RepairDecisionClass;
  confidence: RepairConfidence;
  /** True when decision is auto-fixable or repairable-with-existing-pattern. */
  automaticApplicationAllowed: boolean;
  rationale: string;
  mismatch?: ContractMismatch;
  evidence: ConsumerEvidence[];
  sourceFiles: string[];
  consumerTrace: SourceLocation[];
  preconditions: RepairPrecondition[];
  postconditions: RepairPostcondition[];
  edits: RepairEditSpec[];
  verificationMethod: 'reinspect' | 'reinspect+static';
  /** Selection priority score (lower = sooner). */
  priority: number;
}

export interface RepairPlanBundle {
  $schema: typeof WIRING_REPAIR_PLAN_SCHEMA;
  plans: RepairPlan[];
  summary: {
    autoFixable: number;
    repairableWithPattern: number;
    ambiguous: number;
    unsafe: number;
  };
}

export interface AppliedRepairResult {
  findingId: string;
  applied: boolean;
  skippedReason?: string;
  filesChanged: string[];
  editsApplied: number;
  verification?: RepairVerificationResult;
}

export interface RepairVerificationResult {
  ok: boolean;
  findingResolved: boolean;
  capabilityConsumed?: boolean;
  remainingMismatches: ContractMismatch[];
  message: string;
}

export interface RemediateReport {
  $schema: typeof WIRING_REMEDIATE_REPORT_SCHEMA;
  mode: 'plan' | 'dry-run' | 'apply' | 'one-defect';
  ok: boolean;
  plans: RepairPlan[];
  applied: AppliedRepairResult[];
  changedFiles: string[];
  unresolved: Array<{
    findingId?: string;
    decision: RepairDecisionClass;
    message: string;
  }>;
  verification: {
    inspectedAfter: boolean;
    allAppliedResolved: boolean;
  };
}

/** In-memory file map used by tests and dry-run. */
export type RemediateFileMap = Map<string, string>;
