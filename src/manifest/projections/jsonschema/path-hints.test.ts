import { describe, expect, it } from 'vitest';
import { jsonSchemaEntityPathHint } from './path-hints.js';
import { moduleDirSegment } from '../shared/module-path.js';

describe('jsonschema pathHints — per-module nesting', () => {
  it('keeps flat schemas/ paths when module is absent', () => {
    expect(jsonSchemaEntityPathHint({ name: 'Order' })).toBe('schemas/Order.schema.json');
  });

  it('nests under schemas/<module>/ when module is set', () => {
    expect(jsonSchemaEntityPathHint({ name: 'Order', module: 'billing' })).toBe(
      'schemas/billing/Order.schema.json',
    );
  });

  it('sanitizes unsafe module segments', () => {
    expect(moduleDirSegment('Billing / Ops!')).toBe('Billing_Ops');
    expect(
      jsonSchemaEntityPathHint({ name: 'Order', module: 'Billing / Ops!' }),
    ).toBe('schemas/Billing_Ops/Order.schema.json');
  });

  it('treats blank module as flat', () => {
    expect(jsonSchemaEntityPathHint({ name: 'Order', module: '   ' })).toBe(
      'schemas/Order.schema.json',
    );
  });
});
