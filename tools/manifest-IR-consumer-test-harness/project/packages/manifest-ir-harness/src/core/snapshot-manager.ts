import type { HarnessOutput } from '../types/index.js';
import { normalizeForSnapshot, prettyFormat } from './output-formatter.js';

export function toSnapshotString(output: HarnessOutput): string {
  const normalized = normalizeForSnapshot(output);
  return prettyFormat(normalized);
}

export function extractAssertionSummary(output: HarnessOutput): {
  totalSteps: number;
  passed: number;
  failed: number;
  failedDetails: Array<{
    step: number;
    check: string;
    expected: unknown;
    actual: unknown;
  }>;
} {
  const failedDetails: Array<{
    step: number;
    check: string;
    expected: unknown;
    actual: unknown;
  }> = [];

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
