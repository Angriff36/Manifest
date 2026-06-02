import { describe, it, expect } from 'vitest';
import { SymbolKind } from 'vscode-languageserver';
import { getDocumentSymbols } from '../src/features/document-symbols.js';
import { compileDocument } from '../src/compiler-bridge.js';

describe('document-symbols', () => {
  it('returns entity symbols with property children', async () => {
    const source = `entity Order {
  property status: string
  property total: number
}`;
    const { program } = await compileDocument(source);
    const symbols = getDocumentSymbols(program);

    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe('Order');
    expect(symbols[0].kind).toBe(SymbolKind.Class);
    expect(symbols[0].children).toBeDefined();
    expect(symbols[0].children!.length).toBeGreaterThanOrEqual(2);

    const propSymbol = symbols[0].children!.find(s => s.name === 'status');
    expect(propSymbol).toBeDefined();
    expect(propSymbol!.kind).toBe(SymbolKind.Property);
  });

  it('returns enum symbols', async () => {
    const source = `enum Status {
  Draft
  Active
  Archived
}`;
    const { program } = await compileDocument(source);
    const symbols = getDocumentSymbols(program);

    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe('Status');
    expect(symbols[0].kind).toBe(SymbolKind.Enum);
    expect(symbols[0].children).toHaveLength(3);
  });

  it('returns store symbols', async () => {
    const source = `entity Order {
  property title: string
}
store Order in memory`;
    const { program } = await compileDocument(source);
    const symbols = getDocumentSymbols(program);

    // Should have entity + store
    expect(symbols.length).toBeGreaterThanOrEqual(2);
    const storeSymbol = symbols.find(s => s.name === 'Order' && s.kind === SymbolKind.Module);
    expect(storeSymbol).toBeDefined();
  });

  it('handles empty programs', async () => {
    const { program } = await compileDocument('');
    const symbols = getDocumentSymbols(program);
    expect(symbols).toHaveLength(0);
  });

  it('returns multiple entity symbols', async () => {
    const source = `entity User {
  property name: string
}
entity Order {
  property total: number
}`;
    const { program } = await compileDocument(source);
    const symbols = getDocumentSymbols(program);

    expect(symbols).toHaveLength(2);
    expect(symbols[0].name).toBe('User');
    expect(symbols[1].name).toBe('Order');
  });
});
