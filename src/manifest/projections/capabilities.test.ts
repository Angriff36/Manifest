/**
 * Registry-level projection capabilities API (Builder SDK surface).
 * getProjectionCapabilities() exposes a projection's declared IR-feature
 * coverage matrix; undeclared matrices return undefined, never [].
 */

import { describe, expect, it } from 'vitest';
import { getProjection, getProjectionCapabilities, listProjections } from './registry.js';

const STATUSES = new Set(['supported', 'partial', 'unsupported']);

describe('getProjectionCapabilities', () => {
  it('returns the convex matrix with valid entries', () => {
    const caps = getProjectionCapabilities('convex');
    expect(caps).toBeDefined();
    expect(caps!.length).toBeGreaterThan(0);
    for (const cap of caps!) {
      expect(cap.feature).toBeTruthy();
      expect(STATUSES.has(cap.status)).toBe(true);
    }
    // Matches what the registered projection target itself declares
    expect(caps).toBe(getProjection('convex')!.capabilities);
  });

  it('convex matrix has no duplicate features', () => {
    const caps = getProjectionCapabilities('convex')!;
    const features = caps.map((c) => c.feature);
    expect(new Set(features).size).toBe(features.length);
  });

  it('returns undefined for unknown projections', () => {
    expect(getProjectionCapabilities('no-such-projection')).toBeUndefined();
  });

  it('returns undefined (not []) for projections without a declared matrix', () => {
    const undeclared = listProjections().filter((p) => p.capabilities === undefined);
    // Most projections have not audited coverage yet; they must read as
    // "undeclared", not "supports nothing".
    for (const p of undeclared) {
      expect(getProjectionCapabilities(p.name)).toBeUndefined();
    }
  });
});
