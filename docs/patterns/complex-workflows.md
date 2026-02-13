# Complex Workflow Patterns with Embedded Runtime

Last updated: 2026-02-13
Status: Active
Authority: Advisory
Enforced by: None

This guide demonstrates how to use Manifest's embedded runtime for complex, multi-step business workflows. All examples use the Capsule Pro catering operations domain.

Normative semantics are defined in `docs/spec/semantics.md`. Workflow metadata is defined in `docs/spec/manifest-vnext.md` § "Workflow Metadata (Normative)".

---

## Runtime Configuration Reference

Before the patterns, here's how to configure the runtime features used throughout:

```typescript
import { RuntimeEngine } from '@manifest/runtime';
import type { EvaluationLimits, IdempotencyStore } from '@manifest/runtime';

const engine = new RuntimeEngine(ir, {
  // Workflow metadata: callers supply correlationId/causationId per command
  // (not configured here — passed per runCommand call)

  // Bounded complexity: protect against runaway expressions
  evaluationLimits: {
    maxExpressionDepth: 64,    // default 64
    maxEvaluationSteps: 10_000, // default 10,000
  },

  // Idempotency: prevent duplicate command execution
  idempotencyStore: myIdempotencyStore,

  // Deterministic mode: block adapter side effects (for testing/replay)
  deterministicMode: false,
});
```

---

## Pattern 1: Event Prep Workflow with Correlation

Multi-step event preparation: reserve inventory → generate prep lists → assign tasks to stations. All steps correlated so the full workflow is traceable.

### Manifest Definition

```manifest
entity InventoryItem {
  property required id: string
  property required tenantId: string
  property quantityOnHand: number = 0
  property quantityReserved: number = 0
  property quantityAvailable: number = 0
  property parLevel: number = 0
  property costPerUnit: number = 0

  computed isBelowPar = self.quantityAvailable < self.parLevel
  computed stockoutRisk = self.quantityAvailable <= 0

  command reserve(quantity: number, eventId: string) {
    guard quantity > 0
    guard self.quantityAvailable >= quantity

    constraint warnBelowPar severity warn
      when self.quantityAvailable - quantity < self.parLevel
      message "Reserving will drop below par level"

    constraint blockStockout severity block
      when self.quantityAvailable - quantity < 0
      message "Insufficient stock for reservation"

    mutate self.quantityReserved = self.quantityReserved + quantity
    mutate self.quantityAvailable = self.quantityAvailable - quantity
    emit InventoryReserved
  }

  command consume(quantity: number, eventId: string) {
    guard quantity > 0
    guard self.quantityReserved >= quantity

    mutate self.quantityOnHand = self.quantityOnHand - quantity
    mutate self.quantityReserved = self.quantityReserved - quantity
    emit InventoryConsumed
  }

  store InventoryItem in memory
}
```

### Implementation: Correlated Event Prep

```typescript
import { createInventoryRuntime, createPrepListRuntime, createStationRuntime } from '@capsule/manifest-adapters';
import { createPrismaStoreProvider } from '@capsule/manifest-adapters/prisma-store';
import * as Sentry from '@sentry/nextjs';

interface EventPrepContext {
  tenantId: string;
  userId: string;
  eventId: string;
  correlationId: string; // Groups all steps in this prep workflow
}

export async function prepareEventInventory(
  ctx: EventPrepContext,
  items: Array<{ inventoryItemId: string; quantity: number }>
) {
  const storeProvider = createPrismaStoreProvider(ctx.tenantId);
  const inventoryRuntime = createInventoryRuntime({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    storeProvider,
  });

  const reservationResults = [];
  const completedReservations: string[] = [];

  try {
    // Step 1: Reserve each inventory item, all correlated to this event prep
    for (const item of items) {
      const result = await inventoryRuntime.runCommand('reserve', {
        quantity: item.quantity,
        eventId: ctx.eventId,
      }, {
        entityName: 'InventoryItem',
        instanceId: item.inventoryItemId,
        correlationId: ctx.correlationId,
        causationId: `event-prep-${ctx.eventId}`,
      });

      if (!result.success) {
        // Check if it's a warning (below par) vs a block (stockout)
        const blockingOutcomes = result.constraintOutcomes?.filter(
          c => c.severity === 'block' && !c.passed
        );

        if (blockingOutcomes?.length) {
          throw new Error(
            `Cannot reserve ${item.inventoryItemId}: ${blockingOutcomes[0].message}`
          );
        }

        // Warn-only constraints: log but continue
        const warnings = result.constraintOutcomes?.filter(
          c => c.severity === 'warn' && !c.passed
        );
        if (warnings?.length) {
          Sentry.addBreadcrumb({
            category: 'inventory',
            message: `Warning: ${warnings.map(w => w.message).join(', ')}`,
            level: 'warning',
            data: { inventoryItemId: item.inventoryItemId, correlationId: ctx.correlationId },
          });
        }
      }

      completedReservations.push(item.inventoryItemId);
      reservationResults.push({
        inventoryItemId: item.inventoryItemId,
        result,
        // Every emitted event has the correlationId and emitIndex
        events: result.emittedEvents,
      });
    }

    return { success: true, reservations: reservationResults };

  } catch (error) {
    // Compensation: release all completed reservations
    for (const itemId of completedReservations) {
      const original = items.find(i => i.inventoryItemId === itemId)!;
      await inventoryRuntime.runCommand('releaseReservation', {
        quantity: original.quantity,
      }, {
        entityName: 'InventoryItem',
        instanceId: itemId,
        correlationId: ctx.correlationId,
        causationId: `compensation-${ctx.eventId}`,
      });
    }

    return { success: false, error: (error as Error).message };
  }
}
```

### Querying the Correlated Event Log

After the workflow runs, every emitted event carries the same `correlationId`. A caller can reconstruct the full workflow:

```typescript
// All events from this prep workflow share the same correlationId
const allEvents = inventoryRuntime.getEventLog();
const workflowEvents = allEvents.filter(
  e => e.correlationId === correlationId
);

// Events are ordered by emitIndex within each command invocation
// Cross-command ordering uses the event timestamp
const timeline = workflowEvents
  .sort((a, b) => a.timestamp - b.timestamp)
  .map(e => ({
    name: e.name,
    emitIndex: e.emitIndex,
    correlationId: e.correlationId,
    causationId: e.causationId,
    timestamp: e.timestamp,
  }));

// Example output:
// [
//   { name: 'InventoryReserved', emitIndex: 0, correlationId: 'prep-evt-42', causationId: 'event-prep-42', timestamp: 1707840000000 },
//   { name: 'InventoryReserved', emitIndex: 0, correlationId: 'prep-evt-42', causationId: 'event-prep-42', timestamp: 1707840000100 },
//   { name: 'InventoryReserved', emitIndex: 0, correlationId: 'prep-evt-42', causationId: 'event-prep-42', timestamp: 1707840000200 },
// ]
```

---

## Pattern 2: Prep Task Lifecycle with State Transitions

Prep tasks follow a strict state machine: open → claimed → in_progress → done. The `transition` keyword enforces this at the runtime level instead of using manual guards.

### Manifest Definition

```manifest
entity PrepTask {
  property required id: string
  property required tenantId: string
  property required eventId: string
  property required name: string
  property status: string = "open"
  property claimedBy: string?
  property claimedAt: number?
  property quantityTotal: number = 0
  property quantityCompleted: number = 0
  property priority: number = 0
  property dueByDate: number?
  property stationId: string?

  transition status from "open" to ["claimed", "cancelled"]
  transition status from "claimed" to ["in_progress", "open"]
  transition status from "in_progress" to ["done", "open"]

  computed isOverdue = self.dueByDate != null and now() > self.dueByDate
  computed percentComplete = self.quantityTotal > 0
    ? (self.quantityCompleted / self.quantityTotal) * 100
    : 0
  computed isUrgent = self.priority >= 8

  command claim(userId: string) {
    guard self.status == "open"

    constraint warnOverdue severity warn
      when self.isOverdue == true
      message "This task is overdue"

    mutate self.status = "claimed"
    mutate self.claimedBy = userId
    mutate self.claimedAt = now()
    emit PrepTaskClaimed
  }

  command start() {
    guard self.status == "claimed"
    mutate self.status = "in_progress"
    emit PrepTaskStarted
  }

  command complete(quantityCompleted: number) {
    guard self.status == "in_progress"
    guard quantityCompleted > 0

    mutate self.quantityCompleted = quantityCompleted
    mutate self.status = "done"
    emit PrepTaskCompleted
  }

  command release(reason: string) {
    guard self.status == "claimed" or self.status == "in_progress"
    mutate self.status = "open"
    mutate self.claimedBy = null
    mutate self.claimedAt = null
    emit PrepTaskReleased
  }

  command cancel() {
    guard self.status == "open"
    mutate self.status = "cancelled"
    emit PrepTaskCancelled
  }

  store PrepTask in memory
}
```

### Implementation: State Machine with Idempotency

Kitchen staff might tap "claim" twice on a laggy tablet. Idempotency prevents double-claims:

```typescript
import { RuntimeEngine } from '@manifest/runtime';
import type { IdempotencyStore, CommandResult } from '@manifest/runtime';

// In-memory idempotency store (use Redis in production)
class MemoryIdempotencyStore implements IdempotencyStore {
  private cache = new Map<string, CommandResult>();

  async has(key: string): Promise<boolean> { return this.cache.has(key); }
  async get(key: string): Promise<CommandResult | undefined> { return this.cache.get(key); }
  async set(key: string, result: CommandResult): Promise<void> { this.cache.set(key, result); }
}

export async function claimPrepTask(
  tenantId: string,
  userId: string,
  taskId: string,
  eventId: string,
) {
  const idempotencyStore = new MemoryIdempotencyStore();

  const engine = new RuntimeEngine(ir, {
    storeProvider: createPrismaStoreProvider(tenantId),
    idempotencyStore,
    evaluationLimits: { maxExpressionDepth: 32, maxEvaluationSteps: 5_000 },
  });

  // Idempotency key: same user claiming same task = same result
  const idempotencyKey = `claim-${tenantId}-${taskId}-${userId}`;

  const result = await engine.runCommand('claim', { userId }, {
    entityName: 'PrepTask',
    instanceId: taskId,
    correlationId: `event-${eventId}`,
    causationId: `user-action-${userId}`,
    idempotencyKey,
  });

  if (!result.success) {
    // The transition rules enforce the state machine.
    // If status is already "claimed", the transition from "claimed" to "claimed"
    // is not in the allowed list, so the runtime returns:
    // { success: false, error: "Invalid state transition for 'status': 'claimed' -> 'claimed' is not allowed..." }
    return {
      success: false,
      error: result.error,
      warnings: result.constraintOutcomes?.filter(c => c.severity === 'warn' && !c.passed),
    };
  }

  // Second call with same idempotencyKey returns the cached result without re-executing
  const duplicate = await engine.runCommand('claim', { userId }, {
    entityName: 'PrepTask',
    instanceId: taskId,
    correlationId: `event-${eventId}`,
    causationId: `user-action-${userId}`,
    idempotencyKey,
  });
  // duplicate === result (cached, no re-execution)

  return {
    success: true,
    events: result.emittedEvents,
    warnings: result.constraintOutcomes?.filter(c => c.severity === 'warn' && !c.passed),
  };
}
```

---

## Pattern 3: Multi-Step Event Execution Saga

Full event day workflow: prep tasks → inventory consumption → station coordination. Each step is causally linked so failures can be traced.

### Implementation: Causal Chain Across Domains

```typescript
import {
  createPrepTaskRuntime,
  createInventoryRuntime,
  createStationRuntime,
} from '@capsule/manifest-adapters';
import * as Sentry from '@sentry/nextjs';

interface EventExecutionContext {
  tenantId: string;
  userId: string;
  eventId: string;
}

export async function executeEventDay(ctx: EventExecutionContext) {
  const correlationId = `event-day-${ctx.eventId}-${Date.now()}`;
  const storeProvider = createPrismaStoreProvider(ctx.tenantId);

  const prepRuntime = createPrepTaskRuntime({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    storeProvider,
  });

  const inventoryRuntime = createInventoryRuntime({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    storeProvider,
  });

  const stationRuntime = createStationRuntime({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    storeProvider,
  });

  const completedSteps: Array<{ domain: string; action: string; entityId: string }> = [];

  try {
    // Step 1: Start all prep tasks for this event
    const tasks = await prisma.prepTask.findMany({
      where: { tenantId: ctx.tenantId, eventId: ctx.eventId, status: 'claimed' },
    });

    for (const task of tasks) {
      const startResult = await prepRuntime.runCommand('start', {}, {
        entityName: 'PrepTask',
        instanceId: task.id,
        correlationId,
        causationId: `event-day-start-${ctx.eventId}`,
      });

      if (startResult.success) {
        completedSteps.push({ domain: 'prep', action: 'start', entityId: task.id });
      }
    }

    // Step 2: Consume inventory for each prep task's ingredients
    // causationId links to the prep task that triggered the consumption
    for (const task of tasks) {
      const ingredients = await prisma.prepTaskIngredient.findMany({
        where: { tenantId: ctx.tenantId, prepTaskId: task.id },
      });

      for (const ingredient of ingredients) {
        const consumeResult = await inventoryRuntime.runCommand('consume', {
          quantity: ingredient.quantity,
          eventId: ctx.eventId,
        }, {
          entityName: 'InventoryItem',
          instanceId: ingredient.inventoryItemId,
          correlationId,
          causationId: `prep-task-${task.id}`, // traces back to which task
        });

        if (consumeResult.success) {
          completedSteps.push({
            domain: 'inventory',
            action: 'consume',
            entityId: ingredient.inventoryItemId,
          });
        }
      }
    }

    // Step 3: Assign tasks to stations
    for (const task of tasks) {
      if (!task.stationId) continue;

      const assignResult = await stationRuntime.runCommand('assignTask', {
        taskId: task.id,
      }, {
        entityName: 'Station',
        instanceId: task.stationId,
        correlationId,
        causationId: `prep-task-${task.id}`,
      });

      if (!assignResult.success) {
        // Station at capacity — log warning but don't fail the whole workflow
        const blocking = assignResult.constraintOutcomes?.filter(
          c => c.severity === 'block' && !c.passed
        );
        Sentry.captureMessage(`Station ${task.stationId} at capacity`, {
          level: 'warning',
          extra: { correlationId, taskId: task.id, constraints: blocking },
        });
      }
    }

    return { success: true, correlationId, stepsCompleted: completedSteps.length };

  } catch (error) {
    Sentry.captureException(error, {
      extra: { correlationId, completedSteps },
    });

    return { success: false, correlationId, error: (error as Error).message };
  }
}
```

### Tracing the Causal Chain

After execution, the event log reveals the full causal graph:

```typescript
const allEvents = [
  ...prepRuntime.getEventLog(),
  ...inventoryRuntime.getEventLog(),
  ...stationRuntime.getEventLog(),
].filter(e => e.correlationId === correlationId);

// Build causal tree
const byCausation = new Map<string, typeof allEvents>();
for (const event of allEvents) {
  const key = event.causationId ?? 'root';
  if (!byCausation.has(key)) byCausation.set(key, []);
  byCausation.get(key)!.push(event);
}

// Example causal tree:
// event-day-start-evt-42
//   └─ PrepTaskStarted (task-1, emitIndex: 0)
//   └─ PrepTaskStarted (task-2, emitIndex: 0)
//
// prep-task-1
//   └─ InventoryConsumed (item-flour, emitIndex: 0)
//   └─ InventoryConsumed (item-butter, emitIndex: 0)
//   └─ StationTaskAssigned (station-hot-line, emitIndex: 0)
//
// prep-task-2
//   └─ InventoryConsumed (item-cream, emitIndex: 0)
//   └─ StationTaskAssigned (station-cold-prep, emitIndex: 0)
```

---

## Pattern 4: Deterministic Replay for Event Verification

After an event, verify that the recorded commands produce identical results. Uses `deterministicMode` to prevent side effects and `emitIndex` to verify determinism.

```typescript
import { RuntimeEngine, ManifestEffectBoundaryError } from '@manifest/runtime';

interface RecordedCommand {
  commandName: string;
  input: Record<string, unknown>;
  options: { entityName?: string; instanceId?: string; correlationId?: string; causationId?: string };
  expectedEvents: Array<{ name: string; emitIndex: number }>;
}

export async function replayAndVerify(
  ir: IR,
  recordedCommands: RecordedCommand[],
): Promise<{ verified: boolean; mismatches: string[] }> {
  // Deterministic mode: persist/publish/effect actions throw instead of no-oping
  const engine = new RuntimeEngine(ir, {
    deterministicMode: true,
    evaluationLimits: { maxExpressionDepth: 32, maxEvaluationSteps: 5_000 },
  });

  const mismatches: string[] = [];

  for (const recorded of recordedCommands) {
    const result = await engine.runCommand(
      recorded.commandName,
      recorded.input,
      recorded.options,
    );

    if (!result.success) {
      mismatches.push(`Command ${recorded.commandName} failed: ${result.error}`);
      continue;
    }

    // Verify emitIndex determinism: same inputs must produce same event ordering
    for (let i = 0; i < recorded.expectedEvents.length; i++) {
      const expected = recorded.expectedEvents[i];
      const actual = result.emittedEvents[i];

      if (!actual) {
        mismatches.push(
          `Command ${recorded.commandName}: expected event ${expected.name} at index ${i}, got nothing`
        );
        continue;
      }

      if (actual.name !== expected.name) {
        mismatches.push(
          `Command ${recorded.commandName}: expected event ${expected.name}, got ${actual.name}`
        );
      }

      if (actual.emitIndex !== expected.emitIndex) {
        mismatches.push(
          `Command ${recorded.commandName}: emitIndex mismatch for ${expected.name}: ` +
          `expected ${expected.emitIndex}, got ${actual.emitIndex}`
        );
      }
    }
  }

  return { verified: mismatches.length === 0, mismatches };
}

// Usage: verify last night's event execution was deterministic
const recorded: RecordedCommand[] = [
  {
    commandName: 'claim',
    input: { userId: 'chef-maria' },
    options: { entityName: 'PrepTask', instanceId: 'task-42', correlationId: 'event-day-99' },
    expectedEvents: [{ name: 'PrepTaskClaimed', emitIndex: 0 }],
  },
  {
    commandName: 'start',
    input: {},
    options: { entityName: 'PrepTask', instanceId: 'task-42', correlationId: 'event-day-99' },
    expectedEvents: [{ name: 'PrepTaskStarted', emitIndex: 0 }],
  },
  {
    commandName: 'complete',
    input: { quantityCompleted: 50 },
    options: { entityName: 'PrepTask', instanceId: 'task-42', correlationId: 'event-day-99' },
    expectedEvents: [{ name: 'PrepTaskCompleted', emitIndex: 0 }],
  },
];

const verification = await replayAndVerify(ir, recorded);
// { verified: true, mismatches: [] }
```

---

## Pattern 5: Constraint Severity in Inventory Operations

Inventory commands use three constraint severity levels to give operators flexibility:

- `ok`: Informational (logged, never blocks)
- `warn`: Non-blocking alert (UI shows yellow warning, operator proceeds)
- `block`: Hard stop (cannot proceed unless overridden by a manager)

### Implementation: Handling Severity Levels

```typescript
import { createInventoryRuntime, getWarningConstraints, getBlockingConstraints, canProceedWithConstraints } from '@capsule/manifest-adapters';

export async function restockInventoryItem(
  tenantId: string,
  userId: string,
  itemId: string,
  quantity: number,
) {
  const runtime = createInventoryRuntime({
    tenantId,
    userId,
    storeProvider: createPrismaStoreProvider(tenantId),
  });

  const result = await runtime.runCommand('restock', {
    quantity,
  }, {
    entityName: 'InventoryItem',
    instanceId: itemId,
  });

  // Separate concerns by severity
  const warnings = getWarningConstraints(result.constraintOutcomes ?? []);
  const blockers = getBlockingConstraints(result.constraintOutcomes ?? []);

  if (blockers.length > 0) {
    // Hard failure — cannot proceed
    return {
      success: false,
      blockers: blockers.map(b => ({
        code: b.code,
        message: b.message,
        details: b.details,
      })),
    };
  }

  if (warnings.length > 0) {
    // Soft warning — succeeded but operator should know
    return {
      success: true,
      warnings: warnings.map(w => ({
        code: w.code,
        message: w.message,
      })),
      events: result.emittedEvents,
    };
  }

  return { success: true, events: result.emittedEvents };
}
```

### Override Flow: Manager Bypasses a Block

When a blocking constraint fires (e.g., stockout), a manager can override it:

```typescript
export async function reserveWithManagerOverride(
  tenantId: string,
  userId: string,
  managerId: string,
  itemId: string,
  quantity: number,
  eventId: string,
  overrideReason: string,
) {
  const runtime = createInventoryRuntime({
    tenantId,
    userId,
    storeProvider: createPrismaStoreProvider(tenantId),
  });

  const result = await runtime.runCommand('reserve', {
    quantity,
    eventId,
  }, {
    entityName: 'InventoryItem',
    instanceId: itemId,
    overrideRequests: [
      {
        constraintCode: 'blockStockout',
        reason: overrideReason,
        authorizedBy: managerId,
      },
    ],
  });

  // If override succeeds, the result includes an OverrideApplied event
  const overrideEvent = result.emittedEvents.find(e => e.name === 'OverrideApplied');
  if (overrideEvent) {
    // Audit trail: who overrode what, when, and why
    // {
    //   name: 'OverrideApplied',
    //   channel: 'system',
    //   payload: {
    //     constraintCode: 'blockStockout',
    //     reason: 'Emergency event tomorrow, ordering more stock now',
    //     authorizedBy: 'manager-jane',
    //     timestamp: 1707840000000,
    //     commandName: 'reserve',
    //     entityName: 'InventoryItem',
    //     instanceId: 'item-flour-01'
    //   }
    // }
  }

  return result;
}
```

---

## Pattern 6: Bounded Complexity for User-Defined Rules

When evaluating complex computed properties or deeply nested constraints (e.g., a recipe with many ingredients each with allergen checks), set limits to prevent runaway evaluation:

```typescript
import { RuntimeEngine, EvaluationBudgetExceededError } from '@manifest/runtime';

// Tight limits for user-facing operations (fast failure on bad data)
const kitchenEngine = new RuntimeEngine(ir, {
  evaluationLimits: {
    maxExpressionDepth: 32,
    maxEvaluationSteps: 2_000,
  },
  storeProvider: createPrismaStoreProvider(tenantId),
});

// Generous limits for batch operations (admin, reporting)
const batchEngine = new RuntimeEngine(ir, {
  evaluationLimits: {
    maxExpressionDepth: 64,
    maxEvaluationSteps: 50_000,
  },
  storeProvider: createPrismaStoreProvider(tenantId),
});

// When limits are hit, runCommand returns a failure (not a thrown exception)
const result = await kitchenEngine.runCommand('reserve', {
  quantity: 100,
  eventId: 'evt-99',
}, {
  entityName: 'InventoryItem',
  instanceId: 'item-01',
});

if (!result.success && result.error?.includes('Evaluation budget exceeded')) {
  // Budget error: expression was too complex
  // result.error = "Evaluation budget exceeded: steps limit 2000 reached"
  Sentry.captureMessage('Expression complexity exceeded', {
    level: 'error',
    extra: { error: result.error, entityId: 'item-01' },
  });
}

// For public entry points (checkConstraints, evaluateComputed), the error propagates
// as an uncaught EvaluationBudgetExceededError — callers must handle it:
try {
  const outcomes = await kitchenEngine.checkConstraints('InventoryItem', 'item-01');
} catch (e) {
  if (e instanceof EvaluationBudgetExceededError) {
    console.error(`Constraint evaluation too complex: ${e.limitType} limit ${e.limit}`);
  }
}
```

---

## Best Practices

### 1. Always Supply correlationId for Multi-Step Workflows

```typescript
const correlationId = `event-prep-${eventId}-${Date.now()}`;

// Every command in this workflow gets the same correlationId
await runtime.runCommand('reserve', input, { correlationId, ... });
await runtime.runCommand('assignTask', input, { correlationId, ... });
await runtime.runCommand('start', input, { correlationId, ... });
```

### 2. Use causationId to Link Cause and Effect

```typescript
// Step 1 emits InventoryReserved
const reserveResult = await inventoryRuntime.runCommand('reserve', input, {
  correlationId,
  causationId: `user-action-${userId}`,
});

// Step 2 was caused by the reservation
const assignResult = await stationRuntime.runCommand('assignTask', input, {
  correlationId,
  causationId: `reservation-${reserveResult.emittedEvents[0]?.emitIndex}`,
});
```

### 3. Use Idempotency for User-Initiated Actions

```typescript
// Same key = same result, no re-execution
await runtime.runCommand('claim', { userId }, {
  entityName: 'PrepTask',
  instanceId: taskId,
  idempotencyKey: `claim-${taskId}-${userId}`,
});
```

### 4. Use Sentry Spans for Observability

```typescript
import * as Sentry from '@sentry/nextjs';

const result = await Sentry.startSpan(
  { name: 'manifest.runCommand', op: 'manifest', attributes: { command: 'claim', entity: 'PrepTask' } },
  async () => {
    return runtime.runCommand('claim', { userId }, { entityName: 'PrepTask', instanceId: taskId });
  }
);
```

### 5. Use Transactions with Outbox for Reliable Event Delivery

```typescript
import { prisma } from '@capsule/database';

await prisma.$transaction(async (tx) => {
  const result = await runtime.runCommand('reserve', input, options);

  // Store events in outbox within same transaction
  if (result.emittedEvents.length > 0) {
    await tx.outbox.createMany({
      data: result.emittedEvents.map(event => ({
        tenantId,
        eventName: event.name,
        channel: event.channel,
        payload: event.payload,
        correlationId: event.correlationId,
        causationId: event.causationId,
        emitIndex: event.emitIndex,
        timestamp: new Date(event.timestamp),
        published: false,
      })),
    });
  }
});
// Outbox worker publishes to Ably asynchronously
```

---

## Related Documentation

- **Spec**: `docs/spec/semantics.md` — Command execution semantics
- **vNext**: `docs/spec/manifest-vnext.md` — Workflow metadata, idempotency, evaluation limits
- **Adapters**: `docs/spec/adapters.md` — IdempotencyStore, deterministicMode
- **Embedded Runtime**: `docs/patterns/embedded-runtime-pattern.md` — Basic usage
- **Event Wiring**: `docs/patterns/event-wiring.md` — Connecting events to Ably/queues
- **Transactional Outbox**: `docs/patterns/transactional-outbox-pattern.md` — Guaranteed event delivery
