/**
 * Proven value-source resolution for add-required-input repairs.
 *
 * Never invents defaults. Ranks candidates by proof quality and rejects
 * ambiguous / type-incompatible / annotation-only matches.
 */

import ts from 'typescript';
import type { WiringCommandDescriptor, WiringParameterDescriptor } from '../types.js';
import { parseSource, callMatchesCapability } from './ast-utils.js';

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

  const scope = enclosingCallable(call);
  const candidates = collectCandidates(sf, content, call, scope, param);

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
  return {
    status: 'proven',
    source: chosen,
    candidates: compatible,
    rationale: `Proven ${chosen.kind} source ${chosen.expression} (rank ${chosen.rank}) for '${param.name}'`,
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

function enclosingCallable(node: ts.Node): ts.Node | undefined {
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

function collectCandidates(
  sf: ts.SourceFile,
  content: string,
  call: ts.CallExpression,
  scope: ts.Node | undefined,
  param: WiringParameterDescriptor,
): ProvenValueSource[] {
  const out: ProvenValueSource[] = [];
  const name = param.name;

  // 1. Exact same-name function parameter in enclosing callable
  if (scope && 'parameters' in scope) {
    const params = (scope as ts.FunctionLikeDeclaration).parameters;
    for (const p of params) {
      if (ts.isIdentifier(p.name) && p.name.text === name) {
        // Skip if this is only a destructured type annotation container
        out.push({
          expression: name,
          kind: 'function-param',
          rank: 1,
          typeText: p.type?.getText(sf),
          conversion: 'none',
        });
      }
      // Destructured: ({ summary }: …) — property in binding pattern
      if (ts.isObjectBindingPattern(p.name)) {
        for (const el of p.name.elements) {
          if (
            ts.isBindingElement(el) &&
            ts.isIdentifier(el.name) &&
            el.name.text === name &&
            !el.dotDotDotToken
          ) {
            out.push({
              expression: name,
              kind: 'function-param',
              rank: 1,
              typeText: undefined,
              conversion: 'none',
            });
          }
        }
      }
    }
  }

  // 2. Exact same-name local variable declared in enclosing scope before the call
  if (scope) {
    const locals = findLocalDeclarations(scope, sf, call.getStart(sf));
    for (const local of locals) {
      if (local.name !== name) continue;
      out.push({
        expression: name,
        kind: 'local-variable',
        rank: 2,
        typeText: local.typeText,
        conversion: 'none',
      });
    }
  }

  // 3. Exact same-name object / form property already referenced in scope
  const memberHosts = ['form', 'values', 'data', 'state', 'input', 'payload', 'body', 'formValues'];
  for (const host of memberHosts) {
    const member = `${host}.${name}`;
    if (identifierOrMemberUsedInScope(scope ?? sf, sf, member) || content.includes(member)) {
      // Require the host itself to be in scope (param or local), not a comment/type-only hit
      if (hostInScope(scope, sf, host, call.getStart(sf))) {
        out.push({
          expression: member,
          kind: 'object-property',
          rank: 3,
          typeText: param.tsType,
          conversion: 'none',
        });
      }
    }
  }

  // form shape annotation: form: { summary: string } on a parameter named form
  if (scope && 'parameters' in scope) {
    for (const p of (scope as ts.FunctionLikeDeclaration).parameters) {
      if (!ts.isIdentifier(p.name)) continue;
      const host = p.name.text;
      if (!memberHosts.includes(host) && host !== 'form') continue;
      const typeText = p.type?.getText(sf) ?? '';
      if (new RegExp(`\\b${escapeRe(name)}\\s*:`).test(typeText)) {
        // Type annotation alone is NOT a runtime value — only count if host is a value param
        // and we will read host.name at runtime (object-property).
        out.push({
          expression: `${host}.${name}`,
          kind: 'object-property',
          rank: 3,
          typeText: param.tsType,
          conversion: 'none',
        });
      }
    }
  }

  // 4. formData.get("name") already used / formData in scope with proven field usage
  const formGet = new RegExp(
    `formData\\.get\\s*\\(\\s*["']${escapeRe(name)}["']\\s*\\)`,
  );
  if (formGet.test(content) && hostInScope(scope, sf, 'formData', call.getStart(sf))) {
    const expr = `formData.get("${name}")`;
    // Dates/numbers need deterministic conversion already present nearby
    if (param.constraints.dateLike || param.irTypeName === 'date' || param.irTypeName === 'datetime') {
      const converted = findFormDateConversion(content, name);
      if (converted) {
        out.push({
          expression: converted,
          kind: 'form-field',
          rank: 3,
          typeText: param.tsType,
          conversion: 'formData-string',
        });
      }
      // raw get without conversion is not proven for date
    } else if (param.irTypeName === 'string' || param.tsType === 'string') {
      out.push({
        expression: expr,
        kind: 'form-field',
        rank: 3,
        typeText: 'string',
        conversion: 'formData-string',
      });
    }
  }

  // 4b. Strong alias: const summary = form.summary / values.summary
  if (scope) {
    const locals = findLocalDeclarations(scope, sf, call.getStart(sf));
    for (const local of locals) {
      if (local.name !== name) continue;
      if (
        local.initText &&
        (local.initText === `form.${name}` ||
          local.initText === `values.${name}` ||
          local.initText === `data.${name}` ||
          local.initText === `input.${name}` ||
          local.initText === `formData.get("${name}")` ||
          local.initText === `formData.get('${name}')`)
      ) {
        out.push({
          expression: name,
          kind: 'local-variable',
          rank: 4,
          typeText: local.typeText,
          conversion: 'none',
        });
      }
    }
  }

  return dedupeSources(out);
}

interface LocalDecl {
  name: string;
  typeText?: string;
  initText?: string;
}

function findLocalDeclarations(
  scope: ts.Node,
  sf: ts.SourceFile,
  beforePos: number,
): LocalDecl[] {
  const out: LocalDecl[] = [];
  const visit = (node: ts.Node) => {
    if (node.getStart(sf) >= beforePos) return;
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          out.push({
            name: decl.name.text,
            typeText: decl.type?.getText(sf),
            initText: decl.initializer?.getText(sf),
          });
        }
      }
    }
    // Do not walk into nested functions
    if (
      node !== scope &&
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node))
    ) {
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(scope);
  return out;
}

function hostInScope(
  scope: ts.Node | undefined,
  sf: ts.SourceFile,
  host: string,
  beforePos: number,
): boolean {
  if (!scope) return false;
  if ('parameters' in scope) {
    for (const p of (scope as ts.FunctionLikeDeclaration).parameters) {
      if (ts.isIdentifier(p.name) && p.name.text === host) return true;
    }
  }
  return findLocalDeclarations(scope, sf, beforePos).some(l => l.name === host);
}

function identifierOrMemberUsedInScope(
  scope: ts.Node,
  sf: ts.SourceFile,
  member: string,
): boolean {
  return scope.getText(sf).includes(member);
}

function findFormDateConversion(content: string, name: string): string | undefined {
  // Patterns already in app: new Date(String(formData.get("dueDate")))
  const patterns = [
    new RegExp(
      `(new\\s+Date\\s*\\(\\s*(?:String\\s*\\(\\s*)?formData\\.get\\s*\\(\\s*["']${escapeRe(name)}["']\\s*\\)\\s*\\)?\\s*\\))`,
    ),
    new RegExp(
      `(String\\s*\\(\\s*formData\\.get\\s*\\(\\s*["']${escapeRe(name)}["']\\s*\\)\\s*\\))`,
    ),
  ];
  for (const re of patterns) {
    const m = re.exec(content);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

function isTypeCompatible(
  source: ProvenValueSource,
  param: WiringParameterDescriptor,
): boolean {
  const want = normalizeType(param.tsType);
  const got = source.typeText ? normalizeType(source.typeText) : undefined;

  // formData.get → FormDataEntryValue | null — only OK for string with conversion
  if (source.kind === 'form-field') {
    if (want === 'string' || param.irTypeName === 'string') return true;
    if (param.constraints.dateLike && source.conversion === 'formData-string') {
      return Boolean(source.expression.includes('Date') || source.expression.includes('String'));
    }
    return false;
  }

  // No annotation: same-name param/local is accepted only for non-array scalars
  // when kinds are high-rank (1–2). Reject when an explicit wrong type is present.
  if (!got) {
    if (param.irTypeName === 'array' || param.irTypeName === 'list') return false;
    return source.rank <= 2 || source.kind === 'object-property';
  }

  // Explicit wrong type → reject
  if (got !== want && !typesAssignable(got, want, param)) {
    return false;
  }
  return true;
}

function typesAssignable(
  got: string,
  want: string,
  param: WiringParameterDescriptor,
): boolean {
  if (got === want) return true;
  // string assignable to date when contract accepts ISO string (tsType string)
  if (want === 'string' && got === 'string') return true;
  if (param.constraints.dateLike && (got === 'string' || got === 'date')) return true;
  // number vs Number
  if (want === 'number' && got === 'number') return true;
  // arrays
  if (want.endsWith('[]') && got === want) return true;
  return false;
}

function normalizeType(t: string): string {
  return t
    .replace(/\s+/g, '')
    .replace(/\|null/g, '')
    .replace(/\|undefined/g, '')
    .replace(/^Date$/i, 'date')
    .toLowerCase();
}

function dedupeSources(sources: ProvenValueSource[]): ProvenValueSource[] {
  const seen = new Set<string>();
  const out: ProvenValueSource[] = [];
  for (const s of sources) {
    const key = `${s.rank}:${s.expression}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
