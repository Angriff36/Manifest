/**
 * Extracts governed Manifest command invocations from application source.
 *
 * Adapted from codebase-explorer
 * `src/reconcile/featureCompleteness/manifestInvocationExtractor.ts`.
 */

import ts from 'typescript';
import { extractObjectFieldNames, scanObjectLiteralKeys } from './object-literal-keys.js';

export interface ManifestInvocation {
  entity: string;
  command: string;
  intent: string;
  bodyFields: string[];
  /** Approximate start index in source for line mapping. */
  index: number;
  /** Raw argument / body slice when available for mismatch analysis. */
  payloadSource: string;
}

export function extractAllManifestInvocations(content: string): ManifestInvocation[] {
  return [
    ...extractRunManifestCommandCalls(content),
    ...extractExecuteCommandCalls(content),
    ...extractRuntimeRunCommandCalls(content),
    ...extractApiManifestPosts(content),
    ...extractCommandArgLiteralsInManifestModules(content),
  ];
}

/**
 * Detect posts to `/api/manifest/{Entity}/commands/{command}` with a literal body.
 * e.g. apiPostJsonServer("/api/manifest/Dish/commands/update", { id, presentationImageUrl })
 */
export function extractApiManifestPosts(content: string): ManifestInvocation[] {
  const out: ManifestInvocation[] = [];
  const re =
    /(?:apiPostJsonServer|apiPostJson|fetch)\s*\(\s*["'`]\/api\/manifest\/([A-Za-z_][\w]*)\/commands\/([A-Za-z_][\w]*)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const entity = m[1]!;
    const command = m[2]!;
    const after = content.slice(m.index + m[0].length, m.index + m[0].length + 4000);
    const objOpen = after.indexOf('{');
    if (objOpen < 0) continue;
    // Skip options-only second arg that isn't a payload (rare); require object soon after comma.
    const between = after.slice(0, objOpen);
    if (!between.includes(',')) continue;
    const payload = extractBalancedBraces(after, objOpen);
    if (!payload) continue;
    out.push({
      entity,
      command,
      intent: `${entity}.${command}`,
      bodyFields: extractObjectFieldNames(payload),
      index: m.index,
      payloadSource: payload,
    });
  }
  return out;
}

function extractRunManifestCommandCalls(content: string): ManifestInvocation[] {
  const out: ManifestInvocation[] = [];
  const runManifest = /runManifestCommand\s*\(\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = runManifest.exec(content)) !== null) {
    const openBrace = m.index + m[0].length - 1;
    const block = extractBalancedBraces(content, openBrace);
    if (!block) continue;
    const entity = readStringProp(block, 'entity');
    const command = readStringProp(block, 'command');
    if (!entity || !command) continue;
    const { payloadSource, bodyFields } = extractRunManifestBody(block);
    out.push({
      entity,
      command,
      intent: `${entity}.${command}`,
      bodyFields,
      index: m.index,
      payloadSource,
    });
  }
  return out;
}

/**
 * Isolate the `body` property value from a runManifestCommand options object.
 * Literal `{ … }` → fields extracted. Helper / identifier / other expression →
 * expression text with empty fields (never fall back to outer option keys).
 */
export function extractRunManifestBody(optionsBlock: string): {
  payloadSource: string;
  bodyFields: string[];
} {
  const bodyKey = scanObjectLiteralKeys(optionsBlock).find((k) => k.name === 'body');
  if (!bodyKey) {
    return { payloadSource: '', bodyFields: [] };
  }
  const payloadSource = optionsBlock.slice(bodyKey.valueStart, bodyKey.valueEnd).trim();
  if (payloadSource.startsWith('{') && payloadSource.endsWith('}')) {
    return {
      payloadSource,
      bodyFields: extractObjectFieldNames(payloadSource),
    };
  }
  return { payloadSource, bodyFields: [] };
}

function extractExecuteCommandCalls(content: string): ManifestInvocation[] {
  const out: ManifestInvocation[] = [];
  const execute = /executeCommand(?:<[^>]*>)?\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = execute.exec(content)) !== null) {
    const entity = m[1]!;
    const command = m[2]!;
    const after = content.slice(m.index + m[0].length, m.index + m[0].length + 2000);
    const objOpen = after.indexOf('{');
    const payload = objOpen >= 0 ? extractBalancedBraces(after, objOpen) : after;
    out.push({
      entity,
      command,
      intent: `${entity}.${command}`,
      bodyFields: extractObjectFieldNames(payload),
      index: m.index,
      payloadSource: payload,
    });
  }
  return out;
}

function extractRuntimeRunCommandCalls(content: string): ManifestInvocation[] {
  const out: ManifestInvocation[] = [];
  const runCommand = /\w+\.runCommand\s*\(\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = runCommand.exec(content)) !== null) {
    const command = m[1]!;
    const tailStart = m.index + m[0].length;
    const tail = content.slice(tailStart, tailStart + 800);
    const entityName = readStringProp(tail, 'entityName');
    if (!entityName) continue;
    out.push({
      entity: entityName,
      command,
      intent: `${entityName}.${command}`,
      bodyFields: extractObjectFieldNames(tail),
      index: m.index,
      payloadSource: tail,
    });
  }
  return out;
}

/**
 * When a module uses runManifestCommand with a variable `command` (shorthand),
 * recover command names from string-literal arguments to local *Command helpers,
 * e.g. `runLifecycleCommand(menuId, "markPublished", …)` alongside `entity: "Menu"`.
 *
 * Uses TypeScript AST call-argument inspection — never a broad paren/string regex —
 * so FormData keys like `text(formData, "title")` are not mistaken for commands.
 */
function extractCommandArgLiteralsInManifestModules(content: string): ManifestInvocation[] {
  if (!/runManifestCommand\s*\(/.test(content)) return [];
  const entities = [...content.matchAll(/\bentity\s*:\s*["']([^"']+)["']/g)].map((m) => m[1]!);
  if (entities.length === 0) return [];

  const sf = ts.createSourceFile(
    'module.ts',
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const out: ManifestInvocation[] = [];
  const seen = new Set<string>();

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      collectCommandArgIntents(node, entities, sf, seen, out);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function collectCommandArgIntents(
  node: ts.CallExpression,
  entities: string[],
  sf: ts.SourceFile,
  seen: Set<string>,
  out: ManifestInvocation[],
): void {
  const calleeName = callCalleeName(node.expression);
  // Intended helpers: runLifecycleCommand / *Command — not text()/csv()/etc.
  if (!calleeName || !/Command$/.test(calleeName) || calleeName === 'runManifestCommand') {
    return;
  }
  for (let i = 1; i < node.arguments.length; i++) {
    const arg = node.arguments[i]!;
    if (!ts.isStringLiteral(arg) && !ts.isNoSubstitutionTemplateLiteral(arg)) continue;
    const command = arg.text;
    if (!isPlausibleCommandLiteral(command)) continue;
    for (const entity of entities) {
      const intent = `${entity}.${command}`;
      if (seen.has(intent)) continue;
      seen.add(intent);
      out.push({
        entity,
        command,
        intent,
        bodyFields: [],
        index: arg.getStart(sf),
        payloadSource: '',
      });
    }
  }
}

function callCalleeName(expr: ts.Expression): string | undefined {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.name)) {
    return expr.name.text;
  }
  return undefined;
}

function isPlausibleCommandLiteral(command: string): boolean {
  // Commands are camelCase identifiers starting with a lowercase letter.
  if (!/^[a-z][\w]*$/.test(command)) return false;
  return !(
    command === 'use' ||
    command === 'server' ||
    command === 'draft' ||
    command === 'published' ||
    command === 'archived'
  );
}

/**
 * Detect generated Manifest client calls: entityCommandCamel(...)
 * e.g. recipeVersionSetPackaging(...) for RecipeVersion.setPackaging
 *
 * Builds a single reverse index (fn → intent) so large contracts stay O(files × hits),
 * not O(files × capabilities).
 */
export function extractGeneratedClientCalls(
  content: string,
  capabilityIds: ReadonlySet<string>,
  fnIndex?: Map<string, { entity: string; command: string; intent: string }>,
): ManifestInvocation[] {
  const index = fnIndex ?? buildClientFunctionIndex(capabilityIds);
  const out: ManifestInvocation[] = [];
  // Match camelCase identifiers that look like client fns, then filter via index
  const re = /\b([a-z][A-Za-z0-9]*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const fn = m[1]!;
    const hit = index.get(fn);
    if (!hit) continue;
    const openParen = m.index + m[0].length - 1;
    const args = extractBalancedParens(content, openParen);
    const objOpen = args.indexOf('{');
    const payload = objOpen >= 0 ? extractBalancedBraces(args, objOpen) : args;
    out.push({
      entity: hit.entity,
      command: hit.command,
      intent: hit.intent,
      bodyFields: extractObjectFieldNames(payload),
      index: m.index,
      payloadSource: payload,
    });
  }
  return out;
}

export function buildClientFunctionIndex(
  capabilityIds: ReadonlySet<string>,
): Map<string, { entity: string; command: string; intent: string }> {
  const index = new Map<string, { entity: string; command: string; intent: string }>();
  for (const intent of capabilityIds) {
    const [entity, command] = intent.split('.');
    if (!entity || !command) continue;
    index.set(clientFunctionName(entity, command), { entity, command, intent });
  }
  return index;
}

export function clientFunctionName(entity: string, command: string): string {
  return (
    entity.charAt(0).toLowerCase() +
    entity.slice(1) +
    command.charAt(0).toUpperCase() +
    command.slice(1)
  );
}

export function readStringProp(block: string, key: string): string | undefined {
  const re = new RegExp(`\\b${escapeRegExp(key)}\\s*:\\s*["']([^"']+)["']`);
  return re.exec(block)?.[1];
}

export function extractBalancedBraces(content: string, openIndex: number): string {
  if (content[openIndex] !== '{') return '';
  let depth = 0;
  for (let i = openIndex; i < content.length; i++) {
    const ch = content[i]!;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return content.slice(openIndex, i + 1);
    }
  }
  return '';
}

export function extractBalancedParens(content: string, openIndex: number): string {
  if (content[openIndex] !== '(') return '';
  let depth = 0;
  for (let i = openIndex; i < content.length; i++) {
    const ch = content[i]!;
    if (ch === '(') depth++;
    if (ch === ')') {
      depth--;
      if (depth === 0) return content.slice(openIndex, i + 1);
    }
  }
  return '';
}

export {
  extractObjectFieldNames,
  objectLiteralHasKey,
  readObjectLiteralFieldExpression,
  scanObjectLiteralKeys,
} from './object-literal-keys.js';
export type { ObjectLiteralKey } from './object-literal-keys.js';

export function lineAtIndex(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
