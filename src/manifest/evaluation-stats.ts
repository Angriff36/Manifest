/**
 * Observable evaluation counters for step-count / depth verification.
 * Populated at the end of each top-level evaluation entry point
 * (runCommand, createInstance, updateInstance, checkConstraints, evaluateComputed).
 *
 * Spec: docs/spec/manifest-vnext.md § Nonconformance — Performance guardrails.
 */

export interface EvaluationStats {
  /** Expression evaluation steps consumed in the last top-level entry point */
  stepsUsed: number;
  /** Highest nesting depth reached during the last top-level entry point */
  peakDepth: number;
  /** Configured maxEvaluationSteps for that entry point */
  maxSteps: number;
  /** Configured maxExpressionDepth for that entry point */
  maxDepth: number;
}
