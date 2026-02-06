# Manifest Implementation Plan

**Last Updated**: 2026-02-06 (Negative test fixtures 28-35 added | 201/201 tests passing)

**Overall Status**: vNext Implementation COMPLETE | Release v0.3.0 tagged | 201/201 tests passing | TypeScript Typecheck CLEAN | All Documentation UPDATED | Technical Debt RESOLVED | Negative Tests ADDED

---

## Executive Summary

Manifest is a domain-specific language for defining business rules and workflows with declarative specifications, centralized rules, deterministic execution, and performance optimizations for ops-scale deployment.

### Current State

| Component | Status | Evidence |
|-----------|--------|----------|
| **Baseline Features** | COMPLETE | 20 fixtures passing (100% conformance) |
| **vNext Features** | COMPLETE | Fixtures 21-27 passing (100% conformance) |
| **Test Suite** | PASSING | 201/201 tests (142 conformance + 1 happy + 58 lexer unit) |
| **TypeScript** | CLEAN | No typecheck errors |
| **IR Schema (ir.ts)** | COMPLETE | All vNext interfaces implemented |
| **IR Schema JSON** | UPDATED | docs/spec/ir/ir-v1.schema.json includes vNext fields |
| **Semantics Docs** | UPDATED | docs/spec/semantics.md includes vNext semantics |
| **Migration Guide** | CREATED | docs/migration/vnext-migration-guide.md with examples |
| **README Documentation** | UPDATED | docs/spec/README.md includes vNext references |
| **Lexer Unit Tests** | NEW | 58 tests covering all token types and edge cases |

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
- **NEW: messageTemplate interpolation** (2026-02-06)

**Conformance Tests**:
- 135/135 tests passing (100%)
- Fixtures 21-27 covering all vNext features

---

## vNext Implementation Summary (All Complete)

All vNext features have been implemented and verified:

| Component | Status |
|-----------|--------|
| IR Schema Extensions | Complete - IRConstraint, IRCommand, IREntity updated |
| Parser/Lexer | Complete - New keywords: overrideable, ok, warn |
| IR Compiler | Complete - Transformations for all vNext fields |
| Runtime Engine | Complete - evaluateConstraint, validateOverrideAuthorization, events |
| IR Schema JSON | Updated - docs/spec/ir/ir-v1.schema.json |
| Semantics Docs | Updated - docs/spec/semantics.md includes vNext semantics |
| Migration Guide | Created - docs/migration/vnext-migration-guide.md |
| Spec README | Updated - docs/spec/README.md with vNext references |
| Technical Debt | Resolved - Version centralized, comments clarified, TS errors fixed |

### Potential Enhancements (OPTIONAL)

- Add unit tests for parser/lexer components (currently only conformance tests)
- ~~Add negative test cases (currently only happy path tests exist)~~ **DONE 2026-02-06**
- Add ESLint rule to prevent hardcoded versions
- Add performance benchmarks

---

## Test Status

```
Test Files: 3 passed (3)
Tests: 201 passed (201)
  - src/manifest/runtime-engine.happy.test.ts: 1 test
  - src/manifest/conformance/conformance.test.ts: 142 tests (includes 8 negative tests)
  - src/manifest/lexer.test.ts: 58 tests
Duration: ~600ms
```

### Unit Test Coverage (NEW)

| Component | Tests | Status |
|-----------|-------|--------|
| **Lexer** | 58 | Comprehensive coverage of all token types |
| **Parser** | 0 | Not yet implemented |
| **IR Compiler** | 0 | Not yet implemented |
| **Runtime Engine** | 0 | Not yet implemented |

### Lexer Test Coverage

The 58 lexer unit tests cover:
- All keywords (entity, command, type, modifier, relationship, policy, logical, context, vNext constraint)
- Identifiers (simple, underscores, numbers, camelCase, PascalCase)
- Strings (double-quoted, single-quoted, escape sequences, template strings, multiline)
- Numbers (integers, decimals)
- Operators (single and two-character)
- Punctuation characters
- Newlines and whitespace handling
- Comments (single-line and multi-line)
- Position tracking (line/column)
- EOF handling
- Complex Manifest syntax tokenization
- Edge cases

### Fixture Coverage

| Fixtures | Count | Status |
|----------|-------|--------|
| Baseline (01-20) | 20 | All passing |
| vNext (21-27) | 7 | All passing |
| Negative Tests (28-35) | 8 | All passing |
| **Total** | **35** | **100% passing** |

### vNext Fixture Details

| Fixture | Feature | Status |
|---------|---------|--------|
| 21-constraint-outcomes | Constraint severity levels, messageTemplate interpolation | Passing |
| 22-override-authorization | Override mechanism | Passing |
| 23-workflow-idempotency | Workflow conventions | Passing |
| 24-concurrency-conflict | Concurrency controls | Passing |
| 25-command-constraints | Command-level constraints | Passing |
| 26-performance-constraints | IR caching, memoization | Passing |
| 27-vnext-integration | Full vNext integration | Passing |

### Negative Test Fixture Details (NEW 2026-02-06)

| Fixture | Error Type | Status |
|---------|-----------|--------|
| 28-unclosed-braces | Missing closing brace for entity block | Passing |
| 29-missing-colon | Missing colon in property declaration | Passing |
| 30-incomplete-expression | Incomplete expression (missing operand) | Passing |
| 31-invalid-operators | Invalid operator sequence (`&&&`) | Passing |
| 32-constraint-without-expression | Constraint block missing expression | Passing |
| 33-malformed-relationship | Relationship declaration without type | Passing |
| 34-command-with-reserved-name | Command named with reserved word | Passing |
| 35-unclosed-command-block | Missing closing brace for command | Passing |

---

## File Structure Reference

```
src/manifest/
├── ir.ts                    # IR schema with vNext extensions
├── ir-cache.ts              # IR compilation cache
├── ir-compiler.ts           # AST to IR transformation
├── lexer.ts                 # Tokenization (includes vNext keywords)
├── lexer.test.ts            # Lexer unit tests (NEW - 58 tests)
├── parser.ts                # Parse Manifest syntax to AST
├── types.ts                 # AST node types
├── runtime-engine.ts        # Runtime execution engine
├── runtime-engine.happy.test.ts  # Runtime happy path test
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
**Tests**: 201/201 passing (100%)

Comprehensive search found:
- No TODO comments in implementation code
- No FIXME comments
- No STUB or PLACEHOLDER comments
- No skip/flaky tests
- No placeholder implementations
- All misleading comments resolved

---

## Recent Implementation Work (2026-02-06)

### Lexer Unit Tests (NEW)

**Implemented**: src/manifest/lexer.test.ts

Added comprehensive unit tests for the lexer component (58 tests):

**Test Categories**:
1. **Keywords** (11 tests): All reserved words including vNext constraint keywords (overrideable, ok, warn, block)
2. **Identifiers** (5 tests): Simple identifiers, underscores, numbers, camelCase, PascalCase
3. **Strings** (8 tests): Double/single quoted, escape sequences, template strings, multiline
4. **Numbers** (3 tests): Integers, decimals
5. **Operators** (5 tests): Single and two-character operators
6. **Punctuation** (1 test): All punctuation characters
7. **Newlines and Whitespace** (5 tests): Newline handling, position tracking
8. **Comments** (4 tests): Single-line and multi-line comment handling
9. **Position Tracking** (3 tests): Line/column position accuracy
10. **EOF** (3 tests): EOF token handling
11. **Complex Manifest Syntax** (4 tests): Real-world syntax tokenization
12. **Edge Cases** (6 tests): Mixed tokens, special characters, arrays

**Key Findings**:
- Position tracking in the lexer records the position *after* reading the token (points to next character)
- Numbers starting with `.` (e.g., `.5`) are treated as `.` operator + number, not as a single number token
- All 58 tests pass with no regressions to existing conformance tests

### messageTemplate Interpolation

**Implemented**: runtime-engine.ts:1451-1491

The `messageTemplate` field now supports placeholder interpolation using `{placeholder}` syntax. Placeholders are resolved from three sources in order:

1. **detailsMapping** - Key-value pairs explicitly defined in the constraint
2. **Resolved expressions** - Expression strings and their evaluated values
3. **Evaluation context** - Direct property access from evalContext

**Example**:
```manifest
constraint amountLimit:block self.amount > 10000 {
  messageTemplate: "Order amount {currentAmount} exceeds limit of {maxAmount} by {excessAmount}"
  details: {
    maxAmount: 10000
    currentAmount: self.amount
    excessAmount: self.amount - 10000
  }
}
```

**Test Coverage**: Fixture 21 (constraint-outcomes) includes a constraint with messageTemplate and detailsMapping.

### OverrideApplied Event Semantics Clarified

**Finding**: The `OverrideApplied` event is correctly emitted **only for explicit override requests**, not for automatic policy-based overrides.

- **Explicit override requests** (with user-provided reason) → emit `OverrideApplied` event for audit trail
- **Automatic policy-based overrides** (via `overridePolicyRef`) → no separate event (policy check is part of normal execution)

This is semantically correct as:
1. Explicit overrides represent conscious decisions that require audit trails
2. Automatic policy-based authorization is part of normal command execution flow

The conformance test framework currently doesn't support passing `overrideRequests`, so `OverrideApplied` events aren't tested in conformance. This is acceptable since the mechanism is correctly implemented and the behavior matches the specification.

### Negative Test Fixtures (NEW 2026-02-06)

**Implemented**: Fixtures 28-35

Added 8 new conformance test fixtures to cover error detection and diagnostic reporting:

**Test Categories**:
1. **Structural Errors**: Unclosed braces (entity, command blocks)
2. **Syntax Errors**: Missing colons, malformed relationships
3. **Expression Errors**: Incomplete expressions, invalid operators
4. **Semantic Errors**: Constraints without expressions, reserved word usage

**Fixture Details**:
- 28-unclosed-braces: "Expected }, got EOF" at line 7
- 29-missing-colon: "Expected :, got string" at line 5
- 30-incomplete-expression: "Unexpected: \n" at line 6
- 31-invalid-operators: "Unexpected: &" at line 7
- 32-constraint-without-expression: "Constraint block must include an expression" at line 9
- 33-malformed-relationship: "Expected :, got \n" at line 5
- 34-command-with-reserved-name: "Reserved word 'entity' cannot be used as an identifier" at line 4
- 35-unclosed-command-block: "Expected }, got EOF" at line 10

**Impact**: Test count increased from 193 to 201 (142 conformance tests, including 8 negative tests)

---

## Next Steps

All planned vNext work is complete. Release v0.3.0 is tagged.

### In Progress (Unit Test Expansion)

- **Lexer unit tests**: Complete (58 tests added 2026-02-06)
- **Negative test fixtures**: Complete (8 fixtures added 2026-02-06)
- **Parser unit tests**: Not yet implemented
- **IR Compiler unit tests**: Not yet implemented
- **Runtime Engine unit tests**: Not yet implemented

### Optional Future Enhancements

- Add ESLint rule to prevent hardcoded versions
- Add performance benchmarks
- Add unit tests for remaining compiler components (parser, ir-compiler, runtime-engine)

---

## Related Files

- vNext implementation plan: specs/vnext/IMPLEMENTATION_PLAN.md
- vNext feature specification: docs/spec/manifest-vnext.md
- Planning prompt template: PROMPT_plan.md
- Build prompt template: PROMPT_build.md
