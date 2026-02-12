import type { ExecutionResult } from '../types/index.js';
import { stripVolatileFields } from './output-formatter.js';

export function prepareForSnapshot(result: ExecutionResult): Record<string, unknown> {
  const stripped = stripVolatileFields(result);
  return JSON.parse(JSON.stringify(stripped)) as Record<string, unknown>;
}

export function createSnapshotName(fixtureName: string): string {
  return `fixture-${fixtureName}`;
}
