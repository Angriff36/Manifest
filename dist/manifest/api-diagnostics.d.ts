import type { CommandResult, EmittedEvent } from './runtime-engine.js';
/**
 * Normalized diagnostic structure for API responses.
 * Provides a consistent shape for all runtime failures at the API boundary.
 */
export interface RuntimeDiagnostic {
    kind: 'guard_failure' | 'policy_denial' | 'constraint_block' | 'constraint_warn' | 'runtime_error';
    entity: string;
    command: string;
    ruleName?: string;
    message: string;
    resolved?: Array<{
        expression: string;
        value: unknown;
    }>;
    details?: Record<string, unknown>;
}
/**
 * Normalized command result for API responses.
 * Converts runtime CommandResult into a consistent API contract.
 */
export interface NormalizedCommandResult {
    success: boolean;
    error?: string;
    diagnostics?: RuntimeDiagnostic[];
    data?: unknown;
    events: EmittedEvent[];
}
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
export declare function normalizeCommandResult(entityName: string, commandName: string, result: CommandResult): NormalizedCommandResult;
//# sourceMappingURL=api-diagnostics.d.ts.map