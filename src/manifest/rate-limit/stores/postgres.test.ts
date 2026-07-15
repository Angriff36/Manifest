/**
 * Unit tests for PostgresRateLimitStore that do not need a live database —
 * exercise quote/parse helpers via the public API with a fake pool is heavy;
 * live coverage lives in postgres.live.test.ts. This file covers the Memory
 * re-export path and a lightweight constructor smoke for the Postgres class.
 */

import { describe, it, expect } from 'vitest';
import { MemoryRateLimitStore } from './memory';
import { PostgresRateLimitStore } from './postgres';
import { RateLimiter } from '../../runtime-rate-limit';

describe('rate-limit/memory export', () => {
  it('re-exports MemoryRateLimitStore usable by RateLimiter', async () => {
    const store = new MemoryRateLimitStore();
    const limiter = new RateLimiter(store);
    const config = { maxRequests: 1, windowMs: 1000, scope: 'global' as const };
    expect((await limiter.checkRateLimit('global', config, 1)).allowed).toBe(true);
    expect((await limiter.checkRateLimit('global', config, 2)).allowed).toBe(false);
  });
});

describe('PostgresRateLimitStore constructor', () => {
  it('accepts a pool-shaped object without connecting', () => {
    const fakePool = { query: async () => ({ rows: [], rowCount: 0 }) } as never;
    const store = new PostgresRateLimitStore({ pool: fakePool, tableName: 'rl_test' });
    expect(store).toBeInstanceOf(PostgresRateLimitStore);
  });
});
