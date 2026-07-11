/**
 * Proven falsy early-return guards for sibling-backed required inputs.
 *
 * A guard is reusable only when every qualifying same-identity sibling that
 * passes the source already uses the same `if (!expr) return` shape, and the
 * target call's enclosing callable either already has it or can receive that
 * exact statement.
 */

import ts from 'typescript';

export interface SiblingGuardProof {
  sourceExpression: string;
  /** Exact statement text siblings use (trimmed). */
  statement: string;
  /** True when the target call's enclosing callable already has the guard. */
  alreadyPresent: boolean;
}

/**
 * Prove a reusable falsy early-return guard for `sourceExpression`.
 * Returns undefined when no guard is required or when siblings disagree / lack one.
 */
export function proveSiblingFalsyGuard(options: {
  sf: ts.SourceFile;
  targetCall: ts.CallExpression;
  sourceExpression: string;
  /** Call expressions that already pass sourceExpression for the missing field. */
  qualifyingSiblingCalls: ts.CallExpression[];
  /** When true, a missing/unproven guard makes the repair unsafe. */
  required: boolean;
}): SiblingGuardProof | { reject: string } | undefined {
  const { sf, targetCall, sourceExpression, qualifyingSiblingCalls, required } = options;

  const targetFn = enclosingFunction(targetCall);
  if (!targetFn) {
    return required
      ? { reject: `No enclosing function for guard on ${sourceExpression}` }
      : undefined;
  }

  const targetHas = hasFalsyEarlyReturn(targetFn, sf, sourceExpression);
  if (targetHas) {
    return {
      sourceExpression,
      statement: falsyEarlyReturnStatement(sourceExpression),
      alreadyPresent: true,
    };
  }

  const siblingStatements = new Set<string>();
  for (const sibling of qualifyingSiblingCalls) {
    const fn = enclosingFunction(sibling);
    if (!fn) continue;
    const stmt = readFalsyEarlyReturnStatement(fn, sf, sourceExpression);
    if (stmt) siblingStatements.add(stmt);
  }

  if (siblingStatements.size === 0) {
    return required
      ? {
          reject: `Source ${sourceExpression} requires narrowing but no sibling proves if (!${sourceExpression}) return`,
        }
      : undefined;
  }
  if (siblingStatements.size > 1) {
    return {
      reject: `Conflicting sibling guards for ${sourceExpression}: ${[...siblingStatements].join(' | ')}`,
    };
  }

  const statement = [...siblingStatements][0]!;
  return {
    sourceExpression,
    statement,
    alreadyPresent: false,
  };
}

export function sourceTypeNeedsFalsyGuard(
  typeText: string | undefined,
  paramTsType: string,
): boolean {
  if (!typeText) return false;
  const src = typeText.replace(/\s+/g, '');
  const want = paramTsType.replace(/\s+/g, '');
  const srcHasNull = /\bnull\b/.test(src) || src.includes('|null') || src.includes('null|');
  const wantHasNull = /\bnull\b/.test(want) || want.includes('|null') || want.includes('null|');
  return srcHasNull && !wantHasNull;
}

export function falsyEarlyReturnStatement(sourceExpression: string): string {
  return `if (!${sourceExpression}) {\n    return;\n  }`;
}

export function hasFalsyEarlyReturn(
  fn: ts.FunctionLikeDeclaration,
  sf: ts.SourceFile,
  sourceExpression: string,
): boolean {
  return readFalsyEarlyReturnStatement(fn, sf, sourceExpression) !== undefined;
}

function readFalsyEarlyReturnStatement(
  fn: ts.FunctionLikeDeclaration,
  sf: ts.SourceFile,
  sourceExpression: string,
): string | undefined {
  const body = fn.body;
  if (!body || !ts.isBlock(body)) return undefined;
  for (const stmt of body.statements) {
    if (!ts.isIfStatement(stmt) || stmt.elseStatement) continue;
    if (!isFalsyCheck(stmt.expression, sourceExpression)) continue;
    if (!isBareReturn(stmt.thenStatement)) continue;
    return normalizeGuardText(stmt.getText(sf));
  }
  return undefined;
}

function isFalsyCheck(expr: ts.Expression, sourceExpression: string): boolean {
  if (!ts.isPrefixUnaryExpression(expr)) return false;
  if (expr.operator !== ts.SyntaxKind.ExclamationToken) return false;
  return expr.operand.getText().trim() === sourceExpression;
}

function isBareReturn(stmt: ts.Statement): boolean {
  if (ts.isReturnStatement(stmt) && !stmt.expression) return true;
  if (ts.isBlock(stmt) && stmt.statements.length === 1) {
    const only = stmt.statements[0]!;
    return ts.isReturnStatement(only) && !only.expression;
  }
  return false;
}

function normalizeGuardText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function enclosingFunction(node: ts.Node): ts.FunctionLikeDeclaration | undefined {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (
      ts.isFunctionDeclaration(cur) ||
      ts.isFunctionExpression(cur) ||
      ts.isArrowFunction(cur) ||
      ts.isMethodDeclaration(cur)
    ) {
      return cur;
    }
    cur = cur.parent;
  }
  return undefined;
}

/** Insert a proven early-return guard at the start of the function containing the call. */
export function insertEarlyReturnGuard(
  content: string,
  fileName: string,
  capabilityId: string,
  sourceExpression: string,
  statement: string,
  callMatches: (node: ts.CallExpression, content: string, capabilityId: string) => boolean,
  parseSource: (fileName: string, content: string) => ts.SourceFile,
): string | null {
  const sf = parseSource(fileName, content);
  let targetFn: ts.FunctionLikeDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (targetFn) return;
    if (ts.isCallExpression(node) && callMatches(node, content, capabilityId)) {
      targetFn = enclosingFunction(node);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!targetFn?.body || !ts.isBlock(targetFn.body)) return null;
  if (hasFalsyEarlyReturn(targetFn, sf, sourceExpression)) return content;

  const body = targetFn.body;
  const openBrace = body.getStart(sf);
  const insertAt = openBrace + 1;
  const indentMatch = /\n(\s*)\S/.exec(body.getText(sf));
  const indent = indentMatch?.[1] ?? '  ';
  const formatted = statement
    .split('\n')
    .map((line, i) => (i === 0 ? line : `${indent}${line}`))
    .join('\n');
  return `${content.slice(0, insertAt)}\n${indent}${formatted}${content.slice(insertAt)}`;
}
