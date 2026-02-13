# Manifest Compliance Matrix

Last updated: 2026-02-12
Status: Active
Authority: Advisory
Enforced by: None

This document maps implementation status to specification requirements across all Manifest specification areas.

## 1. IR Schema Compliance

| Status | Requirement | Spec Reference | Implementation Status | Code Reference | Notes |
|--------|-------------|----------------|---------------------|----------------|-------|
| [x] | IR version must be "1.0" | ir-v1.schema.json:18 | FULLY_IMPLEMENTED | src/manifest/ir.ts:15 | IR interface enforces version: '1.0' |
| [x] | Provenance metadata required | ir-v1.schema.json:52-59 | FULLY_IMPLEMENTED | src/manifest/ir.ts:1-12 | All provenance fields implemented |
| [x] | Content hash (SHA-256) | ir-v1.schema.json:54 | FULLY_IMPLEMENTED | src/manifest/ir.ts:3 | Content hash tracked |
| [x] | IR hash for integrity verification | ir-v1.schema.json:55 | FULLY_IMPLEMENTED | src/manifest/ir.ts:5 | IR hash supported with verification |
| [x] | Compiler version tracking | ir-v1.schema.json:56 | FULLY_IMPLEMENTED | src/manifest/ir.ts:7 | Compiler version included in provenance |
| [x] | Schema version tracking | ir-v1.schema.json:57 | FULLY_IMPLEMENTED | src/manifest/ir.ts:9 | Schema version included |
| [x] | ISO 8601 compilation timestamp | ir-v1.schema.json:58 | FULLY_IMPLEMENTED | src/manifest/ir.ts:11 | Timestamp included in provenance |
| [x] | Required top-level fields | ir-v1.schema.json:6-14 | FULLY_IMPLEMENTED | src/manifest/ir.ts:14-23 | All required fields present |
| [x] | Module structure | ir-v1.schema.json:64-72 | FULLY_IMPLEMENTED | src/manifest/ir.ts:26-33 | Full IRModule interface |
| [x] | Entity properties | ir-v1.schema.json:102-113 | FULLY_IMPLEMENTED | src/manifest/ir.ts:50-55 | IRProperty with all modifiers |
| [x] | Computed properties | ir-v1.schema.json:118-124 | FULLY_IMPLEMENTED | src/manifest/ir.ts:59-64 | IRComputedProperty with dependencies |
| [x] | Relationships | ir-v1.schema.json:129-136 | FULLY_IMPLEMENTED | src/manifest/ir.ts:66-72 | All relationship kinds supported |
| [x] | Constraints | ir-v1.schema.json:141-160 | FULLY_IMPLEMENTED | src/manifest/ir.ts:74-90 | Full IRConstraint with vNext features |
| [x] | Stores | ir-v1.schema.json:165-173 | FULLY_IMPLEMENTED | src/manifest/ir.ts:92-96 | IRStore with all targets |
| [x] | Events | ir-v1.schema.json:178-191 | FULLY_IMPLEMENTED | src/manifest/ir.ts:98-102 | IREvent with flexible payload |
| [x] | Commands | ir-v1.schema.json:203-217 | FULLY_IMPLEMENTED | src/manifest/ir.ts:110-121 | IRCommand with vNext features |
| [x] | Parameters | ir-v1.schema.json:219-228 | FULLY_IMPLEMENTED | src/manifest/ir.ts:123-128 | IRParameter with defaults |
| [x] | Actions | ir-v1.schema.json:230-252 | FULLY_IMPLEMENTED | src/manifest/ir.ts:130-134 | All action kinds supported |
| [x] | Policies | ir-v1.schema.json:254-265 | FULLY_IMPLEMENTED | src/manifest/ir.ts:136-143 | IRPolicy with all actions |
| [x] | Types | ir-v1.schema.json:267-275 | FULLY_IMPLEMENTED | src/manifest/ir.ts:145-149 | IRType with generics and nullability |
| [x] | Values | ir-v1.schema.json:277-335 | FULLY_IMPLEMENTED | src/manifest/ir.ts:151-157 | All IRValue kinds supported |
| [x] | Expressions | ir-v1.schema.json:337-448 | FULLY_IMPLEMENTED | src/manifest/ir.ts:159-169 | All IRExpression kinds supported |
| [x] | Constraint outcomes | ir-v1.schema.json:450-465 | FULLY_IMPLEMENTED | src/manifest/ir.ts:181-200 | Full ConstraintOutcome interface |
| [x] | Override requests | ir-v1.schema.json:467-476 | FULLY_IMPLEMENTED | src/manifest/ir.ts:201-205 | OverrideRequest interface |
| [x] | Concurrency conflicts | ir-v1.schema.json:478-489 | FULLY_IMPLEMENTED | src/manifest/ir.ts:207-213 | ConcurrencyConflict interface |
| [x] | Version property support | ir-v1.schema.json:95 | FULLY_IMPLEMENTED | src/manifest/ir.ts:45 | versionProperty implemented |
| [x] | Version at property support | ir-v1.schema.json:96 | FULLY_IMPLEMENTED | src/manifest/ir.ts:47 | versionAtProperty implemented |
| [x] | Constraint severity levels | ir-v1.schema.json:147-150 | FULLY_IMPLEMENTED | src/manifest/ir.ts:80 | 'ok', 'warn', 'block' supported |
| [x] | Override mechanism | ir-v1.schema.json:158-159 | FULLY_IMPLEMENTED | src/manifest/ir.ts:87-89 | overrideable and overridePolicyRef |
| [x] | Constraint details mapping | ir-v1.schema.json:153-157 | FULLY_IMPLEMENTED | src/manifest/ir.ts:85 | detailsMapping supported |

## 2. Semantics Compliance

| Status | Requirement | Spec Reference | Implementation Status | Code Reference | Notes |
|--------|-------------|----------------|---------------------|----------------|-------|
| [x] | Runtime model | semantics.md § "Runtime Model" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:35-38 | RuntimeContext interface |
| [x] | Self and this binding | semantics.md § "Properties" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:934 | Both bound to instance |
| [x] | User and context injection | semantics.md § "Runtime Model" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:936-937 | User and context provided |
| [x] | Property default application | semantics.md § "Properties" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:687-696 | Defaults applied correctly |
| [x] | Computed property dependencies | semantics.md § "Computed Properties" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:1441-1474 | Dependency tracking and cycle detection |
| [x] | Relationship resolution | semantics.md § "Relationships" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:396-497 | All relationship kinds supported |
| [x] | Entity concurrency | semantics.md § "Entity Concurrency (vNext)" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:747-769 | Version checking and incrementing |
| [x] | Constraint severity semantics | semantics.md § "Constraint Severity (vNext)" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:990-994 | Different severity levels respected |
| [x] | Constraint evaluation | semantics.md § "Constraint Evaluation (vNext)" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:1003-1026 | Full ConstraintOutcome generation |
| [x] | Policy checking | semantics.md § "Policies" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:948-980 | Execute/all policies enforced |
| [x] | Command execution order | semantics.md § "Commands", steps 1-7 | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:806-849 | Policies → constraints → guards → actions → emits |
| [x] | Command constraints | semantics.md § "Command Constraints (vNext)" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:847-849 | Command-level constraints evaluated after policies |
| [x] | Override mechanism | semantics.md § "Override Mechanism (vNext)" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:976-982 | Policy-based override authorization |
| [x] | Action semantics | semantics.md § "Actions" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:1201-1246 | All action kinds implemented |
| [x] | Event emission | semantics.md § "Events" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:1213-1225 | EmittedEvent with provenance |
| [x] | Expression evaluation | semantics.md § "Expressions" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:1248- | All operators supported with correct semantics |
| [x] | Binary operator semantics | semantics.md § "Expressions" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:1375- | ==, != with loose equality, in, contains |
| [ ] | Deterministic evaluation | semantics.md § "Deterministic Mode (vNext)" | PARTIALLY | N/A | Base is deterministic, but some optimization caching may affect edge cases |
| [x] | Diagnostics explanation | semantics.md § "Constraints" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:960-974 | Rich diagnostic information provided |

## 3. Builtins Compliance

| Status | Requirement | Spec Reference | Implementation Status | Code Reference | Notes |
|--------|-------------|----------------|---------------------|----------------|-------|
| [x] | Core identifiers | builtins.md § "Core Identifiers (Required)" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:931-938 | self, this, user, context |
| [x] | Core literals | builtins.md § "Core Literals (Required)" | FULLY_IMPLEMENTED | src/manifest/ir.ts:154 | true, false, null supported |
| [x] | now() function | builtins.md § "Standard Library (Required)" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:512,518 | Date.now() with custom override |
| [x] | uuid() function | builtins.md § "Standard Library (Required)" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:519 | crypto.randomUUID() with custom override |
| [x] | Runtime context injection | builtins.md § "Core Identifiers (Required)" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:936-937 | Built-ins injected by runtime |

## 4. Adapters Compliance

| Status | Requirement | Spec Reference | Implementation Status | Code Reference | Notes |
|--------|-------------|----------------|---------------------|----------------|-------|
| [x] | Memory store | adapters.md § "Storage Targets" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:165-203 | MemoryStore implementation |
| [x] | Local storage adapter | adapters.md § "Storage Targets" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:205-264 | LocalStorageStore implementation |
| [x] | PostgreSQL adapter | adapters.md § "Storage Targets" | FULLY_IMPLEMENTED | src/manifest/stores.node.ts:36-150 | PostgresStore implementation |
| [x] | Supabase adapter | adapters.md § "Storage Targets" | FULLY_IMPLEMENTED | src/manifest/stores.node.ts:151-234 | SupabaseStore implementation |
| [x] | Custom store provider | adapters.md § "Implementing Custom Adapters" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:85,314-320 | storeProvider hook implemented |
| [x] | Store interface | adapters.md § "Store Interface" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:156-163 | Full Store interface |
| [x] | Error handling for unsupported targets | adapters.md § "Diagnostics" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:339-357 | Clear errors thrown |
| [x] | Browser/server storage separation | adapters.md § "Diagnostics" | FULLY_IMPLEMENTED | src/manifest/stores.node.ts:1-6 | Node.js-only clearly documented |
| [x] | Default no-op behavior for actions | adapters.md § "Default Behavior" (Action Adapters) | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:1231-1234 | persist, publish, effect as no-ops |
| [x] | Action adapter hooks | adapters.md § "Action Adapters" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:1201-1246 | Action kinds with adapter support |

## 5. vNext Features Compliance

| Status | Requirement | Spec Reference | Implementation Status | Code Reference | Notes |
|--------|-------------|----------------|---------------------|----------------|-------|
| [x] | Constraint outcomes with severity | manifest-vnext.md § "Constraint Blocks" | FULLY_IMPLEMENTED | src/manifest/ir.ts:181-200, src/manifest/runtime-engine.ts:1003-1026 | Full ConstraintOutcome interface |
| [x] | Override mechanism | manifest-vnext.md § "Override Mechanism" | FULLY_IMPLEMENTED | src/manifest/ir.ts:87-89, src/manifest/runtime-engine.ts:976-982 | Policy-based overrides |
| [x] | Constraint codes | manifest-vnext.md § "Constraint Blocks" | FULLY_IMPLEMENTED | src/manifest/ir.ts:77 | Stable constraint identifiers |
| [x] | Message templates | manifest-vnext.md § "Constraint Blocks" | FULLY_IMPLEMENTED | src/manifest/ir.ts:82, src/manifest/runtime-engine.ts:1483-1525 | Template interpolation |
| [x] | Details mapping | manifest-vnext.md § "Constraint Blocks" | FULLY_IMPLEMENTED | src/manifest/ir.ts:85 | Structured details for UI |
| [x] | Command constraints | manifest-vnext.md § "Constraint Blocks" | FULLY_IMPLEMENTED | src/manifest/ir.ts:117, src/manifest/runtime-engine.ts:847-849 | Command-level constraints |
| [x] | Entity concurrency | manifest-vnext.md § "Concurrency Controls (Normative)" | FULLY_IMPLEMENTED | src/manifest/ir.ts:45-47, src/manifest/runtime-engine.ts:747-769 | Version checking and conflicts |
| [ ] | Performance optimizations | manifest-vnext.md § "Evaluation Performance" | PARTIALLY | src/manifest/runtime-engine.ts:292-295 | Relationship memoization cache |
| [x] | Bounded complexity | manifest-vnext.md § "Diagnostic Payload Bounding" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:206-231,376-398 | EvaluationLimits (maxExpressionDepth: 64, maxEvaluationSteps: 10K). Budget tracked across all entry points. 8 unit tests. |
| [x] | Result shape standardization | manifest-vnext.md § "Result Shape Standardization" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:97-111 | CommandResult with all fields |
| [x] | Event replay metadata | manifest-vnext.md § "Event Workflow Metadata" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:143-168 | EmittedEvent has correlationId, causationId, emitIndex |
| [x] | Workflow metadata | manifest-vnext.md § "Workflow Metadata (Normative)" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:850-860 | runCommand accepts correlationId, causationId, idempotencyKey |
| [x] | Idempotency requirements | manifest-vnext.md § "Idempotency" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:179-186,862-885 | IdempotencyStore interface + runCommand wrapper |

## 6. Workflow Addendum Compliance

| Status | Requirement | Spec Reference | Implementation Status | Code Reference | Notes |
|--------|-------------|----------------|---------------------|----------------|-------|
| [x] | Effect boundaries | adapters.md § "Deterministic Mode Exception (vNext)", semantics.md § "Deterministic Mode (vNext)" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:188-204,1260-1264 | ManifestEffectBoundaryError in deterministicMode |
| [x] | Determinism guarantees | semantics.md § "Deterministic Mode (vNext)" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:86-93 | deterministicMode option blocks all adapter actions |
| [x] | Replay safety | semantics.md § "Event Workflow Metadata (vNext)" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:143-168 | emitIndex determinism, correlationId/causationId propagation |
| [x] | Step idempotency | adapters.md § "IdempotencyStore (vNext)", semantics.md § "Idempotency (vNext)" | FULLY_IMPLEMENTED | src/manifest/runtime-engine.ts:179-186,862-885 | IdempotencyStore with full CommandResult caching |
| [x] | State transition validation | semantics.md § "State Transitions (vNext)" | FULLY_IMPLEMENTED | src/manifest/ir.ts:35-42,58, src/manifest/runtime-engine.ts:822-835 | IRTransition + runtime enforcement in updateInstance |

## 7. Conformance Test Coverage

| Status | Requirement | Spec Reference | Implementation Status | Code Reference | Notes |
|--------|-------------|----------------|---------------------|----------------|-------|
| [x] | Conformance test suite | conformance.md | FULLY_IMPLEMENTED | src/manifest/conformance/conformance.test.ts | 142 tests covering all features |
| [x] | Entity property tests | conformance.md | FULLY_IMPLEMENTED | fixtures/01-entity-properties.manifest | Basic property behavior |
| [x] | Relationship tests | conformance.md | FULLY_IMPLEMENTED | fixtures/02-relationships.manifest | All relationship kinds |
| [x] | Computed property tests | conformance.md | FULLY_IMPLEMENTED | fixtures/03-computed-properties.manifest | Dependencies and cycles |
| [x] | Command execution tests | conformance.md | FULLY_IMPLEMENTED | fixtures/04-command-mutate-emit.manifest | Actions and emits |
| [x] | Policy enforcement tests | conformance.md | FULLY_IMPLEMENTED | fixtures/06-policy-denial.manifest | Policy execution |
| [x] | Guard evaluation tests | conformance.md | FULLY_IMPLEMENTED | fixtures/05-guard-denial.manifest | Guard ordering and failures |
| [x] | Constraint outcomes tests | conformance.md | FULLY_IMPLEMENTED | fixtures/21-constraint-outcomes.manifest | Severity levels and outcomes |
| [x] | Override authorization tests | conformance.md | FULLY_IMPLEMENTED | fixtures/22-override-authorization.manifest | Policy-based overrides |
| [x] | Concurrency conflict tests | conformance.md | FULLY_IMPLEMENTED | fixtures/24-concurrency-conflict.manifest | Version detection |
| [x] | Command constraint tests | conformance.md | FULLY_IMPLEMENTED | fixtures/25-command-constraints.manifest | Pre-execution validation |
| [x] | Built-in function tests | conformance.md | FULLY_IMPLEMENTED | fixtures/16-builtin-functions.manifest | now() and uuid() |
| [x] | Event logging tests | conformance.md | FULLY_IMPLEMENTED | fixtures/15-event-log.manifest | Event emission and provenance |
| [ ] | Performance constraint tests | conformance.md | PARTIALLY | fixtures/26-performance-constraints.manifest | Basic performance tests |

## 8. Nonconformance Status

All documented nonconformances have been resolved:

- ~~Built-ins not implemented~~ - **RESOLVED**: now() and uuid() implemented in runtime-engine.ts:518-519
- ~~Storage target fallback without diagnostics~~ - **RESOLVED**: Clear errors thrown for unsupported targets
- ~~Actions as no-ops~~ - **CONFIRMED CORRECT**: Per spec, default behavior is no-op without adapters

## 9. Implementation Summary

### Fully Implemented Features (97%)

- All IR schema requirements
- All core semantics
- All built-in functions
- All storage adapters
- All vNext core features (constraints, overrides, concurrency)
- Workflow event metadata (correlationId, causationId, emitIndex)
- IdempotencyStore interface and runCommand wrapper
- Effect boundary enforcement (deterministicMode)
- State transition validation (IRTransition + runtime enforcement)
- Conformance test suite (482 tests)
- Bounded complexity limits (EvaluationLimits with depth/step enforcement)

### Partially Implemented Features (3%)

- Performance optimizations (basic caching)
- Deterministic evaluation (edge cases in optimization caching)

### Out of Scope Features

- Workflow replay engine — OUT_OF_SCOPE. Runtime provides replay primitives (correlationId, causationId, emitIndex, IdempotencyStore, deterministicMode). Replay orchestration is the caller's responsibility per manifest-vnext.md § "Workflow Patterns".

## 10. Recommendations

1. **Low Priority**: Enhance performance with more aggressive memoization
2. **Ongoing**: Maintain conformance test coverage as features evolve
