import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATE_TIME_TYPE_NAMES } from './date-time.js';
import type { IR } from './ir.js';
import { getLexerOperators, KEYWORDS } from './lexer.js';
import { getLanguageMetadata } from './language-metadata.js';
import { PROPERTY_MODIFIERS } from './property-modifiers.js';
import { RuntimeEngine } from './runtime-engine.js';

const EMPTY_IR: IR = {
  version: '1.0',
  provenance: {
    contentHash: 'test',
    compilerVersion: 'test',
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

describe('getLanguageMetadata', () => {
  it('returns the lexer keyword set without a duplicated keyword list', () => {
    const metadata = getLanguageMetadata();

    expect(new Set(metadata.keywords)).toEqual(KEYWORDS);
    expect(metadata.keywords).toHaveLength(KEYWORDS.size);
    expect(metadata.keywords).toEqual([...metadata.keywords].sort());
  });

  it('returns lexer operators from the shared operator set', () => {
    expect(getLanguageMetadata().operators).toEqual([...getLexerOperators()]);
  });

  it('returns the IR property modifiers from their shared source of truth', () => {
    expect(getLanguageMetadata().modifiers).toEqual(PROPERTY_MODIFIERS);
    expect([...PROPERTY_MODIFIERS]).toContain('masked');
    expect([...PROPERTY_MODIFIERS]).toContain('searchable');
  });

  it('returns runtime builtin function names from RuntimeEngine.getBuiltins()', () => {
    const metadata = getLanguageMetadata();
    const live = Object.keys(new RuntimeEngine(EMPTY_IR, {}).getBuiltins()).sort();

    expect(metadata.builtins.map((b) => b.name)).toEqual(live);
    expect(metadata.builtins).toContainEqual(expect.objectContaining({ name: 'substring' }));
    expect(metadata.builtins).toContainEqual(expect.objectContaining({ name: 'roleAllows' }));
  });

  it('includes date/time primitives from date-time.ts plus keyword primitives', () => {
    const types = getLanguageMetadata().primitiveTypes;
    for (const name of DATE_TIME_TYPE_NAMES) {
      expect(types).toContain(name);
    }
    expect(types).toContain('string');
    expect(types).toContain('decimal');
  });

  it('exposes relationship kinds and command constructs that are lexer keywords', () => {
    const metadata = getLanguageMetadata();
    for (const kind of metadata.relationshipKinds) {
      expect(KEYWORDS.has(kind)).toBe(true);
    }
    for (const construct of metadata.commandActionConstructs) {
      expect(KEYWORDS.has(construct)).toBe(true);
    }
    expect(metadata.relationshipKinds).toEqual(['hasMany', 'hasOne', 'belongsTo', 'ref']);
  });

  it('categorized constructs cover the parser top-level dispatch', () => {
    // Every construct the parser accepts at the start of a top-level
    // declaration (parser.ts parseProgram loop). If a construct is added
    // there, this test forces the metadata to learn it.
    const PARSER_TOP_LEVEL_KEYWORDS = [
      'use',
      'module',
      'entity',
      'enum',
      'command',
      'flow',
      'effect',
      'expose',
      'compose',
      'policy',
      'store',
      'event',
      'on',
      'saga',
      'webhook',
    ];
    const PARSER_TOP_LEVEL_CONTEXTUAL = ['value', 'role', 'schedule', 'tenant'];

    const metadata = getLanguageMetadata();
    expect([...metadata.topLevelConstructs].sort()).toEqual(PARSER_TOP_LEVEL_KEYWORDS.sort());
    expect([...metadata.contextualTopLevelConstructs].sort()).toEqual(
      PARSER_TOP_LEVEL_CONTEXTUAL.sort(),
    );
    // Contextual constructs must NOT be reserved words (property names like
    // `property schedule: string` stay legal).
    for (const construct of metadata.contextualTopLevelConstructs) {
      expect(KEYWORDS.has(construct)).toBe(false);
    }
    // 'effect' is both a top-level declaration and a command action kind.
    expect(metadata.commandActionConstructs).toContain('effect');
  });

  it('contextual keywords match the parser source (no drift)', () => {
    // Derive the contextual-identifier set from parser.ts itself: every
    // token the parser matches as a contextual IDENTIFIER. Reserved words
    // are excluded (an IDENTIFIER check on a keyword is dead code — the
    // lexer already classified it as KEYWORD).
    const source = readFileSync(join(process.cwd(), 'src/manifest/parser.ts'), 'utf8');
    const found = new Set<string>();
    for (const re of [
      /check\('IDENTIFIER',\s*'([A-Za-z_]+)'\)/g,
      /type === 'IDENTIFIER' && \w+\.value === '([A-Za-z_]+)'/g,
      /current\(\)\?\.value === '([A-Za-z_]+)'/g,
    ]) {
      for (const m of source.matchAll(re)) found.add(m[1]);
    }
    const parserContextual = [...found].filter((id) => !KEYWORDS.has(id)).sort();
    expect(parserContextual.length).toBeGreaterThan(0);

    const metadata = getLanguageMetadata();
    expect([...metadata.contextualKeywords].sort()).toEqual(parserContextual);
    for (const id of metadata.contextualKeywords) {
      expect(KEYWORDS.has(id)).toBe(false);
    }
    for (const construct of metadata.contextualTopLevelConstructs) {
      expect(metadata.contextualKeywords).toContain(construct);
    }
  });

  it('property modifier registry is frozen against runtime mutation', () => {
    expect(Object.isFrozen(PROPERTY_MODIFIERS)).toBe(true);
  });

  it('documentation ids cover keywords and builtins', () => {
    const metadata = getLanguageMetadata();
    expect(metadata.documentationIds).toContain('entity');
    expect(metadata.documentationIds).toContain('uuid');
  });
});
