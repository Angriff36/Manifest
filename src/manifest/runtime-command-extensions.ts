import type { IRCommand, IRPolicy, IRRetry, IRRateLimit } from './ir.js';
import type { CommandResult } from './runtime-engine.js';
import { RateLimiter, type RateLimitConfig } from './runtime-rate-limit.js';
import {
  computeRetryDelays,
  isRetryableError,
  applyJitter,
  type RetryConfig,
} from './runtime-retry.js';

export function toRateLimitConfig(rl: IRRateLimit): RateLimitConfig {
  return {
    maxRequests: rl.maxRequests,
    windowMs: rl.windowMs,
    scope: rl.scope,
    burstAllowance: rl.burstAllowance,
  };
}

export function buildRateLimitScopeKey(
  scope: IRRateLimit['scope'],
  context: Record<string, unknown>,
  tenantValue: string | undefined,
  keyPrefix = ''
): string | null {
  const prefix = keyPrefix ? `${keyPrefix}:` : '';
  switch (scope) {
    case 'user': {
      const user = context.user as { id?: string } | null | undefined;
      if (!user?.id) return null;
      return `${prefix}user:${user.id}`;
    }
    case 'tenant': {
      if (!tenantValue) return null;
      return `${prefix}tenant:${tenantValue}`;
    }
    case 'global':
      return `${prefix}global`;
    default:
      return null;
  }
}

export function checkRateLimitGate(
  limiter: RateLimiter,
  config: IRRateLimit,
  context: Record<string, unknown>,
  tenantValue: string | undefined,
  now: number,
  keyPrefix = ''
): { allowed: true } | { allowed: false; denial: NonNullable<CommandResult['rateLimitDenial']> } {
  const scopeKey = buildRateLimitScopeKey(config.scope, context, tenantValue, keyPrefix);
  if (!scopeKey) {
    return {
      allowed: false,
      denial: {
        scope: config.scope,
        scopeKey: 'unresolved',
        limit: config.maxRequests,
        windowMs: config.windowMs,
        retryAfterMs: config.windowMs,
      },
    };
  }

  const result = limiter.checkRateLimit(scopeKey, toRateLimitConfig(config), now);
  if (result.allowed) return { allowed: true };

  return {
    allowed: false,
    denial: {
      scope: config.scope,
      scopeKey,
      limit: config.maxRequests,
      windowMs: config.windowMs,
      retryAfterMs: result.retryAfterMs ?? config.windowMs,
    },
  };
}

export function toRetryConfig(retry: IRRetry): RetryConfig {
  return {
    maxAttempts: retry.maxAttempts,
    backoff: retry.backoff,
    delay: retry.delayMs,
    jitter: retry.jitter,
    retryOn: retry.retryOn ?? [],
  };
}

export function extractRetryErrorCode(result: CommandResult): string | undefined {
  if (result.concurrencyConflict) return 'CONCURRENCY_CONFLICT';
  if (result.error?.includes('TIMEOUT')) return 'TIMEOUT';
  return undefined;
}

export async function executeWithRetry(
  retry: IRRetry,
  execute: () => Promise<CommandResult>,
  options: {
    sleep?: (ms: number) => Promise<void>;
    retryJitter?: (delayMs: number) => number;
  } = {}
): Promise<CommandResult> {
  const config = toRetryConfig(retry);
  const { delaysMs } = computeRetryDelays(config);
  const sleep = options.sleep ?? (async () => {});
  const delaysApplied: number[] = [];
  let lastErrorCode: string | undefined;
  let lastResult: CommandResult | undefined;

  for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
    const result = await execute();
    lastResult = {
      ...result,
      emittedEvents: [...result.emittedEvents],
    };

    if (result.success) {
      return {
        ...result,
        retry: {
          attempts: attempt,
          exhausted: false,
          delaysMs: delaysApplied,
        },
      };
    }

    if (result.policyDenial || result.guardFailure || result.constraintOutcomes?.some(
      o => !o.passed && !o.overridden && o.severity === 'block'
    )) {
      return result;
    }

    const errorCode = extractRetryErrorCode(result);
    lastErrorCode = errorCode;
    if (!errorCode || !isRetryableError(errorCode, config) || attempt >= retry.maxAttempts) {
      return {
        ...result,
        retry: {
          attempts: attempt,
          exhausted: attempt >= retry.maxAttempts,
          lastErrorCode: errorCode,
          delaysMs: delaysApplied,
        },
      };
    }

    const delay = delaysMs[attempt - 1] ?? 0;
    const jittered = retry.jitter
      ? applyJitter(delay, options.retryJitter ?? ((d) => d))
      : delay;
    delaysApplied.push(jittered);
    await sleep(jittered);
  }

  return {
    ...(lastResult ?? { success: false, emittedEvents: [] }),
    retry: {
      attempts: retry.maxAttempts,
      exhausted: true,
      lastErrorCode,
      delaysMs: delaysApplied,
    },
  };
}

export function commandHasRateLimit(command: IRCommand): boolean {
  return command.rateLimit !== undefined;
}

export function policyHasRateLimit(policy: IRPolicy): boolean {
  return policy.rateLimit !== undefined;
}
