import {
  CompletionItem,
  CompletionItemKind,
} from 'vscode-languageserver/node';
import type { ManifestProgram } from '@angriff36/manifest/compiler';
import { SUPPORTED_TYPE_COMPLETIONS } from './semantic-diagnostics';

/**
 * All Manifest keywords, grouped by category for completion.
 * Source of truth: src/manifest/lexer.ts KEYWORDS
 */
const DECLARATION_KEYWORDS = [
  'entity', 'property', 'command', 'module', 'policy', 'store', 'event',
  'computed', 'derived', 'constraint', 'behavior', 'flow', 'effect',
  'expose', 'compose', 'enum', 'tenant', 'role', 'approval',
];

const CONTROL_KEYWORDS = [
  'on', 'when', 'then', 'guard', 'returns', 'transition',
  'async', 'use', 'run', 'resolve', 'params', 'stages', 'timeout', 'extends',
];

const ACTION_KEYWORDS = ['emit', 'mutate', 'compute', 'publish', 'persist'];

const RELATIONSHIP_KEYWORDS = ['hasMany', 'hasOne', 'belongsTo', 'ref', 'through'];

const PREPOSITION_KEYWORDS = ['as', 'from', 'to', 'with', 'where', 'connect'];

const TYPE_KEYWORDS = [...SUPPORTED_TYPE_COMPLETIONS];

const MODIFIER_KEYWORDS = ['required', 'unique', 'indexed', 'private', 'readonly', 'optional'];

const ACCESS_KEYWORDS = ['read', 'write', 'delete', 'execute', 'all', 'override', 'allow', 'deny'];

const STORE_KEYWORDS = ['memory', 'postgres', 'supabase', 'localStorage'];

const SEVERITY_KEYWORDS = ['ok', 'warn', 'block', 'overrideable'];

const MISC_KEYWORDS = [
  'default', 'timestamps', 'key', 'fields', 'references',
  'onDelete', 'onUpdate', 'cascade', 'restrict', 'setNull', 'setDefault', 'noAction',
  'versionProperty', 'versionAtProperty',
  'cache', 'request', 'session', 'ttl',
];

const CONSTANT_KEYWORDS = ['true', 'false', 'null'];

const LOGICAL_KEYWORDS = ['and', 'or', 'not', 'is', 'in', 'contains'];

const CONTEXT_KEYWORDS = ['user', 'self', 'context'];

function keywordItem(word: string, kind: CompletionItemKind): CompletionItem {
  return { label: word, kind };
}

export function getCompletions(program: ManifestProgram): CompletionItem[] {
  const items: CompletionItem[] = [];

  // Keywords
  for (const kw of DECLARATION_KEYWORDS) items.push(keywordItem(kw, CompletionItemKind.Keyword));
  for (const kw of CONTROL_KEYWORDS) items.push(keywordItem(kw, CompletionItemKind.Keyword));
  for (const kw of ACTION_KEYWORDS) items.push(keywordItem(kw, CompletionItemKind.Keyword));
  for (const kw of RELATIONSHIP_KEYWORDS) items.push(keywordItem(kw, CompletionItemKind.Keyword));
  for (const kw of PREPOSITION_KEYWORDS) items.push(keywordItem(kw, CompletionItemKind.Keyword));
  for (const kw of MODIFIER_KEYWORDS) items.push(keywordItem(kw, CompletionItemKind.Keyword));
  for (const kw of ACCESS_KEYWORDS) items.push(keywordItem(kw, CompletionItemKind.Keyword));
  for (const kw of STORE_KEYWORDS) items.push(keywordItem(kw, CompletionItemKind.Keyword));
  for (const kw of SEVERITY_KEYWORDS) items.push(keywordItem(kw, CompletionItemKind.Keyword));
  for (const kw of MISC_KEYWORDS) items.push(keywordItem(kw, CompletionItemKind.Keyword));
  for (const kw of LOGICAL_KEYWORDS) items.push(keywordItem(kw, CompletionItemKind.Operator));
  for (const kw of CONSTANT_KEYWORDS) items.push(keywordItem(kw, CompletionItemKind.Constant));
  for (const kw of CONTEXT_KEYWORDS) items.push(keywordItem(kw, CompletionItemKind.Variable));

  // Types
  for (const kw of TYPE_KEYWORDS) items.push(keywordItem(kw, CompletionItemKind.TypeParameter));

  // Entity names from AST
  const allEntities = [
    ...program.entities,
    ...program.modules.flatMap((m) => m.entities),
  ];
  for (const entity of allEntities) {
    items.push({
      label: entity.name,
      kind: CompletionItemKind.Class,
      detail: 'entity',
    });
  }

  // Enum names from AST
  const allEnums = [
    ...program.enums,
    ...program.modules.flatMap((m) => m.enums),
  ];
  for (const en of allEnums) {
    items.push({
      label: en.name,
      kind: CompletionItemKind.Enum,
      detail: 'enum',
    });
  }

  return items;
}
