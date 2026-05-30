# Adapters

Last updated: 2026-05-20
Status: Active
Authority: Binding
Enforced by: src/manifest/conformance/**, npm test
Applies to: `@angriff36/manifest@0.5.0+`

This document defines adapter hooks for storage targets and action kinds. Adapters are extensions, not core language features, unless stated otherwise.

## Storage Targets
A conforming runtime MUST support:
- `memory`

A conforming runtime MAY support:
- `localStorage`
- `postgres`
- `supabase`
- **Custom stores** (via `storeProvider` hook)

### Default Behavior
- If a store target is not supported, the runtime MUST emit a diagnostic and MUST NOT silently fall back.
- A runtime MAY fall back to `memory` semantics only when explicitly configured (implementation-defined).

### Diagnostics
- A diagnostic MUST be observable to the caller (e.g., thrown error, returned error object, emitted event, or explicit log entry) and MUST identify the unsupported target and entity.

### Nonconformance
- ~~The IR runtime currently supports `memory` and `localStorage` only and falls back to `memory` for other targets without emitting diagnostics.~~
- **RESOLVED (2026-02-05)**: Runtime now throws clear errors for unsupported storage targets (`postgres`, `supabase` in browser) at runtime-engine.ts:312-323.
- **RESOLVED (2026-02-05)**: PostgresStore and SupabaseStore are fully implemented in `src/manifest/stores.node.ts`. Server-side applications can use these stores via the `storeProvider` option in RuntimeOptions.

## Implementing Custom Adapters

Applications MAY implement custom storage adapters by:

1. Implementing the `Store` interface from runtime-engine.ts
2. Providing the store via the `storeProvider` option in RuntimeOptions

### Store Interface

```typescript
interface Store<T extends EntityInstance = EntityInstance> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | undefined>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T | undefined>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<void>;
}
```

### Using Custom Stores

```typescript
import { RuntimeEngine } from '@angriff36/manifest';
import { MyCustomStore } from './my-custom-store';

const runtime = new RuntimeEngine(ir, {
  userId: 'user-123',
  tenantId: 'tenant-456',
  storeProvider: (entityName) => {
    if (entityName === 'Recipe') {
      return new MyCustomStore({ /* config */ });
    }
    return undefined; // Use default memory store
  }
});
```

### Implementation Examples

See [guides/implementing-custom-stores.md](../guides/implementing-custom-stores.md) for complete examples:
- PrismaStore with transactional outbox
- TypeORM integration
- Drizzle integration
- Custom database adapters

### Event Collection

For transactional outbox patterns, stores MAY support event collection via the `eventCollector` option. See [guides/transactional-outbox-pattern.md](../guides/transactional-outbox.md) for details.

## Projection Adapters (e.g., Next.js)
- Projection adapters generate framework-specific outputs from IR (for example routes and templates).
- They are framework glue, not business logic.
- Projection outputs MUST remain aligned with IR/runtime semantics and MUST NOT redefine language meaning.

See also:
- `semantics.md` (Generated Artifacts / Generated Projections)
- `../patterns/usage-patterns.md`
- `../patterns/embedded-runtime-pattern.md`

## Action Adapters
The following actions are adapter hooks:
- `persist`
- `publish`
- `effect`

### Default Behavior
- If no adapter is installed for an action kind, the runtime MUST treat the action as a no-op and return the evaluated expression value.

### Optional Adapter Contracts
Implementations MAY add adapters with the following contracts:
- `persist`: persist current instance state and return a persisted value or confirmation.
- `publish`: publish the evaluated value to an external event bus.
- `effect`: invoke external side effects (HTTP, storage, timers, custom).

Adapters MUST be deterministic with respect to a deterministic runtime configuration when used in conformance tests.

### Deterministic Mode Exception (vNext)
When `RuntimeOptions.deterministicMode` is `true`, the default no-op behavior for `persist`, `publish`, and `effect` is replaced with a hard error (`ManifestEffectBoundaryError`). This enforces the effect boundary contract: adapter actions in a deterministic context are programming errors, not runtime domain failures. See `semantics.md` for the normative command execution order.

### IdempotencyStore (vNext)
A conforming runtime MAY accept an `IdempotencyStore` via `RuntimeOptions`. The `IdempotencyStore` interface provides:
- `has(key: string): Promise<boolean>` — check if a key exists
- `set(key: string, result: CommandResult): Promise<void>` — store a result
- `get(key: string): Promise<CommandResult | undefined>` — retrieve a cached result

When configured, the runtime MUST require a caller-provided `idempotencyKey` in command options. Both successful and failed `CommandResult` values are cached. The idempotency check runs before any command evaluation (see `semantics.md` for placement in the execution order).

### Nonconformance
- ~~The IR runtime treats `persist`, `publish`, and `effect` as no-ops.~~
- **CORRECT BEHAVIOR (2026-02-05)**: Per spec, the default behavior when no adapter is installed IS to treat actions as no-ops and return the evaluated expression value. The runtime correctly implements this default behavior at runtime-engine.ts:881-894.

## Canonical Dispatcher (Transport Boundary)

Manifest is transport-agnostic. The runtime accepts `(commandName, input, options)`; how those values arrive over the network is a separate concern. The `nextjs.dispatcher` projection emits the canonical HTTP shape:

```text
POST /api/manifest/{entity}/commands/{command}
```

The dispatcher route MUST:

1. Resolve `{entity}` and `{command}` against compiled IR (no string-keyed lookup tables that can drift).
2. Authenticate the caller and translate auth state into a typed `RuntimeContext` (see `semantics.md` § "Runtime Context Schema") populating at minimum `actorId` and, when present, `tenantId`/`orgId` and `requestId`.
3. Invoke `RuntimeEngine.runCommand` with the resolved entity and command.
4. Return the resulting `CommandResult` verbatim — diagnostics, guard/policy denials, and emitted events MUST NOT be reshaped by the transport.

The dispatcher is the canonical write path. Consumers SHOULD prefer it. Per-command concrete routes (the legacy `nextjs.command` projection output) remain available but are marked as deprecated aliases in their emitted code; they MUST NOT define additional semantics beyond delegating to the runtime.

The dispatcher targets Next.js 15 App Router. Dynamic route segment params are async: `ctx.params` is typed `Promise<{ entity: string; command: string }>` and MUST be `await`ed before reading. See the official Next.js route handler reference for the canonical shape.

Downstream governance integrations MAY add CI gates (via `manifest audit-governance`) that flag any non-alias direct command route.

## Audit Sink

The runtime exposes a durable audit hook as the `AuditSink` adapter (`src/manifest/audit/audit-sink.ts`). Conforming sinks:

- accept the full `AuditRecord` shape (`recordId`, `occurredAt`, `tenantId`, `orgId`, `actorId`, `requestId`, `source`, `entity`, `command`, `commandId`, `outcome`, `diagnostics`, `emittedEventNames`, `irHash`);
- MUST be idempotent against `recordId` so retries do not double-write;
- are wired in via `RuntimeOptions.auditSink`.

Outcome values: `success | guard_denied | policy_denied | constraint_failed | concurrency_conflict | missing_tenant_context | error`.

### Runtime Behavior (Implemented)

When `RuntimeOptions.auditSink` is supplied, `RuntimeEngine.runCommand` emits **exactly one `AuditRecord`** per invocation regardless of outcome — success, guard/policy/constraint failure, concurrency conflict, missing tenant context, evaluation budget overrun, or any thrown error. Emission happens in a `finally` block so unhandled errors still produce a record before propagating.

- `recordId` is generated once per `runCommand` invocation via `RuntimeOptions.generateId` (falling back to `crypto.randomUUID`).
- `occurredAt` uses `RuntimeOptions.now` (falling back to `Date.now`).
- Tenant, organization, actor, request id, and source are pulled from `RuntimeContext` when present.
- `commandId` is `"<entity>.<command>"` when an entity name is supplied, otherwise the bare command name.
- `irHash` is `ir.provenance.contentHash` when available.
- `emittedEventNames` lists every event the command emitted; absent on non-emit outcomes.
- `diagnostics` carries the structured failure (`policyDenial`, `guardFailure`, `concurrencyConflict`, `constraintOutcomes`, `error`) so downstream tooling can reason about the denial without reshaping the runtime contract.

### Failure Policy (Fail-Open)

`AuditSink.emit` errors are caught and logged to `stderr`. They MUST NOT alter `CommandResult` or block the caller — the audit subsystem is observability, not enforcement. Operators wiring durable sinks SHOULD alert on the log line `[Manifest Runtime] AuditSink.emit failed`.

### First-Party Sinks

- `MemoryAuditSink` (`src/manifest/audit/sinks/memory.ts`) — in-memory, idempotent-by-recordId. Tests + sample apps.
- `PostgresAuditSink` (`src/manifest/audit/sinks/postgres.ts`) — durable, backed by `pg`. Schema in `src/manifest/audit/sinks/postgres.sql`. Uses `INSERT … ON CONFLICT (record_id) DO NOTHING` for idempotency. Not exercised against a live database in CI — verified via mock-based unit tests; live integration tests are deferred until DB infra is added.

## Outbox Store

Durable event persistence is exposed via the `OutboxStore` adapter (`src/manifest/outbox/outbox-store.ts`):

- `enqueue(entries, tx?)` — runtime calls when a command succeeds with one or more emitted events;
- `claim(batchSize)` — dispatcher worker pulls pending entries; durable adapters SHOULD use database row-locking semantics such as `SELECT … FOR UPDATE SKIP LOCKED` (per the official PostgreSQL documentation) so concurrent workers receive disjoint batches;
- `markDelivered(ids)` / `markFailed(ids, error)` — delivery accounting.

Wire-in via `RuntimeOptions.outboxStore`.

### Runtime Behavior (Implemented)

When `RuntimeOptions.outboxStore` is supplied, `RuntimeEngine.runCommand` calls `outboxStore.enqueue(entries)` exactly once after a successful command that emits one or more events. The runtime batches all emitted events from a single `runCommand` into one `enqueue` call so durable adapters can use a single multi-row INSERT.

Each `OutboxEntry` carries the full `EmittedEvent` (name, channel, payload, timestamp, optional provenance, optional correlationId/causationId, emitIndex), a stable `entryId` (generated via `RuntimeOptions.generateId`), `enqueuedAt`, `status='pending'`, and `attempts=0`.

### Transactional Limitation (Deferred)

The current `RuntimeEngine` does **not** expose a shared transaction boundary between state mutation and outbox enqueue. The `Store` interface (`runtime-engine.ts`) does not accept a transaction handle, and `PostgresStore` (in `stores.node.ts`) opens its own connection per call via `withConnection`. As a consequence, when `runtime-engine.ts` calls `outboxStore.enqueue(entries)` after `_executeCommandInternal` returns, the enqueue runs on a **different** connection from the mutation.

This means:

- A successful command followed by an `outboxStore.enqueue` failure leaves state mutated **without** a durable outbox row. The failure is logged on stderr as `[Manifest Runtime] OutboxStore.enqueue failed` and the `CommandResult` is unchanged.
- `runtime-outbox-enqueue.test.ts` pins this behavior down with the test `demonstrates the non-transactional gap: outbox failure does NOT roll back the mutation`. Any future change that wires a real shared transaction MUST flip that assertion.

`PostgresOutboxStore.enqueue(entries, tx)` does honor a caller-supplied `tx` PoolClient — the INSERT participates in that transaction. This means a downstream worker that opens its own transaction and threads the same `PoolClient` to both a `PostgresStore` write **and** `PostgresOutboxStore.enqueue(entries, sameClient)` already gets atomicity at the adapter level. The deferred work is making `RuntimeEngine` open and thread that transaction *for* callers — which requires extending the `Store` interface with an optional `tx` parameter and refactoring `withConnection`. That refactor is out of scope until the runtime gains a first-class transaction-boundary abstraction.

### Failure Policy (Fail-Open)

`OutboxStore.enqueue` errors are caught and logged to `stderr` as `[Manifest Runtime] OutboxStore.enqueue failed`. They MUST NOT alter `CommandResult`. Operators relying on durable delivery SHOULD alert on this line.

### First-Party Stores

- `MemoryOutboxStore` (`src/manifest/outbox/stores/memory.ts`) — in-memory with `enqueue`/`claim`/`markDelivered`/`markFailed`. Claims skip already-claimed-or-resolved entries (an in-memory analogue of `FOR UPDATE SKIP LOCKED`).
- `PostgresOutboxStore` (`src/manifest/outbox/stores/postgres.ts`) — durable, backed by `pg`. Schema in `src/manifest/outbox/stores/postgres.sql`. `claim` uses `SELECT … FOR UPDATE SKIP LOCKED` combined with a `claimed_at IS NULL` filter so already-claimed rows are not re-acquired even after the lock releases. Mock-based unit-tested in CI; live integration tests live in `src/manifest/audit/sinks/postgres.live.test.ts` and `src/manifest/outbox/stores/postgres.live.test.ts` and skip unless `DATABASE_URL` is set (empty Manifest Neon DB, direct / pooler off). `CAPSULE_TEST_DATABASE_URL` is reserved for future capsule-pro cross-app tests.

### Delivery Semantics: At-Least-Once, Idempotent Consumers Required

The outbox provides **at-least-once** delivery, not exactly-once. Every consumer reading from an outbox MUST be idempotent on the event payload (typically by treating `entryId` or a domain-level idempotency key as a dedup token). The reasons:

- A worker that successfully delivers a message and then crashes before calling `markDelivered` will redeliver after stale-claim recovery.
- `releaseStaleClaims` is operator-driven; choosing the recovery window is a tradeoff between liveness (releasing too late wastes throughput) and duplication (releasing too early while the original worker is still alive produces a second delivery).
- Network retries from the consumer side can produce repeat reads even within a single worker.

Treat the outbox as a durable replay log with idempotent consumers, not as a transactional message bus.

### Crash Recovery

A dispatcher worker that claims an outbox entry but crashes before calling `markDelivered` or `markFailed` leaves the row in a stuck state: `status='pending'` with `claimed_at IS NOT NULL`. The row will never be returned from `claim` again. `PostgresOutboxStore.releaseStaleClaims(entryIds)` resets `claimed_at = NULL` for the given ids without changing `status`, so a follow-up `claim` call will pick them back up. Callers MUST be confident the worker is dead before releasing — releasing a claim held by a live worker produces a second delivery (see "Delivery Semantics" above). The `attempts` counter increments on every successful claim so operators can bound retries.

### Running Live Postgres Tests Locally

```bash
# .env: DATABASE_URL=postgresql://... (Manifest test branch, pooler off)
npm run test:postgres
```

The live suites apply the shipped `postgres.sql` schemas verbatim, run the assertions, then drop the tables — successive runs against the same database are idempotent. Default `npm test` skips them when `DATABASE_URL` is unset (CI).


