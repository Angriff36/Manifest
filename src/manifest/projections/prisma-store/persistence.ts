import type { IR, IREntity, IRStore } from '../../ir.js';

const PERSISTENT_TARGETS: ReadonlySet<IRStore['target']> = new Set([
  'durable',
  'postgres',
  'supabase',
]);

export function isPersistentTarget(target: IRStore['target']): boolean {
  return PERSISTENT_TARGETS.has(target);
}

export function collectDurableEntities(ir: IR): IREntity[] {
  const storeByEntity = new Map<string, IRStore['target']>();
  for (const s of ir.stores) storeByEntity.set(s.entity, s.target);

  const entities: IREntity[] = [];
  for (const entity of ir.entities) {
    if ((entity as IREntity & { external?: boolean }).external === true) continue;
    const target = storeByEntity.get(entity.name);
    if (target === undefined || !isPersistentTarget(target)) continue;
    entities.push(entity);
  }
  return entities;
}
