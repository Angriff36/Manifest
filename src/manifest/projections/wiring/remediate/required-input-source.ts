/**
 * Proven value-source resolution for add-required-input repairs.
 *
 * Never invents defaults. Ranks candidates by proof quality and rejects
 * ambiguous / type-incompatible / annotation-only matches.
 */

import ts from 'typescript';
import type { WiringCommandDescriptor, WiringParameterDescriptor } from '../types.js';
import { parseSource, callMatchesCapability } from './ast-utils.js';
import {
  collectCandidates,
  enclosingCallableChain,
  isTypeCompatible,
} from './required-input-candidates.js';
import { collectSiblingParamBindings } from './required-input-sibling-source.js';
import {
  proveSiblingFalsyGuard,
  sourceTypeNeedsFalsyGuard,
} from './required-input-sibling-guard.js';

export type ProvenSourceKind =
  | 'function-param'
  | 'local-variable'
  | 'object-property'
  | 'form-field'
  | 'trusted-context'
  | 'route-entity';

export type ProvenSourceRank =
  | 1 // exact same-name typed parameter
  | 2 // exact same-name local variable
  | 3 // exact same-name object/form property
  | 4 // strongly proven alias through local data flow
  | 5; // trusted context declared in Manifest

export interface ProvenValueSource {
  expression: string;
  kind: ProvenSourceKind;
  rank: ProvenSourceRank;
  /** Declared/inferred type text when available. */
  typeText?: string;
  /** True when a deterministic conversion is part of the expression. */
  conversion?: 'formData-string' | 'none';
}

export interface SourceProofResult {
  status: 'proven' | 'ambiguous' | 'missing' | 'unsafe';
  source?: ProvenValueSource;
  candidates: ProvenValueSource[];
  rationale: string;
  /** Proven falsy early-return guard required/available for the source. */
  guard?: {
    sourceExpression: string;
    statement: string;
    alreadyPresent: boolean;
  };
}

export interface ResolveRequiredInputOptions {
  content: string;
  fileName: string;
  capabilityId: string;
  param: WiringParameterDescriptor;
  cap: WiringCommandDescriptor;
}

/**
 * Search the consumer enclosing the capability call for a unique proven source.
 */
export function resolveRequiredInputSource(
  options: ResolveRequiredInputOptions,
): SourceProofResult {
  const { content, fileName, capabilityId, param } = options;

  // Trusted / server-owned: never wire from client sources.
  if (param.ownership === 'server') {
    if (param.trustedSource) {
      return {
        status: 'unsafe',
        candidates: [
          {
            expression: param.trustedSource,
            kind: 'trusted-context',
            rank: 5,
            typeText: param.tsType,
          },
        ],
        rationale: `Trusted parameter '${param.name}' must come from ${param.trustedSource}, not a client source`,
      };
    }
    return {
      status: 'unsafe',
      candidates: [],
      rationale: `Server-owned parameter '${param.name}' cannot be filled from client scope`,
    };
  }

  const sf = parseSource(fileName, content);
  const call = findCapabilityCall(sf, content, capabilityId);
  if (!call) {
    return {
      status: 'missing',
      candidates: [],
      rationale: `Could not locate capability call ${capabilityId} for source proof`,
    };
  }

  const scopes = enclosingCallableChain(call);
  const candidates = collectCandidates(
    sf,
    content,
    call,
    scopes,
    param,
    capabilityId,
  );

  if (candidates.length === 0) {
    return {
      status: 'missing',
      candidates: [],
      rationale: `Required input '${param.name}' has no proven local source — will not invent a value`,
    };
  }

  // Rank then keep only best rank; equal-confidence multiples → ambiguous.
  candidates.sort((a, b) => a.rank - b.rank || a.expression.localeCompare(b.expression));
  const bestRank = candidates[0]!.rank;
  const top = candidates.filter(c => c.rank === bestRank);
  const compatible = top.filter(c => isTypeCompatible(c, param));

  if (compatible.length === 0) {
    return {
      status: 'unsafe',
      candidates,
      rationale: `Candidate source(s) for '${param.name}' are not type-compatible with ${param.tsType}`,
    };
  }

  if (compatible.length > 1) {
    const uniqueExprs = [...new Set(compatible.map(c => c.expression))];
    if (uniqueExprs.length > 1) {
      return {
        status: 'ambiguous',
        candidates: compatible,
        rationale: `Multiple equal-confidence sources for '${param.name}': ${uniqueExprs.join(', ')}`,
      };
    }
  }

  const chosen = compatible[0]!;
  const guardResult = proveGuardForChosenSource({
    sf,
    call,
    scopes,
    capabilityId,
    param,
    chosen,
  });
  if (guardResult && 'reject' in guardResult) {
    return {
      status: 'unsafe',
      source: chosen,
      candidates: compatible,
      rationale: guardResult.reject,
    };
  }

  return {
    status: 'proven',
    source: chosen,
    candidates: compatible,
    rationale: `Proven ${chosen.kind} source ${chosen.expression} (rank ${chosen.rank}) for '${param.name}'`,
    guard: guardResult,
  };
}

/**
 * All required client params still missing from the capability payload at this call.
 */
export function missingRequiredClientParams(
  content: string,
  fileName: string,
  cap: WiringCommandDescriptor,
): WiringParameterDescriptor[] {
  const sf = parseSource(fileName, content);
  const call = findCapabilityCall(sf, content, cap.capabilityId);
  if (!call) return [];
  const payload = findPayloadObject(call);
  if (!payload) return [];
  const present = new Set<string>();
  for (const prop of payload.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      present.add(prop.name.text);
    } else if (ts.isShorthandPropertyAssignment(prop)) {
      present.add(prop.name.text);
    }
  }
  return cap.parameters.filter(
    p => p.ownership === 'client' && p.required && !present.has(p.name),
  );
}

function proveGuardForChosenSource(options: {
  sf: ts.SourceFile;
  call: ts.CallExpression;
  scopes: ts.Node[];
  capabilityId: string;
  param: WiringParameterDescriptor;
  chosen: ProvenValueSource;
}):
  | {
      sourceExpression: string;
      statement: string;
      alreadyPresent: boolean;
    }
  | { reject: string }
  | undefined {
  const { sf, call, scopes, capabilityId, param, chosen } = options;
  const needsGuard = sourceTypeNeedsFalsyGuard(chosen.typeText, param.tsType);
  if (!needsGuard) return undefined;

  // Re-collect qualifying sibling hits for this expression only.
  const hits = collectSiblingParamBindings(
    sf,
    call,
    scopes,
    param.name,
    [],
    capabilityId,
  ).filter(h => h.expression === chosen.expression);

  return proveSiblingFalsyGuard({
    sf,
    targetCall: call,
    sourceExpression: chosen.expression,
    qualifyingSiblingCalls: hits.map(h => h.call),
    required: true,
  });
}

function findCapabilityCall(
  sf: ts.SourceFile,
  content: string,
  capabilityId: string,
): ts.CallExpression | undefined {
  let found: ts.CallExpression | undefined;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(node) && callMatchesCapability(node, content, capabilityId)) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

function findPayloadObject(
  call: ts.CallExpression,
): ts.ObjectLiteralExpression | undefined {
  for (const arg of call.arguments) {
    if (!ts.isObjectLiteralExpression(arg)) continue;
    for (const prop of arg.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        ts.isIdentifier(prop.name) &&
        prop.name.text === 'body' &&
        prop.initializer &&
        ts.isObjectLiteralExpression(prop.initializer)
      ) {
        return prop.initializer;
      }
    }
    return arg;
  }
  return undefined;
}
