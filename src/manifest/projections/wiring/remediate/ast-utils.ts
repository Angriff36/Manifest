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
  const kind =
    fileName.endsWith('.tsx') || fileName.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
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
    found =
      extractFromCapabilityCall(node, content, parameter, capabilityId, sf) ??
      extractFromBareObjectLiteral(node, parameter, capabilityId, sf);
    if (found) return;
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

function extractFromCapabilityCall(
  node: ts.Node,
  content: string,
  parameter: string,
  capabilityId: string | undefined,
  sf: ts.SourceFile,
): string | undefined {
  if (!capabilityId || !ts.isCallExpression(node)) return undefined;
  if (!callMatchesCapability(node, content, capabilityId)) return undefined;
  const obj = findPayloadObject(node);
  if (!obj) return undefined;
  const prop = findProperty(obj, parameter);
  return prop?.initializer?.getText(sf);
}

function extractFromBareObjectLiteral(
  node: ts.Node,
  parameter: string,
  capabilityId: string | undefined,
  sf: ts.SourceFile,
): string | undefined {
  if (capabilityId || !ts.isObjectLiteralExpression(node)) return undefined;
  const prop = findProperty(node, parameter);
  return prop?.initializer?.getText(sf);
}

export function callMatchesCapability(
  node: ts.CallExpression,
  _content: string,
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
  // Other wrappers that pass { entity, command, … } on the call itself —
  // never match from nearby text (that falsely hits requireCurrentUser() etc.).
  const arg0 = node.arguments[0];
  if (arg0 && ts.isObjectLiteralExpression(arg0)) {
    const e = readStringProp(arg0, 'entity');
    const c = readStringProp(arg0, 'command');
    if (e === entity && c === command) return true;
  }
  return false;
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
  const depth = { paren: 0, brace: 0, bracket: 0 };
  let inStr: string | null = null;
  while (i < content.length) {
    const ch = content[i]!;
    if (inStr !== null) {
      if (ch === inStr && content[i - 1] !== '\\') inStr = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      i++;
      continue;
    }
    if (shouldEndExpressionSlice(ch, depth)) break;
    applyExpressionDepth(ch, depth);
    i++;
  }
  return content.slice(start, i).trim();
}

function isFlatDepth(depth: { paren: number; brace: number; bracket: number }): boolean {
  return depth.paren === 0 && depth.brace === 0 && depth.bracket === 0;
}

function shouldEndExpressionSlice(
  ch: string,
  depth: { paren: number; brace: number; bracket: number },
): boolean {
  if (ch === '}' && isFlatDepth(depth)) return true;
  return (ch === ',' || ch === '}') && isFlatDepth(depth);
}

function applyExpressionDepth(
  ch: string,
  depth: { paren: number; brace: number; bracket: number },
): void {
  if (ch === '(') depth.paren++;
  else if (ch === ')') depth.paren--;
  else if (ch === '{') depth.brace++;
  else if (ch === '}') depth.brace--;
  else if (ch === '[') depth.bracket++;
  else if (ch === ']') depth.bracket--;
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

  const missing = names.filter((n) => !existing.has(n));
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
  // Insert after "use server" / "use client" and existing imports
  let insertPos = 0;
  const directive = /^["']use (?:server|client)["']\s*;?\s*\n/;
  const dirMatch = directive.exec(content);
  if (dirMatch) insertPos = dirMatch[0].length;

  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) {
      insertPos = Math.max(insertPos, stmt.end);
    } else if (ts.isExpressionStatement(stmt)) {
      // "use server" as expression statement
      const text = stmt.getText(sf);
      if (/^["']use (?:server|client)["']/.test(text)) {
        insertPos = Math.max(insertPos, stmt.end);
      }
    } else {
      break;
    }
  }
  // Skip trailing newline after last import / directive
  if (content[insertPos] === '\n') insertPos++;
  // If we landed before "use server" somehow, force after directive
  if (dirMatch && insertPos < dirMatch[0].length) {
    insertPos = dirMatch[0].length;
  }
  return content.slice(0, insertPos) + importLine + content.slice(insertPos);
}

type PayloadMutator = (
  obj: ts.ObjectLiteralExpression,
  factory: ts.NodeFactory,
) => ts.ObjectLiteralExpression | undefined;

/**
 * Transform object-literal property values for a matching capability call.
 */
export function transformCapabilityPayload(
  content: string,
  fileName: string,
  capabilityId: string,
  mutate: PayloadMutator,
): string {
  const sf = parseSource(fileName, content);
  const transformer = createPayloadTransformer(content, capabilityId, mutate);
  const result = ts.transform(sf, [transformer]);
  const transformed = result.transformed[0]!;
  result.dispose();
  return printSource(transformed);
}

function createPayloadTransformer(
  content: string,
  capabilityId: string,
  mutate: PayloadMutator,
): ts.TransformerFactory<ts.SourceFile> {
  return (context) => {
    const visit: ts.Visitor = (node) => {
      if (ts.isCallExpression(node) && callMatchesCapability(node, content, capabilityId)) {
        const args = node.arguments.map((arg) =>
          rewritePayloadArgument(arg, mutate, context.factory),
        );
        return context.factory.updateCallExpression(
          node,
          node.expression,
          node.typeArguments,
          args,
        );
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (node) => ts.visitNode(node, visit) as ts.SourceFile;
  };
}

function rewritePayloadArgument(
  arg: ts.Expression,
  mutate: PayloadMutator,
  factory: ts.NodeFactory,
): ts.Expression {
  if (!ts.isObjectLiteralExpression(arg)) return arg;
  // runManifestCommand body nesting
  const body = findProperty(arg, 'body');
  if (body?.initializer && ts.isObjectLiteralExpression(body.initializer)) {
    const nextBody = mutate(body.initializer, factory);
    if (!nextBody) return arg;
    return factory.updateObjectLiteralExpression(
      arg,
      replacePropertyAssignment(arg.properties, body, nextBody, factory),
    );
  }
  return mutate(arg, factory) ?? arg;
}

function replacePropertyAssignment(
  properties: ts.NodeArray<ts.ObjectLiteralElementLike>,
  target: ts.PropertyAssignment,
  nextInitializer: ts.Expression,
  factory: ts.NodeFactory,
): ts.ObjectLiteralElementLike[] {
  return properties.map((p) =>
    p === target ? factory.updatePropertyAssignment(target, target.name, nextInitializer) : p,
  );
}
