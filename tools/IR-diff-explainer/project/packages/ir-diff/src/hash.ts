import { createHash } from 'node:crypto';

export function hashValue(value: unknown): string {
  const serialized = JSON.stringify(value, null, 0);
  return createHash('sha256').update(serialized).digest('hex').slice(0, 12);
}
