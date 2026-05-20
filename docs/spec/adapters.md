# Adapters

Last updated: 2026-02-12
Status: Active
Authority: Binding
Enforced by: src/manifest/conformance/**, npm test

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

See [guides/implementing-custom-stores.md](../patterns/implementing-custom-stores.md) for complete examples:
- PrismaStore with transactional outbox
- TypeORM integration
- Drizzle integration
- Custom database adapters

### Event Collection

For transactional outbox patterns, stores MAY support event collection via the `eventCollector` option. See [guides/transactional-outbox-pattern.md](../patterns/transactional-outbox-pattern.md) for details.

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

## Audit Sink (Contract)

The runtime exposes a durable audit hook as the `AuditSink` adapter (`src/manifest/audit/audit-sink.ts`). Conforming sinks:

- accept the full `AuditRecord` shape (recordId, occurredAt, tenantId, orgId, actorId, requestId, source, entity, command, commandId, outcome, diagnostics, emittedEventNames, irHash);
- MUST be idempotent against `recordId` so retries do not double-write;
- are wired in via `RuntimeOptions.auditSink`.

Outcome values: `success | guard_denied | policy_denied | constraint_failed | concurrency_conflict | missing_tenant_context | error`.

In this release the option is accepted at the type level. Actual emission integration with the runtime lifecycle lands in a follow-on (see "Deferred Work" in `docs/spec/conformance.md` or the active plan). The contract is shipped now so downstream consumers can implement against it.

## Outbox Store (Contract)

Transactional event persistence is exposed via the `OutboxStore` adapter (`src/manifest/outbox/outbox-store.ts`):

- `enqueue(entries, tx?)` — runtime calls inside the mutation transaction;
- `claim(batchSize)` — dispatcher worker pulls pending entries;
- `markDelivered(ids)` / `markFailed(ids, error)` — delivery accounting.

Wire-in via `RuntimeOptions.outboxStore`. As with the audit sink, the contract is shipped now; transactional emission integration (enqueue inside the mutation transaction) is a follow-on and is currently deferred — see the active plan for status.


