# Manifest vNext Specification

Last updated: 2026-02-12
Status: Active
Authority: Binding
Enforced by: src/manifest/conformance/**, npm test

## Purpose

This document specifies vNext language and runtime features for Manifest: constraint outcomes, overrides, workflows, concurrency, state transitions, and runtime performance. It is a Tier A normative document per `docs/DOCUMENTATION_GOVERNANCE.md`.

All normative statements use RFC 2119 language (MUST, SHOULD, MAY). Advisory guidance is explicitly marked or lives in `docs/patterns/`.

## Scope

### In scope (normative)

- Constraint evaluation outcomes (ok / warn / block)
- Constraint code uniqueness and compiler diagnostics
- Override semantics and auditing
- Workflow metadata (correlationId, causationId, emitIndex)
- Idempotency store and command deduplication
- Effect boundary enforcement (deterministicMode)
- State transition validation
- Concurrency controls (versioning / ETags)
- Runtime API for override and workflow option supply
- Deterministic diagnostics and stable constraint codes
- Conformance fixtures for all implemented features

### In scope (advisory)

- Compilation caching strategies
- Evaluation performance recommendations
- Rollout patterns for adopting vNext features

### Out of scope

- General-purpose scheduler engine
- Automatic global optimization (routing / rostering)
- Embedding external side effects directly in DSL (effects remain via events and adapters)
- Workflow replay orchestration (event store, state reconstruction, causality validation). The runtime provides metadata primitives (correlationId, causationId, emitIndex, IdempotencyStore, deterministicMode); replay orchestration is the caller's responsibility.

---

## Language / IR Changes (Normative)

### Constraint Blocks

Constraints are boolean expressions that produce structured outcomes.

**IR requirements** (see `ir-v1.schema.json` > `IRConstraint`):

- Each constraint MUST have a `code` field (stable identifier for overrides and auditing).
- `code` defaults to the constraint `name` if not explicitly specified.
- Each constraint MUST have a `severity` field: `ok`, `warn`, or `block` (default: `block`).
- Constraints MAY include `messageTemplate` and `detailsMapping` for structured diagnostics.
- Constraints MAY be attached to entities or commands.

**Severity semantics** (normative, per `semantics.md`):

- `ok`: Informational only. Outcome is always `passed` regardless of expression result.
- `warn`: Produces a `ConstraintOutcome` with `passed` based on expression evaluation. Does NOT halt execution.
- `block`: Produces a `ConstraintOutcome` with `passed` based on expression evaluation. Halts execution on failure unless overridden.

**Constraint code uniqueness**:

- Within a single entity, constraint `code` values MUST be unique. The compiler MUST emit a diagnostic (error severity) if duplicate codes are detected on the same entity.
- Within a single command's `constraints` array, constraint `code` values MUST be unique. The compiler MUST emit a diagnostic if duplicates are detected.
- Conformance fixture: `39-duplicate-constraint-codes.manifest` (to be added).

### Override Mechanism

Overrides allow authorized bypass of `block` constraints.

**IR requirements** (see `ir-v1.schema.json` > `IRConstraint`):

- `overrideable: boolean` per constraint. Only constraints with `overrideable: true` MAY be overridden.
- `overridePolicyRef: string` (optional). References a policy with action `override` that authorizes the bypass.

**Runtime requirements** (normative, per `semantics.md`):

- Override attempts against constraints NOT marked `overrideable` MUST be rejected.
- If `overridePolicyRef` is specified, the referenced policy MUST be evaluated before authorizing the override.
- If the policy passes, the `ConstraintOutcome` MUST be marked with `overridden: true` and `overriddenBy` set to the authorizer.
- An `OverrideApplied` event MUST be emitted containing the override details.

### Result Shape Standardization

A conforming runtime MUST return a `CommandResult` that includes:

- `success: boolean`
- `error?: string`
- `emittedEvents: EmittedEvent[]`
- `constraintOutcomes?: ConstraintOutcome[]` (when constraints are present)
- `concurrencyConflict?: ConcurrencyConflict` (when concurrency controls are configured)
- Last action result value

See `ir-v1.schema.json` for `ConstraintOutcome`, `OverrideRequest`, and `ConcurrencyConflict` definitions.

### State Transitions

Entities MAY declare transition rules constraining allowed state changes.

**IR requirements** (see `ir-v1.schema.json` > `IRTransition`):

- Each `IRTransition` has: `property` (field name), `from` (current value), `to` (array of allowed new values).
- `transitions` is an optional array on `IREntity`.

**Runtime requirements** (normative, per `semantics.md` § "State Transitions (vNext)"):

- When a command mutates a property with transition rules, the runtime MUST find the rule matching the property's current value via `from`.
- If a matching rule exists and the new value is NOT in `to`, the command MUST fail with a descriptive error.
- If no matching rule exists for the current value, the transition is unconstrained from that state.
- Properties not referenced in any transition rule are unconstrained.
- Transition validation occurs BEFORE entity constraint validation.

**Conformance evidence**: Fixture `38-state-transitions.manifest` covers valid transitions, invalid transitions, and unconstrained property mutations.

---

## Runtime API (Normative)

This section specifies how callers supply runtime options to command execution, referencing the command execution flow defined in `semantics.md` § "Commands", steps 1-7.

### Command Execution Options

The `runCommand` method MUST accept an options object with these optional fields:

| Field | Type | Purpose |
|-------|------|---------|
| `entityName` | `string` | Target entity for the command |
| `instanceId` | `string` | Target entity instance ID |
| `overrideRequests` | `OverrideRequest[]` | Override requests for overrideable constraints |
| `correlationId` | `string` | Caller-supplied correlation ID for workflow event grouping |
| `causationId` | `string` | Caller-supplied ID linking this command to its trigger |
| `idempotencyKey` | `string` | Caller-supplied key for command deduplication |

All fields are optional. Zero breaking changes to existing callers.

### Override Supply and Evaluation

When `overrideRequests` are supplied:

1. The runtime evaluates command constraints per `semantics.md` § "Commands", step 3.
2. For each failing `block` constraint, the runtime checks if an `OverrideRequest` matches by `constraintCode`.
3. If matched and the constraint is `overrideable: true`:
   a. If `overridePolicyRef` is specified, the referenced policy MUST be evaluated.
   b. If the policy passes (or no policy is specified), the constraint outcome is marked `overridden: true`.
   c. An `OverrideApplied` event MUST be emitted with: `constraintCode`, `reason`, `authorizedBy`, `timestamp`.
4. If matched but the constraint is NOT `overrideable`, the override MUST be rejected and the constraint failure stands.

### OverrideApplied Event Shape

```
{
  name: "OverrideApplied",
  channel: "system",
  payload: {
    constraintCode: string,
    reason: string,
    authorizedBy: string,
    timestamp: number,
    commandName: string,
    entityName?: string,
    instanceId?: string
  }
}
```

This is a runtime-synthesized event, not an IR-declared event. It does not appear in the IR `events` array. It is included in `CommandResult.emittedEvents` alongside any command-declared events.

---

## Workflow Metadata (Normative)

Workflow metadata enables correlation and replay of events across multi-step command sequences. This section defines required runtime behavior.

### Event Workflow Metadata

Per `semantics.md` § "Event Workflow Metadata (vNext)":

- A conforming runtime MUST attach `emitIndex` (zero-based, per-command emission counter) to every `EmittedEvent`. The counter resets to 0 at the start of each `runCommand` invocation.
- If `correlationId` is provided in command options, the runtime MUST propagate it to all emitted events.
- If `causationId` is provided in command options, the runtime MUST propagate it to all emitted events.
- `emitIndex` is a per-command counter only. It is NOT a global sequence. Cross-command ordering is the caller's responsibility.

**Determinism guarantee**: Given identical IR + identical runtime context (including injected `now`/`generateId`) + identical input + identical options, emitted events MUST have identical `emitIndex` values.

### Idempotency

Per `semantics.md` § "Idempotency (vNext)" and `adapters.md` § "IdempotencyStore (vNext)":

- A conforming runtime MAY support an `IdempotencyStore` for command deduplication.
- When an `IdempotencyStore` is configured:
  - The runtime MUST require a caller-provided `idempotencyKey` in command options. If no key is provided, the runtime MUST return an error result.
  - If the key exists in the store, the runtime MUST return the cached `CommandResult` without re-executing the command.
  - Both successful and failed results MUST be cached.
  - The idempotency check occurs BEFORE any command evaluation (before building evaluation context, policy checks, constraints, guards, actions, or event emission).

### Effect Boundary Enforcement (deterministicMode)

Per `semantics.md` § "Deterministic Mode (vNext)" and `adapters.md` § "Deterministic Mode Exception (vNext)":

- When `RuntimeOptions.deterministicMode` is `true`, a conforming runtime MUST throw `ManifestEffectBoundaryError` for `persist`, `publish`, and `effect` action kinds.
- This replaces the default no-op behavior defined in `adapters.md` § "Default Behavior" (Action Adapters).
- `ManifestEffectBoundaryError` is a thrown error (not a `CommandResult` failure) because effect boundary violations are programming errors, not runtime domain failures.

---

## Concurrency Controls (Normative)

Per `semantics.md` § "Entity Concurrency (vNext)":

- Entities MAY define `versionProperty` (numeric field, auto-incremented on update) and `versionAtProperty` (timestamp field).
- When a command mutates an entity with concurrency controls, the runtime MUST compare the provided version against the stored version.
- If versions match, the mutation proceeds and the version is incremented.
- If versions differ, the runtime MUST return a `ConcurrencyConflict` (see `ir-v1.schema.json` > `ConcurrencyConflict`).
- Commands receiving a `ConcurrencyConflict` MUST NOT apply mutations.

---

## Provenance and IR Integrity

Provenance metadata is required on all compiled IR (see `ir-v1.schema.json` > `IRProvenance`).

**Required fields**: `contentHash`, `compilerVersion`, `schemaVersion`, `compiledAt`.

**Optional field**: `irHash` (SHA-256 of the IR itself).

**Provenance verification** (aligning `semantics.md`, `README.md`, and this document):

- Runtimes MAY verify IR integrity via `irHash` before execution (`docs/spec/README.md` § "Provenance is Mandatory").
- Production deployments SHOULD enable `requireValidProvenance` to ensure IR integrity (`docs/spec/README.md` § "Verification").
- A runtime MUST NOT silently execute IR with mismatched provenance when `requireValidProvenance` is enabled.
- Provenance checking is opt-in. A runtime that does not verify provenance is conforming, but callers lose integrity guarantees.

---

## Diagnostics (Normative)

### Failure Diagnostics

Every command failure MUST include sufficient information for the caller to identify the cause:

- Policy denial: policy name and evaluated expression.
- Guard failure: guard index and evaluated expression.
- Constraint failure: `ConstraintOutcome` with `code`, `severity`, `formatted`, `message`, `details`, and `resolved` values.
- Transition failure: property name, current value, attempted value, and allowed values.
- Concurrency conflict: `ConcurrencyConflict` with entity type, ID, expected and actual versions.

### Diagnostic Payload Bounding

- Diagnostic payloads SHOULD be bounded in size. Implementations MAY truncate `resolved` arrays or `details` mappings to prevent unbounded output.
- The bounding strategy is implementation-defined. Conformance tests do not enforce a specific size limit.

---

## Conformance Additions

### Implemented Fixtures

| Fixture | Feature | Status |
|---------|---------|--------|
| `36-constraint-severity.manifest` | Constraint severity (ok/warn/block) | Implemented |
| `37-allowed-duplicate-command-names.manifest` | Command name validation | Implemented |
| `38-state-transitions.manifest` | State transition validation | Implemented |

### Required Future Fixtures

| Fixture (proposed name) | Feature | Status |
|-------------------------|---------|--------|
| `39-duplicate-constraint-codes.manifest` | Compiler diagnostic on duplicate constraint codes within an entity | Not yet added |
| `52-override-allowed.manifest` | Override authorization with OverrideApplied event | Not yet added |
| `53-override-denied.manifest` | Override rejection for non-overrideable constraints | Not yet added |
| `54-concurrency-conflict.manifest` | Version mismatch returns ConcurrencyConflict | Not yet added |

Note: Workflow metadata (correlationId, causationId, emitIndex), deterministicMode, and idempotency features require runtime configuration options that cannot be expressed in `.manifest` source files. These features are tested via unit tests with explicit `RuntimeEngine` construction, not conformance fixtures.

---

## Nonconformance / Not Yet Enforced

This section lists vNext items that are declared in this specification but not yet enforced by conformance fixtures or implementation.

| Item | Spec Reference | Status | Notes |
|------|---------------|--------|-------|
| Bounded complexity limits | This document, "Diagnostics" | IMPLEMENTED | `EvaluationLimits` (maxExpressionDepth, maxEvaluationSteps) enforced via `RuntimeOptions.evaluationLimits`. Defaults: 64 depth, 10K steps. Budget tracked across all entry points (`runCommand`, `createInstance`, `updateInstance`, `checkConstraints`, `evaluateComputed`). 8 unit tests added. |
| Constraint code uniqueness diagnostic | This document, "Constraint Blocks" | NOT_IMPLEMENTED | Compiler does not yet emit a diagnostic for duplicate constraint codes. Fixture `39-duplicate-constraint-codes` to be added. |
| Override conformance fixtures | This document, "Override Mechanism" | NOT_IMPLEMENTED | Fixtures 52-53 not yet added. Runtime implementation exists but lacks fixture evidence. |
| Concurrency conflict fixture | This document, "Concurrency Controls" | NOT_IMPLEMENTED | Fixture 54 not yet added. Runtime implementation exists but lacks fixture evidence. |
| Provenance verification (`requireValidProvenance`) | This document, "Provenance and IR Integrity" | NOT_IMPLEMENTED | No runtime code enforces `requireValidProvenance`. The MUST NOT statement applies only when the option is enabled; the option itself does not yet exist. |
| Diagnostics completeness | This document, "Diagnostics" | PARTIAL | Guard index and policy name are tested. Transition failure details (property, current, attempted, allowed) and concurrency conflict details format are not explicitly unit-tested for completeness. |
| Performance guardrails | This document, "Diagnostics" | NOT_IMPLEMENTED | No instrumentation counters for step-count verification. Advisory only. |
| Compilation caching | This document, "Advisory Guidance" | ADVISORY | No normative requirement. See `docs/patterns/complex-workflows.md` for caching patterns. |

---

## Advisory Guidance

The following items are recommendations, not normative requirements. They are documented here for visibility but do not define required runtime behavior.

### Compilation Caching

- Implementations SHOULD compile `.manifest` sources to IR once per module version.
- Implementations SHOULD cache compiled IR keyed by `provenance.contentHash`.
- Implementations SHOULD reject execution if a cached IR's provenance does not match the expected source hash.

### Evaluation Performance

- Implementations SHOULD short-circuit policy and guard evaluation in deterministic order (first failure stops evaluation).
- Implementations SHOULD evaluate only constraints relevant to the invoked command.
- Implementations MAY memoize relationship traversal within a single command execution context.

### Workflow Patterns

For multi-step workflow patterns (saga orchestration, step replay, workflow state machines), see:

- `docs/patterns/complex-workflows.md` (advisory patterns for workflow entities)
- `CHANGELOG-workflow-framework.md` (implementation details for correlationId, causationId, emitIndex, idempotency)

These patterns are advisory conventions. The normative workflow requirements (event metadata, idempotency, effect boundaries) are defined above in "Workflow Metadata (Normative)".

**What the runtime does NOT do**: The runtime provides workflow *primitives* (correlationId, causationId, emitIndex, IdempotencyStore, deterministicMode) for callers to build replay, saga orchestration, and workflow state machines. The runtime does NOT include a replay engine, event store, state reconstruction, or causality validation — these are the caller's responsibility per the out-of-scope declaration above.

### Rollout Strategy

- Extend IR in a backward-compatible manner (no version bump required for vNext features added so far).
- Gate new semantics behind feature flags where appropriate.
- Migrate one domain slice first for validation before broad adoption.

---

## Cross-References

| Topic | Authoritative Document |
|-------|----------------------|
| IR shape (contract) | `docs/spec/ir/ir-v1.schema.json` |
| Runtime semantics | `docs/spec/semantics.md` |
| Built-in identifiers | `docs/spec/builtins.md` |
| Adapter hooks | `docs/spec/adapters.md` |
| Conformance rules | `docs/spec/conformance.md` |
| Documentation authority | `docs/DOCUMENTATION_GOVERNANCE.md` |
| Compliance tracking | `docs/COMPLIANCE_MATRIX.md` |
