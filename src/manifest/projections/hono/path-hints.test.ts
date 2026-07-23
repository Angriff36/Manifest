import { describe, expect, it } from 'vitest';
import {
  honoEntityRoutePathHint,
  honoEntityTypesPathHint,
  honoManifestRouterPathHint,
  honoManifestTypesPathHint,
} from './path-hints.js';

describe('hono pathHints — per-module nesting', () => {
  it('keeps monolith artifacts at historical flat paths', () => {
    expect(honoManifestRouterPathHint()).toBe('src/routes.ts');
    expect(honoManifestTypesPathHint()).toBe('types/manifest-types.ts');
  });

  it('keeps flat routes/types paths when module is absent', () => {
    expect(honoEntityRoutePathHint({ entityName: 'Order' })).toBe('routes/order.ts');
    expect(honoEntityTypesPathHint({ entityName: 'Order' })).toBe('types/order.ts');
  });

  it('nests under routes|types/<module>/ when module is set', () => {
    expect(honoEntityRoutePathHint({ entityName: 'Order', module: 'billing' })).toBe(
      'routes/billing/order.ts',
    );
    expect(honoEntityTypesPathHint({ entityName: 'Order', module: 'billing' })).toBe(
      'types/billing/order.ts',
    );
  });

  it('sanitizes unsafe module segments', () => {
    expect(honoEntityRoutePathHint({ entityName: 'Order', module: 'Billing / Ops!' })).toBe(
      'routes/Billing_Ops/order.ts',
    );
  });

  it('treats blank module as flat', () => {
    expect(honoEntityRoutePathHint({ entityName: 'Order', module: '   ' })).toBe('routes/order.ts');
  });
});
