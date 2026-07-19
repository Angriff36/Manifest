/**
 * Config G2 — CI exit policy for `manifest validate`.
 *
 * Language diagnostic severities (ok/warn/block) are unchanged. This policy
 * only decides whether the CLI process exits non-zero after reporting.
 */

export const VALIDATION_FAIL_ON_VALUES = ['block', 'warn', 'never'] as const;

export type ValidationFailOn = (typeof VALIDATION_FAIL_ON_VALUES)[number];

export function isValidationFailOn(value: unknown): value is ValidationFailOn {
  return (
    typeof value === 'string' && (VALIDATION_FAIL_ON_VALUES as readonly string[]).includes(value)
  );
}

/**
 * Resolves the effective failOn: CLI flag wins, then config, then `block`.
 */
export function resolveValidationFailOn(
  cliFailOn: string | undefined,
  configFailOn: unknown,
): ValidationFailOn {
  if (isValidationFailOn(cliFailOn)) return cliFailOn;
  if (isValidationFailOn(configFailOn)) return configFailOn;
  return 'block';
}

/** Pure gate: should `manifest validate` exit non-zero? */
export class ValidationGatePolicy {
  constructor(private readonly failOn: ValidationFailOn = 'block') {}

  get policy(): ValidationFailOn {
    return this.failOn;
  }

  shouldExitNonZero(errorCount: number, warningCount: number): boolean {
    if (this.failOn === 'never') return false;
    if (errorCount > 0) return true;
    if (this.failOn === 'warn' && warningCount > 0) return true;
    return false;
  }
}
