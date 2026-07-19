/**
 * Deployed storage-name change protection for naming.normalization.
 *
 * When prior projection metadata is available, a storage rename without an
 * explicit legacy mapping is diagnosed per `naming.storageNameChange`.
 * Legacy mappings always emit a clear warning (never silent).
 */

import type { ResolvedNamingConfig, NamingConfigDiagnostic } from './naming-config.js';
import { nameKey } from './canonical-names.js';

/** Prior entity → table / Entity.field → column names from a previous generate. */
export interface PriorStorageSnapshot {
  tables?: Record<string, string>;
  fields?: Record<string, string>;
}

export interface ProposedStorageNames {
  /** Canonical Manifest entity name → table/collection about to be generated. */
  tables: Record<string, string>;
  /** `Entity.field` or `Entity.relationship` → column about to be generated. */
  fields?: Record<string, string>;
}

/**
 * Diagnose storage renames and mapping collisions for one projection.
 * No-op when normalization is off or storageNameChange is off (unless
 * legacy mappings are active — those always warn).
 */
export function detectStorageNameChanges(
  policy: ResolvedNamingConfig,
  projection: 'convex' | 'prisma',
  proposed: ProposedStorageNames,
  prior?: PriorStorageSnapshot | null,
): NamingConfigDiagnostic[] {
  const diags: NamingConfigDiagnostic[] = [];
  const legacy = policy.projections[projection];

  if (legacy?.tables) {
    for (const [entity, table] of Object.entries(legacy.tables)) {
      diags.push({
        severity: 'warning',
        message:
          `Legacy ${projection} table mapping active: entity '${entity}' → storage '${table}'. ` +
          `Manifest canonical name stays '${entity}'; application-facing APIs are unchanged.`,
      });
    }
  }
  if (legacy?.fields) {
    for (const [key, col] of Object.entries(legacy.fields)) {
      diags.push({
        severity: 'warning',
        message:
          `Legacy ${projection} field mapping active: '${key}' → storage '${col}'. ` +
          `Manifest-facing name stays canonical; only the storage boundary is remapped.`,
      });
    }
  }

  // Collision: two canonical symbols → same storage name (incompatible).
  const tableOwners = new Map<string, string>();
  for (const [entity, table] of Object.entries(proposed.tables)) {
    const mapped = legacy?.tables?.[entity] ?? table;
    const k = nameKey(mapped);
    const prev = tableOwners.get(k);
    if (prev && prev !== entity) {
      diags.push({
        severity: 'error',
        message: `Storage table collision on ${projection}: entities '${prev}' and '${entity}' both map to '${mapped}'.`,
      });
    } else {
      tableOwners.set(k, entity);
    }
  }

  const fieldOwners = new Map<string, string>();
  for (const [key, col] of Object.entries({
    ...(proposed.fields ?? {}),
    ...(legacy?.fields ?? {}),
  })) {
    const entity = key.split('.')[0] ?? '';
    const storage = legacy?.fields?.[key] ?? col;
    const ownerKey = `${entity}::${nameKey(storage)}`;
    const prev = fieldOwners.get(ownerKey);
    if (prev && prev !== key) {
      diags.push({
        severity: 'error',
        message: `Storage field collision on ${projection}: '${prev}' and '${key}' both map to '${storage}' on '${entity}'.`,
      });
    } else {
      fieldOwners.set(ownerKey, key);
    }
  }

  if (!policy.normalization || policy.storageNameChange === 'off' || !prior) {
    return diags;
  }

  const sev = policy.storageNameChange === 'warn' ? 'warning' : 'error';

  for (const [entity, newTable] of Object.entries(proposed.tables)) {
    const oldTable = prior.tables?.[entity];
    if (!oldTable || nameKey(oldTable) === nameKey(newTable)) continue;
    const mapped = legacy?.tables?.[entity];
    if (mapped && nameKey(mapped) === nameKey(oldTable)) continue; // explicit keep-old mapping
    if (mapped) continue; // explicit remap acknowledged
    diags.push({
      severity: sev,
      message:
        `Deployed ${projection} table rename blocked for '${entity}': was '${oldTable}', would become '${newTable}'. ` +
        `Add naming.projections.${projection}.tables.${entity}: '${oldTable}' (or the new name after migration), ` +
        `or set naming.storageNameChange: off.`,
    });
  }

  for (const [key, newCol] of Object.entries(proposed.fields ?? {})) {
    const oldCol = prior.fields?.[key];
    if (!oldCol || nameKey(oldCol) === nameKey(newCol)) continue;
    const mapped = legacy?.fields?.[key];
    if (mapped) continue;
    diags.push({
      severity: sev,
      message:
        `Deployed ${projection} field rename blocked for '${key}': was '${oldCol}', would become '${newCol}'. ` +
        `Add naming.projections.${projection}.fields['${key}']: '${oldCol}' after confirming migration, ` +
        `or set naming.storageNameChange: off.`,
    });
  }

  return diags;
}
