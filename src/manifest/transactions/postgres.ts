/**
 * PostgresTransactionProvider — a TransactionProvider backed by a pg Pool.
 *
 * The runtime engine wraps a single command's persistence in
 * `provider.withTransaction(fn)`. This adapter runs `fn` inside one
 * `BEGIN … COMMIT` on a dedicated PoolClient: the handle passed to `fn` IS
 * that PoolClient. Because a PoolClient is a single dedicated connection,
 * any adapter that threads the handle into `(tx as PoolClient).query(...)`
 * runs inside this transaction — even adapters that privately hold a
 * *different* Pool, since the query targets this connection, not their pool.
 * That is what makes cross-adapter atomicity (store write + outbox enqueue +
 * idempotency set on one commit) work.
 *
 * On any throw from `fn`, the transaction is rolled back and the error is
 * rethrown. The client is always released in `finally`, so a failed
 * transaction never leaks a connection. There is no savepoint / nesting
 * support: the engine guarantees `withTransaction` is never called
 * re-entrantly on the same provider.
 *
 * DO NOT import this file in browser code — it requires `pg`.
 */

import type { Pool, PoolClient } from 'pg';

/**
 * Opaque transaction handle threaded through adapter write methods. For this
 * provider it is a pg PoolClient bound to an open transaction.
 */
export type TransactionHandle = unknown;

export interface TransactionProvider {
  withTransaction<T>(fn: (tx: TransactionHandle) => Promise<T>): Promise<T>;
}

export interface PostgresTransactionProviderOptions {
  /** A pg Pool. The provider does NOT own the pool's lifecycle. */
  pool: Pool;
}

export class PostgresTransactionProvider implements TransactionProvider {
  private pool: Pool;

  constructor(opts: PostgresTransactionProviderOptions) {
    this.pool = opts.pool;
  }

  async withTransaction<T>(fn: (tx: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      let result: T;
      try {
        result = await fn(client);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
      await client.query('COMMIT');
      return result;
    } finally {
      client.release();
    }
  }
}
