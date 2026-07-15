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
  const seedKeys = table.rows
    .map((r) => r.seedKey)
    .filter((k): k is string => typeof k === 'string' && !isBlankCell(k));
  return {
    entity: table.entity,
    createMutation: create ? `${table.entity}_${create.name}` : null,
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

function createParamNames(cmd: IRCommand | undefined): Set<string> | undefined {
  if (!cmd) return undefined;
  return new Set((cmd.parameters ?? []).map((p) => p.name));
}

/** Map seed relationship column names (rel.name) → create param / FK property names. */
function seedColumnToParam(entityName: string, ir: IR, col: string): string {
  const entity = findEntity(ir, entityName);
  if (!entity) return col;
  const rel = entity.relationships.find((r) => r.name === col);
  if (!rel) return col;
  if (rel.fields && rel.fields.length > 0) return rel.fields[0]!;
  return `${rel.name}Id`;
}

function rowToArgsLiteral(
  ir: IR,
  entityName: string,
  row: SeedRow,
  columns: string[],
  paramNames?: Set<string>,
): string {
  const parts: string[] = [];
  for (const col of columns) {
    if (col === 'seedKey') continue;
    const param = seedColumnToParam(entityName, ir, col);
    if (paramNames && !paramNames.has(param)) continue;
    const raw = row[col];
    if (isBlankCell(raw)) continue;
    const numeric =
      (param.toLowerCase().includes('quantity') ||
        param.toLowerCase().includes('count') ||
        param.toLowerCase().includes('amount')) &&
      raw !== undefined &&
      /^\d+(\.\d+)?$/.test(raw);
    parts.push(
      `${JSON.stringify(param)}: ${numeric ? String(Number(raw)) : JSON.stringify(raw)}`,
    );
  }
  return `{ ${parts.join(', ')} }`;
}

/** Deterministic sync fill for blank / `{{fill}}` cells. */
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
        const lower = col.toLowerCase();
        if (lower.includes('email')) out[col] = `user${rowIndex + 1}@example.com`;
        else if (
          lower.includes('quantity') ||
          lower.includes('count') ||
          lower.includes('amount')
        )
          out[col] = String(rowIndex + 1);
        else if (lower.includes('name') || lower === 'title')
          out[col] = `${table.entity} ${rowIndex + 1}`;
        else if (lower.endsWith('id')) out[col] = `${col}-${row.seedKey ?? rowIndex + 1}`;
        else out[col] = `demo-${col}-${rowIndex + 1}`;
      }
      return out;
    });
    tables.push({ ...table, rows: filledRows });
  }
  return { meta: { ...pack.meta }, tables };
}

/**
 * Generate a Convex seed runner that calls create mutations for each pack row.
 * Entities without a `create` command are skipped with a diagnostic comment.
 * Blank/`{{fill}}` cells are heuristically filled; rows that still yield empty
 * args are skipped (never emit `mutation(..., {} as any)`).
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
      lines.push(
        `  // skip ${table.entity}: no create command in IR (${table.rows.length} rows unused)`,
      );
      continue;
    }
    const create = findCreateCommand(ir, table.entity);
    const params = createParamNames(create);
    lines.push(`  // ${table.entity} → api.mutations.${b.createMutation}`);
    for (const row of table.rows) {
      const args = rowToArgsLiteral(ir, table.entity, row, table.columns, params);
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
