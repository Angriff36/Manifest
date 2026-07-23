import { describe, expect, it } from 'vitest';
import { dartCommandPathHint, dartEntityPathHint, dartSnakeCase } from './path-hints.js';

describe('dart pathHints — per-module nesting', () => {
  it('snake_cases PascalCase names', () => {
    expect(dartSnakeCase('CreateOrder')).toBe('create_order');
  });

  it('keeps flat lib/ paths when module is absent', () => {
    expect(dartEntityPathHint({ name: 'Order' })).toBe('lib/models/order.dart');
    expect(dartCommandPathHint({ name: 'CreateOrder' })).toBe(
      'lib/commands/create_order_params.dart',
    );
  });

  it('nests under lib/models|<commands>/<module>/ when module is set', () => {
    expect(dartEntityPathHint({ name: 'Order', module: 'billing' })).toBe(
      'lib/models/billing/order.dart',
    );
    expect(dartCommandPathHint({ name: 'CreateOrder', module: 'billing' })).toBe(
      'lib/commands/billing/create_order_params.dart',
    );
  });

  it('sanitizes unsafe module segments', () => {
    expect(dartEntityPathHint({ name: 'Order', module: 'Billing / Ops!' })).toBe(
      'lib/models/Billing_Ops/order.dart',
    );
  });

  it('treats blank module as flat', () => {
    expect(dartEntityPathHint({ name: 'Order', module: '   ' })).toBe('lib/models/order.dart');
  });
});
