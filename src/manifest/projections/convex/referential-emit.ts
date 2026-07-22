/**
 * Convex mutation emission for IR referential `onDelete` actions.
 *
 * Schema has no FK engine. Hard-delete commands (`delete` / `remove` with no
 * mutate patches) call a generated helper that mirrors reference-runtime
 * restrict-then-cascade for single-column belongsTo/ref edges.
 *
 * Deferred / unsupported here: onUpdate, setNull, setDefault, composite FKs.
 */

import type { IR, IRCommand, IREntity, IRRelationship, RefAction } from '../../ir';
import type { ProjectionDiagnostic } from '../interface';
import {
  isPersistentEntity,
  resolveConvexTableName,
  type NormalizedOptions,
} from './generator.js';

export interface InboundOnDeleteEdge {
  parentEntity: string;
  childEntity: string;
  childTable: string;
  relationshipName: string;
  fkField: string;
  /** Parent column the FK matches (`id` → Convex `_id` / docId). */
  remoteField: string;
  action: RefAction;
}

export function isHardDeleteCommand(cmd: IRCommand): boolean {
  if (cmd.name !== 'delete' && cmd.name !== 'remove') return false;
  return !(cmd.actions ?? []).some((action) => action.kind === 'mutate' && !!action.target);
}

function resolveFkField(
  child: IREntity,
  rel: IRRelationship,
  tenantProp: string | undefined,
  options: NormalizedOptions,
): string {
  const override = options.references[child.name]?.[rel.name];
  if (override) return override;
  const fields = rel.foreignKey?.fields ?? [];
  const nonTenant = fields.find((field) => field !== tenantProp);
  return nonTenant ?? `${rel.name}Id`;
}

function resolveRemoteField(rel: IRRelationship, parent: IREntity | undefined): string | null {
  const fk = rel.foreignKey;
  if (fk?.fields && fk.fields.length > 1) return null;
  if (fk?.references && fk.references.length > 1) return null;
  if (fk?.references && fk.references.length === 1) return fk.references[0]!;
  if (parent?.key && parent.key.length === 1) return parent.key[0]!;
  return 'id';
}

/** Collect enforceable single-column inbound onDelete edges (and deferred diags). */
export function collectInboundOnDeleteEdges(
  ir: IR,
  options: NormalizedOptions,
): { edges: InboundOnDeleteEdge[]; diagnostics: ProjectionDiagnostic[] } {
  const diagnostics: ProjectionDiagnostic[] = [];
  const edges: InboundOnDeleteEdge[] = [];
  const tenantProp = options.tenantIdProperty ?? ir.tenant?.property;

  for (const child of ir.entities) {
    if (!isPersistentEntity(child, ir)) continue;
    for (const rel of child.relationships) {
      if (rel.kind !== 'belongsTo' && rel.kind !== 'ref') continue;
      const action = rel.onDelete;
      if (!action || action === 'noAction') continue;

      const parent = ir.entities.find((entity) => entity.name === rel.target);
      if (!parent || !isPersistentEntity(parent, ir)) continue;

      const remoteField = resolveRemoteField(rel, parent);
      const fkFields = rel.foreignKey?.fields ?? [];
      if (remoteField === null || fkFields.length > 1) {
        diagnostics.push({
          severity: 'warning',
          code: 'CONVEX_REFERENTIAL_ACTION_DEFERRED',
          entity: child.name,
          message:
            `Relationship '${child.name}.${rel.name}' onDelete:${action} uses a composite ` +
            `FK; Convex mutation cascade supports single-column belongsTo/ref only.`,
        });
        continue;
      }

      if (action === 'setNull' || action === 'setDefault') {
        diagnostics.push({
          severity: 'error',
          code: 'CONVEX_UNSUPPORTED_REFERENTIAL_SET',
          entity: child.name,
          message:
            `Relationship '${child.name}.${rel.name}' declares onDelete:${action}. ` +
            `Convex hard-delete mutations only lower cascade/restrict for single-column FKs.`,
        });
        continue;
      }

      if (action !== 'cascade' && action !== 'restrict') continue;

      edges.push({
        parentEntity: parent.name,
        childEntity: child.name,
        childTable: resolveConvexTableName(child.name, options),
        relationshipName: rel.name,
        fkField: resolveFkField(child, rel, tenantProp, options),
        remoteField,
        action,
      });
    }
  }

  return { edges, diagnostics };
}

function matchValueExpr(remoteField: string): string {
  return remoteField === 'id' ? 'parentId' : `parent[${JSON.stringify(remoteField)}]`;
}

function renderParentCase(parentEntity: string, edges: InboundOnDeleteEdge[]): string {
  const inbound = edges.filter((edge) => edge.parentEntity === parentEntity);
  const restrict = inbound.filter((edge) => edge.action === 'restrict');
  const cascade = inbound.filter((edge) => edge.action === 'cascade');
  const lines: string[] = [`    case ${JSON.stringify(parentEntity)}: {`];

  for (const edge of restrict) {
    const match = matchValueExpr(edge.remoteField);
    lines.push(
      `      {`,
      `        const __dep = await ctx.db`,
      `          .query(${JSON.stringify(edge.childTable)})`,
      `          .withIndex(${JSON.stringify(`by_${edge.fkField}`)}, (q: any) => q.eq(${JSON.stringify(edge.fkField)}, ${match}))`,
      `          .first();`,
      `        if (__dep) {`,
      `          throw new Error(`,
      `            "REFERENTIAL_RESTRICT: cannot delete " + ${JSON.stringify(edge.parentEntity)} +`,
      `            "('" + String(parentId) + "') — " + ${JSON.stringify(`${edge.childEntity}.${edge.relationshipName}`)} +`,
      `            " declares onDelete: restrict and dependent rows exist"`,
      `          );`,
      `        }`,
      `      }`,
    );
  }

  for (const edge of cascade) {
    const match = matchValueExpr(edge.remoteField);
    lines.push(
      `      {`,
      `        const __kids = await ctx.db`,
      `          .query(${JSON.stringify(edge.childTable)})`,
      `          .withIndex(${JSON.stringify(`by_${edge.fkField}`)}, (q: any) => q.eq(${JSON.stringify(edge.fkField)}, ${match}))`,
      `          .collect();`,
      `        for (const __kid of __kids) {`,
      `          await __applyReferentialOnDelete(ctx, ${JSON.stringify(edge.childEntity)}, __kid._id, visiting);`,
      `          await ctx.db.delete(__kid._id);`,
      `        }`,
      `      }`,
    );
  }

  lines.push(`      break;`, `    }`);
  return lines.join('\n');
}

/**
 * File-level helper used by hard-delete mutations. Empty when no enforceable edges.
 */
export function renderReferentialOnDeleteHelper(
  ir: IR,
  options: NormalizedOptions,
): { code: string | null; diagnostics: ProjectionDiagnostic[]; parentEntities: Set<string> } {
  const { edges, diagnostics } = collectInboundOnDeleteEdges(ir, options);
  const parentEntities = new Set(edges.map((edge) => edge.parentEntity));
  if (parentEntities.size === 0) {
    return { code: null, diagnostics, parentEntities };
  }

  const cases = [...parentEntities]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => renderParentCase(name, edges))
    .join('\n');

  const code = [
    `async function __applyReferentialOnDelete(`,
    `  ctx: MutationCtx,`,
    `  entityName: string,`,
    `  parentId: any,`,
    `  visiting: Set<string> = new Set(),`,
    `): Promise<void> {`,
    `  const visitKey = entityName + ":" + String(parentId);`,
    `  if (visiting.has(visitKey)) return;`,
    `  visiting.add(visitKey);`,
    `  const parent = await ctx.db.get(parentId) as Record<string, any> | null;`,
    `  if (!parent) return;`,
    `  switch (entityName) {`,
    cases,
    `    default:`,
    `      break;`,
    `  }`,
    `}`,
  ].join('\n');

  return { code, diagnostics, parentEntities };
}

/** Call site before `ctx.db.delete` in a hard-delete mutation body. */
export function renderReferentialOnDeleteCall(entityName: string): string {
  return `    await __applyReferentialOnDelete(ctx, ${JSON.stringify(entityName)}, docId);\n`;
}
