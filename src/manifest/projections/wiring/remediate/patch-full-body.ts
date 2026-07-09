/**
 * Patch ops for expand-partial-to-full-body repairs.
 */

import ts from 'typescript';
import type { RepairOperation } from './types.js';
import {
  parseSource,
  ensureNamedImports,
  callMatchesCapability,
} from './ast-utils.js';
import {
  extractApiManifestPosts,
  extractGeneratedClientCalls,
  extractBalancedBraces,
  clientFunctionName,
} from '../inspect/invocation-extractor.js';

export function ensureExportSymbols(
  content: string,
  fileName: string,
  op: Extract<RepairOperation, { type: 'ensure-export-symbols' }>,
): string | null {
  const isServerActionsModule = /^["']use server["']/m.test(content);
  let next = content;
  for (const name of op.symbolNames) {
    if (new RegExp(`\\bexport\\s+(?:async\\s+)?(?:function|const|let|var)\\s+${escape(name)}\\b`).test(next)) {
      continue;
    }
    // Next.js: every export from a "use server" file must be an async Server Action.
    // Never promote a sync helper to export in those modules.
    if (isServerActionsModule && isSyncDeclaration(next, name)) {
      void fileName;
      return null;
    }
    const constRe = new RegExp(`(^|\\n)(const\\s+${escape(name)}\\b)`);
    if (constRe.test(next)) {
      next = next.replace(constRe, `$1export $2`);
      continue;
    }
    const fnRe = new RegExp(
      `(^|\\n)((?:async\\s+)?function\\s+${escape(name)}\\b)`,
    );
    if (fnRe.test(next)) {
      next = next.replace(fnRe, `$1export $2`);
      continue;
    }
    void fileName;
  }
  return next;
}

/** True when `name` is declared as a non-async function/const in this file. */
function isSyncDeclaration(content: string, name: string): boolean {
  if (new RegExp(`\\basync\\s+function\\s+${escape(name)}\\b`).test(content)) {
    return false;
  }
  if (new RegExp(`\\bconst\\s+${escape(name)}\\s*=\\s*async\\b`).test(content)) {
    return false;
  }
  return (
    new RegExp(`\\b(?:function|const|let|var)\\s+${escape(name)}\\b`).test(content)
  );
}

export function applyEnsureNamedImports(
  content: string,
  fileName: string,
  op: Extract<RepairOperation, { type: 'ensure-named-imports' }>,
): string | null {
  return ensureNamedImports(content, fileName, op.module, op.names);
}

export function replaceCapabilityPayloadWithFullBody(
  content: string,
  _fileName: string,
  op: Extract<RepairOperation, { type: 'replace-capability-payload-with-full-body' }>,
): string | null {
  // Idempotent: already expanded with builder spread
  if (
    content.includes(`...${op.builderName}(`) &&
    content.includes(op.loaderName)
  ) {
    return content;
  }

  let next = content;
  const payloadSpan = findPartialPayloadSpan(next, op);
  if (!payloadSpan) return null;

  if (op.insertLoader) {
    const loaderLine = buildLoaderInsert(next, op);
    if (loaderLine && !next.includes(`${op.loaderName}(`)) {
      // Insert immediately before the call that owns the payload
      const insertAt = findStatementStart(next, payloadSpan.callStart);
      next =
        next.slice(0, insertAt) +
        loaderLine +
        next.slice(insertAt);
      // Recompute span after insert
      const shifted = findPartialPayloadSpan(next, op);
      if (!shifted) return null;
      next =
        next.slice(0, shifted.payloadStart) +
        op.toExpression +
        next.slice(shifted.payloadEnd);
      return next;
    }
  }

  next =
    next.slice(0, payloadSpan.payloadStart) +
    op.toExpression +
    next.slice(payloadSpan.payloadEnd);
  return next;
}

function buildLoaderInsert(
  content: string,
  op: Extract<RepairOperation, { type: 'replace-capability-payload-with-full-body' }>,
): string | undefined {
  // Prefer existing tenantId binding; otherwise requireTenantId() if already imported/used.
  const hasTenant = /\btenantId\b/.test(content);
  const hasRequireTenant = /\brequireTenantId\b/.test(content);
  if (!hasTenant && !hasRequireTenant) {
    // Cannot invent tenant resolution — skip loader insert; caller must already have it.
    // Still allow payload expand if current is somehow in scope (unlikely).
    return undefined;
  }
  const tenantExpr = hasTenant ? 'tenantId' : 'await requireTenantId()';
  const id = op.idExpression;
  const entityLabel = op.entity;
  return (
    `    const current = await ${op.loaderName}(${tenantExpr}, ${id});\n` +
    `    if (!current) {\n` +
    `      return { success: false, error: "${entityLabel} not found." };\n` +
    `    }\n`
  );
}

function findPartialPayloadSpan(
  content: string,
  op: Extract<RepairOperation, { type: 'replace-capability-payload-with-full-body' }>,
): { callStart: number; payloadStart: number; payloadEnd: number } | undefined {
  if (op.siteKind === 'api-post') {
    for (const inv of extractApiManifestPosts(content)) {
      if (inv.intent !== op.capabilityId) continue;
      if (!inv.payloadSource.startsWith('{')) continue;
      if (/\.\.\./.test(inv.payloadSource)) continue;
      const payloadStart = content.indexOf(inv.payloadSource, inv.index);
      if (payloadStart < 0) continue;
      return {
        callStart: inv.index,
        payloadStart,
        payloadEnd: payloadStart + inv.payloadSource.length,
      };
    }
  }

  const caps = new Set([op.capabilityId]);
  for (const inv of extractGeneratedClientCalls(content, caps)) {
    if (!inv.payloadSource.startsWith('{')) continue;
    if (/\.\.\./.test(inv.payloadSource)) continue;
    const payloadStart = content.indexOf(inv.payloadSource, inv.index);
    if (payloadStart < 0) continue;
    return {
      callStart: inv.index,
      payloadStart,
      payloadEnd: payloadStart + inv.payloadSource.length,
    };
  }

  // Fallback: locate client fn or path string then nearest object literal
  const fn = clientFunctionName(op.entity, op.command);
  const pathHint = `/api/manifest/${op.entity}/commands/${op.command}`;
  const idx = Math.max(content.indexOf(fn + '('), content.indexOf(pathHint));
  if (idx < 0) return undefined;
  const after = content.slice(idx, idx + 2000);
  const braceRel = after.indexOf('{');
  if (braceRel < 0) return undefined;
  const abs = idx + braceRel;
  const payload = extractBalancedBraces(content, abs);
  if (!payload) return undefined;
  return { callStart: idx, payloadStart: abs, payloadEnd: abs + payload.length };
}

function findStatementStart(content: string, index: number): number {
  // Walk back to previous newline (keep indentation of the call line).
  let i = index;
  while (i > 0 && content[i - 1] !== '\n') i--;
  return i;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Soft AST check that a call still matches capability (unused helper for future). */
export function capabilityCallPresent(
  content: string,
  fileName: string,
  capabilityId: string,
): boolean {
  const sf = parseSource(fileName, content);
  let found = false;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(node) && callMatchesCapability(node, content, capabilityId)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}
