/**
 * Mock-based unit tests for PostgresStore (entity JSONB adapter).
 *
 * No live database required. Exercises CRUD SQL shape through an injected
 * fake `pg` Pool. Live tx soak remains in `transactions/postgres.live.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import type { Pool, PoolClient, QueryResult } from 'pg';
import { PostgresStore } from './stores.node';

type Query = { sql: string; params: unknown[] };

function makeFakePool(
  handler?: (sql: string, params: unknown[]) => { rows?: unknown[]; rowCount?: number },
): { pool: Pool; queries: Query[] } {
  const queries: Query[] = [];

  const client = {
    async query(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });
      const result = handler?.(sql, params) ?? { rows: [], rowCount: 0 };
      return {
        rows: result.rows ?? [],
        rowCount: result.rowCount ?? (result.rows?.length ?? 0),
      } as QueryResult;
    },
    release() {},
  } as unknown as PoolClient;

  const pool = {
    async connect() {
      return client;
    },
    async end() {
      return undefined;
    },
  } as unknown as Pool;

  return { pool, queries };
}

describe('PostgresStore — mock pool', () => {
  it('creates the JSONB table once on first use', async () => {
    const { pool, queries } = makeFakePool();
    const store = new PostgresStore({ pool, tableName: 'widgets' }, () => 'id-1');

    await store.getAll();

    expect(queries[0].sql).toContain('CREATE TABLE IF NOT EXISTS "widgets"');
    expect(queries[0].sql).toContain('data JSONB NOT NULL');
    expect(queries[1].sql).toContain('SELECT data FROM "widgets"');

    await store.getAll();
    expect(queries.filter((q) => q.sql.includes('CREATE TABLE')).length).toBe(1);
  });

  it('create inserts JSON and uses generateId when id omitted', async () => {
    const { pool, queries } = makeFakePool();
    const store = new PostgresStore({ pool, tableName: 'widgets' }, () => 'gen-9');

    const row = await store.create({ name: 'alpha' });
    expect(row).toEqual({ id: 'gen-9', name: 'alpha' });

    const insert = queries.find((q) => q.sql.includes('INSERT INTO'));
    expect(insert?.sql).toContain('"widgets"');
    expect(insert?.sql).toContain('ON CONFLICT (id) DO UPDATE');
    expect(insert?.params[0]).toBe('gen-9');
    expect(JSON.parse(String(insert?.params[1]))).toEqual({ id: 'gen-9', name: 'alpha' });
  });

  it('getById returns the JSONB row or undefined', async () => {
    const found = makeFakePool((sql) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('WHERE id = $1')) {
        return { rows: [{ data: { id: 'w1', name: 'found' } }] };
      }
      return { rows: [] };
    });
    const store = new PostgresStore({ pool: found.pool }, () => 'x');
    await expect(store.getById('w1')).resolves.toEqual({ id: 'w1', name: 'found' });

    const missing = makeFakePool((sql) =>
      sql.includes('CREATE TABLE') ? { rows: [] } : { rows: [] },
    );
    const emptyStore = new PostgresStore({ pool: missing.pool }, () => 'x');
    await expect(emptyStore.getById('missing')).resolves.toBeUndefined();
  });

  it('update merges fields and writes JSON; missing id returns undefined', async () => {
    const { pool, queries } = makeFakePool((sql) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('SELECT data') && sql.includes('WHERE id')) {
        return { rows: [{ data: { id: 'w1', name: 'old', qty: 1 } }] };
      }
      return { rows: [] };
    });
    const store = new PostgresStore({ pool, tableName: 'widgets' }, () => 'x');

    const updated = await store.update('w1', { name: 'new' });
    expect(updated).toEqual({ id: 'w1', name: 'new', qty: 1 });
    const write = queries.find((q) => q.sql.startsWith('UPDATE'));
    expect(write?.params[0]).toBe(JSON.stringify({ id: 'w1', name: 'new', qty: 1 }));
    expect(write?.params[1]).toBe('w1');

    const missing = makeFakePool((sql) =>
      sql.includes('CREATE TABLE') ? { rows: [] } : { rows: [] },
    );
    const missingStore = new PostgresStore({ pool: missing.pool }, () => 'x');
    await expect(missingStore.update('nope', { name: 'x' })).resolves.toBeUndefined();
  });

  it('delete reports rowCount; clear issues a table-wide DELETE', async () => {
    const { pool, queries } = makeFakePool((sql) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('DELETE FROM') && sql.includes('WHERE id')) {
        return { rows: [], rowCount: sql.includes('$1') ? 1 : 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    const store = new PostgresStore({ pool, tableName: 'widgets' }, () => 'x');

    await expect(store.delete('w1')).resolves.toBe(true);
    await store.clear();
    expect(
      queries.some((q) => q.sql.includes('DELETE FROM "widgets"') && !q.sql.includes('WHERE')),
    ).toBe(true);
  });

  it('routes writes through the supplied tx client instead of pool.connect', async () => {
    const poolQueries: Query[] = [];
    const txQueries: Query[] = [];
    const poolClient = {
      async query(sql: string, params: unknown[] = []) {
        poolQueries.push({ sql, params });
        return { rows: [], rowCount: 0 };
      },
      release() {},
    };
    const pool = {
      async connect() {
        return poolClient;
      },
      async end() {},
    } as unknown as Pool;
    const tx = {
      async query(sql: string, params: unknown[] = []) {
        txQueries.push({ sql, params });
        return { rows: [], rowCount: 0 };
      },
    };

    const store = new PostgresStore({ pool, tableName: 'widgets' }, () => 'tx-1');
    await store.create({ name: 'in-tx' }, tx);

    expect(poolQueries.some((q) => q.sql.includes('CREATE TABLE'))).toBe(true);
    expect(txQueries.some((q) => q.sql.includes('INSERT INTO'))).toBe(true);
    expect(poolQueries.some((q) => q.sql.includes('INSERT INTO'))).toBe(false);
  });

  it('quotes table names to block identifier injection', async () => {
    const { pool, queries } = makeFakePool();
    const store = new PostgresStore({ pool, tableName: 'evil"; drop table x;--' }, () => 'x');
    await store.getAll();
    expect(queries[0].sql).toContain('"evil""; drop table x;--"');
  });
});
