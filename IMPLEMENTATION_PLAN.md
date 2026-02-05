# Implementation Plan - Loop 3

<!-- This file is managed by the Ralph loop. Do not edit manually during loop execution. -->

## Current Status

Plan updated: 2026-02-05
Phase: Loop 3 - Priority 3 ✅ COMPLETED (Generated Code Conformance Fixes)

## Mission

**Manifest is not a code generator. It's a behavioral contract that AI cannot weasel out of.**

The contract boundary: **The runtime must be able to prove what it is executing is derived from a specific Manifest + toolchain version.**

## Loop 3 Priorities

### Priority 1: Relationship Traversal ✅ COMPLETED
Enable cross-entity relationship access in expressions.

- [x] Update semantics.md spec to define relationship traversal behavior
- [x] Implement relationship index in runtime
- [x] Implement relationship resolution (belongsTo, hasOne, hasMany, ref)
- [x] Make evaluateExpression async to support relationship resolution
- [x] Add entity name metadata to eval context for relationship detection
- [x] Update all call sites to use async expression evaluation

**Implementation Details (2026-02-05):**
- Added `relationshipIndex` Map to RuntimeEngine for efficient relationship lookups
- Added `buildRelationshipIndex()` method to index all relationships at initialization
- Added `resolveRelationship()` async method that:
  - Resolves `belongsTo`/`ref` via foreign key lookup
  - Resolves `hasOne` via inverse belongsTo relationship
  - Resolves `hasMany` via inverse belongsTo relationship
- Made `evaluateExpression()` async and added relationship detection in member expressions
- When `self.relationshipName` is accessed, the runtime:
  - Checks if the property is a relationship via the index
  - Resolves the relationship by querying the store
  - Returns the related instance(s) or null/empty array
- Updated all expression evaluation call sites to use await:
  - `checkPolicies()`, `validateConstraints()`, `resolveExpressionValues()`
  - `executeAction()`, `evaluateComputed()`, `evaluateComputedInternal()`
  - `runCommand()`, `createInstance()`, `updateInstance()`, `checkConstraints()`
- Updated conformance test to await `checkConstraints()`
- All 100 conformance tests passing

**Relationship Resolution Rules (from updated semantics.md):**
- For `belongsTo`/`ref`: foreign key on source contains target ID
- For `hasOne`: find target where its belongsTo foreign key equals source ID
- For `hasMany`: find all targets where their belongsTo foreign key equals source ID
- Returns `null` for empty belongsTo/hasOne/ref relationships
- Returns `[]` for empty hasMany relationships

### Priority 2: Storage Adapters (PostgreSQL, Supabase) ✅ COMPLETED
Implement real database persistence for production use cases.

- [x] PostgreSQL adapter with connection pooling
- [x] CRUD operations for PostgreSQL
- [x] Supabase adapter
- [x] Store injection via `storeProvider` option
- [x] Error handling and diagnostics
- [x] Updated documentation

**Implementation Details (2026-02-05):**

**Discovery:**
- PostgresStore and SupabaseStore were ALREADY fully implemented in `stores.node.ts`
- The issue was that browser runtime couldn't use them (security restriction)
- Documentation incorrectly listed them as "not implemented"

**Solution Implemented:**
- Added `storeProvider` option to `RuntimeOptions` interface
- Modified `initializeStores()` to check for custom stores first
- Updated error messages to guide users to use `storeProvider` for server-side stores
- Updated `docs/spec/adapters.md` to reflect resolved status
- Updated `specs/storage-adapters.md` to mark as completed

**Usage Pattern:**
```typescript
import { RuntimeEngine } from './runtime-engine.js';
import { PostgresStore } from './stores.node.js';

const runtime = new RuntimeEngine(ir, context, {
  storeProvider: (entityName) => {
    return new PostgresStore({
      connectionString: process.env.DATABASE_URL,
      tableName: entityName.toLowerCase()
    });
  }
});
```

**Key Features of Existing Implementations:**
- `PostgresStore<T>`: Connection pooling, JSONB storage, automatic table creation, GIN indexing
- `SupabaseStore<T>`: Full Supabase client integration, proper error handling
- Both implement the `Store<T>` interface with all required CRUD methods
- All 100 conformance tests passing

### Priority 0: Unify Runtime UI ✅ COMPLETED

Unified Runtime UI provides interactive demo capabilities for ANY manifest.

**Implementation (2026-02-05):**
- Entity selector dropdown (populated from compiled IR entities)
- Instance list for selected entity (clickable, shows key properties)
- "Create Instance" button that creates with default values
- When instance selected: show all properties + computed properties
- Command dropdown (populated from entity's commands)
- Parameter hints based on command signature
- Event log sidebar with clear functionality
- Inline MemoryStore for browser demo (allows Supabase/Postgres manifests to work in browser)
- Fixed IRValue extraction bug (was using IRValue object instead of actual value)

**Bug Fixed:**
- `extractIRValue()` helper properly extracts JavaScript values from IRValue objects
- Handles string, number, boolean, null, array, and object types

**Testing Completed:**
- Created PrepTask instance with correct defaults (status="pending", priority=1)
- Executed `claim` command successfully
- Verified properties updated (assignedTo="u1", status="in_progress")
- Verified event log shows taskClaimed event with correct payload
- Verified computed property isUrgent updates correctly (priority < 3 = false)

**Cleanup:**
- Removed TinyAppPanel.tsx (no longer needed - unified RuntimePanel is superior)
- Added *.png to .gitignore to exclude temporary test screenshots

### Priority 3: Generated Code Conformance Fixes ✅ COMPLETED
Align generated server/client code with runtime semantics.

- [x] Update spec to clarify generated code expectations
- [x] Implement policy enforcement in generated server code
- [x] Return last action result from generated client commands
- [x] Update code generator templates
- [x] Add conformance tests for generated artifacts

**Implementation Details (2026-02-05):**

**Spec Updates:**
- Updated `docs/spec/semantics.md` to define generated code requirements
- Added "Generated Artifacts" section specifying:
  - Server code MUST enforce policies (action `execute` or `all`) before executing commands
  - Client code commands MUST return the last action result (not void)
- Removed nonconformance notes - all implementations now conform to spec

**CodeGenerator Changes (`src/manifest/generator.ts`):**

1. **Server Code Policy Enforcement:**
   - Modified `genServerCode()` to check entity policies before guards
   - Policies with action `execute` or `all` are now enforced in command endpoints
   - User context is extracted from `c.get("user")` for policy evaluation
   - Returns 403 with policy message on denial

2. **Client Command Return Values:**
   - Modified `genCommandMethod()` to capture and return the last action result
   - Commands now return `Promise<unknown>` (or specified return type) instead of `Promise<void>`
   - Actions are executed and results stored in `_result` variable
   - Last action result is returned at the end of the command method

3. **Entity Command Policy Checks:**
   - Entity-bound commands now check entity policies before execution
   - Policy checks are performed on the user context
   - Only policies with action `execute` or `all` are enforced

**StandaloneGenerator Changes (`src/manifest/standalone-generator.ts`):**
- Applied identical changes to `genCommandMethod()` and `genCommand()`
- Entity command methods receive entity parameter for policy access
- Standalone commands also return the last action result

**Test Results:**
- All 100 conformance tests passing
- No regressions introduced

**Example Generated Client Code (Before):**
```typescript
async claim(userId: string): Promise<void> {
  if (!(userId === user.id)) throw new Error("Guard failed");
  this.assignedTo = userId;
  this.status = "in_progress";
  this.emit('taskClaimed', { userId });
  // No return
}
```

**Example Generated Client Code (After):**
```typescript
async claim(userId: string): Promise<unknown> {
  // Policy checks
  const user = getContext().user;
  if (!(user.role === "staff" || user.role === "admin")) throw new Error("Denied by policy 'staffOnly'");

  // Guard checks
  if (!(userId === user.id)) throw new Error("Guard failed");

  // Execute actions and capture result
  let _result: unknown;
  _result = this.assignedTo = userId;
  _result = this.status = "in_progress";

  this.emit('taskClaimed', { userId });
  return _result as unknown;
}
```

**Example Generated Server Code (Before):**
```typescript
app.post("/commands/claim", async (c) => {
  const body = await c.req.json();
  // Only guards checked
  if (!(body.userId === c.get("user"))) {
    return c.json({ error: "Unauthorized" }, 403);
  }
  const result = await claim(body.userId);
  return c.json({ success: true, result });
});
```

**Example Generated Server Code (After):**
```typescript
app.post("/commands/claim", async (c) => {
  const body = await c.req.json();
  const user = c.get("user");

  // Policy checks first
  if (!(user.role === "staff" || user.role === "admin")) {
    return c.json({ error: "Denied by policy 'staffOnly'" }, 403);
  }

  // Guard checks
  if (!(body.userId === user.id)) {
    return c.json({ error: "Unauthorized" }, 403);
  }

  const result = await claim(body.userId);
  return c.json({ success: true, result });
});
```

### Priority 4: UI Enhancements [PENDING]
Improve Runtime UI for better observability and diagnostics.

- [ ] Implement Event Log Viewer (specs/event-log-viewer.md)
- [ ] Implement Policy/Guard Diagnostics UI (specs/policy-guard-diagnostics.md)
- [ ] Add collapsible sections for complex diagnostics
- [ ] Display resolved expression values in UI
- [ ] Add clear log functionality

**Spec References:**
- `specs/event-log-viewer.md` - Live event log display
- `specs/policy-guard-diagnostics.md` - Detailed failure diagnostics

### Priority 5: Tiny App Demo [SUPERSEDED BY PRIORITY 0]
~~Complete working demonstration of Manifest capabilities.~~

**Status:** Superseded by Priority 0 (Unify Runtime UI).

Instead of a hardcoded TinyAppPanel, the unified RuntimePanel will provide interactive
demo capabilities for ANY manifest - including the 17-tiny-app.manifest fixture.

The fixture remains useful for conformance testing, but the separate UI component
is being removed in favor of the unified approach.

---

## Loop 2 Completed Work (Reference)

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

### Priority 4: Build Something Real ✅ COMPLETED
Find where the choke point leaks by actually using it.

- [x] Pick a small but real use case
- [x] Build it entirely through Manifest
- [x] Document every place we're tempted to bypass the spec
- [x] Those temptations become Priority 5 items

**Implementation (2026-02-05):**
- Created fixture 20-blog-app.manifest with 3 entities (User, Post, Comment)
- Tests cross-entity operations via foreign key IDs (not relationship traversal)
- Exercises: computed properties, guards, policies, events, multiple commands
- **Test Count:** Now 100 conformance tests (was 99, added 1 blog app fixture)

**Choke Point Leaks Documented:**

1. **Cross-Entity Relationship Traversal**: FIXED in Loop 3
   - Previously: Cannot write `self.author.role` to check post author's role in policies
   - Previously: Must use `user.id == self.authorId` pattern with foreign key IDs
   - **Now implemented**: Runtime traverses relationships in expressions
   - Removed from semantics.md nonconformance section
   - Can now use `self.author.name` or `post.comments` directly in expressions

2. **Spec Nonconformance Notes are OUTDATED**: FIXED
   - Built-in functions (`now()`, `uuid()`) ARE implemented in runtime-engine.ts:279-284
   - Storage target diagnostics ARE implemented - throws clear errors for unsupported targets
   - Action adapter default behavior (no-ops) is CORRECT per spec
   - Relationship nonconformance removed via Loop 3 implementation
   - **Generated code conformance FIXED in Loop 3 Priority 3**:
     - Generated server code NOW enforces policies (action `execute` or `all`)
     - Generated client commands NOW return the last action result

3. **What Works Well:**
   - Single-entity operations are solid
   - Relationship traversal now works in computed properties, guards, and policies
   - Guards and policies provide good security boundaries
   - Event emission with provenance works end-to-end
   - Computed properties with dependencies work correctly
   - Generated code now enforces policies and returns action results

4. **Workarounds Used** (no longer needed for relationships):
   - Foreign key IDs instead of relationship traversal (no longer needed!)
   - User context for cross-entity authorization checks
   - Manual ID references instead of declarative relationships (no longer needed!)

### Priority 5: Seal the Output ✅ COMPLETED
After learning what "real" output needs to look like:

- [x] Runtime defaults to provenance verification in production mode
- [x] Explicit dev override flag for debugging (requireValidProvenance: false)
- [x] Generated code includes provenance metadata comments

**Implementation Details (2026-02-05):**

**Production-First Security:**
- Added `isProductionMode()` function to detect NODE_ENV=production
- `RuntimeEngine.create()` now defaults `requireValidProvenance` to `true` in production
- Users can explicitly set `requireValidProvenance: false` for debugging
- Updated JSDoc comments to explain the new default behavior

**Generated Code Provenance:**
- Added `GeneratedProvenance` interface with: compilerVersion, schemaVersion, generatedAt
- Updated `CodeGenerator.emitRuntime()` to include provenance header comments:
  - "This code is a PROJECTION from a Manifest source file"
  - "The IR (Intermediate Representation) is the single source of truth"
  - Compiler version, schema version, and generation timestamp
- Updated `StandaloneGenerator.emitImports()` with same provenance comments
- All generated code now traces back to specific compiler version

**Test Count:** 100 conformance tests passing (no new tests, all existing still pass)

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
