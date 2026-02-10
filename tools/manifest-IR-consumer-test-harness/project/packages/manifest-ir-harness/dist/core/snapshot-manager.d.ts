import type { HarnessOutput } from '../types/index.js';
export declare function toSnapshotString(output: HarnessOutput): string;
export declare function extractAssertionSummary(output: HarnessOutput): {
    totalSteps: number;
    passed: number;
    failed: number;
    failedDetails: Array<{
        step: number;
        check: string;
        expected: unknown;
        actual: unknown;
    }>;
};
//# sourceMappingURL=snapshot-manager.d.ts.map