/**
 * Rate limiter for commands with sliding window and burst allowance support.
 * Keyed by scope: user (context.user.id), tenant (IR tenant resolver), or global.
 * Per-engine in-memory store ensures determinism in testing.
 *
 * Spec: docs/spec/semantics.md § "Rate Limiting"
 */

/**
 * Result of a rate limit check.
 */
export interface RateLimitCheckResult {
  allowed: boolean;
  retryAfterMs?: number;
  scopeKey: string;
}

/**
 * Configuration for rate limiting (from IR).
 */
export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  scope: 'user' | 'tenant' | 'global';
  burstAllowance?: number;
}

/**
 * In-memory record of requests for a scope key within the current window.
 */
interface ScopeRequestLog {
  timestamps: number[];
  windowStart: number;
}

/**
 * Sliding window rate limiter.
 * Maintains per-scope request logs in memory.
 * Effective limit = maxRequests + (burstAllowance ?? 0).
 */
export class RateLimiter {
  private logs: Map<string, ScopeRequestLog> = new Map();

  /**
   * Check if a request should be allowed under the rate limit.
   * Prunes expired requests outside the window, then checks count.
   * Effective limit = maxRequests + burstAllowance.
   *
   * @param scopeKey - Unique key for this scope (e.g., "user:actor123", "tenant:org456", "global")
   * @param config - Rate limit configuration
   * @param now - Current timestamp (ms)
   * @returns { allowed, retryAfterMs?, scopeKey }
   */
  checkRateLimit(scopeKey: string, config: RateLimitConfig, now: number): RateLimitCheckResult {
    let log = this.logs.get(scopeKey);

    // Initialize or reset window if needed
    if (!log) {
      log = { timestamps: [], windowStart: now };
      this.logs.set(scopeKey, log);
    }

    // Prune requests outside the current window
    const windowEnd = log.windowStart + config.windowMs;
    if (now >= windowEnd) {
      // Window has expired; start fresh
      log.timestamps = [];
      log.windowStart = now;
    } else {
      // Remove timestamps older than the window
      const cutoff = now - config.windowMs;
      log.timestamps = log.timestamps.filter(ts => ts > cutoff);
    }

    const effectiveLimit = config.maxRequests + (config.burstAllowance ?? 0);
    const allowed = log.timestamps.length < effectiveLimit;

    if (allowed) {
      log.timestamps.push(now);
      return { allowed: true, scopeKey };
    }

    // Denied: calculate retry-after
    // Retry after the oldest request in the window exits
    const oldestInWindow = log.timestamps[0];
    const retryAfterMs = Math.max(0, oldestInWindow + config.windowMs - now);

    return { allowed: false, retryAfterMs, scopeKey };
  }

  /**
   * Clear all tracked request logs (useful for testing).
   */
  clear(): void {
    this.logs.clear();
  }

  /**
   * Get current request count for a scope (for diagnostics/testing).
   */
  getRequestCount(scopeKey: string): number {
    const log = this.logs.get(scopeKey);
    return log ? log.timestamps.length : 0;
  }
}
