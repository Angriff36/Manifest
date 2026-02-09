import type { DiffSummary } from './types.js';

export function formatSummaryJson(summary: DiffSummary): string {
  return JSON.stringify(summary, null, 2);
}
