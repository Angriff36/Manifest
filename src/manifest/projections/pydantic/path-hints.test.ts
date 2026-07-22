import { describe, expect, it } from 'vitest';
import { pydanticCommandPathHint, pydanticEntityPathHint } from './path-hints.js';

describe('pydantic pathHints — per-module nesting', () => {
  it('keeps flat models/ paths when module is absent', () => {
    expect(pydanticEntityPathHint({ name: 'Order' })).toBe('models/Order.py');
    expect(pydanticCommandPathHint({ name: 'CreateOrder' })).toBe(
      'models/commands/CreateOrder.py',
    );
  });

  it('nests entity under models/<module>/ when module is set', () => {
    expect(pydanticEntityPathHint({ name: 'Order', module: 'billing' })).toBe(
      'models/billing/Order.py',
    );
  });

  it('nests command under models/<module>/commands/ when module is set', () => {
    expect(
      pydanticCommandPathHint({ name: 'CreateOrder', module: 'billing' }),
    ).toBe('models/billing/commands/CreateOrder.py');
  });

  it('sanitizes unsafe module segments', () => {
    expect(
      pydanticEntityPathHint({ name: 'Order', module: 'Billing / Ops!' }),
    ).toBe('models/Billing_Ops/Order.py');
  });

  it('treats blank module as flat', () => {
    expect(pydanticEntityPathHint({ name: 'Order', module: '   ' })).toBe(
      'models/Order.py',
    );
  });
});
