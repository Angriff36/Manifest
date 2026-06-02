import { describe, it, expect } from 'vitest';
import { getHover } from '../src/features/hover.js';
import { compileDocument } from '../src/compiler-bridge.js';

describe('hover', () => {
  it('shows documentation for keywords', async () => {
    const source = `entity Order {}`;
    const { tokens, ir } = await compileDocument(source);

    // "entity" is at columns 1-6 (1-based end-position = 7)
    // LSP 0-based: cols 0-5. character: 2 → in the middle of "entity"
    const hover = getHover(tokens, ir, { line: 0, character: 2 });

    expect(hover).not.toBeNull();
    expect(hover!.contents).toBeDefined();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain('entity');
    expect(value).toContain('keyword');
  });

  it('shows entity info for identifiers', async () => {
    const source = `entity Order {
  property status: string
  property total: number
}`;
    const { tokens, ir } = await compileDocument(source);

    // "Order" starts at col 8 (1-based), ends at col 12, end-position col=13
    // LSP 0-based: cols 7-11. character: 8 → in the middle of "Order"
    const hover = getHover(tokens, ir, { line: 0, character: 8 });

    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain('Order');
    expect(value).toContain('entity');
    expect(value).toContain('status');
    expect(value).toContain('total');
  });

  it('shows enum info', async () => {
    const source = `enum Status {
  Draft
  Active
}`;
    const { tokens, ir } = await compileDocument(source);

    // "Status" starts at col 6 (1-based), end-position col=12
    // LSP 0-based: cols 5-10. character: 6 → in the middle of "Status"
    const hover = getHover(tokens, ir, { line: 0, character: 6 });

    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain('Status');
    expect(value).toContain('Draft');
    expect(value).toContain('Active');
  });

  it('returns null for whitespace positions', async () => {
    const source = `entity Order {}`;
    const { tokens, ir } = await compileDocument(source);

    // "entity" occupies 0-based cols 0-5, "Order" occupies cols 7-11
    // Col 6 is the space between them
    const hover = getHover(tokens, ir, { line: 0, character: 6 });
    expect(hover).toBeNull();
  });

  it('returns null for position beyond content', async () => {
    const source = `entity Order {}`;
    const { tokens, ir } = await compileDocument(source);

    // Line 5 doesn't exist
    const hover = getHover(tokens, ir, { line: 5, character: 0 });
    expect(hover).toBeNull();
  });
});
