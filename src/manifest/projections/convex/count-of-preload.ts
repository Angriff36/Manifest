/**
 * Preload hasMany collections referenced by `count_of(self.<rel>, …)` so Convex
 * mutation guards can evaluate aggregates against related rows (PB023).
 *
 * Convex documents do not embed hasMany arrays; the reference runtime resolves
 * them via inverse belongsTo FKs. This helper emits the matching `ctx.db.query`
 * loads and assigns them onto the local `doc` before governance checks run.
 */

import type { IR, IREntity, IRExpression } from '../../ir';
import { planAndRenderAggregateHydration } from './aggregate-hydrate.js';
import type { NormalizedOptions } from './generator.js';
import { resolveConvexTableName } from './generator.js';

/**
 * When `collection` is `self.<hasManyRel>` / `this.<hasManyRel>`, return the
 * Convex `Doc<"table">` type for the related entity. Otherwise undefined so the
 * expression renderer falls back to {@link DEFAULT_LAMBDA_PARAM_TYPE}.
 */
export function resolveHasManyDocElementType(
  entity: IREntity,
  collection: IRExpression,
  options: NormalizedOptions,
): string | undefined {
  if (
    collection.kind !== 'member' ||
    collection.object.kind !== 'identifier' ||
    (collection.object.name !== 'self' && collection.object.name !== 'this')
  ) {
    return undefined;
  }
  const rel = entity.relationships.find(
    (r) => r.name === collection.property && r.kind === 'hasMany',
  );
  if (!rel?.target) return undefined;
  const table = resolveConvexTableName(rel.target, options);
  return `Doc<${JSON.stringify(table)}>`;
}

function memberChainRootAndFirstProperty(
  expression: IRExpression,
): { root: string; firstProperty: string } | undefined {
  const properties: string[] = [];
  let current = expression;
  while (current.kind === 'member') {
    properties.unshift(current.property);
    current = current.object;
  }
  if (current.kind !== 'identifier' || properties.length === 0) return undefined;
  return { root: current.name, firstProperty: properties[0]! };
}

function lambdaReadsHydratedField(lambda: IRExpression, target: IREntity): boolean {
  if (lambda.kind !== 'lambda') return false;
  const params = new Set(lambda.params);
  const hydratedNames = new Set([
    ...target.relationships.map((relationship) => relationship.name),
    ...target.computedProperties.map((property) => property.name),
  ]);

  const visit = (expression: IRExpression): boolean => {
    if (expression.kind === 'member') {
      const chain = memberChainRootAndFirstProperty(expression);
      if (chain && params.has(chain.root) && hydratedNames.has(chain.firstProperty)) return true;
    }
    switch (expression.kind) {
      case 'member':
        return visit(expression.object);
      case 'binary':
        return visit(expression.left) || visit(expression.right);
      case 'unary':
        return visit(expression.operand);
      case 'call':
        return visit(expression.callee) || expression.args.some(visit);
      case 'conditional':
        return (
          visit(expression.condition) || visit(expression.consequent) || visit(expression.alternate)
        );
      case 'array':
        return expression.elements.some(visit);
      case 'object':
        return expression.properties.some((property) => visit(property.value));
      case 'lambda':
        return visit(expression.body);
      default:
        return false;
    }
  };

  return visit(lambda.body);
}

/**
 * Resolve a named Doc type only while the callback reads stored row fields.
 * Aggregate hydration attaches relationships at runtime, so a callback that
 * traverses one must use the renderer's doc-shaped fallback instead.
 */
export function resolveHasManyLambdaParamType(
  ir: IR,
  entity: IREntity,
  collection: IRExpression,
  callback: IRExpression | undefined,
  options: NormalizedOptions,
): string | undefined {
  // Filtering preserves the source entity; mapping may produce plain objects.
  let source = collection;
  while (
    source.kind === 'call' &&
    source.callee.kind === 'identifier' &&
    source.callee.name === 'filter' &&
    source.args[0]
  ) {
    source = source.args[0];
  }
  const properties: string[] = [];
  while (source.kind === 'member') {
    properties.unshift(source.property);
    source = source.object;
  }
  if (source.kind !== 'identifier' || !['self', 'this'].includes(source.name)) return undefined;
  let target = entity;
  let collectionRelation = false;
  for (const name of properties) {
    const relation = target.relationships.find((candidate) => candidate.name === name);
    if (!relation) return undefined;
    const next = ir.entities.find((candidate) => candidate.name === relation.target);
    if (!next) return undefined;
    target = next;
    collectionRelation = relation.kind === 'hasMany';
  }
  if (!collectionRelation) return undefined;
  if (callback && lambdaReadsHydratedField(callback, target)) return undefined;
  return `Doc<${JSON.stringify(resolveConvexTableName(target.name, options))}>`;
}

/** True when generated code references `Doc<"…">` and needs a dataModel import. */
export function codeUsesDocType(code: string): boolean {
  return /\bDoc\s*</.test(code);
}

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

/**
 * Emit lines that load each hasMany collection onto `doc.<relName>` via the
 * inverse FK index. `docIdExpr` is the Convex document id expression (e.g. `docId`).
 * One-hop only — nested aggregate chains use {@link planAndRenderAggregateHydration}.
 */
export function renderCountOfHasManyPreloads(
  ir: IR,
  entity: IREntity,
  relNames: Iterable<string>,
  options: NormalizedOptions,
  docIdExpr: string,
): string[] {
  const synthetic: IRExpression[] = [];
  for (const relName of relNames) {
    synthetic.push({
      kind: 'call',
      callee: { kind: 'identifier', name: 'count_of' },
      args: [
        {
          kind: 'member',
          object: { kind: 'identifier', name: 'self' },
          property: relName,
        },
      ],
    });
  }
  return planAndRenderAggregateHydration(ir, entity, synthetic, options, docIdExpr).lines;
}
