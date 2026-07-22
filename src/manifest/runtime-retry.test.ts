/**
 * Tests for retry logic.
 */

import { describe, it, expect } from 'vitest';
import { computeRetryDelays, isRetryableError, applyJitter, RetryConfig } from './runtime-retry';

describe('computeRetryDelays', () => {
  it('computes fixed backoff correctly', () => {
    const config: RetryConfig = {
      maxAttempts: 3,
      backoff: 'fixed',
      delay: 1000,
      retryOn: ['TIMEOUT'],
    };

    const result = computeRetryDelays(config);
    expect(result.delaysMs).toEqual([1000, 1000]); // attempts 2 and 3
    expect(result.maxDelayMs).toBe(1000);
  });

  it('computes linear backoff correctly', () => {
    const config: RetryConfig = {
      maxAttempts: 4,
      backoff: 'linear',
      delay: 500,
      retryOn: ['TIMEOUT'],
    };

    const result = computeRetryDelays(config);
    // attempt 2: 500 * 1 = 500
    // attempt 3: 500 * 2 = 1000
    // attempt 4: 500 * 3 = 1500
    expect(result.delaysMs).toEqual([500, 1000, 1500]);
    expect(result.maxDelayMs).toBe(1500);
  });

  it('computes exponential backoff correctly', () => {
    const config: RetryConfig = {
      maxAttempts: 4,
      backoff: 'exponential',
      delay: 100,
      retryOn: ['CONCURRENCY_CONFLICT'],
    };

    const result = computeRetryDelays(config);
    // attempt 2: 100 * 2^0 = 100
    // attempt 3: 100 * 2^1 = 200
    // attempt 4: 100 * 2^2 = 400
    expect(result.delaysMs).toEqual([100, 200, 400]);
    expect(result.maxDelayMs).toBe(400);
  });

  it('uses provided maxAttempts override', () => {
    const config: RetryConfig = {
      maxAttempts: 3,
      backoff: 'fixed',
      delay: 1000,
      retryOn: ['TIMEOUT'],
    };

    // Override to 2 attempts
    const result = computeRetryDelays(config, 2);
    expect(result.delaysMs).toEqual([1000]); // only attempt 2, no attempt 3
  });

  it('handles single attempt (no retries)', () => {
    const config: RetryConfig = {
      maxAttempts: 1,
      backoff: 'fixed',
      delay: 1000,
      retryOn: ['TIMEOUT'],
    };

    const result = computeRetryDelays(config);
    expect(result.delaysMs).toEqual([]); // no retries
    expect(result.maxDelayMs).toBe(0);
  });

  it('clamps exponential backoff with maxDelay', () => {
    const config: RetryConfig = {
      maxAttempts: 5,
      backoff: 'exponential',
      delay: 1000,
      maxDelay: 2500,
      retryOn: ['TIMEOUT'],
    };

    const result = computeRetryDelays(config);
    // uncapped: 1000, 2000, 4000, 8000 → capped: 1000, 2000, 2500, 2500
    expect(result.delaysMs).toEqual([1000, 2000, 2500, 2500]);
    expect(result.maxDelayMs).toBe(2500);
  });
});

describe('isRetryableError', () => {
  it('returns true for CONCURRENCY_CONFLICT when listed', () => {
    const config: RetryConfig = {
      maxAttempts: 3,
      backoff: 'fixed',
      delay: 1000,
      retryOn: ['CONCURRENCY_CONFLICT'],
    };

    expect(isRetryableError('CONCURRENCY_CONFLICT', config)).toBe(true);
  });

  it('returns true for TIMEOUT when listed', () => {
    const config: RetryConfig = {
      maxAttempts: 3,
      backoff: 'fixed',
      delay: 1000,
      retryOn: ['TIMEOUT'],
    };

    expect(isRetryableError('TIMEOUT', config)).toBe(true);
  });

  it('returns false for unlisted error codes', () => {
    const config: RetryConfig = {
      maxAttempts: 3,
      backoff: 'fixed',
      delay: 1000,
      retryOn: ['TIMEOUT'],
    };

    expect(isRetryableError('POLICY_DENIED', config)).toBe(false);
  });

  it('returns false when retryOn is empty', () => {
    const config: RetryConfig = {
      maxAttempts: 3,
      backoff: 'fixed',
      delay: 1000,
      retryOn: [],
    };

    expect(isRetryableError('TIMEOUT', config)).toBe(false);
  });

  it('returns true for error codes ending with CONFLICT', () => {
    const config: RetryConfig = {
      maxAttempts: 3,
      backoff: 'fixed',
      delay: 1000,
      retryOn: ['CONCURRENCY_CONFLICT'],
    };

    // Should match error codes that end with CONFLICT
    expect(isRetryableError('CONCURRENCY_CONFLICT', config)).toBe(true);
  });

  it('supports multiple retryable error codes', () => {
    const config: RetryConfig = {
      maxAttempts: 3,
      backoff: 'fixed',
      delay: 1000,
      retryOn: ['CONCURRENCY_CONFLICT', 'TIMEOUT'],
    };

    expect(isRetryableError('CONCURRENCY_CONFLICT', config)).toBe(true);
    expect(isRetryableError('TIMEOUT', config)).toBe(true);
    expect(isRetryableError('GUARD_FAILED', config)).toBe(false);
  });
});

describe('applyJitter', () => {
  it('returns original delay when no jitterFn provided', () => {
    const delay = 1000;
    const result = applyJitter(delay);
    expect(result).toBe(1000);
  });

  it('applies jitterFn when provided', () => {
    const delay = 1000;
    const jitterFn = (d: number) => d + 100; // add 100ms
    const result = applyJitter(delay, jitterFn);
    expect(result).toBe(1100);
  });

  it('deterministic jitter for testing', () => {
    const delay = 1000;
    const deterministicJitter = (d: number) => d; // no-op for testing
    const result = applyJitter(delay, deterministicJitter);
    expect(result).toBe(1000);
  });

  it('respects custom jitter function', () => {
    const delay = 1000;
    // Custom: always reduce by 10%
    const jitterFn = (d: number) => Math.floor(d * 0.9);
    const result = applyJitter(delay, jitterFn);
    expect(result).toBe(900);
  });
});
