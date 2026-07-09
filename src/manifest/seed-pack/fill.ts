/**
 * Fill blank/placeholder cells in a seed pack.
 */

import type { IR } from '../ir.js';
import {
  isBlankCell,
  type SeedFillProvider,
  type SeedPack,
  type SeedRow,
} from './types.js';
import { findEntity, findRelationship, relationshipColumnNames } from './template.js';
import { createHeuristicFillProvider } from './fill-providers.js';

export type { SeedFillEntityInput, SeedFillProvider } from './types.js';

export interface FillSeedPackOptions {
  provider?: SeedFillProvider;
  /** When false (default), only blank/{{fill}} cells are written. */
  overwrite?: boolean;
}

function collectSeedKeys(pack: SeedPack, entity: string): string[] {
  const table = pack.tables.find((t) => t.entity === entity);
  if (!table) return [];
  return table.rows.map((r) => r.seedKey).filter(Boolean);
}

export async function fillSeedPack(
  ir: IR,
  pack: SeedPack,
  options: FillSeedPackOptions = {}
): Promise<SeedPack> {
  const overwrite = options.overwrite === true;
  const provider = options.provider ?? createHeuristicFillProvider();
  const tables = [];

  for (const table of pack.tables) {
    const entity = findEntity(ir, table.entity);
    const allowedSeedKeys: Record<string, string[]> = {};
    if (entity) {
      for (const col of relationshipColumnNames(entity)) {
        const rel = findRelationship(entity, col);
        if (!rel) continue;
        allowedSeedKeys[col] = collectSeedKeys(pack, rel.target);
      }
    }

    const filledRows = await provider.fillEntity({
      entityName: table.entity,
      columns: table.columns,
      rows: table.rows.map((r) => ({ ...r })),
      allowedSeedKeys,
      overwrite,
    });

    // Enforce blank-only merge at the library boundary (defense in depth)
    const merged = table.rows.map((original, i) => {
      const next = filledRows[i] ?? original;
      const out: SeedRow = { ...original };
      for (const col of table.columns) {
        if (col === 'seedKey') {
          out.seedKey = original.seedKey;
          continue;
        }
        if (overwrite || isBlankCell(original[col])) {
          out[col] = next[col] ?? original[col] ?? '';
        }
      }
      return out;
    });

    tables.push({ ...table, rows: merged });
  }

  return { meta: { ...pack.meta }, tables };
}
