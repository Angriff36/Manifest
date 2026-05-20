/**
 * Live-database integration tests for PostgresOutboxStore.
 *
 * SKIPPED by default. Set `MANIFEST_POSTGRES_TEST_URL` to a writable
 * PostgreSQL connection string to run:
 *
 *   MANIFEST_POSTGRES_TEST_URL=postgres://user:pass@localhost:5432/manifest_test \
 *     npx vitest run src/manifest/outbox/stores/postgres.live.test.ts
 *
 * Covers schema apply, enqueue idempotency, claim concurrency disjointness
 * (the load-bearing concurrency claim documented in adapters.md), and
 * mark*. CI is unaffected because the suite skips when the env var is
 * absent.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { PostgresOutboxStore } from './postgres';
import type { OutboxEntry } from '../outbox-store';
import type { EmittedEvent } from '../../runtime-engine';

const url = process.env.MANIFEST_POSTGRES_TEST_URL;
const describeLive = url ? describe : describe.skip;

const TABLE = 'manifest_outbox_entries';

function event(name: string): EmittedEvent {
  return { name, channel: name.toLowerCase(), payload: { ts: 0 }, timestamp: 0 };
}

function entry(id: string, name: string, enqueuedAt = 0): OutboxEntry {
  return {
    entryId: id,
    enqueuedAt,
    event: event(name),
    status: 'pending',
    attempts: 0,
  };
}

describeLive('PostgresOutboxStore (live database)', () => {
  let pool: Pool;
  let store: PostgresOutboxStore;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    const schema = readFileSync(
      resolve(__dirname, 'postgres.sql'),
      'utf8'
    );
    await pool.query(`DROP TABLE IF EXISTS ${TABLE} CASCADE`);
    await pool.query(schema);
  });

  afterAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS ${TABLE} CASCADE`);
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE ${TABLE}`);
    store = new PostgresOutboxStore({ pool });
  });

  it('enqueue + claim returns the entry exactly once', async () => {
    await store.enqueue([entry('a', 'A', 1)]);
    const first = await store.claim(10);
    expect(first.map(e => e.entryId)).toEqual(['a']);
    const second = await store.claim(10);
    // After commit, claimed_at IS NOT NULL → claim returns nothing.
    expect(second).toEqual([]);
  });

  it('claim returns entries in FIFO order by enqueued_at', async () => {
    await store.enqueue([
      entry('c', 'C', 300),
      entry('a', 'A', 100),
      entry('b', 'B', 200),
    ]);
    const claimed = await store.claim(10);
    expect(claimed.map(e => e.entryId)).toEqual(['a', 'b', 'c']);
  });

  it('concurrent claim calls receive disjoint batches (SKIP LOCKED works)', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `e${i}`);
    await store.enqueue(ids.map((id, i) => entry(id, 'E', i)));

    // Fire two claim() calls in parallel. SKIP LOCKED + the
    // claimed_at IS NULL filter MUST guarantee no overlap.
    const [batchA, batchB] = await Promise.all([
      store.claim(10),
      store.claim(10),
    ]);
    const idsA = batchA.map(e => e.entryId);
    const idsB = batchB.map(e => e.entryId);
    const overlap = idsA.filter(id => idsB.includes(id));
    expect(overlap).toEqual([]);
    // Together they cover all 20.
    expect(new Set([...idsA, ...idsB]).size).toBe(20);
  });

  it('markDelivered makes the entry never re-claim', async () => {
    await store.enqueue([entry('a', 'A', 1)]);
    const claimed = await store.claim(1);
    await store.markDelivered(claimed.map(e => e.entryId));
    const second = await store.claim(10);
    expect(second).toEqual([]);
    const { rows } = await pool.query(
      `SELECT status, delivered_at FROM ${TABLE} WHERE entry_id = $1`,
      ['a']
    );
    expect(rows[0].status).toBe('delivered');
    expect(rows[0].delivered_at).not.toBeNull();
  });

  it('markFailed records lastError and stamps failed_at', async () => {
    await store.enqueue([entry('a', 'A', 1)]);
    await store.claim(1);
    await store.markFailed(['a'], 'network timeout');
    const { rows } = await pool.query(
      `SELECT status, last_error, failed_at FROM ${TABLE} WHERE entry_id = $1`,
      ['a']
    );
    expect(rows[0].status).toBe('failed');
    expect(rows[0].last_error).toBe('network timeout');
    expect(rows[0].failed_at).not.toBeNull();
  });

  it('enqueue is idempotent on entry_id', async () => {
    await store.enqueue([entry('dup', 'A', 1)]);
    await store.enqueue([entry('dup', 'A-changed', 999)]);
    const { rows } = await pool.query(
      `SELECT event FROM ${TABLE} WHERE entry_id = $1`,
      ['dup']
    );
    expect(rows).toHaveLength(1);
    // First write wins.
    expect((rows[0].event as EmittedEvent).name).toBe('A');
  });

  it('releaseStaleClaims allows a crashed worker entries to be re-delivered', async () => {
    await store.enqueue([entry('a', 'A', 1)]);
    const first = await store.claim(1);
    expect(first.map(e => e.entryId)).toEqual(['a']);
    // Simulate a worker crash: rows remain pending with claimed_at set.
    await store.releaseStaleClaims(['a']);
    const second = await store.claim(1);
    expect(second.map(e => e.entryId)).toEqual(['a']);
    // attempts keeps growing across claims — operators can use this to
    // bound retries.
    expect(second[0].attempts).toBe(2);
  });
});
