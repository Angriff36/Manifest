/**
 * Hydrate belongsTo/ref locals for Convex read-policy evaluation.
 * hasMany / through stays unsupported (queries remain internal).
 */

import type { IR, IRCommand, IREntity } from '../../ir.js';
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

export function isHydratableReadRelation(dependency: RelationDependency): boolean {
  if (dependency.through) return false;
  if (dependency.kind !== 'belongsTo' && dependency.kind !== 'ref') return false;
  if (
    dependency.localFields.length === 0 ||
    dependency.localFields.length !== dependency.targetFields.length
  ) {
    return false;
  }
  return true;
}

export interface ReadPolicyRelationHydration {
  lines: string[];
  relationVars: Record<string, string>;
  diagnostics: ProjectionDiagnostic[];
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
    if (!isHydratableReadRelation(dependency)) continue;

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

    const variable = `__rel_${dependency.relationName}`;
    const rawVariable = `${variable}Raw`;
    const localValues = dependency.localFields.map((field) => `${sourceVar}.${field}`).join(', ');
    const targetTable = resolveConvexTableName(target.name, options);
    const enforceTenant =
      !!tenantProp &&
      dependency.tenantOwnershipRequired &&
      target.properties.some((property) => property.name === tenantProp);
    const tenantArgs = enforceTenant
      ? `, ${JSON.stringify(tenantProp)}, __tenant`
      : '';
    const encryptedReads = encryptedFieldNames(target).filter((field) =>
      dependency.targetFieldsRead.includes(field),
    );
    relationVars[dependency.relationName] = variable;

    if (encryptedReads.length > 0 && !options.encryptionImport) {
      diagnostics.push({
        severity: 'error',
        code: 'CONVEX_ENCRYPTION_IMPORT_REQUIRED',
        entity: target.name,
        message: `Read policy relation '${dependency.relationName}' reads encrypted fields; set options.encryptionImport.`,
      });
      lines.push(
        `    throw new Error(${JSON.stringify(`encrypted relation '${dependency.relationName}' unsupported — denied`)});`,
        `    const ${variable} = null as any;`,
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
