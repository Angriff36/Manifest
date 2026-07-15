/**
 * PostgresRateLimitStore — durable RateLimitStore adapter backed by PostgreSQL.
 *
 * Companion schema: src/manifest/rate-limit/stores/postgres.sql.
 *
 * Persistence model: one row per scope key. Sliding-window timestamps are
 * JSONB; window_start is epoch-ms. `mutate` runs SELECT … FOR UPDATE so
 * concurrent RateLimiter instances share one coherent bucket.
 *
 * DO NOT import this file in browser code — it requires `pg`.
 */

import type { Pool, PoolClient } from 'pg';
import type { RateLimitBucketState, RateLimitStore } from '../../runtime-rate-limit';

export interface PostgresRateLimitStoreOptions {
  /** A pg Pool. The store does NOT own the pool's lifecycle. */
  pool: Pool;
  /** Table name override. Default: `manifest_rate_limit_buckets`. */
  tableName?: string;
}

const DEFAULT_TABLE = 'manifest_rate_limit_buckets';

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

interface RateLimitRow {
  timestamps: number[] | string;
  window_start: string | number;
}

function parseTimestamps(raw: number[] | string): number[] {
  if (Array.isArray(raw)) return raw.map((n) => Number(n));
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((n) => Number(n));
}

function rowToState(row: RateLimitRow): RateLimitBucketState {
  return {
    timestamps: parseTimestamps(row.timestamps),
    windowStart: Number(row.window_start),
  };
}

export class PostgresRateLimitStore implements RateLimitStore {
  private pool: Pool;
  private tableName: string;

  constructor(opts: PostgresRateLimitStoreOptions) {
    this.pool = opts.pool;
    this.tableName = opts.tableName ?? DEFAULT_TABLE;
  }

  async get(scopeKey: string): Promise<RateLimitBucketState | undefined> {
    const sql = `SELECT timestamps, window_start FROM ${quoteIdent(this.tableName)} WHERE scope_key = $1`;
    const result = await this.pool.query<RateLimitRow>(sql, [scopeKey]);
    const row = result.rows[0];
    return row ? rowToState(row) : undefined;
  }

  async set(scopeKey: string, state: RateLimitBucketState): Promise<void> {
    const sql = `
      INSERT INTO ${quoteIdent(this.tableName)} (scope_key, timestamps, window_start, updated_at)
      VALUES ($1, $2::jsonb, $3, NOW())
      ON CONFLICT (scope_key) DO UPDATE SET
        timestamps = EXCLUDED.timestamps,
        window_start = EXCLUDED.window_start,
        updated_at = NOW()
    `;
    await this.pool.query(sql, [scopeKey, JSON.stringify(state.timestamps), state.windowStart]);
  }

  async clear(): Promise<void> {
    await this.pool.query(`TRUNCATE ${quoteIdent(this.tableName)}`);
  }

  async mutate<T>(
    scopeKey: string,
    fn: (current: RateLimitBucketState | undefined) => {
      next: RateLimitBucketState;
      result: T;
    },
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await this.lockGet(client, scopeKey);
      const { next, result } = fn(current);
      await this.lockSet(client, scopeKey, next);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback failure
      }
      throw err;
    } finally {
      client.release();
    }
  }

  private async lockGet(
    client: PoolClient,
    scopeKey: string,
  ): Promise<RateLimitBucketState | undefined> {
    const sql = `
      SELECT timestamps, window_start
      FROM ${quoteIdent(this.tableName)}
      WHERE scope_key = $1
      FOR UPDATE
    `;
    const result = await client.query<RateLimitRow>(sql, [scopeKey]);
    const row = result.rows[0];
    return row ? rowToState(row) : undefined;
  }

  private async lockSet(
    client: PoolClient,
    scopeKey: string,
    state: RateLimitBucketState,
  ): Promise<void> {
    const sql = `
      INSERT INTO ${quoteIdent(this.tableName)} (scope_key, timestamps, window_start, updated_at)
      VALUES ($1, $2::jsonb, $3, NOW())
      ON CONFLICT (scope_key) DO UPDATE SET
        timestamps = EXCLUDED.timestamps,
        window_start = EXCLUDED.window_start,
        updated_at = NOW()
    `;
    await client.query(sql, [scopeKey, JSON.stringify(state.timestamps), state.windowStart]);
  }
}
