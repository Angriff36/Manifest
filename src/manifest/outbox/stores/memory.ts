/**
 * MemoryOutboxStore — first-party in-memory implementation of the
 * OutboxStore contract (src/manifest/outbox/outbox-store.ts).
 *
 * Intended use:
 *   - Unit and conformance tests
 *   - Local development and sample applications
 *   - Reference for downstream durable implementations
 *
 * Durability: none. State lives in process memory only.
 *
 * Transactionality: the in-memory store ignores the `tx` argument passed to
 * `enqueue` — there is no shared transaction boundary in the in-memory
 * runtime today. Durable adapters MUST honor `tx` to inherit the
 * transactional outbox guarantee.
 *
 * Concurrency: a per-entry `claimed` flag stands in for SELECT … FOR UPDATE
 * SKIP LOCKED semantics; concurrent callers of `claim` never receive the
 * same entry, and entries already delivered/failed never re-appear from
 * `claim` regardless of status transitions.
 */

import type { OutboxEntry, OutboxStore } from '../outbox-store';

export interface MemoryOutboxStoreOptions {
  /** Provide a stable id generator for entries that arrive without one. */
  generateId?: () => string;
  /** Wall-clock function for enqueuedAt/claimedAt/etc. Defaults to Date.now. */
  now?: () => number;
}

interface InternalEntry extends OutboxEntry {
  /**
   * In-memory analogue of a row-lock. While true, the entry is "checked
   * out" to a delivery worker and MUST NOT be returned from another
   * `claim` call.
   */
  claimed: boolean;
  claimedAt?: number;
  deliveredAt?: number;
  failedAt?: number;
}

export class MemoryOutboxStore implements OutboxStore {
  private entries: InternalEntry[] = [];
  private seenEntryIds: Set<string> = new Set();
  private generateId: () => string;
  private now: () => number;

  constructor(opts: MemoryOutboxStoreOptions = {}) {
    this.generateId = opts.generateId ?? (() => crypto.randomUUID());
    this.now = opts.now ?? (() => Date.now());
  }

  async enqueue(entries: OutboxEntry[], _tx?: unknown): Promise<void> {
    for (const entry of entries) {
      const entryId = entry.entryId ?? this.generateId();
      if (this.seenEntryIds.has(entryId)) {
        continue;
      }
      this.seenEntryIds.add(entryId);
      this.entries.push({
        ...entry,
        entryId,
        enqueuedAt: entry.enqueuedAt ?? this.now(),
        status: entry.status ?? 'pending',
        attempts: entry.attempts ?? 0,
        claimed: false,
      });
    }
  }

  async claim(batchSize: number): Promise<OutboxEntry[]> {
    if (batchSize <= 0) return [];

    const claimedAt = this.now();
    const out: OutboxEntry[] = [];
    for (const entry of this.entries) {
      if (out.length >= batchSize) break;
      if (entry.status !== 'pending') continue;
      if (entry.claimed) continue;

      entry.claimed = true;
      entry.claimedAt = claimedAt;
      entry.attempts += 1;
      out.push(this.exposeEntry(entry));
    }
    return out;
  }

  async markDelivered(entryIds: string[]): Promise<void> {
    const ids = new Set(entryIds);
    const deliveredAt = this.now();
    for (const entry of this.entries) {
      if (!ids.has(entry.entryId)) continue;
      entry.status = 'delivered';
      entry.claimed = false;
      entry.deliveredAt = deliveredAt;
    }
  }

  async markFailed(entryIds: string[], error: string): Promise<void> {
    const ids = new Set(entryIds);
    const failedAt = this.now();
    for (const entry of this.entries) {
      if (!ids.has(entry.entryId)) continue;
      entry.status = 'failed';
      entry.lastError = error;
      entry.claimed = false;
      entry.failedAt = failedAt;
    }
  }

  /**
   * Diagnostic helper: return a snapshot of all entries (defensive copy).
   * Not part of the OutboxStore contract — for tests and observability.
   */
  list(): OutboxEntry[] {
    return this.entries.map((e) => this.exposeEntry(e));
  }

  /** Number of entries currently stored. */
  size(): number {
    return this.entries.length;
  }

  /**
   * Release a claim without delivering or failing. Useful for tests that
   * need to simulate a worker crash mid-delivery. Not part of the contract.
   */
  releaseClaim(entryIds: string[]): void {
    const ids = new Set(entryIds);
    for (const entry of this.entries) {
      if (!ids.has(entry.entryId)) continue;
      entry.claimed = false;
      entry.claimedAt = undefined;
    }
  }

  clear(): void {
    this.entries = [];
    this.seenEntryIds.clear();
  }

  private exposeEntry(entry: InternalEntry): OutboxEntry {
    const exposed: OutboxEntry = {
      entryId: entry.entryId,
      enqueuedAt: entry.enqueuedAt,
      event: entry.event,
      status: entry.status,
      attempts: entry.attempts,
    };
    if (entry.lastError !== undefined) exposed.lastError = entry.lastError;
    return exposed;
  }
}
