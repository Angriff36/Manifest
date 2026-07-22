# Implementing Custom Stores

This guide explains how to plug application storage into Manifest via `storeProvider`.

~~Authoritative adapter behavior is in `C:/Projects/Manifest/docs/spec/adapters.md`.~~

> **Correction (2026-07-15) @RYANSIGNED:** Authoritative adapter behavior is in
> `docs/spec/adapters.md` (repo-relative). Package pin SoT: `package.json` = **3.6.41**.

## Store Contract

Custom stores must implement the runtime `Store` interface used by `RuntimeEngine`.

```ts
interface Store<T extends EntityInstance = EntityInstance> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | undefined>;
  ~~create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T | undefined>;
  delete(id: string): Promise<boolean>;~~
  create(data: Partial<T>, tx?: TransactionHandle): Promise<T>;
  update(id: string, data: Partial<T>, tx?: TransactionHandle): Promise<T | undefined>;
  delete(id: string, tx?: TransactionHandle): Promise<boolean>;
  clear(): Promise<void>;
}
```

> **Correction (2026-07-15) @RYANSIGNED:** Match `Store` in `src/manifest/runtime-engine.ts` —
> `create` / `update` / `delete` accept optional `tx?: TransactionHandle` for provider-mode
> transactions. Implementations may ignore `tx` when not participating.

## Wiring with `storeProvider`

```ts
import { RuntimeEngine } from '@angriff36/manifest';
import { MyStore } from './my-store';

const runtime = new RuntimeEngine(
  ir,
  {
    user: { id: 'user-1' },
    context: { tenantId: 'tenant-1' },
  },
  {
    storeProvider: (entityName) => {
      if (entityName === 'Recipe') return new MyStore('Recipe');
      return undefined; // fall back to configured default behavior
    },
  },
);
```

## Practical Guidance

- Keep store methods deterministic for test environments.
- Enforce tenant boundaries at your storage layer if your domain requires it.
- Preserve idempotency and conflict behavior expected by command workflows.
- Surface unsupported targets as explicit diagnostics/errors rather than silent fallback.

## Validation Checklist

- ~~`npm test`~~ `pnpm test` passes with the store integrated where applicable.
- Runtime command semantics remain unchanged.
- Store failures are observable and actionable.

## Related

- ~~`C:/Projects/Manifest/docs/spec/adapters.md`~~ → `docs/spec/adapters.md`
- ~~`C:/Projects/Manifest/docs/guides/transactional-outbox.md`~~ → `docs/guides/transactional-outbox.md`
- ~~`C:/Projects/Manifest/docs/guides/embedded-runtime.md`~~ → `docs/guides/embedded-runtime.md`
