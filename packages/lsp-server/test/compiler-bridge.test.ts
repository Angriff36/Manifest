import { describe, it, expect } from 'vitest';
import { compileDocument, KEYWORDS } from '../src/compiler-bridge.js';

describe('compiler-bridge', () => {
  it('compiles a valid manifest source', async () => {
    const source = `entity Order {
  property status: string
  property total: number
}`;
    const result = await compileDocument(source);

    expect(result.tokens.length).toBeGreaterThan(0);
    expect(result.program.entities).toHaveLength(1);
    expect(result.program.entities[0].name).toBe('Order');
    expect(result.parseErrors).toHaveLength(0);
    expect(result.ir).not.toBeNull();
    expect(result.irDiagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('returns parse errors for invalid source', async () => {
    const source = `entity {`;
    const result = await compileDocument(source);

    expect(result.parseErrors.length).toBeGreaterThan(0);
  });

  it('exports KEYWORDS set', () => {
    expect(KEYWORDS).toBeInstanceOf(Set);
    expect(KEYWORDS.has('entity')).toBe(true);
    expect(KEYWORDS.has('command')).toBe(true);
    expect(KEYWORDS.has('notAKeyword')).toBe(false);
  });

  it('tokens have end-positions (lexer convention)', async () => {
    const source = `entity Foo {}`;
    const result = await compileDocument(source);

    const entityToken = result.tokens.find((t) => t.value === 'entity');
    expect(entityToken).toBeDefined();
    expect(entityToken!.position.line).toBe(1);
    // Lexer records END position: "entity" is 6 chars, starts at col 1, end = col 7
    expect(entityToken!.position.column).toBe(7);

    const fooToken = result.tokens.find((t) => t.value === 'Foo');
    expect(fooToken).toBeDefined();
    expect(fooToken!.position.line).toBe(1);
    // "Foo" starts at col 8, end = col 11
    expect(fooToken!.position.column).toBe(11);
  });

  it('compiles IR with entities and properties', async () => {
    const source = `entity Order {
  property status: string
}`;
    const result = await compileDocument(source);

    expect(result.ir).not.toBeNull();
    expect(result.ir!.entities).toHaveLength(1);
    expect(result.ir!.entities[0].name).toBe('Order');
    expect(result.ir!.entities[0].properties).toHaveLength(1);
    expect(result.ir!.entities[0].properties[0].name).toBe('status');
  });
});
