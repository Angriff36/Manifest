/**
 * PostgresAuditSink — durable AuditSink adapter backed by PostgreSQL.
 *
 * Companion schema: src/manifest/audit/sinks/postgres.sql.
 * Uses the `pg` client (already a Manifest dependency for stores.node.ts).
 *
 * Idempotency: enforced at the SQL layer via
 *   INSERT … ON CONFLICT (record_id) DO NOTHING
 * so retries from a buggy upstream consumer never double-write.
 *
 * Transactionality: this adapter inserts on its own connection by default.
 * Callers who need audit emission inside a larger transaction should pass
 * a PoolClient already bound to that transaction via `client`.
 *
 * DO NOT import this file in browser code — it requires `pg`.
 */

import type { Pool, PoolClient } from 'pg';
import type { AuditRecord, AuditSink } from '../audit-sink';

export interface PostgresAuditSinkOptions {
  /** A pg Pool. The sink does NOT own the pool's lifecycle. */
  pool: Pool;
  /** Table name override. Default: `manifest_audit_records`. */
  tableName?: string;
}

const DEFAULT_TABLE = 'manifest_audit_records';

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export class PostgresAuditSink implements AuditSink {
  private pool: Pool;
  private tableName: string;

  constructor(opts: PostgresAuditSinkOptions) {
    this.pool = opts.pool;
    this.tableName = opts.tableName ?? DEFAULT_TABLE;
  }

  async emit(record: AuditRecord, client?: PoolClient): Promise<void> {
    if (record.recordId === undefined) {
      // Without a recordId the INSERT cannot be idempotent. Refuse the
      // emission so callers wire a real id generator (RuntimeEngine
      // generates one per invocation when an audit sink is configured).
      throw new Error('PostgresAuditSink requires AuditRecord.recordId for idempotent insert');
    }

    const sql = `
      INSERT INTO ${quoteIdent(this.tableName)} (
        record_id, occurred_at, tenant_id, org_id, actor_id,
        request_id, source, entity, command, command_id,
        outcome, emitted_event_names, ir_hash, diagnostics
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14::jsonb
      )
      ON CONFLICT (record_id) DO NOTHING
    `;

    const params: unknown[] = [
      record.recordId,
      record.occurredAt,
      record.tenantId ?? null,
      record.orgId ?? null,
      record.actorId ?? null,
      record.requestId ?? null,
      record.source ?? null,
      record.entity ?? null,
      record.command,
      record.commandId ?? null,
      record.outcome,
      record.emittedEventNames ?? null,
      record.irHash ?? null,
      record.diagnostics === undefined ? null : JSON.stringify(record.diagnostics),
    ];

    const runner = client ?? this.pool;
    await runner.query(sql, params);
  }
}
