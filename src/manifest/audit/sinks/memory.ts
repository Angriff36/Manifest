/**
 * MemoryAuditSink — first-party in-memory implementation of the AuditSink
 * contract (src/manifest/audit/audit-sink.ts).
 *
 * Intended use:
 *   - Unit and conformance tests
 *   - Local development and prototyping
 *   - Sample applications wiring audit governance without a database
 *
 * Durability: none. Records live for the lifetime of the sink instance.
 *
 * Idempotency: when `record.recordId` is provided, repeat emissions for the
 * same id are dropped silently (the first record wins). Records without a
 * `recordId` are always appended.
 */

import type { AuditRecord, AuditSink } from '../audit-sink';

export interface MemoryAuditSinkOptions {
  /**
   * Optional ID generator for records that arrive without a `recordId`.
   * When provided, the sink stamps a synthetic id on emit so the record can
   * be referenced by callers. Defaults to leaving `recordId` undefined.
   */
  generateId?: () => string;
}

/**
 * In-memory audit sink. Safe for use across multiple RuntimeEngine instances
 * in a single test run; not safe for cross-process sharing.
 */
export class MemoryAuditSink implements AuditSink {
  private records: AuditRecord[] = [];
  private seenRecordIds: Set<string> = new Set();
  private generateId?: () => string;

  constructor(opts: MemoryAuditSinkOptions = {}) {
    this.generateId = opts.generateId;
  }

  async emit(record: AuditRecord): Promise<void> {
    const recordId = record.recordId ?? (this.generateId ? this.generateId() : undefined);

    if (recordId !== undefined) {
      if (this.seenRecordIds.has(recordId)) {
        return;
      }
      this.seenRecordIds.add(recordId);
    }

    const stored: AuditRecord = {
      ...record,
      ...(recordId !== undefined ? { recordId } : {}),
    };

    this.records.push(stored);
  }

  /**
   * Return a defensive copy of all records emitted so far. Mutating the
   * returned array does not affect internal state.
   */
  list(): AuditRecord[] {
    return this.records.map(r => ({ ...r }));
  }

  /** Number of records currently stored. */
  size(): number {
    return this.records.length;
  }

  /**
   * Look up a record by recordId. Returns a defensive copy or undefined.
   * O(n) — acceptable for test scenarios where MemoryAuditSink is used.
   */
  findByRecordId(recordId: string): AuditRecord | undefined {
    const found = this.records.find(r => r.recordId === recordId);
    return found ? { ...found } : undefined;
  }

  /** Clear all stored records and idempotency tracking. */
  clear(): void {
    this.records = [];
    this.seenRecordIds.clear();
  }
}
