/**
 * Live-database integration tests for PostgresRateLimitStore.
 *
 * SKIPPED when `DATABASE_URL` / `MANIFEST_POSTGRES_TEST_URL` is unset.
 *
 *   pnpm run test:postgres
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { PostgresRateLimitStore } from './postgres';
import { RateLimiter, type RateLimitConfig } from '../../runtime-rate-limit';
import { postgresLiveDatabaseUrl } from '../../test/postgres-live-env';

const url = postgresLiveDatabaseUrl();
const describeLive = url ? describe : describe.skip;

const TABLE = 'manifest_rate_limit_buckets';

describeLive('PostgresRateLimitStore (live database)', () => {
  let pool: Pool;
  let store: PostgresRateLimitStore;

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
    store = new PostgresRateLimitStore({ pool });
  });

  it('set + get round-trips bucket state', async () => {
    await store.set('user:a', { timestamps: [1000, 1001], windowStart: 1000 });
    expect(await store.get('user:a')).toEqual({
      timestamps: [1000, 1001],
      windowStart: 1000,
    });
  });

  it('get of unknown key returns undefined', async () => {
    expect(await store.get('missing')).toBeUndefined();
  });

  it('RateLimiter shares durable state across instances', async () => {
    const config: RateLimitConfig = {
      maxRequests: 2,
      windowMs: 10_000,
      scope: 'global',
    };
    const a = new RateLimiter(store);
    const b = new RateLimiter(store);
    expect((await a.checkRateLimit('global', config, 1000)).allowed).toBe(true);
    expect((await b.checkRateLimit('global', config, 1001)).allowed).toBe(true);
    expect((await a.checkRateLimit('global', config, 1002)).allowed).toBe(false);
  });

  it('mutate is atomic under concurrent consumers', async () => {
    const config: RateLimitConfig = {
      maxRequests: 5,
      windowMs: 60_000,
      scope: 'user',
    };
    const limiter = new RateLimiter(store);
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => limiter.checkRateLimit('user:race', config, 10_000 + i)),
    );
    const allowed = results.filter((r) => r.allowed).length;
    expect(allowed).toBe(5);
  });
});
