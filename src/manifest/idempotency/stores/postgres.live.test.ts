/**
 * Live-database integration tests for PostgresIdempotencyStore.
 *
 * SKIPPED when `DATABASE_URL` is unset. Use the empty Manifest Neon DB
 * (direct connection, pooler off). `MANIFEST_POSTGRES_TEST_URL` is still accepted.
 *
 *   npm run test:postgres
 *
 * Covers schema apply, set/get/has round-trip preserving the CommandResult
 * shape, first-write-wins on duplicate set, and misses returning
 * undefined/false. CI is unaffected because the suite skips when the env var
 * is absent.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { PostgresIdempotencyStore } from './postgres';
import type { CommandResult } from '../../runtime-engine';
import { postgresLiveDatabaseUrl } from '../../test/postgres-live-env';

const url = postgresLiveDatabaseUrl();
const describeLive = url ? describe : describe.skip;

const TABLE = 'manifest_idempotency_keys';

function result(overrides: Partial<CommandResult> = {}): CommandResult {
  return {
    success: true,
    result: { status: 'claimed', by: 'user-1' },
    emittedEvents: [
      { name: 'Claimed', channel: 'claimed', payload: { taskId: 't1' }, timestamp: 0 },
    ],
    ...overrides,
  };
}

describeLive('PostgresIdempotencyStore (live database)', () => {
  let pool: Pool;
  let store: PostgresIdempotencyStore;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    const schema = readFileSync(resolve(__dirname, 'postgres.sql'), 'utf8');
    await pool.query(`DROP TABLE IF EXISTS ${TABLE} CASCADE`);
    await pool.query(schema);
  });

  afterAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS ${TABLE} CASCADE`);
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE ${TABLE}`);
    store = new PostgresIdempotencyStore({ pool });
  });

  it('set + get round-trips the CommandResult shape', async () => {
    const stored = result();
    await store.set('k1', stored);
    const loaded = await store.get('k1');
    expect(loaded).toEqual(stored);
  });

  it('has reflects presence', async () => {
    expect(await store.has('k1')).toBe(false);
    await store.set('k1', result());
    expect(await store.has('k1')).toBe(true);
  });

  it('get of an unknown key returns undefined', async () => {
    expect(await store.get('nope')).toBeUndefined();
  });

  it('duplicate set leaves the first result (ON CONFLICT DO NOTHING)', async () => {
    const first = result({ result: { status: 'first' } });
    const second = result({ success: false, error: 'second', result: undefined });
    await store.set('k1', first);
    await store.set('k1', second);
    expect(await store.get('k1')).toEqual(first);
  });
});
