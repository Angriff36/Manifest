/**
 * Outbox store contract.
 *
 * Constitution §11: where transactional persistence is supported, state
 * mutation and semantic event persistence MUST share the same transaction
 * boundary. The `OutboxStore` adapter is the contract the runtime calls
 * inside its mutation transaction to durably enqueue emitted events.
 *
 * This module defines the contract only. Concrete stores (Memory, Postgres)
 * land in a follow-on. Wire-in via RuntimeOptions.outboxStore.
 */

import type { EmittedEvent } from '../runtime-engine';

export type OutboxEntryStatus = 'pending' | 'delivered' | 'failed';

export interface OutboxEntry {
  /** Stable id assigned by the store on enqueue. */
  entryId: string;
  /** Timestamp the entry was enqueued (ms since epoch). */
  enqueuedAt: number;
  /** The event payload to be delivered. */
  event: EmittedEvent;
  /** Current delivery status. */
  status: OutboxEntryStatus;
  /** Number of delivery attempts. */
  attempts: number;
  /** Last error message, when status === 'failed'. */
  lastError?: string;
}

/**
 * OutboxStore: enqueues semantic events for at-least-once delivery to
 * downstream consumers. The runtime calls `enqueue` inside the same
 * transaction that mutates entity state, so a successful command either
 * writes both the state change AND the outbox entries, or rolls back both.
 *
 * The `tx` parameter is intentionally typed `unknown` to keep the contract
 * adapter-agnostic; Prisma/PgClient transactions are the typical concrete
 * type.
 */
export interface OutboxStore {
  /**
   * Enqueue one or more outbox entries. MUST participate in the supplied
   * transaction; if `tx` is undefined the store MAY enqueue independently
   * (best-effort) and SHOULD warn about reduced durability guarantees.
   */
  enqueue(entries: OutboxEntry[], tx?: unknown): Promise<void>;

  /**
   * Claim up to `batchSize` pending entries for delivery. Implementations
   * SHOULD use database-level locking (e.g. SELECT … FOR UPDATE SKIP LOCKED)
   * so multiple workers can dispatch concurrently.
   */
  claim(batchSize: number): Promise<OutboxEntry[]>;

  /** Mark entries delivered. Called by the dispatcher worker. */
  markDelivered(entryIds: string[]): Promise<void>;

  /** Mark entries failed with a reason. Caller decides retry semantics. */
  markFailed(entryIds: string[], error: string): Promise<void>;
}
