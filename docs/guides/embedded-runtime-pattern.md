# Embedded Runtime Pattern

> **⚠️ TESTING STATUS: Partially tested.**
> - ✅ Unit tests for constraint severity (3 tests)
> - ✅ Code generation produces TypeScript-valid code
> - ❌ No end-to-end HTTP tests for command execution
> - ❌ No real auth integration (tests used `authProvider:"none"`)
> - ❌ No real database integration (in-memory only)
>
> See [Capsule-Pro Test Results](https://github.com/capsule-pro/capsule-pro/docs/manifest/proven-with-tests.md) for current test status.

This guide explains how to use the Manifest Runtime Engine directly in your application code, giving you full control over execution flow, event handling, and database writes.

## Overview

The **Embedded Runtime** pattern means you import `RuntimeEngine` directly into your API routes and handle everything yourself. This is different from **Projections**, which auto-generate API routes for you.

## When to Use Embedded Runtime

✅ **Use embedded runtime when:**
- You have existing API logic to integrate
- Commands trigger complex workflows
- Events require multiple side effects (DB writes, webhooks, cache invalidation)
- You need custom file parsing or transformation
- Response format is non-standard
- You're integrating external services
- You need fine-grained control over execution

❌ **Don't use embedded runtime when:**
- You just need simple CRUD operations
- You want to minimize boilerplate
- You're starting a new feature from scratch
- Use projections instead

## Basic Usage

### 1. Import and Create Runtime

```typescript
import { RuntimeEngine, compileToIR } from '@manifest/runtime';
import { auth } from '@clerk/nextjs';

export async function POST(request: NextRequest) {
  // Get user context
  const { userId, orgId } = await auth();

  // Compile your manifest source (or load cached IR)
  const { ir } = await compileToIR(manifestSource);

  // Create runtime with user context
  const runtime = new RuntimeEngine(ir, {
    userId,
    tenantId: orgId,
  });

  // Execute command
  const result = await runtime.runCommand('create', {
    name: 'Pasta Carbonara',
    category: 'Italian'
  });

  if (!result.success) {
    return NextResponse.json({
      error: result.error,
      guardFailure: result.guardFailure
    }, { status: 400 });
  }

  return NextResponse.json({ result: result.result });
}
```

### 2. Handling Events

Events are your hooks for side effects:

```typescript
const runtime = new RuntimeEngine(ir, context);

// Set up event listeners BEFORE running commands
runtime.onEvent(async (event) => {
  switch (event.name) {
    case 'RecipeCreated':
      // Write to database
      await database.recipe.create({
        data: {
          id: event.payload.id,
          name: event.payload.name,
          tenantId: context.tenantId,
        }
      });
      break;

    case 'RecipeUpdated':
      // Invalidate cache
      await cache.invalidate(`recipe:${event.payload.id}`);
      break;

    case 'InventoryReserved':
      // Trigger webhook
      await webhookService.send({
        event: 'inventory.reserved',
        data: event.payload
      });
      break;
  }
});

// Now run the command
await runtime.runCommand('create', { name: 'Pasta' });
```

### 3. Using Custom Stores

```typescript
import { PrismaStore } from './stores/prisma-store';

const runtime = new RuntimeEngine(ir, context, {
  storeProvider: (entityName) => {
    return new PrismaStore({
      prisma: database,
      entityName: entityName,
      tenantId: context.tenantId,
    });
  }
});
```

## Complete Example: Document Import Workflow

This is a real-world example showing complex workflow orchestration:

```typescript
// app/api/documents/import/route.ts
import { RuntimeEngine, compileToIR } from '@manifest/runtime';
import { auth } from '@clerk/nextjs';
import { parseDocument } from '@/lib/pdf-parser';

export async function POST(request: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get current user from database
  const currentUser = await database.user.findFirst({
    where: { authUserId: userId, tenantId: orgId }
  });

  if (!currentUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 400 });
  }

  // Create runtime
  const { ir } = await compileToIR(manifestSource);
  const runtime = new RuntimeEngine(ir, {
    userId: currentUser.id,
    tenantId: orgId,
    storeProvider: (entityName) => createPrismaStore(entityName, orgId),
  });

  // Parse uploaded document (custom logic, not in Manifest)
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const parseResult = await parseDocument(file);

  // Execute Manifest command for validation
  const processResult = await runtime.runCommand('process', {
    fileId: file.name,
    fileName: file.name,
  }, {
    entityName: 'DocumentImport',
    instanceId: parseResult.importId,
  });

  if (!processResult.success) {
    return NextResponse.json({
      error: processResult.error,
      guardFailure: processResult.guardFailure
    }, { status: 400 });
  }

  // Handle events - trigger database writes
  for (const event of processResult.emittedEvents) {
    switch (event.name) {
      case 'DocumentProcessingStarted':
        // Update import status
        await database.documentImport.update({
          where: { id: event.payload.importId },
          data: { status: 'processing' }
        });

        // Queue background job
        await queue.add('process-document', {
          importId: event.payload.importId,
          parseResult
        });
        break;

      case 'DocumentParsed':
        // Create or update event
        await handleEventCreated(runtime, event, parseResult);
        break;

      case 'DocumentParseFailed':
        // Mark as failed
        await database.documentImport.update({
          where: { id: event.payload.importId },
          data: {
            status: 'failed',
            errors: event.payload.errors
          }
        });
        break;
    }
  }

  return NextResponse.json({
    success: true,
    importId: parseResult.importId,
    events: processResult.emittedEvents.map(e => ({ name: e.name, payload: e.payload }))
  });
}

// Helper function
async function handleEventCreated(runtime: RuntimeEngine, event: EmittedEvent, parseResult: any) {
  const eventData = parseResult.events?.[0];

  if (eventData?.eventId) {
    // Update existing event
    await runtime.runCommand('updateFromImport', {
      importData: eventData
    }, {
      entityName: 'Event',
      instanceId: eventData.eventId
    });
  } else {
    // Create new event
    const newEventId = crypto.randomUUID();
    await runtime.createInstance('Event', {
      id: newEventId,
      tenantId: runtime.context.tenantId,
      eventType: eventData.serviceStyle || 'catering',
      eventDate: eventData.date || new Date().toISOString(),
    });

    await runtime.runCommand('createFromImport', {
      importData: eventData
    }, {
      entityName: 'Event',
      instanceId: newEventId
    });
  }
}
```

## Event Collector Pattern

For transactional outbox, use the `eventCollector` option:

```typescript
const pendingEvents: EmittedEvent[] = [];

const runtime = new RuntimeEngine(ir, context, {
  eventCollector: pendingEvents,
  storeProvider: (entityName) => new PrismaStore({
    prisma: database,
    entityName,
    tenantId: context.tenantId,
    eventCollector: pendingEvents,  // Pass to store too
    outboxWriter: async (prisma, events) => {
      await prisma.outboxEvent.createMany({
        data: events.map(e => ({
          tenantId: context.tenantId,
          eventType: e.eventType,
          payload: e.payload,
          aggregateId: e.aggregateId,
        }))
      });
    }
  })
});

// After command execution, pendingEvents contains all emitted events
await runtime.runCommand('create', { name: 'Pasta' });
console.log(pendingEvents);  // [{ name: 'RecipeCreated', payload: {...} }]
```

## Runtime Options Reference

```typescript
interface RuntimeOptions {
  /** Custom ID generator */
  generateId?: () => string;

  /** Custom time source */
  now?: () => number;

  /** Verify IR hash before execution */
  requireValidProvenance?: boolean;

  /** Expected IR hash for verification */
  expectedIRHash?: string;

  /** Provide custom store implementations */
  storeProvider?: (entityName: string) => Store | undefined;

  /** Collect events for transactional outbox */
  eventCollector?: EmittedEvent[];

  /** Telemetry callbacks */
  telemetry?: {
    onConstraintEvaluated?: (outcome, commandName, entityName?) => void;
    onOverrideApplied?: (constraint, overrideReq, outcome, commandName) => void;
    onCommandExecuted?: (command, result, entityName?) => void;
  };
}
```

## Testing Embedded Runtime

```typescript
import { describe, it, expect } from 'vitest';
import { RuntimeEngine, compileToIR } from '@manifest/runtime';

describe('Recipe Commands', () => {
  it('should create recipe with event', async () => {
    const { ir } = await compileToIR(manifestSource);
    const events: EmittedEvent[] = [];

    const runtime = new RuntimeEngine(ir, {
      userId: 'user-123',
      tenantId: 'tenant-456',
    });

    runtime.onEvent((event) => events.push(event));

    const result = await runtime.runCommand('create', {
      name: 'Pasta Carbonara',
      category: 'Italian'
    });

    expect(result.success).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe('RecipeCreated');
  });
});
```

## Common Patterns

### 1. Guard Failure Handling

```typescript
const result = await runtime.runCommand('claim', { taskId: '123' });

if (!result.success) {
  if (result.guardFailure) {
    return NextResponse.json({
      error: `Guard ${result.guardFailure.index} failed`,
      expression: result.guardFailure.formatted,
      resolved: result.guardFailure.resolved
    }, { status: 422 });
  }

  if (result.policyDenial) {
    return NextResponse.json({
      error: `Access denied: ${result.policyDenial.policyName}`
    }, { status: 403 });
  }

  return NextResponse.json({
    error: result.error || 'Command failed'
  }, { status: 400 });
}
```

### 2. Constraint Outcomes

```typescript
const result = await runtime.runCommand('create', { name: 'Pasta' });

if (result.constraintOutcomes) {
  const blocking = result.constraintOutcomes.filter(
    o => !o.passed && o.severity === 'block' && !o.overridden
  );

  if (blocking.length > 0) {
    return NextResponse.json({
      error: 'Constraint validation failed',
      constraints: blocking.map(c => ({
        code: c.code,
        message: c.message,
        severity: c.severity
      }))
    }, { status: 400 });
  }
}
```

### 3. Idempotent Commands

```typescript
// For idempotency, check if command was already executed
const existing = await database.commandLog.findFirst({
  where: {
    commandName: 'process',
    entityId: importId,
    status: 'completed'
  }
});

if (existing) {
  return NextResponse.json({ success: true, alreadyProcessed: true });
}

// Execute command
const result = await runtime.runCommand('process', {...});
```

## Related Documentation

- [Usage Patterns](./usage-patterns.md) - Projections vs embedded runtime
- [Implementing Custom Stores](./implementing-custom-stores.md) - Store implementation guide
- [External Projections](../patterns/external-projections.md) - Read vs write strategy
- [Semantics Spec](../spec/semantics.md) - Runtime behavior
