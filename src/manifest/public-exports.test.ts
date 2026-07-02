/**
 * Smoke test for the package public-export surface.
 *
 * Verifies that every adapter-related public symbol is importable through
 * the documented import paths used by package consumers. Catches accidental
 * removal of an export or a broken re-export chain before it ships.
 *
 * NOTE: these imports use the SOURCE paths (so the test runs under vitest
 * without requiring a build step). The package.json `exports` field maps
 * the same module ids to the compiled `dist/` outputs at publish time.
 */

import { describe, it, expect } from 'vitest';

// Root re-exports (consumers: `import { ... } from '@angriff36/manifest'`)
import type {
  AuditSink,
  AuditRecord,
  CommandOutcome,
  OutboxStore,
  OutboxEntry,
  OutboxEntryStatus,
} from './runtime-engine';

// Subpath: '@angriff36/manifest/audit'
import * as AuditApi from './audit/audit-sink';
// Subpath: '@angriff36/manifest/audit/memory'
import * as MemoryAuditApi from './audit/sinks/memory';
// Subpath: '@angriff36/manifest/audit/postgres'
import * as PostgresAuditApi from './audit/sinks/postgres';
// Subpath: '@angriff36/manifest/outbox'
import * as OutboxApi from './outbox/outbox-store';
// Subpath: '@angriff36/manifest/outbox/memory'
import * as MemoryOutboxApi from './outbox/stores/memory';
// Subpath: '@angriff36/manifest/outbox/postgres'
import * as PostgresOutboxApi from './outbox/stores/postgres';
// Subpath: '@angriff36/manifest/outbox/worker'
import * as OutboxWorkerApi from './outbox/worker';
// Subpath: '@angriff36/manifest/idempotency/memory'
import * as MemoryIdempotencyApi from './idempotency/stores/memory';
// Subpath: '@angriff36/manifest/idempotency/postgres'
import * as PostgresIdempotencyApi from './idempotency/stores/postgres';
// Subpath: '@angriff36/manifest/jobs/postgres'
import * as PostgresJobsApi from './jobs/stores/postgres';
// Subpath: '@angriff36/manifest/jobs/worker'
import * as JobsWorkerApi from './jobs/worker';
// Subpath: '@angriff36/manifest/schedule-worker'
import * as ScheduleWorkerApi from './schedule-worker';

describe('Public export surface', () => {
  it('exposes audit adapter contract symbols from the audit subpath', () => {
    // Types are erased at runtime, but the module must load and define
    // the value-shaped sentinels we expect (none today). The bare load
    // is the load-bearing check — if the file is renamed or its exports
    // are removed, the import above fails at compile time.
    expect(AuditApi).toBeDefined();
  });

  it('exposes the MemoryAuditSink class via audit/memory', () => {
    expect(typeof MemoryAuditApi.MemoryAuditSink).toBe('function');
    const sink = new MemoryAuditApi.MemoryAuditSink();
    expect(sink).toBeInstanceOf(MemoryAuditApi.MemoryAuditSink);
  });

  it('exposes the PostgresAuditSink class via audit/postgres', () => {
    expect(typeof PostgresAuditApi.PostgresAuditSink).toBe('function');
  });

  it('exposes outbox contract symbols from the outbox subpath', () => {
    expect(OutboxApi).toBeDefined();
  });

  it('exposes the MemoryOutboxStore class via outbox/memory', () => {
    expect(typeof MemoryOutboxApi.MemoryOutboxStore).toBe('function');
    const store = new MemoryOutboxApi.MemoryOutboxStore();
    expect(store).toBeInstanceOf(MemoryOutboxApi.MemoryOutboxStore);
  });

  it('exposes the PostgresOutboxStore class via outbox/postgres', () => {
    expect(typeof PostgresOutboxApi.PostgresOutboxStore).toBe('function');
  });

  it('exposes the outbox delivery worker module via outbox/worker', () => {
    // Bare load is the load-bearing check — a missing/renamed export breaks
    // the import above at compile time.
    expect(OutboxWorkerApi).toBeDefined();
  });

  it('exposes the MemoryIdempotencyStore class via idempotency/memory', () => {
    expect(typeof MemoryIdempotencyApi.MemoryIdempotencyStore).toBe('function');
    const store = new MemoryIdempotencyApi.MemoryIdempotencyStore();
    expect(store).toBeInstanceOf(MemoryIdempotencyApi.MemoryIdempotencyStore);
  });

  it('exposes the PostgresIdempotencyStore class via idempotency/postgres', () => {
    expect(typeof PostgresIdempotencyApi.PostgresIdempotencyStore).toBe('function');
  });

  it('exposes the postgres job store module via jobs/postgres', () => {
    expect(PostgresJobsApi).toBeDefined();
  });

  it('exposes the job worker module via jobs/worker', () => {
    expect(JobsWorkerApi).toBeDefined();
  });

  it('exposes the schedule worker module via schedule-worker', () => {
    expect(ScheduleWorkerApi).toBeDefined();
  });

  it('root re-exports the adapter contract types (compile-time check)', () => {
    // If any of these types disappear from the root, the file fails to
    // typecheck. The assertions are token usages so the import isn't
    // dead-code-eliminated.
    const _a: AuditSink = { async emit() {} };
    const _b: AuditRecord = { occurredAt: 0, command: 'x', outcome: 'success' };
    const _c: CommandOutcome = 'success';
    const _d: OutboxStore = {
      async enqueue() {},
      async claim() { return []; },
      async markDelivered() {},
      async markFailed() {},
    };
    const _e: OutboxEntry = {
      entryId: 'x',
      enqueuedAt: 0,
      event: { name: 'X', channel: 'x', payload: {}, timestamp: 0 },
      status: 'pending',
      attempts: 0,
    };
    const _f: OutboxEntryStatus = 'pending';
    expect([_a, _b, _c, _d, _e, _f]).toHaveLength(6);
  });
});
