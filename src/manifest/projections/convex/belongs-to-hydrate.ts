/**
 * belongsTo/ref hydration planning for Convex document graphs.
 *
 * Uses declared foreignKey.fields/references via relationReferenceMapping.
 * Identity references load with ctx.db.get; non-identity (e.g. tenant-singleton
 * keyed by tenantId) query by_<field> — never invent ${relationshipName}Id when
 * the author declared only non-id fields.
 */

import type { IR, IREntity, IRRelationship } from '../../ir';
import { relationReferenceMapping } from '../../relation-plan.js';
import type { ProjectionDiagnostic } from '../interface.js';
import type { NormalizedOptions } from './generator.js';
import { resolveConvexTableName } from './generator.js';

export type BelongsToHydrateHop =
  | {
      kind: 'belongsTo';
      relName: string;
      fromEntity: string;
      toEntity: string;
      targetTable: string;
      mode: 'identity';
      fkField: string;
    }
  | {
      kind: 'belongsTo';
      relName: string;
      fromEntity: string;
      toEntity: string;
      targetTable: string;
      mode: 'index';
      localField: string;
      targetField: string;
      indexName: string;
    }
  | {
      kind: 'belongsTo';
      relName: string;
      fromEntity: string;
      toEntity: string;
      targetTable: string;
      mode: 'filter';
      localFields: readonly string[];
      targetFields: readonly string[];
    }
  | {
      kind: 'belongsTo';
      relName: string;
      fromEntity: string;
      toEntity: string;
      targetTable: string;
      mode: 'unsupported';
      reason: string;
    };

function targetHasLookupIndex(ir: IR, target: IREntity, fields: readonly string[]): boolean {
  if (fields.length === 0) return false;
  if (fields.length === 1) {
    const field = fields[0]!;
    if (ir.tenant?.property === field) return true;
    if (target.properties.some((property) => property.name === field)) return true;
    if (target.alternateKeys?.some((key) => key.length === 1 && key[0] === field)) return true;
    if (target.key?.length === 1 && target.key[0] === field) return true;
    return false;
  }
  return (
    target.alternateKeys?.some(
      (key) => key.length === fields.length && key.every((name, index) => name === fields[index]),
    ) === true ||
    (target.key?.length === fields.length &&
      target.key.every((name, index) => name === fields[index]))
  );
}

/** Non-tenant FK column for a belongsTo/ref (hasMany inverse preload). */
export function inverseFkField(
  childEntityName: string,
  inverse: IRRelationship,
  tenantProp: string | undefined,
  options: NormalizedOptions,
): string {
  const override = options.references[childEntityName]?.[inverse.name];
  if (override) return override;
  const fields = inverse.foreignKey?.fields ?? [];
  const nonTenant = fields.find((f) => f !== tenantProp);
  return nonTenant ?? `${inverse.name}Id`;
}

export function resolveBelongsToHydrateHop(
  ir: IR,
  fromEntityName: string,
  relName: string,
  options: NormalizedOptions,
): BelongsToHydrateHop | null {
  const fromEntity = ir.entities.find((e) => e.name === fromEntityName);
  if (!fromEntity) return null;
  const rel = fromEntity.relationships.find(
    (r) => r.name === relName && (r.kind === 'belongsTo' || r.kind === 'ref'),
  );
  if (!rel?.target) return null;
  const target = ir.entities.find((e) => e.name === rel.target);
  const targetTable = resolveConvexTableName(rel.target, options);
  const override = options.references[fromEntityName]?.[rel.name];

  if (override) {
    return {
      kind: 'belongsTo',
      mode: 'identity',
      relName,
      fromEntity: fromEntityName,
      toEntity: rel.target,
      fkField: override,
      targetTable,
    };
  }

  const mapping = relationReferenceMapping(fromEntity, rel, target);
  if (
    mapping.localFields.length === 0 ||
    mapping.localFields.length !== mapping.targetFields.length
  ) {
    return {
      kind: 'belongsTo',
      mode: 'unsupported',
      relName,
      fromEntity: fromEntityName,
      toEntity: rel.target,
      targetTable,
      reason: `relationship '${fromEntityName}.${relName}' has no valid local/target field mapping for hydration`,
    };
  }

  const identityIndex = mapping.targetFields.indexOf('id');
  if (identityIndex >= 0) {
    return {
      kind: 'belongsTo',
      mode: 'identity',
      relName,
      fromEntity: fromEntityName,
      toEntity: rel.target,
      fkField: mapping.localFields[identityIndex]!,
      targetTable,
    };
  }

  if (!target) {
    return {
      kind: 'belongsTo',
      mode: 'unsupported',
      relName,
      fromEntity: fromEntityName,
      toEntity: rel.target,
      targetTable,
      reason: `relationship '${fromEntityName}.${relName}' targets unknown entity '${rel.target}'`,
    };
  }

  if (!targetHasLookupIndex(ir, target, mapping.targetFields)) {
    return {
      kind: 'belongsTo',
      mode: 'unsupported',
      relName,
      fromEntity: fromEntityName,
      toEntity: rel.target,
      targetTable,
      reason:
        `relationship '${fromEntityName}.${relName}' references [${mapping.targetFields.join(', ')}] ` +
        `on '${rel.target}' but no matching lookup field/index is available for hydration`,
    };
  }

  if (mapping.localFields.length === 1) {
    const localField = mapping.localFields[0]!;
    const targetField = mapping.targetFields[0]!;
    return {
      kind: 'belongsTo',
      mode: 'index',
      relName,
      fromEntity: fromEntityName,
      toEntity: rel.target,
      targetTable,
      localField,
      targetField,
      indexName: `by_${targetField}`,
    };
  }

  return {
    kind: 'belongsTo',
    mode: 'filter',
    relName,
    fromEntity: fromEntityName,
    toEntity: rel.target,
    targetTable,
    localFields: mapping.localFields,
    targetFields: mapping.targetFields,
  };
}

export function renderBelongsToHydration(
  hop: BelongsToHydrateHop,
  parentExpr: string,
  indent: string,
): string[] {
  if (hop.mode === 'unsupported') {
    return [
      `${indent}{`,
      `${indent}  // CONVEX_BELONGS_TO_HYDRATE_NO_LOOKUP: ${hop.reason}`,
      `${indent}  (${parentExpr} as any).${hop.relName} = null;`,
      `${indent}}`,
    ];
  }

  if (hop.mode === 'identity') {
    return [
      `${indent}{`,
      `${indent}  const __fk = (${parentExpr} as any).${hop.fkField};`,
      `${indent}  (${parentExpr} as any).${hop.relName} = __fk != null ? await ctx.db.get(__fk as any) : null;`,
      `${indent}}`,
    ];
  }

  if (hop.mode === 'index') {
    return [
      `${indent}{`,
      `${indent}  const __lookup = (${parentExpr} as any).${hop.localField};`,
      `${indent}  (${parentExpr} as any).${hop.relName} = __lookup != null`,
      `${indent}    ? await ctx.db.query(${JSON.stringify(hop.targetTable)}).withIndex(${JSON.stringify(hop.indexName)}, (q: any) => q.eq(${JSON.stringify(hop.targetField)}, __lookup)).first()`,
      `${indent}    : null;`,
      `${indent}}`,
    ];
  }

  const localValues = hop.localFields.map((field) => `(${parentExpr} as any).${field}`).join(', ');
  const nullCheck = hop.localFields
    .map((field) => `(${parentExpr} as any).${field} == null`)
    .join(' || ');
  const filterEqs = hop.targetFields
    .map((field, index) => `q.eq(q.field(${JSON.stringify(field)}), __vals[${index}])`)
    .join(', ');
  return [
    `${indent}{`,
    `${indent}  const __vals = [${localValues}] as const;`,
    `${indent}  (${parentExpr} as any).${hop.relName} = (${nullCheck})`,
    `${indent}    ? null`,
    `${indent}    : await ctx.db.query(${JSON.stringify(hop.targetTable)}).filter((q: any) => q.and(${filterEqs})).first();`,
    `${indent}}`,
  ];
}

export function belongsToUnsupportedDiagnostic(
  hop: BelongsToHydrateHop,
): ProjectionDiagnostic | null {
  if (hop.mode !== 'unsupported') return null;
  return {
    severity: 'error',
    code: 'CONVEX_BELONGS_TO_HYDRATE_NO_LOOKUP',
    entity: hop.fromEntity,
    message:
      `CONVEX_BELONGS_TO_HYDRATE_NO_LOOKUP: ${hop.reason}. ` +
      `Declare foreignKey.fields/references that map to a target identity (id) or an indexed lookup field.`,
  };
}
