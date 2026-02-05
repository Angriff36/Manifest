# Implementation Plan - Loop 2

<!-- This file is managed by the Ralph loop. Do not edit manually during loop execution. -->

## Current Status

Plan updated: 2026-02-05
Phase: Loop 2 - Strengthen the Choke Point

## Mission

**Manifest is not a code generator. It's a behavioral contract that AI cannot weasel out of.**

The contract boundary: **The runtime must be able to prove what it is executing is derived from a specific Manifest + toolchain version.**

## Loop 2 Priorities

### Priority 1: Provenance Metadata ✅ COMPLETED
Add traceability everywhere so drift becomes visible.

- [x] IR includes: manifest content hash, compiler version, schema version
- [x] Runtime prints provenance at startup (via `getProvenance()` and `logProvenance()` methods)
- [x] Event logs include provenance
- [ ] UI displays provenance info (future enhancement)
- [x] Conformance tests verify provenance is preserved

### Priority 2: Diagnostic Hardening
Make the system hostile to weaseling. When constraints block something, explain exactly why.

- [ ] Policy denials: include "what you tried" + "which rule blocked" + resolved context values
- [ ] Type mismatches: show expected vs actual with path to violation
- [ ] Guard failures: already done, extend pattern to all constraint types
- [ ] Add diagnostic conformance tests for each failure mode

### Priority 3: IR-First Runtime
TS output is a view, not authority. IR is the executable contract.

- [x] Runtime loads IR directly (already does this)
- [ ] Document that generated TS is derivative, not source of truth
- [ ] Consider: runtime refuses to execute if IR hash doesn't match expected

### Priority 4: Build Something Real
Find where the choke point leaks by actually using it.

- [ ] Pick a small but real use case
- [ ] Build it entirely through Manifest
- [ ] Document every place we're tempted to bypass the spec
- [ ] Those temptations become Priority 5 items

### Priority 5: Seal the Output (LATER)
After learning what "real" output needs to look like:

- [ ] Checksum/signature over (Manifest + compiler + templates)
- [ ] Runtime refuses unprovenanced artifacts by default
- [ ] Explicit dev override flag for debugging

---

## Loop 1 Completed Work (Reference)

All passing: 93 conformance tests

- ✅ Built-in Functions (`now()`, `uuid()`)
- ✅ Storage Adapters (Memory, LocalStorage, PostgreSQL, Supabase)
- ✅ Policy Diagnostics Enhancement
- ✅ Tiny App Demo
- ✅ Type safety improvements
- ✅ Prototype pollution fix

---

## Loop 2 Completed Work (2026-02-05)

### Priority 1: Provenance Metadata - ✅ COMPLETE

**IR Schema & Compiler Changes:**
- Added `IRProvenance` interface with: `contentHash`, `compilerVersion`, `schemaVersion`, `compiledAt`
- Updated IR schema (`docs/spec/ir/ir-v1.schema.json`) to include provenance field
- Modified `IRCompiler` to compute SHA-256 content hash and inject provenance metadata
- Made `compileToIR()` async to support cryptographic hash computation

**Runtime Changes:**
- Added `getProvenance()` method to `RuntimeEngine` for accessing IR provenance
- Added `logProvenance()` method to display provenance at startup
- Updated `EmittedEvent` interface to include optional `provenance` field
- Event emission now includes provenance (contentHash, compilerVersion, schemaVersion)

**Test Infrastructure:**
- Updated all test files to use `await compileToIR()` (async API change)
- Updated `scripts/regen-conformance.ts` to handle async compilation
- Modified `normalizeIR()` to normalize timestamp/contentHash for test comparison
- Regenerated all 18 expected IR files with provenance metadata
- All 93 conformance tests passing

---

## Constitutional Order

**Spec → Tests → Implementation**

1. Spec First: requirements clear and unambiguous
2. Tests Second: conformance tests BEFORE implementation
3. Implementation Third: done when tests pass

---

## Design Principles

- **IR is truth**: Generated code is projection, not source
- **Failures are loud**: Silent bypasses are bugs
- **Provenance is mandatory**: If you can't prove where it came from, don't trust it
- **Constraints are features**: The point is to prevent creativity in the wrong dimension
