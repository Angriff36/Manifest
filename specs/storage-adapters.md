# Storage Adapters Specification

## Job to Be Done

As a developer building applications with Manifest, I want to persist entity data to real databases (PostgreSQL, Supabase), so that my applications have durable state beyond in-memory storage.

## Current State (Nonconformance)

Per `docs/spec/adapters.md`:
- Memory store: Implemented
- localStorage: Implemented
- PostgreSQL: Declared but NOT implemented
- Supabase: Declared but NOT implemented

## Acceptance Criteria

1. **PostgreSQL Adapter**
   - Connection configuration via store declaration
   - CRUD operations (create, read, update, delete)
   - Transaction support for command execution
   - Connection pooling and error handling

2. **Supabase Adapter**
   - Supabase client configuration via store declaration
   - CRUD operations using Supabase client
   - RLS integration where applicable

3. **Adapter Interface**
   - Consistent interface across all adapters
   - Adapters are pluggable/swappable
   - Clear error messages for failures

## Technical Notes

- Significant implementation effort
- May require changes to runtime-engine.ts for adapter injection
- Document adapter API in `docs/spec/adapters.md`

## Related Files

- `src/manifest/runtime-engine.ts` - adapter integration
- `docs/spec/adapters.md` - adapter specification
