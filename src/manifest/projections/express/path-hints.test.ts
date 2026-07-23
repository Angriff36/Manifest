import { describe, expect, it } from 'vitest';
import {
  expressEntityRoutePathHint,
  expressEntityTypesPathHint,
  expressManifestRouterPathHint,
  expressManifestTypesPathHint,
} from './path-hints.js';

describe('express pathHints — per-module nesting', () => {
  it('keeps monolith artifacts at historical flat paths', () => {
    expect(expressManifestRouterPathHint()).toBe('routes/manifest-router.ts');
    expect(expressManifestTypesPathHint()).toBe('types/manifest-types.ts');
  });

  it('keeps flat routes/types paths when module is absent', () => {
    expect(expressEntityRoutePathHint({ entityName: 'Order' })).toBe('routes/order.ts');
    expect(expressEntityTypesPathHint({ entityName: 'Order' })).toBe('types/order.ts');
  });

  it('nests under routes|types/<module>/ when module is set', () => {
    expect(expressEntityRoutePathHint({ entityName: 'Order', module: 'billing' })).toBe(
      'routes/billing/order.ts',
    );
    expect(expressEntityTypesPathHint({ entityName: 'Order', module: 'billing' })).toBe(
      'types/billing/order.ts',
    );
  });

  it('sanitizes unsafe module segments', () => {
    expect(
      expressEntityRoutePathHint({
        entityName: 'Order',
        module: 'Billing / Ops!',
      }),
    ).toBe('routes/Billing_Ops/order.ts');
  });

  it('treats blank module as flat', () => {
    expect(expressEntityRoutePathHint({ entityName: 'Order', module: '   ' })).toBe(
      'routes/order.ts',
    );
  });
});
