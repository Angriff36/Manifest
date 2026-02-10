import { createHash } from 'node:crypto';
function sortKeys(_key, value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const sorted = {};
        for (const k of Object.keys(value).sort()) {
            sorted[k] = value[k];
        }
        return sorted;
    }
    return value;
}
export function stableStringify(obj) {
    return JSON.stringify(obj, sortKeys);
}
export function prettyFormat(obj) {
    return JSON.stringify(obj, sortKeys, 2);
}
export function hashIR(ir) {
    const canonical = stableStringify(ir);
    const hash = createHash('sha256').update(canonical).digest('hex');
    return `sha256:${hash}`;
}
export function formatOutput(output) {
    return prettyFormat(output);
}
export function normalizeForSnapshot(output) {
    return {
        ...output,
        harness: {
            ...output.harness,
            executedAt: '[TIMESTAMP]',
        },
        source: {
            ...output.source,
            irHash: '[IR_HASH]',
        },
    };
}
//# sourceMappingURL=output-formatter.js.map