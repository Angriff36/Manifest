/**
 * Nested relationship hydration for Convex aggregate builtins
 * (`flat_map`, `unique_of`, `sum`, `map`, `filter`, `count_of`, …).
 *
 * Convex documents do not embed hasMany/belongsTo graphs. One-hop
 * `count_of(self.<rel>)` already preloads inverse FK rows onto `doc`. Multi-hop
 * chains (e.g. self.joins → join.mid → mid.lines → line.leaf.tags) need the same
 * treatment at every relationship depth before the lowered expression runs.
 *
 * Parent aggregates over child *computed* fields (e.g. Event.estimatedFoodCost =
 * sum(eventDishes, item => item.estimatedCost)) also expand those child computed
 * expressions into the hydrate tree and materialize the computed values onto each
 * hasMany element before the parent expression runs.
 */

import type { IR, IREntity, IRExpression } from '../../ir';
import type { ProjectionDiagnostic } from '../interface.js';
import {
  belongsToUnsupportedDiagnostic,
  inverseFkField,
  renderBelongsToHydration,
  resolveBelongsToHydrateHop,
  type BelongsToHydrateHop,
} from './belongs-to-hydrate.js';
import { resolveHasManyDocElementType } from './count-of-preload.js';
import { renderExpression } from './expression.js';
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

/** Wrappers whose first arg is still a collection (peel to find the member chain). */
const COLLECTION_WRAPPERS = new Set(['filter', 'map', 'flat_map']);

type MemberChain = { root: string; properties: string[] };

/**
 * Peel `filter`/`map`/`flat_map` wrappers so `sum(filter(self.lines, pred), mapper)`
 * resolves hops from `self.lines` and binds both lambdas to the element entity.
 */
function peelToMemberChain(collection: IRExpression): {
  chain: MemberChain;
  wrapperLambdas: IRExpression[];
} | null {
  const wrapperLambdas: IRExpression[] = [];
  let current: IRExpression = collection;
  while (current.kind === 'call') {
    const callee = current.callee.kind === 'identifier' ? current.callee.name : undefined;
    if (callee && COLLECTION_WRAPPERS.has(callee) && current.args[0]) {
      if (current.args[1]) wrapperLambdas.push(current.args[1]!);
      current = current.args[0]!;
      continue;
    }
    break;
  }
  const chain = memberChain(current);
  if (!chain) return null;
  return { chain, wrapperLambdas };
}

export type AggregateHydrateHop =
  | {
      kind: 'hasMany';
      relName: string;
      fromEntity: string;
      toEntity: string;
      fkField: string;
      childTable: string;
    }
  | BelongsToHydrateHop;

export type AggregateHydrateNode = {
  hop: AggregateHydrateHop;
  children: Map<string, AggregateHydrateNode>;
  /** Computed property names to materialize on each hasMany element after hydrate. */
  requiredComputeds?: Set<string>;
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

function hopsFromChain(
  ir: IR,
  startEntity: string,
  properties: string[],
  options: NormalizedOptions,
): {
  hops: AggregateHydrateHop[];
  elementEntity: string | undefined;
  entityAfterHops: string;
  remaining: string[];
} {
  const hops: AggregateHydrateHop[] = [];
  let currentEntity = startEntity;
  let consumed = 0;
  for (const prop of properties) {
    const hasMany = resolveHasManyHop(ir, currentEntity, prop, options);
    if (hasMany) {
      hops.push(hasMany);
      currentEntity = hasMany.toEntity;
      consumed += 1;
      continue;
    }
    const belongsTo = resolveBelongsToHydrateHop(ir, currentEntity, prop, options);
    if (belongsTo) {
      hops.push(belongsTo);
      currentEntity = belongsTo.toEntity;
      consumed += 1;
      continue;
    }
    break;
  }
  const last = hops[hops.length - 1];
  const elementEntity =
    last?.kind === 'hasMany' ? last.toEntity : hops.length > 0 ? currentEntity : undefined;
  return {
    hops,
    elementEntity,
    entityAfterHops: hops.length > 0 ? currentEntity : startEntity,
    remaining: properties.slice(consumed),
  };
}

function mergeHops(
  tree: AggregateHydrateTree,
  hops: AggregateHydrateHop[],
): AggregateHydrateNode | null {
  if (hops.length === 0) return null;
  let level: AggregateHydrateTree = tree;
  let node: AggregateHydrateNode | null = null;
  for (const hop of hops) {
    const key = hopKey(hop);
    node = level.get(key) ?? null;
    if (!node) {
      node = { hop, children: new Map() };
      level.set(key, node);
    }
    level = node.children;
  }
  return node;
}

function markRequiredComputeds(
  tree: AggregateHydrateTree,
  pathHops: readonly AggregateHydrateHop[],
  names: Iterable<string>,
): void {
  if (pathHops.length === 0) return;
  const node = mergeHops(tree, [...pathHops]);
  if (!node || node.hop.kind !== 'hasMany') return;
  if (!node.requiredComputeds) node.requiredComputeds = new Set();
  for (const name of names) node.requiredComputeds.add(name);
}

function findEntity(ir: IR, name: string): IREntity | undefined {
  return ir.entities.find((e) => e.name === name);
}

/** Declaration-order closure of computed names reachable via self.<computed> refs. */
function collectComputedClosure(entity: IREntity, rootName: string): string[] {
  const needed = new Set<string>();
  const visit = (name: string): void => {
    if (needed.has(name)) return;
    const cp = entity.computedProperties.find((c) => c.name === name);
    if (!cp) return;
    needed.add(name);
    walkComputedSelfRefs(cp.expression, (ref) => {
      if (entity.computedProperties.some((c) => c.name === ref)) visit(ref);
    });
  };
  visit(rootName);
  return entity.computedProperties.map((c) => c.name).filter((n) => needed.has(n));
}

function walkComputedSelfRefs(expr: IRExpression | undefined, onRef: (name: string) => void): void {
  if (!expr) return;
  switch (expr.kind) {
    case 'member': {
      const chain = memberChain(expr);
      if (
        chain &&
        (chain.root === 'self' || chain.root === 'this') &&
        chain.properties.length >= 1
      ) {
        onRef(chain.properties[0]!);
      }
      return;
    }
    case 'call':
      for (const arg of expr.args) walkComputedSelfRefs(arg, onRef);
      if (expr.callee.kind !== 'identifier') walkComputedSelfRefs(expr.callee, onRef);
      return;
    case 'binary':
      walkComputedSelfRefs(expr.left, onRef);
      walkComputedSelfRefs(expr.right, onRef);
      return;
    case 'unary':
      walkComputedSelfRefs(expr.operand, onRef);
      return;
    case 'conditional':
      walkComputedSelfRefs(expr.condition, onRef);
      walkComputedSelfRefs(expr.consequent, onRef);
      walkComputedSelfRefs(expr.alternate, onRef);
      return;
    case 'array':
      for (const el of expr.elements) walkComputedSelfRefs(el, onRef);
      return;
    case 'object':
      for (const p of expr.properties) walkComputedSelfRefs(p.value, onRef);
      return;
    case 'lambda':
      walkComputedSelfRefs(expr.body, onRef);
      return;
    case 'aggregate':
      for (const predicate of expr.predicates) walkComputedSelfRefs(predicate.value, onRef);
      return;
    default:
      return;
  }
}

/**
 * When a member chain ends on a computed property, mark it for materialization
 * (hasMany parents) and walk that computed's expression under the same path.
 */
function expandTrailingComputed(
  ir: IR,
  options: NormalizedOptions,
  tree: AggregateHydrateTree,
  pathHops: readonly AggregateHydrateHop[],
  entityName: string,
  remaining: string[],
  expanding: Set<string>,
): void {
  if (remaining.length !== 1) return;
  const computedName = remaining[0]!;
  const entity = findEntity(ir, entityName);
  if (!entity?.computedProperties.some((c) => c.name === computedName)) return;

  const expandKey = `${entityName}.${computedName}`;
  if (expanding.has(expandKey)) return;
  expanding.add(expandKey);

  const needed = collectComputedClosure(entity, computedName);
  markRequiredComputeds(tree, pathHops, needed);
  for (const name of needed) {
    const cp = entity.computedProperties.find((c) => c.name === name);
    if (!cp) continue;
    walkExpression(cp.expression, entity, new Map(), pathHops, ir, options, tree, expanding);
  }
  expanding.delete(expandKey);
}

function walkExpression(
  expr: IRExpression | undefined,
  rootEntity: IREntity,
  bindings: ReadonlyMap<string, string>,
  pathPrefix: readonly AggregateHydrateHop[],
  ir: IR,
  options: NormalizedOptions,
  tree: AggregateHydrateTree,
  expanding: Set<string> = new Set(),
): void {
  if (!expr) return;

  switch (expr.kind) {
    case 'call': {
      const callee = expr.callee.kind === 'identifier' ? expr.callee.name : undefined;
      if (callee && AGGREGATE_CALLEES.has(callee) && expr.args[0]) {
        const peeled = peelToMemberChain(expr.args[0]);
        if (peeled) {
          let startEntity: string | undefined;
          let prefix: readonly AggregateHydrateHop[] = pathPrefix;
          if (peeled.chain.root === 'self' || peeled.chain.root === 'this') {
            startEntity = rootEntity.name;
            // Keep pathPrefix so child-computed expansion nests under hasMany parents.
            prefix = pathPrefix;
          } else {
            startEntity = bindings.get(peeled.chain.root);
          }
          if (startEntity) {
            const { hops, elementEntity, entityAfterHops, remaining } = hopsFromChain(
              ir,
              startEntity,
              peeled.chain.properties,
              options,
            );
            const hopPrefix = [...prefix, ...hops];
            mergeHops(tree, hopPrefix);
            expandTrailingComputed(
              ir,
              options,
              tree,
              hopPrefix,
              entityAfterHops,
              remaining,
              expanding,
            );
            const nextBindings = new Map(bindings);
            const walkBoundLambda = (lambda: IRExpression | undefined): void => {
              if (lambda?.kind !== 'lambda' || !lambda.params[0] || !elementEntity) return;
              nextBindings.set(lambda.params[0], elementEntity);
              walkExpression(
                lambda.body,
                rootEntity,
                nextBindings,
                hopPrefix,
                ir,
                options,
                tree,
                expanding,
              );
            };
            for (const wrapperLambda of peeled.wrapperLambdas) {
              walkBoundLambda(wrapperLambda);
            }
            walkBoundLambda(expr.args[1]);
            for (let i = 2; i < expr.args.length; i++) {
              walkExpression(
                expr.args[i],
                rootEntity,
                bindings,
                pathPrefix,
                ir,
                options,
                tree,
                expanding,
              );
            }
            return;
          }
        }
      }
      for (const arg of expr.args) {
        walkExpression(arg, rootEntity, bindings, pathPrefix, ir, options, tree, expanding);
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
          prefix = pathPrefix;
        } else {
          startEntity = bindings.get(chain.root);
        }
        if (startEntity) {
          const { hops, entityAfterHops, remaining } = hopsFromChain(
            ir,
            startEntity,
            chain.properties,
            options,
          );
          const hopPrefix = [...prefix, ...hops];
          if (hops.length) mergeHops(tree, hopPrefix);
          expandTrailingComputed(
            ir,
            options,
            tree,
            hopPrefix,
            entityAfterHops,
            remaining,
            expanding,
          );
        }
      }
      return;
    }
    case 'binary':
      walkExpression(expr.left, rootEntity, bindings, pathPrefix, ir, options, tree, expanding);
      walkExpression(expr.right, rootEntity, bindings, pathPrefix, ir, options, tree, expanding);
      return;
    case 'unary':
      walkExpression(expr.operand, rootEntity, bindings, pathPrefix, ir, options, tree, expanding);
      return;
    case 'conditional':
      walkExpression(
        expr.condition,
        rootEntity,
        bindings,
        pathPrefix,
        ir,
        options,
        tree,
        expanding,
      );
      walkExpression(
        expr.consequent,
        rootEntity,
        bindings,
        pathPrefix,
        ir,
        options,
        tree,
        expanding,
      );
      walkExpression(
        expr.alternate,
        rootEntity,
        bindings,
        pathPrefix,
        ir,
        options,
        tree,
        expanding,
      );
      return;
    case 'array':
      for (const el of expr.elements) {
        walkExpression(el, rootEntity, bindings, pathPrefix, ir, options, tree, expanding);
      }
      return;
    case 'object':
      for (const p of expr.properties) {
        walkExpression(p.value, rootEntity, bindings, pathPrefix, ir, options, tree, expanding);
      }
      return;
    case 'lambda':
      walkExpression(expr.body, rootEntity, bindings, pathPrefix, ir, options, tree, expanding);
      return;
    case 'aggregate':
      for (const predicate of expr.predicates) {
        walkExpression(
          predicate.value,
          rootEntity,
          bindings,
          pathPrefix,
          ir,
          options,
          tree,
          expanding,
        );
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
  const expanding = new Set<string>();
  for (const expr of exprs) {
    walkExpression(expr, entity, new Map(), [], ir, options, tree, expanding);
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

function collectBelongsToDiagnostics(
  tree: AggregateHydrateTree,
  diagnostics: ProjectionDiagnostic[],
): void {
  for (const node of tree.values()) {
    if (node.hop.kind === 'belongsTo') {
      const diagnostic = belongsToUnsupportedDiagnostic(node.hop);
      if (diagnostic) diagnostics.push(diagnostic);
    }
    collectBelongsToDiagnostics(node.children, diagnostics);
  }
}

function orderedRequiredComputeds(entity: IREntity, required: Set<string>): string[] {
  const ordered: string[] = [];
  for (const name of required) {
    for (const dep of collectComputedClosure(entity, name)) {
      if (!ordered.includes(dep)) ordered.push(dep);
    }
  }
  // Preserve entity declaration order for stable assign-back.
  return entity.computedProperties.map((c) => c.name).filter((n) => ordered.includes(n));
}

function renderComputedMaterialization(
  ir: IR,
  options: NormalizedOptions,
  entityName: string,
  required: Set<string>,
  itemVar: string,
  indent: string,
): string[] {
  const entity = findEntity(ir, entityName);
  if (!entity || required.size === 0) return [];
  const names = orderedRequiredComputeds(entity, required);
  if (names.length === 0) return [];
  const scope = {
    selfVar: itemVar,
    resolveCollectionElementType: (collection: IRExpression) =>
      resolveHasManyDocElementType(entity, collection, options),
  };
  const lines: string[] = [];
  for (const name of names) {
    const cp = entity.computedProperties.find((c) => c.name === name);
    if (!cp) continue;
    const { code, unresolved } = renderExpression(cp.expression, scope);
    if (unresolved.length || !code) continue;
    lines.push(`${indent}${itemVar}.${name} = ${code};`);
  }
  return lines;
}

/**
 * Emit statements that load each hop onto the document graph.
 * `docExpr` is typically `(doc as any)`; `docIdExpr` is the Convex id for the root.
 * When `ir`/`options` are provided, hasMany elements also receive materialization
 * assigns for child computed properties referenced by parent aggregates.
 */
export function renderAggregateHydration(
  tree: AggregateHydrateTree,
  docExpr: string,
  docIdExpr: string,
  baseIndent = '    ',
  ir?: IR,
  options?: NormalizedOptions,
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
          `${indent}${parentExpr}.${hop.relName} = await ctx.db.query(${JSON.stringify(hop.childTable)}).withIndex(${JSON.stringify(`by_${hop.fkField}`)}, (q: any) => q.eq(${JSON.stringify(hop.fkField)}, ${parentIdExpr})).collect();`,
        );
        const needsLoop =
          node.children.size > 0 ||
          (node.requiredComputeds != null && node.requiredComputeds.size > 0);
        if (needsLoop) {
          const item = `__agg${counter++}`;
          lines.push(
            `${indent}for (const ${item} of (${parentExpr}.${hop.relName} ?? []) as any[]) {`,
          );
          renderLevel(node.children, item, `${item}._id`, depth + 1);
          if (ir && options && node.requiredComputeds && node.requiredComputeds.size > 0) {
            lines.push(
              ...renderComputedMaterialization(
                ir,
                options,
                hop.toEntity,
                node.requiredComputeds,
                item,
                indent + '  ',
              ),
            );
          }
          lines.push(`${indent}}`);
        }
        continue;
      }

      lines.push(...renderBelongsToHydration(hop, parentExpr, indent));
      if (node.children.size > 0 && hop.mode !== 'unsupported') {
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
): {
  tree: AggregateHydrateTree;
  lines: string[];
  rootHasMany: string[];
  diagnostics: ProjectionDiagnostic[];
} {
  const tree = collectAggregateHydrationTree(ir, entity, exprs, options);
  const diagnostics: ProjectionDiagnostic[] = [];
  collectBelongsToDiagnostics(tree, diagnostics);
  return {
    tree,
    lines: renderAggregateHydration(tree, docExpr, docIdExpr, baseIndent, ir, options),
    rootHasMany: rootHasManyRelNames(tree),
    diagnostics,
  };
}
