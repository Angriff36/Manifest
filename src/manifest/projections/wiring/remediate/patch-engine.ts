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
import { findPayloadObjectInCall, removeProperty, addProperty } from './patch-payload.js';
import {
  ensureExportSymbols,
  applyEnsureNamedImports,
  replaceCapabilityPayloadWithFullBody,
} from './patch-full-body.js';
import { insertEarlyReturnGuard as insertGuardAtCall } from './required-input-sibling-guard.js';

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

  const stale = checkStalePreconditions(plan, fileContents);
  if (stale) return stale;

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
      if (edit.operation.type === 'wire-control-to-binding') {
        return {
          ok: false,
          filesChanged: [...changed],
          editsApplied,
          skippedReason: `Preflight/patch construct failed for wire-control-to-binding (${edit.operation.bindingCallee})`,
          nextContents: new Map(fileContents),
        };
      }
      // Idempotent no-op is OK for other edit kinds (already applied)
      continue;
    }
    if (after !== before) {
      setContent(next, edit.file, after);
      changed.add(normalize(edit.file));
      editsApplied++;
    }
  }

  if (
    plan.repairKind === 'wire-existing-control' &&
    editsApplied === 0 &&
    plan.edits.some((e) => e.operation.type === 'wire-control-to-binding')
  ) {
    return {
      ok: false,
      filesChanged: [],
      editsApplied: 0,
      skippedReason: 'wire-existing-control produced no source edit (not a no-op success)',
      nextContents: new Map(fileContents),
    };
  }

  return {
    ok: true,
    filesChanged: [...changed],
    editsApplied,
    nextContents: next,
  };
}

function applyOperation(content: string, fileName: string, op: RepairOperation): string | null {
  switch (op.type) {
    case 'replace-object-property-value':
      return replacePropertyValue(content, fileName, op);
    case 'remove-object-property':
      return removeProperty(content, fileName, op);
    case 'add-object-property':
      return addProperty(content, fileName, op);
    case 'insert-early-return-guard':
      return insertEarlyReturnGuardOp(content, fileName, op);
    case 'replace-call-expression':
      return replaceCall(content, fileName, op);
    case 'add-invalidation-after-mutation':
      return addInvalidation(content, fileName, op);
    case 'rewire-lifecycle-call':
      return rewireLifecycle(content, fileName, op);
    case 'wire-control-to-binding':
      return wireControl(content, fileName, op);
    case 'ensure-export-symbols':
      return ensureExportSymbols(content, fileName, op);
    case 'ensure-named-imports':
      return applyEnsureNamedImports(content, fileName, op);
    case 'replace-capability-payload-with-full-body':
      return replaceCapabilityPayloadWithFullBody(content, fileName, op);
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
    const replaced = replacePropertyText(content, op.parameter, op.fromExpression, op.toExpression);
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
    if (ts.isCallExpression(node) && callMatchesCapability(node, content, op.capabilityId)) {
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
  const joinRe = new RegExp(`(${escape(op.parameter)}\\s*:\\s*)([^,\\n}]+\\.join\\s*\\([^)]*\\))`);
  if (joinRe.test(content)) {
    return content.replace(joinRe, `$1${op.toExpression}`);
  }
  return content;
}

function replaceCall(
  content: string,
  fileName: string,
  op: Extract<RepairOperation, { type: 'replace-call-expression' }>,
): string | null {
  let next = content;
  if (op.ensureImport) {
    next = ensureNamedImports(next, fileName, op.ensureImport.module, op.ensureImport.names);
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
  const already = hints.every((h) => content.includes(h));
  if (already && /invalidateQueries/.test(content)) return content;

  if (op.pattern === 'react-query') {
    const block = hints
      .map((h) => `  void queryClient.invalidateQueries({ queryKey: ${h} });`)
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
    return (
      content.slice(0, m.index + m[0].length) + '\n' + line + content.slice(m.index + m[0].length)
    );
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
    next = next.replace(re, `$1${op.entity}$2${op.command}$3`);
  }
  // runManifestCommand command: "old"
  const re2 = new RegExp(`(command\\s*:\\s*["'])${escape(fromCmd)}(["'])`);
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
    next = ensureNamedImports(next, fileName, op.ensureImport.module, op.ensureImport.names);
  }
  if (next.includes(`${op.bindingCallee}(`)) return next; // already wired

  const payload =
    op.payloadExpression ?? (op.identityExpression ? `{ id: ${op.identityExpression} }` : null);
  if (!payload) {
    // Instance/required inputs unknown — refuse rather than emit empty {}.
    return null;
  }
  const replacement = `() => { void ${op.bindingCallee}(${payload}); }`;

  // Prefer replacing the exact handler snippet from semantic proof.
  if (op.handlerSnippet) {
    const snippet = op.handlerSnippet.trim();
    // onClick={snippet} or onClick={() => snippet} forms
    const exactHandler = new RegExp(
      `((?:onClick|onPress)\\s*=\\s*\\{\\s*)(?:\\(\\s*\\)\\s*=>\\s*)?${escape(snippet)}(\\s*\\})`,
    );
    if (exactHandler.test(next)) {
      return next.replace(exactHandler, `$1${replacement}$2`);
    }
    // Named handler reference: onClick={handleX}
    const named = new RegExp(`((?:onClick|onPress)\\s*=\\s*\\{\\s*)${escape(snippet)}(\\s*\\})`);
    if (named.test(next)) {
      return next.replace(named, `$1${replacement}$2`);
    }
    // Arrow with setState body matching snippet text
    if (snippet.includes('set') || snippet.includes('noop')) {
      const arrowBody = new RegExp(
        `((?:onClick|onPress)\\s*=\\s*\\{\\s*)\\(\\s*\\)\\s*=>\\s*${escape(snippet)}(\\s*\\})`,
      );
      if (arrowBody.test(next)) {
        return next.replace(arrowBody, `$1${replacement}$2`);
      }
    }
  }

  // Targeted: only within controlSource fingerprint when provided
  if (op.controlSource && next.includes(op.controlSource)) {
    let control = op.controlSource;
    const noopInControl =
      /(onClick|onPress)\s*=\s*\{\s*(?:\(\s*\)\s*=>\s*)?(?:noop|undefined|set\w+\([^)]*\))\s*\}/;
    if (noopInControl.test(control)) {
      control = control.replace(noopInControl, `$1={${replacement}}`);
      return next.replace(op.controlSource, control);
    }
    const namedInControl = /(onClick|onPress)\s*=\s*\{\s*([A-Za-z_$][\w$]*)\s*\}/;
    if (namedInControl.test(control)) {
      control = control.replace(namedInControl, `$1={${replacement}}`);
      return next.replace(op.controlSource, control);
    }
  }

  // Explicit capability placeholder — only on the matching attribute
  const capAttr = op.controlSymbol ? `data-manifest-capability` : null;
  if (capAttr && /data-manifest-capability="[^"]+"/.test(next)) {
    const withHandler = /(<button\b)([^>]*)(data-manifest-capability="[^"]+")([^>]*)(>)/i;
    if (withHandler.test(next) && !next.includes(`onClick={() => { void ${op.bindingCallee}`)) {
      // Only add onClick when missing; never replace an unrelated set* elsewhere.
      const buttonHasOnClick =
        /data-manifest-capability="[^"]+"[^>]*onClick=/i.test(next) ||
        /onClick=[^>]*data-manifest-capability=/i.test(next);
      if (!buttonHasOnClick) {
        return next.replace(withHandler, `$1$2$3$4 onClick={${replacement}}$5`);
      }
      // Replace onClick only on the capability-marked control
      return next.replace(
        /(data-manifest-capability="[^"]+"[^>]*?)(onClick|onPress)\s*=\s*\{[^}]+\}/i,
        `$1$2={${replacement}}`,
      );
    }
  }

  // Refuse to blindly replace the first set* in the file — that was the
  // CollectionCase.escalateToLegal → "New case" defect.
  return null;
}

function replacePropertyText(
  content: string,
  parameter: string,
  fromExpression: string,
  toExpression: string,
): string {
  // Scope to the property value — never replace the first file-wide occurrence of
  // a short literal like "" (common in large modules).
  const keyRe = new RegExp(`\\b${escape(parameter)}\\s*:\\s*`);
  const keyMatch = keyRe.exec(content);
  if (!keyMatch) {
    const joinRe = new RegExp(`(${escape(parameter)}\\s*:\\s*)([^,\\n}]+\\.join\\s*\\([^)]*\\))`);
    return content.replace(joinRe, `$1${toExpression}`);
  }
  const valueStart = keyMatch.index + keyMatch[0].length;
  const afterKey = content.slice(valueStart);
  if (!afterKey.startsWith(fromExpression)) {
    // Allow whitespace between key and value already consumed by keyRe.
    // If fromExpression is not at the property value, try join-strip only.
    const joinRe = new RegExp(`(${escape(parameter)}\\s*:\\s*)([^,\\n}]+\\.join\\s*\\([^)]*\\))`);
    if (joinRe.test(content)) {
      return content.replace(joinRe, `$1${toExpression}`);
    }
    return content;
  }
  return (
    content.slice(0, valueStart) + toExpression + content.slice(valueStart + fromExpression.length)
  );
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
  return extractProvenSourceExpression(plan);
}

function extractProvenSourceExpression(plan: RepairPlan): string | undefined {
  for (const e of plan.edits) {
    if (e.operation.type === 'add-object-property' && e.operation.provenSource) {
      return e.operation.provenSource;
    }
  }
  return undefined;
}

function insertEarlyReturnGuardOp(
  content: string,
  fileName: string,
  op: Extract<RepairOperation, { type: 'insert-early-return-guard' }>,
): string | null {
  return insertGuardAtCall(
    content,
    fileName,
    op.capabilityId,
    op.sourceExpression,
    op.statement,
    callMatchesCapability,
    parseSource,
  );
}

/**
 * Proven sources must remain usable. Exact substring is required for aliases /
 * conversions; host.prop may be constructible when the host binding remains.
 */
function provenSourceStillPresent(proven: string, content: string): boolean {
  if (content.includes(proven)) return true;
  const member = /^([A-Za-z_][\w]*)\.([A-Za-z_][\w]*)$/.exec(proven);
  if (member) {
    return new RegExp(`\\b${escape(member[1]!)}\\b`).test(content);
  }
  return false;
}

function preconditionSnippetPresent(plan: RepairPlan, content: string): boolean {
  const proven = extractProvenSourceExpression(plan);
  if (proven) return provenSourceStillPresent(proven, content);
  const from = extractFromExpression(plan);
  if (from && content.includes(from)) return true;
  if (plan.mismatch?.parameter && content.includes(plan.mismatch.parameter)) return true;
  return false;
}

function fingerprintStillMatches(_content: string, _fp: string): boolean {
  // Fingerprints are hashes — they won't appear in content. Always false.
  return false;
}

function checkStalePreconditions(
  plan: RepairPlan,
  fileContents: Map<string, string>,
): PatchApplyResult | undefined {
  for (const pre of plan.preconditions) {
    const file = plan.edits[0]?.file;
    if (!file) continue;
    const content = getContent(fileContents, file);
    if (!content) {
      return stalePlanResult(fileContents, `Stale plan: source file missing (${file})`);
    }
    const proven = extractProvenSourceExpression(plan);
    if (proven && !provenSourceStillPresent(proven, content)) {
      return stalePlanResult(
        fileContents,
        `Stale plan: expected source snippet no longer present in ${file}`,
      );
    }
    const stillValid =
      content.includes(pre.sourceFingerprint) ||
      fingerprintStillMatches(content, pre.sourceFingerprint) ||
      preconditionSnippetPresent(plan, content);
    if (!stillValid && plan.preconditions.length > 0) {
      const expr = extractFromExpression(plan);
      if (expr && !content.includes(expr)) {
        return stalePlanResult(
          fileContents,
          `Stale plan: expected source snippet no longer present in ${file}`,
        );
      }
    }
  }
  return undefined;
}

function stalePlanResult(
  fileContents: Map<string, string>,
  skippedReason: string,
): PatchApplyResult {
  return {
    ok: false,
    filesChanged: [],
    editsApplied: 0,
    skippedReason,
    nextContents: new Map(fileContents),
  };
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
