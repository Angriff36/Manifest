/**
 * PostgresIdempotencyStore — durable IdempotencyStore adapter backed by
 * PostgreSQL.
 *
 * Companion schema: src/manifest/idempotency/stores/postgres.sql.
 *
 * Persistence model: one row per idempotency key (PRIMARY KEY). The cached
 * `CommandResult` is stored in a single JSONB column so it round-trips
 * without a schema per result shape.
 *
 * First-write-wins: `set` uses `INSERT … ON CONFLICT (idempotency_key) DO
 * NOTHING` — a replay with the same key never overwrites the first recorded
 * result, so concurrent workers racing on the same key converge on one
 * stored outcome. The runtime only calls `set` after a `get` miss, so under
 * single-writer operation this is equivalent to any write policy; the choice
 * is load-bearing only when two callers execute the same key concurrently.
 *
 * DO NOT import this file in browser code — it requires `pg`.
 */

import type { Pool } from 'pg';
import type { CommandResult, IdempotencyStore } from '../../runtime-engine';

export interface PostgresIdempotencyStoreOptions {
  /** A pg Pool. The store does NOT own the pool's lifecycle. */
  pool: Pool;
  /** Table name override. Default: `manifest_idempotency_keys`. */
  tableName?: string;
}

const DEFAULT_TABLE = 'manifest_idempotency_keys';

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

interface IdempotencyRow {
  result: CommandResult;
}

export class PostgresIdempotencyStore implements IdempotencyStore {
  private pool: Pool;
  private tableName: string;

  constructor(opts: PostgresIdempotencyStoreOptions) {
    this.pool = opts.pool;
    this.tableName = opts.tableName ?? DEFAULT_TABLE;
  }

  async has(key: string): Promise<boolean> {
    const sql = `SELECT 1 FROM ${quoteIdent(this.tableName)} WHERE idempotency_key = $1`;
    const result = await this.pool.query(sql, [key]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  async get(key: string): Promise<CommandResult | undefined> {
    const sql = `SELECT result FROM ${quoteIdent(this.tableName)} WHERE idempotency_key = $1`;
    const result = await this.pool.query<IdempotencyRow>(sql, [key]);
    const row = result.rows[0];
    return row ? row.result : undefined;
  }

  async set(key: string, result: CommandResult): Promise<void> {
    const sql = `
      INSERT INTO ${quoteIdent(this.tableName)} (idempotency_key, result)
      VALUES ($1, $2::jsonb)
      ON CONFLICT (idempotency_key) DO NOTHING
    `;
    await this.pool.query(sql, [key, JSON.stringify(result)]);
  }
}
