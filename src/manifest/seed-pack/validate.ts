/**
 * Validate a seed pack against current IR (soft drift).
 */

import type { IR, IREntity } from '../ir.js';
import { isBlankCell, type SeedEntityTable, type SeedPack } from './types.js';
import {
  findEntity,
  findProperty,
  findRelationship,
  relationshipColumnNames,
  seedablePropertyNames,
} from './template.js';

export interface SeedPackIssue {
  code: string;
  message: string;
  entity?: string;
  seedKey?: string;
  column?: string;
}

export interface SeedPackValidation {
  ok: boolean;
  errors: SeedPackIssue[];
  warnings: SeedPackIssue[];
}

export interface ValidateSeedPackOptions {
  /** When true, blank required properties are errors (post-fill). Default false for templates. */
  requireFilled?: boolean;
}

function validateTableStructure(
  ir: IR,
  table: SeedEntityTable,
  errors: SeedPackIssue[],
): IREntity | undefined {
  const entity = findEntity(ir, table.entity);
  if (!entity) {
    errors.push({
      code: 'entity_missing',
      message: `Pack entity "${table.entity}" is not in IR`,
      entity: table.entity,
    });
    return undefined;
  }
  if (entity.external) {
    errors.push({
      code: 'entity_external',
      message: `Pack entity "${table.entity}" is external and cannot be seeded`,
      entity: table.entity,
    });
    return undefined;
  }
  if (table.columns[0] !== 'seedKey') {
    errors.push({
      code: 'seedKey_column',
      message: `${table.entity}: first column must be seedKey`,
      entity: table.entity,
    });
  }
  const props = seedablePropertyNames(entity);
  const rels = relationshipColumnNames(entity);
  for (const col of table.columns) {
    if (col === 'seedKey') continue;
    if (!props.has(col) && !rels.has(col)) {
      errors.push({
        code: 'column_unknown',
        message: `${table.entity}: column "${col}" is not a seedable property or relationship`,
        entity: table.entity,
        column: col,
      });
    }
  }
  return entity;
}

function validateTableRows(
  table: SeedEntityTable,
  entity: IREntity,
  requireFilled: boolean,
  errors: SeedPackIssue[],
): Set<string> {
  const props = seedablePropertyNames(entity);
  const seen = new Set<string>();
  for (const row of table.rows) {
    const sk = row.seedKey?.trim() ?? '';
    if (!sk) {
      errors.push({
        code: 'seedKey_empty',
        message: `${table.entity}: row missing seedKey`,
        entity: table.entity,
      });
      continue;
    }
    if (seen.has(sk)) {
      errors.push({
        code: 'seedKey_duplicate',
        message: `${table.entity}: duplicate seedKey "${sk}"`,
        entity: table.entity,
        seedKey: sk,
      });
    }
    seen.add(sk);
    if (!requireFilled) continue;
    for (const propName of props) {
      const prop = findProperty(entity, propName);
      if (!prop) continue;
      const required =
        prop.modifiers.includes('required') && !prop.modifiers.includes('optional');
      if (required && isBlankCell(row[propName])) {
        errors.push({
          code: 'required_blank',
          message: `${table.entity}/${sk}: required "${propName}" is blank`,
          entity: table.entity,
          seedKey: sk,
          column: propName,
        });
      }
    }
  }
  return seen;
}

function validateFkReferences(
  ir: IR,
  pack: SeedPack,
  seedKeysByEntity: Map<string, Set<string>>,
  errors: SeedPackIssue[],
  warnings: SeedPackIssue[],
): void {
  for (const table of pack.tables) {
    const entity = findEntity(ir, table.entity);
    if (!entity) continue;
    for (const row of table.rows) {
      for (const col of table.columns) {
        if (col === 'seedKey') continue;
        const rel = findRelationship(entity, col);
        if (!rel) continue;
        const ref = row[col];
        if (isBlankCell(ref)) continue;
        const targetKeys = seedKeysByEntity.get(rel.target);
        if (!targetKeys) {
          if (!findEntity(ir, rel.target)) {
            errors.push({
              code: 'fk_target_missing_ir',
              message: `${table.entity}/${row.seedKey}: FK "${col}" targets unknown entity "${rel.target}"`,
              entity: table.entity,
              seedKey: row.seedKey,
              column: col,
            });
          } else {
            warnings.push({
              code: 'fk_target_not_in_pack',
              message: `${table.entity}/${row.seedKey}: FK "${col}" → "${rel.target}" but that entity is not in the pack`,
              entity: table.entity,
              seedKey: row.seedKey,
              column: col,
            });
          }
          continue;
        }
        if (!targetKeys.has(ref!.trim())) {
          errors.push({
            code: 'fk_seedKey_missing',
            message: `${table.entity}/${row.seedKey}: FK "${col}" references unknown seedKey "${ref}" on ${rel.target}`,
            entity: table.entity,
            seedKey: row.seedKey,
            column: col,
          });
        }
      }
    }
  }
}

function warnUnusedIrEntities(
  ir: IR,
  tableByEntity: Map<string, SeedEntityTable>,
  warnings: SeedPackIssue[],
): void {
  for (const entity of ir.entities) {
    if (entity.external) continue;
    if (['SampleData', 'SampleDataRow'].includes(entity.name)) continue;
    if (!tableByEntity.has(entity.name)) {
      warnings.push({
        code: 'ir_entity_unused',
        message: `IR entity "${entity.name}" is not in this pack (ok unless you need demo coverage)`,
        entity: entity.name,
      });
    }
  }
}

export function validateSeedPack(
  ir: IR,
  pack: SeedPack,
  options: ValidateSeedPackOptions = {},
): SeedPackValidation {
  const errors: SeedPackIssue[] = [];
  const warnings: SeedPackIssue[] = [];
  const requireFilled = options.requireFilled === true;
  const tableByEntity = new Map(pack.tables.map((t) => [t.entity, t]));
  const seedKeysByEntity = new Map<string, Set<string>>();

  for (const table of pack.tables) {
    const entity = validateTableStructure(ir, table, errors);
    if (!entity) continue;
    seedKeysByEntity.set(table.entity, validateTableRows(table, entity, requireFilled, errors));
  }

  validateFkReferences(ir, pack, seedKeysByEntity, errors, warnings);
  warnUnusedIrEntities(ir, tableByEntity, warnings);

  return { ok: errors.length === 0, errors, warnings };
}
