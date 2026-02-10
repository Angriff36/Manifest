import { AllowlistMatcher } from './allowlist.js';
import { type GuardReport } from './report.js';
export interface RunOptions {
    input: Record<string, unknown>;
    generatorPath: string;
    allowlist?: AllowlistMatcher;
}
export interface GeneratorModule {
    generate: (input: unknown, options?: unknown) => unknown;
}
export declare function runGuard(opts: RunOptions): Promise<GuardReport>;
