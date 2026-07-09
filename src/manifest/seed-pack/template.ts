/**
 * Build a blank seed pack template from IR.
 */

import type { IR, IREntity, IRProperty, IRRelationship } from '../ir.js';
import {
  FILL_PLACEHOLDER,
  SAMPLE_DATA_ROW_ENTITY,
  slugEntity,
  type SeedEntityTable,
  type SeedPack,
  type SeedRow,
} from './types.js';

const SKIP_ENTITIES = new Set([
  SAMPLE_DATA_ROW_ENTITY,
  'SampleData',
  'JobRecord',
  'ConcurrencyConflict',
]);

export interface BuildSeedTemplateOptions {
  packId: string;
  version: string;
  profile?: 'dev' | 'staging' | 'demo';
  /** Rows per entity (default 2). */
  count?: number;
  /** Only include these entities (plus their FK targets are still listed if present). */
  entity?: string[];
}

function isSeedableEntity(entity: IREntity): boolean {
  if (entity.external) return false;
  if (SKIP_ENTITIES.has(entity.name)) return false;
  return true;
}

function propertyColumns(entity: IREntity): string[] {
  const cols: string[] = [];
  for (const prop of entity.properties) {
    if (prop.name === 'id') continue;
    if (prop.modifiers.includes('readonly') && prop.autoNow) continue;
    cols.push(prop.name);
  }
  return cols;
}

function relationshipColumns(entity: IREntity): string[] {
  const cols: string[] = [];
  for (const rel of entity.relationships) {
    if (rel.kind === 'belongsTo' || rel.kind === 'ref' || rel.kind === 'hasOne') {
      cols.push(rel.name);
    }
  }
  return cols;
}

function makeSeedKey(entityName: string, index: number): string {
  return `${slugEntity(entityName)}-${index + 1}`;
}

export function listTemplateEntities(ir: IR, filter?: string[]): IREntity[] {
  let entities = ir.entities.filter(isSeedableEntity);
  if (filter && filter.length > 0) {
    const want = new Set(filter);
    entities = entities.filter((e) => want.has(e.name));
  }
  return entities;
}

export function buildSeedTemplate(ir: IR, options: BuildSeedTemplateOptions): SeedPack {
  const count = options.count ?? 2;
  const entities = listTemplateEntities(ir, options.entity);
  const tables: SeedEntityTable[] = [];

  for (const entity of entities) {
    const propCols = propertyColumns(entity);
    const relCols = relationshipColumns(entity);
    const columns = ['seedKey', ...propCols, ...relCols];
    const rows: SeedRow[] = [];
    for (let i = 0; i < count; i++) {
      const row: SeedRow = { seedKey: makeSeedKey(entity.name, i) };
      for (const col of propCols) {
        row[col] = FILL_PLACEHOLDER;
      }
      for (const col of relCols) {
        row[col] = FILL_PLACEHOLDER;
      }
      rows.push(row);
    }
    tables.push({ entity: entity.name, columns, rows });
  }

  return {
    meta: {
      packId: options.packId,
      version: options.version,
      profile: options.profile ?? 'demo',
      entities: tables.map((t) => t.entity),
    },
    tables,
  };
}

/** Exported for validators / fill — which IR columns are relationship seedKey refs. */
export function relationshipColumnNames(entity: IREntity): Set<string> {
  return new Set(relationshipColumns(entity));
}

export function seedablePropertyNames(entity: IREntity): Set<string> {
  return new Set(propertyColumns(entity));
}

export function findEntity(ir: IR, name: string): IREntity | undefined {
  return ir.entities.find((e) => e.name === name);
}

export function findRelationship(
  entity: IREntity,
  column: string
): IRRelationship | undefined {
  return entity.relationships.find((r) => r.name === column);
}

export function findProperty(entity: IREntity, name: string): IRProperty | undefined {
  return entity.properties.find((p) => p.name === name);
}
