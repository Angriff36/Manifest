# Implementation Plan - Loop 3

<!-- This file is managed by the Ralph loop. Do not edit manually during loop execution. -->

## Current Status

Plan updated: 2026-02-05
Phase: Loop 3 - ALL PRIORITIES COMPLETE + Loop 2 Provenance UI ✅

**ALL LOOP 3 PRIORITIES COMPLETE!**
**ALL LOOP 2 PRIORITIES COMPLETE!** (including Provenance UI display)

## Mission

**Manifest is not a code generator. It's a behavioral contract that AI cannot weasel out of.**

The contract boundary: **The runtime must be able to prove what it is executing is derived from a specific Manifest + toolchain version.**

## Loop 3 Completed Work

### Priority 1: Relationship Traversal ✅
Enable cross-entity relationship access in expressions.

**Key Implementation:**
- Added `relationshipIndex` Map to RuntimeEngine for efficient relationship lookups
- Implemented `resolveRelationship()` async method for belongsTo/hasOne/hasMany/ref
- Made `evaluateExpression()` async to support relationship resolution
- Updated all call sites to use async expression evaluation

### Priority 2: Storage Adapters (PostgreSQL, Supabase) ✅
Implement real database persistence for production use cases.

**Key Implementation:**
- Added `storeProvider` option to `RuntimeOptions` for custom store injection
- PostgresStore and SupabaseStore were already fully implemented
- Documentation updated to reflect resolved status
- All 100 conformance tests passing

### Priority 0: Unify Runtime UI ✅
Unified Runtime UI provides interactive demo capabilities for ANY manifest.

**Key Features:**
- Entity selector dropdown (populated from compiled IR entities)
- Instance list with clickable items showing key properties
- "Create Instance" button with default values
- Property display including computed properties
- Command dropdown with parameter hints
- Event log sidebar with clear functionality
- Inline MemoryStore for browser demo

### Priority 3: Generated Code Conformance Fixes ✅
Align generated server/client code with runtime semantics.

**Key Implementation:**
- Server code now enforces policies (action `execute` or `all`) before executing commands
- Client commands now return the last action result (not void)
- Updated both CodeGenerator and StandaloneGenerator templates
- Updated semantics.md spec with "Generated Artifacts" section

### Priority 4: UI Enhancements ✅
Improve Runtime UI for better observability and diagnostics.

**Key Features:**
- Event log viewer with reverse chronological display and clear log functionality
- Policy/guard diagnostics with collapsible sections
- Resolved expression values displayed in UI
- All specs fully implemented in RuntimePanel.tsx

### Priority 5: Tiny App Demo [SUPERSEDED]
Superseded by Priority 0 (Unify Runtime UI). The unified RuntimePanel provides interactive demo capabilities for ANY manifest.

## Loop 2 Completed Work

### Priority 1: Provenance Metadata ✅
Add traceability everywhere so drift becomes visible.

**Key Implementation:**
- IR includes manifest content hash, compiler version, schema version
- Runtime prints provenance at startup (via `getProvenance()` and `logProvenance()` methods)
- Event logs include provenance
- UI displays provenance info with collapsible section

### Priority 2: Diagnostic Hardening ✅
Make the system hostile to weaseling. When constraints block something, explain exactly why.

**Key Implementation:**
- Policy denials include "what you tried" + "which rule blocked" + resolved context values
- Guard failures extended pattern to all constraint types
- Added `ConstraintFailure` interface for entity constraint diagnostics
- Runtime UI displays resolved values for policy denials

### Priority 3: IR-First Runtime ✅
TS output is a view, not authority. IR is the executable contract.

**Key Implementation:**
- Added `irHash` field to `IRProvenance` interface (SHA-256 hash of the IR itself)
- Modified `IRCompiler` to compute IR hash during compilation
- Added `verifyIRHash()` and `assertValidProvenance()` methods to `RuntimeEngine`
- Added `RuntimeEngine.create()` static factory method for automatic verification
- Added "IR-First Architecture" section to documentation

### Priority 4: Build Something Real ✅
Find where the choke point leaks by actually using it.

**Key Result:**
- Created fixture 20-blog-app.manifest with 3 entities (User, Post, Comment)
- Cross-entity relationship traversal was the main choke point leak - FIXED in Loop 3
- All spec nonconformance notes resolved

### Priority 5: Seal the Output ✅
After learning what "real" output needs to look like.

**Key Implementation:**
- Runtime defaults to provenance verification in production mode
- Explicit dev override flag for debugging (requireValidProvenance: false)
- Generated code includes provenance metadata comments

## Loop 1 Completed Work

All passing: 93 conformance tests

- Built-in Functions (`now()`, `uuid()`)
- Storage Adapters (Memory, LocalStorage, PostgreSQL, Supabase)
- Policy Diagnostics Enhancement
- Tiny App Demo
- Type safety improvements
- Prototype pollution fix

## Constitutional Order

**Spec → Tests → Implementation**

1. Spec First: requirements clear and unambiguous
2. Tests Second: conformance tests BEFORE implementation
3. Implementation Third: done when tests pass

## Design Principles

- **IR is truth**: Generated code is projection, not source
- **Failures are loud**: Silent bypasses are bugs
- **Provenance is mandatory**: If you can't prove where it came from, don't trust it
- **Constraints are features**: The point is to prevent creativity in the wrong dimension
