---
title: "Embedded Runtime"
description: "Compile Manifest source to IR and run commands directly in application code."
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


Use the embedded runtime pattern when you want full control over orchestration, HTTP handling, background jobs, or side effects while still preserving Manifest semantics.

## Problem

You want Manifest to enforce policies, constraints, guards, and event emission, but you do not want to generate route handlers first. This is common in custom APIs, workers, or internal services where you already have an application shell and only need the domain engine.

## Solution

Compile Manifest source with `compileToIR()`, construct `RuntimeEngine`, wire the adapters you need, and call `runCommand()` directly from your handler or service layer.

<Steps>
<Step>
### Compile source to IR

```ts
import { compileToIR } from '@angriff36/manifest/ir-compiler';

const source = `
entity Order {
  property required id: string
  property status: string = "draft"
  property total: number = 0

  command submit() {
    guard self.status == "draft"
    guard self.total > 0
    mutate status = "submitted"
    emit orderSubmitted
  }
}

store Order in memory

event orderSubmitted: "orders.submitted" {
  id: string
}
`;

const { ir, diagnostics } = await compileToIR(source);
if (!ir || diagnostics.some((d) => d.severity === 'error')) {
  throw new Error(JSON.stringify(diagnostics, null, 2));
}
```

</Step>
<Step>
### Construct the runtime and seed state

```ts
import { RuntimeEngine } from '@angriff36/manifest';
import { MemoryAuditSink } from '@angriff36/manifest/audit/memory';
import { MemoryOutboxStore } from '@angriff36/manifest/outbox/memory';

const auditSink = new MemoryAuditSink();
const outboxStore = new MemoryOutboxStore();

const runtime = new RuntimeEngine(ir, {
  actorId: 'user-1',
  tenantId: 'tenant-1',
  requestId: 'req-1',
  source: 'route',
  user: { id: 'user-1', role: 'member' },
}, {
  auditSink,
  outboxStore,
  generateId: () => crypto.randomUUID(),
  now: () => Date.now(),
});

await runtime.createInstance('Order', {
  id: 'order-1',
  total: 125,
});
```

</Step>
<Step>
### Execute a command and inspect the result

```ts
const result = await runtime.runCommand('submit', {}, {
  entityName: 'Order',
  instanceId: 'order-1',
  correlationId: 'workflow-42',
  causationId: 'request-req-1',
});

const order = await runtime.getInstance('Order', 'order-1');

console.log({
  success: result.success,
  status: order?.status,
  events: result.emittedEvents.map((event) => event.name),
  auditRecords: auditSink.size(),
  outboxEntries: outboxStore.size(),
});
```

</Step>
</Steps>

Complete runnable example:

```ts
import { RuntimeEngine } from '@angriff36/manifest';
import { compileToIR } from '@angriff36/manifest/ir-compiler';
import { MemoryAuditSink } from '@angriff36/manifest/audit/memory';
import { MemoryOutboxStore } from '@angriff36/manifest/outbox/memory';

async function main() {
  const source = `
  entity Order {
    property required id: string
    property status: string = "draft"
    property total: number = 0

    command submit() {
      guard self.status == "draft"
      guard self.total > 0
      mutate status = "submitted"
      emit orderSubmitted
    }
  }

  store Order in memory

  event orderSubmitted: "orders.submitted" {
    id: string
  }
  `;

  const { ir, diagnostics } = await compileToIR(source);
  if (!ir || diagnostics.some((d) => d.severity === 'error')) {
    throw new Error(JSON.stringify(diagnostics, null, 2));
  }

  const auditSink = new MemoryAuditSink();
  const outboxStore = new MemoryOutboxStore();

  const runtime = new RuntimeEngine(ir, {
    actorId: 'user-1',
    tenantId: 'tenant-1',
    user: { id: 'user-1', role: 'member' },
  }, {
    auditSink,
    outboxStore,
  });

  await runtime.createInstance('Order', { id: 'order-1', total: 125 });

  const result = await runtime.runCommand('submit', {}, {
    entityName: 'Order',
    instanceId: 'order-1',
  });

  console.log({
    success: result.success,
    order: await runtime.getInstance('Order', 'order-1'),
    events: result.emittedEvents,
    audit: auditSink.list(),
    outbox: outboxStore.list(),
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Expected outcome:

- `success` is `true`.
- The `Order` instance moves from `draft` to `submitted`.
- One semantic event is returned in `CommandResult.emittedEvents`.
- The memory audit sink stores one record because `runCommand()` emits audit in a `finally` block.
- The memory outbox stores one pending entry because the command succeeded and emitted an event.

This pattern is the closest match to the runtime architecture in `src/manifest/runtime-engine.ts`, and it is the right choice when your application wants to own the surrounding transport boundary.
