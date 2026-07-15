/**
 * Rate limiter for commands with sliding window and burst allowance support.
 * Keyed by scope: user (context.user.id), tenant (IR tenant resolver), or global.
 *
 * Default store is in-process memory. Pass a durable {@link RateLimitStore}
 * (e.g. PostgresRateLimitStore via `RuntimeOptions.rateLimitStore`) so limits
 * survive process restarts and span multiple engine instances.
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
 * Persisted sliding-window state for one scope key.
 */
export interface RateLimitBucketState {
  timestamps: number[];
  windowStart: number;
}

/**
 * Durable (or memory) backing store for rate-limit buckets.
 * Adapters: MemoryRateLimitStore (default), PostgresRateLimitStore.
 *
 * Prefer implementing {@link mutate} for multi-writer correctness; when absent,
 * RateLimiter falls back to get+set (racy under concurrent writers).
 */
export interface RateLimitStore {
  get(scopeKey: string): Promise<RateLimitBucketState | undefined>;
  set(scopeKey: string, state: RateLimitBucketState): Promise<void>;
  /** Optional; used by tests and admin reset. */
  clear?(): Promise<void>;
  /**
   * Optional atomic read-modify-write. When present, RateLimiter uses this
   * instead of get+set so concurrent consumers share one coherent bucket.
   */
  mutate?<T>(
    scopeKey: string,
    fn: (current: RateLimitBucketState | undefined) => {
      next: RateLimitBucketState;
      result: T;
    },
  ): Promise<T>;
}

/**
 * In-memory RateLimitStore — default for tests and single-process hosts.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private logs = new Map<string, RateLimitBucketState>();

  async get(scopeKey: string): Promise<RateLimitBucketState | undefined> {
    const log = this.logs.get(scopeKey);
    if (!log) return undefined;
    return { timestamps: [...log.timestamps], windowStart: log.windowStart };
  }

  async set(scopeKey: string, state: RateLimitBucketState): Promise<void> {
    this.logs.set(scopeKey, {
      timestamps: [...state.timestamps],
      windowStart: state.windowStart,
    });
  }

  async clear(): Promise<void> {
    this.logs.clear();
  }

  async mutate<T>(
    scopeKey: string,
    fn: (current: RateLimitBucketState | undefined) => {
      next: RateLimitBucketState;
      result: T;
    },
  ): Promise<T> {
    const current = await this.get(scopeKey);
    const { next, result } = fn(current);
    await this.set(scopeKey, next);
    return result;
  }

  /** Sync size helper for tests (not part of RateLimitStore). */
  size(): number {
    return this.logs.size;
  }
}

function applyWindow(
  log: RateLimitBucketState | undefined,
  config: RateLimitConfig,
  now: number,
): RateLimitBucketState {
  if (!log) {
    return { timestamps: [], windowStart: now };
  }
  const windowEnd = log.windowStart + config.windowMs;
  if (now >= windowEnd) {
    return { timestamps: [], windowStart: now };
  }
  const cutoff = now - config.windowMs;
  return {
    timestamps: log.timestamps.filter((ts) => ts > cutoff),
    windowStart: log.windowStart,
  };
}

/**
 * Sliding window rate limiter.
 * Effective limit = maxRequests + (burstAllowance ?? 0).
 */
export class RateLimiter {
  private readonly store: RateLimitStore;

  constructor(store?: RateLimitStore) {
    this.store = store ?? new MemoryRateLimitStore();
  }

  /**
   * Check if a request should be allowed under the rate limit.
   * Prunes expired requests outside the window, then checks count.
   */
  async checkRateLimit(
    scopeKey: string,
    config: RateLimitConfig,
    now: number,
  ): Promise<RateLimitCheckResult> {
    const decide = (
      current: RateLimitBucketState | undefined,
    ): { next: RateLimitBucketState; result: RateLimitCheckResult } => {
      const log = applyWindow(current, config, now);
      const effectiveLimit = config.maxRequests + (config.burstAllowance ?? 0);
      const allowed = log.timestamps.length < effectiveLimit;

      if (allowed) {
        const next: RateLimitBucketState = {
          timestamps: [...log.timestamps, now],
          windowStart: log.windowStart,
        };
        return { next, result: { allowed: true, scopeKey } };
      }

      const oldestInWindow = log.timestamps[0];
      const retryAfterMs = Math.max(0, oldestInWindow + config.windowMs - now);
      return {
        next: log,
        result: { allowed: false, retryAfterMs, scopeKey },
      };
    };

    if (this.store.mutate) {
      return this.store.mutate(scopeKey, decide);
    }

    const current = await this.store.get(scopeKey);
    const { next, result } = decide(current);
    await this.store.set(scopeKey, next);
    return result;
  }

  async clear(): Promise<void> {
    if (this.store.clear) await this.store.clear();
  }

  async getRequestCount(scopeKey: string): Promise<number> {
    const log = await this.store.get(scopeKey);
    return log ? log.timestamps.length : 0;
  }
}
