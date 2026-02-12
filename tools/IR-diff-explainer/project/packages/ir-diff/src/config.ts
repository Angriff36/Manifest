import { readFile } from 'node:fs/promises';
import type { DiffConfig } from './types.js';

const DEFAULT_CONFIG: DiffConfig = {
  labels: [],
  highRisk: [],
};

export async function loadConfig(configPath?: string): Promise<DiffConfig> {
  if (!configPath) return DEFAULT_CONFIG;

  const raw = await readFile(configPath, 'utf-8');
  const parsed = JSON.parse(raw);

  return {
    labels: Array.isArray(parsed.labels) ? parsed.labels : [],
    highRisk: Array.isArray(parsed.highRisk) ? parsed.highRisk : [],
  };
}

export function resolveLabel(path: string, config: DiffConfig): string | null {
  for (const mapping of config.labels) {
    if (path === mapping.pathPrefix || path.startsWith(mapping.pathPrefix + '.')) {
      return mapping.label;
    }
  }
  return null;
}

export function resolveRisk(path: string, config: DiffConfig): 'high' | 'low' {
  for (const prefix of config.highRisk) {
    if (path === prefix || path.startsWith(prefix + '.')) {
      return 'high';
    }
  }
  return 'low';
}
