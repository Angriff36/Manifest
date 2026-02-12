# Implementing Custom Stores

This guide explains how to plug application storage into Manifest via `storeProvider`.

Authoritative adapter behavior is in `C:/Projects/Manifest/docs/spec/adapters.md`.

## Store Contract

Custom stores must implement the runtime `Store` interface used by `RuntimeEngine`.

```ts
interface Store<T extends EntityInstance = EntityInstance> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | undefined>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T | undefined>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<void>;
}
```

## Wiring with `storeProvider`

```ts
import { RuntimeEngine } from '@manifest/runtime';
import { MyStore } from './my-store';

const runtime = new RuntimeEngine(ir, {
  user: { id: 'user-1' },
  context: { tenantId: 'tenant-1' }
}, {
  storeProvider: (entityName) => {
    if (entityName === 'Recipe') return new MyStore('Recipe');
    return undefined; // fall back to configured default behavior
  }
});
```

## Practical Guidance

- Keep store methods deterministic for test environments.
- Enforce tenant boundaries at your storage layer if your domain requires it.
- Preserve idempotency and conflict behavior expected by command workflows.
- Surface unsupported targets as explicit diagnostics/errors rather than silent fallback.

## Validation Checklist

- `npm test` passes with the store integrated where applicable.
- Runtime command semantics remain unchanged.
- Store failures are observable and actionable.

## Related

- `C:/Projects/Manifest/docs/spec/adapters.md`
- `C:/Projects/Manifest/docs/guides/transactional-outbox-pattern.md`
- `C:/Projects/Manifest/docs/guides/embedded-runtime-pattern.md`