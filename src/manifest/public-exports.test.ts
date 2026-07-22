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
// Subpath: '@angriff36/manifest/outbox/redis'
import * as RedisOutboxApi from './outbox/stores/redis';
// Subpath: '@angriff36/manifest/outbox/worker'
import * as OutboxWorkerApi from './outbox/worker';
// Subpath: '@angriff36/manifest/outbox/http-partner'
import * as HttpPartnerApi from './outbox/http-partner-deliverer';
// Subpath: '@angriff36/manifest/federation'
import * as FederationApi from './federation';
// Subpath: '@angriff36/manifest/idempotency/memory'
import * as MemoryIdempotencyApi from './idempotency/stores/memory';
// Subpath: '@angriff36/manifest/idempotency/postgres'
import * as PostgresIdempotencyApi from './idempotency/stores/postgres';
// Subpath: '@angriff36/manifest/rate-limit/memory'
import * as MemoryRateLimitApi from './rate-limit/stores/memory';
// Subpath: '@angriff36/manifest/rate-limit/postgres'
import * as PostgresRateLimitApi from './rate-limit/stores/postgres';
// Subpath: '@angriff36/manifest/jobs/postgres'
import * as PostgresJobsApi from './jobs/stores/postgres';
// Subpath: '@angriff36/manifest/jobs/worker'
import * as JobsWorkerApi from './jobs/worker';
// Subpath: '@angriff36/manifest/transactions/postgres'
import * as PostgresTransactionsApi from './transactions/postgres';
// Subpath: '@angriff36/manifest/schedule-worker'
import * as ScheduleWorkerApi from './schedule-worker';
// Subpath: '@angriff36/manifest/events'
import * as EventBusApi from './events/event-bus';
// Subpath: '@angriff36/manifest/events/redis'
import * as RedisEventBusApi from './events/redis';
// Subpath: '@angriff36/manifest/agent-sdk'
import * as AgentSdkApi from './agent-sdk';
import type { AgentToolResult, AnthropicTool, OpenAITool, VercelAITools } from './agent-sdk';

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

  it('exposes the RedisOutboxStore class via outbox/redis', () => {
    // Constructor is not invoked here: it dynamically imports the optional
    // `ioredis` peer and opens a connection. The type check proves the
    // subpath resolves and the class export survives.
    expect(typeof RedisOutboxApi.RedisOutboxStore).toBe('function');
  });

  it('exposes the outbox delivery worker module via outbox/worker', () => {
    // Bare load is the load-bearing check — a missing/renamed export breaks
    // the import above at compile time.
    expect(OutboxWorkerApi).toBeDefined();
  });

  it('exposes HttpPartnerDeliverer via outbox/http-partner', () => {
    expect(typeof HttpPartnerApi.HttpPartnerDeliverer).toBe('function');
    expect(typeof HttpPartnerApi.createHttpPartnerDeliverer).toBe('function');
  });

  it('exposes the MemoryIdempotencyStore class via idempotency/memory', () => {
    expect(typeof MemoryIdempotencyApi.MemoryIdempotencyStore).toBe('function');
    const store = new MemoryIdempotencyApi.MemoryIdempotencyStore();
    expect(store).toBeInstanceOf(MemoryIdempotencyApi.MemoryIdempotencyStore);
  });

  it('exposes the PostgresIdempotencyStore class via idempotency/postgres', () => {
    expect(typeof PostgresIdempotencyApi.PostgresIdempotencyStore).toBe('function');
  });

  it('exposes the MemoryRateLimitStore class via rate-limit/memory', () => {
    expect(typeof MemoryRateLimitApi.MemoryRateLimitStore).toBe('function');
    const store = new MemoryRateLimitApi.MemoryRateLimitStore();
    expect(store).toBeInstanceOf(MemoryRateLimitApi.MemoryRateLimitStore);
  });

  it('exposes the PostgresRateLimitStore class via rate-limit/postgres', () => {
    expect(typeof PostgresRateLimitApi.PostgresRateLimitStore).toBe('function');
  });

  it('exposes the postgres job store module via jobs/postgres', () => {
    expect(PostgresJobsApi).toBeDefined();
  });

  it('exposes the PostgresTransactionProvider class via transactions/postgres', () => {
    expect(typeof PostgresTransactionsApi.PostgresTransactionProvider).toBe('function');
  });

  it('exposes the job worker module via jobs/worker', () => {
    expect(JobsWorkerApi).toBeDefined();
  });

  it('exposes the schedule worker module via schedule-worker', () => {
    expect(ScheduleWorkerApi).toBeDefined();
  });

  it('exposes the MemoryEventBus class via events', () => {
    expect(typeof EventBusApi.MemoryEventBus).toBe('function');
    const bus = new EventBusApi.MemoryEventBus();
    expect(bus).toBeInstanceOf(EventBusApi.MemoryEventBus);
  });

  it('exposes the RedisEventBus class via events/redis', () => {
    // Constructor is not invoked without an injected client: it would
    // dynamically import the optional `ioredis` peer and open a connection.
    // The type check proves the subpath resolves and the class export survives.
    expect(typeof RedisEventBusApi.RedisEventBus).toBe('function');
  });

  it('exposes the federation public surface via federation', () => {
    // Discovery + invocation surface.
    expect(typeof FederationApi.FederationRegistry).toBe('function');
    expect(typeof FederationApi.FederationClient).toBe('function');
    expect(typeof FederationApi.HttpFederationTransport).toBe('function');
    // IR -> descriptor + typed-client codegen.
    expect(typeof FederationApi.buildDescriptor).toBe('function');
    expect(typeof FederationApi.generateHttpAdapter).toBe('function');
    // Policy bridge (context <-> cross-service headers).
    expect(typeof FederationApi.buildBridgeFromContext).toBe('function');
    expect(typeof FederationApi.contextFromBridgeHeaders).toBe('function');
  });

  it('exposes the agent-sdk public surface via agent-sdk', () => {
    expect(typeof AgentSdkApi.AgentRuntime).toBe('function');
    expect(typeof AgentSdkApi.toAnthropicTools).toBe('function');
    expect(typeof AgentSdkApi.toOpenAITools).toBe('function');
    expect(typeof AgentSdkApi.toVercelAITools).toBe('function');
    expect(typeof AgentSdkApi.findMatchingCommands).toBe('function');
    expect(typeof AgentSdkApi.irTypeToJsonSchema).toBe('function');
    expect(AgentSdkApi.mangleToolName('Order', 'placeOrder', 'snake')).toBe('order_placeOrder');
    expect(AgentSdkApi.parseToolName('order_placeOrder')).toEqual({
      entity: 'order',
      command: 'placeOrder',
    });
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
      async claim() {
        return [];
      },
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
    const _g: AnthropicTool = {
      name: 'manifest_list_entities',
      description: 'List entities',
      input_schema: { type: 'object' },
    };
    const _h: OpenAITool = {
      type: 'function',
      function: {
        name: 'manifest_list_entities',
        description: 'List entities',
        parameters: { type: 'object' },
      },
    };
    const _i: AgentToolResult = {
      success: true,
      code: 'SUCCESS',
      message: 'ok',
    };
    const _j: VercelAITools = {
      manifest_list_entities: {
        description: 'List entities',
        parameters: { type: 'object' },
      },
    };
    expect([_a, _b, _c, _d, _e, _f, _g, _h, _i, _j]).toHaveLength(10);
  });
});
