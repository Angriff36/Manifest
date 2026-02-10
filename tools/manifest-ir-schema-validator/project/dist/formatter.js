import { basename } from "node:path";
const PASS = "\u2705";
const FAIL = "\u274C";
function formatFileResult(result) {
    const name = basename(result.filePath);
    const lines = [];
    if (result.valid) {
        lines.push(`${PASS} ${name}`);
        return lines.join("\n");
    }
    lines.push(`${FAIL} ${name}`);
    if (result.parseError) {
        lines.push(`   Parse error: ${result.parseError}`);
        return lines.join("\n");
    }
    for (const err of result.errors) {
        const location = err.path || "/";
        lines.push(`   ${location}: ${err.message} [${err.keyword}]`);
    }
    return lines.join("\n");
}
export function formatSingleResult(result) {
    return formatFileResult(result);
}
export function formatBatchSummary(summary) {
    const lines = [];
    for (const result of summary.results) {
        lines.push(formatFileResult(result));
    }
    lines.push("");
    lines.push("---");
    lines.push(`Total: ${String(summary.total)} | Passed: ${String(summary.passed)} | Failed: ${String(summary.failed)}`);
    return lines.join("\n");
}
//# sourceMappingURL=formatter.js.map