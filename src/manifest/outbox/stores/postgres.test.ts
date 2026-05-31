/**
 * Mock-based unit tests for PostgresOutboxStore.
 *
 * No live database is required. We verify the adapter issues the expected
 * SQL — including SELECT … FOR UPDATE SKIP LOCKED for claim concurrency —
 * through a stubbed `pg`-shaped pool. Live integration testing is out of
 * scope until the repo grows DB infra.
 */

import { describe, it, expect } from 'vitest';
import { PostgresOutboxStore } from './postgres';
import type { OutboxEntry } from '../outbox-store';
import type { EmittedEvent } from '../../runtime-engine';
import type { Pool, QueryResult } from 'pg';

type Query = { sql: string; params: unknown[] };

function makeFakePool(rowsToReturn: unknown[] = []): { pool: Pool; queries: Query[] } {
  const queries: Query[] = [];
  const pool = {
    async query(sql: string, params: unknown[]) {
      queries.push({ sql, params });
      return { rows: rowsToReturn } as QueryResult;
    },
  } as unknown as Pool;
  return { pool, queries };
}

function event(name: string): EmittedEvent {
  return { name, channel: name.toLowerCase(), payload: {}, timestamp: 0 };
}

function entry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    entryId: 'e1',
    enqueuedAt: 100,
    event: event('Default'),
    status: 'pending',
    attempts: 0,
    ...overrides,
  };
}

describe('PostgresOutboxStore — enqueue', () => {
  it('issues an INSERT with ON CONFLICT DO NOTHING per entry', async () => {
    const { pool, queries } = makeFakePool();
    const store = new PostgresOutboxStore({ pool });
    await store.enqueue([entry({ entryId: 'a' }), entry({ entryId: 'b' })]);
    expect(queries).toHaveLength(2);
    expect(queries[0].sql).toContain('INSERT INTO "manifest_outbox_entries"');
    expect(queries[0].sql).toContain('ON CONFLICT (entry_id) DO NOTHING');
    expect(queries[0].params[0]).toBe('a');
    expect(queries[1].params[0]).toBe('b');
  });

  it('serializes the event payload as JSON', async () => {
    const { pool, queries } = makeFakePool();
    const store = new PostgresOutboxStore({ pool });
    await store.enqueue([entry({ entryId: 'a', event: event('Created') })]);
    expect(queries[0].params[2]).toBe(JSON.stringify(event('Created')));
  });

  it('routes the INSERT through a PoolClient when tx is supplied', async () => {
    const { pool, queries } = makeFakePool();
    const txQueries: Query[] = [];
    const txClient = {
      async query(sql: string, params: unknown[]) {
        txQueries.push({ sql, params });
        return { rows: [] };
      },
    };

    const store = new PostgresOutboxStore({ pool });
    await store.enqueue([entry({ entryId: 'tx-a' })], txClient);

    expect(txQueries).toHaveLength(1);
    expect(queries).toHaveLength(0);
  });

  it('is a no-op when entries is empty', async () => {
    const { pool, queries } = makeFakePool();
    const store = new PostgresOutboxStore({ pool });
    await store.enqueue([]);
    expect(queries).toHaveLength(0);
  });

  it('uses the configured tableName', async () => {
    const { pool, queries } = makeFakePool();
    const store = new PostgresOutboxStore({ pool, tableName: 'ob_t' });
    await store.enqueue([entry({ entryId: 'x' })]);
    expect(queries[0].sql).toContain('"ob_t"');
  });
});

describe('PostgresOutboxStore — claim', () => {
  it('uses SELECT … FOR UPDATE SKIP LOCKED for concurrent dispatcher safety', async () => {
    const { pool, queries } = makeFakePool([]);
    const store = new PostgresOutboxStore({ pool });
    await store.claim(10);
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain('FOR UPDATE SKIP LOCKED');
    // Re-claim safety: filter out rows that have already been claimed even
    // if their status is still 'pending'. Without this filter, a second
    // claim() call immediately after the first commits would re-acquire
    // the same rows.
    expect(queries[0].sql).toContain("WHERE status = 'pending' AND claimed_at IS NULL");
    expect(queries[0].sql).toContain('ORDER BY enqueued_at');
    expect(queries[0].params).toEqual([10]);
  });

  it('issues a single UPDATE statement (one implicit transaction) for claim atomicity', async () => {
    const { pool, queries } = makeFakePool([]);
    const store = new PostgresOutboxStore({ pool });
    await store.claim(10);
    // Exactly one query — the locking SELECT and the row-mutating UPDATE
    // live inside the same statement so Postgres holds the locks until the
    // UPDATE commits. No separate BEGIN/COMMIT round trips are needed.
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toMatch(/^\s*UPDATE\s/);
    expect(queries[0].sql).toContain('SET attempts = o.attempts + 1');
    expect(queries[0].sql).toContain('claimed_at = NOW()');
  });

  it('returns mapped OutboxEntry rows in result order', async () => {
    const { pool } = makeFakePool([
      {
        entry_id: 'a',
        enqueued_at: 100,
        event: event('A'),
        status: 'pending',
        attempts: 1,
        last_error: null,
      },
      {
        entry_id: 'b',
        enqueued_at: 200,
        event: event('B'),
        status: 'pending',
        attempts: 2,
        last_error: 'oops',
      },
    ]);
    const store = new PostgresOutboxStore({ pool });
    const claimed = await store.claim(5);
    expect(claimed).toEqual([
      { entryId: 'a', enqueuedAt: 100, event: event('A'), status: 'pending', attempts: 1 },
      { entryId: 'b', enqueuedAt: 200, event: event('B'), status: 'pending', attempts: 2, lastError: 'oops' },
    ]);
  });

  it('coerces enqueued_at returned as string (pg int8 default) to number', async () => {
    const { pool } = makeFakePool([
      { entry_id: 'a', enqueued_at: '100', event: event('A'), status: 'pending', attempts: 0, last_error: null },
    ]);
    const store = new PostgresOutboxStore({ pool });
    const claimed = await store.claim(1);
    expect(claimed[0].enqueuedAt).toBe(100);
  });

  it('returns [] when batchSize is 0 or negative without issuing SQL', async () => {
    const { pool, queries } = makeFakePool();
    const store = new PostgresOutboxStore({ pool });
    expect(await store.claim(0)).toEqual([]);
    expect(await store.claim(-1)).toEqual([]);
    expect(queries).toHaveLength(0);
  });
});

describe('PostgresOutboxStore — mark*', () => {
  it('markDelivered updates status to delivered and stamps delivered_at', async () => {
    const { pool, queries } = makeFakePool();
    const store = new PostgresOutboxStore({ pool });
    await store.markDelivered(['a', 'b']);
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain("status = 'delivered'");
    expect(queries[0].sql).toContain('delivered_at = NOW()');
    expect(queries[0].params).toEqual([['a', 'b']]);
  });

  it('markFailed updates status to failed, sets last_error and failed_at', async () => {
    const { pool, queries } = makeFakePool();
    const store = new PostgresOutboxStore({ pool });
    await store.markFailed(['a'], 'network timeout');
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain("status = 'failed'");
    expect(queries[0].sql).toContain('last_error = $2');
    expect(queries[0].sql).toContain('failed_at = NOW()');
    expect(queries[0].params).toEqual([['a'], 'network timeout']);
  });

  it('mark* is a no-op when entryIds is empty', async () => {
    const { pool, queries } = makeFakePool();
    const store = new PostgresOutboxStore({ pool });
    await store.markDelivered([]);
    await store.markFailed([], 'x');
    expect(queries).toHaveLength(0);
  });
});

describe('PostgresOutboxStore — releaseStaleClaims', () => {
  it('resets claimed_at to NULL only for pending rows', async () => {
    const { pool, queries } = makeFakePool();
    const store = new PostgresOutboxStore({ pool });
    await store.releaseStaleClaims(['a', 'b']);
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain('SET claimed_at = NULL');
    expect(queries[0].sql).toContain("AND status = 'pending'");
    expect(queries[0].params).toEqual([['a', 'b']]);
  });

  it('is a no-op when entryIds is empty', async () => {
    const { pool, queries } = makeFakePool();
    const store = new PostgresOutboxStore({ pool });
    await store.releaseStaleClaims([]);
    expect(queries).toHaveLength(0);
  });
});

describe('PostgresOutboxStore — subject projection', () => {
  it('includes subject_entity and subject_id columns when projectSubject is enabled', async () => {
    const { pool, queries } = makeFakePool();
    const store = new PostgresOutboxStore({ pool, projectSubject: true });
    const e = entry({
      entryId: 'sp-1',
      event: {
        name: 'Created',
        channel: 'created',
        payload: {},
        timestamp: 0,
        subject: { entity: 'User', command: 'createUser', id: 'u-1' },
      },
    });
    await store.enqueue([e]);

    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain('subject_entity');
    expect(queries[0].sql).toContain('subject_id');
    expect(queries[0].params[6]).toBe('User');
    expect(queries[0].params[7]).toBe('u-1');
  });

  it('sets subject columns to null when event has no subject', async () => {
    const { pool, queries } = makeFakePool();
    const store = new PostgresOutboxStore({ pool, projectSubject: true });
    await store.enqueue([entry({ entryId: 'sp-2' })]);

    expect(queries[0].params[6]).toBeNull();
    expect(queries[0].params[7]).toBeNull();
  });

  it('does not include subject columns when projectSubject is disabled (default)', async () => {
    const { pool, queries } = makeFakePool();
    const store = new PostgresOutboxStore({ pool });
    await store.enqueue([entry({ entryId: 'sp-3' })]);

    expect(queries[0].sql).not.toContain('subject_entity');
    expect(queries[0].sql).not.toContain('subject_id');
    expect(queries[0].params).toHaveLength(6);
  });

  it('preserves subject in JSONB event column regardless of projectSubject setting', async () => {
    const { pool, queries } = makeFakePool();
    const store = new PostgresOutboxStore({ pool, projectSubject: false });
    const e = entry({
      entryId: 'sp-4',
      event: {
        name: 'Created',
        channel: 'created',
        payload: {},
        timestamp: 0,
        subject: { entity: 'Item', command: 'createItem', id: 'i-1' },
      },
    });
    await store.enqueue([e]);

    const serialized = queries[0].params[2] as string;
    const parsed = JSON.parse(serialized);
    expect(parsed.subject).toEqual({ entity: 'Item', command: 'createItem', id: 'i-1' });
  });
});
