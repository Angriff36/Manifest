# Storage Adapters Specification

## Job to Be Done

As a developer building applications with Manifest, I want to persist entity data to real databases (PostgreSQL, Supabase), so that my applications have durable state beyond in-memory storage.

## Status ✅ COMPLETED

**Implementation Date:** 2026-02-05

Per `docs/spec/adapters.md`:
- Memory store: Implemented ✅
- localStorage: Implemented ✅
- PostgreSQL: Implemented ✅ (in `src/manifest/stores.node.ts`)
- Supabase: Implemented ✅ (in `src/manifest/stores.node.ts`)

## Acceptance Criteria

1. **PostgreSQL Adapter** ✅
   - Connection configuration via store declaration ✅
   - CRUD operations (create, read, update, delete) ✅
   - Connection pooling and error handling ✅
   - JSONB storage with automatic table creation ✅

2. **Supabase Adapter** ✅
   - Supabase client configuration ✅
   - CRUD operations using Supabase client ✅
   - Proper error handling ✅

3. **Adapter Interface** ✅
   - Consistent interface across all adapters ✅
   - Adapters are pluggable via `storeProvider` option ✅
   - Clear error messages for failures ✅

## Technical Notes

**Implementation Location:** `src/manifest/stores.node.ts`

**Key Features:**
- `PostgresStore<T>`: Full PostgreSQL adapter with connection pooling
- `SupabaseStore<T>`: Supabase adapter with client integration
- Both implement the `Store<T>` interface
- Automatic table initialization with JSONB storage
- GIN indexing for efficient JSON queries in PostgreSQL

**Browser vs Server-Side:**
- Browser runtime: Only supports `memory` and `localStorage` (security restriction)
- Server-side: Use `storeProvider` option to inject PostgresStore or SupabaseStore

## Usage Example

```typescript
import { RuntimeEngine } from './runtime-engine.js';
import { PostgresStore } from './stores.node.js';

const runtime = new RuntimeEngine(ir, context, {
  storeProvider: (entityName) => {
    // Use PostgreSQL for all entities
    return new PostgresStore({
      connectionString: process.env.DATABASE_URL,
      tableName: entityName.toLowerCase()
    });
  }
});
```

## Related Files

- `src/manifest/runtime-engine.ts` - core runtime with storeProvider option
- `src/manifest/stores.node.ts` - PostgreSQL and Supabase implementations
- `docs/spec/adapters.md` - adapter specification
