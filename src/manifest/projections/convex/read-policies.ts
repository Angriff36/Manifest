/**
 * Read-policy gating shared by Convex query emission and the React client.
 */

import type { IR } from '../../ir';

/**
 * True when read/`all` policies (entity-scoped or global) gate this entity.
 * Gated entities emit `internalQuery` and must not get client useQuery hooks.
 */
export function hasReadPolicies(ir: IR, entityName: string): boolean {
  return ir.policies.some(
    (p) =>
      (p.action === 'read' || p.action === 'all') &&
      (p.entity === undefined || p.entity === entityName),
  );
}
