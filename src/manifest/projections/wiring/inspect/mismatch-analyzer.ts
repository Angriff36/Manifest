/**
 * Statically provable contract mismatches between application payloads
 * and the Manifest wiring contract.
 *
 * Only reports when evidence is strong. Uncertain cases stay ambiguous.
 */

import type { WiringCommandDescriptor, WiringContract } from '../types.js';
import type { ManifestInvocation } from './invocation-extractor.js';
import { lineAtIndex } from './invocation-extractor.js';
import type { ContractMismatch } from './types.js';

export function analyzeContractMismatches(
  contract: WiringContract,
  invocations: Array<ManifestInvocation & { file: string; reachable?: boolean }>,
): ContractMismatch[] {
  const byId = new Map(contract.capabilities.map(c => [c.capabilityId, c]));
  const out: ContractMismatch[] = [];

  for (const inv of invocations) {
    if (inv.reachable === false) continue;
    const cap = byId.get(inv.intent);
    if (!cap) {
      out.push({
        kind: 'stale_capability',
        capabilityId: inv.intent,
        message: `Application references nonexistent capability '${inv.intent}'`,
        source: { file: inv.file, line: undefined },
        defect: true,
      });
      continue;
    }
    out.push(...analyzePayload(cap, inv));
  }

  return dedupeMismatches(out);
}

function analyzePayload(
  cap: WiringCommandDescriptor,
  inv: ManifestInvocation & { file: string },
): ContractMismatch[] {
  const payload = inv.payloadSource ?? '';
  const fields = new Set(inv.bodyFields);
  const mismatches: ContractMismatch[] = [];
  const loc = { file: inv.file, line: lineAtIndex(payload, 0) || undefined };

  // Trusted-field spoofing: client sends a server-owned parameter
  for (const serverParam of cap.serverParameterNames) {
    if (fields.has(serverParam) || objectHasKey(payload, serverParam)) {
      mismatches.push({
        kind: 'trusted_field_spoofing',
        capabilityId: cap.capabilityId,
        parameter: serverParam,
        message: `Client payload supplies trusted server-owned field '${serverParam}' (expected from ${cap.parameters.find(p => p.name === serverParam)?.trustedSource ?? 'context'})`,
        source: loc,
        defect: true,
      });
    }
  }

  // Missing required client inputs (only when an object literal payload is present)
  if (looksLikeObjectLiteral(payload)) {
    for (const param of cap.parameters) {
      if (param.ownership !== 'client') continue;
      if (!param.required) continue;
      if (fields.has(param.name) || objectHasKey(payload, param.name)) continue;
      // Spread / variable payloads are ambiguous
      if (/\.\.\./.test(payload) || isIdentifierOnlyPayload(payload)) {
        continue;
      }
      mismatches.push({
        kind: 'missing_required_input',
        capabilityId: cap.capabilityId,
        parameter: param.name,
        message: `Required client input '${param.name}' is missing from statically constructed payload for ${cap.capabilityId}`,
        source: loc,
        defect: true,
      });
    }
  }

  for (const param of cap.parameters) {
    if (param.ownership !== 'client') continue;
    const valueExpr = readFieldExpression(payload, param.name);
    if (valueExpr === undefined) continue;

    // string[] vs string: .join( suggests string where array required
    if (
      (param.irTypeName === 'array' || param.irTypeName === 'list') &&
      /\.join\s*\(/.test(valueExpr)
    ) {
      mismatches.push({
        kind: 'wrong_input_shape',
        capabilityId: cap.capabilityId,
        parameter: param.name,
        message: `Parameter '${param.name}' requires ${param.tsType} but application sends a joined string`,
        source: loc,
        defect: true,
      });
    }

    // Invalid finite literal (enum or numeric range from constraints)
    const lit = parseLiteral(valueExpr);
    if (lit !== undefined) {
      if (param.constraints.enumValues && param.constraints.enumValues.length > 0) {
        if (!param.constraints.enumValues.includes(String(lit))) {
          mismatches.push({
            kind: 'invalid_finite_literal',
            capabilityId: cap.capabilityId,
            parameter: param.name,
            message: `Parameter '${param.name}' value ${JSON.stringify(lit)} is not in allowed set [${param.constraints.enumValues.join(', ')}]`,
            source: loc,
            defect: true,
          });
        }
      }
      if (
        typeof lit === 'number' &&
        param.constraints.min !== undefined &&
        param.constraints.max !== undefined
      ) {
        if (lit < param.constraints.min || lit > param.constraints.max) {
          mismatches.push({
            kind: 'invalid_finite_literal',
            capabilityId: cap.capabilityId,
            parameter: param.name,
            message: `Parameter '${param.name}' value ${lit} is outside allowed range ${param.constraints.min}..${param.constraints.max}`,
            source: loc,
            defect: true,
          });
        }
      }

      // Required date sent as ""
      if (
        param.constraints.rejectEmptyString &&
        lit === '' &&
        (param.constraints.dateLike || param.constraints.nonEmpty)
      ) {
        mismatches.push({
          kind: 'invalid_date_sentinel',
          capabilityId: cap.capabilityId,
          parameter: param.name,
          message: `Parameter '${param.name}' requires a non-empty date but application sends ""`,
          source: loc,
          defect: true,
        });
      } else if (param.constraints.rejectEmptyString && lit === '') {
        mismatches.push({
          kind: 'invalid_date_sentinel',
          capabilityId: cap.capabilityId,
          parameter: param.name,
          message: `Parameter '${param.name}' rejects empty string but application sends ""`,
          source: loc,
          defect: true,
        });
      }
    }
  }

  return mismatches;
}

function looksLikeObjectLiteral(payload: string): boolean {
  const t = payload.trim();
  return t.startsWith('{') && t.endsWith('}');
}

function isIdentifierOnlyPayload(payload: string): boolean {
  return /^[A-Za-z_][\w]*$/.test(payload.trim());
}

function objectHasKey(objectLiteral: string, key: string): boolean {
  return new RegExp(`\\b${escape(key)}\\s*:`).test(objectLiteral);
}

function readFieldExpression(objectLiteral: string, key: string): string | undefined {
  const re = new RegExp(`\\b${escape(key)}\\s*:\\s*`);
  const m = re.exec(objectLiteral);
  if (!m) return undefined;
  const start = m.index + m[0].length;
  let i = start;
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let inStr: string | null = null;
  while (i < objectLiteral.length) {
    const ch = objectLiteral[i]!;
    if (inStr) {
      if (ch === inStr && objectLiteral[i - 1] !== '\\') inStr = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      i++;
      continue;
    }
    if (ch === '(') depthParen++;
    if (ch === ')') depthParen--;
    if (ch === '{') depthBrace++;
    if (ch === '}') {
      if (depthBrace === 0 && depthParen === 0 && depthBracket === 0) break;
      depthBrace--;
    }
    if (ch === '[') depthBracket++;
    if (ch === ']') depthBracket--;
    if (
      (ch === ',' || ch === '}') &&
      depthParen === 0 &&
      depthBrace === 0 &&
      depthBracket === 0
    ) {
      break;
    }
    i++;
  }
  return objectLiteral.slice(start, i).trim();
}

function parseLiteral(expr: string): string | number | boolean | undefined {
  const t = expr.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  const sm = /^["'](.*)["']$/.exec(t);
  if (sm) return sm[1];
  return undefined;
}

function dedupeMismatches(items: ContractMismatch[]): ContractMismatch[] {
  const seen = new Set<string>();
  const out: ContractMismatch[] = [];
  for (const m of items) {
    const key = `${m.kind}|${m.capabilityId}|${m.parameter ?? ''}|${m.source.file}|${m.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
