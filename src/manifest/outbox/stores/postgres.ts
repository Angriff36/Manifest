/**
 * PostgresOutboxStore — durable OutboxStore adapter backed by PostgreSQL.
 *
 * Companion schema: src/manifest/outbox/stores/postgres.sql.
 *
 * Concurrency model: `claim` uses `FOR UPDATE SKIP LOCKED` so concurrent
 * dispatcher workers receive disjoint batches without lock contention.
 * See https://www.postgresql.org/docs/current/sql-select.html § "The
 * Locking Clause" for the official semantics.
 *
 * Transactional enqueue: when callers pass a PoolClient via `tx`, the
 * INSERT runs inside that transaction so state mutation and outbox
 * persistence commit atomically. This is the load-bearing piece of the
 * "transactional outbox" pattern. Without a `tx`, enqueue runs on its
 * own pool connection — durable but NOT atomic w.r.t. mutation.
 *
 * Idempotency: ON CONFLICT (entry_id) DO NOTHING — a retried enqueue with
 * the same entryId is silently ignored.
 *
 * DO NOT import this file in browser code — it requires `pg`.
 */

import type { Pool, PoolClient } from 'pg';
import type { EmittedEvent } from '../../runtime-engine';
import type { OutboxEntry, OutboxEntryStatus, OutboxStore } from '../outbox-store';

export interface PostgresOutboxStoreOptions {
  /** A pg Pool. The store does NOT own the pool's lifecycle. */
  pool: Pool;
  /** Table name override. Default: `manifest_outbox_entries`. */
  tableName?: string;
}

const DEFAULT_TABLE = 'manifest_outbox_entries';

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

interface OutboxRow {
  entry_id: string;
  enqueued_at: string | number;
  event: EmittedEvent;
  status: OutboxEntryStatus;
  attempts: number;
  last_error: string | null;
}

function rowToEntry(row: OutboxRow): OutboxEntry {
  const entry: OutboxEntry = {
    entryId: row.entry_id,
    enqueuedAt: typeof row.enqueued_at === 'string' ? Number(row.enqueued_at) : row.enqueued_at,
    event: row.event,
    status: row.status,
    attempts: row.attempts,
  };
  if (row.last_error !== null && row.last_error !== undefined) {
    entry.lastError = row.last_error;
  }
  return entry;
}

export class PostgresOutboxStore implements OutboxStore {
  private pool: Pool;
  private tableName: string;

  constructor(opts: PostgresOutboxStoreOptions) {
    this.pool = opts.pool;
    this.tableName = opts.tableName ?? DEFAULT_TABLE;
  }

  /**
   * Enqueue entries. If `tx` is a PoolClient bound to an open transaction,
   * the INSERT participates in that transaction (the transactional outbox
   * guarantee). Otherwise, the INSERT runs on a fresh pool connection.
   */
  async enqueue(entries: OutboxEntry[], tx?: unknown): Promise<void> {
    if (entries.length === 0) return;

    const runner = (tx ?? this.pool) as Pool | PoolClient;
    const sql = `
      INSERT INTO ${quoteIdent(this.tableName)} (
        entry_id, enqueued_at, event, status, attempts, last_error
      ) VALUES ($1, $2, $3::jsonb, $4, $5, $6)
      ON CONFLICT (entry_id) DO NOTHING
    `;

    for (const entry of entries) {
      await runner.query(sql, [
        entry.entryId,
        entry.enqueuedAt,
        JSON.stringify(entry.event),
        entry.status,
        entry.attempts,
        entry.lastError ?? null,
      ]);
    }
  }

  /**
   * Claim up to `batchSize` pending entries for delivery.
   *
   * Atomicity guarantee: a single UPDATE … WHERE entry_id IN (SELECT … FOR
   * UPDATE SKIP LOCKED) runs in one implicit transaction. The inner SELECT
   * holds row locks on the matching rows until the outer UPDATE commits, so
   * two concurrent workers calling `claim` cannot lock the same row.
   *
   * Re-claim safety: after commit, the row's `claimed_at` is non-NULL, and
   * the WHERE clause filters `claimed_at IS NULL` — so even though `status`
   * is still 'pending', a follow-up `claim` call will not return the same
   * row. The dispatcher worker MUST eventually call `markDelivered` or
   * `markFailed` to flip status off 'pending'. See § "Crash Recovery" in
   * docs/spec/adapters.md for the documented stale-claim recovery path
   * (a worker that crashes after claiming but before marking leaves the
   * row stuck until an operator resets `claimed_at`).
   *
   * Increments `attempts` and stamps `claimed_at = NOW()` on every claim.
   */
  async claim(batchSize: number): Promise<OutboxEntry[]> {
    if (batchSize <= 0) return [];

    const sql = `
      UPDATE ${quoteIdent(this.tableName)} AS o
      SET attempts = o.attempts + 1,
          claimed_at = NOW()
      WHERE o.entry_id IN (
        SELECT entry_id FROM ${quoteIdent(this.tableName)}
        WHERE status = 'pending' AND claimed_at IS NULL
        ORDER BY enqueued_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING entry_id, enqueued_at, event, status, attempts, last_error
    `;

    const result = await this.pool.query<OutboxRow>(sql, [batchSize]);
    return result.rows.map(rowToEntry);
  }

  /**
   * Reset `claimed_at` to NULL for the given entry ids without changing
   * `status`. Use after a dispatcher worker crash to re-enqueue stale
   * claims for re-delivery. Not part of the OutboxStore contract — exposed
   * here so operators have a documented recovery path. Callers MUST be
   * confident the worker is dead; releasing a claim held by a live worker
   * can produce duplicate delivery attempts.
   */
  async releaseStaleClaims(entryIds: string[]): Promise<void> {
    if (entryIds.length === 0) return;
    const sql = `
      UPDATE ${quoteIdent(this.tableName)}
      SET claimed_at = NULL
      WHERE entry_id = ANY($1::text[]) AND status = 'pending'
    `;
    await this.pool.query(sql, [entryIds]);
  }

  /** Mark entries delivered. Idempotent — repeated calls have no effect. */
  async markDelivered(entryIds: string[]): Promise<void> {
    if (entryIds.length === 0) return;
    const sql = `
      UPDATE ${quoteIdent(this.tableName)}
      SET status = 'delivered', delivered_at = NOW()
      WHERE entry_id = ANY($1::text[])
    `;
    await this.pool.query(sql, [entryIds]);
  }

  /** Mark entries failed and record the last error message. */
  async markFailed(entryIds: string[], error: string): Promise<void> {
    if (entryIds.length === 0) return;
    const sql = `
      UPDATE ${quoteIdent(this.tableName)}
      SET status = 'failed', last_error = $2, failed_at = NOW()
      WHERE entry_id = ANY($1::text[])
    `;
    await this.pool.query(sql, [entryIds, error]);
  }
}
