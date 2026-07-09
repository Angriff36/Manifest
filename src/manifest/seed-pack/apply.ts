/**
 * Two-phase seed pack apply + clear.
 *
 * Phase 1: create scalar rows (no pack FK wiring).
 * Phase 2: update relationship fields via seedKey → instanceId map.
 * Idempotent on packId + version + tenantId via SampleDataRow.
 */

import type { IR } from '../ir.js';
import type { EntityInstance, Store } from '../runtime-engine.js';
import {
  SAMPLE_DATA_ROW_ENTITY,
  isBlankCell,
  type SampleDataRowRecord,
  type SeedPack,
} from './types.js';
import {
  matchesPackRun,
  toSampleDataRowRecord,
} from './sample-data-row.js';
import {
  findEntity,
  findRelationship,
  relationshipColumnNames,
  seedablePropertyNames,
} from './template.js';

export type StoreProvider = (entityName: string) => Store<EntityInstance>;

export interface ApplySeedPackOptions {
  ir: IR;
  pack: SeedPack;
  tenantId: string;
  getStore: StoreProvider;
  /** Inject tenantId on every created row when true (default true). */
  injectTenantId?: boolean;
}

export interface ApplySeedPackResult {
  applied: boolean;
  skipped: boolean;
  reason?: string;
  created: number;
  related: number;
  seedKeyToId: Record<string, string>;
}

export interface ClearSeedPackOptions {
  tenantId: string;
  getStore: StoreProvider;
  packId?: string;
  version?: string;
  /** Entity names that may have been seeded (from pack or IR). */
  entities: string[];
}

export interface ClearSeedPackResult {
  deletedInstances: number;
  deletedTrackingRows: number;
}

function parseScalar(raw: string): unknown {
  const t = raw.trim();
  if (t === '') return undefined;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
}

function trackingKey(entity: string, seedKey: string): string {
  return `${entity}:${seedKey}`;
}

async function loadTrackingRows(
  getStore: StoreProvider,
  tenantId: string,
  packId?: string,
  version?: string
): Promise<SampleDataRowRecord[]> {
  const store = getStore(SAMPLE_DATA_ROW_ENTITY);
  const all = await store.getAll();
  return all
    .map((r) => r as unknown as SampleDataRowRecord)
    .filter((r) => matchesPackRun(r, tenantId, packId, version));
}

export async function applySeedPack(
  options: ApplySeedPackOptions
): Promise<ApplySeedPackResult> {
  const { ir, pack, tenantId, getStore } = options;
  const injectTenantId = options.injectTenantId !== false;

  const existing = await loadTrackingRows(
    getStore,
    tenantId,
    pack.meta.packId,
    pack.meta.version
  );
  if (existing.length > 0) {
    const map: Record<string, string> = {};
    for (const row of existing) {
      map[trackingKey(row.entity, row.seedKey)] = row.instanceId;
    }
    return {
      applied: false,
      skipped: true,
      reason: 'pack already applied for tenant',
      created: 0,
      related: 0,
      seedKeyToId: map,
    };
  }

  const seedKeyToId: Record<string, string> = {};
  let created = 0;
  let related = 0;
  const trackingStore = getStore(SAMPLE_DATA_ROW_ENTITY);

  // Phase 1 — create scalars
  for (const table of pack.tables) {
    const entity = findEntity(ir, table.entity);
    if (!entity) {
      throw new Error(`Cannot apply: entity "${table.entity}" missing from IR`);
    }
    const store = getStore(table.entity);
    const props = seedablePropertyNames(entity);
    const relCols = relationshipColumnNames(entity);

    for (const row of table.rows) {
      const data: Record<string, unknown> = {};
      for (const col of table.columns) {
        if (col === 'seedKey') continue;
        if (relCols.has(col)) continue; // phase 2
        if (!props.has(col)) continue;
        if (col === 'tenantId' && injectTenantId) continue;
        if (isBlankCell(row[col])) continue;
        data[col] = parseScalar(row[col]!);
      }
      if (injectTenantId) data.tenantId = tenantId;
      const instance = await store.create(data as Partial<EntityInstance>);
      const instanceId = String(instance.id);
      seedKeyToId[trackingKey(table.entity, row.seedKey)] = instanceId;
      created++;
      await trackingStore.create(
        toSampleDataRowRecord({
          tenantId,
          packId: pack.meta.packId,
          version: pack.meta.version,
          entity: table.entity,
          seedKey: row.seedKey,
          instanceId,
        }) as unknown as Partial<EntityInstance>
      );
    }
  }

  // Phase 2 — wire relationships
  for (const table of pack.tables) {
    const entity = findEntity(ir, table.entity);
    if (!entity) continue;
    const store = getStore(table.entity);
    const relCols = relationshipColumnNames(entity);

    for (const row of table.rows) {
      const patch: Record<string, unknown> = {};
      let any = false;
      for (const col of relCols) {
        const ref = row[col];
        if (isBlankCell(ref)) continue;
        const rel = findRelationship(entity, col);
        if (!rel) continue;
        const targetId = seedKeyToId[trackingKey(rel.target, ref!.trim())];
        if (!targetId) {
          throw new Error(
            `Apply phase 2: ${table.entity}/${row.seedKey} FK ${col} → ${ref} not in seedKey map`
          );
        }
        // Prefer FK field names when present on the relationship
        const fkFields = rel.foreignKey?.fields;
        if (fkFields && fkFields.length === 1) {
          patch[fkFields[0]!] = targetId;
        } else {
          patch[`${rel.name}Id`] = targetId;
          patch[col] = targetId;
        }
        any = true;
      }
      if (!any) continue;
      const instanceId = seedKeyToId[trackingKey(table.entity, row.seedKey)];
      if (!instanceId) continue;
      await store.update(instanceId, patch as Partial<EntityInstance>);
      related++;
    }
  }

  return {
    applied: true,
    skipped: false,
    created,
    related,
    seedKeyToId,
  };
}

export async function clearSeedPack(
  options: ClearSeedPackOptions
): Promise<ClearSeedPackResult> {
  const { tenantId, getStore, packId, version, entities } = options;
  const tracking = await loadTrackingRows(getStore, tenantId, packId, version);
  if (tracking.length === 0) {
    return { deletedInstances: 0, deletedTrackingRows: 0 };
  }

  // Null FKs among tracked rows first (best-effort), then delete instances, then tracking.
  const byEntity = new Map<string, SampleDataRowRecord[]>();
  for (const row of tracking) {
    const list = byEntity.get(row.entity) ?? [];
    list.push(row);
    byEntity.set(row.entity, list);
  }

  let deletedInstances = 0;
  // Delete in reverse entity list order (callers should pass dependents first if known)
  const order = [...entities].reverse();
  const seen = new Set<string>();
  for (const entityName of [...order, ...byEntity.keys()]) {
    if (seen.has(entityName)) continue;
    seen.add(entityName);
    const rows = byEntity.get(entityName);
    if (!rows) continue;
    const store = getStore(entityName);
    for (const row of rows) {
      const ok = await store.delete(row.instanceId);
      if (ok) deletedInstances++;
    }
  }

  const trackingStore = getStore(SAMPLE_DATA_ROW_ENTITY);
  let deletedTrackingRows = 0;
  for (const row of tracking) {
    const ok = await trackingStore.delete(row.id);
    if (ok) deletedTrackingRows++;
  }

  return { deletedInstances, deletedTrackingRows };
}

/** Test helper: in-memory Store implementation. */
export function createMemorySeedStore(
  generateId: () => string = () => crypto.randomUUID()
): Store<EntityInstance> {
  const items = new Map<string, EntityInstance>();
  return {
    async getAll() {
      return [...items.values()];
    },
    async getById(id: string) {
      return items.get(id);
    },
    async create(data) {
      const id = (data.id as string | undefined) || generateId();
      const item = { ...data, id } as EntityInstance;
      items.set(id, item);
      return item;
    },
    async update(id, data) {
      const existing = items.get(id);
      if (!existing) return undefined;
      const updated = { ...existing, ...data, id } as EntityInstance;
      items.set(id, updated);
      return updated;
    },
    async delete(id) {
      return items.delete(id);
    },
    async clear() {
      items.clear();
    },
  };
}
