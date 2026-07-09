/**
 * Shared AST / source helpers for wiring remediation.
 * Uses the TypeScript compiler API for structural edits (not blind regex).
 */

import ts from 'typescript';
import { createHash } from 'node:crypto';

export function fingerprintSnippet(snippet: string): string {
  return createHash('sha256').update(snippet).digest('hex').slice(0, 16);
}

export function parseSource(fileName: string, content: string): ts.SourceFile {
  const kind = fileName.endsWith('.tsx') || fileName.endsWith('.jsx')
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
  return ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true, kind);
}

export function printSource(sourceFile: ts.SourceFile): string {
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
    removeComments: false,
  });
  return printer.printFile(sourceFile);
}

/**
 * Read a property value expression from an object literal associated with a
 * capability invocation (executeCommand / runManifestCommand / client call).
 * Falls back to first matching property in file when capability context is weak.
 */
export function readObjectPropertyExpression(
  content: string,
  parameter: string,
  capabilityId?: string,
): string | undefined {
  const sf = parseSource('snippet.ts', content);
  let found: string | undefined;

  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(node) && capabilityId) {
      if (callMatchesCapability(node, content, capabilityId)) {
        const obj = findPayloadObject(node);
        if (obj) {
          const prop = findProperty(obj, parameter);
          if (prop?.initializer) {
            found = prop.initializer.getText(sf);
            return;
          }
        }
      }
    }
    if (ts.isObjectLiteralExpression(node) && !capabilityId) {
      const prop = findProperty(node, parameter);
      if (prop?.initializer) {
        found = prop.initializer.getText(sf);
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (found) return found;

  // Regex fallback for tests with simple object literals
  const re = new RegExp(`\\b${escapeRe(parameter)}\\s*:\\s*`);
  const m = re.exec(content);
  if (!m) return undefined;
  const start = m.index + m[0].length;
  return sliceExpression(content, start);
}

export function callMatchesCapability(
  node: ts.CallExpression,
  content: string,
  capabilityId: string,
): boolean {
  const [entity, command] = capabilityId.split('.');
  if (!entity || !command) return false;
  const text = node.expression.getText();
  // executeCommand("Entity", "command", …)
  if (text.includes('executeCommand') || text.endsWith('executeCommand')) {
    const args = node.arguments;
    if (
      args.length >= 2 &&
      ts.isStringLiteral(args[0]!) &&
      ts.isStringLiteral(args[1]!) &&
      args[0].text === entity &&
      args[1].text === command
    ) {
      return true;
    }
  }
  // runManifestCommand({ entity, command, body })
  if (text.includes('runManifestCommand')) {
    const arg0 = node.arguments[0];
    if (arg0 && ts.isObjectLiteralExpression(arg0)) {
      const e = readStringProp(arg0, 'entity');
      const c = readStringProp(arg0, 'command');
      if (e === entity && c === command) return true;
    }
  }
  // generated client: entityCommand / taskCreate style
  const camel = `${entity[0]!.toLowerCase()}${entity.slice(1)}${command[0]!.toUpperCase()}${command.slice(1)}`;
  if (text === camel || text.endsWith(`.${camel}`)) return true;
  // Also match capabilityId in surrounding text window
  const start = node.getStart();
  const window = content.slice(Math.max(0, start - 40), start + 120);
  return window.includes(`"${entity}"`) && window.includes(`"${command}"`);
}

function findPayloadObject(node: ts.CallExpression): ts.ObjectLiteralExpression | undefined {
  for (const arg of node.arguments) {
    if (ts.isObjectLiteralExpression(arg)) {
      // Prefer body: { … } inside runManifestCommand
      const body = findProperty(arg, 'body');
      if (body?.initializer && ts.isObjectLiteralExpression(body.initializer)) {
        return body.initializer;
      }
      return arg;
    }
  }
  return undefined;
}

export function findProperty(
  obj: ts.ObjectLiteralExpression,
  name: string,
): ts.PropertyAssignment | undefined {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const n = prop.name;
    if (ts.isIdentifier(n) && n.text === name) return prop;
    if (ts.isStringLiteral(n) && n.text === name) return prop;
  }
  return undefined;
}

function readStringProp(obj: ts.ObjectLiteralExpression, name: string): string | undefined {
  const p = findProperty(obj, name);
  if (!p?.initializer) return undefined;
  if (ts.isStringLiteral(p.initializer) || ts.isNoSubstitutionTemplateLiteral(p.initializer)) {
    return p.initializer.text;
  }
  return undefined;
}

function sliceExpression(content: string, start: number): string {
  let i = start;
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let inStr: string | null = null;
  while (i < content.length) {
    const ch = content[i]!;
    if (inStr) {
      if (ch === inStr && content[i - 1] !== '\\') inStr = null;
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
  return content.slice(start, i).trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Ensure named imports from a module exist (idempotent).
 */
export function ensureNamedImports(
  content: string,
  fileName: string,
  modulePath: string,
  names: string[],
): string {
  const sf = parseSource(fileName, content);
  const existing = new Set<string>();
  let targetImport: ts.ImportDeclaration | undefined;

  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (stmt.moduleSpecifier.text !== modulePath) continue;
    targetImport = stmt;
    const clause = stmt.importClause;
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) {
        existing.add(el.name.text);
      }
    }
  }

  const missing = names.filter(n => !existing.has(n));
  if (missing.length === 0) return content;

  if (targetImport) {
    // Append to existing named import via text edit
    const clause = targetImport.importClause;
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      const named = clause.namedBindings;
      const last = named.elements[named.elements.length - 1];
      const insertAt = last ? last.end : named.end - 1;
      const addition = (named.elements.length ? ', ' : '') + missing.join(', ');
      return content.slice(0, insertAt) + addition + content.slice(insertAt);
    }
  }

  const importLine = `import { ${names.join(', ')} } from ${JSON.stringify(modulePath)};\n`;
  // Insert after existing imports
  let insertPos = 0;
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) insertPos = stmt.end;
    else break;
  }
  // Skip trailing newline after last import
  if (content[insertPos] === '\n') insertPos++;
  return content.slice(0, insertPos) + importLine + content.slice(insertPos);
}

/**
 * Transform object-literal property values for a matching capability call.
 */
export function transformCapabilityPayload(
  content: string,
  fileName: string,
  capabilityId: string,
  mutate: (obj: ts.ObjectLiteralExpression, factory: ts.NodeFactory) => ts.ObjectLiteralExpression | undefined,
): string {
  const sf = parseSource(fileName, content);
  const transformer: ts.TransformerFactory<ts.SourceFile> = context => {
    const visit: ts.Visitor = node => {
      if (ts.isCallExpression(node) && callMatchesCapability(node, content, capabilityId)) {
        const args = node.arguments.map(arg => {
          if (!ts.isObjectLiteralExpression(arg)) return arg;
          // runManifestCommand body nesting
          const body = findProperty(arg, 'body');
          if (body?.initializer && ts.isObjectLiteralExpression(body.initializer)) {
            const nextBody = mutate(body.initializer, context.factory);
            if (!nextBody) return arg;
            const nextProps = arg.properties.map(p => {
              if (p === body) {
                return context.factory.updatePropertyAssignment(
                  body,
                  body.name,
                  nextBody,
                );
              }
              return p;
            });
            return context.factory.updateObjectLiteralExpression(arg, nextProps);
          }
          const next = mutate(arg, context.factory);
          return next ?? arg;
        });
        return context.factory.updateCallExpression(
          node,
          node.expression,
          node.typeArguments,
          args,
        );
      }
      return ts.visitEachChild(node, visit, context);
    };
    return node => ts.visitNode(node, visit) as ts.SourceFile;
  };

  const result = ts.transform(sf, [transformer]);
  const transformed = result.transformed[0]!;
  result.dispose();
  return printSource(transformed);
}
