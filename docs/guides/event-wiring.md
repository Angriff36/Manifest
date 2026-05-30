# Event Wiring Patterns

Last updated: 2026-02-13
Status: Active
Authority: Advisory
Enforced by: None

This guide shows how to wire Manifest events to external infrastructure (Ably, queues, webhooks) using the Capsule Pro catering operations domain.

Normative event semantics are defined in `docs/spec/semantics.md`. Workflow metadata is defined in `docs/spec/manifest-vnext.md` § "Workflow Metadata (Normative)".

---

## Event Shape

Every emitted event carries this shape:

```typescript
interface EmittedEvent {
  name: string;           // Event name from IR (e.g., 'PrepTaskClaimed')
  channel: string;        // Channel from event definition or defaults to name
  payload: object;        // Command input + last action result
  timestamp: number;      // Milliseconds since epoch

  // Workflow metadata (present when supplied via command options)
  emitIndex: number;      // Per-command emission counter (0, 1, 2...), always present
  correlationId?: string; // Groups events across a multi-step workflow
  causationId?: string;   // Links this event to its triggering cause
}
```

`emitIndex` is deterministic: identical IR + identical input + identical context = identical `emitIndex` values. Use it for replay verification (see `docs/patterns/complex-workflows.md` § Pattern 4).

---

## Pattern 1: Ably Real-Time Push with Correlation

Capsule Pro uses Ably for real-time kitchen updates. Wire events to Ably channels with tenant isolation, preserving workflow metadata for client-side tracing.

```typescript
import Ably from 'ably';
import { createPrepTaskRuntime } from '@capsule/manifest-adapters';

const ably = new Ably.Realtime({ key: process.env.ABLY_API_KEY });

export function wireKitchenEventsToAbly(
  tenantId: string,
  runtime: ReturnType<typeof createPrepTaskRuntime>,
) {
  runtime.onEvent((event) => {
    // Tenant-scoped channel: only this organization's staff sees it
    const channel = ably.channels.get(`tenant:${tenantId}:kitchen`);

    channel.publish(event.name, {
      ...event.payload,
      timestamp: event.timestamp,
      emitIndex: event.emitIndex,
      correlationId: event.correlationId,
      causationId: event.causationId,
    });
  });
}

// Client-side: production board subscribes to kitchen events
// The correlationId lets the UI group related events (e.g., all steps
// in a single event-day workflow) into a timeline view.
```

### Client-Side Correlation Grouping

```typescript
// React component on the production board
import { useChannel } from 'ably/react';

function useWorkflowTimeline(tenantId: string) {
  const [events, setEvents] = useState<Map<string, EmittedEvent[]>>(new Map());

  useChannel(`tenant:${tenantId}:kitchen`, (message) => {
    const event = message.data;
    const correlationId = event.correlationId ?? 'uncorrelated';

    setEvents(prev => {
      const updated = new Map(prev);
      const existing = updated.get(correlationId) ?? [];
      updated.set(correlationId, [...existing, event]);
      return updated;
    });
  });

  return events; // Map<correlationId, events[]>
}
```

---

## Pattern 2: Transactional Outbox with Workflow Metadata

Capsule Pro uses the outbox pattern for guaranteed event delivery. Store events in the same database transaction as the command result, then publish to Ably asynchronously.

```typescript
import { prisma } from '@capsule/database';
import { createInventoryRuntime } from '@capsule/manifest-adapters';

export async function reserveInventoryWithOutbox(
  tenantId: string,
  userId: string,
  itemId: string,
  quantity: number,
  eventId: string,
  correlationId: string,
) {
  const runtime = createInventoryRuntime({
    tenantId,
    userId,
    storeProvider: createPrismaStoreProvider(tenantId),
  });

  // Collect events during command execution
  const collectedEvents: EmittedEvent[] = [];
  runtime.onEvent((event) => collectedEvents.push(event));

  const result = await runtime.runCommand('reserve', {
    quantity,
    eventId,
  }, {
    entityName: 'InventoryItem',
    instanceId: itemId,
    correlationId,
    causationId: `user-reserve-${userId}`,
  });

  if (!result.success) return result;

  // Store command result + events in same transaction
  await prisma.$transaction(async (tx) => {
    // Update inventory item in database
    await tx.inventoryItem.update({
      where: { tenantId_id: { tenantId, id: itemId } },
      data: {
        quantityReserved: { increment: quantity },
        quantityAvailable: { decrement: quantity },
      },
    });

    // Store events in outbox — workflow metadata preserved
    await tx.outbox.createMany({
      data: collectedEvents.map(event => ({
        tenantId,
        eventName: event.name,
        channel: event.channel,
        payload: event.payload,
        correlationId: event.correlationId ?? null,
        causationId: event.causationId ?? null,
        emitIndex: event.emitIndex,
        timestamp: new Date(event.timestamp),
        published: false,
      })),
    });
  });

  return result;
}
```

### Outbox Worker: Publish to Ably

```typescript
import Ably from 'ably';

const ably = new Ably.Realtime({ key: process.env.ABLY_API_KEY });

// Runs on a schedule (e.g., every 2 seconds)
export async function publishOutboxEvents() {
  const pending = await prisma.outbox.findMany({
    where: { published: false },
    orderBy: { timestamp: 'asc' },
    take: 100,
  });

  for (const entry of pending) {
    const channel = ably.channels.get(`tenant:${entry.tenantId}:${entry.channel}`);

    await channel.publish(entry.eventName, {
      ...entry.payload,
      timestamp: entry.timestamp,
      emitIndex: entry.emitIndex,
      correlationId: entry.correlationId,
      causationId: entry.causationId,
    });

    await prisma.outbox.update({
      where: { id: entry.id },
      data: { published: true, publishedAt: new Date() },
    });
  }
}
```

---

## Pattern 3: Event-Driven Prep Task Automation

When a prep task is claimed, automatically check station capacity and notify the kitchen lead. Each reaction uses `causationId` to trace why it happened.

```typescript
import { createPrepTaskRuntime, createStationRuntime } from '@capsule/manifest-adapters';
import { Queue } from 'bullmq';

const notificationQueue = new Queue('notifications', {
  connection: { host: process.env.REDIS_HOST, port: 6379 },
});

export function setupPrepTaskAutomation(tenantId: string) {
  const prepRuntime = createPrepTaskRuntime({
    tenantId,
    userId: 'system',
    storeProvider: createPrismaStoreProvider(tenantId),
  });

  const stationRuntime = createStationRuntime({
    tenantId,
    userId: 'system',
    storeProvider: createPrismaStoreProvider(tenantId),
  });

  // When a task is claimed, assign it to its station
  prepRuntime.onEvent(async (event) => {
    if (event.name !== 'PrepTaskClaimed') return;

    const task = await prisma.prepTask.findUnique({
      where: { tenantId_id: { tenantId, id: event.payload.id } },
    });
    if (!task?.stationId) return;

    await stationRuntime.runCommand('assignTask', {
      taskId: task.id,
    }, {
      entityName: 'Station',
      instanceId: task.stationId,
      // Same correlation as the claim event — links the whole chain
      correlationId: event.correlationId,
      // This station assignment was caused by the prep task claim
      causationId: `PrepTaskClaimed-${event.payload.id}-${event.emitIndex}`,
    });
  });

  // When a task is completed, remove it from the station
  prepRuntime.onEvent(async (event) => {
    if (event.name !== 'PrepTaskCompleted') return;

    const task = await prisma.prepTask.findUnique({
      where: { tenantId_id: { tenantId, id: event.payload.id } },
    });
    if (!task?.stationId) return;

    await stationRuntime.runCommand('removeTask', {
      taskId: task.id,
    }, {
      entityName: 'Station',
      instanceId: task.stationId,
      correlationId: event.correlationId,
      causationId: `PrepTaskCompleted-${event.payload.id}-${event.emitIndex}`,
    });
  });

  // When any kitchen event fires, notify the kitchen lead
  prepRuntime.onEvent(async (event) => {
    if (!['PrepTaskClaimed', 'PrepTaskCompleted', 'PrepTaskReleased'].includes(event.name)) return;

    await notificationQueue.add('kitchen-notification', {
      tenantId,
      eventName: event.name,
      payload: event.payload,
      correlationId: event.correlationId,
      causationId: event.causationId,
      emitIndex: event.emitIndex,
    }, {
      // Deduplicate: same event name + same task + same emitIndex = same notification
      jobId: `${event.name}-${event.payload.id}-${event.emitIndex}`,
    });
  });

  return { prepRuntime, stationRuntime };
}
```

---

## Pattern 4: Inventory Alert Pipeline

Wire inventory events to an alert system that checks constraint outcomes and triggers reorder suggestions.

```typescript
import { createInventoryRuntime, getWarningConstraints } from '@capsule/manifest-adapters';
import * as Sentry from '@sentry/nextjs';

export function setupInventoryAlerts(tenantId: string) {
  const runtime = createInventoryRuntime({
    tenantId,
    userId: 'system',
    storeProvider: createPrismaStoreProvider(tenantId),
  });

  // After any inventory command, check for low-stock warnings
  runtime.onEvent(async (event) => {
    if (!['InventoryConsumed', 'InventoryWasted'].includes(event.name)) return;

    // Re-check constraints for this item to get current state
    try {
      const outcomes = await runtime.checkConstraints(
        'InventoryItem',
        event.payload.id,
      );

      const warnings = getWarningConstraints(outcomes);
      const belowPar = warnings.find(w => w.code === 'warnBelowPar');
      const lowStock = warnings.find(w => w.code === 'warnLowStock');

      if (belowPar || lowStock) {
        // Create alert in database
        await prisma.inventoryAlert.create({
          data: {
            tenantId,
            inventoryItemId: event.payload.id,
            alertType: lowStock ? 'LOW_STOCK' : 'BELOW_PAR',
            message: (lowStock ?? belowPar)!.message,
            triggeredAt: new Date(),
            // Link to the workflow that caused depletion
            metadata: {
              correlationId: event.correlationId,
              causationId: event.causationId,
              triggerEvent: event.name,
            },
          },
        });

        // Push to Ably for real-time dashboard
        const channel = ably.channels.get(`tenant:${tenantId}:alerts`);
        channel.publish('inventory-alert', {
          itemId: event.payload.id,
          alertType: lowStock ? 'LOW_STOCK' : 'BELOW_PAR',
          correlationId: event.correlationId,
        });
      }
    } catch (e) {
      Sentry.captureException(e, {
        extra: { tenantId, event: event.name, itemId: event.payload.id },
      });
    }
  });

  return runtime;
}
```

---

## Pattern 5: Event Filtering by Channel and Severity

Route events to different destinations based on channel and associated constraint outcomes.

```typescript
import Ably from 'ably';
import { Queue } from 'bullmq';

const ably = new Ably.Realtime({ key: process.env.ABLY_API_KEY });
const auditQueue = new Queue('audit');

export function setupEventRouting(tenantId: string, runtime: RuntimeEngine) {
  runtime.onEvent((event) => {
    // System events (overrides, budget errors) → audit queue only
    if (event.channel === 'system') {
      auditQueue.add('audit-event', {
        tenantId,
        eventName: event.name,
        payload: event.payload,
        correlationId: event.correlationId,
        causationId: event.causationId,
        emitIndex: event.emitIndex,
        timestamp: event.timestamp,
      });
      return;
    }

    // Kitchen events → real-time push to production board
    if (['PrepTaskClaimed', 'PrepTaskStarted', 'PrepTaskCompleted', 'PrepTaskReleased'].includes(event.name)) {
      ably.channels
        .get(`tenant:${tenantId}:kitchen`)
        .publish(event.name, {
          ...event.payload,
          emitIndex: event.emitIndex,
          correlationId: event.correlationId,
        });
    }

    // Inventory events → real-time push + background reorder check
    if (['InventoryConsumed', 'InventoryReserved', 'InventoryWasted'].includes(event.name)) {
      ably.channels
        .get(`tenant:${tenantId}:inventory`)
        .publish(event.name, event.payload);

      auditQueue.add('check-reorder', {
        tenantId,
        itemId: event.payload.id,
        correlationId: event.correlationId,
      });
    }

    // Station events → real-time push to capacity dashboard
    if (['StationTaskAssigned', 'StationTaskRemoved'].includes(event.name)) {
      ably.channels
        .get(`tenant:${tenantId}:stations`)
        .publish(event.name, event.payload);
    }
  });
}
```

---

## Pattern 6: Webhook Delivery with Idempotency

Deliver events to external integrations (e.g., accounting system, supplier portal) with retry and deduplication.

```typescript
import pRetry from 'p-retry';

interface WebhookConfig {
  url: string;
  events: string[];
  headers?: Record<string, string>;
  tenantId: string;
}

const webhooks: WebhookConfig[] = [
  {
    tenantId: 'tenant-acme-catering',
    url: 'https://accounting.acme.com/api/events',
    events: ['InventoryConsumed', 'InventoryWasted', 'InventoryRestocked'],
    headers: { 'X-API-Key': process.env.ACME_ACCOUNTING_KEY! },
  },
  {
    tenantId: 'tenant-acme-catering',
    url: 'https://supplier-portal.example.com/webhooks',
    events: ['InventoryRestocked'],
  },
];

export function setupWebhookDelivery(tenantId: string, runtime: RuntimeEngine) {
  const matchingWebhooks = webhooks.filter(w => w.tenantId === tenantId);

  runtime.onEvent(async (event) => {
    const targets = matchingWebhooks.filter(w => w.events.includes(event.name));

    for (const webhook of targets) {
      // Idempotency key: same event + same emitIndex = same delivery
      const idempotencyKey = `webhook-${event.name}-${event.correlationId}-${event.emitIndex}`;

      await pRetry(
        async () => {
          const response = await fetch(webhook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Idempotency-Key': idempotencyKey,
              'X-Correlation-Id': event.correlationId ?? '',
              'X-Causation-Id': event.causationId ?? '',
              ...webhook.headers,
            },
            body: JSON.stringify({
              event: event.name,
              payload: event.payload,
              timestamp: event.timestamp,
              emitIndex: event.emitIndex,
              correlationId: event.correlationId,
              causationId: event.causationId,
            }),
          });

          if (!response.ok) {
            throw new Error(`Webhook ${webhook.url} failed: ${response.status}`);
          }
        },
        { retries: 3, minTimeout: 1000 },
      );
    }
  });
}
```

---

## Best Practices

### 1. Keep Event Handlers Fast

Event handlers run during command execution. Dispatch to queues for async work.

```typescript
// Good: fast dispatch
runtime.onEvent((event) => {
  notificationQueue.add('notify', event.payload);
});

// Bad: slow async work blocks the command
runtime.onEvent(async (event) => {
  await sendEmail(event.payload); // blocks command return
});
```

### 2. Preserve Workflow Metadata Through the Pipeline

Every layer (outbox, queue, webhook) should carry `correlationId`, `causationId`, and `emitIndex`:

```typescript
runtime.onEvent((event) => {
  queue.add('process', {
    ...event.payload,
    correlationId: event.correlationId,
    causationId: event.causationId,
    emitIndex: event.emitIndex,
  });
});
```

### 3. Use emitIndex + correlationId for Deduplication

```typescript
// BullMQ job deduplication using emitIndex
runtime.onEvent((event) => {
  emailQueue.add('send-email', event.payload, {
    jobId: `${event.name}-${event.correlationId}-${event.emitIndex}`,
  });
});
```

### 4. Handle Override Events Separately

`OverrideApplied` events come on the `system` channel and should go to audit, not the production board:

```typescript
runtime.onEvent((event) => {
  if (event.name === 'OverrideApplied') {
    // Audit log only — manager override happened
    auditQueue.add('override-audit', {
      constraintCode: event.payload.constraintCode,
      reason: event.payload.reason,
      authorizedBy: event.payload.authorizedBy,
      correlationId: event.correlationId,
    });
    return;
  }

  // Normal events → production board
  ably.channels.get(`tenant:${tenantId}:kitchen`).publish(event.name, event.payload);
});
```

### 5. Use Sentry for Event Dispatch Failures

```typescript
import * as Sentry from '@sentry/nextjs';

runtime.onEvent(async (event) => {
  try {
    await ably.channels.get(`tenant:${tenantId}:kitchen`).publish(event.name, event.payload);
  } catch (error) {
    Sentry.captureException(error, {
      extra: {
        eventName: event.name,
        correlationId: event.correlationId,
        tenantId,
      },
    });
  }
});
```

---

## Common Patterns Summary

| Pattern | Use Case | Capsule Pro Example |
|---------|----------|-------------------|
| Ably Real-Time | Push updates to production board | Kitchen task status, station capacity |
| Transactional Outbox | Guaranteed delivery with Prisma | Inventory changes, financial events |
| Event-Driven Automation | Trigger downstream steps | Claim task → assign station → notify lead |
| Alert Pipeline | Constraint-based monitoring | Low stock → alert → reorder suggestion |
| Channel Routing | Route by event type | Kitchen → Ably, inventory → queue, overrides → audit |
| Webhook Delivery | External integrations | Accounting system, supplier portal |

---

## Related Documentation

- **Spec**: `docs/spec/semantics.md` — Event emission semantics
- **vNext**: `docs/spec/manifest-vnext.md` — Workflow metadata, emitIndex determinism
- **Adapters**: `docs/spec/adapters.md` — Action adapters, effect boundaries
- **Complex Workflows**: `docs/patterns/complex-workflows.md` — Multi-step orchestration with correlation
- **Transactional Outbox**: `docs/patterns/transactional-outbox-pattern.md` — Detailed outbox implementation
- **Embedded Runtime**: `docs/patterns/embedded-runtime-pattern.md` — Basic runtime usage
