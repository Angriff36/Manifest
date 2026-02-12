# Adapters

Authority: Binding
Enforced by: src/manifest/conformance/**
Last updated: 2026-02-11

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
import { RuntimeEngine } from '@manifest/runtime';
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

### Nonconformance
- ~~The IR runtime treats `persist`, `publish`, and `effect` as no-ops.~~
- **CORRECT BEHAVIOR (2026-02-05)**: Per spec, the default behavior when no adapter is installed IS to treat actions as no-ops and return the evaluated expression value. The runtime correctly implements this default behavior at runtime-engine.ts:881-894.



