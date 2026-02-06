# Manifest Implementation Plan

**Last Updated**: 2026-02-06

**Overall Status**: vNext Implementation COMPLETE (135/135 tests passing) | IR Schema Documentation UPDATED | Semantics/Migration docs PENDING

---

## Executive Summary

Manifest is a domain-specific language for defining business rules and workflows with declarative specifications, centralized rules, deterministic execution, and performance optimizations for ops-scale deployment.

### Current State

| Component | Status | Evidence |
|-----------|--------|----------|
| **Baseline Features** | COMPLETE | 20 fixtures passing (100% conformance) |
| **vNext Features** | COMPLETE | Fixtures 21-27 passing (100% conformance) |
| **Test Suite** | PASSING | 135/135 tests (134 conformance + 1 happy) |
| **IR Schema (ir.ts)** | COMPLETE | All vNext interfaces implemented |
| **IR Schema JSON** | UPDATED | docs/spec/ir/ir-v1.schema.json now includes vNext fields |
| **Semantics Docs** | OUTDATED | vNext features not documented |
| **Migration Guide** | MISSING | vnext-migration-guide.md not created |

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

### 2. Semantics Documentation (HIGH PRIORITY)

| Task | File | Status |
|------|------|--------|
| Add constraint severity semantics | docs/spec/semantics.md | TODO |
| Add override mechanism documentation | docs/spec/semantics.md | TODO |
| Add command constraints documentation | docs/spec/semantics.md | TODO |
| Add concurrency controls documentation | docs/spec/semantics.md | TODO |

### 3. Migration Guide (HIGH PRIORITY)

| Task | File | Status |
|------|------|--------|
| Create vNext migration guide | docs/migration/vnext-migration-guide.md | FILE DOESN'T EXIST |

**Should include**:
- New constraint severity syntax (`:ok`, `:warn`, `:block`)
- Overrideable modifier usage
- Command-level constraints
- Entity versioning for concurrency
- Before/after examples

### 4. Technical Debt (MEDIUM PRIORITY)

| Issue | Location | Impact |
|-------|----------|--------|
| COMPILER_VERSION hardcoded | generator.ts:4, ir-compiler.ts:43, standalone-generator.ts:4 | Shows '0.0.0' instead of actual version |
| Misleading Supabase stub comment | generator.ts:104-105 | Comment says stub but actual implementation exists in stores.node.ts |

### 5. README Updates (LOW PRIORITY)

| Task | File | Status |
|------|------|--------|
| Document vNext features | README.md | TODO |
| Add vNext examples | README.md | TODO |

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
├── semantics.md             # Runtime semantics (needs vNext updates)
├── ir/
│   └── ir-v1.schema.json    # IR schema (needs vNext updates)
├── conformance.md           # Conformance testing rules
├── builtins.md              # Built-in functions
├── adapters.md              # Storage adapters
└── manifest-vnext.md        # vNext feature specification

docs/migration/
└── vnext-migration-guide.md # Migration guide (needs to be created)
```

---

## No TODOs Found

Comprehensive grep search found:
- No TODO comments in implementation code
- No FIXME comments
- No STUB or PLACEHOLDER comments (except misleading Supabase comment)
- No skip/flaky tests
- No placeholder implementations

---

## Next Steps

1. ~~**Update IR Schema JSON**: Add vNext fields to docs/spec/ir/ir-v1.schema.json~~ **DONE**
2. **Update Semantics**: Add vNext semantics to docs/spec/semantics.md
3. **Create Migration Guide**: Write docs/migration/vnext-migration-guide.md
4. **Update README**: Document vNext features in README.md
5. **Fix Technical Debt**: Source COMPILER_VERSION from package.json, clarify Supabase comment

---

## Related Files

- vNext implementation plan: specs/vnext/IMPLEMENTATION_PLAN.md
- vNext feature specification: docs/spec/manifest-vnext.md
- Planning prompt template: PROMPT_plan.md
- Build prompt template: PROMPT_build.md
