/**
 * Sibling-call parameter binding proof for add-required-input.
 *
 * When the same enclosing component/callable already passes
 * `param: <expr>` into another call that shares the target call's identity
 * argument (e.g. both use `id: task.id`), that expression is a proven source —
 * never invent actor/context values, never borrow from a different dialog target.
 *
 * Sibling must also belong to the same Manifest entity as the target capability.
 */

import ts from 'typescript';
import type { ProvenValueSource } from './required-input-source.js';

const IDENTITY_KEYS = new Set(['id', 'entityId']);

export interface SiblingBindingHit {
  call: ts.CallExpression;
  expression: string;
  identityExpression: string;
}

/**
 * Collect `param: expr` bindings from sibling CallExpressions inside the
 * outermost enclosing callable (e.g. React component), excluding the target call.
 *
 * Sibling must:
 * - belong to the same Manifest entity as `capabilityId`
 * - share the same identity property expression as the target
 *
 * - Exactly one unique expression → one candidate (rank 2)
 * - Multiple distinct expressions → all candidates at rank 2 (resolver → ambiguous)
 * - Expression root must be in the closure chain (param / local / destructure)
 */
export function collectSiblingParamBindings(
  sf: ts.SourceFile,
  call: ts.CallExpression,
  scopes: ts.Node[],
  paramName: string,
  out: ProvenValueSource[],
  capabilityId: string,
): SiblingBindingHit[] {
  const outermost = scopes[scopes.length - 1];
  if (!outermost) return [];

  const targetEntity = capabilityId.split('.')[0];
  if (!targetEntity) return [];

  const targetIdentity = extractIdentityExpression(call, sf);
  if (!targetIdentity) return [];

  const hits: SiblingBindingHit[] = [];
  const visit = (node: ts.Node) => {
    if (node === call) return;
    if (ts.isCallExpression(node)) {
      collectParamFromCallArgs(
        node,
        sf,
        call,
        paramName,
        targetIdentity,
        targetEntity,
        hits,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(outermost);

  const exprs = new Set(hits.map(h => h.expression));
  if (exprs.size === 0) return [];

  for (const expression of [...exprs].sort()) {
    if (!expressionRootInScope(expression, scopes, sf, call.getStart(sf))) {
      continue;
    }
    const typeText = resolveBindingTypeText(scopes, sf, expression, call.getStart(sf));
    out.push({
      expression,
      kind: 'local-variable',
      rank: 2,
      typeText,
      conversion: 'none',
    });
  }

  return hits.filter(h =>
    expressionRootInScope(h.expression, scopes, sf, call.getStart(sf)),
  );
}

function collectParamFromCallArgs(
  node: ts.CallExpression,
  sf: ts.SourceFile,
  targetCall: ts.CallExpression,
  paramName: string,
  targetIdentity: string,
  targetEntity: string,
  hits: SiblingBindingHit[],
): void {
  if (node === targetCall) return;
  if (!callBelongsToEntity(node, sf, targetEntity)) return;
  for (const arg of node.arguments) {
    if (!ts.isObjectLiteralExpression(arg)) continue;
    const siblingIdentity = identityFromObjectLiteral(arg, sf);
    if (!siblingIdentity || siblingIdentity !== targetIdentity) continue;
    for (const expression of expressionsForParam(arg, sf, paramName)) {
      hits.push({
        call: node,
        expression,
        identityExpression: siblingIdentity,
      });
    }
  }
}

function callBelongsToEntity(
  node: ts.CallExpression,
  sf: ts.SourceFile,
  entity: string,
): boolean {
  const text = node.expression.getText(sf);
  const camelPrefix = `${entity[0]!.toLowerCase()}${entity.slice(1)}`;
  if (text === camelPrefix || text.endsWith(`.${camelPrefix}`)) return true;
  if (
    text.startsWith(camelPrefix) &&
    text.length > camelPrefix.length &&
    /^[A-Z]/.test(text.slice(camelPrefix.length))
  ) {
    return true;
  }
  if (text.endsWith(`.${camelPrefix}`) === false) {
    const dotted = text.split('.').pop() ?? text;
    if (
      dotted.startsWith(camelPrefix) &&
      dotted.length > camelPrefix.length &&
      /^[A-Z]/.test(dotted.slice(camelPrefix.length))
    ) {
      return true;
    }
  }
  if (text.includes('executeCommand') || text.endsWith('executeCommand')) {
    const a0 = node.arguments[0];
    return Boolean(a0 && ts.isStringLiteral(a0) && a0.text === entity);
  }
  if (text.includes('runManifestCommand')) {
    const arg0 = node.arguments[0];
    if (arg0 && ts.isObjectLiteralExpression(arg0)) {
      for (const prop of arg0.properties) {
        if (
          ts.isPropertyAssignment(prop) &&
          ts.isIdentifier(prop.name) &&
          prop.name.text === 'entity' &&
          ts.isStringLiteral(prop.initializer) &&
          prop.initializer.text === entity
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function extractIdentityExpression(
  call: ts.CallExpression,
  sf: ts.SourceFile,
): string | undefined {
  for (const arg of call.arguments) {
    if (!ts.isObjectLiteralExpression(arg)) continue;
    const id = identityFromObjectLiteral(arg, sf);
    if (id) return id;
  }
  return undefined;
}

function identityFromObjectLiteral(
  obj: ts.ObjectLiteralExpression,
  sf: ts.SourceFile,
): string | undefined {
  for (const prop of obj.properties) {
    if (ts.isShorthandPropertyAssignment(prop) && IDENTITY_KEYS.has(prop.name.text)) {
      return prop.name.text;
    }
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
    if (prop.name.text === 'body' && ts.isObjectLiteralExpression(prop.initializer)) {
      const nested = identityFromObjectLiteral(prop.initializer, sf);
      if (nested) return nested;
      continue;
    }
    if (!IDENTITY_KEYS.has(prop.name.text) || !prop.initializer) continue;
    return prop.initializer.getText(sf).trim();
  }
  return undefined;
}

function expressionsForParam(
  obj: ts.ObjectLiteralExpression,
  sf: ts.SourceFile,
  paramName: string,
): string[] {
  const out: string[] = [];
  for (const prop of obj.properties) {
    if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === paramName) {
      out.push(paramName);
      continue;
    }
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
    if (prop.name.text === 'body' && ts.isObjectLiteralExpression(prop.initializer)) {
      out.push(...expressionsForParam(prop.initializer, sf, paramName));
      continue;
    }
    if (prop.name.text !== paramName || !prop.initializer) continue;
    const text = prop.initializer.getText(sf).trim();
    if (!text || isTypeOnlyPlaceholder(text)) continue;
    out.push(text);
  }
  return out;
}

function isTypeOnlyPlaceholder(text: string): boolean {
  return (
    text === 'string' ||
    text === 'number' ||
    text === 'boolean' ||
    text === 'undefined' ||
    text === 'null'
  );
}

function expressionRootInScope(
  expression: string,
  scopes: ts.Node[],
  sf: ts.SourceFile,
  beforePos: number,
): boolean {
  const root = expressionRoot(expression);
  if (!root) return false;
  for (const scope of scopes) {
    if (bindingNameInScope(scope, sf, root, beforePos)) return true;
  }
  return false;
}

function expressionRoot(expression: string): string | undefined {
  const m = /^([A-Za-z_][\w]*)/.exec(expression.trim());
  return m?.[1];
}

function resolveBindingTypeText(
  scopes: ts.Node[],
  sf: ts.SourceFile,
  expression: string,
  beforePos: number,
): string | undefined {
  const root = expressionRoot(expression);
  if (!root) return undefined;
  for (const scope of scopes) {
    const t = bindingTypeInScope(scope, sf, root, beforePos);
    if (t) return t;
  }
  return undefined;
}

function bindingTypeInScope(
  scope: ts.Node,
  sf: ts.SourceFile,
  name: string,
  beforePos: number,
): string | undefined {
  if ('parameters' in scope) {
    for (const p of (scope as ts.FunctionLikeDeclaration).parameters) {
      if (ts.isIdentifier(p.name) && p.name.text === name) {
        return p.type?.getText(sf);
      }
      if (ts.isObjectBindingPattern(p.name)) {
        for (const el of p.name.elements) {
          if (
            ts.isBindingElement(el) &&
            ts.isIdentifier(el.name) &&
            el.name.text === name
          ) {
            // Only inline object types prove a property type. Named props types
            // (e.g. TaskCardProps) are opaque — do not treat them as the value type.
            if (p.type && ts.isTypeLiteralNode(p.type)) {
              for (const m of p.type.members) {
                if (
                  ts.isPropertySignature(m) &&
                  m.name &&
                  ts.isIdentifier(m.name) &&
                  m.name.text === name
                ) {
                  return m.type?.getText(sf);
                }
              }
            }
            return undefined;
          }
        }
      }
    }
  }
  let found: string | undefined;
  const visit = (node: ts.Node) => {
    if (found || node.getStart(sf) >= beforePos) return;
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === name) {
          found = decl.type?.getText(sf);
          return;
        }
      }
    }
    if (
      node !== scope &&
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node))
    ) {
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(scope);
  return found;
}

function bindingNameInScope(
  scope: ts.Node,
  sf: ts.SourceFile,
  name: string,
  beforePos: number,
): boolean {
  if ('parameters' in scope) {
    for (const p of (scope as ts.FunctionLikeDeclaration).parameters) {
      if (ts.isIdentifier(p.name) && p.name.text === name) return true;
      if (ts.isObjectBindingPattern(p.name)) {
        for (const el of p.name.elements) {
          if (
            ts.isBindingElement(el) &&
            ts.isIdentifier(el.name) &&
            el.name.text === name
          ) {
            return true;
          }
        }
      }
    }
  }
  return hasLocalOrState(scope, sf, name, beforePos);
}

function hasLocalOrState(
  scope: ts.Node,
  sf: ts.SourceFile,
  name: string,
  beforePos: number,
): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (found || node.getStart(sf) >= beforePos) return;
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === name) {
          found = true;
          return;
        }
        if (ts.isArrayBindingPattern(decl.name)) {
          const first = decl.name.elements[0];
          if (
            first &&
            ts.isBindingElement(first) &&
            ts.isIdentifier(first.name) &&
            first.name.text === name
          ) {
            found = true;
            return;
          }
        }
      }
    }
    if (
      node !== scope &&
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node))
    ) {
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(scope);
  return found;
}
