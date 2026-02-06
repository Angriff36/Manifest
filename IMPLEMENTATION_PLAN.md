# Manifest Implementation Plan

**Last Updated**: 2026-02-06 (All unit tests COMPLETE | 427/427 tests passing | v0.3.7 released | Lambda expressions fully implemented | Version drift RESOLVED | ESLint rule for hardcoded versions ADDED | Entity-scoped store compilation bug FIXED | Parser now handles all store syntax variants | Git tag drift documented | 02-relationships.results.json recreated with ID fields)

**Overall Status**: vNext Implementation COMPLETE | All Unit Tests COMPLETE | 427/427 tests passing | TypeScript Typecheck CLEAN | All Documentation UPDATED | Technical Debt RESOLVED | Negative Tests ADDED | Lambda Expressions FULLY IMPLEMENTED | Lexer Unit Tests COMPLETE (58) | Parser Unit Tests COMPLETE (79) | IR Compiler Unit Tests COMPLETE (91) | Runtime Engine Unit Tests COMPLETE (56)

---

## Executive Summary

Manifest is a domain-specific language for defining business rules and workflows with declarative specifications, centralized rules, deterministic execution, and performance optimizations for ops-scale deployment.

### Current State

| Component | Status | Evidence |
|-----------|--------|----------|
| **Baseline Features** | COMPLETE | 20 fixtures passing (100% conformance) |
| **vNext Features** | COMPLETE | Fixtures 21-27 passing (100% conformance) |
| **Test Suite** | PASSING | 427/427 tests (142 conformance + 1 happy + 58 lexer + 79 parser + 91 ir-compiler + 56 runtime | 0 skipped) |
| **TypeScript** | CLEAN | No typecheck errors |
| **IR Schema (ir.ts)** | COMPLETE | All vNext interfaces implemented |
| **IR Schema JSON** | UPDATED | docs/spec/ir/ir-v1.schema.json includes vNext fields |
| **Semantics Docs** | UPDATED | docs/spec/semantics.md includes vNext semantics |
| **Migration Guide** | CREATED | docs/migration/vnext-migration-guide.md with examples |
| **README Documentation** | UPDATED | docs/spec/README.md includes vNext references |
| **Lexer Unit Tests** | COMPLETE | 58 tests covering all token types and edge cases |
| **Parser Unit Tests** | COMPLETE | 79 tests covering all AST node types and edge cases |

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
- messageTemplate interpolation

**Conformance Tests**:
- 135/135 tests passing (100%)
- Fixtures 21-27 covering all vNext features

---

## Test Status

```
Test Files: 6 passed (6)
Tests: 427 passed (427 | 0 skipped)
  - src/manifest/conformance/conformance.test.ts: 142 tests (includes 8 negative tests)
  - src/manifest/runtime-engine.happy.test.ts: 1 test
  - src/manifest/lexer.test.ts: 58 tests
  - src/manifest/parser.test.ts: 79 tests
  - src/manifest/ir-compiler.test.ts: 91 tests (lambda expression test enabled and passing)
  - src/manifest/runtime-engine.test.ts: 56 tests
Duration: ~450ms
```

### Lambda Expression Support

**Status**: FULLY IMPLEMENTED ✓

The Manifest parser now supports lambda expressions with the following syntax requirements:

- **Supported**: Lambda expressions with parentheses around parameters
  - Example: `(x) => x.name`
  - Example: `(user) => user.email === "admin@example.com"`

- **NOT Supported**: Shorthand lambda syntax without parentheses
  - Example: `x => x.name` ❌
  - The Manifest parser requires explicit parentheses around lambda parameters

**Architecture**:
- **Lexer**: Full support for `=>` token (already complete)
- **Parser**: Lambda expressions with parentheses `(param) => body` (NOW ENABLED)
- **IR Layer**: Complete lambda support (already implemented)
- **Runtime**: Full lambda evaluation support (already implemented)

The IR compiler and runtime layers already had complete lambda support. The only missing piece was the parser test, which was previously skipped and is now enabled and passing.

| Component | Tests | Status |
|-----------|-------|--------|
| **Lexer** | 58 | Comprehensive coverage of all token types |
| **Parser** | 79 | Comprehensive coverage of all AST node types |
| **IR Compiler** | 91 | Comprehensive coverage of AST→IR transformation |
| **Runtime Engine** | 56 | Comprehensive coverage of execution engine |

### Fixture Coverage

| Fixtures | Count | Status |
|----------|-------|--------|
| Baseline (01-20) | 20 | All passing |
| vNext (21-27) | 7 | All passing |
| Negative Tests (28-35) | 8 | All passing |
| **Total** | **35** | **100% passing** |

---

## File Structure Reference

```
src/manifest/
├── ir.ts                    # IR schema with vNext extensions
├── ir-cache.ts              # IR compilation cache
├── ir-compiler.ts           # AST to IR transformation
├── ir-compiler.test.ts      # IR Compiler unit tests (91 tests)
├── lexer.ts                 # Tokenization (includes vNext keywords)
├── lexer.test.ts            # Lexer unit tests (58 tests)
├── parser.ts                # Parse Manifest syntax to AST
├── parser.test.ts           # Parser unit tests (79 tests)
├── types.ts                 # AST node types
├── runtime-engine.ts        # Runtime execution engine
├── runtime-engine.happy.test.ts  # Runtime happy path test
├── runtime-engine.test.ts   # Runtime Engine unit tests (56 tests)
├── generator.ts             # TypeScript code generator
├── standalone-generator.ts  # Standalone bundle generator
├── stores.node.ts           # Server-side stores (Postgres, Supabase)
├── conformance/
│   ├── fixtures/            # 35 test fixtures (*.manifest)
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
└── vnext-migration-guide.md # Migration guide
```

---

## Code Quality Status

**TypeScript**: No typecheck errors
**ESLint**: No blocking errors
**Tests**: 427/427 passing (100% | 0 skipped)

Comprehensive search found:
- No TODO comments in implementation code
- No FIXME comments
- No STUB or PLACEHOLDER comments
- No skip/flaky tests
- No placeholder implementations
- All misleading comments resolved

---

## Next Steps

All planned vNext work is complete. Latest release: v0.3.7

### Completed (2026-02-06)

- **Lexer unit tests**: Complete (58 tests)
- **Parser unit tests**: Complete (79 tests)
- **IR Compiler unit tests**: Complete (91 tests, lambda expression test enabled and passing)
- **Runtime Engine unit tests**: Complete (56 tests)
- **Negative test fixtures**: Complete (8 fixtures)
- **Lambda expressions**: Fully implemented (parentheses syntax required)

### Optional Future Enhancements

- ~~Add ESLint rule to prevent hardcoded versions~~ **COMPLETED (2026-02-06)**
- ~~Git tag drift~~ **FIXED (2026-02-06)** - v0.3.7 tag moved from `eb1fd5f` to current HEAD (cebb697)
- Add performance benchmarks

### Technical Debt Resolved

- **Version Drift Fix**: Updated `runtime-engine.test.ts` to import and use `COMPILER_VERSION` from `version.ts` instead of hardcoded `'0.3.0'` strings. This ensures test expectations stay in sync with the actual compiler version.

---

## Change Log

### 2026-02-06: Version Synchronization (v0.3.7)

**Issue**: Git tag v0.3.7 existed but version.ts and package.json still showed 0.3.6.

**Fix**:
1. Updated version.ts COMPILER_VERSION from '0.3.6' to '0.3.7'
2. Updated package.json version from '0.3.6' to '0.3.7'
3. Regenerated conformance expected outputs to match new version

**Files Modified**:
- `src/manifest/version.ts`
- `package.json`
- `src/manifest/conformance/expected/*.ir.json` (all regenerated)

**Impact**: Version numbers now properly synchronized between code, package, and git tags.

### 2026-02-06: ESLint Rule for Hardcoded Versions

**Enhancement**: Added custom ESLint rule to prevent hardcoded version strings in source code.

**Details**:
- Created `eslint-rules/no-hardcoded-versions.js` with custom rule
- Configured to warn when semver-pattern strings (X.Y.Z) appear without importing from version.ts
- Excludes legitimate cases: version.ts (source of truth), zipExporter.ts (default versions), templates.ts (placeholders), test files, and conformance expected files

**Files Added**:
- `eslint-rules/no-hardcoded-versions.js`

**Files Modified**:
- `eslint.config.js`

**Result**:
- ESLint: PASS (no warnings)
- Helps prevent future version drift by enforcing imports from version.ts

### 2026-02-06: ESLint no-explicit-any Violations Fixed

**Issue**: Test files had ESLint `@typescript-eslint/no-explicit-any` violations that were preventing clean CI builds.

**Files Modified**:
- `src/manifest/parser.test.ts`: Replaced all `as any` casts with proper type imports (`BinaryOpNode`, `MemberAccessNode`, `CallNode`, `ConditionalNode`, `ArrayNode`, `ObjectNode`)
- `src/manifest/runtime-engine.test.ts`: Replaced `(data: any)` and `(i: any)` parameter types with `Partial<EntityInstance>` and `EntityInstance`

**Result**:
- TypeScript typecheck: PASS (no errors)
- ESLint: PASS (no errors)
- All tests: 427/427 PASS

### 2026-02-06: Version Drift Fix

**Issue**: Test file `runtime-engine.test.ts` had hardcoded `'0.3.0'` version strings that were out of sync with the current `COMPILER_VERSION` `'0.3.3'` in `version.ts`.

**Fix**: Modified test file to:
1. Import `COMPILER_VERSION` from `./version`
2. Replace all hardcoded version strings with `COMPILER_VERSION` constant

**Files Modified**:
- `src/manifest/runtime-engine.test.ts`

**Impact**: Tests now automatically track the correct version, preventing future version drift.

---

## Related Files

- vNext feature specification: docs/spec/manifest-vnext.md
- Migration guide: docs/migration/vnext-migration-guide.md
- Semantics documentation: docs/spec/semantics.md
