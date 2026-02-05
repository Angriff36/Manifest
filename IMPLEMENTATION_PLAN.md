# Implementation Plan - Loop 2

<!-- This file is managed by the Ralph loop. Do not edit manually during loop execution. -->

## Current Status

Plan updated: 2026-02-05
Phase: Loop 2 - Priority 4 in Progress

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

### Priority 2: Diagnostic Hardening ✅ COMPLETED
Make the system hostile to weaseling. When constraints block something, explain exactly why.

- [x] Policy denials: include "what you tried" + "which rule blocked" + resolved context values
- [ ] Type mismatches: show expected vs actual with path to violation (deferred - type checking is primarily compile-time)
- [x] Guard failures: already done, extended pattern to all constraint types
- [x] Add diagnostic conformance tests for each failure mode

**Implementation Details:**
- Added `resolved?: GuardResolvedValue[]` field to `PolicyDenial` interface
- Policy denials now include resolved expression values showing what was evaluated
- Added `ConstraintFailure` interface for entity constraint diagnostics
- Created `validateConstraints()` method that validates constraints with full diagnostics
- Added `checkConstraints()` public method for diagnostic queries without state mutation
- Entity `createInstance()` and `updateInstance()` now validate constraints before mutating
- Runtime UI displays resolved values for policy denials
- Conformance tests verify policy denial diagnostics with resolved values
- New fixture 19-entity-constraints.manifold tests entity constraint diagnostics

### Priority 3: IR-First Runtime ✅ COMPLETED
TS output is a view, not authority. IR is the executable contract.

- [x] Runtime loads IR directly (already does this)
- [x] Document that generated TS is derivative, not source of truth
- [x] Runtime refuses to execute if IR hash doesn't match expected (via requireValidProvenance option)

**Implementation Details:**
- Added `irHash` field to `IRProvenance` interface (SHA-256 hash of the IR itself)
- Updated IR schema (`docs/spec/ir/ir-v1.schema.json`) to include optional `irHash` field
- Modified `IRCompiler` to compute IR hash during compilation (canonical JSON representation)
- Added `verifyIRHash()` method to `RuntimeEngine` for runtime integrity verification
- Added `assertValidProvenance()` method for throwing on verification failure
- Added `RuntimeEngine.create()` static factory method for automatic verification
- Added `requireValidProvenance` and `expectedIRHash` options to `RuntimeOptions`
- Added "IR-First Architecture" section to `docs/spec/README.md` documenting:
  - IR as single source of truth
  - Generated code as derivative view
  - Provenance verification requirements
  - The choke point concept
- Updated `normalizeIR()` in conformance tests to normalize `irHash`
- Regenerated all 19 expected IR files with `irHash` field
- All 99 conformance tests passing

### Priority 4: Build Something Real 🔄 IN PROGRESS
Find where the choke point leaks by actually using it.

- [x] Pick a small but real use case
- [x] Build it entirely through Manifest
- [x] Document every place we're tempted to bypass the spec
- [ ] Those temptations become Priority 5 items

**Implementation (2026-02-05):**
- Created fixture 20-blog-app.manifest with 3 entities (User, Post, Comment)
- Tests cross-entity operations via foreign key IDs (not relationship traversal)
- Exercises: computed properties, guards, policies, events, multiple commands
- **Test Count:** Now 100 conformance tests (was 99, added 1 blog app fixture)

**Choke Point Leaks Documented:**

1. **Cross-Entity Relationship Traversal**: NOT SUPPORTED
   - Cannot write `self.author.role` to check post author's role in policies
   - Must use `user.id == self.authorId` pattern with foreign key IDs
   - Relationships (hasMany, hasOne, belongsTo) compile to IR but runtime doesn't traverse them
   - This is a known limitation documented in docs/spec/semantics.md

2. **Spec Nonconformance Notes are OUTDATED**: FIXED
   - Built-in functions (`now()`, `uuid()`) ARE implemented in runtime-engine.ts:279-284
   - Storage target diagnostics ARE implemented - throws clear errors for unsupported targets
   - Action adapter default behavior (no-ops) is CORRECT per spec
   - The docs/spec/*.md nonconformance sections need updating

3. **What Works Well:**
   - Single-entity operations are solid
   - Guards and policies provide good security boundaries
   - Event emission with provenance works end-to-end
   - Computed properties with dependencies work correctly

4. **Workarounds Used:**
   - Foreign key IDs instead of relationship traversal
   - User context for cross-entity authorization checks
   - Manual ID references instead of declarative relationships

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

### Priority 2: Diagnostic Hardening - ✅ COMPLETE

**Policy Denial Enhancement:**
- Added `resolved?: GuardResolvedValue[]` field to `PolicyDenial` interface
- Policy denials now include resolved expression values (e.g., `user.role = "user"`)
- Updated `checkPolicies()` to call `resolveExpressionValues()` for diagnostics
- Runtime UI displays resolved values in policy denial sections

**Entity Constraint Diagnostics:**
- Added `ConstraintFailure` interface matching guard/policy diagnostic pattern
- Created `validateConstraints()` private method with full diagnostics
- Added `checkConstraints()` public method for external diagnostic queries
- Entity `createInstance()` and `updateInstance()` validate constraints before mutating
- Constraint failures include: constraintName, expression, formatted, message, resolved values

**Conformance Test Infrastructure:**
- Added `expectedPolicyDenial` test case support to verify policy denial diagnostics
- Added `ConstraintTestCase` interface and handler for constraint testing
- Updated `normalizeResult()` to include `policyDenial` with resolved values
- New fixture: 19-entity-constraints.manifest with 5 constraint test cases
- All 99 conformance tests passing

**Test Count:** 99 conformance tests (was 93, added 6 constraint tests)

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
