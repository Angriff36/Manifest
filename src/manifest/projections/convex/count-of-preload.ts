/**
 * Preload hasMany collections referenced by `count_of(self.<rel>, …)` so Convex
 * mutation guards can evaluate aggregates against related rows (PB023).
 *
 * Convex documents do not embed hasMany arrays; the reference runtime resolves
 * them via inverse belongsTo FKs. This helper emits the matching `ctx.db.query`
 * loads and assigns them onto the local `doc` before governance checks run.
 */

import type { IR, IREntity, IRExpression, IRRelationship } from '../../ir';
import type { NormalizedOptions } from './generator.js';
import { resolveConvexTableName } from './generator.js';

/** Collect hasMany relationship names used as `count_of(self.<rel>, …)` collections. */
export function collectCountOfHasManyRels(expr: IRExpression | undefined, out: Set<string>): void {
  if (!expr) return;
  switch (expr.kind) {
    case 'call': {
      const callee = expr.callee.kind === 'identifier' ? expr.callee.name : undefined;
      if (callee === 'count_of' && expr.args[0]) {
        const coll = expr.args[0];
        if (
          coll.kind === 'member' &&
          coll.object.kind === 'identifier' &&
          (coll.object.name === 'self' || coll.object.name === 'this')
        ) {
          out.add(coll.property);
        }
      }
      for (const arg of expr.args) collectCountOfHasManyRels(arg, out);
      return;
    }
    case 'binary':
      collectCountOfHasManyRels(expr.left, out);
      collectCountOfHasManyRels(expr.right, out);
      return;
    case 'unary':
      collectCountOfHasManyRels(expr.operand, out);
      return;
    case 'conditional':
      collectCountOfHasManyRels(expr.condition, out);
      collectCountOfHasManyRels(expr.consequent, out);
      collectCountOfHasManyRels(expr.alternate, out);
      return;
    case 'array':
      for (const el of expr.elements) collectCountOfHasManyRels(el, out);
      return;
    case 'object':
      for (const p of expr.properties) collectCountOfHasManyRels(p.value, out);
      return;
    case 'lambda':
      collectCountOfHasManyRels(expr.body, out);
      return;
    case 'member':
      collectCountOfHasManyRels(expr.object, out);
      return;
    default:
      return;
  }
}

/** Non-tenant FK column for a belongsTo/ref (mirrors generator.resolveReferenceField). */
function inverseFkField(
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

/**
 * Emit lines that load each hasMany collection onto `doc.<relName>` via the
 * inverse FK index. `docIdExpr` is the Convex document id expression (e.g. `docId`).
 */
export function renderCountOfHasManyPreloads(
  ir: IR,
  entity: IREntity,
  relNames: Iterable<string>,
  options: NormalizedOptions,
  docIdExpr: string,
): string[] {
  const lines: string[] = [];
  const tenantProp = ir.tenant?.property;
  const seen = new Set<string>();

  for (const relName of relNames) {
    if (seen.has(relName)) continue;
    seen.add(relName);

    const rel = entity.relationships.find((r) => r.name === relName && r.kind === 'hasMany');
    if (!rel || rel.through) continue;

    const target = ir.entities.find((e) => e.name === rel.target);
    if (!target) continue;

    const inverse = target.relationships.find(
      (r) => (r.kind === 'belongsTo' || r.kind === 'ref') && r.target === entity.name,
    );
    if (!inverse) continue;

    const fkField = inverseFkField(target.name, inverse, tenantProp, options);
    const childTable = resolveConvexTableName(rel.target, options);
    lines.push(
      `    (doc as any).${relName} = await ctx.db.query(${JSON.stringify(childTable)}).withIndex(${JSON.stringify(`by_${fkField}`)}, (q) => q.eq(${JSON.stringify(fkField)}, ${docIdExpr})).collect();`,
    );
  }
  return lines;
}
