/**
 * Tests for command retry wiring: extractRetryErrorCode must surface the
 * structured error code of a failed command so user-declared `retryOn` codes
 * (e.g. SUPPLIER_UNAVAILABLE) actually match, not only CONCURRENCY_CONFLICT /
 * TIMEOUT.
 *
 * Spec: docs/spec/semantics.md § command retry (retryOn matching).
 */

import { describe, it, expect } from 'vitest';
import type { IRRetry } from './ir.js';
import type { CommandResult } from './runtime-engine.js';
import { extractRetryErrorCode, executeWithRetry } from './runtime-command-extensions.js';

function fail(error: string, extra: Partial<CommandResult> = {}): CommandResult {
  return { success: false, error, emittedEvents: [], ...extra };
}

function ok(): CommandResult {
  return { success: true, emittedEvents: [] };
}

describe('extractRetryErrorCode', () => {
  it('surfaces a custom structured code from the error string', () => {
    expect(extractRetryErrorCode(fail('SUPPLIER_UNAVAILABLE: upstream is down'))).toBe(
      'SUPPLIER_UNAVAILABLE',
    );
  });

  it('still maps concurrency conflicts to CONCURRENCY_CONFLICT', () => {
    const result = fail('Concurrency conflict on Order#1', {
      concurrencyConflict: {
        entityType: 'Order',
        entityId: '1',
        expectedVersion: 1,
        actualVersion: 2,
        conflictCode: 'VERSION_MISMATCH',
      },
    });
    expect(extractRetryErrorCode(result)).toBe('CONCURRENCY_CONFLICT');
  });

  it('falls back to TIMEOUT for unstructured error strings that mention TIMEOUT', () => {
    expect(extractRetryErrorCode(fail('request hit a TIMEOUT'))).toBe('TIMEOUT');
  });

  it('returns undefined for a plain prose error with no structured code', () => {
    expect(
      extractRetryErrorCode(fail('Expenses over 500 require approval override')),
    ).toBeUndefined();
  });
});

describe('executeWithRetry — custom retryOn codes', () => {
  const retry = (retryOn: string[]): IRRetry => ({
    maxAttempts: 3,
    backoff: 'fixed',
    delayMs: 0,
    retryOn,
  });

  it('retries a custom code that is listed in retryOn, then succeeds', async () => {
    let calls = 0;
    const execute = async (): Promise<CommandResult> => {
      calls++;
      return calls < 3 ? fail('SUPPLIER_UNAVAILABLE: upstream is down') : ok();
    };

    const result = await executeWithRetry(retry(['SUPPLIER_UNAVAILABLE']), execute);

    expect(result.success).toBe(true);
    expect(calls).toBe(3);
    expect(result.retry?.attempts).toBe(3);
    expect(result.retry?.exhausted).toBe(false);
  });

  it('does NOT retry a code that is not listed in retryOn', async () => {
    let calls = 0;
    const execute = async (): Promise<CommandResult> => {
      calls++;
      return fail('SUPPLIER_UNAVAILABLE: upstream is down');
    };

    const result = await executeWithRetry(retry(['CONCURRENCY_CONFLICT']), execute);

    expect(result.success).toBe(false);
    expect(calls).toBe(1);
    expect(result.retry?.lastErrorCode).toBe('SUPPLIER_UNAVAILABLE');
    expect(result.retry?.exhausted).toBe(false);
  });
});
