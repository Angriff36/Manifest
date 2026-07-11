/**
 * Discover proven full-body construction patterns for Entity.update-style
 * commands. Used when a call site sends a partial literal payload.
 *
 * Never invents values. Requires an exact same-capability usage of the builder
 * and a return object that covers every required client parameter.
 */

import ts from 'typescript';
import type { WiringCommandDescriptor } from '../types.js';
import { extractObjectFieldNames } from '../inspect/object-literal-keys.js';
import { parseSource } from './ast-utils.js';

export interface FullBodyPattern {
  builderName: string;
  builderFile: string;
  /** Exact source of the builder function (for fingerprint / export). */
  builderSource: string;
  /** Names of required client params covered by the returned object. */
  coveredParams: string[];
  /** Override parameter names the builder already accepts (from Partial<> or 2nd arg). */
  overrideParamNames: string[];
  /** True when the builder's second arg can carry field overrides. */
  acceptsOverrides: boolean;
  /** Proven call-site snippet showing Entity.command uses this builder as body. */
  provenUsageSnippet: string;
  provenUsageFile: string;
}

export interface PartialPayloadSite {
  file: string;
  capabilityId: string;
  /** Fields present in the partial literal (excluding id). */
  presentFields: string[];
  /** Missing required client params. */
  missingFields: string[];
  payloadSource: string;
}

const patternCache = new WeakMap<object, Map<string, FullBodyPattern | null>>();

/**
 * Find a unique full-body builder for this capability across application sources.
 * Returns undefined when missing, ambiguous, or wrong-entity.
 */
export function findUniqueFullBodyPattern(
  cap: WiringCommandDescriptor,
  fileContents: Map<string, string>,
): FullBodyPattern | undefined {
  let byCap = patternCache.get(fileContents);
  if (!byCap) {
    byCap = new Map();
    patternCache.set(fileContents, byCap);
  }
  if (byCap.has(cap.capabilityId)) {
    return byCap.get(cap.capabilityId) ?? undefined;
  }

  const required = cap.parameters
    .filter((p) => p.ownership === 'client' && p.required)
    .map((p) => p.name);
  if (required.length < 2) {
    byCap.set(cap.capabilityId, null);
    return undefined;
  }

  const candidates: FullBodyPattern[] = [];
  for (const [file, content] of fileContents) {
    // Cheap prefilter — avoid AST on unrelated modules.
    if (!looksLikeBuilderCandidate(content, cap, required)) continue;
    for (const hit of findBuildersInFile(file, content, required)) {
      const usage = findProvenUsage(fileContents, hit.builderName, cap);
      if (!usage) continue;
      if (usage.capabilityId !== cap.capabilityId) continue;
      candidates.push({
        ...hit,
        provenUsageSnippet: usage.snippet,
        provenUsageFile: usage.file,
      });
    }
  }

  let result: FullBodyPattern | null = null;
  if (candidates.length === 1) {
    result = candidates[0]!;
  } else if (candidates.length > 1) {
    const uniqueNames = new Set(candidates.map((c) => `${c.builderFile}:${c.builderName}`));
    if (uniqueNames.size === 1) result = candidates[0]!;
    // else ambiguous → null
  }
  byCap.set(cap.capabilityId, result);
  return result ?? undefined;
}

function looksLikeBuilderCandidate(
  content: string,
  cap: WiringCommandDescriptor,
  required: string[],
): boolean {
  // Must mention enough required field names to possibly return a full body.
  let hits = 0;
  for (const r of required) {
    if (content.includes(r)) hits++;
    if (hits >= Math.min(4, required.length)) break;
  }
  if (hits < Math.min(4, required.length)) return false;
  // Prefer files that also mention the entity or a *UpdateBody helper.
  return (
    content.includes(cap.entity) ||
    content.includes('UpdateBody') ||
    content.includes('updateBody') ||
    content.includes(`command: "${cap.command}"`) ||
    content.includes(`command: '${cap.command}'`)
  );
}

function findBuildersInFile(
  file: string,
  content: string,
  required: string[],
): Array<Omit<FullBodyPattern, 'provenUsageSnippet' | 'provenUsageFile'>> {
  const sf = parseSource(file, content);
  const out: Array<Omit<FullBodyPattern, 'provenUsageSnippet' | 'provenUsageFile'>> = [];

  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = node.initializer;
      const fn = ts.isArrowFunction(init) || ts.isFunctionExpression(init) ? init : undefined;
      if (fn) {
        const pattern = patternFromFunction(node.name.text, file, content, fn, required);
        if (pattern) out.push(pattern);
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      const pattern = patternFromFunction(node.name.text, file, content, node, required);
      if (pattern) out.push(pattern);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function patternFromFunction(
  builderName: string,
  file: string,
  content: string,
  node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  required: string[],
): Omit<FullBodyPattern, 'provenUsageSnippet' | 'provenUsageFile'> | undefined {
  const returned = findReturnedObjectLiteral(node);
  if (!returned) return undefined;
  const fields = extractObjectFieldNames(returned.getText());
  const fieldSet = new Set(fields);
  if (!required.every((r) => fieldSet.has(r))) return undefined;

  const params = node.parameters;
  const acceptsOverrides = params.length >= 2;
  const overrideParamNames = acceptsOverrides ? extractOverrideNames(params[1]!, content) : [];

  return {
    builderName,
    builderFile: file,
    builderSource: node.getText(),
    coveredParams: required.filter((r) => fieldSet.has(r)),
    overrideParamNames,
    acceptsOverrides,
  };
}

function findReturnedObjectLiteral(
  node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
): ts.ObjectLiteralExpression | undefined {
  if (ts.isArrowFunction(node) && ts.isParenthesizedExpression(node.body)) {
    if (ts.isObjectLiteralExpression(node.body.expression)) return node.body.expression;
  }
  if (ts.isArrowFunction(node) && ts.isObjectLiteralExpression(node.body)) {
    return node.body;
  }
  const body = node.body;
  if (!body || !ts.isBlock(body)) return undefined;
  for (const stmt of body.statements) {
    if (ts.isReturnStatement(stmt) && stmt.expression) {
      if (ts.isObjectLiteralExpression(stmt.expression)) return stmt.expression;
      if (
        ts.isParenthesizedExpression(stmt.expression) &&
        ts.isObjectLiteralExpression(stmt.expression.expression)
      ) {
        return stmt.expression.expression;
      }
    }
  }
  return undefined;
}

function extractOverrideNames(param: ts.ParameterDeclaration, _content: string): string[] {
  const type = param.type;
  if (!type) return [];
  const text = type.getText();
  const names: string[] = [];
  const re = /\b([A-Za-z_][\w]*)\s*\?:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) names.push(m[1]!);
  const re2 = /\b([A-Za-z_][\w]*)\s*:/g;
  while ((m = re2.exec(text)) !== null) {
    if (!names.includes(m[1]!)) names.push(m[1]!);
  }
  return [...new Set(names)].filter(
    (n) => n !== 'Partial' && n !== 'string' && n !== 'null' && n !== 'number',
  );
}

function findProvenUsage(
  fileContents: Map<string, string>,
  builderName: string,
  cap: WiringCommandDescriptor,
): { file: string; snippet: string; capabilityId: string } | undefined {
  const callRe = new RegExp(`\\b${escapeRe(builderName)}\\s*\\(`);
  for (const [file, content] of fileContents) {
    if (!callRe.test(content)) continue;
    const entityHit =
      content.includes(`"${cap.entity}"`) ||
      content.includes(`'${cap.entity}'`) ||
      content.includes(`entity: "${cap.entity}"`) ||
      content.includes(`entity: '${cap.entity}'`) ||
      new RegExp(`\\b${escapeRe(cap.entity)}\\b`).test(content);
    const commandHit =
      content.includes(`"${cap.command}"`) ||
      content.includes(`'${cap.command}'`) ||
      content.includes(`command: "${cap.command}"`) ||
      content.includes(`command: '${cap.command}'`) ||
      new RegExp(
        `\\brun\\s*\\(\\s*["']${escapeRe(cap.command)}["']\\s*,\\s*${escapeRe(builderName)}\\s*\\(`,
      ).test(content);

    if (!entityHit && !commandHit) continue;
    if (!commandHit && cap.command !== 'update') continue;

    const strong = new RegExp(
      `(?:command\\s*:\\s*["']${escapeRe(cap.command)}["'][\\s\\S]{0,200}body\\s*:\\s*${escapeRe(builderName)}\\s*\\()` +
        `|(?:body\\s*:\\s*${escapeRe(builderName)}\\s*\\([\\s\\S]{0,200}command\\s*:\\s*["']${escapeRe(cap.command)}["'])` +
        `|(?:\\brun\\s*\\(\\s*["']${escapeRe(cap.command)}["']\\s*,\\s*${escapeRe(builderName)}\\s*\\()`,
    );
    if (!strong.test(content) && !(entityHit && commandHit && callRe.test(content))) {
      continue;
    }
    if (!entityHit) continue;

    const idx = content.search(callRe);
    const snippet = content.slice(Math.max(0, idx - 80), idx + 120);
    return { file, snippet, capabilityId: cap.capabilityId };
  }
  return undefined;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when the payload is a partial literal relative to the capability
 * (at least one required client field present, at least two missing).
 */
export function isPartialLiteralAgainstFullContract(
  presentFields: string[],
  cap: WiringCommandDescriptor,
): { partial: boolean; missing: string[] } {
  const required = cap.parameters
    .filter((p) => p.ownership === 'client' && p.required)
    .map((p) => p.name);
  const present = new Set(presentFields.filter((f) => f !== 'id'));
  const missing = required.filter((r) => !present.has(r));
  const presentRequired = required.filter((r) => present.has(r));
  return {
    partial: presentRequired.length >= 1 && missing.length >= 2,
    missing,
  };
}
