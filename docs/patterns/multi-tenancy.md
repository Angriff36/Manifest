# Multi-Tenancy Implementation Guide

Authority: Advisory
Enforced by: None
Last updated: 2026-02-12

This guide shows how to implement multi-tenant applications with Manifest.

Normative semantics are defined in `docs/spec/semantics.md` and `docs/spec/adapters.md`.

---

## Core Concept

Multi-tenancy in Manifest is **enforced at the store layer**, not the language layer.

**Why?** Tenant isolation is an infrastructure concern, not a domain semantic.

**How it works:**

1. Manifest commands define domain rules (guards, policies, events)
2. Runtime context provides `tenantId` as an input
3. Custom stores enforce tenant boundaries at the database level
4. Guards and policies MAY reference `context.tenantId` for business rules

---

## Pattern 1: Tenant Scoping in Runtime Context

Pass `tenantId` via runtime context.

### Basic Example

```typescript
import { RuntimeEngine } from '@manifest/runtime';

const runtime = new RuntimeEngine(ir, {
  userId: 'user-123',
  tenantId: 'tenant-456', // Tenant context
});

// All commands execute within this tenant context
const result = await runtime.runCommand('Recipe', 'create', {
  name: 'Chocolate Cake',
});
```

### From Auth Provider (Clerk Example)

```typescript
import { auth } from '@clerk/nextjs/server';

export async function POST(request: Request) {
  const { userId } = await auth();

  // Fetch tenant mapping from database
  const userMapping = await prisma.userTenantMapping.findUnique({
    where: { userId },
  });

  if (!userMapping) {
    return Response.json({ error: 'User not mapped to tenant' }, { status: 400 });
  }

  const { tenantId } = userMapping;

  // Runtime scoped to tenant
  const runtime = new RuntimeEngine(ir, { userId, tenantId });

  const result = await runtime.runCommand('Recipe', 'create', await request.json());

  return Response.json(result);
}
```

---

## Pattern 2: Multi-Tenant Store Implementation

Implement tenant isolation at the storage layer.

### Prisma Schema

```prisma
model Recipe {
  id          String   @id @default(uuid())
  tenantId    String   // Tenant boundary
  name        String
  description String?
  createdBy   String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime? // Soft delete

  // Compound index for tenant queries
  @@index([tenantId, deletedAt])
  @@index([tenantId, createdBy])
}

model UserTenantMapping {
  userId   String @id
  tenantId String
  role     String

  @@index([tenantId])
}
```

### Custom Tenant-Scoped Store

```typescript
import { Store } from '@manifest/runtime';
import { PrismaClient } from '@prisma/client';

export class TenantScopedPrismaStore<T extends { id: string; tenantId: string }>
  implements Store<T>
{
  constructor(
    private prisma: PrismaClient,
    private entityName: string,
    private tenantId: string
  ) {}

  async getAll(): Promise<T[]> {
    return await this.prisma[this.entityName].findMany({
      where: {
        tenantId: this.tenantId,
        deletedAt: null, // Soft delete filter
      },
    }) as T[];
  }

  async getById(id: string): Promise<T | undefined> {
    const result = await this.prisma[this.entityName].findUnique({
      where: {
        id,
        tenantId: this.tenantId, // Tenant isolation
        deletedAt: null,
      },
    });

    return result as T | undefined;
  }

  async create(data: Partial<T>): Promise<T> {
    return await this.prisma[this.entityName].create({
      data: {
        ...data,
        tenantId: this.tenantId, // Inject tenant
      },
    }) as T;
  }

  async update(id: string, data: Partial<T>): Promise<T | undefined> {
    // Verify tenant ownership before update
    const existing = await this.getById(id);
    if (!existing) {
      return undefined;
    }

    return await this.prisma[this.entityName].update({
      where: {
        id,
        tenantId: this.tenantId,
      },
      data,
    }) as T;
  }

  async delete(id: string): Promise<boolean> {
    // Soft delete with tenant check
    const result = await this.prisma[this.entityName].updateMany({
      where: {
        id,
        tenantId: this.tenantId,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return result.count > 0;
  }

  async clear(): Promise<void> {
    // Only clear this tenant's data
    await this.prisma[this.entityName].deleteMany({
      where: { tenantId: this.tenantId },
    });
  }
}
```

### Wire to Runtime

```typescript
import { RuntimeEngine } from '@manifest/runtime';

const runtime = new RuntimeEngine(ir, { userId, tenantId }, {
  storeProvider: (entityName) => {
    // Return tenant-scoped store for each entity
    return new TenantScopedPrismaStore(prisma, entityName, tenantId);
  },
});
```

---

## Pattern 3: Tenant-Based Authorization

Use guards and policies to enforce tenant boundaries in business logic.

### Manifest Definition

```manifest
entity Recipe {
  property required id: string
  property required tenantId: string
  property required name: string
  property createdBy: string

  command update(name: string) {
    // Ensure user belongs to same tenant
    guard context.tenantId == this.tenantId

    // Ensure user has permission
    guard this.createdBy == user.id or user.role == "admin"

    mutate name = name
  }

  command delete() {
    // Tenant boundary check
    guard context.tenantId == this.tenantId

    // Role check
    guard user.role in ["admin", "owner"]

    mutate deletedAt = now()
  }

  policy CanEdit execute: context.tenantId == self.tenantId and (
    self.createdBy == user.id or user.role == "admin"
  )
}
```

### Cross-Tenant Prevention

```typescript
// This will fail the guard
const runtime = new RuntimeEngine(ir, {
  userId: 'user-123',
  tenantId: 'tenant-A',
});

// Attempt to update recipe from tenant-B
const result = await runtime.runCommand('Recipe', 'update', {
  instanceId: 'recipe-from-tenant-B',
  name: 'Hacked Recipe',
});

// result.success = false
// result.guardFailure = { index: 1, expression: "context.tenantId == this.tenantId" }
```

---

## Pattern 4: Compound Tenant Keys

Use composite keys for tenant + entity ID.

### Prisma Schema

```prisma
model Recipe {
  id          String   @default(uuid())
  tenantId    String
  name        String

  // Compound primary key
  @@id([tenantId, id])
  @@index([tenantId])
}
```

### Custom Store with Compound Keys

```typescript
export class CompoundKeyStore<T extends { id: string; tenantId: string }>
  implements Store<T>
{
  constructor(
    private prisma: PrismaClient,
    private entityName: string,
    private tenantId: string
  ) {}

  async getById(id: string): Promise<T | undefined> {
    const result = await this.prisma[this.entityName].findUnique({
      where: {
        tenantId_id: {
          tenantId: this.tenantId,
          id,
        },
      },
    });

    return result as T | undefined;
  }

  async update(id: string, data: Partial<T>): Promise<T | undefined> {
    return await this.prisma[this.entityName].update({
      where: {
        tenantId_id: {
          tenantId: this.tenantId,
          id,
        },
      },
      data,
    }) as T;
  }

  // ... other methods
}
```

---

## Pattern 5: Tenant Isolation in Projections

Ensure generated routes enforce tenant boundaries.

### Next.js Route Example

```typescript
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { RuntimeEngine } from '@manifest/runtime';

export async function GET(request: Request) {
  const { userId } = await auth();

  // Fetch tenant from user mapping
  const userMapping = await prisma.userTenantMapping.findUnique({
    where: { userId },
  });

  if (!userMapping) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { tenantId } = userMapping;

  // Query scoped to tenant
  const recipes = await prisma.recipe.findMany({
    where: {
      tenantId,
      deletedAt: null,
    },
  });

  return Response.json({ recipes });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  const userMapping = await prisma.userTenantMapping.findUnique({
    where: { userId },
  });

  if (!userMapping) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { tenantId } = userMapping;

  // Runtime scoped to tenant
  const runtime = new RuntimeEngine(ir, { userId, tenantId });

  const input = await request.json();

  const result = await runtime.runCommand('Recipe', 'create', input);

  return Response.json(result);
}
```

---

## Pattern 6: Per-Tenant Database Separation

Use separate database connections for each tenant.

### Database Pool

```typescript
import { PrismaClient } from '@prisma/client';

const tenantPools = new Map<string, PrismaClient>();

export function getTenantPrisma(tenantId: string): PrismaClient {
  if (!tenantPools.has(tenantId)) {
    const databaseUrl = `postgresql://user:pass@localhost/${tenantId}_db`;

    tenantPools.set(tenantId, new PrismaClient({
      datasources: {
        db: { url: databaseUrl },
      },
    }));
  }

  return tenantPools.get(tenantId)!;
}
```

### Store with Tenant Database

```typescript
export class TenantDatabaseStore<T extends { id: string }>
  implements Store<T>
{
  private prisma: PrismaClient;

  constructor(
    private entityName: string,
    private tenantId: string
  ) {
    this.prisma = getTenantPrisma(tenantId);
  }

  async getAll(): Promise<T[]> {
    // No tenantId filter needed - separate database
    return await this.prisma[this.entityName].findMany({
      where: { deletedAt: null },
    }) as T[];
  }

  async getById(id: string): Promise<T | undefined> {
    return await this.prisma[this.entityName].findUnique({
      where: { id },
    }) as T | undefined;
  }

  // ... other methods
}
```

---

## Pattern 7: Row-Level Security (PostgreSQL)

Use database-level RLS policies for tenant isolation.

### PostgreSQL Schema

```sql
CREATE TABLE recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can only access their tenant's data
CREATE POLICY tenant_isolation ON recipes
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

### Store with RLS

```typescript
export class RLSStore<T extends { id: string; tenantId: string }>
  implements Store<T>
{
  constructor(
    private pool: Pool,
    private tableName: string,
    private tenantId: string
  ) {}

  private async withTenantContext<R>(
    fn: (client: PoolClient) => Promise<R>
  ): Promise<R> {
    const client = await this.pool.connect();

    try {
      // Set tenant context for RLS
      await client.query(`SET LOCAL app.tenant_id = $1`, [this.tenantId]);

      return await fn(client);
    } finally {
      client.release();
    }
  }

  async getAll(): Promise<T[]> {
    return this.withTenantContext(async (client) => {
      const result = await client.query(
        `SELECT * FROM ${this.tableName} WHERE deleted_at IS NULL`
      );
      return result.rows as T[];
    });
  }

  async create(data: Partial<T>): Promise<T> {
    return this.withTenantContext(async (client) => {
      const result = await client.query(
        `INSERT INTO ${this.tableName} (tenant_id, ...) VALUES ($1, ...) RETURNING *`,
        [this.tenantId, ...]
      );
      return result.rows[0] as T;
    });
  }

  // ... other methods
}
```

---

## Best Practices

### 1. Never Trust Client-Provided Tenant IDs

**Bad:**

```typescript
const { tenantId } = await request.json(); // DON'T
```

**Good:**

```typescript
const { userId } = await auth();
const userMapping = await prisma.userTenantMapping.findUnique({ where: { userId } });
const { tenantId } = userMapping; // Derive from auth
```

### 2. Always Filter by Tenant in Queries

```typescript
// Always include tenantId filter
await prisma.recipe.findMany({
  where: {
    tenantId,
    deletedAt: null,
  },
});
```

### 3. Use Database Indexes

```prisma
model Recipe {
  // ...
  @@index([tenantId, deletedAt])
  @@index([tenantId, createdAt])
  @@index([tenantId, createdBy])
}
```

### 4. Test Cross-Tenant Isolation

```typescript
test('cannot access other tenant data', async () => {
  const runtime = new RuntimeEngine(ir, {
    userId: 'user-A',
    tenantId: 'tenant-A',
  });

  const result = await runtime.runCommand('Recipe', 'update', {
    instanceId: 'recipe-from-tenant-B',
    name: 'Hacked',
  });

  expect(result.success).toBe(false);
  expect(result.error).toMatch(/not found/i);
});
```

### 5. Audit Tenant Access

```typescript
runtime.onEvent((event) => {
  auditLog.create({
    tenantId: event.payload.tenantId,
    userId: event.payload.userId,
    action: event.name,
    timestamp: event.timestamp,
  });
});
```

---

## Common Patterns Summary

| Pattern | Isolation Level | Complexity | Use Case |
|---------|-----------------|------------|----------|
| Tenant-scoped stores | Application | Low | Most common |
| Compound keys | Database | Medium | Strong isolation |
| Separate databases | Database | High | Compliance requirements |
| Row-level security | Database | Medium | PostgreSQL-specific |

---

## Related Documentation

- **Spec**: `docs/spec/adapters.md` - Custom stores
- **Custom Stores**: `docs/patterns/implementing-custom-stores.md`
- **Embedded Runtime**: `docs/patterns/embedded-runtime-pattern.md` - Request identity hardening
- **Deployment Boundaries**: `docs/contracts/deployment-boundaries.md` - FAQ #2 (external database)

---

**TL;DR**: Multi-tenancy is enforced at the store layer. Pass `tenantId` via runtime context, implement tenant-scoped stores, and use guards/policies for business-level tenant checks. Never trust client-provided tenant IDs.
