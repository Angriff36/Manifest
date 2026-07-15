/**
 * Tests for RateLimiter (+ MemoryRateLimitStore durability seam).
 */

import { describe, it, expect } from 'vitest';
import {
  RateLimiter,
  RateLimitConfig,
  MemoryRateLimitStore,
} from './runtime-rate-limit';

describe('RateLimiter', () => {
  it('allows up to maxRequests then denies', async () => {
    const limiter = new RateLimiter();
    const config: RateLimitConfig = {
      maxRequests: 3,
      windowMs: 1000,
      scope: 'user',
    };
    for (let i = 0; i < 3; i++) {
      const result = await limiter.checkRateLimit('user:actor1', config, 1000 + i);
      expect(result.allowed).toBe(true);
    }
    const result = await limiter.checkRateLimit('user:actor1', config, 1003);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('honors burstAllowance', async () => {
    const limiter = new RateLimiter();
    const config: RateLimitConfig = {
      maxRequests: 2,
      windowMs: 1000,
      scope: 'user',
      burstAllowance: 2,
    };
    for (let i = 0; i < 4; i++) {
      const result = await limiter.checkRateLimit('user:actor1', config, 1000 + i);
      expect(result.allowed).toBe(true);
    }
    const result = await limiter.checkRateLimit('user:actor1', config, 1005);
    expect(result.allowed).toBe(false);
  });

  it('resets after window expires', async () => {
    const limiter = new RateLimiter();
    const config: RateLimitConfig = {
      maxRequests: 2,
      windowMs: 1000,
      scope: 'global',
    };
    await limiter.checkRateLimit('global', config, 1000);
    await limiter.checkRateLimit('global', config, 1001);
    let result = await limiter.checkRateLimit('global', config, 1002);
    expect(result.allowed).toBe(false);
    result = await limiter.checkRateLimit('global', config, 2001);
    expect(result.allowed).toBe(true);
  });

  it('isolates scopes', async () => {
    const limiter = new RateLimiter();
    const config: RateLimitConfig = {
      maxRequests: 2,
      windowMs: 1000,
      scope: 'user',
    };
    await limiter.checkRateLimit('user:actor1', config, 1000);
    await limiter.checkRateLimit('user:actor1', config, 1001);
    const result = await limiter.checkRateLimit('user:actor2', config, 1002);
    expect(result.allowed).toBe(true);
    const result1 = await limiter.checkRateLimit('user:actor1', config, 1003);
    expect(result1.allowed).toBe(false);
    const result2 = await limiter.checkRateLimit('user:actor2', config, 1003);
    expect(result2.allowed).toBe(true);
  });

  it('computes retryAfterMs from oldest timestamp', async () => {
    const limiter = new RateLimiter();
    const config: RateLimitConfig = {
      maxRequests: 2,
      windowMs: 1000,
      scope: 'user',
    };
    await limiter.checkRateLimit('user:actor1', config, 1000);
    await limiter.checkRateLimit('user:actor1', config, 1001);
    const result = await limiter.checkRateLimit('user:actor1', config, 1500);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBe(500);
  });

  it('prunes old timestamps within an open window', async () => {
    const limiter = new RateLimiter();
    const config: RateLimitConfig = {
      maxRequests: 2,
      windowMs: 1000,
      scope: 'user',
    };
    await limiter.checkRateLimit('user:actor1', config, 1000);
    await limiter.checkRateLimit('user:actor1', config, 1001);
    // Advance past first timestamp but not windowStart+windowMs from first windowStart
    await limiter.checkRateLimit('user:actor1', config, 2001);
    expect(await limiter.getRequestCount('user:actor1')).toBe(1);
  });

  it('shares state across RateLimiter instances via injected store', async () => {
    const store = new MemoryRateLimitStore();
    const a = new RateLimiter(store);
    const b = new RateLimiter(store);
    const config: RateLimitConfig = {
      maxRequests: 1,
      windowMs: 10_000,
      scope: 'global',
    };
    expect((await a.checkRateLimit('global', config, 1000)).allowed).toBe(true);
    expect((await b.checkRateLimit('global', config, 1001)).allowed).toBe(false);
  });

  it('tenant scope keys work', async () => {
    const limiter = new RateLimiter();
    const config: RateLimitConfig = {
      maxRequests: 1,
      windowMs: 1000,
      scope: 'tenant',
    };
    const result = await limiter.checkRateLimit('tenant:org123', config, 1000);
    expect(result.allowed).toBe(true);
    expect(result.scopeKey).toBe('tenant:org123');
  });

  it('clear empties the store', async () => {
    const limiter = new RateLimiter();
    const config: RateLimitConfig = {
      maxRequests: 1,
      windowMs: 1000,
      scope: 'user',
    };
    await limiter.checkRateLimit('user:actor1', config, 1000);
    await limiter.clear();
    const result = await limiter.checkRateLimit('user:actor1', config, 1001);
    expect(result.allowed).toBe(true);
  });
});

describe('RuntimeOptions.rateLimitStore', () => {
  it('shares command rate-limit state across RuntimeEngine instances', async () => {
    const { IRCompiler } = await import('./ir-compiler');
    const { RuntimeEngine } = await import('./runtime-engine');
    const compiler = new IRCompiler();
    const compiled = await compiler.compileToIR(`
entity Counter {
  property count: number = 0

  command bump() {
    rateLimit { maxRequests: 1 windowMs: 60000 scope: global }
    mutate count = self.count + 1
  }
}

store Counter in memory
`);
    if (!compiled.ir) {
      throw new Error(
        `Compile failed: ${compiled.diagnostics.map((d) => d.message).join('; ')}`,
      );
    }
    const store = new MemoryRateLimitStore();
    const a = new RuntimeEngine(compiled.ir, {}, { rateLimitStore: store, now: () => 1000 });
    const b = new RuntimeEngine(compiled.ir, {}, { rateLimitStore: store, now: () => 1001 });
    const first = await a.runCommand('bump', {});
    expect(first.success).toBe(true);
    const second = await b.runCommand('bump', {});
    expect(second.success).toBe(false);
    expect(second.rateLimitDenial).toBeDefined();
  });
});
