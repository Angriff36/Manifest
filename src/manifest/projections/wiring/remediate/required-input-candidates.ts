/**
 * Candidate collection for add-required-input source proof.
 * Closure-local only — never invents values or uses file-wide guesses.
 */

import ts from 'typescript';
import type { WiringParameterDescriptor } from '../types.js';
import type { ProvenValueSource } from './required-input-source.js';

/** Innermost → outermost callables that close over the capability call. */
export function enclosingCallableChain(node: ts.Node): ts.Node[] {
  const chain: ts.Node[] = [];
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (
      ts.isFunctionDeclaration(cur) ||
      ts.isFunctionExpression(cur) ||
      ts.isArrowFunction(cur) ||
      ts.isMethodDeclaration(cur)
    ) {
      chain.push(cur);
    }
    cur = cur.parent;
  }
  return chain;
}

export function collectCandidates(
  sf: ts.SourceFile,
  content: string,
  call: ts.CallExpression,
  scopes: ts.Node[],
  param: WiringParameterDescriptor,
): ProvenValueSource[] {
  const out: ProvenValueSource[] = [];
  const name = param.name;
  const callPos = call.getStart(sf);
  const innermost = scopes[0];

  for (const scope of scopes) {
    collectSameNameParams(scope, sf, name, out);
    collectSameNameLocals(scope, sf, callPos, name, out);
    collectUseStateBinding(scope, sf, callPos, name, out);
  }

  // Numeric/money: proven Number(name) / alias in innermost scope.
  if (innermost && paramNeedsNumber(param)) {
    const converted = findProvenNumericConversion(innermost, sf, callPos, name);
    if (converted) out.push(converted);
  }

  collectObjectFormProperties(sf, content, scopes, innermost, callPos, name, param, out);
  collectFormDataSources(sf, content, scopes, callPos, name, param, out);
  collectFormAliases(innermost, sf, callPos, name, out);

  return dedupeSources(out);
}

export function isTypeCompatible(
  source: ProvenValueSource,
  param: WiringParameterDescriptor,
): boolean {
  const want = normalizeType(param.tsType);
  const got = source.typeText ? normalizeType(source.typeText) : undefined;

  if (source.kind === 'form-field') {
    if (want === 'string' || param.irTypeName === 'string') return true;
    if (param.constraints.dateLike && source.conversion === 'formData-string') {
      return Boolean(source.expression.includes('Date') || source.expression.includes('String'));
    }
    return false;
  }

  if (paramNeedsNumber(param)) {
    if (got === 'number') return true;
    if (got === 'string' || got === 'boolean') return false;
    const compact = source.expression.replace(/\s+/g, '');
    if (
      /^(Number|parseFloat|parseInt)\(/.test(compact) ||
      compact === `+${param.name}`
    ) {
      return true;
    }
    if (!got && source.expression === param.name && source.rank <= 2) {
      return true;
    }
    return false;
  }

  if (!got) {
    if (param.irTypeName === 'array' || param.irTypeName === 'list') return false;
    return source.rank <= 2 || source.kind === 'object-property';
  }

  if (got !== want && !typesAssignable(got, want, param)) {
    return false;
  }
  return true;
}

function collectObjectFormProperties(
  sf: ts.SourceFile,
  content: string,
  scopes: ts.Node[],
  innermost: ts.Node | undefined,
  callPos: number,
  name: string,
  param: WiringParameterDescriptor,
  out: ProvenValueSource[],
): void {
  const memberHosts = [
    'form',
    'values',
    'data',
    'state',
    'input',
    'payload',
    'body',
    'formValues',
  ];
  for (const host of memberHosts) {
    const member = `${host}.${name}`;
    const scopeForUse = innermost ?? sf;
    if (
      identifierOrMemberUsedInScope(scopeForUse, sf, member) ||
      content.includes(member)
    ) {
      if (hostInScopeChain(scopes, sf, host, callPos)) {
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

  for (const scope of scopes) {
    if (!('parameters' in scope)) continue;
    for (const p of (scope as ts.FunctionLikeDeclaration).parameters) {
      if (!ts.isIdentifier(p.name)) continue;
      const host = p.name.text;
      if (!memberHosts.includes(host) && host !== 'form') continue;
      const typeText = p.type?.getText(sf) ?? '';
      if (new RegExp(`\\b${escapeRe(name)}\\s*:`).test(typeText)) {
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
}

function collectFormDataSources(
  sf: ts.SourceFile,
  content: string,
  scopes: ts.Node[],
  callPos: number,
  name: string,
  param: WiringParameterDescriptor,
  out: ProvenValueSource[],
): void {
  const formGet = new RegExp(
    `formData\\.get\\s*\\(\\s*["']${escapeRe(name)}["']\\s*\\)`,
  );
  if (!formGet.test(content) || !hostInScopeChain(scopes, sf, 'formData', callPos)) {
    return;
  }
  const expr = `formData.get("${name}")`;
  if (
    param.constraints.dateLike ||
    param.irTypeName === 'date' ||
    param.irTypeName === 'datetime'
  ) {
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

function collectFormAliases(
  innermost: ts.Node | undefined,
  sf: ts.SourceFile,
  callPos: number,
  name: string,
  out: ProvenValueSource[],
): void {
  if (!innermost) return;
  for (const local of findLocalDeclarations(innermost, sf, callPos)) {
    if (local.name !== name || !local.initText) continue;
    if (
      local.initText === `form.${name}` ||
      local.initText === `values.${name}` ||
      local.initText === `data.${name}` ||
      local.initText === `input.${name}` ||
      local.initText === `formData.get("${name}")` ||
      local.initText === `formData.get('${name}')`
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

function collectSameNameParams(
  scope: ts.Node,
  sf: ts.SourceFile,
  name: string,
  out: ProvenValueSource[],
): void {
  if (!('parameters' in scope)) return;
  for (const p of (scope as ts.FunctionLikeDeclaration).parameters) {
    if (ts.isIdentifier(p.name) && p.name.text === name) {
      out.push({
        expression: name,
        kind: 'function-param',
        rank: 1,
        typeText: p.type?.getText(sf),
        conversion: 'none',
      });
    }
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

function collectSameNameLocals(
  scope: ts.Node,
  sf: ts.SourceFile,
  callPos: number,
  name: string,
  out: ProvenValueSource[],
): void {
  for (const local of findLocalDeclarations(scope, sf, callPos)) {
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

function collectUseStateBinding(
  scope: ts.Node,
  sf: ts.SourceFile,
  callPos: number,
  name: string,
  out: ProvenValueSource[],
): void {
  const visit = (node: ts.Node) => {
    if (node.getStart(sf) >= callPos) return;
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        const binding = readUseStateBinding(decl, sf, name);
        if (binding) {
          out.push({
            expression: name,
            kind: 'local-variable',
            rank: 2,
            typeText: binding.typeText,
            conversion: 'none',
          });
        }
      }
    }
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
}

function readUseStateBinding(
  decl: ts.VariableDeclaration,
  sf: ts.SourceFile,
  name: string,
): { typeText?: string } | undefined {
  if (!ts.isArrayBindingPattern(decl.name) || decl.name.elements.length < 1) {
    return undefined;
  }
  const first = decl.name.elements[0];
  if (!first || !ts.isBindingElement(first) || !ts.isIdentifier(first.name)) {
    return undefined;
  }
  if (first.name.text !== name || first.dotDotDotToken) return undefined;
  const init = decl.initializer;
  if (!init || !ts.isCallExpression(init)) return undefined;
  const callee = init.expression.getText(sf);
  if (callee !== 'useState' && !callee.endsWith('.useState')) return undefined;
  const arg0 = init.arguments[0];
  let typeText: string | undefined;
  if (arg0) {
    if (ts.isStringLiteral(arg0) || ts.isNoSubstitutionTemplateLiteral(arg0)) {
      typeText = 'string';
    } else if (ts.isNumericLiteral(arg0)) {
      typeText = 'number';
    } else if (
      arg0.kind === ts.SyntaxKind.TrueKeyword ||
      arg0.kind === ts.SyntaxKind.FalseKeyword
    ) {
      typeText = 'boolean';
    }
  }
  return { typeText };
}

function paramNeedsNumber(param: WiringParameterDescriptor): boolean {
  const ir = param.irTypeName;
  if (
    ir === 'number' ||
    ir === 'money' ||
    ir === 'decimal' ||
    ir === 'int' ||
    ir === 'float'
  ) {
    return true;
  }
  return normalizeType(param.tsType) === 'number';
}

function findProvenNumericConversion(
  scope: ts.Node,
  sf: ts.SourceFile,
  callPos: number,
  name: string,
): ProvenValueSource | undefined {
  const aliases: ProvenValueSource[] = [];
  for (const local of findLocalDeclarations(scope, sf, callPos)) {
    if (!local.initText || local.name === name) continue;
    if (!isNumericConversionOf(local.initText, name)) continue;
    aliases.push({
      expression: local.name,
      kind: 'local-variable',
      rank: 2,
      typeText: 'number',
      conversion: 'none',
    });
  }
  if (aliases.length === 1) return aliases[0];
  if (aliases.length > 1) return undefined;

  const scopeText = scope.getText(sf);
  const direct = `Number(${name})`;
  if (scopeText.includes(direct)) {
    return {
      expression: direct,
      kind: 'local-variable',
      rank: 2,
      typeText: 'number',
      conversion: 'none',
    };
  }
  if (scopeText.includes(`parseFloat(${name})`)) {
    return {
      expression: `parseFloat(${name})`,
      kind: 'local-variable',
      rank: 2,
      typeText: 'number',
      conversion: 'none',
    };
  }
  return undefined;
}

function isNumericConversionOf(initText: string, name: string): boolean {
  const t = initText.replace(/\s+/g, '');
  return (
    t === `Number(${name})` ||
    t === `parseFloat(${name})` ||
    t === `parseInt(${name},10)` ||
    t === `parseInt(${name})` ||
    t === `+${name}`
  );
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

function hostInScopeChain(
  scopes: ts.Node[],
  sf: ts.SourceFile,
  host: string,
  beforePos: number,
): boolean {
  return scopes.some(scope => hostInScope(scope, sf, host, beforePos));
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

function typesAssignable(
  got: string,
  want: string,
  param: WiringParameterDescriptor,
): boolean {
  if (got === want) return true;
  if (want === 'string' && got === 'string') return true;
  if (param.constraints.dateLike && (got === 'string' || got === 'date')) return true;
  if (want === 'number' && got === 'number') return true;
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
