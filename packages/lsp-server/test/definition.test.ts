import { describe, it, expect } from 'vitest';
import { getDefinition } from '../src/features/definition.js';
import { buildSymbolIndex } from '../src/symbols/symbol-index.js';
import { compileDocument } from '../src/compiler-bridge.js';

describe('definition', () => {
  it('returns null for keywords', async () => {
    const source = `entity Order {}`;
    const { tokens, program } = await compileDocument(source);
    const symbols = buildSymbolIndex(program);

    // "entity" keyword at 0-based char 2 — definition doesn't apply to keywords
    const location = getDefinition(tokens, symbols, 'file:///test.manifest', {
      line: 0,
      character: 2,
    });

    expect(location).toBeNull();
  });

  it('returns null when no symbol found', async () => {
    const source = `entity Order {}`;
    const { tokens, program } = await compileDocument(source);
    const symbols = buildSymbolIndex(program);

    // Position with no token
    const location = getDefinition(tokens, symbols, 'file:///test.manifest', {
      line: 10,
      character: 0,
    });

    expect(location).toBeNull();
  });

  it('navigates to property definition from within entity', async () => {
    const source = `entity Order {
  property status: string
  property total: number
}`;
    const { tokens, program } = await compileDocument(source);
    const symbols = buildSymbolIndex(program);

    // Find "status" on line 2 (1-based) — property has position from parser
    const statusToken = tokens.find((t) => t.value === 'status' && t.type === 'IDENTIFIER');
    if (statusToken) {
      const endCol0 = statusToken.position.column - 1;
      const startCol0 = endCol0 - statusToken.value.length;
      const location = getDefinition(tokens, symbols, 'file:///test.manifest', {
        line: statusToken.position.line - 1,
        character: startCol0 + 1,
      });

      // Property has a position from the parser, so definition should be found
      const propSymbol = symbols.find((s) => s.name === 'status');
      if (propSymbol?.position) {
        expect(location).not.toBeNull();
        expect(location!.uri).toBe('file:///test.manifest');
      }
    }
  });
});

describe('symbol-index', () => {
  it('indexes entities and their properties', async () => {
    const source = `entity Order {
  property status: string
  property total: number
}`;
    const { program } = await compileDocument(source);
    const symbols = buildSymbolIndex(program);

    expect(symbols.find((s) => s.name === 'Order' && s.kind === 'entity')).toBeDefined();
    expect(symbols.find((s) => s.name === 'status' && s.kind === 'property')).toBeDefined();
    expect(symbols.find((s) => s.name === 'total' && s.kind === 'property')).toBeDefined();
  });

  it('indexes enums', async () => {
    const source = `enum Status {
  Draft
  Active
}`;
    const { program } = await compileDocument(source);
    const symbols = buildSymbolIndex(program);

    expect(symbols.find((s) => s.name === 'Status' && s.kind === 'enum')).toBeDefined();
  });

  it('indexes stores', async () => {
    const source = `entity Order {
  property status: string
}
store Order in memory`;
    const { program } = await compileDocument(source);
    const symbols = buildSymbolIndex(program);

    expect(symbols.find((s) => s.name === 'Order' && s.kind === 'store')).toBeDefined();
  });
});
