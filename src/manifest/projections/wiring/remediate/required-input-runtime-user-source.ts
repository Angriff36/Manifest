/**
 * Same-call runtime user-context proof for add-required-input.
 *
 * When `runManifestCommand({ body, user: { id: <expr> } })` already declares
 * the actor identity on the same call, that exact `<expr>` is a proven source
 * for a missing required client `userId` — never invent actor values, never
 * borrow `user.id` from a different call or function.
 */

import ts from 'typescript';
import type { ProvenValueSource } from './required-input-source.js';

/**
 * If the capability call is `runManifestCommand` and already passes
 * `user: { id: <expr> }`, and the missing param is exactly `userId`, push
 * that expression as a rank-2 proven source.
 */
export function collectSameCallRuntimeUserId(
  call: ts.CallExpression,
  sf: ts.SourceFile,
  paramName: string,
  out: ProvenValueSource[],
): string | undefined {
  if (paramName !== 'userId') return undefined;
  if (!isRunManifestCommand(call, sf)) return undefined;

  const arg0 = call.arguments[0];
  if (!arg0 || !ts.isObjectLiteralExpression(arg0)) return undefined;

  const expression = readUserIdExpression(arg0, sf);
  if (!expression || isTypeOnlyPlaceholder(expression)) return undefined;

  out.push({
    expression,
    kind: 'local-variable',
    rank: 2,
    typeText: undefined,
    conversion: 'none',
  });
  return expression;
}

function isRunManifestCommand(call: ts.CallExpression, sf: ts.SourceFile): boolean {
  return call.expression.getText(sf).includes('runManifestCommand');
}

function readUserIdExpression(
  obj: ts.ObjectLiteralExpression,
  sf: ts.SourceFile,
): string | undefined {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
    if (prop.name.text !== 'user') continue;
    if (!prop.initializer || !ts.isObjectLiteralExpression(prop.initializer)) {
      continue;
    }
    for (const inner of prop.initializer.properties) {
      if (ts.isShorthandPropertyAssignment(inner) && inner.name.text === 'id') {
        return 'id';
      }
      if (
        ts.isPropertyAssignment(inner) &&
        ts.isIdentifier(inner.name) &&
        inner.name.text === 'id' &&
        inner.initializer
      ) {
        return inner.initializer.getText(sf).trim();
      }
    }
  }
  return undefined;
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
