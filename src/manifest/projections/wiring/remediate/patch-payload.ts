/**
 * Payload object property patches for wiring remediation.
 */

import ts from 'typescript';
import type { RepairOperation } from './types.js';
import { parseSource, findProperty, callMatchesCapability } from './ast-utils.js';

export function findPayloadObjectInCall(
  node: ts.CallExpression,
): ts.ObjectLiteralExpression | undefined {
  for (const arg of node.arguments) {
    if (!ts.isObjectLiteralExpression(arg)) continue;
    const body = findProperty(arg, 'body');
    if (body?.initializer && ts.isObjectLiteralExpression(body.initializer)) {
      return body.initializer;
    }
    return arg;
  }
  return undefined;
}

export function removeProperty(
  content: string,
  fileName: string,
  op: Extract<RepairOperation, { type: 'remove-object-property' }>,
): string | null {
  const re = new RegExp(
    `(,\\s*)?${escape(op.parameter)}\\s*:\\s*(?:[^,{\\[\\n]+|\\{[^}]*\\}|\\[[^\\]]*\\])\\s*,?`,
  );
  if (!re.test(content)) {
    if (!new RegExp(`\\b${escape(op.parameter)}\\s*:`).test(content)) return content;
  } else {
    let next = content.replace(re, () => '');
    next = next.replace(/,\s*,/g, ',').replace(/,\s*}/g, ' }').replace(/{\s*,/g, '{ ');
    if (next !== content) return next;
  }

  const sf = parseSource(fileName, content);
  let splice: { start: number; end: number } | undefined;
  const visit = (node: ts.Node) => {
    if (splice) return;
    if (ts.isCallExpression(node) && callMatchesCapability(node, content, op.capabilityId)) {
      const obj = findPayloadObjectInCall(node);
      if (!obj) return;
      const prop = findProperty(obj, op.parameter);
      if (!prop) return;
      splice = { start: prop.getFullStart(), end: prop.getEnd() };
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (splice) {
    let next = content.slice(0, splice.start) + content.slice(splice.end);
    next = next.replace(/,\s*,/g, ',').replace(/,\s*}/g, ' }').replace(/{\s*,/g, '{ ');
    return next;
  }
  return content;
}

export function addProperty(
  content: string,
  fileName: string,
  op: Extract<RepairOperation, { type: 'add-object-property' }>,
): string | null {
  const sf = parseSource(fileName, content);
  let target: ts.ObjectLiteralExpression | undefined;
  const visit = (node: ts.Node) => {
    if (target) return;
    if (ts.isCallExpression(node) && callMatchesCapability(node, content, op.capabilityId)) {
      target = findPayloadObjectInCall(node);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (target) {
    const existing = findProperty(target, op.parameter);
    if (existing) return content;
    const closeBrace = target.getEnd() - 1;
    const openBrace = target.getStart(sf);
    const body = content.slice(openBrace + 1, closeBrace);
    if (new RegExp(`\\b${escape(op.parameter)}\\s*:`).test(body)) return content;
    const trimmedBody = body.replace(/\s+$/, '');
    const needsComma = trimmedBody.trim().length > 0 && !trimmedBody.trimEnd().endsWith(',');
    const indentMatch = /\n(\s*)\S/.exec(body);
    const indent = indentMatch?.[1] ?? '  ';
    const addition = `${needsComma ? ',' : ''}\n${indent}${op.parameter}: ${op.expression}`;
    return (
      content.slice(0, openBrace + 1) + trimmedBody + addition + '\n' + content.slice(closeBrace)
    );
  }

  const [entity, command] = op.capabilityId.split('.');
  const patterns: RegExp[] = [];
  if (entity && command) {
    const clientFn =
      entity.charAt(0).toLowerCase() +
      entity.slice(1) +
      command.charAt(0).toUpperCase() +
      command.slice(1);
    patterns.push(
      new RegExp(
        `executeCommand\\s*(?:<[^>]*>)?\\s*\\(\\s*["']${escape(entity)}["']\\s*,\\s*["']${escape(command)}["']\\s*,\\s*\\{`,
      ),
      new RegExp(
        `runManifestCommand\\s*\\(\\s*\\{[\\s\\S]*?entity\\s*:\\s*["']${escape(entity)}["'][\\s\\S]*?command\\s*:\\s*["']${escape(command)}["'][\\s\\S]*?body\\s*:\\s*\\{`,
      ),
      new RegExp(`\\b${escape(clientFn)}\\s*\\(\\s*\\{`),
    );
  }

  for (const re of patterns) {
    const m = re.exec(content);
    if (!m) continue;
    const openBrace = m.index + m[0].length - 1;
    const close = findMatchingBrace(content, openBrace);
    if (close < 0) continue;
    const body = content.slice(openBrace + 1, close);
    if (new RegExp(`\\b${escape(op.parameter)}\\s*:`).test(body)) return content;
    const trimmedBody = body.replace(/\s+$/, '');
    const needsComma = trimmedBody.trim().length > 0 && !trimmedBody.trimEnd().endsWith(',');
    const indentMatch = /\n(\s*)\S/.exec(body);
    const indent = indentMatch?.[1] ?? '  ';
    const addition = `${needsComma ? ',' : ''}\n${indent}${op.parameter}: ${op.expression}`;
    return content.slice(0, openBrace + 1) + trimmedBody + addition + '\n' + content.slice(close);
  }

  return content;
}

export function findMatchingBrace(content: string, openIdx: number): number {
  let depth = 0;
  let inStr: string | null = null;
  for (let i = openIdx; i < content.length; i++) {
    const ch = content[i]!;
    if (inStr !== null) {
      inStr = advanceStringState(content, i, ch, inStr);
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      continue;
    }
    const nextDepth = advanceBraceDepth(ch, depth);
    if (nextDepth === 0 && ch === '}') return i;
    depth = nextDepth;
  }
  return -1;
}

function advanceStringState(
  content: string,
  index: number,
  ch: string,
  inStr: string,
): string | null {
  if (ch === inStr && content[index - 1] !== '\\') return null;
  return inStr;
}

function advanceBraceDepth(ch: string, depth: number): number {
  if (ch === '{') return depth + 1;
  if (ch === '}') return depth - 1;
  return depth;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
