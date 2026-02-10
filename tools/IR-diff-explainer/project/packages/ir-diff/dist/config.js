import { readFile } from 'node:fs/promises';
const DEFAULT_CONFIG = {
    labels: [],
    highRisk: [],
};
export async function loadConfig(configPath) {
    if (!configPath)
        return DEFAULT_CONFIG;
    const raw = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
        labels: Array.isArray(parsed.labels) ? parsed.labels : [],
        highRisk: Array.isArray(parsed.highRisk) ? parsed.highRisk : [],
    };
}
export function resolveLabel(path, config) {
    for (const mapping of config.labels) {
        if (path === mapping.pathPrefix || path.startsWith(mapping.pathPrefix + '.')) {
            return mapping.label;
        }
    }
    return null;
}
export function resolveRisk(path, config) {
    for (const prefix of config.highRisk) {
        if (path === prefix || path.startsWith(prefix + '.')) {
            return 'high';
        }
    }
    return 'low';
}
//# sourceMappingURL=config.js.map