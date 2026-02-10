import type { DiffConfig } from './types.js';
export declare function loadConfig(configPath?: string): Promise<DiffConfig>;
export declare function resolveLabel(path: string, config: DiffConfig): string | null;
export declare function resolveRisk(path: string, config: DiffConfig): 'high' | 'low';
