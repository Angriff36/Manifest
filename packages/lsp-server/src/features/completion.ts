import { CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import type { Position as LspPosition } from 'vscode-languageserver';
import type {
  Token,
  Position as ManifestPosition,
  ManifestProgram,
} from '@angriff36/manifest/types';
import type { IR } from '@angriff36/manifest/ir';
import { toManifestPosition } from '../position-utils.js';
import {
  TOP_LEVEL_COMPLETIONS,
  ENTITY_BODY_COMPLETIONS,
  TYPE_COMPLETIONS,
  MODIFIER_COMPLETIONS,
  POLICY_ACTION_COMPLETIONS,
  SEVERITY_COMPLETIONS,
  REF_ACTION_COMPLETIONS,
  COMMAND_BODY_COMPLETIONS,
  STORE_TARGET_COMPLETIONS,
  type CompletionBucket,
} from '../symbols/builtin-docs.js';

/**
 * Find the token at a given manifest position (1-based).
 * Exported for use by hover and definition.
 *
 * NOTE: The Manifest lexer records token.position as the **end** of the token
 * (column after the last character). So a token's start column is:
 *   startCol = token.position.column - token.value.length
 */
export function findTokenAtPosition(tokens: Token[], pos: ManifestPosition): Token | null {
  for (const token of tokens) {
    if (token.type === 'NEWLINE' || token.type === 'EOF') continue;
    const tLine = token.position.line;
    const tEndCol = token.position.column;
    const tStartCol = tEndCol - token.value.length;

    if (tLine === pos.line && tStartCol <= pos.column && pos.column < tEndCol) {
      return token;
    }
  }
  return null;
}

/**
 * Get the start column of a token (1-based).
 * The lexer records end positions, so we subtract the value length.
 */
export function tokenStartColumn(token: Token): number {
  return token.position.column - token.value.length;
}

/**
 * Determine completion context and return appropriate items.
 */
export function getCompletions(
  tokens: Token[],
  program: ManifestProgram,
  ir: IR | null,
  position: LspPosition,
): CompletionItem[] {
  const mPos = toManifestPosition(position);
  const context = classifyContext(tokens, mPos);

  const items: CompletionItem[] = [];

  switch (context.kind) {
    case 'top-level':
      items.push(...bucketToItems(TOP_LEVEL_COMPLETIONS));
      break;

    case 'entity-body':
      items.push(...bucketToItems(ENTITY_BODY_COMPLETIONS));
      break;

    case 'command-body':
      items.push(...bucketToItems(COMMAND_BODY_COMPLETIONS));
      break;

    case 'type':
      items.push(...bucketToItems(TYPE_COMPLETIONS));
      // Add entity names as type references
      addEntityNames(items, program);
      // Add enum names as type references
      addEnumNames(items, program);
      break;

    case 'modifier':
      items.push(...bucketToItems(MODIFIER_COMPLETIONS));
      break;

    case 'policy-action':
      items.push(...bucketToItems(POLICY_ACTION_COMPLETIONS));
      break;

    case 'severity':
      items.push(...bucketToItems(SEVERITY_COMPLETIONS));
      break;

    case 'ref-action':
      items.push(...bucketToItems(REF_ACTION_COMPLETIONS));
      break;

    case 'store-target':
      items.push(...bucketToItems(STORE_TARGET_COMPLETIONS));
      break;

    case 'member-access':
      if (context.objectName && ir) {
        addMemberCompletions(items, context.objectName, ir, program);
      }
      break;

    default:
      // Provide a broad set of completions
      items.push(...bucketToItems(TOP_LEVEL_COMPLETIONS));
      addEntityNames(items, program);
      addEnumNames(items, program);
      break;
  }

  return items;
}

interface CompletionContext {
  kind:
    | 'top-level'
    | 'entity-body'
    | 'command-body'
    | 'type'
    | 'modifier'
    | 'policy-action'
    | 'severity'
    | 'ref-action'
    | 'store-target'
    | 'member-access'
    | 'unknown';
  objectName?: string;
}

/**
 * Classify the cursor context by examining preceding tokens.
 */
function classifyContext(tokens: Token[], pos: ManifestPosition): CompletionContext {
  // Find the index of the cursor position
  const significantTokens = tokens.filter((t) => t.type !== 'NEWLINE' && t.type !== 'EOF');
  let cursorIdx = -1;

  for (let i = significantTokens.length - 1; i >= 0; i--) {
    const t = significantTokens[i];
    if (
      t.position.line < pos.line ||
      (t.position.line === pos.line && t.position.column + t.value.length <= pos.column)
    ) {
      cursorIdx = i;
      break;
    }
  }

  if (cursorIdx < 0) {
    return { kind: 'top-level' };
  }

  const prev = significantTokens[cursorIdx];

  // After a dot → member access
  if (prev.type === 'OPERATOR' && prev.value === '.') {
    const beforeDot = cursorIdx > 0 ? significantTokens[cursorIdx - 1] : null;
    if (beforeDot && (beforeDot.type === 'IDENTIFIER' || beforeDot.type === 'KEYWORD')) {
      return { kind: 'member-access', objectName: beforeDot.value };
    }
  }

  // After 'onDelete' or 'onUpdate' → ref action
  if (prev.type === 'KEYWORD' && (prev.value === 'onDelete' || prev.value === 'onUpdate')) {
    return { kind: 'ref-action' };
  }

  // After 'store' entity-name → store target
  if (prev.type === 'IDENTIFIER' && cursorIdx > 0) {
    const beforeIdent = significantTokens[cursorIdx - 1];
    if (beforeIdent.type === 'KEYWORD' && beforeIdent.value === 'store') {
      return { kind: 'store-target' };
    }
  }

  // After 'policy' name action → inside policy expression
  // After 'policy' name → policy action
  if (prev.type === 'IDENTIFIER' && cursorIdx > 0) {
    const beforeIdent = significantTokens[cursorIdx - 1];
    if (beforeIdent.type === 'KEYWORD' && beforeIdent.value === 'policy') {
      return { kind: 'policy-action' };
    }
  }

  // After property name with type → modifier position
  // Detect: we're after a type keyword in a property context
  const typeKeywords = new Set([
    'string',
    'number',
    'boolean',
    'decimal',
    'money',
    'list',
    'map',
    'any',
    'void',
  ]);
  if (prev.type === 'KEYWORD' && typeKeywords.has(prev.value)) {
    // Check if we're in a property declaration context (preceded by 'property name')
    if (cursorIdx >= 2) {
      const nameToken = significantTokens[cursorIdx - 1];
      const propKeyword = significantTokens[cursorIdx - 2];
      if (
        propKeyword.type === 'KEYWORD' &&
        propKeyword.value === 'property' &&
        nameToken.type === 'IDENTIFIER'
      ) {
        return { kind: 'modifier' };
      }
    }
    // Could be a type position itself — offer types
    return { kind: 'type' };
  }

  // Determine nesting level using brace counting
  const nesting = computeNesting(tokens, pos);

  if (nesting.inCommand) return { kind: 'command-body' };
  if (nesting.inEntity) return { kind: 'entity-body' };
  if (nesting.depth === 0) return { kind: 'top-level' };

  return { kind: 'unknown' };
}

interface NestingInfo {
  depth: number;
  inEntity: boolean;
  inCommand: boolean;
}

function computeNesting(tokens: Token[], pos: ManifestPosition): NestingInfo {
  let depth = 0;
  let entityDepth = -1;
  let commandDepth = -1;

  for (const token of tokens) {
    // Stop at cursor position
    if (
      token.position.line > pos.line ||
      (token.position.line === pos.line && token.position.column >= pos.column)
    ) {
      break;
    }

    if (token.type === 'KEYWORD' && token.value === 'entity' && depth === 0) {
      entityDepth = depth;
    }
    if (token.type === 'KEYWORD' && token.value === 'command') {
      commandDepth = depth;
    }

    if (token.type === 'PUNCTUATION' && token.value === '{') {
      depth++;
      if (entityDepth >= 0 && depth === entityDepth + 1) {
        entityDepth = depth;
      }
      if (commandDepth >= 0 && depth === commandDepth + 1) {
        commandDepth = depth;
      }
    }
    if (token.type === 'PUNCTUATION' && token.value === '}') {
      if (depth === entityDepth) entityDepth = -1;
      if (depth === commandDepth) commandDepth = -1;
      depth--;
    }
  }

  return {
    depth,
    inEntity: entityDepth >= 0 && depth >= entityDepth,
    inCommand: commandDepth >= 0 && depth >= commandDepth,
  };
}

function bucketToItems(bucket: CompletionBucket[]): CompletionItem[] {
  return bucket.map((b, i) => ({
    label: b.label,
    kind: b.kind,
    detail: b.detail,
    documentation: b.documentation,
    sortText: String(i).padStart(3, '0'),
  }));
}

function addEntityNames(items: CompletionItem[], program: ManifestProgram) {
  for (const entity of program.entities) {
    items.push({
      label: entity.name,
      kind: CompletionItemKind.Class,
      detail: 'entity',
    });
  }
  for (const mod of program.modules) {
    for (const entity of mod.entities) {
      items.push({
        label: entity.name,
        kind: CompletionItemKind.Class,
        detail: `entity (${mod.name})`,
      });
    }
  }
}

function addEnumNames(items: CompletionItem[], program: ManifestProgram) {
  for (const en of program.enums) {
    items.push({
      label: en.name,
      kind: CompletionItemKind.Enum,
      detail: 'enum',
    });
  }
  for (const mod of program.modules) {
    for (const en of mod.enums) {
      items.push({
        label: en.name,
        kind: CompletionItemKind.Enum,
        detail: `enum (${mod.name})`,
      });
    }
  }
}

function addMemberCompletions(
  items: CompletionItem[],
  objectName: string,
  ir: IR,
  _program: ManifestProgram,
) {
  // self. / this. → current entity properties (we suggest all entity properties)
  if (objectName === 'self' || objectName === 'this') {
    for (const entity of ir.entities) {
      for (const prop of entity.properties) {
        items.push({
          label: prop.name,
          kind: CompletionItemKind.Property,
          detail: `${prop.type.name} (${entity.name})`,
        });
      }
      for (const comp of entity.computedProperties ?? []) {
        items.push({
          label: comp.name,
          kind: CompletionItemKind.Property,
          detail: `computed (${entity.name})`,
        });
      }
    }
    return;
  }

  // user. → common user properties
  if (objectName === 'user') {
    for (const prop of ['id', 'role', 'email', 'name']) {
      items.push({ label: prop, kind: CompletionItemKind.Property, detail: 'user context' });
    }
    return;
  }

  // context. → generic context properties
  if (objectName === 'context') {
    for (const prop of ['tenantId', 'now', 'userId', 'role']) {
      items.push({ label: prop, kind: CompletionItemKind.Property, detail: 'context' });
    }
    return;
  }

  // Entity name → show properties of that entity
  const entity = ir.entities.find((e) => e.name === objectName);
  if (entity) {
    for (const prop of entity.properties) {
      items.push({
        label: prop.name,
        kind: CompletionItemKind.Property,
        detail: prop.type.name,
      });
    }
    // entity.commands is string[] (command names); resolve from top-level ir.commands
    for (const cmdName of entity.commands) {
      const fullCmd = ir.commands.find((c) => c.name === cmdName);
      items.push({
        label: cmdName,
        kind: CompletionItemKind.Function,
        detail: fullCmd
          ? `command(${fullCmd.parameters.map((p: { name: string }) => p.name).join(', ')})`
          : 'command',
      });
    }
  }
}
