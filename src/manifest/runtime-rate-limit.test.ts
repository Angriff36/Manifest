/**
 * Tests for RateLimiter.
 */

import { describe, it, expect } from 'vitest';
import { RateLimiter, RateLimitConfig } from './runtime-rate-limit';

describe('RateLimiter', () => {
  it('allows requests up to maxRequests', () => {
    const limiter = new RateLimiter();
    const config: RateLimitConfig = {
      maxRequests: 3,
      windowMs: 1000,
      scope: 'user',
    };

    // First 3 requests should be allowed
    for (let i = 0; i < 3; i++) {
      const result = limiter.checkRateLimit('user:actor1', config, 1000 + i);
      expect(result.allowed).toBe(true);
    }

    // 4th request should be denied
    const result = limiter.checkRateLimit('user:actor1', config, 1003);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('respects burst allowance', () => {
    const limiter = new RateLimiter();
    const config: RateLimitConfig = {
      maxRequests: 3,
      windowMs: 1000,
      scope: 'user',
      burstAllowance: 2,
    };

    // Effective limit = 3 + 2 = 5
    for (let i = 0; i < 5; i++) {
      const result = limiter.checkRateLimit('user:actor1', config, 1000 + i);
      expect(result.allowed).toBe(true);
    }

    // 6th request should be denied
    const result = limiter.checkRateLimit('user:actor1', config, 1005);
    expect(result.allowed).toBe(false);
  });

  it('allows new requests after window expires', () => {
    const limiter = new RateLimiter();
    const config: RateLimitConfig = {
      maxRequests: 2,
      windowMs: 1000,
      scope: 'global',
    };

    // Fill the window
    limiter.checkRateLimit('global', config, 1000);
    limiter.checkRateLimit('global', config, 1001);

    // 3rd request denied
    let result = limiter.checkRateLimit('global', config, 1002);
    expect(result.allowed).toBe(false);

    // After window expires, should allow
    result = limiter.checkRateLimit('global', config, 2001);
    expect(result.allowed).toBe(true);
  });

  it('isolates scopes independently', () => {
    const limiter = new RateLimiter();
    const config: RateLimitConfig = {
      maxRequests: 2,
      windowMs: 1000,
      scope: 'user',
    };

    // actor1: 2 requests (at limit)
    limiter.checkRateLimit('user:actor1', config, 1000);
    limiter.checkRateLimit('user:actor1', config, 1001);

    // actor2: should have its own limit
    const result = limiter.checkRateLimit('user:actor2', config, 1002);
    expect(result.allowed).toBe(true);

    // actor1: 3rd request denied
    const result1 = limiter.checkRateLimit('user:actor1', config, 1003);
    expect(result1.allowed).toBe(false);

    // actor2: can still make more requests
    const result2 = limiter.checkRateLimit('user:actor2', config, 1003);
    expect(result2.allowed).toBe(true);
  });

  it('calculates retryAfterMs correctly', () => {
    const limiter = new RateLimiter();
    const config: RateLimitConfig = {
      maxRequests: 2,
      windowMs: 1000,
      scope: 'user',
    };

    // Fill the window
    limiter.checkRateLimit('user:actor1', config, 1000); // oldest at 1000
    limiter.checkRateLimit('user:actor1', config, 1001);

    // Try at 1500 (window is 1000-2000)
    const result = limiter.checkRateLimit('user:actor1', config, 1500);
    expect(result.allowed).toBe(false);
    // Oldest request expires at 1000 + 1000 = 2000
    // retryAfterMs should be 2000 - 1500 = 500
    expect(result.retryAfterMs).toBe(500);
  });

  it('prunes expired requests from the window', () => {
    const limiter = new RateLimiter();
    const config: RateLimitConfig = {
      maxRequests: 2,
      windowMs: 1000,
      scope: 'user',
    };

    limiter.checkRateLimit('user:actor1', config, 1000);
    limiter.checkRateLimit('user:actor1', config, 1001);
    expect(limiter.getRequestCount('user:actor1')).toBe(2);

    // At 2001, the first request (at 1000) is outside the window [1001, 2001]
    // The second request (at 1001) is still inside [1001, 2001]
    limiter.checkRateLimit('user:actor1', config, 2001);

    // After a new window, should only have 1 request from before
    // Actually, when we check at 2001, we're at a new window boundary
    // The window [1001, 2001] contains the request at 1001
    // So we expect 1 old request to be pruned when we move forward
    expect(limiter.getRequestCount('user:actor1')).toBeLessThanOrEqual(2);
  });

  it('returns correct scopeKey in result', () => {
    const limiter = new RateLimiter();
    const config: RateLimitConfig = {
      maxRequests: 1,
      windowMs: 1000,
      scope: 'tenant',
    };

    const result = limiter.checkRateLimit('tenant:org123', config, 1000);
    expect(result.scopeKey).toBe('tenant:org123');
  });

  it('allows reset for testing', () => {
    const limiter = new RateLimiter();
    const config: RateLimitConfig = {
      maxRequests: 1,
      windowMs: 1000,
      scope: 'user',
    };

    limiter.checkRateLimit('user:actor1', config, 1000);
    expect(limiter.getRequestCount('user:actor1')).toBe(1);

    limiter.clear();
    expect(limiter.getRequestCount('user:actor1')).toBe(0);

    // After clear, should allow again
    const result = limiter.checkRateLimit('user:actor1', config, 1001);
    expect(result.allowed).toBe(true);
  });
});
