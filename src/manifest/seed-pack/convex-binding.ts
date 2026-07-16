/**
 * Convex application seed binding — public API on `@angriff36/manifest/seed-pack`.
 *
 * Maps an IR sample seed pack to Convex mutation exports (`Entity_create`) and
 * emits a runner script that inserts rows via `ConvexHttpClient`. This is the
 * Manifest proof that seed-pack integrates into the Convex application contract.
 */

import type { IR, IRCommand } from '../ir.js';
import type { SeedPack, SeedEntityTable, SeedRow } from './types.js';
import { isBlankCell } from './types.js';
import { findEntity, relationshipColumnNames } from './template.js';
import {
  heuristicFillForType,
  isConvexPersistentEntity,
  rowToArgsLiteral,
} from './convex-seed-args.js';

export interface ConvexSeedEntityBinding {
  entity: string;
  /** Convex mutations export name: `${entity}_${command}`. */
  createMutation: string | null;
  seedKeys: string[];
  columns: string[];
  rowCount: number;
}

export interface ConvexSeedBinding {
  packId: string;
  version: string;
  entities: ConvexSeedEntityBinding[];
  pathHint: string;
}

export interface GenerateConvexSeedScriptOptions {
  /** Import path for ConvexHttpClient (default `convex/browser`). */
  convexClientImport?: string;
  /** Import path for generated `api` (default `../convex/_generated/api`). */
  apiImportPath?: string;
  /** Output path hint. */
  output?: string;
}

const DEFAULTS = {
  convexClientImport: 'convex/browser',
  apiImportPath: '../convex/_generated/api',
  output: 'scripts/seed-convex.ts',
} as const;

function findCreateCommand(ir: IR, entityName: string): IRCommand | undefined {
  return ir.commands.find((c) => c.entity === entityName && c.name === 'create');
}

function tableBinding(ir: IR, table: SeedEntityTable): ConvexSeedEntityBinding {
  const create = findCreateCommand(ir, table.entity);
  const persistent = isConvexPersistentEntity(ir, table.entity);
  const seedKeys = table.rows
    .map((r) => r.seedKey)
    .filter((k): k is string => typeof k === 'string' && !isBlankCell(k));
  return {
    entity: table.entity,
    createMutation: create && persistent ? `${table.entity}_${create.name}` : null,
    seedKeys,
    columns: [...table.columns],
    rowCount: table.rows.length,
  };
}

/**
 * Describe how a seed pack binds to Convex create mutations for this IR.
 */
export function describeConvexSeedBinding(ir: IR, pack: SeedPack): ConvexSeedBinding {
  return {
    packId: pack.meta.packId,
    version: pack.meta.version,
    entities: pack.tables.map((t) => tableBinding(ir, t)),
    pathHint: DEFAULTS.output,
  };
}

function propertyTypeName(ir: IR, entityName: string, col: string): string {
  const entity = findEntity(ir, entityName);
  if (!entity) return 'string';
  const prop = entity.properties.find((p) => p.name === col);
  if (prop) return (prop.type?.name ?? 'string').toLowerCase();
  return 'string';
}

/** Deterministic sync fill for blank / `{{fill}}` cells (type-aware). */
function syncHeuristicFill(ir: IR, pack: SeedPack): SeedPack {
  const tables: SeedEntityTable[] = [];
  for (const table of pack.tables) {
    const entity = findEntity(ir, table.entity);
    const allowedSeedKeys: Record<string, string[]> = {};
    if (entity) {
      for (const col of relationshipColumnNames(entity)) {
        const rel = entity.relationships.find((r) => r.name === col);
        if (!rel) continue;
        const target = pack.tables.find((t) => t.entity === rel.target);
        allowedSeedKeys[col] = (target?.rows ?? [])
          .map((r) => r.seedKey)
          .filter((k): k is string => typeof k === 'string' && !isBlankCell(k));
      }
    }
    const filledRows = table.rows.map((row, rowIndex) => {
      const out: SeedRow = { ...row };
      for (const col of table.columns) {
        if (col === 'seedKey') continue;
        if (!isBlankCell(out[col])) continue;
        const allowed = allowedSeedKeys[col];
        if (allowed && allowed.length > 0) {
          out[col] = allowed[rowIndex % allowed.length]!;
          continue;
        }
        out[col] = heuristicFillForType(
          propertyTypeName(ir, table.entity, col),
          col,
          table.entity,
          rowIndex,
          typeof row.seedKey === 'string' ? row.seedKey : undefined,
        );
      }
      return out;
    });
    tables.push({ ...table, rows: filledRows });
  }
  return { meta: { ...pack.meta }, tables };
}

/**
 * Generate a Convex seed runner that calls create mutations for each pack row.
 * Entities without a Convex-persistent `create` mutation are skipped.
 * Blank/`{{fill}}` cells are type-heuristically filled; rows that still yield
 * empty args are skipped (never emit `mutation(..., {} as any)`).
 */
export function generateConvexSeedScript(
  ir: IR,
  pack: SeedPack,
  options?: GenerateConvexSeedScriptOptions,
): { code: string; binding: ConvexSeedBinding } {
  const binding = describeConvexSeedBinding(ir, pack);
  const clientImport = options?.convexClientImport ?? DEFAULTS.convexClientImport;
  const apiImport = options?.apiImportPath ?? DEFAULTS.apiImportPath;
  const pathHint = options?.output ?? DEFAULTS.output;
  binding.pathHint = pathHint;

  const filledPack = syncHeuristicFill(ir, pack);

  const lines: string[] = [];
  lines.push(`/** Generated by Manifest seed-pack Convex binding — do not edit by hand. */`);
  lines.push(`import { ConvexHttpClient } from ${JSON.stringify(clientImport)};`);
  lines.push(`import { api } from ${JSON.stringify(apiImport)};`);
  lines.push('');
  lines.push(`const PACK_ID = ${JSON.stringify(pack.meta.packId)};`);
  lines.push(`const PACK_VERSION = ${JSON.stringify(pack.meta.version)};`);
  lines.push('');
  lines.push(`export async function seedConvex(deploymentUrl: string): Promise<void> {`);
  lines.push(`  const client = new ConvexHttpClient(deploymentUrl);`);
  lines.push(`  void PACK_ID;`);
  lines.push(`  void PACK_VERSION;`);

  for (const table of filledPack.tables) {
    const b = binding.entities.find((e) => e.entity === table.entity)!;
    if (!b.createMutation) {
      const reason = !isConvexPersistentEntity(ir, table.entity)
        ? 'not a Convex-persistent store'
        : 'no create command in IR';
      lines.push(
        `  // skip ${table.entity}: ${reason} (${table.rows.length} rows unused)`,
      );
      continue;
    }
    const create = findCreateCommand(ir, table.entity);
    lines.push(`  // ${table.entity} → api.mutations.${b.createMutation}`);
    for (const row of table.rows) {
      const args = rowToArgsLiteral(ir, table.entity, row, table.columns, create);
      if (args === '{  }' || args === '{}') {
        lines.push(
          `  // skip ${table.entity} row ${JSON.stringify(row.seedKey ?? '')}: no non-blank create args`,
        );
        continue;
      }
      lines.push(
        `  await client.mutation(api.mutations.${b.createMutation}, ${args} as any);`,
      );
    }
  }

  lines.push(`}`);
  lines.push('');
  lines.push(
    `export const MANIFEST_CONVEX_SEED_BINDING = ${JSON.stringify(
      {
        packId: binding.packId,
        version: binding.version,
        entities: binding.entities.map((e) => ({
          entity: e.entity,
          createMutation: e.createMutation,
          rowCount: e.rowCount,
        })),
      },
      null,
      2,
    )} as const;`,
  );
  lines.push('');

  return { code: lines.join('\n'), binding };
}
