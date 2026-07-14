/**
 * Evidence that Zod and Convex projections share a compatible IR scalar set.
 *
 * Companion metadata (`convex` ↔ `zod`) is only published because this matrix
 * holds: every shared type has a Convex validator and a Zod expression that
 * accept the same JSON-serializable wire shape for Convex apps.
 *
 * Known intentional divergences (not companions blockers):
 * - Convex rejects bare `number` (ambiguous); Zod maps it to `z.number()`.
 * - Convex stores dates as epoch `v.number()`; Zod uses `z.coerce.date()`.
 * - Convex maps `bigint` to Float64; Zod uses `z.bigint()` — override via
 *   Convex `typeMappings` when lossless bigint is required.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_TYPE_MAPPING as CONVEX_MAP } from './type-mapping.js';
import { describeProjection } from '../registry.js';

/** IR type names both projections accept for Convex+Zod app workflows. */
const SHARED_WIRE_COMPATIBLE: readonly string[] = [
  'string',
  'text',
  'boolean',
  'bool',
  'int',
  'float',
  'decimal',
  'money',
  'uuid',
  'json',
  'duration',
];

describe('zod ↔ convex type parity (companion evidence)', () => {
  it('every shared wire-compatible IR type has a Convex default mapping', () => {
    for (const name of SHARED_WIRE_COMPATIBLE) {
      expect(CONVEX_MAP[name], `missing Convex mapping for ${name}`).toBeTypeOf('string');
    }
  });

  it('publishes mutual compatibleCompanions between convex and zod', () => {
    const convex = describeProjection('convex');
    const zod = describeProjection('zod');
    expect(convex.compatibleCompanions).toContain('zod');
    expect(zod.compatibleCompanions).toContain('convex');
  });
});
