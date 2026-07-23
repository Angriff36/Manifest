/**
 * Hydrate relationship locals for Convex read-policy evaluation.
 * Supports belongsTo/ref, one-hop hasMany (inverse FK), and hasMany-through
 * (join entity with single-column belongsTo to source + target).
 */

import type { IR, IRCommand, IREntity, IRRelationship } from '../../ir.js';
import {
  buildRelationDependencyPlan,
  type RelationDependency,
  type RelationDependencyPlan,
} from '../../relation-plan.js';
import type { ProjectionDiagnostic } from '../interface.js';
import { encryptedFieldNames } from './privacy.js';
import { resolveConvexTableName, type NormalizedConvexOptions } from './options.js';

export function buildReadPolicyRelationPlan(ir: IR, entity: IREntity): RelationDependencyPlan {
  // Mirror selectReadPolicies — keep this module free of a read-policies import cycle.
  const policies = ir.policies.filter(
    (policy) =>
      (policy.action === 'read' || policy.action === 'all') &&
      (policy.entity === undefined || policy.entity === entity.name),
  );
  const syntheticCommand: IRCommand = {
    name: '__readPolicies',
    entity: entity.name,
    parameters: [],
    guards: [],
    policies: policies.map((policy) => policy.name),
    actions: [],
    emits: [],
  };
  return buildRelationDependencyPlan(ir, entity, syntheticCommand);
}

interface HasManyReadHydration {
  childTable: string;
  fkField: string;
  targetEntity: IREntity;
}

interface ThroughReadHydration {
  joinTable: string;
  sourceFkField: string;
  targetFkField: string;
  targetTable: string;
  targetEntity: IREntity;
}

function singleFkField(
  entityName: string,
  relationship: IRRelationship,
  tenantProp: string | undefined,
  options: NormalizedConvexOptions,
): string | null {
  const fields = relationship.foreignKey?.fields ?? [];
  if (fields.length > 1) return null;
  const override = options.references[entityName]?.[relationship.name];
  if (override) return override;
  if (fields.length === 1) {
    const field = fields[0]!;
    return field === tenantProp ? null : field;
  }
  return `${relationship.name}Id`;
}

/** Resolve inverse belongsTo/ref FK used to load a hasMany collection. */
export function resolveHasManyReadHydration(
  ir: IR,
  entity: IREntity,
  dependency: RelationDependency,
  options: NormalizedConvexOptions,
): HasManyReadHydration | null {
  if (dependency.kind !== 'hasMany' || dependency.through) return null;
  const target = ir.entities.find((candidate) => candidate.name === dependency.targetEntity);
  if (!target) return null;
  const inverse = target.relationships.find(
    (relationship) =>
      (relationship.kind === 'belongsTo' || relationship.kind === 'ref') &&
      relationship.target === entity.name,
  );
  if (!inverse) return null;

  const tenantProp = options.tenantIdProperty ?? ir.tenant?.property;
  const fkField = singleFkField(target.name, inverse, tenantProp, options);
  if (!fkField) return null;

  return {
    childTable: resolveConvexTableName(target.name, options),
    fkField,
    targetEntity: target,
  };
}

/** Resolve join-entity edges for hasMany … through. */
export function resolveThroughReadHydration(
  ir: IR,
  entity: IREntity,
  dependency: RelationDependency,
  options: NormalizedConvexOptions,
): ThroughReadHydration | null {
  if (dependency.kind !== 'hasMany' || !dependency.through) return null;
  const join = ir.entities.find((candidate) => candidate.name === dependency.through);
  const target = ir.entities.find((candidate) => candidate.name === dependency.targetEntity);
  if (!join || !target) return null;

  const toSource = join.relationships.find(
    (relationship) =>
      (relationship.kind === 'belongsTo' || relationship.kind === 'ref') &&
      relationship.target === entity.name,
  );
  const toTarget = join.relationships.find(
    (relationship) =>
      (relationship.kind === 'belongsTo' || relationship.kind === 'ref') &&
      relationship.target === dependency.targetEntity,
  );
  if (!toSource || !toTarget) return null;

  const tenantProp = options.tenantIdProperty ?? ir.tenant?.property;
  const sourceFkField = singleFkField(join.name, toSource, tenantProp, options);
  const targetFkField = singleFkField(join.name, toTarget, tenantProp, options);
  if (!sourceFkField || !targetFkField) return null;

  return {
    joinTable: resolveConvexTableName(join.name, options),
    sourceFkField,
    targetFkField,
    targetTable: resolveConvexTableName(target.name, options),
    targetEntity: target,
  };
}

function hasInverseBelongsTo(ir: IR, entity: IREntity, dependency: RelationDependency): boolean {
  if (dependency.kind !== 'hasMany' || dependency.through) return false;
  const target = ir.entities.find((candidate) => candidate.name === dependency.targetEntity);
  if (!target) return false;
  return target.relationships.some(
    (relationship) =>
      (relationship.kind === 'belongsTo' || relationship.kind === 'ref') &&
      relationship.target === entity.name,
  );
}

function hasThroughJoinEdges(ir: IR, entity: IREntity, dependency: RelationDependency): boolean {
  if (dependency.kind !== 'hasMany' || !dependency.through) return false;
  const join = ir.entities.find((candidate) => candidate.name === dependency.through);
  if (!join) return false;
  const toSource = join.relationships.some(
    (relationship) =>
      (relationship.kind === 'belongsTo' || relationship.kind === 'ref') &&
      relationship.target === entity.name &&
      (relationship.foreignKey?.fields?.length ?? 1) <= 1,
  );
  const toTarget = join.relationships.some(
    (relationship) =>
      (relationship.kind === 'belongsTo' || relationship.kind === 'ref') &&
      relationship.target === dependency.targetEntity &&
      (relationship.foreignKey?.fields?.length ?? 1) <= 1,
  );
  return toSource && toTarget;
}

export function isHydratableReadRelation(
  ir: IR,
  entity: IREntity,
  dependency: RelationDependency,
): boolean {
  if (dependency.kind === 'belongsTo' || dependency.kind === 'ref') {
    if (dependency.through) return false;
    return (
      dependency.localFields.length > 0 &&
      dependency.localFields.length === dependency.targetFields.length
    );
  }
  if (dependency.kind === 'hasMany') {
    if (dependency.through) return hasThroughJoinEdges(ir, entity, dependency);
    return hasInverseBelongsTo(ir, entity, dependency);
  }
  return false;
}

export interface ReadPolicyRelationHydration {
  lines: string[];
  relationVars: Record<string, string>;
  diagnostics: ProjectionDiagnostic[];
}

function renderEncryptedDeny(
  lines: string[],
  diagnostics: ProjectionDiagnostic[],
  entityName: string,
  relationName: string,
  variable: string,
  asArray: boolean,
): void {
  diagnostics.push({
    severity: 'error',
    code: 'CONVEX_ENCRYPTION_IMPORT_REQUIRED',
    entity: entityName,
    message: `Read policy relation '${relationName}' reads encrypted fields; set options.encryptionImport.`,
  });
  lines.push(
    `    throw new Error(${JSON.stringify(`encrypted relation '${relationName}' unsupported — denied`)});`,
    `    const ${variable} = ${asArray ? '[] as any[]' : 'null as any'};`,
  );
}

/** Emit `__rel_*` locals for hydratable read-policy relations. */
export function renderReadPolicyRelationHydration(
  ir: IR,
  options: NormalizedConvexOptions,
  entity: IREntity,
  dependencies: readonly RelationDependency[],
  sourceVar: string,
  tenantProp: string | undefined,
): ReadPolicyRelationHydration {
  const lines: string[] = [];
  const relationVars: Record<string, string> = {};
  const diagnostics: ProjectionDiagnostic[] = [];

  for (const dependency of dependencies) {
    if (!isHydratableReadRelation(ir, entity, dependency)) continue;

    const variable = `__rel_${dependency.relationName}`;
    relationVars[dependency.relationName] = variable;

    if (dependency.kind === 'hasMany' && dependency.through) {
      const through = resolveThroughReadHydration(ir, entity, dependency, options);
      if (!through) continue;
      const encryptedReads = encryptedFieldNames(through.targetEntity).filter((field) =>
        dependency.targetFieldsRead.includes(field),
      );
      if (encryptedReads.length > 0 && !options.encryptionImport) {
        renderEncryptedDeny(
          lines,
          diagnostics,
          through.targetEntity.name,
          dependency.relationName,
          variable,
          true,
        );
        continue;
      }
      const joinVar = `${variable}Joins`;
      const itemVar = `${variable}Item`;
      lines.push(
        `    const ${joinVar} = await ctx.db.query(${JSON.stringify(through.joinTable)}).withIndex(${JSON.stringify(`by_${through.sourceFkField}`)}, (q: any) => q.eq(${JSON.stringify(through.sourceFkField)}, ${sourceVar}._id)).collect();`,
        `    const ${variable}: any[] = [];`,
        `    for (const __join of ${joinVar} as any[]) {`,
        `      const __targetId = __join.${through.targetFkField};`,
        `      if (__targetId == null) continue;`,
      );
      if (encryptedReads.length > 0) {
        lines.push(
          `      const ${itemVar}Raw = await __resolveRelation(ctx, ${JSON.stringify(through.targetTable)}, [__targetId], ["id"]);`,
          `      const ${itemVar} = await __decryptDoc(ctx, ${JSON.stringify(through.targetEntity.name)}, ${JSON.stringify(encryptedReads)}, ${itemVar}Raw);`,
        );
      } else {
        lines.push(
          `      const ${itemVar} = await __resolveRelation(ctx, ${JSON.stringify(through.targetTable)}, [__targetId], ["id"]);`,
        );
      }
      lines.push(`      if (${itemVar}) ${variable}.push(${itemVar});`, `    }`);
      continue;
    }

    if (dependency.kind === 'hasMany') {
      const hasMany = resolveHasManyReadHydration(ir, entity, dependency, options);
      if (!hasMany) continue;
      const encryptedReads = encryptedFieldNames(hasMany.targetEntity).filter((field) =>
        dependency.targetFieldsRead.includes(field),
      );
      const rawVariable = `${variable}Raw`;
      const loadExpr = `await ctx.db.query(${JSON.stringify(hasMany.childTable)}).withIndex(${JSON.stringify(`by_${hasMany.fkField}`)}, (q: any) => q.eq(${JSON.stringify(hasMany.fkField)}, ${sourceVar}._id)).collect()`;

      if (encryptedReads.length > 0 && !options.encryptionImport) {
        renderEncryptedDeny(
          lines,
          diagnostics,
          hasMany.targetEntity.name,
          dependency.relationName,
          variable,
          true,
        );
        continue;
      }

      if (encryptedReads.length > 0) {
        lines.push(
          `    const ${rawVariable} = ${loadExpr};`,
          `    const ${variable} = await Promise.all((${rawVariable} as any[]).map((row) => __decryptDoc(ctx, ${JSON.stringify(hasMany.targetEntity.name)}, ${JSON.stringify(encryptedReads)}, row)));`,
        );
      } else {
        lines.push(`    const ${variable} = ${loadExpr};`);
      }
      continue;
    }

    const target = ir.entities.find((candidate) => candidate.name === dependency.targetEntity);
    if (!target) {
      diagnostics.push({
        severity: 'error',
        code: 'CONVEX_UNSUPPORTED_READ_POLICY_RELATIONSHIP',
        entity: entity.name,
        message: `Read policy relation '${dependency.relationName}' targets unknown entity '${dependency.targetEntity}'.`,
      });
      continue;
    }

    const rawVariable = `${variable}Raw`;
    const localValues = dependency.localFields.map((field) => `${sourceVar}.${field}`).join(', ');
    const targetTable = resolveConvexTableName(target.name, options);
    const enforceTenant =
      !!tenantProp &&
      dependency.tenantOwnershipRequired &&
      target.properties.some((property) => property.name === tenantProp);
    const tenantArgs = enforceTenant ? `, ${JSON.stringify(tenantProp)}, __tenant` : '';
    const encryptedReads = encryptedFieldNames(target).filter((field) =>
      dependency.targetFieldsRead.includes(field),
    );

    if (encryptedReads.length > 0 && !options.encryptionImport) {
      renderEncryptedDeny(
        lines,
        diagnostics,
        target.name,
        dependency.relationName,
        variable,
        false,
      );
      continue;
    }

    lines.push(
      `    const ${encryptedReads.length ? rawVariable : variable} = await __resolveRelation(ctx, ${JSON.stringify(targetTable)}, [${localValues}], ${JSON.stringify(dependency.targetFields)}${tenantArgs});`,
    );
    if (encryptedReads.length) {
      lines.push(
        `    const ${variable} = await __decryptDoc(ctx, ${JSON.stringify(target.name)}, ${JSON.stringify(encryptedReads)}, ${rawVariable});`,
      );
    }
  }

  return { lines, relationVars, diagnostics };
}
