/**
 * Read-policy gating shared by Convex query emission and the React client.
 */

import type { IR, IRExpression, IRPolicy } from '../../ir';
import type { ProjectionDiagnostic } from '../interface';
import { renderExpression } from './expression.js';

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

function expressionTraversesRelationship(
  expr: IRExpression,
  relationshipNames: ReadonlySet<string>,
): boolean {
  const walk = (node: IRExpression): boolean => {
    if (
      node.kind === 'member' &&
      node.object.kind === 'identifier' &&
      (node.object.name === 'self' || node.object.name === 'this') &&
      relationshipNames.has(node.property)
    ) {
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
}

export interface RenderedReadPolicyCheck {
  policyName: string;
  code: string;
}

/** Render policy predicates for a generated read handler. */
export function renderReadPolicies(
  ir: IR,
  entityName: string,
  selfVar: string,
): RenderedReadPolicies {
  const contextChecks: RenderedReadPolicyCheck[] = [];
  const rowChecks: RenderedReadPolicyCheck[] = [];
  const diagnostics: ProjectionDiagnostic[] = [];
  let renderable = true;
  const relationshipNames = new Set(
    ir.entities
      .find((entity) => entity.name === entityName)
      ?.relationships.map((rel) => rel.name) ?? [],
  );

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
    if (expressionCalls(policy.expression, 'flag')) {
      renderable = false;
      diagnostics.push({
        severity: 'error',
        code: 'CONVEX_UNSUPPORTED_READ_POLICY_FLAG',
        entity: entityName,
        message: `Read policy '${policy.name}' calls flag(); generated Convex queries remain internal until a feature-flag provider seam is configured.`,
      });
      continue;
    }
    if (expressionTraversesRelationship(policy.expression, relationshipNames)) {
      renderable = false;
      diagnostics.push({
        severity: 'error',
        code: 'CONVEX_UNSUPPORTED_READ_POLICY_RELATIONSHIP',
        entity: entityName,
        message: `Read policy '${policy.name}' traverses a relationship; generated Convex queries remain internal until relationship preloading preserves runtime semantics.`,
      });
      continue;
    }
    const rendered = renderExpression(policy.expression, { selfVar });
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

  return { contextChecks, rowChecks, diagnostics, renderable };
}
