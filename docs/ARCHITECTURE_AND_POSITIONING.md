# Manifest: Architecture and Positioning

Authority: Advisory
Enforced by: None
Last updated: 2026-02-12

## What Manifest Is

Manifest is a **deterministic business rules engine** with:

- **Formal IR contract** (`docs/spec/ir/ir-v1.schema.json`)
- **Strict runtime semantics** (`docs/spec/semantics.md`)
- **Executable conformance evidence** (`src/manifest/conformance/`)
- **Adapter boundaries** for infrastructure concerns
- **IR provenance and integrity verification**

It gives you a **language-level contract** for domain behavior with deterministic execution guarantees.

---

## What Manifest Is NOT

### NOT a Backend Framework

Manifest is NOT competing with NestJS, Express, Fastify, or Hono.

| Backend Framework | Manifest |
|-------------------|----------|
| HTTP routing, middleware, request/response | Domain rules, guards, policies, events |
| You write route handlers | You declare commands with guards |
| Framework owns execution flow | IR defines execution semantics |
| Convention-over-configuration | Contract-over-convention |

**Manifest defines WHAT should happen. Your framework defines HOW to expose it.**

You can use Manifest WITH any backend framework:
- Next.js App Router (via projections)
- Express/Fastify (via embedded runtime)
- Hono/Bun (via embedded runtime)

---

### NOT a Transport Layer

Manifest does NOT provide WebSockets, Server-Sent Events, or real-time push.

**Why?** Transport is an infrastructure concern, not a domain semantic.

**How it works:**

1. Manifest commands emit events with a defined contract
2. You wire those events to YOUR chosen transport
3. The runtime provides `onEvent()` hooks for this purpose

**Example:**

```typescript
const runtime = new RuntimeEngine(ir, { userId, tenantId });

// Wire events to Ably
runtime.onEvent((event) => {
  ably.channels.get(event.channel).publish(event.name, event.payload);
});

// Wire events to WebSockets
runtime.onEvent((event) => {
  wsServer.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(event));
    }
  });
});
```

See: `docs/patterns/event-wiring.md` for complete examples.

---

### NOT a Job Queue

Manifest does NOT schedule background jobs, manage queues, or handle retries.

**Why?** Job orchestration is infrastructure, not domain logic.

**How it works:**

1. Manifest events represent "something happened"
2. You wire events to a job queue (Bull, BullMQ, Temporal, Inngest)
3. Jobs execute side effects (emails, webhooks, external APIs)

**Example:**

```typescript
import { Queue } from 'bullmq';

const emailQueue = new Queue('emails');

runtime.onEvent((event) => {
  if (event.name === 'InvoiceGenerated') {
    emailQueue.add('send-invoice-email', {
      invoiceId: event.payload.invoiceId,
      userId: event.payload.userId,
    });
  }
});
```

See: `docs/patterns/event-wiring.md` for job queue integration patterns.

---

### NOT an Auth Provider

Manifest handles **authorization** (policies, guards), NOT authentication.

**Why?** Authentication is identity verification (login, SSO, tokens). Authorization is permission checking.

**How it works:**

1. Your auth provider (Clerk, Auth0, NextAuth) handles login
2. You extract `userId`, `tenantId`, `role` from auth context
3. You pass that as runtime context to Manifest
4. Manifest policies and guards check permissions

**Example:**

```typescript
// Auth layer (Clerk example)
const { userId } = await auth();
const userMapping = await db.userTenantMapping.findUnique({ where: { userId } });

// Manifest runtime
const runtime = new RuntimeEngine(ir, {
  userId,
  tenantId: userMapping.tenantId,
  context: { role: userMapping.role }
});

// Manifest policy checks
policy CanDeleteInvoice execute: user.role == "admin" or self.createdBy == user.id
```

**Critical**: Never trust `userId` or `tenantId` from request body. Always derive from auth context.

See: `docs/patterns/embedded-runtime-pattern.md` → Request Identity Hardening

---

### NOT an ORM

Manifest is NOT Prisma, TypeORM, or Drizzle.

| ORM | Manifest |
|-----|----------|
| Database schema + type-safe queries | Business rules + execution semantics |
| `findMany()`, `create()`, `update()` are imperative | Commands are declarative with guards |
| No built-in authorization | Guards and policies are first-class |
| No event system | Events are first-class with ordering guarantees |
| Schema migrations managed by ORM | Migrations owned by your store implementation |

**You can use Manifest WITH any ORM:**

```typescript
import { RuntimeEngine, Store } from '@manifest/runtime';
import { PrismaClient } from '@prisma/client';

class PrismaRecipeStore implements Store<Recipe> {
  constructor(private prisma: PrismaClient) {}

  async getAll() {
    return await this.prisma.recipe.findMany({ where: { deletedAt: null } });
  }

  async create(data: Partial<Recipe>) {
    return await this.prisma.recipe.create({ data });
  }

  // ... other Store methods
}

const runtime = new RuntimeEngine(ir, { userId, tenantId }, {
  storeProvider: (entityName) => {
    if (entityName === 'Recipe') {
      return new PrismaRecipeStore(prisma);
    }
  }
});
```

See: `docs/patterns/implementing-custom-stores.md`

---

### NOT a Database Migration Tool

Manifest does NOT manage schema migrations or database DDL.

**Why?** Database migrations are infrastructure, not domain semantics.

**How it works:**

1. Manifest IR defines domain semantics (entities, properties, relationships)
2. Your store implementation owns the actual database schema
3. You use YOUR migration tool (Prisma Migrate, TypeORM migrations, raw SQL)

**Example:**

```typescript
// Manifest defines the contract
entity Invoice {
  property id: string
  property amount: number
  property status: string = "draft"
}

// Prisma schema owns the implementation
model Invoice {
  id        String   @id @default(uuid())
  amount    Float
  status    String   @default("draft")
  tenantId  String   // Multi-tenancy
  createdAt DateTime @default(now())
  deletedAt DateTime? // Soft delete

  @@index([tenantId, deletedAt])
}
```

See: `docs/contracts/deployment-boundaries.md` → Migration Story

---

## What Manifest IS: The Semantic Brain

Manifest is the **semantic contract** that sits between your framework and your infrastructure.

```
┌─────────────────────────────────────────────────────────┐
│                    Your Application                       │
├─────────────────────────────────────────────────────────┤
│  Framework Layer: Next.js / Express / Hono               │
│  (Routing, middleware, request/response)                 │
├─────────────────────────────────────────────────────────┤
│              ┌───────────────────────┐                   │
│              │  MANIFEST RUNTIME      │                   │
│              │  (Semantic Brain)      │                   │
│              │                        │                   │
│              │  • Domain rules        │                   │
│              │  • Guard semantics     │                   │
│              │  • Policy enforcement  │                   │
│              │  • Event emission      │                   │
│              │  • Deterministic exec  │                   │
│              └───────────────────────┘                   │
├─────────────────────────────────────────────────────────┤
│  Infrastructure Layer: Adapters                          │
│  • Stores: Prisma, TypeORM, custom                       │
│  • Events: Ably, Kafka, WebSockets                       │
│  • Jobs: Bull, Temporal, Inngest                         │
│  • Auth: Clerk, Auth0, NextAuth                          │
└─────────────────────────────────────────────────────────┘
```

**Value proposition:**

1. **Deterministic Semantics**: Same IR + same context = same result
2. **IR Provenance**: Every IR has a verifiable hash and lineage
3. **Executable Conformance**: 467 tests prove compiler/runtime behavior
4. **Guard-Based Security**: Authorization cannot be bypassed
5. **Event Ordering Guarantees**: Events emitted in declaration order

---

## When to Use Manifest

Use Manifest when you need:

✅ **Formal business rules** with provenance and auditability
✅ **Guard-based authorization** that cannot be bypassed
✅ **Event-driven architectures** with ordering guarantees
✅ **Deterministic execution** for testing and compliance
✅ **AI-assisted domain modeling** (AI agents emit Manifest programs)

---

## When NOT to Use Manifest

Don't use Manifest if:

❌ You just need a CRUD API (use Prisma + tRPC or similar)
❌ You don't need formal authorization rules (use simple middleware)
❌ You don't need event emission (use direct mutation)
❌ You're building a stateless API with no business logic

**Rule of thumb:** If your "business logic" is just `CREATE`, `READ`, `UPDATE`, `DELETE` with no guards, policies, or events, you don't need Manifest.

---

## Integration Patterns

Most real-world applications use **both** projections AND embedded runtime:

### Projection Pattern (Simple CRUD)

```typescript
// Generated Next.js route (reads bypass runtime)
export async function GET() {
  const recipes = await prisma.recipe.findMany({
    where: { tenantId, deletedAt: null }
  });
  return Response.json({ recipes });
}

// Generated command route (mutations use runtime)
export async function POST(request: Request) {
  const input = await request.json();
  const runtime = new RuntimeEngine(ir, { userId, tenantId });
  const result = await runtime.runCommand('Recipe', 'create', input);
  return Response.json(result);
}
```

### Embedded Runtime Pattern (Complex Workflows)

```typescript
// Custom orchestration
export async function POST(request: Request) {
  const runtime = new RuntimeEngine(ir, { userId, tenantId });

  // Multi-step workflow with event handling
  runtime.onEvent((event) => {
    if (event.name === 'OrderPlaced') {
      // Reserve inventory
      emailQueue.add('send-order-confirmation', event.payload);
      analyticsQueue.add('track-order', event.payload);
    }
  });

  const result = await runtime.runCommand('Order', 'place', input);

  if (!result.success) {
    // Custom error handling
    await logFailure(result.diagnostics);
    return Response.json({ error: 'Order failed' }, { status: 400 });
  }

  return Response.json(result);
}
```

See: `docs/patterns/hybrid-integration.md` for detailed examples.

---

## Comparison Table

| Need | Solution | Layer |
|------|----------|-------|
| Domain rules and guards | Manifest | Semantic |
| HTTP routing | Next.js/Express/Hono | Framework |
| Real-time push | Ably/Pusher/WebSockets | Transport |
| Background jobs | Bull/Temporal/Inngest | Infrastructure |
| Authentication | Clerk/Auth0/NextAuth | Identity |
| Database access | Prisma/TypeORM/Drizzle | Persistence |
| Schema migrations | Prisma Migrate/raw SQL | Persistence |

**Manifest is the semantic layer. You bring your own framework and infrastructure.**

---

## Further Reading

- **Spec**: `docs/spec/README.md` - Language semantics and IR contract
- **Adapters**: `docs/spec/adapters.md` - Adapter boundaries and contracts
- **Usage Patterns**: `docs/patterns/usage-patterns.md` - Projections vs embedded runtime
- **Event Wiring**: `docs/patterns/event-wiring.md` - Connect events to infrastructure
- **Custom Stores**: `docs/patterns/implementing-custom-stores.md` - ORM integration
- **Deployment Boundaries**: `docs/contracts/deployment-boundaries.md` - What's in scope vs not

---

**TL;DR**: Manifest is a deterministic business rules engine with IR provenance and strict semantics. It's NOT a backend framework, transport layer, job queue, auth provider, or ORM. It's the semantic brain you wire to your infrastructure.
