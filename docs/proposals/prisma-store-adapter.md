# Proposal: Prisma Store Adapter Pattern

**Status**: Draft
**Type**: Proposal
**Version**: 0.1
**Created**: 2026-02-14
**Target**: Configuration Layer (not core runtime)

---

## Executive Summary

This proposal defines how Manifest integrates with Prisma for entity persistence. Per the workflow specification (`specs/workflow/Manifest-Workflow-Orchestration-and-Effect-Boundaries.md`), **Prisma is NOT a core runtime store target**. Instead, Prisma integration follows the config-delegation pattern where applications provide Prisma-backed stores via `storeProvider`.

---

## Design Principle

> **Prisma is an adapter concern, not a language concern.**

The Manifest language defines store targets semantically (`memory`, `localStorage`, `postgres`, `supabase`). Prisma is an ORM that wraps PostgreSQL (or other databases), not a distinct persistence semantic. Therefore:

1. **No `prisma` keyword in lexer/parser**: The language does not recognize `prisma` as a store target
2. **No `PrismaStore` in runtime core**: The runtime does not include Prisma-specific code
3. **Config-driven binding**: Applications bind entities to Prisma models via `manifest.config.ts`

---

## Configuration Pattern

### manifest.config.ts

```typescript
import { PrismaClient } from '@prisma/client';
import { createPrismaStore } from './stores/prisma-store';

const prisma = new PrismaClient();

export default {
  // Map entities to store implementations
  stores: {
    InventoryItem: {
      implementation: createPrismaStore(prisma.inventoryItem, {
        // Property mapping: manifest property -> Prisma field
        propertyMapping: {
          itemNumber: 'item_number',
          unitCost: 'unit_cost',
        },
      }),
      prismaModel: 'InventoryItem', // For scanner validation
    },
    Station: {
      implementation: createPrismaStore(prisma.station),
      prismaModel: 'Station',
    },
  },

  // Auto-resolve user context
  resolveUser: async (auth: { authUserId: string; orgId: string }) => {
    const tenantId = await getTenantIdForOrg(auth.orgId);
    const user = await prisma.user.findFirst({
      where: { authUserId: auth.authUserId, tenantId }
    });
    return { id: user.id, role: user.role, tenantId };
  }
};
```

### Entity Declaration

```manifest
// No change to entity syntax - use existing store targets
entity InventoryItem {
  store InventoryItem in postgres  // Or just use memory for tests

  property id: string
  property itemNumber: string
  property name: string
  property unitCost: number

  command create(...) { ... }
}
```

The entity declares the semantic intent (`postgres`), and the config provides the actual implementation (`PrismaStore`).

---

## Store Factory Pattern

### createPrismaStore Factory

```typescript
// src/lib/stores/prisma-store.ts

import type { Store, EntityInstance } from '@manifest/runtime';

interface PrismaStoreConfig {
  propertyMapping?: Record<string, string>; // manifest -> prisma
  tenantIdField?: string; // For multi-tenant filtering
}

export function createPrismaStore<T extends EntityInstance>(
  delegate: PrismaDelegate<T>,
  config?: PrismaStoreConfig
): Store<T> {
  const mapping = config?.propertyMapping || {};
  const tenantField = config?.tenantIdField;

  return {
    async getAll(): Promise<T[]> {
      // Apply tenant filter if configured
      const where = tenantField ? { [tenantField]: getCurrentTenantId() } : {};
      const records = await delegate.findMany({ where });
      return records.map(r => mapFromPrisma(r, mapping));
    },

    async getById(id: string): Promise<T | undefined> {
      const record = await delegate.findUnique({ where: { id } });
      return record ? mapFromPrisma(record, mapping) : undefined;
    },

    async create(data: Partial<T>): Promise<T> {
      const prismaData = mapToPrisma(data, mapping);
      const record = await delegate.create({ data: prismaData });
      return mapFromPrisma(record, mapping);
    },

    async update(id: string, data: Partial<T>): Promise<T | undefined> {
      const prismaData = mapToPrisma(data, mapping);
      const record = await delegate.update({ where: { id }, data: prismaData });
      return mapFromPrisma(record, mapping);
    },

    async delete(id: string): Promise<boolean> {
      await delegate.delete({ where: { id } });
      return true;
    },

    async clear(): Promise<void> {
      // Not implemented for production stores
      throw new Error('clear() not supported on Prisma stores');
    }
  };
}

function mapToPrisma<T>(data: Partial<T>, mapping: Record<string, string>): any {
  const result: any = {};
  for (const [key, value] of Object.entries(data)) {
    const prismaKey = mapping[key] || key;
    result[prismaKey] = value;
  }
  return result;
}

function mapFromPrisma<T>(record: any, mapping: Record<string, string>): T {
  const reverseMapping = Object.fromEntries(
    Object.entries(mapping).map(([k, v]) => [v, k])
  );
  const result: any = {};
  for (const [key, value] of Object.entries(record)) {
    const manifestKey = reverseMapping[key] || key;
    result[manifestKey] = value;
  }
  return result;
}
```

---

## Scanner Integration

### Property Alignment Check

When `manifest scan` runs with a `manifest.config.ts` that specifies `prismaModel`:

1. Read the Prisma schema (auto-detect `prisma/schema.prisma` or use config path)
2. Compare manifest entity properties against Prisma model fields
3. Emit "Did you mean X?" suggestions using Levenshtein distance

```bash
$ npx manifest scan

❌ ERRORS:

  inventory-rules.manifest:7
    Property 'itemNumber' not found in Prisma model 'InventoryItem'.

    Prisma properties: id, item_number, name, category, unit_cost, ...

    Did you mean 'item_number'? Consider:
      1. Rename manifest property to match Prisma: 'item_number'
      2. Or add mapping in manifest.config.ts:
         stores: {
           InventoryItem: {
             propertyMapping: { itemNumber: 'item_number' }
           }
         }
```

---

## Why Not `prisma` as Built-in Store Target?

### 1. Semantic Redundancy

`prisma` is not a distinct persistence semantic — it's an ORM over PostgreSQL. The language already has `postgres` as a target. Adding `prisma` would create ambiguity:

```manifest
// Which is correct?
store X in postgres
store X in prisma
```

Both resolve to the same database. The distinction is implementation, not semantics.

### 2. Implementation Complexity

Prisma requires:
- Generated client (not always available at compile time)
- Schema parsing for property alignment
- Migration awareness for schema changes

These are adapter concerns, not language concerns.

### 3. Test Isolation

Using `postgres` as the semantic target allows:

```manifest
// Production uses Prisma, tests use memory
store InventoryItem in postgres
```

```typescript
// Test config
const testRuntime = new RuntimeEngine(ir, {
  storeProvider: (entity) => new MemoryStore() // Override for tests
});
```

If `prisma` were a built-in target, tests would need to mock Prisma or run a real database.

---

## Conformance Considerations

### No Prisma-Specific Fixtures Required

Since Prisma integration is config-driven, conformance fixtures continue to use `memory` or `postgres` targets. The runtime behavior is identical regardless of whether the store is Prisma-backed or not.

### Unit Test Coverage

The `createPrismaStore` factory should have unit tests for:
- Property mapping (to/from Prisma field names)
- Tenant filtering (multi-tenant scenarios)
- CRUD operations with mapped properties
- Error handling (Prisma errors mapped to Store interface)

---

## Implementation Checklist

- [ ] Create `src/lib/stores/prisma-store.ts` with `createPrismaStore` factory
- [ ] Add property mapping utilities (snake_case ↔ camelCase)
- [ ] Update `manifest.config.ts` schema with `stores.*.prismaModel` field
- [ ] Update scanner to read Prisma schema when `prismaModel` is specified
- [ ] Add property alignment scanner checks
- [ ] Write unit tests for Prisma store factory
- [ ] Document pattern in `docs/patterns/prisma-integration.md`

---

## References

- `docs/spec/adapters.md` - Store interface and custom store implementation
- `specs/workflow/Manifest-Workflow-Orchestration-and-Effect-Boundaries.md` - "Prisma is NOT a core runtime store target"
- `specs/ergonomics/manifest-config-ergonomics.md` - Configuration file design
- `docs/patterns/implementing-custom-stores.md` - Custom store patterns
