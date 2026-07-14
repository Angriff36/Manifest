/**
 * Structured language metadata for Builder / editors.
 * Every field is derived from an existing authoritative source — never a second registry.
 */

import { DATE_TIME_TYPE_NAMES } from './date-time.js';
import type { IR } from './ir.js';
import { getLexerOperators, KEYWORDS } from './lexer.js';
import { PROPERTY_MODIFIERS, type PropertyModifier } from './property-modifiers.js';
import { RuntimeEngine } from './runtime-engine.js';

/** Relationship kinds that are lexer keywords and IR relationship kinds. */
const RELATIONSHIP_KINDS = ['hasMany', 'hasOne', 'belongsTo', 'ref'] as const;

/** Command-body / action constructs that are lexer keywords. */
const COMMAND_ACTION_CONSTRUCTS = [
  'guard',
  'when',
  'mutate',
  'emit',
  'publish',
  'persist',
  'compute',
  'returns',
  'async',
] as const;

/** Primitive / built-in type names that are lexer keywords. */
const KEYWORD_PRIMITIVE_TYPES = [
  'string',
  'number',
  'boolean',
  'list',
  'map',
  'any',
  'void',
  'decimal',
  'money',
] as const;

/** Top-level declaration constructs (lexer keywords). */
const TOP_LEVEL_CONSTRUCTS = [
  'entity',
  'enum',
  'command',
  'module',
  'policy',
  'store',
  'event',
  'saga',
  'tenant',
  'webhook',
  'use',
] as const;

export interface BuiltinMetadata {
  name: string;
}

export interface LanguageMetadata {
  /** Sorted reserved words from the lexer KEYWORDS set. */
  keywords: string[];
  /** Sorted operator tokens from the lexer. */
  operators: string[];
  /** Property modifiers from IR PropertyModifier / schema. */
  modifiers: readonly PropertyModifier[];
  /** Relationship kinds (subset of keywords, asserted). */
  relationshipKinds: string[];
  /** Command/action constructs (subset of keywords, asserted). */
  commandActionConstructs: string[];
  /** Top-level declaration constructs (subset of keywords, asserted). */
  topLevelConstructs: string[];
  /** Keyword primitive type names + date/time primitives from semantics. */
  primitiveTypes: string[];
  /** Core builtin function names from RuntimeEngine.getBuiltins(). */
  builtins: BuiltinMetadata[];
  /**
   * Hover/completion documentation identifiers — currently the keyword and
   * builtin names themselves. Builder/LSP resolve docs by these ids.
   */
  documentationIds: string[];
}

const EMPTY_IR: IR = {
  version: '1.0',
  provenance: {
    contentHash: 'language-metadata',
    compilerVersion: 'language-metadata',
    schemaVersion: '1.0',
    compiledAt: '1970-01-01T00:00:00.000Z',
  },
  modules: [],
  values: [],
  entities: [],
  enums: [],
  stores: [],
  events: [],
  commands: [],
  policies: [],
};

function assertKeywordSubset(label: string, names: readonly string[]): string[] {
  const missing = names.filter((n) => !KEYWORDS.has(n));
  if (missing.length > 0) {
    throw new Error(
      `language-metadata: ${label} entries missing from lexer KEYWORDS: ${missing.join(', ')}`,
    );
  }
  return [...names];
}

function listCoreBuiltinNames(): string[] {
  const engine = new RuntimeEngine(EMPTY_IR, {});
  return Object.keys(engine.getBuiltins()).sort();
}

/**
 * Authoritative language metadata for Builder editing/discovery.
 * Derive-only: keywords ← lexer, modifiers ← IR, builtins ← RuntimeEngine.
 */
export function getLanguageMetadata(): LanguageMetadata {
  const keywords = [...KEYWORDS].sort();
  const operators = [...getLexerOperators()];
  const relationshipKinds = assertKeywordSubset('relationshipKinds', RELATIONSHIP_KINDS);
  const commandActionConstructs = assertKeywordSubset(
    'commandActionConstructs',
    COMMAND_ACTION_CONSTRUCTS,
  );
  const topLevelConstructs = assertKeywordSubset('topLevelConstructs', TOP_LEVEL_CONSTRUCTS);
  const keywordPrimitives = assertKeywordSubset('primitiveTypes', KEYWORD_PRIMITIVE_TYPES);
  const primitiveTypes = [...keywordPrimitives, ...DATE_TIME_TYPE_NAMES].sort();
  const builtinNames = listCoreBuiltinNames();
  const builtins = builtinNames.map((name) => ({ name }));
  const documentationIds = [...new Set([...keywords, ...builtinNames])].sort();

  return {
    keywords,
    operators,
    modifiers: PROPERTY_MODIFIERS,
    relationshipKinds,
    commandActionConstructs,
    topLevelConstructs,
    primitiveTypes,
    builtins,
    documentationIds,
  };
}
