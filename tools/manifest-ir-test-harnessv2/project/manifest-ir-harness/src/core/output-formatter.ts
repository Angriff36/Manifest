import type { ExecutionResult } from '../types/index.js';

function sortKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (typeof obj !== 'object') return obj;

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  for (const key of keys) {
    sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

export function formatOutput(result: ExecutionResult): string {
  const sorted = sortKeys(result);
  return JSON.stringify(sorted, null, 2);
}

export function stripVolatileFields(result: ExecutionResult): ExecutionResult {
  return {
    ...result,
    harness: {
      ...result.harness,
      executedAt: '[TIMESTAMP]',
    },
  };
}

export function formatForSnapshot(result: ExecutionResult): string {
  const stripped = stripVolatileFields(result);
  return formatOutput(stripped);
}
