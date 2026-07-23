import { describe, expect, it } from 'vitest';
import { resolveEntitySegment } from '../shared/route-contract.js';
import { nextjsSubscriptionHookPathHint } from './path-hints.js';

describe('nextjs pathHints — per-module nesting', () => {
  it('nests route segments under entityModules when no override', () => {
    expect(resolveEntitySegment('Order', { entityModules: { Order: 'billing' } })).toBe(
      'billing/order',
    );
  });

  it('keeps flat subscription hooks when module is absent', () => {
    expect(
      nextjsSubscriptionHookPathHint({
        entityName: 'Order',
        hooksDir: 'src/hooks',
      }),
    ).toBe('src/hooks/useOrderSubscription.ts');
  });

  it('nests subscription hooks under hooksDir/<module>/', () => {
    expect(
      nextjsSubscriptionHookPathHint({
        entityName: 'Order',
        hooksDir: 'src/hooks',
        module: 'billing',
      }),
    ).toBe('src/hooks/billing/useOrderSubscription.ts');
  });

  it('sanitizes unsafe module segments on hooks', () => {
    expect(
      nextjsSubscriptionHookPathHint({
        entityName: 'Order',
        hooksDir: 'src/hooks',
        module: 'Billing / Ops!',
      }),
    ).toBe('src/hooks/Billing_Ops/useOrderSubscription.ts');
  });
});
