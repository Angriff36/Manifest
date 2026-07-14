/**
 * Shared persistence classification for Convex projection surfaces.
 * Kept separate so schema/functions/privacy/computed/capabilities can share
 * without circular imports through generator.ts.
 */

import type { IR, IREntity, IRStore } from '../../ir';

const PERSISTENT_TARGETS: ReadonlySet<IRStore['target']> = new Set([
  'durable',
  'postgres',
  'supabase',
]);

export function isPersistentStoreTarget(target: IRStore['target']): boolean {
  return PERSISTENT_TARGETS.has(target);
}

export function isPersistentEntity(entity: IREntity, ir: IR): boolean {
  if ((entity as { external?: boolean }).external === true) return false;
  const store = ir.stores.find((s) => s.entity === entity.name);
  return !!store && isPersistentStoreTarget(store.target);
}
