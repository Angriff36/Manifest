/**
 * Sibling-call parameter binding proof for add-required-input.
 *
 * When the same enclosing component/callable already passes
 * `param: <expr>` into another call that shares the target call's identity
 * argument (e.g. both use `id: task.id`), that expression is a proven source —
 * never invent actor/context values, never borrow from a different dialog target.
 */

import ts from 'typescript';
import type { ProvenValueSource } from './required-input-source.js';

const IDENTITY_KEYS = new Set(['id', 'entityId']);

/**
 * Collect `param: expr` bindings from sibling CallExpressions inside the
 * outermost enclosing callable (e.g. React component), excluding the target call.
 *
 * Sibling must share the same identity property expression as the target
 * (e.g. `id: task.id` on both claim and complete). Different targets
 * (`costTarget.id` vs `deactivateTarget.id`) do not qualify.
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
): void {
  const outermost = scopes[scopes.length - 1];
  if (!outermost) return;

  const targetIdentity = extractIdentityExpression(call, sf);
  if (!targetIdentity) return;

  const exprs = new Set<string>();
  const visit = (node: ts.Node) => {
    if (node === call) return;
    if (ts.isCallExpression(node)) {
      collectParamFromCallArgs(node, sf, call, paramName, targetIdentity, exprs);
    }
    ts.forEachChild(node, visit);
  };
  visit(outermost);

  if (exprs.size === 0) return;

  for (const expression of [...exprs].sort()) {
    if (!expressionRootInScope(expression, scopes, sf, call.getStart(sf))) {
      continue;
    }
    out.push({
      expression,
      kind: 'local-variable',
      rank: 2,
      typeText: undefined,
      conversion: 'none',
    });
  }
}

function collectParamFromCallArgs(
  node: ts.CallExpression,
  sf: ts.SourceFile,
  targetCall: ts.CallExpression,
  paramName: string,
  targetIdentity: string,
  exprs: Set<string>,
): void {
  if (node === targetCall) return;
  for (const arg of node.arguments) {
    if (!ts.isObjectLiteralExpression(arg)) continue;
    const siblingIdentity = identityFromObjectLiteral(arg, sf);
    if (!siblingIdentity || siblingIdentity !== targetIdentity) continue;
    collectFromObjectLiteral(arg, sf, paramName, exprs);
  }
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

function collectFromObjectLiteral(
  obj: ts.ObjectLiteralExpression,
  sf: ts.SourceFile,
  paramName: string,
  exprs: Set<string>,
): void {
  for (const prop of obj.properties) {
    if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === paramName) {
      exprs.add(paramName);
      continue;
    }
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
    if (prop.name.text === 'body' && ts.isObjectLiteralExpression(prop.initializer)) {
      collectFromObjectLiteral(prop.initializer, sf, paramName, exprs);
      continue;
    }
    if (prop.name.text !== paramName || !prop.initializer) continue;
    const text = prop.initializer.getText(sf).trim();
    if (!text || isTypeOnlyPlaceholder(text)) continue;
    exprs.add(text);
  }
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
