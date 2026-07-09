/**
 * Deterministic AST-aware patch engine for wiring repairs.
 * Idempotent: re-applying the same plan must not duplicate imports/edits.
 * Edits are surgical source splices — never full-file reprints.
 */

import ts from 'typescript';
import type { RepairPlan, RepairOperation } from './types.js';
import {
  parseSource,
  ensureNamedImports,
  findProperty,
  callMatchesCapability,
} from './ast-utils.js';

export interface PatchApplyResult {
  ok: boolean;
  filesChanged: string[];
  editsApplied: number;
  skippedReason?: string;
  /** Updated in-memory contents (path → content). */
  nextContents: Map<string, string>;
}

export function applyRepairPlan(
  plan: RepairPlan,
  fileContents: Map<string, string>,
): PatchApplyResult {
  if (!plan.automaticApplicationAllowed) {
    return {
      ok: false,
      filesChanged: [],
      editsApplied: 0,
      skippedReason: `Decision ${plan.decision} does not allow automatic application`,
      nextContents: new Map(fileContents),
    };
  }

  // Stale plan guard: preconditions must still match
  for (const pre of plan.preconditions) {
    const file = plan.edits[0]?.file;
    if (!file) continue;
    const content = getContent(fileContents, file);
    if (!content) {
      return {
        ok: false,
        filesChanged: [],
        editsApplied: 0,
        skippedReason: `Stale plan: source file missing (${file})`,
        nextContents: new Map(fileContents),
      };
    }
    // Fingerprint of expected snippet must appear OR full-file still contains key fragment
    const stillValid =
      content.includes(pre.sourceFingerprint) ||
      fingerprintStillMatches(content, pre.sourceFingerprint) ||
      preconditionSnippetPresent(plan, content);
    if (!stillValid && plan.preconditions.length > 0) {
      // Soft check: if we can still apply and produce a change, allow;
      // hard fail only when fingerprint was a content hash of a specific expression
      const expr = extractFromExpression(plan);
      if (expr && !content.includes(expr)) {
        return {
          ok: false,
          filesChanged: [],
          editsApplied: 0,
          skippedReason: `Stale plan: expected source snippet no longer present in ${file}`,
          nextContents: new Map(fileContents),
        };
      }
    }
  }

  const next = new Map(fileContents);
  const changed = new Set<string>();
  let editsApplied = 0;

  for (const edit of plan.edits) {
    const before = getContent(next, edit.file);
    if (before === undefined) {
      return {
        ok: false,
        filesChanged: [...changed],
        editsApplied,
        skippedReason: `File not found: ${edit.file}`,
        nextContents: next,
      };
    }
    const after = applyOperation(before, edit.file, edit.operation);
    if (after === null) {
      // Idempotent no-op is OK (already applied)
      continue;
    }
    if (after !== before) {
      setContent(next, edit.file, after);
      changed.add(normalize(edit.file));
      editsApplied++;
    }
  }

  return {
    ok: true,
    filesChanged: [...changed],
    editsApplied,
    nextContents: next,
  };
}

function applyOperation(
  content: string,
  fileName: string,
  op: RepairOperation,
): string | null {
  switch (op.type) {
    case 'replace-object-property-value':
      return replacePropertyValue(content, fileName, op);
    case 'remove-object-property':
      return removeProperty(content, fileName, op);
    case 'add-object-property':
      return addProperty(content, fileName, op);
    case 'replace-call-expression':
      return replaceCall(content, fileName, op);
    case 'add-invalidation-after-mutation':
      return addInvalidation(content, fileName, op);
    case 'rewire-lifecycle-call':
      return rewireLifecycle(content, fileName, op);
    case 'wire-control-to-binding':
      return wireControl(content, fileName, op);
    default:
      return null;
  }
}

function replacePropertyValue(
  content: string,
  fileName: string,
  op: Extract<RepairOperation, { type: 'replace-object-property-value' }>,
): string | null {
  // Prefer surgical text edit — never reprint the whole file (preserves formatting).
  if (content.includes(op.fromExpression)) {
    const replaced = replacePropertyText(
      content,
      op.parameter,
      op.fromExpression,
      op.toExpression,
    );
    if (replaced !== content) return replaced;
  }

  // Idempotent: already has target and no longer has from
  if (
    (content.includes(`${op.parameter}: ${op.toExpression}`) ||
      content.includes(`${op.parameter}:${op.toExpression}`)) &&
    !content.includes(op.fromExpression)
  ) {
    return content;
  }

  // AST path only when we can splice by exact source span (no full reprint)
  const sf = parseSource(fileName, content);
  let splice: { start: number; end: number } | undefined;
  const visit = (node: import('typescript').Node) => {
    if (splice) return;
    if (
      ts.isCallExpression(node) &&
      callMatchesCapability(node, content, op.capabilityId)
    ) {
      const obj = findPayloadObjectInCall(node);
      if (!obj) return;
      const prop = findProperty(obj, op.parameter);
      if (!prop?.initializer) return;
      const current = prop.initializer.getText(sf);
      if (
        normalizeExpr(current) === normalizeExpr(op.toExpression) ||
        (!current.includes('.join') &&
          normalizeExpr(current) !== normalizeExpr(op.fromExpression) &&
          !op.fromExpression.includes('.join'))
      ) {
        return;
      }
      splice = { start: prop.initializer.getStart(sf), end: prop.initializer.getEnd() };
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (splice) {
    return content.slice(0, splice.start) + op.toExpression + content.slice(splice.end);
  }

  // Last resort: join-strip regex on the property
  const joinRe = new RegExp(
    `(${escape(op.parameter)}\\s*:\\s*)([^,\\n}]+\\.join\\s*\\([^)]*\\))`,
  );
  if (joinRe.test(content)) {
    return content.replace(joinRe, `$1${op.toExpression}`);
  }
  return content;
}

function findPayloadObjectInCall(
  node: import('typescript').CallExpression,
): import('typescript').ObjectLiteralExpression | undefined {
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

function removeProperty(
  content: string,
  fileName: string,
  op: Extract<RepairOperation, { type: 'remove-object-property' }>,
): string | null {
  // Surgical: remove `param: …` including optional leading comma
  const re = new RegExp(
    `(,\\s*)?${escape(op.parameter)}\\s*:\\s*(?:[^,{\\[\\n]+|\\{[^}]*\\}|\\[[^\\]]*\\])\\s*,?`,
  );
  if (!re.test(content)) {
    // Already absent — idempotent
    if (!new RegExp(`\\b${escape(op.parameter)}\\s*:`).test(content)) return content;
  } else {
    let next = content.replace(re, () => '');
    next = next.replace(/,\s*,/g, ',').replace(/,\s*}/g, ' }').replace(/{\s*,/g, '{ ');
    if (next !== content) return next;
  }

  // AST span splice without reprint
  const sf = parseSource(fileName, content);
  let splice: { start: number; end: number } | undefined;
  const visit = (node: import('typescript').Node) => {
    if (splice) return;
    if (
      ts.isCallExpression(node) &&
      callMatchesCapability(node, content, op.capabilityId)
    ) {
      const obj = findPayloadObjectInCall(node);
      if (!obj) return;
      const prop = findProperty(obj, op.parameter);
      if (!prop) return;
      const props = obj.properties;
      const idx = props.indexOf(prop);
      let start = prop.getFullStart();
      let end = prop.getEnd();
      // Include trailing comma if present
      if (idx >= 0 && idx < props.length - 1) {
        // keep start at fullStart (includes leading comma/whitespace of this prop)
      } else if (idx > 0) {
        // include preceding comma via fullStart
      }
      splice = { start, end };
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

function addProperty(
  content: string,
  _fileName: string,
  op: Extract<RepairOperation, { type: 'add-object-property' }>,
): string | null {
  // Locate capability call payload and insert before its closing brace.
  const [entity, command] = op.capabilityId.split('.');
  const patterns: RegExp[] = [];
  if (entity && command) {
    patterns.push(
      new RegExp(
        `executeCommand\\s*(?:<[^>]*>)?\\s*\\(\\s*["']${escape(entity)}["']\\s*,\\s*["']${escape(command)}["']\\s*,\\s*\\{`,
      ),
      new RegExp(
        `runManifestCommand\\s*\\(\\s*\\{[\\s\\S]*?entity\\s*:\\s*["']${escape(entity)}["'][\\s\\S]*?command\\s*:\\s*["']${escape(command)}["'][\\s\\S]*?body\\s*:\\s*\\{`,
      ),
    );
  }

  for (const re of patterns) {
    const m = re.exec(content);
    if (!m) continue;
    const openBrace = m.index + m[0].length - 1;
    const close = findMatchingBrace(content, openBrace);
    if (close < 0) continue;
    const body = content.slice(openBrace + 1, close);
    // Idempotent only when the property is already in THIS payload object
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

function findMatchingBrace(content: string, openIdx: number): number {
  let depth = 0;
  let inStr: string | null = null;
  for (let i = openIdx; i < content.length; i++) {
    const ch = content[i]!;
    if (inStr) {
      if (ch === inStr && content[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      continue;
    }
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function replaceCall(
  content: string,
  fileName: string,
  op: Extract<RepairOperation, { type: 'replace-call-expression' }>,
): string | null {
  let next = content;
  if (op.ensureImport) {
    next = ensureNamedImports(
      next,
      fileName,
      op.ensureImport.module,
      op.ensureImport.names,
    );
  }
  // For trusted-field migration we primarily remove the field; call migration
  // is optional and only when executeCommand is clearly the callee.
  if (op.fromCalleePattern === 'executeCommand' && next.includes('executeCommand')) {
    // Keep executeCommand but ensure import of bind helper exists — full call
    // rewrite is unsafe without arg reshaping. Idempotent import-only is OK.
    return next;
  }
  return next;
}

function addInvalidation(
  content: string,
  _fileName: string,
  op: Extract<RepairOperation, { type: 'add-invalidation-after-mutation' }>,
): string | null {
  const hints = op.queryKeyHints;
  if (hints.length === 0) return content;
  const already = hints.every(h => content.includes(h));
  if (already && /invalidateQueries/.test(content)) return content;

  if (op.pattern === 'react-query') {
    const block = hints
      .map(h => `  void queryClient.invalidateQueries({ queryKey: ${h} });`)
      .join('\n');
    if (content.includes(block.trim())) return content;
    // Insert after successful mutation await if present
    const awaitRe = /await\s+[^;]+;/;
    const m = awaitRe.exec(content);
    if (!m) return content;
    const insertAt = m.index + m[0].length;
    return content.slice(0, insertAt) + '\n' + block + content.slice(insertAt);
  }

  // custom: revalidatePath style — only if already used in file
  if (/revalidatePath/.test(content)) {
    const line = `  revalidatePath(${hints[0]});`;
    if (content.includes(line.trim())) return content;
    const m = /await\s+[^;]+;/.exec(content);
    if (!m) return content;
    return content.slice(0, m.index + m[0].length) + '\n' + line + content.slice(m.index + m[0].length);
  }
  return content;
}

function rewireLifecycle(
  content: string,
  _fileName: string,
  op: Extract<RepairOperation, { type: 'rewire-lifecycle-call' }>,
): string | null {
  const [fromEntity, fromCmd] = op.fromCapabilityId.split('.');
  if (!fromEntity || !fromCmd) return null;
  let next = content;
  // executeCommand("E","old" → executeCommand("E","new"
  const re = new RegExp(
    `(executeCommand\\s*\\(\\s*["'])${escape(fromEntity)}(["']\\s*,\\s*["'])${escape(fromCmd)}(["'])`,
  );
  if (re.test(next)) {
    next = next.replace(
      re,
      `$1${op.entity}$2${op.command}$3`,
    );
  }
  // runManifestCommand command: "old"
  const re2 = new RegExp(
    `(command\\s*:\\s*["'])${escape(fromCmd)}(["'])`,
  );
  if (re2.test(next) && next.includes(`"${fromEntity}"`)) {
    next = next.replace(re2, `$1${op.command}$2`);
  }
  return next;
}

function wireControl(
  content: string,
  fileName: string,
  op: Extract<RepairOperation, { type: 'wire-control-to-binding' }>,
): string | null {
  let next = content;
  if (op.ensureImport) {
    next = ensureNamedImports(
      next,
      fileName,
      op.ensureImport.module,
      op.ensureImport.names,
    );
  }
  if (next.includes(`${op.bindingCallee}(`)) return next; // already wired

  // Replace noop / local-only handlers on matching control
  const noopRe =
    /(onClick|onPress)\s*=\s*\{\s*(?:\(\s*\)\s*=>\s*)?(?:noop|undefined|set\w+\([^)]*\))\s*\}/;
  if (noopRe.test(next)) {
    next = next.replace(
      noopRe,
      `$1={() => { void ${op.bindingCallee}({}); }}`,
    );
    return next;
  }

  // data-manifest-capability placeholder button
  const dataRe = new RegExp(
    `(data-manifest-capability="[^"]+"[^>]*)(>\\s*)`,
  );
  if (dataRe.test(next) && !next.includes(`onClick={() => { void ${op.bindingCallee}`)) {
    next = next.replace(
      /(<button\b)([^>]*)(data-manifest-capability="[^"]+")([^>]*)(>)/,
      `$1$2$3$4 onClick={() => { void ${op.bindingCallee}({}); }}$5`,
    );
  }
  return next;
}

function replacePropertyText(
  content: string,
  parameter: string,
  fromExpression: string,
  toExpression: string,
): string {
  const idx = content.indexOf(`${parameter}:`);
  if (idx < 0) {
    const idx2 = content.indexOf(`${parameter} :`);
    if (idx2 < 0) return content;
  }
  const fromIdx = content.indexOf(fromExpression);
  if (fromIdx < 0) {
    // Try whitespace-flexible: strip .join(...)
    const joinRe = new RegExp(
      `(${escape(parameter)}\\s*:\\s*)([^,\\n}]+\\.join\\s*\\([^)]*\\))`,
    );
    return content.replace(joinRe, `$1${toExpression}`);
  }
  return content.slice(0, fromIdx) + toExpression + content.slice(fromIdx + fromExpression.length);
}

function normalizeExpr(s: string): string {
  return s.replace(/\s+/g, '');
}

function getContent(map: Map<string, string>, file: string): string | undefined {
  return map.get(file) ?? map.get(normalize(file)) ?? map.get(file.replace(/\//g, '\\'));
}

function setContent(map: Map<string, string>, file: string, content: string): void {
  if (map.has(file)) {
    map.set(file, content);
    return;
  }
  const norm = normalize(file);
  for (const key of map.keys()) {
    if (normalize(key) === norm) {
      map.set(key, content);
      return;
    }
  }
  map.set(file, content);
}

function normalize(p: string): string {
  return p.replace(/\\/g, '/');
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractFromExpression(plan: RepairPlan): string | undefined {
  for (const e of plan.edits) {
    if (e.operation.type === 'replace-object-property-value') {
      return e.operation.fromExpression;
    }
  }
  return undefined;
}

function preconditionSnippetPresent(plan: RepairPlan, content: string): boolean {
  const from = extractFromExpression(plan);
  if (from && content.includes(from)) return true;
  if (plan.mismatch?.parameter && content.includes(plan.mismatch.parameter)) return true;
  return false;
}

function fingerprintStillMatches(content: string, fp: string): boolean {
  // Fingerprints are hashes — they won't appear in content. Always false.
  void content;
  void fp;
  return false;
}

/** Apply multiple plans sequentially (for non-one-defect modes). */
export function applyRepairPlans(
  plans: RepairPlan[],
  fileContents: Map<string, string>,
): PatchApplyResult {
  let current = new Map(fileContents);
  const allChanged = new Set<string>();
  let editsApplied = 0;
  for (const plan of plans) {
    if (!plan.automaticApplicationAllowed) continue;
    const result = applyRepairPlan(plan, current);
    if (!result.ok) {
      return {
        ...result,
        filesChanged: [...allChanged],
        editsApplied,
        nextContents: current,
      };
    }
    current = result.nextContents;
    for (const f of result.filesChanged) allChanged.add(f);
    editsApplied += result.editsApplied;
  }
  return {
    ok: true,
    filesChanged: [...allChanged],
    editsApplied,
    nextContents: current,
  };
}
