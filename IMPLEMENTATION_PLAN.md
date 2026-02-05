# Implementation Plan

<!-- This file is managed by the Ralph loop. Do not edit manually during loop execution. -->

## Current Status

Plan updated: 2026-02-04 (All critical functionality implemented; 93 conformance tests passing, TypeScript and ESLint checks passing)

## Executive Summary

**All Critical Issues Resolved:**
1. Built-in Functions (`now()`, `uuid()`) - ✅ COMPLETED
2. Storage Adapter Silent Fallback - ✅ FIXED
3. Event Log Results File - ✅ COMPLETED
4. Policy Diagnostics Enhancement - ✅ COMPLETED
5. Tiny App Demo - ✅ COMPLETED
6. Storage Adapters (PostgreSQL/Supabase) - ✅ COMPLETED

**Remaining Work:**
- None - All critical functionality implemented

---

## Conformance Test Coverage Matrix

| # | Fixture Name | IR | Results | Diagnostics | Status |
|---|--------------|----|----|----|---------|
| 01 | entity-properties | Y | Y | N | Complete |
| 02 | relationships | Y | N/A | N | IR-only fixture |
| 03 | computed-properties | Y | Y | N | Complete |
| 04 | command-mutate-emit | Y | Y | N | Complete |
| 05 | guard-denial | Y | Y | N | Complete |
| 06 | policy-denial | Y | Y | N | Complete |
| 07 | reserved-word-identifier | N | N | Y | Diagnostic-only |
| 08 | keywords-in-expressions | Y | Y | Y | Complete |
| 09 | compute-action | Y | Y | N | Complete |
| 10 | evaluation-context | Y | Y | N | Complete |
| 11 | guard-ordering-diagnostics | Y | Y | Y | Complete |
| 12 | negative-compilation | N | N | Y | Diagnostic-only |
| 13 | round-trip-stability | Y | Y | N | Complete |
| 14 | operator-equality | Y | Y | N | Complete |
| 15 | event-log | Y | Y | N | Complete |
| 16 | builtin-functions | Y | Y | N | Complete |
| 17 | tiny-app | Y | Y | N | Complete |
| 18 | empty-string-defaults | Y | Y | N | Complete |

**Legend:**
- **Y** = File exists
- **N** = File missing
- **N/A** = Not applicable (IR-only fixture)

---

## Storage Adapters

**Status:** FULLY CONFORMANT - All storage adapters implemented with async interface

**Current State:**
- MemoryStore: FULLY IMPLEMENTED (async interface)
- LocalStorageStore: FULLY IMPLEMENTED (async interface)
- PostgreSQL: FULLY IMPLEMENTED (PostgresStore with connection pooling, auto-table creation)
- Supabase: FULLY IMPLEMENTED (SupabaseStore with proper client integration)
- Action adapters (`persist`, `publish`, `effect`): No-ops (allowed by spec)

**Verification:**
- ✅ All 93 conformance tests pass
- ✅ All storage adapters implement async Store interface
- ✅ Runtime engine properly awaits all store operations

---

## Reference Information

### Constitutional Order: Spec → Tests → Implementation

For ALL future work, follow this order:

1. **Spec First**: Confirm/refine the specification document
   - Ensure requirements are clear and unambiguous
   - Create spec files if they don't exist
   - Resolve ambiguities before writing tests

2. **Tests Second**: Write conformance tests BEFORE implementation
   - Create fixture manifest
   - Create expected IR output
   - Create expected runtime results
   - This defines the "contract" implementation must satisfy

3. **Implementation Third**: Write code to pass the tests
   - Implementation is "done" when all conformance tests pass
   - No ambiguity about correctness

### Key Implementation Patterns

- **Storage Adapters**: Use async interface with Promise-based methods
- **Error Handling**: Throw descriptive errors for unsupported features
- **Testing**: Use deterministic time/ID generation in conformance tests (via RuntimeOptions)
- **Fixtures**: Use explicit empty strings `""` to avoid default value application

### Known Limitations (Documented in Spec)

1. **Generated Artifacts** (`docs/spec/semantics.md`):
   - Generated server code does not enforce policies
   - Generated client code does not return last action result
   - (These are known limitations, documented in spec)

2. **Relationships** (`docs/spec/semantics.md`):
   - Relationship behavior is not modeled in the IR runtime
