/**
 * PostgresJobQueue — durable JobQueue adapter backed by PostgreSQL.
 *
 * Companion schema: src/manifest/jobs/stores/postgres.sql.
 *
 * Persistence model: one row per async-command job, keyed by the runtime's
 * `jobId` (PRIMARY KEY). `input` is JSONB so the command arguments round-trip
 * without a join table; `result` (JSONB) and `error` (TEXT) capture the
 * outcome recorded by `updateStatus`.
 *
 * Idempotent enqueue: `enqueue` uses INSERT … ON CONFLICT (job_id) DO NOTHING,
 * so a retried enqueue with the same jobId is silently ignored (first write
 * wins) — the same replay-safety the PostgresOutboxStore gives.
 *
 * drainPending — deviation from MemoryJobQueue: the in-memory queue flips
 * pending→running in process; this adapter does it atomically in the database
 * with a single UPDATE … WHERE job_id IN (SELECT … FOR UPDATE SKIP LOCKED).
 * The inner SELECT locks the pending rows it reads and the UPDATE flips them
 * to 'running' in the same implicit transaction, so two workers draining
 * concurrently receive disjoint job sets (the loser skips the locked rows).
 * A worker that crashes after draining but before `updateStatus` leaves the
 * job stuck in 'running' — recover by resetting such rows to 'pending' out of
 * band (see § "Crash Recovery" in docs/spec/adapters.md). Unlike the outbox
 * `claim`, `drainPending` takes no batch size (the JobQueue contract has
 * none): it drains every currently-pending, unlocked row.
 *
 * DO NOT import this file in browser code — it requires `pg`.
 */

import type { Pool, PoolClient } from 'pg';
import type { JobQueue, JobRecord } from '../../ir';

export interface PostgresJobQueueOptions {
  /** A pg Pool. The store does NOT own the pool's lifecycle. */
  pool: Pool;
  /** Table name override. Default: `manifest_jobs`. */
  tableName?: string;
}

const DEFAULT_TABLE = 'manifest_jobs';

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

interface JobRow {
  job_id: string;
  command_name: string;
  entity_name: string | null;
  instance_id: string | null;
  input: Record<string, unknown>;
  correlation_id: string | null;
  causation_id: string | null;
  enqueued_at: string | number;
  status: JobRecord['status'];
}

function rowToJob(row: JobRow): JobRecord {
  const job: JobRecord = {
    jobId: row.job_id,
    commandName: row.command_name,
    input: row.input ?? {},
    enqueuedAt: typeof row.enqueued_at === 'string' ? Number(row.enqueued_at) : row.enqueued_at,
    status: row.status,
  };
  if (row.entity_name !== null && row.entity_name !== undefined) job.entityName = row.entity_name;
  if (row.instance_id !== null && row.instance_id !== undefined) job.instanceId = row.instance_id;
  if (row.correlation_id !== null && row.correlation_id !== undefined) {
    job.correlationId = row.correlation_id;
  }
  if (row.causation_id !== null && row.causation_id !== undefined) {
    job.causationId = row.causation_id;
  }
  return job;
}

export class PostgresJobQueue implements JobQueue {
  private pool: Pool;
  private tableName: string;

  constructor(opts: PostgresJobQueueOptions) {
    this.pool = opts.pool;
    this.tableName = opts.tableName ?? DEFAULT_TABLE;
  }

  /**
   * Enqueue a job. Idempotent on `jobId` — a duplicate is silently ignored.
   * When `tx` is a PoolClient bound to an open transaction, the INSERT
   * participates in that transaction so the job is enqueued atomically with
   * the command's state mutation; otherwise it runs on a fresh pool
   * connection.
   */
  async enqueue(job: JobRecord, tx?: unknown): Promise<void> {
    const runner = (tx as PoolClient | undefined) ?? this.pool;
    const sql = `
      INSERT INTO ${quoteIdent(this.tableName)} (
        job_id, command_name, entity_name, instance_id, input,
        correlation_id, causation_id, enqueued_at, status
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
      ON CONFLICT (job_id) DO NOTHING
    `;
    await runner.query(sql, [
      job.jobId,
      job.commandName,
      job.entityName ?? null,
      job.instanceId ?? null,
      JSON.stringify(job.input ?? {}),
      job.correlationId ?? null,
      job.causationId ?? null,
      job.enqueuedAt,
      job.status,
    ]);
  }

  /**
   * Claim every pending job, flipping it to 'running' atomically. Concurrent
   * callers receive disjoint sets via FOR UPDATE SKIP LOCKED.
   */
  async drainPending(): Promise<JobRecord[]> {
    const sql = `
      UPDATE ${quoteIdent(this.tableName)} AS j
      SET status = 'running'
      WHERE j.job_id IN (
        SELECT job_id FROM ${quoteIdent(this.tableName)}
        WHERE status = 'pending'
        ORDER BY enqueued_at, job_id
        FOR UPDATE SKIP LOCKED
      )
      RETURNING job_id, command_name, entity_name, instance_id, input,
                correlation_id, causation_id, enqueued_at, status
    `;
    const result = await this.pool.query<JobRow>(sql);
    // RETURNING row order is not guaranteed to match the subquery ORDER BY.
    result.rows.sort((a, b) => {
      const ta = typeof a.enqueued_at === 'string' ? Number(a.enqueued_at) : a.enqueued_at;
      const tb = typeof b.enqueued_at === 'string' ? Number(b.enqueued_at) : b.enqueued_at;
      return ta - tb || String(a.job_id).localeCompare(String(b.job_id));
    });
    return result.rows.map(rowToJob);
  }

  /**
   * Record a job's terminal (or running) status. When `detail` is supplied,
   * `result` and `error` columns are written too; otherwise only `status`
   * changes.
   */
  async updateStatus(
    jobId: string,
    status: JobRecord['status'],
    detail?: { result?: unknown; error?: string }
  ): Promise<void> {
    if (detail) {
      const sql = `
        UPDATE ${quoteIdent(this.tableName)}
        SET status = $2, result = $3::jsonb, error = $4, updated_at = NOW()
        WHERE job_id = $1
      `;
      await this.pool.query(sql, [
        jobId,
        status,
        detail.result === undefined ? null : JSON.stringify(detail.result),
        detail.error ?? null,
      ]);
    } else {
      const sql = `
        UPDATE ${quoteIdent(this.tableName)}
        SET status = $2, updated_at = NOW()
        WHERE job_id = $1
      `;
      await this.pool.query(sql, [jobId, status]);
    }
  }
}
