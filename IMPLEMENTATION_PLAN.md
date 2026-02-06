# Manifest Implementation Plan

**Last Updated**: 2026-02-06

**Overall Status**: vNext Implementation COMPLETE (135/135 tests passing) | TypeScript Typecheck CLEAN | IR Schema & Semantics Documentation UPDATED | Migration Guide CREATED | README Documentation UPDATED | Technical Debt RESOLVED

---

## Executive Summary

Manifest is a domain-specific language for defining business rules and workflows with declarative specifications, centralized rules, deterministic execution, and performance optimizations for ops-scale deployment.

### Current State

| Component | Status | Evidence |
|-----------|--------|----------|
| **Baseline Features** | COMPLETE | 20 fixtures passing (100% conformance) |
| **vNext Features** | COMPLETE | Fixtures 21-27 passing (100% conformance) |
| **Test Suite** | PASSING | 135/135 tests (134 conformance + 1 happy) |
| **TypeScript** | CLEAN | No typecheck errors (6 issues resolved 2026-02-06) |
| **IR Schema (ir.ts)** | COMPLETE | All vNext interfaces implemented |
| **IR Schema JSON** | UPDATED | docs/spec/ir/ir-v1.schema.json includes vNext fields |
| **Semantics Docs** | UPDATED | docs/spec/semantics.md includes vNext semantics |
| **Migration Guide** | CREATED | docs/migration/vnext-migration-guide.md with examples |
| **README Documentation** | UPDATED | docs/spec/README.md includes vNext references |

---

## Verified Complete Features

### Baseline Implementation (Fixtures 01-20)

- IR provenance tracking (contentHash, irHash, compilerVersion, schemaVersion, compiledAt)
- Entity-level constraint validation (binary pass/fail)
- Event emission with provenance
- Policy and guard evaluation with short-circuiting
- Relationship resolution with index for efficient lookup
- ConstraintFailure diagnostics with resolved values
- GuardFailure and PolicyDenial with formatted expressions

### vNext Implementation (Fixtures 21-27)

**IR Schema Extensions**:
- IRConstraint (code, severity, messageTemplate, detailsMapping, overrideable, overridePolicyRef)
- IRCommand (constraints array)
- IREntity (versionProperty, versionAtProperty)
- ConstraintOutcome, OverrideRequest, ConcurrencyConflict interfaces

**Parser/Lexer**:
- Keywords: overrideable, ok, warn
- Constraint severity parsing
- Command constraint parsing

**IR Compiler**:
- Transformations for all new constraint fields
- Command constraints compilation

**Runtime Engine**:
- evaluateConstraint, evaluateCommandConstraints
- validateOverrideAuthorization
- emitOverrideAppliedEvent, emitConcurrencyConflictEvent
- Relationship memoization cache

**Conformance Tests**:
- 135/135 tests passing (100%)
- Fixtures 21-27 covering all vNext features

---

## Remaining Work (Prioritized)

### 1. IR Schema Documentation Update (COMPLETED 2026-02-06)

IR schema JSON has been updated with all vNext fields:
- IRConstraint: Added code (required), severity, messageTemplate, detailsMapping, overrideable, overridePolicyRef
- IRCommand: Added constraints array
- IREntity: Added versionProperty, versionAtProperty
- IRPolicy: Added "override" to action enum
- New definitions: ConstraintOutcome, OverrideRequest, ConcurrencyConflict

### 2. Semantics Documentation (COMPLETED 2026-02-06)

docs/spec/semantics.md has been updated with vNext semantics:
- Constraint Severity (vNext): ok, warn, block levels
- Constraint Codes (vNext): Stable identifiers for overrides
- Constraint Evaluation (vNext): ConstraintOutcome structure
- Entity Concurrency (vNext): versionProperty, versionAtProperty, ConcurrencyConflict
- Command Constraints (vNext): Pre-execution validation
- Override Mechanism (vNext): overrideable flag, overridePolicyRef, OverrideRequest
- Policy override action (vNext): Policy action 'override' for authorizing constraint overrides

### 3. Migration Guide (COMPLETED 2026-02-06)

Created docs/migration/vnext-migration-guide.md with:
- New constraint severity syntax (`:ok`, `:warn`, `:block`)
- Overrideable modifier usage
- Command-level constraints
- Entity versioning for concurrency
- Before/after examples
- Quick migration checklist
- Testing guidelines

### 4. Technical Debt (RESOLVED 2026-02-06)

| Issue | Location | Resolution |
|-------|----------|------------|
| ~~COMPILER_VERSION hardcoded~~ | ~~generator.ts:4, ir-compiler.ts:43, standalone-generator.ts:4~~ | **RESOLVED** - Centralized in version.ts, matches package.json |
| ~~Misleading Supabase stub comment~~ | ~~generator.ts:104-105~~ | **RESOLVED** - Clarified as dev-time mock referencing production implementation |
| ~~TypeScript errors in runtime-engine.ts~~ | ~~runtime-engine.ts~~ | **RESOLVED** - Added IRConstraint import, removed unused severity variable, cast expr as IRExpression, emitConcurrencyConflictEvent now used |

### 5. README Updates (COMPLETED 2026-02-06)

Updated `docs/spec/README.md` Document Map to include:
- Reference to `docs/spec/manifest-vnext.md` (vNext features)
- New "Migration Documentation" section with link to vNext migration guide

### 6. Potential Enhancements (OPTIONAL)

- Add unit tests for parser/lexer components (currently only conformance tests)
- Add negative test cases (currently only happy path tests exist)
- Add ESLint rule to prevent hardcoded versions
- Add performance benchmarks

---

## Test Status

```
Test Files: 2 passed (2)
Tests: 135 passed (135)
  - src/manifest/runtime-engine.happy.test.ts: 1 test
  - src/manifest/conformance/conformance.test.ts: 134 tests
Duration: ~600ms
```

### Fixture Coverage

| Fixtures | Count | Status |
|----------|-------|--------|
| Baseline (01-20) | 20 | All passing |
| vNext (21-27) | 7 | All passing |
| **Total** | **27** | **100% passing** |

### vNext Fixture Details

| Fixture | Feature | Status |
|---------|---------|--------|
| 21-constraint-outcomes | Constraint severity levels | Passing |
| 22-override-authorization | Override mechanism | Passing |
| 23-workflow-idempotency | Workflow conventions | Passing |
| 24-concurrency-conflict | Concurrency controls | Passing |
| 25-command-constraints | Command-level constraints | Passing |
| 26-performance-constraints | IR caching, memoization | Passing |
| 27-vnext-integration | Full vNext integration | Passing |

---

## File Structure Reference

```
src/manifest/
├── ir.ts                    # IR schema with vNext extensions
├── ir-cache.ts              # IR compilation cache
├── ir-compiler.ts           # AST to IR transformation
├── lexer.ts                 # Tokenization (includes vNext keywords)
├── parser.ts                # Parse Manifest syntax to AST
├── types.ts                 # AST node types
├── runtime-engine.ts        # Runtime execution engine
├── generator.ts             # TypeScript code generator
├── standalone-generator.ts  # Standalone bundle generator
├── stores.node.ts           # Server-side stores (Postgres, Supabase)
├── conformance/
│   ├── fixtures/            # 27 test fixtures (*.manifest)
│   └── expected/            # Expected results (*.json, *.ir.json, *.diagnostics.json)

docs/spec/
├── semantics.md             # Runtime semantics (vNext semantics added)
├── ir/
│   └── ir-v1.schema.json    # IR schema (vNext fields added)
├── conformance.md           # Conformance testing rules
├── builtins.md              # Built-in functions
├── adapters.md              # Storage adapters
└── manifest-vnext.md        # vNext feature specification

docs/migration/
└── vnext-migration-guide.md # Migration guide (CREATED)
```

---

## Code Quality Status

**TypeScript**: No typecheck errors
**ESLint**: No blocking errors
**Tests**: 135/135 passing (100%)

Comprehensive search found:
- No TODO comments in implementation code
- No FIXME comments
- No STUB or PLACEHOLDER comments
- No skip/flaky tests
- No placeholder implementations
- All misleading comments resolved

---

## Next Steps

1. ~~**Update IR Schema JSON**: Add vNext fields to docs/spec/ir/ir-v1.schema.json~~ **DONE**
2. ~~**Update Semantics**: Add vNext semantics to docs/spec/semantics.md~~ **DONE**
3. ~~**Create Migration Guide**: Write docs/migration/vnext-migration-guide.md~~ **DONE**
4. ~~**Update README**: Document vNext features in docs/spec/README.md~~ **DONE 2026-02-06**
5. ~~**Fix Technical Debt - COMPILER_VERSION**: Centralize in version.ts~~ **DONE**
6. ~~**Fix Technical Debt - Supabase comment**: Clarify misleading stub comment~~ **DONE 2026-02-06**

### All Planned Work Complete

All vNext implementation, documentation, and technical debt items are resolved. Remaining items in "Potential Enhancements" are optional future work.

---

## Related Files

- vNext implementation plan: specs/vnext/IMPLEMENTATION_PLAN.md
- vNext feature specification: docs/spec/manifest-vnext.md
- Planning prompt template: PROMPT_plan.md
- Build prompt template: PROMPT_build.md
