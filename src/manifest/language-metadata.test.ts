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

  it('documentation ids cover keywords and builtins', () => {
    const metadata = getLanguageMetadata();
    expect(metadata.documentationIds).toContain('entity');
    expect(metadata.documentationIds).toContain('uuid');
  });
});
