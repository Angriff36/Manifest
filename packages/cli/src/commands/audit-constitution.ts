/**
 * manifest audit-constitution (DEPRECATED ALIAS)
 *
 * This name is retained as a backwards-compatible alias for callers that
 * predate the rename to `audit-governance`. New code SHOULD import from
 * `./audit-governance` directly. This module forwards every call and
 * preserves the result shape; the CLI surface emits a deprecation warning
 * on stderr when the alias is invoked.
 */

import {
  auditGovernanceCommand,
  type AuditGovernanceOptions,
  type AuditGovernanceResult,
} from './audit-governance.js';

/** @deprecated use AuditGovernanceOptions from './audit-governance'. */
export type AuditConstitutionOptions = AuditGovernanceOptions;

/** @deprecated use AuditGovernanceResult from './audit-governance'. */
export type AuditConstitutionResult = AuditGovernanceResult;

/**
 * @deprecated use `auditGovernanceCommand` from './audit-governance'.
 * Forwards to the canonical implementation without modification.
 */
export async function auditConstitutionCommand(
  options: AuditConstitutionOptions = {}
): Promise<AuditConstitutionResult> {
  return auditGovernanceCommand(options);
}
