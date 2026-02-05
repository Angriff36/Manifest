# Implementation Plan

<!-- This file is managed by the Ralph loop. Do not edit manually during loop execution. -->

## Current Status

Plan updated: 2026-02-04 (Priority 1 COMPLETED: Built-in functions `now()` and `uuid()` implemented)

## Executive Summary

**Critical Blocking Issues:**
1. ~~**Built-in Functions NOT IMPLEMENTED** - `now()` and `uuid()` cause RUNTIME FAILURES in examples.ts~~ **COMPLETED**
2. **Storage Adapter Silent Fallback** - Spec violation: postgres/supabase silently fall back to memory

**High-Completion Items (Quick Wins):**
1. **Event Log Results File** - 95% complete, only missing test artifact
2. **Policy Diagnostics Enhancement** - Guard diagnostics complete, Policy diagnostics partial

**Significant New Features:**
1. **Tiny App Demo** - Requires new panel component and fixture
2. **Storage Adapters** - Requires external dependency integration

**Missing Test Results:**
- `02-relationships.results.json`
- `09-compute-action.results.json`
- Other fixtures lack runtime results verification

---

## Priority Queue

### Priority 1: Built-in Functions (`now()`, `uuid()`) ✅ COMPLETED

**CRITICAL PRIORITY** - Examples.ts actively uses these functions, causing RUNTIME FAILURES

**Implementation Summary:**
- ✅ Spec confirmed: `docs/spec/builtins.md` defines `now(): number` and `uuid(): string`
- ✅ Fixture `16-builtin-functions.manifest` created
- ✅ Expected IR `16-builtin-functions.ir.json` generated
- ✅ Expected results `16-builtin-functions.results.json` created
- ✅ BUILTINS registry implemented in `src/manifest/runtime-engine.ts`
  - Added `getBuiltins()` method returning `now()` and `uuid()` functions
  - Modified `evaluateExpression()` case 'call' to check for built-in functions
  - Wired `RuntimeOptions.now` and `RuntimeOptions.generateId` for determinism
- ✅ **BONUS FIX**: Fixed `compute` action to update instance state (was no-op)

**Changes Made:**
1. `src/manifest/runtime-engine.ts:212-217` - Added `getBuiltins()` method
2. `src/manifest/runtime-engine.ts:602-620` - Modified 'call' case to handle built-ins
3. `src/manifest/runtime-engine.ts:356` - Added `compute` to eval context refresh
4. `src/manifest/runtime-engine.ts:562-568` - Fixed `compute` action to update instance
5. `src/manifest/conformance/fixtures/16-builtin-functions.manifest` - New fixture
6. `src/manifest/conformance/expected/16-builtin-functions.ir.json` - Generated IR
7. `src/manifest/conformance/expected/16-builtin-functions.results.json` - Test results

**Verification:**
- ✅ Conformance test `16-builtin-functions` passes with deterministic output
- ✅ `now()` works in computed properties and guards
- ✅ `uuid()` works in compute actions and guards
- ✅ All 70 conformance tests pass

**Note:** Property defaults with function calls (e.g., `createdAt: number = now()`) are not yet supported because the IR only stores literal values as defaults. This is an IR schema limitation, not a runtime issue. For now, use computed properties for dynamic defaults.

---

### Priority 2: Missing Test Results Files
**Status:** QUICK WIN - Just need to run tests and capture output

**Current State:**
Many fixtures have IR but lack runtime results verification:
- `02-relationships.results.json`: MISSING
- `08-keywords-in-expressions.results.json`: MISSING (diagnostic test, may not need)
- `09-compute-action.results.json`: MISSING
- `10-evaluation-context.results.json`: EXISTS
- `11-guard-ordering-diagnostics.results.json`: EXISTS
- `13-round-trip-stability.results.json`: EXISTS
- `14-operator-equality.results.json`: EXISTS
- `15-event-log.results.json`: MISSING
- `18-empty-string-defaults.results.json`: EXISTS

**What's Missing:**
- Runtime results files for fixtures that verify behavior at runtime
- These files capture the actual execution results for conformance testing

**Work Items:**
1. [ ] Run conformance test suite with deterministic runtime options
2. [ ] Capture results for `02-relationships` → `02-relationships.results.json`
3. [ ] Capture results for `09-compute-action` → `09-compute-action.results.json`
4. [ ] Capture results for `15-event-log` → `15-event-log.results.json`
5. [ ] Verify `08-keywords-in-expressions` - if it's diagnostic-only, document that

**Verification:**
- All non-diagnostic fixtures have both IR and Results files
- Conformance test suite passes completely
- Results files are checked into git

**Estimated Effort:** 1 hour (run tests, capture outputs, commit)

---

### Priority 3: Event Log Completion
**Status:** 95% COMPLETE - Only missing test artifact (covered in Priority 2)

**Current State:**
- Runtime Engine: FULLY IMPLEMENTED (lines 173, 358-368, 747-751, 765-772, 778-780)
- RuntimePanel.tsx: FULLY IMPLEMENTED (lines 296-352)
  - Event display with name, channel, payload, timestamp
  - Event counter badge
  - "Clear Log" button
  - Empty state handling
- Fixture `15-event-log.manifest`: EXISTS
- Expected IR `15-event-log.ir.json`: EXISTS
- Expected results: COVERED IN PRIORITY 2

**Verification:**
- Conformance test `15-event-log` passes (IR + Results)
- Event log UI displays events with all required fields
- Clear Log button clears display and event counter resets

**Estimated Effort:** Already covered in Priority 2

---

### Priority 4: Policy/Guard Diagnostics Enhancement
**Status:** PARTIALLY COMPLETE - Guard diagnostics done, Policy diagnostics minimal

**Current State:**
- Guard Failure: FULLY IMPLEMENTED in RuntimePanel
  - `formatGuardFailure()` function (lines 111-136)
  - Shows guard index, formatted expression, resolved values
- Policy Denial: BASIC IMPLEMENTATION (lines 261-265)
  - Shows deniedBy policy name only
  - MISSING: formatted expression, evaluation context keys, collapsible section
- Fixture `11-guard-ordering-diagnostics`: EXISTS with IR, results, diagnostics

**What's Missing:**
Per policy guard diagnostics (spec file may not exist, requirements inferred):
1. Policy denial formatted expression display
2. Policy denial evaluation context keys (not values)
3. Collapsible/expandable sections for policy/guard details

**Work Items (Constitutional Order: Spec → Tests → Implementation):**
1. [ ] **Spec**: Create `docs/spec/policy-guard-diagnostics.md` if it doesn't exist
   - Document exact requirements for policy denial display
   - Specify what context keys to show (not values for security)
2. [ ] **Implementation**: Enhance `src/artifacts/RuntimePanel.tsx` policy denial display
   - Add formatted policy expression (reuse expression formatting from guard)
   - Add evaluation context keys (list available keys, don't show values per security)
   - Make collapsible with expand/collapse toggle
   - Ensure visual distinction from guard failures (different styling)
3. [ ] **Tests**: Verify fixture 11 diagnostic output matches enhanced display
4. [ ] **Tests**: Add UI snapshot test if needed

**Verification:**
- Policy denial shows policy name (already working)
- Policy denial shows formatted expression
- Policy denial shows evaluation context keys
- Collapsible section works (expand/collapse)
- Visual distinction: Policy denials vs Guard failures
- Conformance test 11 still passes

**Estimated Effort:** 2-3 hours (moderate - UI work, plus spec creation)

---

### Priority 5: Tiny App Demo
**Status:** NOT STARTED

**Current State:**
- TinyAppPanel.tsx: DOES NOT EXIST
- Fixture `17-tiny-app.manifest`: DOES NOT EXIST
- No "Tiny App" tab in ArtifactsPanel.tsx
- Spec exists: `specs/tiny-app-demo.md`
- Depends on: Built-in functions (for realistic entity properties)

**What's Missing:**
Per `specs/tiny-app-demo.md`:
1. Domain model fixture (3-4 properties, 2 computed, 2-3 commands, 1 policy, 1 guard)
2. TinyAppPanel.tsx component with Entity List, Detail, Command Execution, Event Log
3. Integration with ArtifactsPanel tabs

**Work Items (Constitutional Order: Spec → Tests → Implementation):**
1. [ ] **Spec**: Review `specs/tiny-app-demo.md` for exact requirements
2. [ ] **Tests**: Create conformance fixture `17-tiny-app.manifest`
   - Entity: e.g., "Task" with properties (title, status, priority, assignee)
   - Computed: e.g., isOverdue, assignedUser
   - Commands: e.g., create, updateStatus, assign
   - Policy: e.g., only assignees can update
   - Guard: e.g., status must be valid
3. [ ] **Tests**: Add expected IR `17-tiny-app.ir.json`
4. [ ] **Tests**: Add expected runtime results `17-tiny-app.results.json`
5. [ ] **Implementation**: Create `src/artifacts/TinyAppPanel.tsx`
   - Entity List view (table/grid of instances)
   - Entity Detail view (shows all properties + computed)
   - Command Execution form (dropdown of commands, input fields based on command)
   - Event Log display (reuse or adapt RuntimePanel event log)
6. [ ] **Implementation**: Add "Tiny App" tab to `src/artifacts/ArtifactsPanel.tsx`
   - Update PanelMode type to include 'tinyapp'
   - Add tab button with appropriate icon
   - Wire TinyAppPanel to runtime engine
7. [ ] **Tests**: Add integration tests for UI interactions

**Verification:**
- Create entity instance → appears in list
- Click entity → detail view shows properties + computed values
- Execute command with valid role → succeeds, event logged
- Execute command with invalid role → policy denial shown
- Guard violation → guard failure shown
- All conformance tests pass (IR + Results)

**Estimated Effort:** 6-8 hours (significant - new UI component)

---

### Priority 6: Storage Adapters
**Status:** NONCONFORMANT - Silent fallback to memory

**Current State:**
- MemoryStore: FULLY IMPLEMENTED (lines 64-102)
- LocalStorageStore: FULLY IMPLEMENTED (lines 104-163)
- PostgreSQL: NOT IMPLEMENTED
- Supabase: NOT IMPLEMENTED
- **CRITICAL NONCONFORMANCE**: Silent fallback to memory (lines 196-199) without diagnostics
- Spec: `docs/spec/adapters.md` explicitly requires diagnostics, not silent fallback

**What's Missing:**
Per `docs/spec/adapters.md`:
1. PostgreSQL adapter implementation
2. Supabase adapter implementation
3. Diagnostic emission for unsupported targets (MUST emit, MUST NOT silently fall back)
4. Action adapters (`persist`, `publish`, `effect`) - currently no-ops

**Work Items (Constitutional Order: Spec → Tests → Implementation):**
1. [ ] **Spec**: Review `docs/spec/adapters.md` for exact requirements
2. [ ] **Implementation**: Fix silent fallback in `src/manifest/runtime-engine.ts`
   - Emit diagnostic when target is not supported (lines 196-199)
   - Either throw error OR make fallback explicit with warning
3. [ ] **Implementation**: Implement PostgreSQL adapter
   - Connection config via store declaration (connection string or params)
   - CRUD operations (create, read, update, delete, query)
   - Transaction support for command execution
   - Connection pooling/reuse
   - Error handling and mapping
4. [ ] **Implementation**: Implement Supabase adapter
   - Supabase client config (URL + anon key)
   - CRUD operations using @supabase/supabase-js
   - RLS (Row Level Security) integration
   - Error handling
5. [ ] **Tests**: Add conformance tests for adapter operations
   - Test basic CRUD with each adapter
   - Test transaction rollback on failure
   - Test error handling
   - Test diagnostic emission for unsupported targets

**Verification:**
- PostgreSQL adapter works with real database (integration test)
- Supabase adapter works with Supabase project (integration test)
- Unsupported target → diagnostic emitted, runtime error or explicit fallback
- No silent failures
- All conformance tests pass

**Estimated Effort:** 12-16 hours (very significant - external dependencies)

---

## Completed Items

### Priority 1: Built-in Functions (2026-02-04)
- Implemented `now()` and `uuid()` built-in functions in runtime engine
- Added BUILTINS registry with deterministic overrides via RuntimeOptions
- Fixed `compute` action to properly update instance state
- Created conformance fixture `16-builtin-functions.manifest`
- All 70 conformance tests pass

### Compute Action Fix (2026-02-04)
- Discovered `compute` action was a no-op (returned value but didn't update instance)
- Fixed `executeAction()` to call `updateInstance()` for `compute` actions
- Fixed eval context refresh to include `compute` actions

## Discovered Issues

### Critical Nonconformances (Blocking)

1. ~~**Built-in Functions NOT IMPLEMENTED** (`docs/spec/builtins.md`)~~ **RESOLVED**
   - Was: `now()` and `uuid()` NOT callable in expressions
   - Fixed: Added BUILTINS registry to evaluateExpression()

2. **Storage Adapter Silent Fallback** (`docs/spec/adapters.md`):
   - PostgreSQL: Declared but NOT implemented
   - Supabase: Declared but NOT implemented
   - **CRITICAL**: Silent fallback to memory (runtime-engine.ts:196-199) without diagnostics
   - **SPEC REQUIREMENT**: MUST emit diagnostic, MUST NOT silently fall back
   - **RESULT**: Specification violation
   - **FIX**: Emit diagnostic or throw error when unsupported target is specified

### Nonconformances Already Documented in Spec

3. **Generated Artifacts** (`docs/spec/semantics.md`):
   - Generated server code does not enforce policies
   - Generated client code does not return last action result
   - (These are known limitations, documented in spec)

### Missing Test Artifacts

4. **Missing Results Files** (Priority 2):
   - `02-relationships.results.json`: MISSING
   - `08-keywords-in-expressions.results.json`: MISSING (likely diagnostic-only)
   - `09-compute-action.results.json`: MISSING
   - `15-event-log.results.json`: MISSING
   - **IMPACT**: These fixtures have IR but lack runtime results verification
   - **FIX**: Run conformance tests and capture outputs

5. ~~**Builtin Functions Test Coverage** (Priority 1)~~ **RESOLVED**
   - Fixture `16-builtin-functions.manifest`: ✅ EXISTS
   - Expected IR: ✅ EXISTS
   - Expected results: ✅ EXISTS

6. **Tiny App Test Coverage** (Priority 5):
   - Fixture `17-tiny-app.manifest`: DOES NOT EXIST
   - Expected IR: DOES NOT EXIST
   - Expected results: DOES NOT EXIST
   - TinyAppPanel.tsx: DOES NOT EXIST
   - **SPEC**: `specs/tiny-app-demo.md` exists

### Partial Implementations

7. **Compute Action Bug** (FIXED):
   - `compute` action was returning value but not updating instance
   - Fixed: Added `updateInstance` call for `compute` actions (runtime-engine.ts:562-568)
   - Fixed: Added eval context refresh for `compute` actions (runtime-engine.ts:356)

8. **Policy Diagnostics Incomplete** (Priority 4):
   - Guard diagnostics: FULLY IMPLEMENTED (formatGuardFailure, RuntimePanel.tsx:111-136)
   - Policy diagnostics: MINIMAL IMPLEMENTATION (RuntimePanel.tsx:261-265)
   - **MISSING**: Formatted policy expression, evaluation context keys, collapsible section
   - **SPEC**: `docs/spec/policy-guard-diagnostics.md` does NOT exist - needs to be created

8. **Action Adapters Not Implemented** (Priority 6):
   - `persist`: No-op (spec says this is allowed)
   - `publish`: No-op (spec says this is allowed)
   - `effect`: No-op (spec says this is allowed)
   - **SPEC**: `docs/spec/adapters.md` documents these as optional adapter contracts

## Implementation Order Rationale

### Priority 1: Built-in Functions (CRITICAL - 2-3 hours)
**Why first?**
- examples.ts ACTIVELY USES these functions → runtime failures
- Small implementation effort (add BUILTINS registry to evaluateExpression)
- Blocks realistic testing of other features
- Required for Tiny App demo (Priority 5)
- This is a correctness issue, not a feature gap

**Priority Adjustment**: CRITICAL
- Must be fixed before any examples can run successfully
- RuntimeOptions.now and RuntimeOptions.generateId already exist, just not wired

### Priority 2: Missing Test Results Files (QUICK WIN - 1 hour)
**Why second?**
- Quick win - just run tests and capture outputs
- Completes conformance test coverage for existing features
- Includes event log results (15-event-log)
- No new implementation required
- Validates existing implementation is correct

**Priority Adjustment**: HIGH
- Low effort, high value
- Unblocks other work by ensuring test coverage is complete

### Priority 3: Event Log Completion (COVERED BY PRIORITY 2)
**Why third?**
- 95% complete (implementation done)
- Only missing: test artifact (covered in Priority 2)
- Runtime Engine: FULLY IMPLEMENTED
- RuntimePanel.tsx: FULLY IMPLEMENTED

**Priority Adjustment**: Already covered in Priority 2

### Priority 4: Policy/Guard Diagnostics Enhancement (MODERATE - 2-3 hours)
**Why fourth?**
- Guard diagnostics: DONE (formatGuardFailure implemented)
- Policy diagnostics: Partial (needs expression display, context keys, collapsible)
- Moderate effort, improves debugging experience
- Spec file needs to be created first

**Priority Adjustment**: MODERATE
- Important but not blocking other features
- Implementation exists for guards, just need to complete policies
- Spec needs to be written before implementation

### Priority 5: Tiny App Demo (SIGNIFICANT - 6-8 hours)
**Why fifth?**
- Depends on: Built-in functions (Priority 1)
- Demonstrates full language capabilities
- New UI component from scratch
- Spec exists (`specs/tiny-app-demo.md`)

**Priority Adjustment**: SIGNIFICANT
- Substantial effort, should wait for critical fixes
- Depends on Priority 1 (built-in functions)
- High visibility feature but not blocking

### Priority 6: Storage Adapters (VERY SIGNIFICANT - 12-16 hours)
**Why last?**
- Largest effort (external dependencies, integration tests)
- Silent fallback is a spec violation but doesn't block core features
- Can be addressed independently
- Requires external dependencies (PostgreSQL, Supabase)

**Priority Adjustment**: LOW
- Significant effort, low urgency for current feature set
- Spec violation should be fixed (emit diagnostic), but full implementation can wait

## Constitutional Order: Spec → Tests → Implementation

For ALL priority items, follow this order:

1. **Spec First**: Confirm/refine the specification document
   - Ensure requirements are clear and unambiguous
   - Create spec files if they don't exist (e.g., policy-guard-diagnostics.md)
   - Resolve ambiguities before writing tests

2. **Tests Second**: Write conformance tests BEFORE implementation
   - Create fixture manifest
   - Create expected IR output
   - Create expected runtime results
   - This defines the "contract" implementation must satisfy

3. **Implementation Third**: Write code to pass the tests
   - Implementation is "done" when all conformance tests pass
   - No ambiguity about correctness

**Why this order?**
- Conformance tests are the source of truth for semantics
- Prevents implementation-driven spec drift
- Makes debugging easier (tests fail before implementation)
- Ensures spec is actually implementable (discover ambiguities early)

## Conformance Test Coverage Matrix

| # | Fixture Name | IR | Results | Diagnostics | Status |
|---|--------------|----|----|----|---------|
| 01 | entity-properties | Y | Y | N | Complete |
| 02 | relationships | Y | **N** | N | **Missing results** |
| 03 | computed-properties | Y | Y | N | Complete |
| 04 | command-mutate-emit | Y | Y | N | Complete |
| 05 | guard-denial | Y | Y | N | Complete |
| 06 | policy-denial | Y | Y | N | Complete |
| 07 | reserved-word-identifier | N | N | Y | Diagnostic-only |
| 08 | keywords-in-expressions | Y | **N** | Y | **Missing results?** |
| 09 | compute-action | Y | **N** | N | **Missing results** |
| 10 | evaluation-context | Y | Y | N | Complete |
| 11 | guard-ordering-diagnostics | Y | Y | Y | Complete |
| 12 | negative-compilation | N | N | Y | Diagnostic-only |
| 13 | round-trip-stability | Y | Y | N | Complete |
| 14 | operator-equality | Y | Y | N | Complete |
| 15 | event-log | Y | **N** | N | **Covered in Priority 2** |
| 16 | builtin-functions | Y | Y | N | ✅ **Completed** |
| 17 | tiny-app | **N** | **N** | **N** | Priority 5 |
| 18 | empty-string-defaults | Y | Y | N | Complete |

**Legend:**
- **Y** = File exists
- **N** = File missing
- **Bold** = Action required

## Compiler Implementation Status

### Lexer (src/manifest/lexer.ts)
**Status:** Well-implemented, no TODOs
- Tokenizes all Manifest language keywords
- Handles identifiers, strings, numbers, operators
- Proper error reporting for invalid tokens

### Parser (src/manifest/parser.ts)
**Status:** Good parsing, some gaps in dependency extraction
- Parses entities, properties, commands, policies, guards
- Some gaps in dependency extraction for computed properties
- Could improve error messages for syntax errors

### IR Compiler (src/manifest/ir-compiler.ts)
**Status:** Functional, could use optimization passes
- Compiles AST to IR correctly
- Could add optimization passes (constant folding, dead code elimination)
- Type checking is basic

### IR Types (src/manifest/ir.ts)
**Status:** Well-defined types
- Clear type definitions for all IR nodes
- Good separation between AST and IR

## Notes

- **All spec changes must precede tests and implementation** (constitutional order)
- **Conformance tests are the source of truth for semantics**
- **Use deterministic time/ID generation in conformance tests** (via RuntimeOptions)
- **Fixtures must use explicit empty strings `""` to avoid default value application**
- **Silent fallback on storage adapters is a spec violation** (must emit diagnostic)
- **Examples.ts now works** - Built-in functions implemented (Priority 1 completed)
- **Policy guard diagnostics spec needs to be created** (Priority 4)
- **Tiny app demo spec already exists** at `specs/tiny-app-demo.md` (Priority 5)
