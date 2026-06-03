/**
 * Approval store contract.
 *
 * Multi-stage approvals (manager-now / finance-later chains) only work if
 * pending approval state survives across requests. When a consumer builds a
 * fresh `RuntimeEngine` per HTTP request — the normal serverless/stateless
 * pattern — an in-process Map loses every pending approval between requests.
 *
 * The `ApprovalStore` adapter is the durable backing the runtime reads and
 * writes approval request state through. Applications wire in a concrete
 * store (Postgres, Redis, …) via `RuntimeOptions.approvalStore`. When no
 * store is supplied the runtime falls back to its in-process Map (suitable
 * for tests and single-process apps only).
 *
 * This module defines the contract only. Concrete stores live in
 * `src/manifest/approval/stores/<name>.ts` (Memory + Postgres ship now,
 * mirroring the audit/outbox adapter families).
 *
 * Keying: the runtime addresses requests by a stable string key
 * (`<entity>:<instanceId>:<approvalName>`). Stores treat the key as opaque
 * and MUST round-trip it; the full `ApprovalRequestState` is also persisted
 * so a store can reconstruct/list requests without parsing the key.
 */

import type { ApprovalRequestState } from '../runtime-engine';

export interface ApprovalStore {
  /**
   * Load the approval request for `key`, or undefined if none exists.
   * Durable stores MUST return a fresh (deserialized) value — callers may
   * mutate the returned object before calling `save`.
   */
  load(key: string): Promise<ApprovalRequestState | undefined>;

  /**
   * Persist (insert or replace) the approval request under `key`. Called
   * after the runtime creates a pending request or records a stage grant /
   * denial, so the latest state is durable for the next request.
   */
  save(key: string, state: ApprovalRequestState): Promise<void>;

  /**
   * List every stored approval request. Useful for operational dashboards
   * and for sweeping expirations. Order is implementation-defined.
   */
  list(): Promise<ApprovalRequestState[]>;

  /**
   * Expire any pending requests whose `expiresAt` is at or before `now`,
   * transitioning them to `status: 'expired'`, and return the requests that
   * were expired. Durable stores SHOULD perform this as a single set-based
   * operation (e.g. an `UPDATE … RETURNING`) so a cron/worker can sweep
   * timeouts without loading the whole table.
   */
  expire(now: number): Promise<ApprovalRequestState[]>;
}
