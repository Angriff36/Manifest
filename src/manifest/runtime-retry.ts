/**
 * Command retry logic: deterministic backoff schedules (fixed, linear, exponential)
 * with optional jitter, and retryable error classification.
 *
 * Spec: docs/spec/semantics.md § "Retry Logic"
 */

/**
 * Configuration for command retry (from IR).
 */
export interface RetryConfig {
  maxAttempts: number;
  backoff: 'fixed' | 'linear' | 'exponential';
  delay: number; // base delay in ms
  /** Optional cap applied to each computed backoff delay (ms). */
  maxDelay?: number;
  jitter?: boolean;
  retryOn: string[]; // error codes to retry on (e.g., ["CONCURRENCY_CONFLICT", "TIMEOUT"])
}

/**
 * Result from computing retry delays.
 */
export interface RetryDelayResult {
  delaysMs: number[]; // delays for each retry attempt (index 0 = first retry)
  maxDelayMs: number; // maximum delay in the schedule
}

/**
 * Compute deterministic retry delay schedule.
 * Returns delays for each retry attempt (attempt 2, 3, ..., maxAttempts).
 *
 * @param config - Retry configuration
 * @param maxAttempts - Maximum number of attempts (overrides config if provided)
 * @returns { delaysMs, maxDelayMs }
 *
 * @example
 * ```
 * // Fixed: [1000, 1000, 1000] for 3 retries
 * computeRetryDelays({ backoff: 'fixed', delay: 1000, ... }, 3)
 *
 * // Linear: [1000, 2000, 3000] for 3 retries
 * computeRetryDelays({ backoff: 'linear', delay: 1000, ... }, 3)
 *
 * // Exponential: [1000, 2000, 4000] for 3 retries
 * computeRetryDelays({ backoff: 'exponential', delay: 1000, ... }, 3)
 * ```
 */
export function computeRetryDelays(config: RetryConfig, maxAttempts?: number): RetryDelayResult {
  const attempts = maxAttempts ?? config.maxAttempts;
  const delaysMs: number[] = [];
  let maxDelayMs = 0;

  // Compute delays for attempts 2 through maxAttempts
  // (attempt 1 is the initial attempt, no delay before it)
  for (let attempt = 2; attempt <= attempts; attempt++) {
    let delay: number;

    switch (config.backoff) {
      case 'fixed':
        delay = config.delay;
        break;

      case 'linear':
        delay = config.delay * (attempt - 1);
        break;

      case 'exponential':
        delay = config.delay * Math.pow(2, attempt - 2);
        break;

      default:
        delay = config.delay;
    }

    if (config.maxDelay !== undefined) {
      delay = Math.min(delay, config.maxDelay);
    }

    delaysMs.push(delay);
    maxDelayMs = Math.max(maxDelayMs, delay);
  }

  return { delaysMs, maxDelayMs };
}

/**
 * Determine if an error code is retryable given the retry config.
 * An error code is retryable when it appears in `config.retryOn`. The two
 * built-in codes (CONCURRENCY_CONFLICT, TIMEOUT) are surfaced by
 * `extractRetryErrorCode`, but any structured error code a command raises
 * (e.g. SUPPLIER_UNAVAILABLE) is equally retryable once listed in `retryOn`.
 *
 * @param errorCode - The error code (from CommandResult, via extractRetryErrorCode)
 * @param config - Retry configuration
 * @returns true if the error should trigger a retry
 */
export function isRetryableError(errorCode: string, config: RetryConfig): boolean {
  if (!config.retryOn || config.retryOn.length === 0) {
    return false;
  }
  // Normalize CONCURRENCY_CONFLICT checks: if errorCode ends with CONFLICT, match it
  if (config.retryOn.includes('CONCURRENCY_CONFLICT')) {
    if (errorCode === 'CONCURRENCY_CONFLICT' || errorCode.endsWith('CONFLICT')) {
      return true;
    }
  }
  return config.retryOn.includes(errorCode);
}

/**
 * Apply optional jitter to a delay.
 * Jitter introduces randomness to prevent thundering herd.
 *
 * @param delayMs - Base delay in milliseconds
 * @param jitterFn - Optional jitter function; if not provided, no jitter is applied
 * @returns Jittered delay in milliseconds
 */
export function applyJitter(delayMs: number, jitterFn?: (delayMs: number) => number): number {
  return jitterFn ? jitterFn(delayMs) : delayMs;
}

/**
 * Default jitter function: random ±10%.
 * Safe for deterministic testing when overridden with a deterministic callback.
 */
export function defaultJitterFn(delayMs: number): number {
  const jitterRange = delayMs * 0.1; // ±10% of the delay
  const jitter = (Math.random() - 0.5) * 2 * jitterRange;
  return Math.max(0, delayMs + jitter);
}
