import { hashValue } from './hash.js';
import { resolveLabel, resolveRisk } from './config.js';
function flattenJson(obj, prefix = '') {
    const result = new Map();
    if (obj === null || obj === undefined || typeof obj !== 'object') {
        result.set(prefix, obj);
        return result;
    }
    if (Array.isArray(obj)) {
        if (obj.length === 0) {
            result.set(prefix, obj);
            return result;
        }
        for (let i = 0; i < obj.length; i++) {
            const key = prefix ? `${prefix}[${i}]` : `[${i}]`;
            for (const [k, v] of flattenJson(obj[i], key)) {
                result.set(k, v);
            }
        }
        return result;
    }
    const entries = Object.entries(obj);
    if (entries.length === 0) {
        result.set(prefix, obj);
        return result;
    }
    for (const [key, value] of entries) {
        const fullPath = prefix ? `${prefix}.${key}` : key;
        for (const [k, v] of flattenJson(value, fullPath)) {
            result.set(k, v);
        }
    }
    return result;
}
export function computeDiff(before, after, config) {
    const beforeFlat = flattenJson(before);
    const afterFlat = flattenJson(after);
    const allPaths = new Set([
        ...beforeFlat.keys(),
        ...afterFlat.keys(),
    ]);
    const sortedPaths = Array.from(allPaths).sort();
    const changes = [];
    for (const path of sortedPaths) {
        const inBefore = beforeFlat.has(path);
        const inAfter = afterFlat.has(path);
        const beforeVal = beforeFlat.get(path);
        const afterVal = afterFlat.get(path);
        if (inBefore && inAfter) {
            const bHash = hashValue(beforeVal);
            const aHash = hashValue(afterVal);
            if (bHash !== aHash) {
                changes.push({
                    path,
                    changeType: 'changed',
                    beforeHash: bHash,
                    afterHash: aHash,
                    label: resolveLabel(path, config),
                    risk: resolveRisk(path, config),
                });
            }
        }
        else if (inBefore && !inAfter) {
            changes.push({
                path,
                changeType: 'removed',
                beforeHash: hashValue(beforeVal),
                afterHash: null,
                label: resolveLabel(path, config),
                risk: resolveRisk(path, config),
            });
        }
        else if (!inBefore && inAfter) {
            changes.push({
                path,
                changeType: 'added',
                beforeHash: null,
                afterHash: hashValue(afterVal),
                label: resolveLabel(path, config),
                risk: resolveRisk(path, config),
            });
        }
    }
    return {
        totalChanges: changes.length,
        added: changes.filter((c) => c.changeType === 'added').length,
        removed: changes.filter((c) => c.changeType === 'removed').length,
        changed: changes.filter((c) => c.changeType === 'changed').length,
        highRiskCount: changes.filter((c) => c.risk === 'high').length,
        changes,
    };
}
//# sourceMappingURL=diff.js.map