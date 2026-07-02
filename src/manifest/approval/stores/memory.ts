/**
 * MemoryApprovalStore — first-party in-memory implementation of the
 * ApprovalStore contract (src/manifest/approval/approval-store.ts).
 *
 * Intended use:
 *   - Unit and conformance tests
 *   - Local development and sample applications
 *   - Reference for downstream durable implementations
 *
 * Durability: none. State lives in process memory only. Sharing one
 * `MemoryApprovalStore` instance between multiple `RuntimeEngine` instances
 * lets a request created by one engine be approved by another — the exact
 * cross-request behavior a durable store provides in production.
 *
 * Defensive copying: `load` and `list` return deep clones and `save` stores
 * a deep clone, so callers cannot mutate stored state by reference. This
 * mirrors the serialize/deserialize boundary of a real database adapter and
 * keeps the cross-engine semantics honest.
 */

import type { ApprovalRequestState } from '../../runtime-engine';
import type { ApprovalStore } from '../approval-store';

function clone(state: ApprovalRequestState): ApprovalRequestState {
  return JSON.parse(JSON.stringify(state)) as ApprovalRequestState;
}

export class MemoryApprovalStore implements ApprovalStore {
  private requests = new Map<string, ApprovalRequestState>();

  async load(key: string): Promise<ApprovalRequestState | undefined> {
    const found = this.requests.get(key);
    return found ? clone(found) : undefined;
  }

  async save(key: string, state: ApprovalRequestState, _tx?: unknown): Promise<void> {
    // In-memory: no shared transaction boundary, so `tx` is ignored. Durable
    // adapters honor it to inherit the transactional guarantee.
    this.requests.set(key, clone(state));
  }

  async list(): Promise<ApprovalRequestState[]> {
    return Array.from(this.requests.values()).map(clone);
  }

  async expire(now: number): Promise<ApprovalRequestState[]> {
    const expired: ApprovalRequestState[] = [];
    for (const state of this.requests.values()) {
      if (state.status !== 'pending' || state.expiresAt === undefined) continue;
      if (now >= state.expiresAt) {
        state.status = 'expired';
        expired.push(clone(state));
      }
    }
    return expired;
  }

  /** Number of requests currently stored. Not part of the contract. */
  size(): number {
    return this.requests.size;
  }

  /** Drop all stored requests. Not part of the contract — for test cleanup. */
  clear(): void {
    this.requests.clear();
  }
}
