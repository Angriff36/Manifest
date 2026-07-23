import { describe, expect, it } from 'vitest';
import { mermaidErPathHint, mermaidSequencePathHint, mermaidStatePathHint } from './path-hints.js';

describe('mermaid pathHints — per-module nesting', () => {
  it('keeps ER diagram at the historical flat path', () => {
    expect(mermaidErPathHint()).toBe('diagrams/er-diagram.mmd');
  });

  it('keeps flat diagrams/ paths when module is absent', () => {
    expect(mermaidStatePathHint({ entityName: 'Order' })).toBe('diagrams/state-Order.mmd');
    expect(
      mermaidSequencePathHint({
        entityName: 'Order',
        commandName: 'create',
      }),
    ).toBe('diagrams/sequence-Order-create.mmd');
  });

  it('nests state/sequence under diagrams/<module>/ when module is set', () => {
    expect(mermaidStatePathHint({ entityName: 'Order', module: 'billing' })).toBe(
      'diagrams/billing/state-Order.mmd',
    );
    expect(
      mermaidSequencePathHint({
        entityName: 'Order',
        commandName: 'create',
        module: 'billing',
      }),
    ).toBe('diagrams/billing/sequence-Order-create.mmd');
  });

  it('sanitizes unsafe module segments', () => {
    expect(mermaidStatePathHint({ entityName: 'Order', module: 'Billing / Ops!' })).toBe(
      'diagrams/Billing_Ops/state-Order.mmd',
    );
  });

  it('treats blank module as flat', () => {
    expect(mermaidStatePathHint({ entityName: 'Order', module: '   ' })).toBe(
      'diagrams/state-Order.mmd',
    );
  });
});
