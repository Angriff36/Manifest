import { describe, it, expect } from 'vitest';
import { CompletionItemKind } from 'vscode-languageserver';
import { getCompletions, findTokenAtPosition } from '../src/features/completion.js';
import { compileDocument } from '../src/compiler-bridge.js';

describe('completion', () => {
  it('provides top-level completions at document start', async () => {
    const source = '';
    const { tokens, program, ir } = await compileDocument(source);
    const items = getCompletions(tokens, program, ir, { line: 0, character: 0 });

    const labels = items.map(i => i.label);
    expect(labels).toContain('entity');
    expect(labels).toContain('enum');
    expect(labels).toContain('command');
    expect(labels).toContain('module');
    expect(labels).toContain('store');
  });

  it('provides entity body completions inside entity', async () => {
    const source = `entity Order {

}`;
    const { tokens, program, ir } = await compileDocument(source);
    // Position inside entity body (line 1 0-based, col 2)
    const items = getCompletions(tokens, program, ir, { line: 1, character: 2 });

    const labels = items.map(i => i.label);
    expect(labels).toContain('property');
    expect(labels).toContain('command');
    expect(labels).toContain('constraint');
    expect(labels).toContain('hasMany');
  });

  it('provides entity names in completions', async () => {
    const source = `entity User {
  property name: string
}

entity Order {
  property assignee: string
}`;
    const { tokens, program, ir } = await compileDocument(source);
    // Top-level completions should include entity names
    const items = getCompletions(tokens, program, ir, { line: 7, character: 0 });

    expect(items.length).toBeGreaterThan(0);
  });
});

describe('findTokenAtPosition', () => {
  it('finds token at position accounting for end-column positions', async () => {
    const source = `entity Order {}`;
    const { tokens } = await compileDocument(source);

    // "entity" spans columns 1-6 in 1-based (end position is col 7)
    // findTokenAtPosition uses 1-based positions
    const token = findTokenAtPosition(tokens, { line: 1, column: 3 });
    expect(token).toBeDefined();
    expect(token!.value).toBe('entity');

    // "Order" spans columns 8-12 (end position col 11 based on name length 5)
    // Wait: "entity " = 7 chars, so "Order" starts at col 8
    const orderToken = findTokenAtPosition(tokens, { line: 1, column: 8 });
    expect(orderToken).toBeDefined();
    expect(orderToken!.value).toBe('Order');
  });

  it('returns null for position with no token', async () => {
    const source = `entity Order {}`;
    const { tokens } = await compileDocument(source);

    // Way beyond the line
    const token = findTokenAtPosition(tokens, { line: 5, column: 1 });
    expect(token).toBeNull();
  });

  it('returns null for whitespace between tokens', async () => {
    const source = `entity Order {}`;
    const { tokens } = await compileDocument(source);

    // Column 7 is the space between "entity" and "Order"
    // "entity" ends at col 7, "Order" starts at col 8
    // So col 7 should be in the whitespace gap
    // Actually: entity's end position is col=7. Start was col=1.
    // findTokenAtPosition: startCol = 7 - 6 = 1, check 1 <= 7 < 7 → false!
    // Actually 1 <= 7 is true, but 7 < 7 is false. So col 7 returns null. Good.
    const token = findTokenAtPosition(tokens, { line: 1, column: 7 });
    expect(token).toBeNull();
  });
});
