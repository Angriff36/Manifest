/**
 * Nested relationship hydration for Convex aggregate builtins
 * (`flat_map`, `unique_of`, `sum`, `map`, `filter`, `count_of`, …).
 *
 * Convex documents do not embed hasMany/belongsTo graphs. One-hop
 * `count_of(self.<rel>)` already preloads inverse FK rows onto `doc`. Multi-hop
 * chains (e.g. self.joins → join.mid → mid.lines → line.leaf.tags) need the same
 * treatment at every relationship depth before the lowered expression runs.
 */

import type { IR, IREntity, IRExpression, IRRelationship } from '../../ir';
import type { NormalizedOptions } from './generator.js';
import { resolveConvexTableName } from './generator.js';

const AGGREGATE_CALLEES = new Set([
  'count_of',
  'sum',
  'avg',
  'map',
  'filter',
  'flat_map',
  'unique_of',
  'min_of',
  'max_of',
]);

export type AggregateHydrateHop =
  | {
      kind: 'hasMany';
      relName: string;
      fromEntity: string;
      toEntity: string;
      fkField: string;
      childTable: string;
    }
  | {
      kind: 'belongsTo';
      relName: string;
      fromEntity: string;
      toEntity: string;
      fkField: string;
      targetTable: string;
    };

export type AggregateHydrateNode = {
  hop: AggregateHydrateHop;
  children: Map<string, AggregateHydrateNode>;
};

export type AggregateHydrateTree = Map<string, AggregateHydrateNode>;

function hopKey(hop: AggregateHydrateHop): string {
  return `${hop.kind}:${hop.relName}`;
}

function memberChain(expression: IRExpression): { root: string; properties: string[] } | undefined {
  const properties: string[] = [];
  let current: IRExpression = expression;
  while (current.kind === 'member') {
    properties.unshift(current.property);
    current = current.object;
  }
  if (current.kind !== 'identifier') return undefined;
  return { root: current.name, properties };
}

/** Non-tenant FK column for a belongsTo/ref (mirrors count-of-preload). */
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

function belongsToFkField(
  fromEntityName: string,
  rel: IRRelationship,
  tenantProp: string | undefined,
  options: NormalizedOptions,
): string {
  const override = options.references[fromEntityName]?.[rel.name];
  if (override) return override;
  const fields = rel.foreignKey?.fields ?? [];
  const nonTenant = fields.find((f) => f !== tenantProp);
  return nonTenant ?? `${rel.name}Id`;
}

function resolveHasManyHop(
  ir: IR,
  fromEntityName: string,
  relName: string,
  options: NormalizedOptions,
): AggregateHydrateHop | null {
  const fromEntity = ir.entities.find((e) => e.name === fromEntityName);
  if (!fromEntity) return null;
  const rel = fromEntity.relationships.find((r) => r.name === relName && r.kind === 'hasMany');
  if (!rel?.target || rel.through) return null;
  const target = ir.entities.find((e) => e.name === rel.target);
  if (!target) return null;
  const inverse = target.relationships.find(
    (r) => (r.kind === 'belongsTo' || r.kind === 'ref') && r.target === fromEntityName,
  );
  if (!inverse) return null;
  const tenantProp = ir.tenant?.property;
  return {
    kind: 'hasMany',
    relName,
    fromEntity: fromEntityName,
    toEntity: rel.target,
    fkField: inverseFkField(target.name, inverse, tenantProp, options),
    childTable: resolveConvexTableName(rel.target, options),
  };
}

function resolveBelongsToHop(
  ir: IR,
  fromEntityName: string,
  relName: string,
  options: NormalizedOptions,
): AggregateHydrateHop | null {
  const fromEntity = ir.entities.find((e) => e.name === fromEntityName);
  if (!fromEntity) return null;
  const rel = fromEntity.relationships.find(
    (r) => r.name === relName && (r.kind === 'belongsTo' || r.kind === 'ref'),
  );
  if (!rel?.target) return null;
  const tenantProp = ir.tenant?.property;
  return {
    kind: 'belongsTo',
    relName,
    fromEntity: fromEntityName,
    toEntity: rel.target,
    fkField: belongsToFkField(fromEntityName, rel, tenantProp, options),
    targetTable: resolveConvexTableName(rel.target, options),
  };
}

function hopsFromChain(
  ir: IR,
  startEntity: string,
  properties: string[],
  options: NormalizedOptions,
): { hops: AggregateHydrateHop[]; elementEntity: string | undefined } {
  const hops: AggregateHydrateHop[] = [];
  let currentEntity = startEntity;
  for (const prop of properties) {
    const hasMany = resolveHasManyHop(ir, currentEntity, prop, options);
    if (hasMany) {
      hops.push(hasMany);
      currentEntity = hasMany.toEntity;
      continue;
    }
    const belongsTo = resolveBelongsToHop(ir, currentEntity, prop, options);
    if (belongsTo) {
      hops.push(belongsTo);
      currentEntity = belongsTo.toEntity;
      continue;
    }
    break;
  }
  const last = hops[hops.length - 1];
  const elementEntity =
    last?.kind === 'hasMany' ? last.toEntity : hops.length > 0 ? currentEntity : undefined;
  return { hops, elementEntity };
}

function mergeHops(tree: AggregateHydrateTree, hops: AggregateHydrateHop[]): void {
  let level: AggregateHydrateTree = tree;
  for (const hop of hops) {
    const key = hopKey(hop);
    let node = level.get(key);
    if (!node) {
      node = { hop, children: new Map() };
      level.set(key, node);
    }
    level = node.children;
  }
}

function walkExpression(
  expr: IRExpression | undefined,
  rootEntity: IREntity,
  bindings: ReadonlyMap<string, string>,
  pathPrefix: readonly AggregateHydrateHop[],
  ir: IR,
  options: NormalizedOptions,
  tree: AggregateHydrateTree,
): void {
  if (!expr) return;

  switch (expr.kind) {
    case 'call': {
      const callee = expr.callee.kind === 'identifier' ? expr.callee.name : undefined;
      if (callee && AGGREGATE_CALLEES.has(callee) && expr.args[0]) {
        const chain = memberChain(expr.args[0]);
        if (chain) {
          let startEntity: string | undefined;
          let prefix: readonly AggregateHydrateHop[] = pathPrefix;
          if (chain.root === 'self' || chain.root === 'this') {
            startEntity = rootEntity.name;
            prefix = [];
          } else {
            startEntity = bindings.get(chain.root);
          }
          if (startEntity) {
            const { hops, elementEntity } = hopsFromChain(
              ir,
              startEntity,
              chain.properties,
              options,
            );
            mergeHops(tree, [...prefix, ...hops]);
            const lambda = expr.args[1];
            if (lambda?.kind === 'lambda' && lambda.params[0] && elementEntity) {
              const nextBindings = new Map(bindings);
              nextBindings.set(lambda.params[0], elementEntity);
              walkExpression(
                lambda.body,
                rootEntity,
                nextBindings,
                [...prefix, ...hops],
                ir,
                options,
                tree,
              );
              for (let i = 2; i < expr.args.length; i++) {
                walkExpression(expr.args[i], rootEntity, bindings, pathPrefix, ir, options, tree);
              }
              return;
            }
          }
        }
      }
      for (const arg of expr.args) {
        walkExpression(arg, rootEntity, bindings, pathPrefix, ir, options, tree);
      }
      return;
    }
    case 'member': {
      const chain = memberChain(expr);
      if (chain) {
        let startEntity: string | undefined;
        let prefix: readonly AggregateHydrateHop[] = pathPrefix;
        if (chain.root === 'self' || chain.root === 'this') {
          startEntity = rootEntity.name;
          prefix = [];
        } else {
          startEntity = bindings.get(chain.root);
        }
        if (startEntity) {
          const { hops } = hopsFromChain(ir, startEntity, chain.properties, options);
          if (hops.length) mergeHops(tree, [...prefix, ...hops]);
        }
      }
      return;
    }
    case 'binary':
      walkExpression(expr.left, rootEntity, bindings, pathPrefix, ir, options, tree);
      walkExpression(expr.right, rootEntity, bindings, pathPrefix, ir, options, tree);
      return;
    case 'unary':
      walkExpression(expr.operand, rootEntity, bindings, pathPrefix, ir, options, tree);
      return;
    case 'conditional':
      walkExpression(expr.condition, rootEntity, bindings, pathPrefix, ir, options, tree);
      walkExpression(expr.consequent, rootEntity, bindings, pathPrefix, ir, options, tree);
      walkExpression(expr.alternate, rootEntity, bindings, pathPrefix, ir, options, tree);
      return;
    case 'array':
      for (const el of expr.elements) {
        walkExpression(el, rootEntity, bindings, pathPrefix, ir, options, tree);
      }
      return;
    case 'object':
      for (const p of expr.properties) {
        walkExpression(p.value, rootEntity, bindings, pathPrefix, ir, options, tree);
      }
      return;
    case 'lambda':
      walkExpression(expr.body, rootEntity, bindings, pathPrefix, ir, options, tree);
      return;
    case 'aggregate':
      for (const predicate of expr.predicates) {
        walkExpression(predicate.value, rootEntity, bindings, pathPrefix, ir, options, tree);
      }
      return;
    default:
      return;
  }
}

/** Build a hydration tree covering every relationship hop in the expressions. */
export function collectAggregateHydrationTree(
  ir: IR,
  entity: IREntity,
  exprs: Iterable<IRExpression | undefined>,
  options: NormalizedOptions,
): AggregateHydrateTree {
  const tree: AggregateHydrateTree = new Map();
  for (const expr of exprs) {
    walkExpression(expr, entity, new Map(), [], ir, options, tree);
  }
  return tree;
}

/** Root-level hasMany relation names successfully planned for preload. */
export function rootHasManyRelNames(tree: AggregateHydrateTree): string[] {
  const names: string[] = [];
  for (const node of tree.values()) {
    if (node.hop.kind === 'hasMany') names.push(node.hop.relName);
  }
  return names;
}

/**
 * Emit statements that load each hop onto the document graph.
 * `docExpr` is typically `(doc as any)`; `docIdExpr` is the Convex id for the root.
 */
export function renderAggregateHydration(
  tree: AggregateHydrateTree,
  docExpr: string,
  docIdExpr: string,
  baseIndent = '    ',
): string[] {
  if (tree.size === 0) return [];
  const lines: string[] = [];
  let counter = 0;

  const renderLevel = (
    nodes: AggregateHydrateTree,
    parentExpr: string,
    parentIdExpr: string,
    depth: number,
  ): void => {
    const indent = baseIndent + '  '.repeat(depth);
    for (const node of nodes.values()) {
      const hop = node.hop;
      if (hop.kind === 'hasMany') {
        lines.push(
          `${indent}${parentExpr}.${hop.relName} = await ctx.db.query(${JSON.stringify(hop.childTable)}).withIndex(${JSON.stringify(`by_${hop.fkField}`)}, (q) => q.eq(${JSON.stringify(hop.fkField)}, ${parentIdExpr})).collect();`,
        );
        if (node.children.size > 0) {
          const item = `__agg${counter++}`;
          lines.push(
            `${indent}for (const ${item} of (${parentExpr}.${hop.relName} ?? []) as any[]) {`,
          );
          renderLevel(node.children, item, `${item}._id`, depth + 1);
          lines.push(`${indent}}`);
        }
        continue;
      }

      lines.push(
        `${indent}{`,
        `${indent}  const __fk = (${parentExpr} as any).${hop.fkField};`,
        `${indent}  (${parentExpr} as any).${hop.relName} = __fk != null ? await ctx.db.get(__fk as any) : null;`,
        `${indent}}`,
      );
      if (node.children.size > 0) {
        const relExpr = `(${parentExpr} as any).${hop.relName}`;
        lines.push(`${indent}if (${relExpr}) {`);
        renderLevel(node.children, relExpr, `${relExpr}._id`, depth + 1);
        lines.push(`${indent}}`);
      }
    }
  };

  renderLevel(tree, docExpr, docIdExpr, 0);
  return lines;
}

/** Collect + render hydration for one entity from a set of expressions. */
export function planAndRenderAggregateHydration(
  ir: IR,
  entity: IREntity,
  exprs: Iterable<IRExpression | undefined>,
  options: NormalizedOptions,
  docIdExpr: string,
  docExpr = '(doc as any)',
  baseIndent = '    ',
): { tree: AggregateHydrateTree; lines: string[]; rootHasMany: string[] } {
  const tree = collectAggregateHydrationTree(ir, entity, exprs, options);
  return {
    tree,
    lines: renderAggregateHydration(tree, docExpr, docIdExpr, baseIndent),
    rootHasMany: rootHasManyRelNames(tree),
  };
}
