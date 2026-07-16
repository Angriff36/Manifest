/**
 * Typed Convex seed argument literals — keeps convex-binding.ts focused.
 */

import type { IR, IRCommand, IREntity, IRType } from '../ir.js';
import type { SeedRow } from './types.js';
import { isBlankCell } from './types.js';
import { findEntity } from './template.js';

const NUMERIC_TYPES = new Set([
  'int',
  'bigint',
  'float',
  'decimal',
  'money',
  'number',
  'date',
  'datetime',
]);

export function isConvexPersistentEntity(ir: IR, entityName: string): boolean {
  const entity = findEntity(ir, entityName);
  if (!entity || entity.external) return false;
  const store = ir.stores.find((s) => s.entity === entityName);
  if (!store) return false;
  return store.target === 'durable' || store.target === 'postgres' || store.target === 'supabase';
}

/** Map seed relationship column names (rel.name) → create param / FK property names. */
export function seedColumnToParam(entityName: string, ir: IR, col: string): string {
  const entity = findEntity(ir, entityName);
  if (!entity) return col;
  const rel = entity.relationships.find((r) => r.name === col);
  if (!rel) return col;
  if (rel.foreignKey?.fields && rel.foreignKey.fields.length > 0) {
    return rel.foreignKey.fields[0]!;
  }
  return `${rel.name}Id`;
}

function typeNameOf(type: IRType | undefined): string {
  return (type?.name ?? 'string').toLowerCase();
}

function paramTypeMap(cmd: IRCommand | undefined): Map<string, string> {
  const m = new Map<string, string>();
  if (!cmd) return m;
  for (const p of cmd.parameters ?? []) {
    m.set(p.name, typeNameOf(p.type));
  }
  return m;
}

function propertyTypeMap(entity: IREntity | undefined): Map<string, string> {
  const m = new Map<string, string>();
  if (!entity) return m;
  for (const p of entity.properties) {
    m.set(p.name, typeNameOf(p.type));
  }
  return m;
}

/** Stable epoch ms for demo datetime/date fills (deterministic). */
export function demoEpochMs(rowIndex: number): number {
  return Date.UTC(2026, 0, 1 + (rowIndex % 28), 12, 0, 0);
}

export function heuristicFillForType(
  typeName: string,
  col: string,
  entityName: string,
  rowIndex: number,
  seedKey: string | undefined,
): string {
  const t = typeName.toLowerCase();
  if (t === 'boolean') return 'false';
  if (NUMERIC_TYPES.has(t)) {
    if (t === 'date' || t === 'datetime') return String(demoEpochMs(rowIndex));
    return String(rowIndex + 1);
  }
  const lower = col.toLowerCase();
  if (lower.includes('email')) return `user${rowIndex + 1}@example.com`;
  if (lower.includes('name') || lower === 'title') return `${entityName} ${rowIndex + 1}`;
  if (lower.endsWith('id')) return `${col}-${seedKey ?? rowIndex + 1}`;
  return `demo-${col}-${rowIndex + 1}`;
}

/**
 * Format a seed cell as a TS literal matching the Convex/IR type.
 * Avoids substring traps like "amount" inside "accountHolderName".
 */
export function formatSeedLiteral(raw: string, typeName: string | undefined): string {
  const t = (typeName ?? 'string').toLowerCase();
  if (t === 'boolean') {
    if (raw === 'true' || raw === 'false') return raw;
    return 'false';
  }
  if (NUMERIC_TYPES.has(t)) {
    if (/^-?\d+(\.\d+)?$/.test(raw)) return String(Number(raw));
    const trailing = raw.match(/(-?\d+(?:\.\d+)?)(?:\D*)$/);
    if (trailing) return String(Number(trailing[1]));
    return t === 'date' || t === 'datetime' ? String(demoEpochMs(0)) : '1';
  }
  return JSON.stringify(raw);
}

/**
 * Build a create-mutation args object literal. Dedupes keys (relationship
 * columns win over property columns when both map to the same param).
 */
export function rowToArgsLiteral(
  ir: IR,
  entityName: string,
  row: SeedRow,
  columns: string[],
  cmd: IRCommand | undefined,
): string {
  const paramNames = cmd
    ? new Set((cmd.parameters ?? []).map((p) => p.name))
    : undefined;
  const types = paramTypeMap(cmd);
  const propTypes = propertyTypeMap(findEntity(ir, entityName));
  // Later columns overwrite earlier — template puts props then relationships.
  const args = new Map<string, string>();
  for (const col of columns) {
    if (col === 'seedKey') continue;
    const param = seedColumnToParam(entityName, ir, col);
    if (paramNames && !paramNames.has(param)) continue;
    const raw = row[col];
    if (isBlankCell(raw)) continue;
    const typeName = types.get(param) ?? propTypes.get(param) ?? propTypes.get(col);
    args.set(param, formatSeedLiteral(String(raw), typeName));
  }
  if (args.size === 0) return '{  }';
  return `{ ${[...args.entries()].map(([k, v]) => `${JSON.stringify(k)}: ${v}`).join(', ')} }`;
}
