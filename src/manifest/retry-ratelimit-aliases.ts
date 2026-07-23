/**
 * Appendix E ergonomics: accept common doc/snippet field names for retry /
 * rateLimit blocks and lower them to the canonical IR field names.
 */

export type CanonicalRetryField =
  'maxAttempts' | 'backoff' | 'delay' | 'delayMs' | 'maxDelay' | 'jitter' | 'retryOn';

export type CanonicalRateLimitField =
  'maxRequests' | 'windowMs' | 'scope' | 'burstAllowance' | 'perMinute' | 'strategy';

/** Map author-facing retry field names to canonical ones. Unknown → null. */
export function canonicalizeRetryField(field: string): CanonicalRetryField | null {
  switch (field) {
    case 'maxAttempts':
    case 'attempts':
      return 'maxAttempts';
    case 'backoff':
      return 'backoff';
    case 'delay':
    case 'initialDelay':
      return 'delay';
    case 'delayMs':
    case 'initialDelayMs':
      return 'delayMs';
    case 'maxDelay':
    case 'maxDelayMs':
      return 'maxDelay';
    case 'jitter':
      return 'jitter';
    case 'retryOn':
      return 'retryOn';
    default:
      return null;
  }
}

/** Map author-facing rateLimit field names to canonical ones. Unknown → null. */
export function canonicalizeRateLimitField(field: string): CanonicalRateLimitField | null {
  switch (field) {
    case 'maxRequests':
      return 'maxRequests';
    case 'windowMs':
      return 'windowMs';
    case 'scope':
      return 'scope';
    case 'burstAllowance':
      return 'burstAllowance';
    case 'perMinute':
      return 'perMinute';
    case 'strategy':
      return 'strategy';
    default:
      return null;
  }
}

/** `perMinute: N` → maxRequests N over a 60s window. */
export function rateLimitFromPerMinute(perMinute: number): {
  maxRequests: number;
  windowMs: number;
} {
  return { maxRequests: perMinute, windowMs: 60_000 };
}

/**
 * Bare `user` / `tenant` / `global`, or path roots like `user.id` → scope enum.
 */
export function rateLimitScopeFromRoot(root: string): 'user' | 'tenant' | 'global' | null {
  if (root === 'user' || root === 'tenant' || root === 'global') return root;
  return null;
}
