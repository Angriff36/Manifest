# Hybrid Integration Patterns

Authority: Advisory
Enforced by: None
Last updated: 2026-02-12

This guide shows how to combine **projections** and **embedded runtime** for real-world applications.

Most production applications use BOTH patterns together.

Normative semantics are defined in `docs/spec/semantics.md`.

---

## Core Concept

**Projections** and **embedded runtime** solve different problems:

| Pattern | Best For | Example |
|---------|----------|---------|
| **Projections** | Standard CRUD operations | Recipe list, User profile GET |
| **Embedded Runtime** | Complex workflows | Order processing, Document imports |

**Hybrid approach:** Use projections for simple operations, embedded runtime for complex ones.

---

## Pattern 1: CRUD with Custom Actions

Use projections for CRUD, embedded runtime for business logic.

### Manifest Definition

```manifest
entity Recipe {
  property required id: string
  property required name: string
  property required ingredients: array
  property status: string = "draft"
  property publishedAt: timestamp?
  property views: number = 0

  command create(name: string, ingredients: array) {
    guard name is not empty
    guard ingredients.length > 0

    mutate name = name
    mutate ingredients = ingredients
  }

  command publish() {
    guard this.status == "draft"
    guard this.ingredients.length >= 3

    mutate this.status = "published"
    mutate this.publishedAt = now()
    emit RecipePublished
  }

  command incrementViews() {
    mutate this.views = this.views + 1
  }
}

store Recipe in postgres
```

### Generated Projection (Simple CRUD)

```typescript
// app/api/recipes/route.ts
import { prisma } from '@/lib/prisma';
import { auth } from '@clerk/nextjs/server';

export async function GET() {
  const { userId } = await auth();

  // Simple read: bypass runtime for performance
  const recipes = await prisma.recipe.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  return Response.json({ recipes });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  const input = await request.json();

  // Simple create: use projection
  const runtime = new RuntimeEngine(ir, { userId, tenantId });
  const result = await runtime.runCommand('Recipe', 'create', input);

  return Response.json(result);
}
```

### Custom Handler (Complex Logic)

```typescript
// app/api/recipes/[id]/publish/route.ts
import { RuntimeEngine } from '@manifest/runtime';
import { Queue } from 'bullmq';

const notificationQueue = new Queue('notifications');
const analyticsQueue = new Queue('analytics');

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  const userMapping = await prisma.userTenantMapping.findUnique({ where: { userId } });
  const { tenantId } = userMapping;

  const runtime = new RuntimeEngine(ir, { userId, tenantId });

  // Wire events for complex workflow
  runtime.onEvent(async (event) => {
    if (event.name === 'RecipePublished') {
      // Send notifications
      await notificationQueue.add('recipe-published', {
        recipeId: event.payload.id,
        authorId: event.payload.authorId,
      });

      // Track analytics
      await analyticsQueue.add('track-publish', {
        recipeId: event.payload.id,
        timestamp: event.timestamp,
      });

      // Index for search
      await searchIndex.addDocument({
        id: event.payload.id,
        name: event.payload.name,
        ingredients: event.payload.ingredients,
      });
    }
  });

  // Execute command
  const result = await runtime.runCommand('Recipe', 'publish', {
    instanceId: params.id,
  });

  if (!result.success) {
    return Response.json({ error: result.diagnostics }, { status: 400 });
  }

  return Response.json(result);
}
```

---

## Pattern 2: Read Projection + Write Runtime

Use projections for reads, embedded runtime for writes.

### Read Projection (Fast Queries)

```typescript
// app/api/orders/route.ts
export async function GET(request: Request) {
  const { userId } = await auth();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  // Direct database query (bypass runtime)
  const orders = await prisma.order.findMany({
    where: {
      tenantId,
      userId,
      status: status || undefined,
      deletedAt: null,
    },
    include: {
      items: true,
      customer: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return Response.json({ orders });
}
```

### Write Runtime (Complex Orchestration)

```typescript
// app/api/orders/route.ts
export async function POST(request: Request) {
  const { userId } = await auth();
  const input = await request.json();

  const runtime = new RuntimeEngine(ir, { userId, tenantId });

  // Multi-step order workflow
  runtime.onEvent(async (event) => {
    if (event.name === 'OrderPlaced') {
      // Reserve inventory
      const reservation = await inventoryService.reserve(event.payload.items);

      await runtime.runCommand('Order', 'reserveInventory', {
        instanceId: event.payload.id,
        reservationId: reservation.id,
      });
    }

    if (event.name === 'InventoryReserved') {
      // Process payment
      const payment = await paymentService.charge(
        event.payload.userId,
        event.payload.totalAmount
      );

      await runtime.runCommand('Order', 'processPayment', {
        instanceId: event.payload.id,
        paymentId: payment.id,
      });
    }

    if (event.name === 'PaymentProcessed') {
      // Queue fulfillment
      await fulfillmentQueue.add('fulfill-order', {
        orderId: event.payload.id,
      });
    }
  });

  const result = await runtime.runCommand('Order', 'place', input);

  return Response.json(result);
}
```

---

## Pattern 3: Generated + Custom Routes

Mix generated projection routes with custom business logic.

### Project Structure

```
app/api/
├── recipes/
│   ├── route.ts              # Generated CRUD (projection)
│   ├── [id]/
│   │   ├── route.ts          # Generated CRUD (projection)
│   │   ├── publish/
│   │   │   └── route.ts      # Custom logic (embedded runtime)
│   │   ├── clone/
│   │   │   └── route.ts      # Custom logic (embedded runtime)
│   │   └── analytics/
│   │       └── route.ts      # Custom read (direct query)
```

### Generated Route

```typescript
// app/api/recipes/route.ts (generated)
export async function GET() { /* ... */ }
export async function POST(request: Request) {
  const runtime = new RuntimeEngine(ir, { userId, tenantId });
  return runtime.runCommand('Recipe', 'create', await request.json());
}
```

### Custom Route

```typescript
// app/api/recipes/[id]/clone/route.ts (custom)
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();

  const runtime = new RuntimeEngine(ir, { userId, tenantId });

  // Fetch original recipe
  const original = await prisma.recipe.findUnique({
    where: { id: params.id },
  });

  if (!original) {
    return Response.json({ error: 'Recipe not found' }, { status: 404 });
  }

  // Create clone with custom logic
  const result = await runtime.runCommand('Recipe', 'create', {
    name: `${original.name} (Copy)`,
    ingredients: original.ingredients,
    instructions: original.instructions,
  });

  if (result.success) {
    // Track clone event
    await analyticsQueue.add('recipe-cloned', {
      originalId: params.id,
      cloneId: result.instance.id,
    });
  }

  return Response.json(result);
}
```

---

## Pattern 4: Projection with Event Handlers

Use projections for mutations, add event handlers for side effects.

### Projection Route

```typescript
// app/api/invoices/route.ts (projection-based)
import { RuntimeEngine } from '@manifest/runtime';
import { setupEventHandlers } from '@/lib/event-handlers';

export async function POST(request: Request) {
  const { userId } = await auth();
  const input = await request.json();

  const runtime = new RuntimeEngine(ir, { userId, tenantId });

  // Attach event handlers
  setupEventHandlers(runtime);

  // Execute command
  const result = await runtime.runCommand('Invoice', 'create', input);

  return Response.json(result);
}
```

### Event Handlers Module

```typescript
// lib/event-handlers.ts
import { RuntimeEngine } from '@manifest/runtime';
import { emailQueue, analyticsQueue, searchIndex } from './queues';

export function setupEventHandlers(runtime: RuntimeEngine) {
  runtime.onEvent(async (event) => {
    // Email notifications
    if (event.name === 'InvoiceGenerated') {
      await emailQueue.add('send-invoice', {
        invoiceId: event.payload.id,
        userId: event.payload.userId,
      });
    }

    // Analytics tracking
    if (event.name.startsWith('Invoice')) {
      await analyticsQueue.add('track-event', {
        eventName: event.name,
        payload: event.payload,
        timestamp: event.timestamp,
      });
    }

    // Search indexing
    if (event.name === 'RecipePublished') {
      await searchIndex.addDocument(event.payload);
    }
  });
}
```

---

## Pattern 5: Shared Runtime with Request Context

Create runtime once per request, use across multiple operations.

### Middleware

```typescript
// middleware/runtime.ts
import { RuntimeEngine } from '@manifest/runtime';
import { NextRequest } from 'next/server';

export async function withRuntime(
  request: NextRequest,
  handler: (runtime: RuntimeEngine) => Promise<Response>
): Promise<Response> {
  const { userId } = await auth();

  const userMapping = await prisma.userTenantMapping.findUnique({
    where: { userId },
  });

  if (!userMapping) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { tenantId, role } = userMapping;

  // Create runtime with full context
  const runtime = new RuntimeEngine(ir, {
    userId,
    tenantId,
    context: { role, requestId: crypto.randomUUID() },
  });

  // Attach global event handlers
  setupEventHandlers(runtime);

  // Execute handler
  return handler(runtime);
}
```

### Route Handler

```typescript
// app/api/orders/route.ts
import { withRuntime } from '@/middleware/runtime';

export async function POST(request: Request) {
  return withRuntime(request, async (runtime) => {
    const input = await request.json();

    // Use runtime for multiple commands
    const orderResult = await runtime.runCommand('Order', 'create', input);

    if (orderResult.success) {
      // Send confirmation
      await runtime.runCommand('Notification', 'send', {
        userId: input.userId,
        message: 'Order created successfully',
      });
    }

    return Response.json(orderResult);
  });
}
```

---

## Pattern 6: Background Job with Embedded Runtime

Queue jobs that use embedded runtime for complex processing.

### Job Queue

```typescript
// app/api/reports/generate/route.ts
import { reportQueue } from '@/lib/queues';

export async function POST(request: Request) {
  const { userId } = await auth();
  const { reportType, dateRange } = await request.json();

  // Queue async job
  const job = await reportQueue.add('generate-report', {
    userId,
    tenantId,
    reportType,
    dateRange,
  });

  return Response.json({
    jobId: job.id,
    status: 'processing',
  });
}
```

### Worker

```typescript
// workers/report-worker.ts
import { Worker } from 'bullmq';
import { RuntimeEngine } from '@manifest/runtime';

const worker = new Worker('reports', async (job) => {
  const { userId, tenantId, reportType, dateRange } = job.data;

  const runtime = new RuntimeEngine(ir, { userId, tenantId });

  // Multi-step report generation
  const createResult = await runtime.runCommand('Report', 'create', {
    type: reportType,
    dateRange,
  });

  const reportId = createResult.instance.id;

  // Fetch data
  const data = await fetchReportData(reportType, dateRange);

  // Generate PDF
  const pdfUrl = await generatePDF(data);

  // Update report
  await runtime.runCommand('Report', 'markGenerated', {
    instanceId: reportId,
    pdfUrl,
  });

  // Send email
  await runtime.runCommand('Report', 'send', {
    instanceId: reportId,
  });

  return { reportId, pdfUrl };
});
```

---

## Pattern 7: GraphQL + Embedded Runtime

Use embedded runtime with GraphQL resolvers.

### GraphQL Schema

```graphql
type Mutation {
  createRecipe(input: CreateRecipeInput!): RecipeResult!
  publishRecipe(id: ID!): RecipeResult!
}

type RecipeResult {
  success: Boolean!
  recipe: Recipe
  errors: [String!]
}
```

### Resolvers

```typescript
import { RuntimeEngine } from '@manifest/runtime';

export const resolvers = {
  Mutation: {
    async createRecipe(_, { input }, context) {
      const runtime = new RuntimeEngine(ir, {
        userId: context.userId,
        tenantId: context.tenantId,
      });

      const result = await runtime.runCommand('Recipe', 'create', input);

      return {
        success: result.success,
        recipe: result.instance,
        errors: result.diagnostics?.map(d => d.message),
      };
    },

    async publishRecipe(_, { id }, context) {
      const runtime = new RuntimeEngine(ir, {
        userId: context.userId,
        tenantId: context.tenantId,
      });

      runtime.onEvent(async (event) => {
        if (event.name === 'RecipePublished') {
          await notificationQueue.add('recipe-published', event.payload);
        }
      });

      const result = await runtime.runCommand('Recipe', 'publish', {
        instanceId: id,
      });

      return {
        success: result.success,
        recipe: result.instance,
        errors: result.diagnostics?.map(d => d.message),
      };
    },
  },
};
```

---

## Best Practices

### 1. Use Projections for Simple Operations

**Simple CRUD:**

```typescript
// Use projection (less code, faster)
export async function GET() {
  return Response.json({
    recipes: await prisma.recipe.findMany({ where: { tenantId } }),
  });
}
```

**Complex workflow:**

```typescript
// Use embedded runtime
export async function POST(request: Request) {
  const runtime = new RuntimeEngine(ir, { userId, tenantId });
  runtime.onEvent(/* ... */);
  return runtime.runCommand(/* ... */);
}
```

### 2. Share Event Handlers Across Routes

```typescript
// lib/event-handlers.ts
export const globalEventHandlers = (runtime: RuntimeEngine) => {
  runtime.onEvent(/* ... */);
};

// Use in routes
import { globalEventHandlers } from '@/lib/event-handlers';

const runtime = new RuntimeEngine(ir, { userId, tenantId });
globalEventHandlers(runtime);
```

### 3. Test Both Patterns

```typescript
// Test projection
test('GET /recipes returns list', async () => {
  const response = await fetch('/api/recipes');
  expect(response.status).toBe(200);
});

// Test embedded runtime
test('POST /recipes/publish emits event', async () => {
  const events: EmittedEvent[] = [];

  runtime.onEvent(event => events.push(event));
  await runtime.runCommand('Recipe', 'publish', { instanceId });

  expect(events).toContainEqual(
    expect.objectContaining({ name: 'RecipePublished' })
  );
});
```

### 4. Document Which Pattern Each Route Uses

```typescript
/**
 * GET /api/recipes
 * Pattern: Projection (direct database query)
 * Use: Fast list retrieval
 */
export async function GET() { /* ... */ }

/**
 * POST /api/recipes/[id]/publish
 * Pattern: Embedded runtime
 * Use: Complex workflow with events
 */
export async function POST() { /* ... */ }
```

---

## Decision Matrix

| Scenario | Pattern | Rationale |
|----------|---------|-----------|
| List recipes | Projection | Simple read, no business logic |
| Create recipe | Projection | Standard CRUD |
| Publish recipe | Embedded Runtime | Events, notifications, search indexing |
| Place order | Embedded Runtime | Multi-step: inventory → payment → fulfillment |
| Get user profile | Projection | Simple read |
| Update user settings | Projection | Simple update, no side effects |
| Generate invoice | Embedded Runtime | Async job, PDF generation, email |
| Delete recipe | Projection | Simple delete with soft delete filter |

---

## Related Documentation

- **Spec**: `docs/spec/semantics.md` - Runtime semantics
- **Usage Patterns**: `docs/patterns/usage-patterns.md` - Decision guide
- **Embedded Runtime**: `docs/patterns/embedded-runtime-pattern.md`
- **Event Wiring**: `docs/patterns/event-wiring.md` - Side effects
- **Complex Workflows**: `docs/patterns/complex-workflows.md` - Multi-step orchestration

---

**TL;DR**: Use **projections** for simple CRUD, **embedded runtime** for complex workflows. Most apps use both. Share event handlers. Test both patterns.
