/**
 * Convex capability-map honesty: only intentional platform Partials remain.
 */

import { describe, expect, it } from 'vitest';
import { CONVEX_PROJECTION_CAPABILITIES } from './capabilities.js';

describe('CONVEX_PROJECTION_CAPABILITIES status honesty', () => {
  it('keeps only realtime + computed-cache as partial (platform-native)', () => {
    const partials = CONVEX_PROJECTION_CAPABILITIES.filter((c) => c.status === 'partial').map(
      (c) => c.feature,
    );
    expect(partials.sort()).toEqual(['Computed cache directives', 'realtime hint'].sort());
  });

  it('marks read policies, relation aggregates, and policyMode skip as supported', () => {
    const byFeature = new Map(CONVEX_PROJECTION_CAPABILITIES.map((c) => [c.feature, c.status]));
    expect(byFeature.get('Read/all policies on generated queries')).toBe('supported');
    expect(byFeature.get('Computed relation aggregates')).toBe('supported');
    expect(byFeature.get("policyMode: 'skip'")).toBe('supported');
  });
});
