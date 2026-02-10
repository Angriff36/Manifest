# Transactional Outbox Pattern

> **⚠️ TESTING STATUS: NOT TESTED.**
> This pattern is implemented in capsule-pro's PrismaStore but lacks dedicated test coverage.
> Do not use in production without comprehensive testing of:
> - Transaction atomicity
> - Event persistence reliability
> - Outbox processing correctness
> - Failure recovery scenarios

This guide explains how to implement reliable event delivery using the transactional outbox pattern with Manifest.

## Overview

The **transactional outbox pattern** ensures that:
1. Entity mutations and event writes happen atomically (in the same transaction)
2. Events are never lost if the application crashes
3. Events can be processed asynchronously and reliably

## The Problem

Without transactional outbox:

```typescript
// ❌ RACE CONDITION - data written, but event lost
await database.recipe.create({ data: recipeData });
await publishEvent('RecipeCreated', recipeData);  // May crash here!

// ❌ RACE CONDITION - event published, but data not written
await publishEvent('RecipeCreated', recipeData);
await database.recipe.create({ data: recipeData });  // May crash here!
```

## The Solution

With transactional outbox:

```typescript
// ✅ ATOMIC - both succeed or both fail
await database.$transaction(async (tx) => {
  // Write entity
  await tx.recipe.create({ data: recipeData });

  // Write outbox event (same transaction)
  await tx.outboxEvent.create({
    data: {
      eventType: 'RecipeCreated',
      payload: recipeData,
      aggregateId: recipeData.id,
    }
  });
});
```

## Implementation with Manifest

### Step 1: Enable Event Collector

```typescript
import { RuntimeEngine } from '@manifest/runtime';

// Create event collector array
const pendingEvents: EmittedEvent[] = [];

// Create runtime with event collector
const runtime = new RuntimeEngine(ir, {
  userId: 'user-123',
  tenantId: 'tenant-456',
  eventCollector: pendingEvents,
});
```

### Step 2: Implement Outbox Writer

```typescript
type OutboxEventToWrite = {
  eventType: string;
  payload: unknown;
  aggregateId?: string;
};

type OutboxWriter = (
  prisma: PrismaClient,
  events: OutboxEventToWrite[]
) => Promise<void>;

// Create outbox writer function
const outboxWriter: OutboxWriter = async (prisma, events) => {
  if (events.length === 0) return;

  await prisma.outboxEvent.createMany({
    data: events.map((event) => ({
      tenantId: 'tenant-456',
      eventType: event.eventType,
      payload: event.payload as Prisma.InputJsonValue,
      aggregateType: 'Recipe',
      aggregateId: event.aggregateId ?? '',
      status: 'pending',
    })),
  });
};
```

### Step 3: Pass to Store Provider

```typescript
import { PrismaStore } from './stores/prisma-store';

const runtime = new RuntimeEngine(ir, {
  userId: 'user-123',
  tenantId: 'tenant-456',
  eventCollector: pendingEvents,
  storeProvider: (entityName) => {
    return new PrismaStore({
      prisma: database,
      entityName: entityName,
      tenantId: 'tenant-456',
      eventCollector: pendingEvents,  // Pass event collector
      outboxWriter: outboxWriter,     // Pass outbox writer
    });
  }
});
```

### Step 4: Execute Command

```typescript
// Run command - events are collected in pendingEvents array
const result = await runtime.runCommand('create', {
  name: 'Pasta Carbonara',
  category: 'Italian'
});

// After execution, pendingEvents contains all emitted events
console.log(pendingEvents);
// [
//   { name: 'RecipeCreated', payload: { id: '...', name: 'Pasta Carbonara' } }
// ]
```

## Complete PrismaStore with Outbox

```typescript
import type { Prisma, PrismaClient } from "@prisma/client";
import type { EmittedEvent, EntityInstance, Store } from "@manifest/runtime";

export interface PrismaStoreConfig<T extends EntityInstance = EntityInstance> {
  prisma: PrismaClient;
  entityName: string;
  tenantId: string;
  generateId?: () => string;

  /** Outbox event writer */
  outboxWriter?: OutboxWriter;

  /** Event collector for transactional outbox */
  eventCollector?: EmittedEvent[];

  /** Aggregate ID for outbox events */
  aggregateId?: string;
}

export type OutboxWriter = (
  prisma: PrismaClient,
  events: OutboxEventToWrite[]
) => Promise<void>;

export interface OutboxEventToWrite {
  eventType: string;
  payload: unknown;
  aggregateId?: string;
}

export class PrismaStore<T extends EntityInstance> implements Store<T> {
  private readonly prisma: PrismaClient;
  private readonly tenantId: string;
  private readonly entityName: string;
  private readonly prismaModel: string;
  private readonly generateId: () => string;
  private readonly outboxWriter?: OutboxWriter;
  private readonly defaultAggregateId: string;
  private readonly eventCollector?: EmittedEvent[];

  constructor(config: PrismaStoreConfig<T>) {
    this.prisma = config.prisma;
    this.tenantId = config.tenantId;
    this.entityName = config.entityName;
    this.prismaModel = entityNameToPrismaModel(config.entityName);
    this.generateId = config.generateId || (() => crypto.randomUUID());
    this.outboxWriter = config.outboxWriter;
    this.defaultAggregateId = config.aggregateId || "";
    this.eventCollector = config.eventCollector;
  }

  async create(data: Partial<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const id = (data.id || this.generateId()) as string;
      const item = { ...data, id };

      // Get model from transaction client
      const txModel = tx[this.prismaModel];

      // Create the entity
      const result = await txModel.create({
        data: {
          ...item,
          tenant_id: this.tenantId,
        },
      });

      // Write outbox events if configured
      if (this.outboxWriter && this.eventCollector && this.eventCollector.length > 0) {
        const eventsToWrite = this.eventCollector.map((event) => ({
          eventType: event.name,
          payload: event.payload,
          aggregateId: this.defaultAggregateId || id,
        }));

        await this.outboxWriter(tx as PrismaClient, eventsToWrite);

        // Clear events after writing to prevent duplicate writes
        this.eventCollector.length = 0;
      }

      return result as T;
    });
  }

  async update(id: string, data: Partial<T>): Promise<T | undefined> {
    return this.prisma.$transaction(async (tx) => {
      const txModel = tx[this.prismaModel];

      const result = await txModel.update({
        where: {
          tenantId_id: { tenantId: this.tenantId, id }
        },
        data,
      });

      // Write outbox events if configured
      if (this.outboxWriter && this.eventCollector && this.eventCollector.length > 0) {
        const eventsToWrite = this.eventCollector.map((event) => ({
          eventType: event.name,
          payload: event.payload,
          aggregateId: this.defaultAggregateId || id,
        }));

        await this.outboxWriter(tx as PrismaClient, eventsToWrite);
        this.eventCollector.length = 0;
      }

      return result as T;
    });
  }

  // ... other methods (getById, getAll, delete, clear)
}

function entityNameToPrismaModel(entityName: string): string {
  return entityName
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}
```

## Processing Outbox Events

Create a background worker to process events:

```typescript
// workers/outbox-processor.ts
import { database } from '@repo/database';

async function processOutboxEvents() {
  // Fetch pending events
  const events = await database.outboxEvent.findMany({
    where: {
      status: 'pending',
      scheduledFor: { lte: new Date() }
    },
    take: 100,  // Batch size
    orderBy: { createdAt: 'asc' }
  });

  for (const event of events) {
    try {
      // Process the event (send webhook, update cache, etc.)
      await processEvent(event);

      // Mark as processed
      await database.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'processed',
          processedAt: new Date()
        }
      });
    } catch (error) {
      // Mark as failed
      await database.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'failed',
          error: error.message,
          retryCount: { increment: 1 }
        }
      });
    }
  }
}

async function processEvent(event: OutboxEvent) {
  switch (event.eventType) {
    case 'RecipeCreated':
      // Send webhook
      await webhookService.send({
        event: 'recipe.created',
        data: event.payload
      });
      break;

    case 'InventoryReserved':
      // Update cache
      await cache.invalidate(`inventory:${event.aggregateId}`);
      break;

    // ... handle other event types
  }
}

// Run continuously
setInterval(processOutboxEvents, 5000);  // Every 5 seconds
```

## Prisma Schema for Outbox

```prisma
model OutboxEvent {
  id            String   @id @default(cuid())
  tenantId      String
  eventType     String
  payload       Json
  aggregateType String?
  aggregateId   String?

  status        String   @default("pending")  // pending, processing, processed, failed
  scheduledFor  DateTime @default(now())
  processedAt   DateTime?
  error         String?
  retryCount    Int      @default(0)

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([tenantId, status, scheduledFor])
  @@index([aggregateType, aggregateId])
}
```

## Testing Outbox Pattern

```typescript
import { describe, it, expect, vi } from 'vitest';
import { RuntimeEngine } from '@manifest/runtime';
import { PrismaStore } from './stores/prisma-store';

describe('Transactional Outbox', () => {
  it('should write events atomically with entity', async () => {
    const mockPrisma = {
      $transaction: vi.fn(async (callback) => {
        return await callback(mockTx);
      }),
      recipe: {
        create: vi.fn(async ({ data }) => ({ ...data, id: '123' }))
      },
      outboxEvent: {
        createMany: vi.fn()
      }
    };

    const mockTx = {
      recipe: mockPrisma.recipe,
      outboxEvent: mockPrisma.outboxEvent
    };

    const pendingEvents: EmittedEvent[] = [];

    const store = new PrismaStore({
      prisma: mockPrisma as any,
      entityName: 'Recipe',
      tenantId: 'tenant-123',
      eventCollector: pendingEvents,
      outboxWriter: async (prisma, events) => {
        await prisma.outboxEvent.createMany({ data: events });
      }
    });

    // Simulate event emission
    pendingEvents.push({
      name: 'RecipeCreated',
      payload: { id: '123', name: 'Pasta' }
    });

    // Create entity (should also write outbox)
    await store.create({ id: '123', name: 'Pasta' });

    // Verify transaction was called
    expect(mockPrisma.$transaction).toHaveBeenCalled();

    // Verify outbox was written in same transaction
    expect(mockPrisma.outboxEvent.createMany).toHaveBeenCalledWith({
      data: [{
        eventType: 'RecipeCreated',
        payload: { id: '123', name: 'Pasta' },
        aggregateId: '123'
      }]
    });

    // Verify events were cleared
    expect(pendingEvents).toHaveLength(0);
  });
});
```

## Best Practices

1. **Clear event collector between commands**
   ```typescript
   const pendingEvents: EmittedEvent[] = [];
   // ... execute command
   // Events auto-cleared by store
   ```

2. **Use idempotent event processors**
   ```typescript
   await processEvent(event);  // Should be safe to run multiple times
   ```

3. **Set sensible retry limits**
   ```typescript
   if (event.retryCount > 10) {
     // Alert monitoring, stop retrying
   }
   ```

4. **Batch event processing**
   ```typescript
   const events = await database.outboxEvent.findMany({
     where: { status: 'pending' },
     take: 100  // Process in batches
   });
   ```

## Related Documentation

- [Implementing Custom Stores](./implementing-custom-stores.md) - Store implementation
- [Embedded Runtime Pattern](./embedded-runtime-pattern.md) - Runtime usage
- [Semantics Spec](../spec/semantics.md) - Event emission semantics
