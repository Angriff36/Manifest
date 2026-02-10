import { normalizeForSnapshot, prettyFormat } from './output-formatter.js';
export function toSnapshotString(output) {
    const normalized = normalizeForSnapshot(output);
    return prettyFormat(normalized);
}
export function extractAssertionSummary(output) {
    const failedDetails = [];
    for (const step of output.execution.steps) {
        for (const detail of step.assertions.details) {
            if (!detail.passed) {
                failedDetails.push({
                    step: step.step,
                    check: detail.check,
                    expected: detail.expected,
                    actual: detail.actual,
                });
            }
        }
    }
    return {
        totalSteps: output.summary.totalSteps,
        passed: output.summary.passed,
        failed: output.summary.failed,
        failedDetails,
    };
}
//# sourceMappingURL=snapshot-manager.js.map