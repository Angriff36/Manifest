# IMPLEMENTATION PLAN

**Date**: 2026-02-14 (verified)
**Version**: v0.3.8
**Status**: Active Planning
**Baseline**: 482/482 tests passing (156 conformance + 305 unit + 21 projection)
**Primary Spec**: `specs/ergonomics/manifest-config-ergonomics.md`
**Ultimate Goal**: Zero trial-and-error debugging of configuration issues

> "If `manifest scan` passes, the code works."

---

## NONCONFORMANCE (Spec Violations)

Items where existing implementation contradicts `docs/spec/*` (the constitutional source of truth).
Spec authority hierarchy: `ir-v1.schema.json` > `semantics.md` > `builtins.md` > `adapters.md` > `conformance.md`.

### NC-1: Constraint Code Uniqueness Diagnostic [MISSING]
- **Spec**: `docs/spec/manifest-vnext.md` (Constraint Blocks section)
- **Rule**: "Within a single entity, `code` values MUST be unique. Within a single command's `constraints` array, `code` values MUST be unique. Compiler MUST emit diagnostic error on duplicates."
- **Status**: `ir-compiler.ts:279` transforms `code: c.code || c.name` but performs NO duplicate detection across entity-scoped or command-scoped constraints. Searched entire compilation pipeline (lexer, parser, ir-compiler) — zero uniqueness validation found.
- **Root cause**: The IR compiler (`ir-compiler.ts`) is a **pure structural transformation** layer. It has exactly ONE location where diagnostics are pushed (`ir-compiler.ts:117-124`) and that only forwards parser errors. Zero semantic validations exist in the compiler. Adding duplicate detection requires adding the compiler's first semantic diagnostic capability.
- **Runtime impact**: `runtime-engine.ts:1846` uses `overrideRequests.find(o => o.constraintCode === constraint.code)` — duplicate codes cause `.find()` to match only the first constraint, silently ignoring subsequent ones with the same code.
- **Impact**: Duplicate constraint codes silently compile, producing ambiguous override targeting and diagnostics at runtime
- **Fix**:
  - Add duplicate code detection in `ir-compiler.ts` during entity and command constraint transformation
  - Track seen codes with `Set<string>` per entity and per command scope
  - Emit diagnostic error (severity: error) on collision with file location
  - Add conformance fixture `39-duplicate-constraint-codes.manifest` with `.diagnostics.json` (shouldFail: true)
- **Files**: `src/manifest/ir-compiler.ts`, new fixture in `src/manifest/conformance/`
- **Spec reference**: `docs/spec/manifest-vnext.md` status table: "NOT_IMPLEMENTED"

### NC-2: Override OverrideApplied Event Conformance [PARTIAL]
- **Spec**: `docs/spec/manifest-vnext.md` (Override Mechanism section) and `docs/spec/semantics.md`
- **Rule**: "OverrideApplied event MUST be emitted with override details" including constraintCode, policyApplied, overriddenBy
- **Status**: Runtime implementation EXISTS at `runtime-engine.ts:1917-1939` (`emitOverrideAppliedEvent`). Fixture 22 tests basic override authorization flow (approve/deny) but does NOT verify the OverrideApplied event payload in `results.json`
- **Verified**: Fixture 22 `results.json` has 4 test cases:
  - Test 1: "process command fails without override for large amount" — asserts `success: false`, `emittedEvents: []`
  - Test 2: "process command succeeds with authorized override" — asserts `success: true`, `emittedEvents: [{ name: "RecordProcessed", channel: "financial.record.processed", timestamp: 1000000000000 }]` — **zero assertion on OverrideApplied event**
  - Test 3: "process command fails with unauthorized override" — asserts `success: false`, `emittedEvents: []`
  - Test 4: "approve command succeeds for manager without override" — asserts `success: true`, `emittedEvents: [{ name: "RecordApproved" }]`
  - **No test case asserts event payload structure for any event**
- **Impact**: Override event emission is untested at conformance level; event payload shape could drift without detection
- **vnext spec also requires**: Fixtures `52-override-allowed.manifest` and `53-override-denied.manifest` (see NC-7)
- **Fix**: Extend fixture 22 `.results.json` with test cases that verify:
  - (a) OverrideApplied event appears in `emittedEvents` with correct name/channel
  - (b) Event payload contains constraintCode, constraintName, originalSeverity, reason, authorizedBy, timestamp
  - (c) Override rejection for non-overrideable constraints (no event emitted)
  - (d) Override with overridePolicyRef evaluation

### NC-3: Concurrency Conflict Return Object Conformance [BROKEN]
- **Spec**: `docs/spec/manifest-vnext.md` (Entity Concurrency section) and `docs/spec/semantics.md`
- **Rule**: "Runtime MUST return ConcurrencyConflict" with fields entityType, entityId, expectedVersion, actualVersion, conflictCode
- **Status**: **DEEPER THAN PREVIOUSLY ASSESSED** — This is not just a conformance test gap but a runtime implementation bug:
  - `CommandResult` interface at `ir.ts:119` correctly defines `concurrencyConflict?: ConcurrencyConflict` field
  - `ConcurrencyConflict` interface at `ir.ts:232-243` correctly defines all 5 required fields
  - `runtime-engine.ts:1944-1967` emits a ConcurrencyConflict **event** to the event log
  - **BUG**: `runtime-engine.ts:865-870` — when `updateInstance()` detects version mismatch, it emits the event and returns `undefined`, but the calling code in `executeAction()` at `runtime-engine.ts:1442-1448` **discards the return value** of `updateInstance()`. The mutate action returns the evaluated value regardless of whether the update succeeded or failed.
  - **RESULT**: `CommandResult.concurrencyConflict` is **NEVER populated** anywhere in the codebase. Zero assignments to this field exist. A concurrency conflict silently succeeds from the CommandResult perspective while only appearing in the event log.
- **Verified**: Fixture 24 `results.json` has 3 test cases:
  - Test 1: "create instance with version" — asserts `success: true`
  - Test 2: "update with correct version succeeds" — asserts `success: true`, verifies version auto-incremented to 2
  - Test 3: "update with stale version fails" — asserts `success: false` via **guard failure** (`guard: self.version == currentVersion`), NOT via ConcurrencyConflict return. Guard failure at index 2 with expression `self.version == currentVersion`.
  - **No test case asserts `concurrencyConflict` object on the result**
- **Impact**: Clients cannot programmatically distinguish concurrency failures from other failures. The spec-mandated ConcurrencyConflict return path is dead code.
- **Fix**:
  - (a) Wire `updateInstance()` return value through `executeAction()` to detect version mismatch
  - (b) When mismatch detected, populate `CommandResult.concurrencyConflict` with the structured object
  - (c) Return `success: false` with concurrencyConflict details (not just guard failure)
  - (d) Add fixture 54 (or extend 24) testing ConcurrencyConflict return object fields
- **Files**: `src/manifest/runtime-engine.ts`, conformance fixture

### NC-4: Relationship Runtime Conformance Gap [PARTIAL]
- **Spec**: `docs/spec/semantics.md` (Relationship Resolution Rules section)
- **Rule**: Relationship resolution (hasMany, hasOne, belongsTo, ref) is spec-defined runtime behavior. `belongsTo`/`ref` look up by FK. `hasOne`/`hasMany` query by inverse FK. Non-existent returns null/[].
- **Status**: Fixture `02-relationships.manifest` has `.ir.json` expected output but NO `.results.json`. Compilation is verified; runtime traversal is not.
- **Verified**: Fixture 02 defines Author (hasMany Books), Book (belongsTo Author). IR is correct. No runtime test cases exist.
- **Impact**: Cross-entity relationship navigation, inverse lookups, and null/empty-array edge cases have no conformance evidence
- **Fix**: Add `02-relationships.results.json` testing: create linked instances, traverse hasMany/belongsTo, verify null for non-existent, verify [] for empty hasMany

### NC-5: Blog App Complex Integration Missing Runtime Tests [PARTIAL]
- **Spec**: `docs/spec/conformance.md` (fixtures should have runtime results where applicable)
- **Status**: Fixture `20-blog-app.manifest` compiles successfully (`shouldFail: false`, empty diagnostics). Has `.ir.json` (49KB). NO `.results.json`.
- **Verified**: Blog app defines 3 entities (User, Post, Comment) with 15+ commands, computed properties, cross-entity authorization guards, policy-based auth, and 8 event types. All compile cleanly.
- **Impact**: The most complex real-world fixture has zero runtime conformance evidence. Guards, policies, mutations, events, and computed properties are untested.
- **Fix**: Add `20-blog-app.results.json` with test cases covering: user registration, post creation/publishing/archiving, comment operations, cross-entity authorization, computed property evaluation

### NC-6: Provenance Verification Lacks Conformance Evidence [PARTIAL]
- **Spec**: `docs/spec/manifest-vnext.md` (Provenance and IR Integrity section)
- **Rule**: "Runtimes MUST NOT silently execute IR with mismatched provenance when requireValidProvenance is enabled"
- **Status**: Code EXISTS and is substantial:
  - `runtime-engine.ts:54` — `requireValidProvenance` option in RuntimeOptions interface
  - `runtime-engine.ts:655-701` — `verifyIRHash()` computes SHA-256 and compares
  - `runtime-engine.ts:707-717` — `assertValidProvenance()` throws on mismatch
  - `runtime-engine.ts:2056-2080` — `RuntimeEngine.create()` factory with production-mode auto-enable
  - `runtime-engine.ts:25-33` — `isProductionMode()` helper
- **Test coverage is effectively zero**: Two "tests" exist (runtime-engine.test.ts:709-752) but:
  - Test 1 ("should verify valid IR hash") creates IR with `requireValidProvenance: false` — does NOT test actual hash verification, just checks `getIR()` returns defined
  - Test 2 ("should include provenance in emitted events") checks event `.provenance?.compilerVersion` and `.provenance?.contentHash` exist — NOT hash verification, just structural presence
  - NO test calls `verifyIRHash()` with actual hash comparison
  - NO test calls `assertValidProvenance()` to verify throw behavior
  - NO test exercises `RuntimeEngine.create()` factory
  - NO test for tampered IR hash rejection
- **Fix**: Add unit tests to `runtime-engine.test.ts` for:
  - (a) `verifyIRHash()` returns true for valid IR
  - (b) `verifyIRHash()` returns false for tampered IR
  - (c) `assertValidProvenance()` throws when `requireValidProvenance=true` and hash mismatches
  - (d) `RuntimeEngine.create()` returns `{ valid: false }` for tampered IR
  - (e) `RuntimeEngine.create()` returns `{ valid: true }` for valid IR
- **Files**: `src/manifest/runtime-engine.test.ts`

### NC-7: vnext Required Future Fixtures Missing [MISSING]
- **Spec**: `docs/spec/manifest-vnext.md` (Conformance Additions section, "Required Future Fixtures" table)
- **Rule**: The vnext spec explicitly lists 4 required fixtures as "Not yet added":
  - `39-duplicate-constraint-codes.manifest` — Compiler diagnostic on duplicate constraint codes (overlaps NC-1)
  - `52-override-allowed.manifest` — Override authorization with OverrideApplied event (overlaps NC-2)
  - `53-override-denied.manifest` — Override rejection for non-overrideable constraints (overlaps NC-2)
  - `54-concurrency-conflict.manifest` — Version mismatch returns ConcurrencyConflict (overlaps NC-3)
- **Status**: ALL FOUR are missing. None exist in `src/manifest/conformance/fixtures/`. Searched for `39-*`, `52-*`, `53-*`, `54-*` — zero matches.
- **Impact**: The vnext spec explicitly requires these fixtures for conformance. Their absence means the vnext features lack the executable semantics evidence demanded by `docs/spec/conformance.md`.
- **Fix**: Create all 4 fixtures with appropriate `.manifest`, `.ir.json`, `.diagnostics.json`, and/or `.results.json` files
- **Note**: Fixtures 52-54 provide dedicated focused tests vs. enriching existing fixtures 22/24. Both approaches have merit — dedicated fixtures are cleaner; enriching existing ones avoids duplication. Recommend creating dedicated fixtures per vnext spec, then consider whether enriching 22/24 is also warranted.

### NC-8: IR Compiler Has No Semantic Diagnostic Infrastructure [STRUCTURAL]
- **Spec**: `docs/spec/manifest-vnext.md` requires compiler to emit diagnostics for constraint code duplicates; `docs/spec/conformance.md` requires diagnostics to be testable via `.diagnostics.json` files
- **Rule**: The compiler must be able to emit semantic diagnostics (not just parser errors) to fulfill NC-1 and future validation requirements
- **Status**: `ir-compiler.ts` has exactly ONE diagnostic emission point (`ir-compiler.ts:117-124`) which only forwards parser errors. The `diagnostics` array is populated solely from `Parser.parse()` error output. All transformation methods (`transformEntity`, `transformCommand`, `transformPolicy`, etc.) are pure structural transforms with zero validation logic.
- **Verified**: Grep for `this.diagnostics.push` in `ir-compiler.ts` returns exactly 1 location (line 118). No semantic validation of any kind exists.
- **Impact**: This is a **structural prerequisite** for NC-1. The compiler cannot emit constraint code uniqueness diagnostics because it has no mechanism to generate semantic diagnostics at all.
- **Fix**: Before NC-1 can be implemented, the compiler needs semantic diagnostic capability:
  - Add a method like `emitDiagnostic(severity, message, line?, column?)` to the compiler
  - Call it during transformation passes where semantic rules must be enforced
  - NC-1 (duplicate constraint codes) will be the first consumer
  - Future: relationship target validation, policy reference validation, etc.
- **Files**: `src/manifest/ir-compiler.ts`
- **Note**: This is not a spec violation per se but a structural gap that blocks NC-1 and future semantic diagnostics. Listed here because the spec requires the compiler to emit diagnostics that it currently cannot.

### NC-9: ConcurrencyConflict Return Path Dead Code [BROKEN]
- **Spec**: `docs/spec/manifest-vnext.md` (Entity Concurrency section), `docs/spec/semantics.md`
- **Rule**: "On mutation: compare provided version vs stored; if match, increment and proceed; if differ, return ConcurrencyConflict with: entityType, entityId, expectedVersion, actualVersion, conflictCode"
- **Status**: This is the implementation-level detail of NC-3. The `CommandResult.concurrencyConflict` field is declared but never assigned:
  - `ir.ts:119` declares `concurrencyConflict?: ConcurrencyConflict` on `CommandResult`
  - `runtime-engine.ts:865-870` detects mismatch in `updateInstance()`, emits event, returns `undefined`
  - `runtime-engine.ts:1442-1448` in `executeAction()` case `'mutate'` — calls `updateInstance()` but **does not check return value**. Always returns the evaluated expression value.
  - `_executeCommandInternal()` success path at lines 1132-1140 never reads or assigns `concurrencyConflict`
  - The field exists on the interface but is dead — zero code paths assign to it
- **Impact**: The auto-version comparison mechanism (versionProperty) fires and emits events, but the structured ConcurrencyConflict return to callers is broken. Fixture 24 works only because it uses manual guards (`guard: self.version == currentVersion`), which are a separate mechanism.
- **Fix**: (Consolidated with NC-3 — the fix is identical)

---

## PRIORITY 1: Ergonomics Spec - Scanner CLI (`manifest scan`)

The ergonomics spec defines a scanner that catches all configuration issues before runtime. This is the highest-priority new feature toward the ultimate goal.

### P1-A: Policy Coverage Scanner [MISSING]
- **Spec**: Ergonomics spec Layer 2, Section 2.2 (Scanner Rule 1)
- **Rule**: Every command MUST have a policy. Scanner catches missing policies with actionable error messages.
- **Status**: CLI exists at `packages/cli/src/commands/` with 6 commands: compile, validate, generate, build, check, init. NO scan command exists. Zero references to "scan" in CLI source.
- **Location**: `packages/cli/src/commands/scan.ts` (new file), register in `packages/cli/src/index.ts`
- **Implementation**:
  - Parse compiled IR (reuse existing compile step)
  - For each command, check if at least one policy with action `execute` or `all` covers it (matching entity scope)
  - Note: Current runtime `checkPolicies()` at `runtime-engine.ts:1180-1212` returns `allowed: true` when no policies match — this is by design but means uncovered commands silently succeed. The scanner must flag this gap.
  - Emit error with exact file location, command name, and suggested fix
  - Error format per spec: `"Command 'Entity.command' has no policy."`
  - Exit code 1 on errors, 0 on clean scan
- **Note**: This can work with YAML config alone; does NOT require P2-A TypeScript config

### P1-B: Property Alignment Scanner (Prisma) [MISSING]
- **Spec**: Ergonomics spec Layer 2, Section 2.2 (Scanner Rule 2)
- **Rule**: Scanner validates manifest properties exist in Prisma model
- **Status**: No Prisma integration in codebase. Zero Prisma references in package.json or source code (confirmed by search).
- **Dependencies**: Requires P3-B (prisma store target) and P2-A (config with prismaModel reference)
- **Implementation**:
  - Read Prisma schema (auto-detect `prisma/schema.prisma` or config path)
  - Compare manifest entity properties against Prisma model fields
  - Emit "Did you mean X?" suggestions using Levenshtein distance for close matches
  - Support property mapping in config: `properties: { itemNumber: { prismaField: 'item_number' } }`
- **Note**: Consider making this store-adapter-agnostic; pattern should work for any schema source

### P1-C: Store Consistency Scanner [MISSING]
- **Spec**: Ergonomics spec Layer 2, Section 2.2 (Scanner Rule 3)
- **Rule**: Store target in manifest must match implementation binding in config
- **Status**: Runtime validates store targets at initialization (`runtime-engine.ts:412-466`) but not at scan time. Currently recognized: memory, localStorage, postgres, supabase (exhaustive switch at `runtime-engine.ts:428-458`).
- **Dependencies**: Requires P2-A (TypeScript config with store bindings)
- **Implementation**:
  - Cross-reference manifest store declarations against config file bindings
  - Catch `store X in prisma` without corresponding config binding
  - Suggest valid built-in targets (memory, localStorage, postgres, supabase) or config binding syntax

### P1-D: Route Context Scanner [MISSING]
- **Spec**: Ergonomics spec Layer 2, Section 2.2 (Scanner Rule 4)
- **Rule**: All required context fields are passed to runtime in route handlers
- **Status**: No route scanning exists. Generated routes (from Next.js projection) use auth provider-specific patterns.
- **Dependencies**: Requires P2-C (resolveUser config) to know what context fields are expected
- **Implementation**:
  - Analyze generated route files for user context passing
  - Flag routes missing user/context injection
  - Suggest resolveUser pattern from config

---

## PRIORITY 2: Ergonomics Spec - Configuration File

### P2-A: manifest.config.ts Support [MISSING]
- **Spec**: Ergonomics spec Layer 2, Section 2.1
- **Rule**: TypeScript configuration file at project root for store bindings and user resolution
- **Status**: CLI supports ONLY YAML config (`manifest.config.yaml`, `.manifestrc.yaml`, `.manifestrc.yml`, `manifest.config.yml`). Config loaded by `packages/cli/src/utils/config.ts` using `js-yaml` (v4.1.0). No TypeScript config support.
- **Current config interface**: `ManifestConfig { $schema?, src?, output?, projections? }` — purely build-level settings, no runtime bindings
- **Verified**: Zero references to "manifest.config.ts" or "manifest.config.js" in any source file. Config loader searches 4 YAML file paths only.
- **Implementation**:
  - Extend config loader to support `.ts` and `.js` config files (use `tsx` or `jiti` for runtime TS loading)
  - Add TypeScript-specific config interface with store bindings and resolveUser:
    ```typescript
    { stores: { [entity]: { implementation, prismaModel? } }, resolveUser: async (auth) => UserContext }
    ```
  - Merge with existing YAML config (YAML for build settings, TS for code bindings)
  - Precedence: `manifest.config.ts` > `manifest.config.js` > `manifest.config.yaml`

### P2-B: Store Implementation Binding [MISSING]
- **Spec**: Ergonomics spec Layer 2, Section 2.1
- **Rule**: Config binds entity names to store implementations with validation metadata
- **Status**: Runtime uses `storeProvider` option in RuntimeOptions (`runtime-engine.ts:85`: `storeProvider?: (entityName: string) => Store | undefined`) but no config-driven binding. Each consumer must wire stores manually via the callback.
- **Implementation**:
  - Config declares implementation class per entity
  - Scanner validates binding completeness (every entity with a store declaration has a config binding)
  - Runtime reads config at startup and uses it as storeProvider

### P2-C: resolveUser Auto-Injection [MISSING]
- **Spec**: Ergonomics spec Layer 2, Section 2.1
- **Rule**: Single resolveUser function eliminates per-route user context boilerplate (~15 lines -> ~3 lines)
- **Status**: No resolveUser concept in codebase. Runtime context has `user?: { id, role?, ... }` but caller must provide it manually.
- **Verified**: Zero references to "resolveUser" in any source file (only in IMPLEMENTATION_PLAN.md and specs)
- **Implementation**:
  - Config declares async resolveUser function
  - Generated routes (Next.js projection) call resolveUser automatically instead of inline auth code
  - Multi-tenant context support (auth -> tenantId -> user)

---

## PRIORITY 3: Ergonomics Spec - Language Changes

### P3-A: Default Policy Blocks [MISSING]
- **Spec**: Ergonomics spec Layer 1, Section 1.1
- **Rule**: Entity-level default policies inherited by all commands unless overridden at command level
- **Syntax**:
  ```manifest
  entity X {
    default policy execute: user.role in ["admin"]
    command foo(...) { ... }  // Inherits default policy
    command bar(...) {
      policy execute: user.role == "superadmin"  // Overrides default
    }
  }
  ```
- **Status**: Parser has NO "default" keyword handling for policies. No DefaultPolicyNode in AST (`types.ts`). No IR representation for entity-level default policies. `runtime-engine.ts:1180-1212` policy evaluation does NOT check for defaults when no command-specific policy matches.
- **Verified**:
  - Lexer has 73 keywords (`lexer.ts:16-37`); "default" is NOT among them.
  - Parser `parsePolicy()` (`parser.ts:305-317`) expects explicit action keyword, defaults action to `all` when not specified.
  - `checkPolicies()` returns `allowed: true` if no policies match (no fallback to entity defaults).
  - IR schema (`ir-v1.schema.json`) has NO `defaultPolicies` field on IREntity.
  - `PolicyNode` AST type (`types.ts:97-103`) has 5 fields: type, name, action, expression, message — no "default" marker.
- **Impact**: This is a LANGUAGE CHANGE requiring coordinated updates across the full stack
- **Prerequisite**: P6-A (spec must be written first per spec-driven development)
- **Implementation**:
  1. P6-A: Write spec in `docs/spec/semantics.md` (default policy semantics)
  2. Add `default` keyword to lexer `KEYWORDS` array (`lexer.ts:16-37`)
  3. Add DefaultPolicyNode to parser AST (`types.ts`)
  4. Update `parseEntity()` in `parser.ts` to handle `default policy` syntax
  5. Add IR representation: `IREntity.defaultPolicies: IRPolicy[]` array
  6. Update `ir-compiler.ts` to emit default policies
  7. Update `runtime-engine.ts` `checkPolicies()` to fall back to entity default policies when no command-specific policy exists
  8. Update `docs/spec/ir/ir-v1.schema.json` with new field
  9. Add conformance fixture with `.ir.json` and `.results.json`

### P3-B: Built-in Store Target "prisma" [MISSING]
- **Spec**: Ergonomics spec Layer 1, Section 1.2
- **Rule**: `prisma` is a recognized built-in store target alongside memory, localStorage, postgres, supabase
- **Status**: Parser accepts any identifier as store target (3 syntax variants in `parseEntity()` lines 95-115). IR has `target: string`. Runtime `initializeStores()` validates known targets at `runtime-engine.ts:428-458` (exhaustive switch). "prisma" is NOT in the recognized list and would hit the default/error case.
- **Verified**:
  - Lexer KEYWORDS include `memory`, `postgres`, `supabase`, `localStorage` but NOT `prisma` (`lexer.ts:27`)
  - `initializeStores()` switch handles memory, localStorage, postgres, supabase only (`runtime-engine.ts:428-458`)
  - IR schema `ir-v1.schema.json` defines store target enum as: `memory`, `localStorage`, `postgres`, `supabase` — no prisma
  - Zero references to "prisma" in any source file under src/
- **Impact**: `store X in prisma` compiles to IR successfully (parser accepts any identifier) but fails at runtime initialization
- **Implementation**:
  - Add "prisma" to IR schema store target enum in `ir-v1.schema.json`
  - Add "prisma" to lexer KEYWORDS (or verify it already parses as identifier)
  - Add `'prisma'` case in `initializeStores()` switch in `runtime-engine.ts`
  - Implement PrismaStore adapter in `stores.node.ts` (or route through config binding from P2-B)
  - Update `docs/spec/adapters.md` with prisma adapter contract
  - Per workflow spec (`specs/workflow/Manifest-Workflow-Orchestration-and-Effect-Boundaries.md`): "Prisma is NOT a core runtime store target" — implementation should delegate to config binding, not be a built-in adapter

---

## PRIORITY 4: Ergonomics Spec - DevTools UI

### P4-A: DevTools Dashboard Enhancement [PARTIAL]
- **Spec**: Ergonomics spec Layer 2, Section 2.3
- **Rule**: Browser-based dashboard showing entity status, policy coverage, issues, real-time request logging
- **Status**: `tools/manifest-devtools/project/` has a working React application with:
  - Dashboard.tsx landing page with tool overview
  - 5 specialized tools: Guard Debugger, Fixture Generator, Runtime Profiler, IR Verifier, Migration Assistant
  - Supabase backend integration
  - But: NO entity status indicators, NO policy coverage matrix, NO issue tracker mirroring scanner output, NO real-time request logging
- **Verified**: Current DevTools focus on developer tooling (debugging, profiling, verification) NOT on the ergonomics spec's vision of a configuration health dashboard
- **Gap**: The ergonomics spec envisions a dashboard that shows pass/warn/fail per entity, policy coverage gaps, and live request tracing. Current DevTools are complementary but don't address this.
- **Implementation**:
  - Add entity status page: compile IR, run scanner rules, display pass/warn/fail per entity
  - Add policy coverage matrix: visual grid of entities x commands showing policy presence
  - Add issue tracker: mirror `manifest scan` output in browser with suggested fixes
  - Add real-time request logging with policy execution details (requires runtime telemetry hook)

---

## PRIORITY 5: Conformance Expansion

### P5-A: Fixture 02 Relationship Runtime Results [MISSING]
- Same as NC-4
- Fixture 02 defines Author/Book with hasMany/belongsTo. Has IR, no results.json.
- Add `.results.json` testing relationship traversal, inverse lookups, null/empty edge cases

### P5-B: Fixture 20 Blog App Runtime Results [MISSING]
- Same as NC-5
- Fixture 20 is the largest and most realistic fixture (3 entities, 15+ commands). Compiles cleanly. No results.json.
- Add `.results.json` testing command execution, guard evaluation, event emission, computed properties

### P5-C: Provenance Verification Conformance [MISSING]
- Same as NC-6
- Code exists but test coverage is effectively zero. Add meaningful unit tests for verifyIRHash, assertValidProvenance, and RuntimeEngine.create.

### P5-D: vnext Required Fixtures 52-54 [MISSING]
- Same as NC-7
- Create dedicated conformance fixtures per vnext spec requirements:
  - `52-override-allowed.manifest` with `.results.json`
  - `53-override-denied.manifest` with `.results.json`
  - `54-concurrency-conflict.manifest` with `.results.json`

---

## PRIORITY 6: Documentation & Spec Alignment

### P6-A: Write Default Policy Spec [PENDING]
- **Spec**: Ergonomics spec acceptance criteria item 1
- **Rule**: "Language changes are extracted to docs/spec/semantics.md and docs/spec/conformance.md"
- **Prerequisite for**: P3-A (default policy blocks implementation)
- **Deliverables**:
  - Update `docs/spec/semantics.md` with "Default Policies" section defining: inheritance rules, override semantics, evaluation order
  - Update `docs/spec/conformance.md` with expected fixture format
  - Update `docs/spec/ir/ir-v1.schema.json` with `defaultPolicies` field on IREntity (if IR shape changes)

### P6-B: Write Prisma Store Adapter Spec [PENDING]
- **Spec**: Ergonomics spec Layer 1, Section 1.2
- **Prerequisite for**: P3-B (prisma store target)
- **Note**: Per `specs/workflow/Manifest-Workflow-Orchestration-and-Effect-Boundaries.md`: "Prisma is NOT a core runtime store target" — this means prisma should delegate to config binding, not be a built-in like memory/localStorage. Spec proposal should reflect this.
- **Deliverables**:
  - Author spec proposal at `docs/proposals/prisma-store-adapter.md` defining: config binding pattern, schema discovery, property mapping
  - Update `docs/spec/adapters.md` with prisma adapter contract (or config-delegation pattern)

---

## PRIORITY 7: Testing Infrastructure Gaps

### P7-A: CLI Test Coverage [MISSING]
- **Status**: `packages/cli/` has **zero test files**. Glob for `packages/cli/**/*.test.ts` returns no results. All 6 CLI commands (compile, validate, generate, build, check, init) are untested.
- **Impact**: CLI behavior changes (especially for the new scan command in P1-A) have no regression safety net
- **Fix**: Add test suite for CLI commands, at minimum:
  - `compile` command: valid input → IR output, invalid input → error with diagnostics
  - `validate` command: valid IR → success, invalid IR → schema errors
  - `check` command: end-to-end compile + validate
  - `scan` command: (add alongside P1-A implementation)
- **Files**: `packages/cli/src/commands/*.test.ts` (new files)

### P7-B: Hollow Provenance Tests [INCOMPLETE]
- Same as NC-6 but framed as test quality issue
- Two existing tests in `runtime-engine.test.ts:709-752` appear to test provenance but actually test nothing meaningful:
  - Test 1 sets `requireValidProvenance: false` which skips verification entirely
  - Test 2 checks structural presence of `.provenance` on events, not hash verification
- **Fix**: Replace or supplement with meaningful tests (see NC-6 fix list)

---

## COMPLETED (Reference)

Items confirmed as fully implemented and passing with conformance evidence:

- [x] Core language: entities, properties, commands, guards, policies, events, stores, modules
- [x] Relationships: hasMany, hasOne, belongsTo, ref (IR compilation verified, runtime untested — see NC-4)
- [x] Computed properties with dependency tracking and cycle detection
- [x] Constraint severity levels (ok, warn, block) — Fixture 36
- [x] Command-level constraints — Fixture 25
- [x] Optimistic concurrency controls (versionProperty, versionAtProperty) — Fixture 24 (partial — see NC-3/NC-9)
- [x] State transitions with from/to validation — Fixture 38
- [x] Override authorization flow (runtime) — Fixture 22 (partial — see NC-2)
- [x] Idempotency store and key deduplication — Fixture 23
- [x] Workflow metadata (emitIndex, correlationId, causationId) — Fixture 27
- [x] Effect boundary enforcement (deterministicMode + ManifestEffectBoundaryError)
- [x] Provenance tracking (contentHash, irHash, verifyIRHash, assertValidProvenance, RuntimeEngine.create) — code exists and is substantial, conformance untested (NC-6)
- [x] Bounded complexity limits (maxExpressionDepth: 64, maxEvaluationSteps: 10000) — 8 unit tests
- [x] Built-in functions: now(), uuid()
- [x] Lambda expressions with parentheses syntax (shorthand `x => ...` NOT supported)
- [x] Storage adapters: memory, localStorage, postgres, supabase
- [x] Next.js projection (App Router) with Clerk/NextAuth/custom/none auth
- [x] CLI: init, compile, generate, build, validate, check commands (6 of 7; scan missing)
- [x] 482/482 tests passing (156 conformance + 305 unit + 21 projection)
- [x] Zero TODO/FIXME/HACK markers in source code (confirmed by search)
- [x] Zero skipped tests (confirmed: no .skip(), .only(), xit(), xdescribe() in test files)
- [x] Zero @ts-ignore / @ts-nocheck / @ts-expect-error suppressions in src/ (one justified `@ts-expect-error` in `test-setup.ts:33` for Node.js localStorage mock)
- [x] DevTools: Guard Debugger, Fixture Generator, Runtime Profiler, IR Verifier, Migration Assistant

---

## IMPLEMENTATION ORDER

Recommended order based on dependencies, spec conformance priority, and impact toward the ultimate goal:

### Phase 1: Conformance Debt (spec violations first)
1. **NC-8**: Add semantic diagnostic infrastructure to `ir-compiler.ts` (prerequisite for NC-1)
2. **NC-1**: Constraint code uniqueness diagnostic in `ir-compiler.ts` + fixture 39
3. **NC-3/NC-9**: Fix ConcurrencyConflict return path in `runtime-engine.ts` (wire `updateInstance()` result through `executeAction()`, populate `CommandResult.concurrencyConflict`)
4. **NC-2**: Extend fixture 22 results.json with OverrideApplied event payload verification
5. **NC-4**: Add `02-relationships.results.json` for relationship runtime traversal
6. **NC-5**: Add `20-blog-app.results.json` for multi-entity runtime conformance
7. **NC-6**: Add provenance verification unit tests (verifyIRHash valid/tampered, assertValidProvenance throw, RuntimeEngine.create factory)
8. **NC-7**: Add vnext required fixtures 52-54 (override-allowed, override-denied, concurrency-conflict)

### Phase 2: Scanner CLI (highest ergonomics impact, no language changes needed)
9. **P1-A**: Policy coverage scanner (`packages/cli/src/commands/scan.ts`)

### Phase 3: Spec authoring (prerequisites for language changes)
10. **P6-A**: Write default policy spec in `docs/spec/semantics.md`
11. **P6-B**: Write prisma store adapter proposal at `docs/proposals/prisma-store-adapter.md`

### Phase 4: Language changes
12. **P3-A**: Default policy blocks (lexer + parser + types + ir-compiler + runtime + conformance fixture)

### Phase 5: Configuration system (enables scanner extensions)
13. **P2-A**: manifest.config.ts support (extend `packages/cli/src/utils/config.ts`)
14. **P2-B**: Store implementation binding (config-driven store wiring)
15. **P2-C**: resolveUser auto-injection (config-driven user context)

### Phase 6: Scanner extensions (depend on config system)
16. **P1-C**: Store consistency scanner (depends on P2-A config)
17. **P1-D**: Route context scanner (depends on P2-C resolveUser)
18. **P3-B**: Built-in prisma store target (depends on P6-B spec)
19. **P1-B**: Property alignment scanner for Prisma (depends on P3-B)

### Phase 7: Testing infrastructure
20. **P7-A**: CLI test suite (add alongside or after P1-A scanner implementation)

### Phase 8: DevTools enhancement
21. **P4-A**: DevTools dashboard with entity status, policy coverage matrix, issue tracker, request logging

---

## METRICS (from ergonomics spec)

| Metric | Current | Target | Unblocked By |
|--------|---------|--------|--------------|
| 500 errors from config issues | Unknown (no scanner) | **0** (scanner catches all) | P1-A, P1-B, P1-C |
| 403 errors from missing policies | Unknown (no defaults) | **0** (defaults + scanner) | P3-A, P1-A |
| Time from "add entity" to "working API" | Unknown | **< 5 minutes** | P2-A, P2-B, P2-C |
| Files touched to add a new command | Multiple | **1** (the manifest file) | P3-A, P2-C |
| Conformance fixtures with runtime evidence | 25/38 (.results.json) | **38/38+** | NC-4, NC-5, NC-7, phase 1 |
| vnext required fixtures created | 0/4 | **4/4** | NC-1, NC-7 |
| Provenance verification test cases | 0 meaningful | **5+** | NC-6 |
| ConcurrencyConflict return populated | **0** (dead code) | **Always** (on version mismatch) | NC-3/NC-9 |
| CLI command test coverage | **0%** (zero test files) | **>80%** | P7-A |
| Compiler semantic diagnostics | **0** (parser-only) | **1+** (constraint code uniqueness) | NC-8, NC-1 |

---

## FIXTURE COVERAGE MAP

| # | Fixture | IR | Diagnostics | Results | Gap |
|---|---------|:--:|:-----------:|:-------:|-----|
| 01 | entity-properties | Y | | Y | |
| 02 | relationships | Y | | **N** | NC-4: needs runtime tests |
| 03 | computed-properties | Y | | Y | |
| 04 | command-mutate-emit | Y | | Y | |
| 05 | guard-denial | Y | | Y | |
| 06 | policy-denial | Y | | Y | |
| 07 | reserved-word-identifier | | Y | | Diagnostic-only (shouldFail=true) |
| 08 | keywords-in-expressions | Y | Y | Y | |
| 09 | compute-action | Y | | Y | |
| 10 | evaluation-context | Y | | Y | |
| 11 | guard-ordering-diagnostics | Y | | Y | |
| 12 | negative-compilation | | Y | | Diagnostic-only (shouldFail=true) |
| 13 | round-trip-stability | Y | | Y | |
| 14 | operator-equality | Y | | Y | |
| 15 | event-log | Y | | Y | |
| 16 | builtin-functions | Y | Y | Y | |
| 17 | tiny-app | Y | Y | Y | |
| 18 | empty-string-defaults | Y | | Y | |
| 19 | entity-constraints | Y | Y | Y | |
| 20 | blog-app | Y | Y | **N** | NC-5: compiles clean, needs runtime tests |
| 21 | constraint-outcomes | Y | | Y | |
| 22 | override-authorization | Y | | Y | NC-2: missing OverrideApplied event verification |
| 23 | workflow-idempotency | Y | | Y | |
| 24 | concurrency-conflict | Y | | Y | NC-3: missing ConcurrencyConflict object verification |
| 25 | command-constraints | Y | | Y | |
| 26 | performance-constraints | Y | | Y | |
| 27 | vnext-integration | Y | | Y | |
| 28 | unclosed-braces | | Y | | Diagnostic-only (shouldFail=true) |
| 29 | missing-colon | | Y | | Diagnostic-only (shouldFail=true) |
| 30 | incomplete-expression | | Y | | Diagnostic-only (shouldFail=true) |
| 31 | invalid-operators | | Y | | Diagnostic-only (shouldFail=true) |
| 32 | constraint-without-expression | | Y | | Diagnostic-only (shouldFail=true) |
| 33 | malformed-relationship | | Y | | Diagnostic-only (shouldFail=true) |
| 34 | command-with-reserved-name | | Y | | Diagnostic-only (shouldFail=true) |
| 35 | unclosed-command-block | | Y | | Diagnostic-only (shouldFail=true) |
| 36 | constraint-severity | Y | | Y | |
| 37 | allowed-duplicate-command-names | Y | Y | | Structural test; runtime N/A |
| 38 | state-transitions | Y | | Y | |
| 39 | (planned) duplicate-constraint-codes | | | | NC-1: needs fixture + compiler diagnostic |
| 52 | (planned) override-allowed | | | | NC-7: vnext required fixture |
| 53 | (planned) override-denied | | | | NC-7: vnext required fixture |
| 54 | (planned) concurrency-conflict | | | | NC-7: vnext required fixture |

---

## CODEBASE HEALTH (Verified 2026-02-14)

| Check | Status | Evidence |
|-------|--------|----------|
| TODO/FIXME/HACK markers | **Clean** | Zero found in src/ (1 doc example in .opencode/) |
| Skipped tests (.skip/.only) | **Clean** | Zero found in test files |
| TypeScript suppressions | **Clean** | Zero in src/; one justified `@ts-expect-error` in `test-setup.ts:33` for localStorage mock |
| "Not implemented" throws | **Clean** | 2 intentional stubs in test harness tools only (`tools/manifest-ir-test-harnessv2/`) |
| Placeholder/stub implementations | **Clean** | All functions have real implementations |
| Console.log in non-test code | **Acceptable** | 2 instances in `RuntimePanel.tsx` (diagnostic UI); all CLI console.log is user-facing output |
| Deprecated markers | **Clean** | One test assertion about deprecated methods (intentional, not a deprecation) |
| Empty function bodies | **Clean** | None found (TypeScript constructor shorthands only) |
| CLI test coverage | **Gap** | Zero test files in `packages/cli/` (see P7-A) |
| Compiler semantic diagnostics | **Gap** | ir-compiler emits ONLY parser errors, zero semantic validations (see NC-8) |
| ConcurrencyConflict return path | **Broken** | Field declared on CommandResult but never assigned (see NC-9) |
| SQL injection risk in stores.node.ts | **Minor** | `stores.node.ts:65-72` CREATE TABLE uses string-interpolated tableName (see NC-10) |
| Entity-scoped events | **Incomplete** | `ir-compiler.ts:216` comment: "Entity-scoped events not supported in current syntax" (see NC-11) |
| Hardcoded legacy store mapping | **Minor** | `ir-compiler.ts:152` maps `filesystem` → `localStorage` without extensibility (see NC-12) |

---

## ADDITIONAL FINDINGS (Verified 2026-02-14)

### NC-10: SQL Injection Risk in PostgresStore [MINOR]
- **File**: `src/manifest/stores.node.ts:65-72`
- **Rule**: `docs/spec/adapters.md` — Stores MUST handle errors; parameterized queries are a security best practice
- **Status**: The `PostgresStore` CREATE TABLE query uses string interpolation for `tableName`:
  ```typescript
  CREATE TABLE IF NOT EXISTS "${this.tableName}" (...)
  ```
  This is not parameterized. While the table name originates from the entity name in the manifest (trusted source), if `storeProvider` is used with user-derived entity names, this could be exploitable.
- **Impact**: Low risk in practice (table names come from manifest compilation, not user input), but violates defense-in-depth principle. Also applies to all subsequent queries using `this.tableName`.
- **Fix**: Use `pg-format` or equivalent for identifier quoting, or document that tableName MUST NOT contain user input.
- **Files**: `src/manifest/stores.node.ts`

### NC-11: Entity-Scoped Events Not Supported [INCOMPLETE]
- **File**: `src/manifest/ir-compiler.ts:216`
- **Rule**: IR schema defines events at the module and root level; entity-scoped events could extend this
- **Status**: Comment at line 216 reads: "Entity-scoped events not supported in current syntax". Events declared within an entity block are NOT collected by the IR compiler. Only module-level and root-level events are transformed.
- **Impact**: Low — entity-scoped events are not in the current spec. This is an implementation limitation, not a spec violation. However, if users attempt to declare events within entity blocks, they will be silently ignored.
- **Fix**: Either (a) add parser support for entity-scoped events and transform them in IR compiler, or (b) emit a diagnostic warning when events are declared inside entity blocks to prevent silent data loss.
- **Note**: This does NOT violate current spec — listed as a potential source of user confusion.

### NC-12: Hardcoded Legacy Store Target Mapping [MINOR]
- **File**: `src/manifest/ir-compiler.ts:152`
- **Rule**: IR schema defines store targets as enum: `memory`, `localStorage`, `postgres`, `supabase`
- **Status**: Line 152 maps the legacy identifier `filesystem` to `localStorage`:
  ```typescript
  e.store === 'filesystem' ? 'localStorage' : ...
  ```
  This is a hardcoded migration aid. No documentation exists for this mapping, and other potential legacy identifiers would not be converted.
- **Impact**: Minimal — this is backward-compatible behavior. The risk is silent conversion without user awareness.
- **Fix**: Consider emitting a deprecation diagnostic when `filesystem` is encountered, or document the mapping in adapters.md.

---

## VERIFICATION LOG (2026-02-14)

Independent verification of all plan items via automated codebase exploration (6 parallel agents):

### NC Items — All Confirmed
| Item | Verification Method | Result |
|------|-------------------|--------|
| NC-1 | `grep "uniqueness\|duplicate" ir-compiler.ts` | Zero matches; constraint code `c.code \|\| c.name` at line 279 with no Set tracking |
| NC-2 | Read `22-override-authorization.results.json` | 4 test cases; Test 2 asserts only `RecordProcessed` event, zero OverrideApplied assertions |
| NC-3/NC-9 | `grep "concurrencyConflict:" runtime-engine.ts` | Zero assignment locations; field at ir.ts:119 declared only; updateInstance() return discarded at line 1442-1448 |
| NC-4 | `ls expected/02-relationships.results.json` | File does not exist |
| NC-5 | `ls expected/20-blog-app.results.json` | File does not exist |
| NC-6 | Read `runtime-engine.test.ts:709-752` | Test 1 uses `requireValidProvenance: false`; Test 2 checks structural presence only |
| NC-7 | `find fixtures/ -name "39-*" -o -name "52-*" -o -name "53-*" -o -name "54-*"` | Zero results; latest fixture is 38-state-transitions |
| NC-8 | `grep -c "this.diagnostics.push" ir-compiler.ts` | Exactly 1 location (line 118); forwards parser errors only |

### P Items — All Confirmed Missing
| Item | Verification Method | Result |
|------|-------------------|--------|
| P1-A | `grep -r "scan" packages/cli/src/` | Zero matches for scanner command |
| P2-A | `grep -r "manifest.config.ts" src/` | Zero matches; config loader only searches 4 YAML paths |
| P2-C | `grep -r "resolveUser" src/` | Zero matches in source files |
| P3-A | Read `lexer.ts:16-37` KEYWORDS | "default" NOT in the 73-keyword set |
| P3-B | `grep -r "prisma" src/manifest/` | Zero matches; not in KEYWORDS or initializeStores() switch |
| P7-A | `glob packages/cli/**/*.test.ts` | Zero test files |

### Baseline Verification
| Check | Method | Result |
|-------|--------|--------|
| Test count | `npm test` output | **482 passed** (8 test files, 514ms) |
| Conformance tests | conformance.test.ts output | **156 tests** (38 fixtures) |
| Skipped tests | `grep ".skip\|.only" *.test.ts` | Zero matches |
| TODO/FIXME/HACK | `grep "TODO\|FIXME\|HACK" src/manifest/*.ts` | Zero matches |
| TS suppressions | `grep "@ts-ignore\|@ts-nocheck\|@ts-expect-error" src/manifest/*.ts` | Zero matches |

### New Findings Added
- **NC-10**: SQL injection risk in `stores.node.ts:65-72` (string-interpolated table name)
- **NC-11**: Entity-scoped events silently ignored (`ir-compiler.ts:216` comment)
- **NC-12**: Hardcoded `filesystem` → `localStorage` mapping (`ir-compiler.ts:152`)

### Expected Output File Counts (Confirmed)
- `.ir.json` files: **28** out of 38 fixtures (10 are diagnostic-only)
- `.diagnostics.json` files: **16** out of 38 fixtures
- `.results.json` files: **25** out of 38 fixtures (2 runtime fixtures missing: 02, 20; 10 diagnostic-only; 1 structural-only)

### Conclusion
The existing IMPLEMENTATION_PLAN.md was highly accurate. All NC items verified as stated. All P items confirmed missing. Test count corrected from 467 → 482 (test suite grew by 15 tests since plan was first written). Three new minor findings added (NC-10, NC-11, NC-12). Implementation order and dependency chains remain valid.
