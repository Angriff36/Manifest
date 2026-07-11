/**
 * Form / object-property source candidates for add-required-input.
 */

import ts from 'typescript';
import type { WiringParameterDescriptor } from '../types.js';
import type { ProvenValueSource } from './required-input-source.js';

export function collectObjectFormProperties(
  sf: ts.SourceFile,
  content: string,
  scopes: ts.Node[],
  innermost: ts.Node | undefined,
  callPos: number,
  name: string,
  param: WiringParameterDescriptor,
  out: ProvenValueSource[],
  hostInScopeChain: (
    scopes: ts.Node[],
    sf: ts.SourceFile,
    host: string,
    beforePos: number,
  ) => boolean,
): void {
  const memberHosts = ['form', 'values', 'data', 'state', 'input', 'payload', 'body', 'formValues'];
  for (const host of memberHosts) {
    const member = `${host}.${name}`;
    const scopeForUse = innermost ?? sf;
    if (scopeForUse.getText(sf).includes(member) || content.includes(member)) {
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

export function collectFormDataSources(
  sf: ts.SourceFile,
  content: string,
  scopes: ts.Node[],
  callPos: number,
  name: string,
  param: WiringParameterDescriptor,
  out: ProvenValueSource[],
  hostInScopeChain: (
    scopes: ts.Node[],
    sf: ts.SourceFile,
    host: string,
    beforePos: number,
  ) => boolean,
): void {
  const formGet = new RegExp(`formData\\.get\\s*\\(\\s*["']${escapeRe(name)}["']\\s*\\)`);
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

export function collectFormAliases(
  innermost: ts.Node | undefined,
  sf: ts.SourceFile,
  callPos: number,
  name: string,
  out: ProvenValueSource[],
  findLocalDeclarations: (
    scope: ts.Node,
    sf: ts.SourceFile,
    beforePos: number,
  ) => Array<{ name: string; typeText?: string; initText?: string }>,
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

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
