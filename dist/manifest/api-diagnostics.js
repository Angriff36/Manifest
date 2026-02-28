/**
 * Normalize a CommandResult into a consistent API response shape.
 *
 * This function bridges the gap between the runtime's CommandResult structure
 * and a consistent API contract that surfaces all diagnostic information.
 *
 * @param entityName - Name of the entity the command operates on
 * @param commandName - Name of the command being executed
 * @param result - CommandResult from RuntimeEngine.runCommand()
 * @returns Normalized result with consistent diagnostic structure
 */
export function normalizeCommandResult(entityName, commandName, result) {
    const diagnostics = [];
    if (result.success) {
        // Success case: include warnings from constraint outcomes
        if (result.constraintOutcomes) {
            for (const outcome of result.constraintOutcomes) {
                if (outcome.severity === 'warn' && !outcome.passed) {
                    diagnostics.push({
                        kind: 'constraint_warn',
                        entity: entityName,
                        command: commandName,
                        ruleName: outcome.code,
                        message: outcome.message || outcome.formatted,
                        resolved: outcome.resolved,
                        details: outcome.details,
                    });
                }
            }
        }
        return {
            success: true,
            data: result.result,
            events: result.emittedEvents,
            diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
        };
    }
    // Failure case: convert all failure modes to diagnostics
    // Guard failure
    if (result.guardFailure) {
        diagnostics.push(convertGuardFailure(entityName, commandName, result.guardFailure));
    }
    // Policy denial
    if (result.policyDenial) {
        diagnostics.push(convertPolicyDenial(entityName, commandName, result.policyDenial));
    }
    // Blocked constraints
    if (result.constraintOutcomes) {
        for (const outcome of result.constraintOutcomes) {
            if (outcome.severity === 'block' && !outcome.passed) {
                diagnostics.push({
                    kind: 'constraint_block',
                    entity: entityName,
                    command: commandName,
                    ruleName: outcome.code,
                    message: outcome.message || outcome.formatted,
                    resolved: outcome.resolved,
                    details: outcome.details,
                });
            }
        }
    }
    // Generic runtime error (fallback)
    if (diagnostics.length === 0 && result.error) {
        diagnostics.push({
            kind: 'runtime_error',
            entity: entityName,
            command: commandName,
            message: result.error,
        });
    }
    return {
        success: false,
        error: result.error || 'Command failed',
        diagnostics,
        events: result.emittedEvents,
    };
}
/**
 * Convert a GuardFailure to a RuntimeDiagnostic
 */
function convertGuardFailure(entityName, commandName, guardFailure) {
    return {
        kind: 'guard_failure',
        entity: entityName,
        command: commandName,
        ruleName: `guard[${guardFailure.index}]`,
        message: guardFailure.formatted,
        resolved: guardFailure.resolved,
    };
}
/**
 * Convert a PolicyDenial to a RuntimeDiagnostic
 */
function convertPolicyDenial(entityName, commandName, policyDenial) {
    return {
        kind: 'policy_denial',
        entity: entityName,
        command: commandName,
        ruleName: policyDenial.policyName,
        message: policyDenial.message || policyDenial.formatted,
        resolved: policyDenial.resolved,
    };
}
//# sourceMappingURL=api-diagnostics.js.map