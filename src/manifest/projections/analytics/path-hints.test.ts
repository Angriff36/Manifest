import { describe, expect, it } from 'vitest';
import {
  analyticsEntityHandlerPathHint,
  analyticsEventsPathHint,
  analyticsHandlersMonolithPathHint,
  analyticsTrackingPlanPathHint,
} from './path-hints.js';

describe('analytics pathHints — per-module nesting', () => {
  it('keeps monolith artifacts at historical flat paths', () => {
    expect(analyticsHandlersMonolithPathHint()).toBe('analytics/handlers.ts');
    expect(analyticsTrackingPlanPathHint()).toBe('analytics/tracking-plan.json');
    expect(analyticsEventsPathHint()).toBe('analytics/analytics.events.ts');
  });

  it('keeps flat handlers/ paths when module is absent', () => {
    expect(analyticsEntityHandlerPathHint({ name: 'Order' })).toBe('analytics/handlers/order.ts');
  });

  it('nests under analytics/handlers/<module>/ when module is set', () => {
    expect(analyticsEntityHandlerPathHint({ name: 'Order', module: 'billing' })).toBe(
      'analytics/handlers/billing/order.ts',
    );
  });

  it('sanitizes unsafe module segments', () => {
    expect(
      analyticsEntityHandlerPathHint({
        name: 'Order',
        module: 'Billing / Ops!',
      }),
    ).toBe('analytics/handlers/Billing_Ops/order.ts');
  });

  it('treats blank module as flat', () => {
    expect(analyticsEntityHandlerPathHint({ name: 'Order', module: '   ' })).toBe(
      'analytics/handlers/order.ts',
    );
  });
});
