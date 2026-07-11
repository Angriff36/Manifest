---
title: 'Adapters API'
description: 'Public contracts and concrete implementations for stores, audit sinks, and outbox stores.'
---

> **AUTO-GENERATED REFERENCE.** This file in `docs/codedocs/` is a
> code-derived reference snapshot of repository structure and signatures.
> It is intended for tooling (Context7, search indexers, etc.) and is
> NOT verified prose on every regeneration. For normative, hand-curated
> documentation see [`docs/spec/`](../../../spec/) — in particular
> [`docs/spec/manifest-vnext.md`](../../../spec/manifest-vnext.md) for language
> semantics and [`docs/spec/config/manifest.config.md`](../../../spec/config/manifest.config.md)
> for projection configuration. Projections are described here as
> **tooling, not language semantics** — they consume IR and emit
> artifacts; they do not redefine policy/guard/constraint behaviour.

## Import Paths

```ts
import { PostgresStore, SupabaseStore } from '@angriff36/manifest/stores';
import type { PostgresConfig, SupabaseConfig } from '@angriff36/manifest/stores';

import type { AuditSink, AuditRecord, CommandOutcome } from '@angriff36/manifest/audit';
import { MemoryAuditSink } from '@angriff36/manifest/audit/memory';
import type { MemoryAuditSinkOptions } from '@angriff36/manifest/audit/memory';
import { PostgresAuditSink } from '@angriff36/manifest/audit/postgres';
import type { PostgresAuditSinkOptions } from '@angriff36/manifest/audit/postgres';

import type { OutboxStore, OutboxEntry, OutboxEntryStatus } from '@angriff36/manifest/outbox';
import { MemoryOutboxStore } from '@angriff36/manifest/outbox/memory';
import type { MemoryOutboxStoreOptions } from '@angriff36/manifest/outbox/memory';
import { PostgresOutboxStore } from '@angriff36/manifest/outbox/postgres';
import type { PostgresOutboxStoreOptions } from '@angriff36/manifest/outbox/postgres';
```

## Storage Adapters

### `PostgresStore`

Source: `src/manifest/stores.node.ts`

```ts
new PostgresStore<T extends EntityInstance>(
  config: PostgresConfig,
  generateId?: () => string
)
```

| Parameter          | Type     | Default     | Description                                         |
| ------------------ | -------- | ----------- | --------------------------------------------------- |
| `host`             | `string` | `localhost` | PostgreSQL host when `connectionString` is omitted. |
| `port`             | `number` | `5432`      | PostgreSQL port.                                    |
| `database`         | `string` | `manifest`  | Database name.                                      |
| `user`             | `string` | `postgres`  | Database user.                                      |
| `password`         | `string` | `""`        | Database password.                                  |
| `connectionString` | `string` | —           | Full PostgreSQL connection string.                  |
| `tableName`        | `string` | `entities`  | Backing table name.                                 |

Methods:

```ts
getAll(): Promise<T[]>
getById(id: string): Promise<T | undefined>
create(data: Partial<T>): Promise<T>
update(id: string, data: Partial<T>): Promise<T | undefined>
delete(id: string): Promise<boolean>
clear(): Promise<void>
close(): Promise<void>
```

### `SupabaseStore`

```ts
new SupabaseStore<T extends EntityInstance>(
  config: SupabaseConfig,
  generateId?: () => string
)
```

| Parameter   | Type     | Default    | Description                   |
| ----------- | -------- | ---------- | ----------------------------- |
| `url`       | `string` | —          | Supabase project URL.         |
| `key`       | `string` | —          | Supabase service or anon key. |
| `tableName` | `string` | `entities` | Backing table name.           |

Methods:

```ts
getAll(): Promise<T[]>
getById(id: string): Promise<T | undefined>
create(data: Partial<T>): Promise<T>
update(id: string, data: Partial<T>): Promise<T | undefined>
delete(id: string): Promise<boolean>
clear(): Promise<void>
```

Example:

```ts
const invoiceStore = new PostgresStore({
  connectionString: process.env.DATABASE_URL!,
  tableName: 'invoices',
});
```

## Audit Contracts and Sinks

### `AuditSink` and `AuditRecord`

Source: `src/manifest/audit/audit-sink.ts`

```ts
type CommandOutcome =
  | 'success'
  | 'guard_denied'
  | 'policy_denied'
  | 'constraint_failed'
  | 'concurrency_conflict'
  | 'missing_tenant_context'
  | 'error';

interface AuditRecord {
  recordId?: string;
  occurredAt: number;
  tenantId?: string;
  orgId?: string;
  actorId?: string;
  requestId?: string;
  source?: string;
  entity?: string;
  command: string;
  commandId?: string;
  outcome: CommandOutcome;
  diagnostics?: unknown;
  emittedEventNames?: string[];
  irHash?: string;
}

interface AuditSink {
  emit(record: AuditRecord): Promise<void>;
}
```

### `MemoryAuditSink`

```ts
new MemoryAuditSink(opts?: MemoryAuditSinkOptions)
emit(record: AuditRecord): Promise<void>
list(): AuditRecord[]
size(): number
findByRecordId(recordId: string): AuditRecord | undefined
clear(): void
```

### `PostgresAuditSink`

```ts
new PostgresAuditSink(opts: PostgresAuditSinkOptions)
emit(record: AuditRecord, client?: PoolClient): Promise<void>
```

| Parameter   | Type     | Default                  | Description           |
| ----------- | -------- | ------------------------ | --------------------- |
| `pool`      | `Pool`   | —                        | Shared `pg` pool.     |
| `tableName` | `string` | `manifest_audit_records` | Audit table override. |

Example:

```ts
const auditSink = new PostgresAuditSink({ pool });
```

## Outbox Contracts and Stores

### `OutboxStore` and `OutboxEntry`

Source: `src/manifest/outbox/outbox-store.ts`

```ts
type OutboxEntryStatus = 'pending' | 'delivered' | 'failed';

interface OutboxEntry {
  entryId: string;
  enqueuedAt: number;
  event: EmittedEvent;
  status: OutboxEntryStatus;
  attempts: number;
  lastError?: string;
}

interface OutboxStore {
  enqueue(entries: OutboxEntry[], tx?: unknown): Promise<void>;
  claim(batchSize: number): Promise<OutboxEntry[]>;
  markDelivered(entryIds: string[]): Promise<void>;
  markFailed(entryIds: string[], error: string): Promise<void>;
}
```

### `MemoryOutboxStore`

```ts
new MemoryOutboxStore(opts?: MemoryOutboxStoreOptions)
enqueue(entries: OutboxEntry[], tx?: unknown): Promise<void>
claim(batchSize: number): Promise<OutboxEntry[]>
markDelivered(entryIds: string[]): Promise<void>
markFailed(entryIds: string[], error: string): Promise<void>
list(): OutboxEntry[]
size(): number
releaseClaim(entryIds: string[]): void
clear(): void
```

### `PostgresOutboxStore`

```ts
new PostgresOutboxStore(opts: PostgresOutboxStoreOptions)
enqueue(entries: OutboxEntry[], tx?: unknown): Promise<void>
claim(batchSize: number): Promise<OutboxEntry[]>
releaseStaleClaims(entryIds: string[]): Promise<void>
markDelivered(entryIds: string[]): Promise<void>
markFailed(entryIds: string[], error: string): Promise<void>
```

| Parameter   | Type     | Default                   | Description            |
| ----------- | -------- | ------------------------- | ---------------------- |
| `pool`      | `Pool`   | —                         | Shared `pg` pool.      |
| `tableName` | `string` | `manifest_outbox_entries` | Outbox table override. |

## Combined Example

```ts
const runtime = new RuntimeEngine(ir, context, {
  storeProvider: (entityName) =>
    entityName === 'Invoice'
      ? new PostgresStore({ connectionString: process.env.DATABASE_URL!, tableName: 'invoices' })
      : undefined,
  auditSink: new PostgresAuditSink({ pool }),
  outboxStore: new PostgresOutboxStore({ pool }),
});
```

These adapters are the public extension points you combine most often in production deployments.
