/**
 * Statically provable contract mismatches between application payloads
 * and the Manifest wiring contract.
 *
 * Only reports when evidence is strong. Uncertain cases stay ambiguous.
 */

import type { WiringCommandDescriptor, WiringContract } from '../types.js';
import type { ManifestInvocation } from './invocation-extractor.js';
import { lineAtIndex } from './invocation-extractor.js';
import {
  objectLiteralHasKey,
  readObjectLiteralFieldExpression,
} from './object-literal-keys.js';
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
    if (fields.has(serverParam) || objectLiteralHasKey(payload, serverParam)) {
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

  // Missing required client inputs — only when a statically constructed object
  // literal is present. Helper calls, identifiers, ternaries, and other
  // unresolved expressions are not proof that fields are missing.
  if (looksLikeObjectLiteral(payload) && !isUnresolvedPayloadShape(payload)) {
    for (const param of cap.parameters) {
      if (param.ownership !== 'client') continue;
      if (!param.required) continue;
      if (fields.has(param.name) || objectLiteralHasKey(payload, param.name)) {
        continue;
      }
      // Spread inside a literal remains ambiguous (fields may arrive via ...x)
      if (/\.\.\./.test(payload)) {
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
    const valueExpr = readObjectLiteralFieldExpression(payload, param.name);
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

/**
 * True when the payload expression is not a statically inspectable object
 * literal (helper call, bare identifier, ternary, etc.). Does not invent a
 * new coverage status — callers simply skip unproven missing-input defects.
 */
export function isUnresolvedPayloadShape(payload: string): boolean {
  const t = payload.trim();
  if (!t) return true;
  if (t.startsWith('{') && t.endsWith('}')) return false;
  return true;
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

