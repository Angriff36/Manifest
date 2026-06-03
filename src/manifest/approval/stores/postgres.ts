/**
 * PostgresApprovalStore — durable ApprovalStore adapter backed by PostgreSQL.
 *
 * Companion schema: src/manifest/approval/stores/postgres.sql.
 *
 * Persistence model: one row per approval request, keyed by the runtime's
 * opaque `${entity}:${instanceId}:${approvalName}` key (PRIMARY KEY). The
 * full request state is stored across typed columns; `required_stages` and
 * `grants` are JSONB so they round-trip without a join table.
 *
 * Upsert: `save` uses `INSERT … ON CONFLICT (key) DO UPDATE` so creating a
 * pending request and later recording grants/denials are both a single
 * statement. The latest write wins — the runtime always saves the complete
 * state, never a partial patch.
 *
 * Expiry: `expire` is a single set-based `UPDATE … WHERE status='pending'
 * AND expires_at <= $1 RETURNING *`, so a cron/worker can sweep timeouts
 * without loading the table. See
 * https://www.postgresql.org/docs/current/sql-update.html § "Outputs".
 *
 * DO NOT import this file in browser code — it requires `pg`.
 */

import type { Pool } from 'pg';
import type { ApprovalGrant, ApprovalRequestState } from '../../runtime-engine';
import type { ApprovalStore } from '../approval-store';

export interface PostgresApprovalStoreOptions {
  /** A pg Pool. The store does NOT own the pool's lifecycle. */
  pool: Pool;
  /** Table name override. Default: `manifest_approval_requests`. */
  tableName?: string;
}

const DEFAULT_TABLE = 'manifest_approval_requests';

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

interface ApprovalRow {
  request_key: string;
  entity: string;
  instance_id: string;
  approval_name: string;
  command: string;
  status: ApprovalRequestState['status'];
  required_stages: string[];
  grants: ApprovalGrant[];
  requested_at: string | number;
  expires_at: string | number | null;
  denied_by: string | null;
  denied_reason: string | null;
}

function toNumber(v: string | number): number {
  return typeof v === 'string' ? Number(v) : v;
}

function rowToState(row: ApprovalRow): ApprovalRequestState {
  const state: ApprovalRequestState = {
    entity: row.entity,
    instanceId: row.instance_id,
    approvalName: row.approval_name,
    command: row.command,
    status: row.status,
    requiredStages: row.required_stages ?? [],
    grants: row.grants ?? [],
    requestedAt: toNumber(row.requested_at),
  };
  if (row.expires_at !== null && row.expires_at !== undefined) {
    state.expiresAt = toNumber(row.expires_at);
  }
  if (row.denied_by !== null && row.denied_by !== undefined) state.deniedBy = row.denied_by;
  if (row.denied_reason !== null && row.denied_reason !== undefined) state.deniedReason = row.denied_reason;
  return state;
}

export class PostgresApprovalStore implements ApprovalStore {
  private pool: Pool;
  private tableName: string;

  constructor(opts: PostgresApprovalStoreOptions) {
    this.pool = opts.pool;
    this.tableName = opts.tableName ?? DEFAULT_TABLE;
  }

  async load(key: string): Promise<ApprovalRequestState | undefined> {
    const sql = `
      SELECT request_key, entity, instance_id, approval_name, command, status,
             required_stages, grants, requested_at, expires_at, denied_by, denied_reason
      FROM ${quoteIdent(this.tableName)}
      WHERE request_key = $1
    `;
    const result = await this.pool.query<ApprovalRow>(sql, [key]);
    const row = result.rows[0];
    return row ? rowToState(row) : undefined;
  }

  async save(key: string, state: ApprovalRequestState): Promise<void> {
    const sql = `
      INSERT INTO ${quoteIdent(this.tableName)} (
        request_key, entity, instance_id, approval_name, command, status,
        required_stages, grants, requested_at, expires_at, denied_by, denied_reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12)
      ON CONFLICT (request_key) DO UPDATE SET
        entity = EXCLUDED.entity,
        instance_id = EXCLUDED.instance_id,
        approval_name = EXCLUDED.approval_name,
        command = EXCLUDED.command,
        status = EXCLUDED.status,
        required_stages = EXCLUDED.required_stages,
        grants = EXCLUDED.grants,
        requested_at = EXCLUDED.requested_at,
        expires_at = EXCLUDED.expires_at,
        denied_by = EXCLUDED.denied_by,
        denied_reason = EXCLUDED.denied_reason
    `;
    await this.pool.query(sql, [
      key,
      state.entity,
      state.instanceId,
      state.approvalName,
      state.command,
      state.status,
      JSON.stringify(state.requiredStages),
      JSON.stringify(state.grants),
      state.requestedAt,
      state.expiresAt ?? null,
      state.deniedBy ?? null,
      state.deniedReason ?? null,
    ]);
  }

  async list(): Promise<ApprovalRequestState[]> {
    const sql = `
      SELECT request_key, entity, instance_id, approval_name, command, status,
             required_stages, grants, requested_at, expires_at, denied_by, denied_reason
      FROM ${quoteIdent(this.tableName)}
      ORDER BY requested_at, request_key
    `;
    const result = await this.pool.query<ApprovalRow>(sql);
    return result.rows.map(rowToState);
  }

  async expire(now: number): Promise<ApprovalRequestState[]> {
    const sql = `
      UPDATE ${quoteIdent(this.tableName)}
      SET status = 'expired'
      WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at <= $1
      RETURNING request_key, entity, instance_id, approval_name, command, status,
                required_stages, grants, requested_at, expires_at, denied_by, denied_reason
    `;
    const result = await this.pool.query<ApprovalRow>(sql, [now]);
    return result.rows.map(rowToState);
  }
}
