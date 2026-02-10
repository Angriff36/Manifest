# Implementing Custom Stores

> **⚠️ TESTING STATUS: This pattern is used in production but lacks dedicated test coverage.**
> See [Capsule-Pro Test Results](https://github.com/capsule-pro/capsule-pro/docs/manifest/proven-with-tests.md) for current test status.

This guide explains how to implement custom storage adapters for Manifest, using PrismaStore as a reference example.

## Overview

Manifest provides a `Store` interface that you can implement to connect the runtime to your database. The runtime doesn't care how you store data - it only cares that you implement the `Store` interface.

## The Store Interface

```typescript
export interface Store<T extends EntityInstance = EntityInstance> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | undefined>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T | undefined>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<void>;
}

export interface EntityInstance {
  id: string;
  [key: string]: unknown;
}
```

## How to Use Your Custom Store

You provide your store implementation to the runtime via the `storeProvider` option:

```typescript
import { RuntimeEngine } from '@manifest/runtime';
import { PrismaStore } from './my-prisma-store';

const runtime = new RuntimeEngine(ir, {
  tenantId: 'tenant-123',
  userId: 'user-456',
  storeProvider: (entityName) => {
    // Return your custom store for specific entities
    if (entityName === 'Recipe' || entityName === 'PrepTask') {
      return new PrismaStore({
        prisma: database,
        entityName: entityName,
        tenantId: 'tenant-123',
      });
    }
    // Return undefined to use default in-memory store
    return undefined;
  }
});
```

## Reference Implementation: PrismaStore

Here's a complete example of a Prisma-based store with transactional outbox support:

```typescript
import type { Prisma, PrismaClient } from "@prisma/client";
import type { EntityInstance, Store } from "@manifest/runtime";

export interface PrismaStoreConfig<T extends EntityInstance = EntityInstance> {
  prisma: PrismaClient;
  entityName: string;
  tenantId: string;
  generateId?: () => string;
}

export class PrismaStore<T extends EntityInstance> implements Store<T> {
  private readonly prisma: PrismaClient;
  private readonly entityName: string;
  private readonly prismaModel: string;
  private readonly tenantId: string;
  private readonly generateId: () => string;

  constructor(config: PrismaStoreConfig<T>) {
    this.prisma = config.prisma;
    this.entityName = config.entityName;
    this.prismaModel = entityNameToPrismaModel(config.entityName);
    this.tenantId = config.tenantId;
    this.generateId = config.generateId || (() => crypto.randomUUID());
  }

  async getAll(): Promise<T[]> {
    const model = this.prisma[this.prismaModel as keyof PrismaClient];
    return await model.findMany({
      where: { tenant_id: this.tenantId }
    });
  }

  async getById(id: string): Promise<T | undefined> {
    const model = this.prisma[this.prismaModel as keyof PrismaClient];
    return await model.findUnique({
      where: {
        tenantId_id: {  // Compound key for tenant isolation
          tenantId: this.tenantId,
          id
        }
      }
    });
  }

  async create(data: Partial<T>): Promise<T> {
    const id = (data.id || this.generateId()) as string;
    const item = { ...data, id } as T;

    const model = this.prisma[this.prismaModel as keyof PrismaClient];
    return await model.create({
      data: {
        ...item,
        tenant_id: this.tenantId,
      }
    });
  }

  async update(id: string, data: Partial<T>): Promise<T | undefined> {
    const model = this.prisma[this.prismaModel as keyof PrismaClient];

    const current = await model.findUnique({
      where: {
        tenantId_id: {
          tenantId: this.tenantId,
          id
        }
      }
    });

    if (!current) return undefined;

    return await model.update({
      where: {
        tenantId_id: {
          tenantId: this.tenantId,
          id
        }
      },
      data
    });
  }

  async delete(id: string): Promise<boolean> {
    const model = this.prisma[this.prismaModel as keyof PrismaClient];
    try {
      await model.delete({
        where: {
          tenantId_id: {
            tenantId: this.tenantId,
            id
          }
        }
      });
      return true;
    } catch {
      return false;
    }
  }

  async clear(): Promise<void> {
    const model = this.prisma[this.prismaModel as keyof PrismaClient];
    await model.deleteMany({
      where: { tenant_id: this.tenantId }
    });
  }
}

function entityNameToPrismaModel(entityName: string): string {
  // Convert PascalCase to snake_case
  return entityName
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}
```

## Key Patterns

### 1. Tenant Isolation

Your store should filter all operations by tenant:

```typescript
// Always include tenant filtering
where: {
  tenant_id: this.tenantId
}
```

### 2. Compound Primary Keys

For multi-tenant schemas, use compound keys:

```typescript
// Prisma schema with compound key
model Recipe {
  tenantId  String
  id        String
  name      String

  @@id([tenantId, id])
}

// Query uses compound key
where: {
  tenantId_id: {
    tenantId: this.tenantId,
    id: recipeId
  }
}
```

### 3. ID Generation

Support custom ID generation:

```typescript
generateId?: () => string;

// Default to crypto.randomUUID()
this.generateId = config.generateId || (() => crypto.randomUUID());
```

## When to Use Custom Stores

Use custom stores when:
- You need database-specific features (transactions, upserts, batches)
- You have existing schema/ORM (Prisma, TypeORM, Drizzle)
- You need tenant isolation at the database level
- You want to integrate with your existing data layer

Use built-in stores when:
- Prototyping or testing (MemoryStore)
- Simple browser apps (LocalStorageStore)
- Direct Postgres without ORM (PostgresStore)
- Supabase integration (SupabaseStore)

## Testing Your Store

```typescript
import { describe, it, expect } from 'vitest';
import { PrismaStore } from './prisma-store';

describe('PrismaStore', () => {
  it('should create and retrieve entities', async () => {
    const store = new PrismaStore({
      prisma: mockPrisma,
      entityName: 'Recipe',
      tenantId: 'tenant-123'
    });

    const created = await store.create({ name: 'Pasta' });
    expect(created.id).toBeTruthy();

    const found = await store.getById(created.id);
    expect(found?.name).toBe('Pasta');
  });
});
```

## Related Documentation

- [Adapters Spec](../spec/adapters.md) - Adapter hooks and requirements
- [External Projections](../patterns/external-projections.md) - Read vs write strategy
- [Usage Patterns](./usage-patterns.md) - Projections vs embedded runtime
