/**
 * Appendix E: retry / rateLimit field-name aliases.
 */

import { describe, expect, it } from 'vitest';
import { compileToIR } from './ir-compiler.js';
import {
  canonicalizeRateLimitField,
  canonicalizeRetryField,
  rateLimitFromPerMinute,
  rateLimitScopeFromRoot,
} from './retry-ratelimit-aliases.js';

describe('canonicalizeRetryField', () => {
  it('maps attempts and initialDelay aliases', () => {
    expect(canonicalizeRetryField('attempts')).toBe('maxAttempts');
    expect(canonicalizeRetryField('initialDelay')).toBe('delay');
    expect(canonicalizeRetryField('initialDelayMs')).toBe('delayMs');
    expect(canonicalizeRetryField('maxAttempts')).toBe('maxAttempts');
  });

  it('maps maxDelay aliases', () => {
    expect(canonicalizeRetryField('maxDelay')).toBe('maxDelay');
    expect(canonicalizeRetryField('maxDelayMs')).toBe('maxDelay');
  });

  it('rejects unknown fields', () => {
    expect(canonicalizeRetryField('banana')).toBeNull();
  });
});

describe('canonicalizeRateLimitField', () => {
  it('recognizes perMinute and strategy ergonomics', () => {
    expect(canonicalizeRateLimitField('perMinute')).toBe('perMinute');
    expect(canonicalizeRateLimitField('strategy')).toBe('strategy');
    expect(canonicalizeRateLimitField('maxRequests')).toBe('maxRequests');
  });
});

describe('rateLimit helpers', () => {
  it('expands perMinute to a 60s window', () => {
    expect(rateLimitFromPerMinute(12)).toEqual({ maxRequests: 12, windowMs: 60_000 });
  });

  it('accepts path roots for scope', () => {
    expect(rateLimitScopeFromRoot('user')).toBe('user');
    expect(rateLimitScopeFromRoot('tenant')).toBe('tenant');
    expect(rateLimitScopeFromRoot('other')).toBeNull();
  });
});

describe('parser integration — alias fields compile', () => {
  it('compiles retry aliases into IRRetry', async () => {
    const src = `
entity Job {
  property id: string
  property status: string
  command processJob() {
    retry {
      attempts: 4
      backoff: exponential
      initialDelay: 250
      maxDelay: 1000
      retryOn: "TIMEOUT"
    }
    mutate status = "done"
  }
}
`;
    const { ir, diagnostics } = await compileToIR(src);
    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    const retry = ir?.commands.find((c) => c.name === 'processJob')?.retry;
    expect(retry).toEqual(
      expect.objectContaining({
        maxAttempts: 4,
        backoff: 'exponential',
        delayMs: 250,
        maxDelayMs: 1000,
        retryOn: ['TIMEOUT'],
      }),
    );
  });

  it('compiles rateLimit perMinute + scope path + strategy', async () => {
    const src = `
entity Ping {
  property id: string
  property hits: number = 0
  command ping() {
    rateLimit {
      perMinute: 30
      scope: user.id
      strategy: sliding
    }
    mutate hits = self.hits + 1
  }
}
`;
    const { ir, diagnostics } = await compileToIR(src);
    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    const rl = ir?.commands.find((c) => c.name === 'ping')?.rateLimit;
    expect(rl).toEqual(
      expect.objectContaining({
        maxRequests: 30,
        windowMs: 60_000,
        scope: 'user',
      }),
    );
  });
});
