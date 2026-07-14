/**
 * Shared constraint polarity / severity pass-fail rules.
 * Source of truth: docs/spec/semantics.md § Constraint Polarity + Constraint Evaluation.
 * RuntimeEngine and the WASM-compatible evaluator MUST use this — never name heuristics.
 */

export type ConstraintSeverity = 'ok' | 'warn' | 'block';

export interface ConstraintPolarityOptions {
  /** When true, a truthy expression is a violation. Default / absent: positive polarity. */
  failWhen?: boolean;
  /** `ok` forces passed=true; `warn`/`block` use expression + failWhen. Default: block. */
  severity?: ConstraintSeverity;
}

/**
 * Whether a constraint expression result counts as passed.
 * Runtimes MUST NOT inspect constraint names for polarity.
 */
export function constraintExpressionPasses(
  expressionResult: unknown,
  options: ConstraintPolarityOptions = {},
): boolean {
  const raw = !!expressionResult;
  const rawPassed = options.failWhen ? !raw : raw;
  return (options.severity ?? 'block') === 'ok' ? true : rawPassed;
}
