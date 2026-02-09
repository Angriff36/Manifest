import { createHash } from 'node:crypto';
import type { IR, HarnessOutput } from '../types/index.js';

function sortKeys(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}

export function stableStringify(obj: unknown): string {
  return JSON.stringify(obj, sortKeys);
}

export function prettyFormat(obj: unknown): string {
  return JSON.stringify(obj, sortKeys, 2);
}

export function hashIR(ir: IR): string {
  const canonical = stableStringify(ir);
  const hash = createHash('sha256').update(canonical).digest('hex');
  return `sha256:${hash}`;
}

export function formatOutput(output: HarnessOutput): string {
  return prettyFormat(output);
}

export function normalizeForSnapshot(output: HarnessOutput): HarnessOutput {
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
