# Event Wiring Patterns

Authority: Advisory
Enforced by: None
Last updated: 2026-02-12

This guide shows how to wire Manifest events to external infrastructure (transports, queues, webhooks).

Normative event semantics are defined in `docs/spec/semantics.md`.

---

## Core Concept

Manifest emits events with a **guaranteed contract**:

```typescript
interface EmittedEvent {
  name: string;           // Event name from IR
  channel: string;        // Channel from event definition or defaults to name
  payload: object;        // Command input + last action result
  timestamp: number;      // Milliseconds since epoch
}
```

**Events are emitted in declaration order** after successful command execution.

Your job: **wire these events to infrastructure**.

---

## Event Observer Pattern

Use `runtime.onEvent()` to observe events:

```typescript
import { RuntimeEngine } from '@manifest/runtime';

const runtime = new RuntimeEngine(ir, { userId, tenantId });

const unsubscribe = runtime.onEvent((event) => {
  console.log('Event:', event.name);
  console.log('Channel:', event.channel);
  console.log('Payload:', event.payload);
  console.log('Timestamp:', event.timestamp);
});

// Execute command
await runtime.runCommand('Invoice', 'approve', { reason: 'validated' });

// Cleanup
unsubscribe();
```

**Important**: `onEvent()` is synchronous. For async work, dispatch to a queue.

---

## Pattern 1: Real-Time Transport (WebSockets)

Wire events to WebSockets for real-time updates.

### Ably

```typescript
import { RuntimeEngine } from '@manifest/runtime';
import Ably from 'ably';

const ably = new Ably.Realtime({ key: process.env.ABLY_API_KEY });
const runtime = new RuntimeEngine(ir, { userId, tenantId });

runtime.onEvent((event) => {
  // Publish to Ably channel
  const channel = ably.channels.get(event.channel);
  channel.publish(event.name, {
    ...event.payload,
    timestamp: event.timestamp,
  });
});
```

### Pusher

```typescript
import Pusher from 'pusher';

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
});

runtime.onEvent((event) => {
  pusher.trigger(event.channel, event.name, event.payload);
});
```

### Native WebSockets (ws library)

```typescript
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

runtime.onEvent((event) => {
  // Broadcast to all connected clients
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: event.name,
        channel: event.channel,
        payload: event.payload,
        timestamp: event.timestamp,
      }));
    }
  });
});
```

### With Channel Filtering

```typescript
// Only send events to subscribers of that channel
const subscriptions = new Map<WebSocket, Set<string>>();

runtime.onEvent((event) => {
  subscriptions.forEach((channels, client) => {
    if (channels.has(event.channel) && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(event));
    }
  });
});
```

---

## Pattern 2: Message Queues

Wire events to message queues for async processing.

### Kafka

```typescript
import { Kafka } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'manifest-app',
  brokers: ['localhost:9092'],
});

const producer = kafka.producer();
await producer.connect();

runtime.onEvent(async (event) => {
  await producer.send({
    topic: event.channel,
    messages: [{
      key: event.name,
      value: JSON.stringify(event.payload),
      timestamp: String(event.timestamp),
    }],
  });
});
```

### RabbitMQ

```typescript
import amqp from 'amqplib';

const connection = await amqp.connect('amqp://localhost');
const channel = await connection.createChannel();

runtime.onEvent((event) => {
  channel.publish(
    event.channel,        // Exchange
    event.name,           // Routing key
    Buffer.from(JSON.stringify(event.payload))
  );
});
```

### AWS SQS

```typescript
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const sqs = new SQSClient({ region: 'us-east-1' });

runtime.onEvent(async (event) => {
  await sqs.send(new SendMessageCommand({
    QueueUrl: process.env.SQS_QUEUE_URL,
    MessageBody: JSON.stringify({
      eventName: event.name,
      channel: event.channel,
      payload: event.payload,
      timestamp: event.timestamp,
    }),
    MessageAttributes: {
      EventName: { DataType: 'String', StringValue: event.name },
      Channel: { DataType: 'String', StringValue: event.channel },
    },
  }));
});
```

---

## Pattern 3: Background Jobs

Wire events to job queues for async side effects.

### BullMQ

```typescript
import { Queue } from 'bullmq';

const emailQueue = new Queue('emails', {
  connection: { host: 'localhost', port: 6379 }
});

const analyticsQueue = new Queue('analytics', {
  connection: { host: 'localhost', port: 6379 }
});

runtime.onEvent((event) => {
  // Route events to appropriate queues
  if (event.name === 'InvoiceGenerated') {
    emailQueue.add('send-invoice-email', {
      invoiceId: event.payload.invoiceId,
      userId: event.payload.userId,
    });
  }

  if (event.name === 'OrderPlaced') {
    emailQueue.add('send-order-confirmation', event.payload);
    analyticsQueue.add('track-order', event.payload);
  }

  if (event.name === 'UserRegistered') {
    emailQueue.add('send-welcome-email', event.payload);
    analyticsQueue.add('track-registration', event.payload);
  }
});
```

### Temporal

```typescript
import { Client } from '@temporalio/client';

const client = new Client();

runtime.onEvent(async (event) => {
  if (event.name === 'OrderPlaced') {
    await client.workflow.start('processOrder', {
      taskQueue: 'orders',
      workflowId: `order-${event.payload.orderId}`,
      args: [event.payload],
    });
  }
});
```

### Inngest

```typescript
import { Inngest } from 'inngest';

const inngest = new Inngest({ id: 'manifest-app' });

runtime.onEvent(async (event) => {
  await inngest.send({
    name: event.name,
    data: {
      channel: event.channel,
      ...event.payload,
    },
  });
});
```

---

## Pattern 4: Webhooks

Wire events to external webhooks for integration.

### Basic Webhook

```typescript
runtime.onEvent(async (event) => {
  if (event.name === 'InvoiceGenerated') {
    await fetch('https://api.example.com/webhooks/invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: event.name,
        payload: event.payload,
        timestamp: event.timestamp,
      }),
    });
  }
});
```

### With Retry Logic

```typescript
import pRetry from 'p-retry';

runtime.onEvent(async (event) => {
  await pRetry(
    async () => {
      const response = await fetch('https://api.example.com/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.statusText}`);
      }
    },
    { retries: 3 }
  );
});
```

### Webhook Registry

```typescript
interface WebhookConfig {
  url: string;
  events: string[];
  headers?: Record<string, string>;
}

const webhooks: WebhookConfig[] = [
  {
    url: 'https://api.example.com/invoices',
    events: ['InvoiceGenerated', 'InvoiceApproved'],
  },
  {
    url: 'https://analytics.example.com/track',
    events: ['OrderPlaced', 'OrderCompleted'],
    headers: { 'X-API-Key': process.env.ANALYTICS_API_KEY },
  },
];

runtime.onEvent(async (event) => {
  const matchingWebhooks = webhooks.filter(w => w.events.includes(event.name));

  await Promise.all(
    matchingWebhooks.map(webhook =>
      fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...webhook.headers,
        },
        body: JSON.stringify(event),
      })
    )
  );
});
```

---

## Pattern 5: Multi-Channel Fanout

Wire events to multiple destinations simultaneously.

```typescript
import { Queue } from 'bullmq';
import Ably from 'ably';

const ably = new Ably.Realtime({ key: process.env.ABLY_API_KEY });
const emailQueue = new Queue('emails');
const analyticsQueue = new Queue('analytics');

runtime.onEvent(async (event) => {
  // Real-time push
  ably.channels.get(event.channel).publish(event.name, event.payload);

  // Background jobs
  if (event.name === 'OrderPlaced') {
    emailQueue.add('send-confirmation', event.payload);
    analyticsQueue.add('track-order', event.payload);
  }

  // Webhook
  await fetch('https://api.example.com/events', {
    method: 'POST',
    body: JSON.stringify(event),
  });

  // Log to observability
  console.log('[Event]', event.name, event.payload);
});
```

---

## Pattern 6: Transactional Outbox

Store events in a database transaction, then dispatch asynchronously.

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// During command execution, collect events
const eventCollector: EmittedEvent[] = [];

runtime.onEvent((event) => {
  eventCollector.push(event);
});

// After command succeeds, store events in transaction
await prisma.$transaction(async (tx) => {
  // Store command result
  await tx.invoice.update({
    where: { id: invoiceId },
    data: { status: 'approved' },
  });

  // Store events in outbox table
  await tx.eventOutbox.createMany({
    data: eventCollector.map(event => ({
      eventName: event.name,
      channel: event.channel,
      payload: event.payload,
      timestamp: new Date(event.timestamp),
      published: false,
    })),
  });
});

// Separate worker process dispatches from outbox
setInterval(async () => {
  const pendingEvents = await prisma.eventOutbox.findMany({
    where: { published: false },
    take: 100,
  });

  for (const event of pendingEvents) {
    await ably.channels.get(event.channel).publish(event.eventName, event.payload);

    await prisma.eventOutbox.update({
      where: { id: event.id },
      data: { published: true },
    });
  }
}, 5000);
```

See: `docs/patterns/transactional-outbox-pattern.md` for complete implementation.

---

## Pattern 7: Event Filtering

Filter events before dispatching.

### By Event Name

```typescript
runtime.onEvent((event) => {
  const allowedEvents = ['OrderPlaced', 'OrderCompleted', 'InvoiceGenerated'];

  if (allowedEvents.includes(event.name)) {
    ably.channels.get(event.channel).publish(event.name, event.payload);
  }
});
```

### By Channel

```typescript
runtime.onEvent((event) => {
  if (event.channel.startsWith('admin.')) {
    // Only send admin events to specific transport
    adminWebSocket.send(JSON.stringify(event));
  } else {
    // Send public events to public transport
    publicAbly.channels.get(event.channel).publish(event.name, event.payload);
  }
});
```

### By Tenant

```typescript
runtime.onEvent((event) => {
  const tenantId = event.payload.tenantId;

  // Only send events to subscribers of this tenant
  const tenantChannel = ably.channels.get(`tenant:${tenantId}:${event.channel}`);
  tenantChannel.publish(event.name, event.payload);
});
```

---

## Best Practices

### 1. Keep Event Handlers Fast

Event handlers run synchronously during command execution. For async work, dispatch to a queue.

**Good:**

```typescript
runtime.onEvent((event) => {
  emailQueue.add('send-email', event.payload); // Fast dispatch
});
```

**Bad:**

```typescript
runtime.onEvent(async (event) => {
  await sendEmail(event.payload); // Slow async work
});
```

### 2. Handle Errors Gracefully

Don't let event dispatch failures crash command execution.

```typescript
runtime.onEvent(async (event) => {
  try {
    await ably.channels.get(event.channel).publish(event.name, event.payload);
  } catch (error) {
    console.error('[Event dispatch failed]', event.name, error);
    // Log to error tracking (Sentry, Datadog)
  }
});
```

### 3. Use Idempotency Keys

Ensure event handlers are idempotent.

```typescript
runtime.onEvent(async (event) => {
  await emailQueue.add('send-email', event.payload, {
    jobId: `${event.name}-${event.payload.invoiceId}`, // Idempotency key
  });
});
```

### 4. Validate Payload Shape

Event payloads are opaque objects. Validate before use.

```typescript
import { z } from 'zod';

const InvoiceGeneratedSchema = z.object({
  invoiceId: z.string(),
  userId: z.string(),
  amount: z.number(),
});

runtime.onEvent((event) => {
  if (event.name === 'InvoiceGenerated') {
    const result = InvoiceGeneratedSchema.safeParse(event.payload);

    if (result.success) {
      emailQueue.add('send-invoice-email', result.data);
    } else {
      console.error('[Invalid event payload]', result.error);
    }
  }
});
```

### 5. Use Observability

Log events for debugging and monitoring.

```typescript
import { trace } from '@opentelemetry/api';

runtime.onEvent((event) => {
  const span = trace.getTracer('manifest').startSpan('event.dispatch', {
    attributes: {
      'event.name': event.name,
      'event.channel': event.channel,
    },
  });

  try {
    ably.channels.get(event.channel).publish(event.name, event.payload);
    span.setStatus({ code: 1 }); // OK
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2 }); // Error
  } finally {
    span.end();
  }
});
```

---

## Common Patterns Summary

| Pattern | Use Case | Examples |
|---------|----------|----------|
| Real-Time Transport | Push updates to clients | Ably, Pusher, WebSockets |
| Message Queues | Async processing, fanout | Kafka, RabbitMQ, SQS |
| Background Jobs | Side effects, retries | BullMQ, Temporal, Inngest |
| Webhooks | External integrations | Stripe, Slack, Zapier |
| Transactional Outbox | Guaranteed delivery | Prisma + worker |
| Multi-Channel Fanout | Dispatch to many systems | Combine all above |

---

## Related Documentation

- **Spec**: `docs/spec/semantics.md` → Events
- **Adapters**: `docs/spec/adapters.md` → Action Adapters
- **Embedded Runtime**: `docs/patterns/embedded-runtime-pattern.md` → Event Handling
- **Transactional Outbox**: `docs/patterns/transactional-outbox-pattern.md`
- **Usage Patterns**: `docs/patterns/usage-patterns.md`

---

**TL;DR**: Manifest emits events with a guaranteed contract. Wire them to YOUR infrastructure (WebSockets, queues, webhooks). Events are NOT Manifest's responsibility—they're YOUR adapter boundary.
