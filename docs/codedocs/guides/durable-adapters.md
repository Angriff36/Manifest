---
title: "Durable Adapters"
description: "Wire PostgreSQL-backed storage, audit, and outbox adapters into a Manifest runtime."
---

> **AUTO-GENERATED REFERENCE.** This file in `docs/codedocs/` is a
> code-derived reference snapshot of repository structure and signatures.
> It is intended for tooling (Context7, search indexers, etc.) and is
> NOT verified prose on every regeneration. For normative, hand-curated
> documentation see [`docs/spec/`](../../spec/) — in particular
> [`docs/spec/manifest-vnext.md`](../../spec/manifest-vnext.md) for language
> semantics and [`docs/spec/config/manifest.config.md`](../../spec/config/manifest.config.md)
> for projection configuration. Projections are described here as
> **tooling, not language semantics** — they consume IR and emit
> artifacts; they do not redefine policy/guard/constraint behaviour.


Use this guide when you want a production-oriented runtime setup with durable state, durable audit records, and an outbox queue for downstream delivery.

## Problem

In-memory adapters are perfect for tests and local exploration, but they are not durable. Production applications typically need persistent entity storage, exactly one audit attempt record per command invocation, and a queue that can be claimed by worker processes.

## Solution

Use `PostgresStore` through `storeProvider`, and wire `PostgresAuditSink` plus `PostgresOutboxStore` through `RuntimeOptions`.

<Steps>
<Step>
### Create database-backed adapters

```ts
import { Pool } from 'pg';
import { PostgresStore } from '@angriff36/manifest/stores';
import { PostgresAuditSink } from '@angriff36/manifest/audit/postgres';
import { PostgresOutboxStore } from '@angriff36/manifest/outbox/postgres';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const auditSink = new PostgresAuditSink({ pool });
const outboxStore = new PostgresOutboxStore({ pool });
```

</Step>
<Step>
### Build the runtime with a store provider

```ts
import { RuntimeEngine } from '@angriff36/manifest';

const runtime = new RuntimeEngine(ir, {
  actorId: 'admin-1',
  tenantId: 'tenant-1',
  requestId: 'req-99',
  source: 'route',
  user: { id: 'admin-1', role: 'admin' },
}, {
  storeProvider: (entityName) => {
    switch (entityName) {
      case 'Invoice':
        return new PostgresStore({
          connectionString: process.env.DATABASE_URL,
          tableName: 'invoices',
        });
      case 'Customer':
        return new PostgresStore({
          connectionString: process.env.DATABASE_URL,
          tableName: 'customers',
        });
      default:
        return undefined;
    }
  },
  auditSink,
  outboxStore,
  generateId: () => crypto.randomUUID(),
});
```

</Step>
<Step>
### Execute commands and dispatch outbox work

```ts
const result = await runtime.runCommand('approve', { approvedBy: 'admin-1' }, {
  entityName: 'Invoice',
  instanceId: 'inv-1',
  idempotencyKey: 'Invoice:inv-1:approve',
});

if (!result.success) {
  console.error(result);
}

const batch = await outboxStore.claim(20);

for (const entry of batch) {
  try {
    await publishToBus(entry.event);
    await outboxStore.markDelivered([entry.entryId]);
  } catch (error) {
    await outboxStore.markFailed([entry.entryId], String(error));
  }
}
```

</Step>
</Steps>

Complete example:

```ts
import { Pool } from 'pg';
import { RuntimeEngine } from '@angriff36/manifest';
import { compileToIR } from '@angriff36/manifest/ir-compiler';
import { PostgresStore } from '@angriff36/manifest/stores';
import { PostgresAuditSink } from '@angriff36/manifest/audit/postgres';
import { PostgresOutboxStore } from '@angriff36/manifest/outbox/postgres';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const { ir } = await compileToIR(`
  entity Invoice {
    property required id: string
    property status: string = "pending"

    command approve() {
      guard self.status == "pending"
      mutate status = "approved"
      emit invoiceApproved
    }
  }

  store Invoice in postgres

  event invoiceApproved: "invoices.approved" {
    id: string
  }
  `);

  if (!ir) {
    throw new Error('Compile failed');
  }

  const runtime = new RuntimeEngine(ir, {
    actorId: 'admin-1',
    tenantId: 'tenant-1',
    user: { id: 'admin-1', role: 'admin' },
  }, {
    storeProvider: () => new PostgresStore({
      connectionString: process.env.DATABASE_URL,
      tableName: 'invoices',
    }),
    auditSink: new PostgresAuditSink({ pool }),
    outboxStore: new PostgresOutboxStore({ pool }),
  });

  await runtime.createInstance('Invoice', { id: 'inv-1' });
  const result = await runtime.runCommand('approve', {}, {
    entityName: 'Invoice',
    instanceId: 'inv-1',
  });

  console.log(result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Operational notes:

- Apply the shipped SQL schemas from `src/manifest/audit/sinks/postgres.sql` and `src/manifest/outbox/stores/postgres.sql` before using the PostgreSQL audit and outbox adapters.
- `PostgresOutboxStore.claim()` uses `FOR UPDATE SKIP LOCKED` semantics so multiple workers can claim disjoint batches.
- `PostgresAuditSink.emit()` requires `recordId`; `RuntimeEngine.runCommand()` provides one automatically when an audit sink is configured.
- The runtime still has the documented transactional gap between mutation and outbox enqueue, so monitor outbox warnings and design consumers to be idempotent.
