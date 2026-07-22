/**
 * Read-policy gating shared by Convex query emission and the React client.
 */

import type { IR, IRExpression, IRPolicy } from '../../ir';
import type { RelationDependency } from '../../relation-plan.js';
import type { ProjectionDiagnostic } from '../interface';
import { renderExpression } from './expression.js';
import {
  buildReadPolicyRelationPlan,
  isHydratableReadRelation,
} from './read-policy-relations.js';

/**
 * True when read/`all` policies (entity-scoped or global) gate this entity.
 * Without `authContextImport`, gated entities emit `internalQuery` and must not
 * get client useQuery hooks. With the auth seam, queries are public and React
 * emits useQuery (tenant via getAuthContext; role policy exprs still partial).
 */
export function hasReadPolicies(ir: IR, entityName: string): boolean {
  return selectReadPolicies(ir, entityName).length > 0;
}

/** Applicable read/all policies in declaration order (runtime parity). */
export function selectReadPolicies(ir: IR, entityName: string): IRPolicy[] {
  return ir.policies.filter(
    (p) =>
      (p.action === 'read' || p.action === 'all') &&
      (p.entity === undefined || p.entity === entityName),
  );
}

/** Runtime-parity classification: only explicit self/this roots make a policy row-level. */
export function readPolicyReferencesSelf(expr: IRExpression): boolean {
  const walk = (node: IRExpression): boolean => {
    switch (node.kind) {
      case 'identifier':
        return node.name === 'self' || node.name === 'this';
      case 'member':
        return walk(node.object);
      case 'binary':
        return walk(node.left) || walk(node.right);
      case 'unary':
        return walk(node.operand);
      case 'call':
        return node.args.some(walk);
      case 'conditional':
        return walk(node.condition) || walk(node.consequent) || walk(node.alternate);
      case 'array':
        return node.elements.some(walk);
      case 'object':
        return node.properties.some((p) => walk(p.value));
      case 'lambda':
        return walk(node.body);
      default:
        return false;
    }
  };
  return walk(expr);
}

function expressionCalls(expr: IRExpression, builtin: string): boolean {
  const walk = (node: IRExpression): boolean => {
    if (node.kind === 'call' && node.callee.kind === 'identifier' && node.callee.name === builtin) {
      return true;
    }
    switch (node.kind) {
      case 'member':
        return walk(node.object);
      case 'binary':
        return walk(node.left) || walk(node.right);
      case 'unary':
        return walk(node.operand);
      case 'call':
        return walk(node.callee) || node.args.some(walk);
      case 'conditional':
        return walk(node.condition) || walk(node.consequent) || walk(node.alternate);
      case 'array':
        return node.elements.some(walk);
      case 'object':
        return node.properties.some((property) => walk(property.value));
      case 'lambda':
        return walk(node.body);
      default:
        return false;
    }
  };
  return walk(expr);
}

export interface RenderedReadPolicies {
  contextChecks: RenderedReadPolicyCheck[];
  rowChecks: RenderedReadPolicyCheck[];
  diagnostics: ProjectionDiagnostic[];
  renderable: boolean;
  /** belongsTo/ref dependencies to hydrate before row checks (empty when none). */
  relationDeps: RelationDependency[];
  relationVars: Record<string, string>;
}

export interface RenderedReadPolicyCheck {
  policyName: string;
  code: string;
}

export interface ReadPolicyRenderOptions {
  /** When set, `flag()` in read policies is renderable (import supplies `flag`). */
  flagProviderImport?: string;
}

function collectTraversedRelationNames(
  expr: IRExpression,
  relationshipNames: ReadonlySet<string>,
): string[] {
  const found = new Set<string>();
  const walk = (node: IRExpression): void => {
    if (
      node.kind === 'member' &&
      node.object.kind === 'identifier' &&
      (node.object.name === 'self' || node.object.name === 'this') &&
      relationshipNames.has(node.property)
    ) {
      found.add(node.property);
    }
    switch (node.kind) {
      case 'member':
        walk(node.object);
        break;
      case 'binary':
        walk(node.left);
        walk(node.right);
        break;
      case 'unary':
        walk(node.operand);
        break;
      case 'call':
        walk(node.callee);
        node.args.forEach(walk);
        break;
      case 'conditional':
        walk(node.condition);
        walk(node.consequent);
        walk(node.alternate);
        break;
      case 'array':
        node.elements.forEach(walk);
        break;
      case 'object':
        node.properties.forEach((property) => walk(property.value));
        break;
      case 'lambda':
        walk(node.body);
        break;
      default:
        break;
    }
  };
  walk(expr);
  return [...found];
}

/** Render policy predicates for a generated read handler. */
export function renderReadPolicies(
  ir: IR,
  entityName: string,
  selfVar: string,
  options: ReadPolicyRenderOptions = {},
): RenderedReadPolicies {
  const contextChecks: RenderedReadPolicyCheck[] = [];
  const rowChecks: RenderedReadPolicyCheck[] = [];
  const diagnostics: ProjectionDiagnostic[] = [];
  let renderable = true;
  const entity = ir.entities.find((candidate) => candidate.name === entityName);
  const relationshipNames = new Set(entity?.relationships.map((rel) => rel.name) ?? []);
  const flagSeam =
    typeof options.flagProviderImport === 'string' && options.flagProviderImport.length > 0;

  const plan = entity
    ? buildReadPolicyRelationPlan(ir, entity)
    : { relations: [] as RelationDependency[] };
  const hydratableByName = new Map(
    plan.relations
      .filter(isHydratableReadRelation)
      .map((dependency) => [dependency.relationName, dependency] as const),
  );
  const relationVars: Record<string, string> = {};
  for (const name of hydratableByName.keys()) {
    relationVars[name] = `__rel_${name}`;
  }
  const usedRelationDeps = new Map<string, RelationDependency>();

  for (const policy of selectReadPolicies(ir, entityName)) {
    if (policy.rateLimit) {
      renderable = false;
      diagnostics.push({
        severity: 'error',
        code: 'CONVEX_UNSUPPORTED_READ_POLICY_RATE_LIMIT',
        entity: entityName,
        message: `Read policy '${policy.name}' declares rateLimit; generated Convex queries remain internal until a durable read-rate-limit seam is configured.`,
      });
      continue;
    }
    if (expressionCalls(policy.expression, 'flag') && !flagSeam) {
      renderable = false;
      diagnostics.push({
        severity: 'error',
        code: 'CONVEX_UNSUPPORTED_READ_POLICY_FLAG',
        entity: entityName,
        message: `Read policy '${policy.name}' calls flag(); set options.flagProviderImport to a module exporting flag(name), or queries remain internal.`,
      });
      continue;
    }
    const traversed = collectTraversedRelationNames(policy.expression, relationshipNames);
    const unsupported = traversed.filter((name) => !hydratableByName.has(name));
    if (unsupported.length > 0) {
      renderable = false;
      diagnostics.push({
        severity: 'error',
        code: 'CONVEX_UNSUPPORTED_READ_POLICY_RELATIONSHIP',
        entity: entityName,
        message: `Read policy '${policy.name}' traverses relationship(s) ${unsupported.join(', ')} that Convex queries cannot hydrate (hasMany/through/invalid mapping); queries remain internal.`,
      });
      continue;
    }
    for (const name of traversed) {
      const dep = hydratableByName.get(name);
      if (dep) usedRelationDeps.set(name, dep);
    }
    const rendered = renderExpression(policy.expression, {
      selfVar,
      relationVars: traversed.length > 0 ? relationVars : undefined,
    });
    if (rendered.unresolved.length > 0) {
      renderable = false;
      diagnostics.push({
        severity: 'error',
        code: 'CONVEX_UNRESOLVED_READ_POLICY',
        entity: entityName,
        message: `Read policy '${policy.name}' cannot be rendered (${rendered.unresolved.join('; ')}); queries remain internal (fail closed).`,
      });
      continue;
    }
    (readPolicyReferencesSelf(policy.expression) ? rowChecks : contextChecks).push({
      policyName: policy.name,
      code: rendered.code,
    });
  }

  return {
    contextChecks,
    rowChecks,
    diagnostics,
    renderable,
    relationDeps: [...usedRelationDeps.values()],
    relationVars,
  };
}

/**
 * Shared client-readability decision for `convex.queries` and `convex.react`.
 *
 * - Not gated → public `query` + useQuery hooks.
 * - Gated + auth seam + fully renderable policies → public `query` that
 *   enforces those policies (never silent fail-open).
 * - Otherwise → `internalQuery` and no browser hooks (fail closed).
 */
export function resolveConvexReadVisibility(
  ir: IR,
  entityName: string,
  authContextImport: string | undefined,
  selfVar = '__row',
  flagProviderImport?: string,
): {
  gated: boolean;
  clientReadable: boolean;
  policies: RenderedReadPolicies;
} {
  const gated = hasReadPolicies(ir, entityName);
  const policies = renderReadPolicies(ir, entityName, selfVar, { flagProviderImport });
  const authSeam = typeof authContextImport === 'string' && authContextImport.length > 0;
  const clientReadable = !gated || (authSeam && policies.renderable);
  return { gated, clientReadable, policies };
}
