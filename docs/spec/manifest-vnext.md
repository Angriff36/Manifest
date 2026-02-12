# Spec 2: Manifest Runtime and Language Enhancements for Ops-Scale Rules, Overrides, and Performance

Authority: Binding
Enforced by: src/manifest/conformance/**
Last updated: 2026-02-11

Authority: Binding
Enforced by: src/manifest/conformance/**
Last updated: 2026-02-11

## Title
Manifest vNext: Constraint Outcomes, Overrides, Workflows, and Runtime Performance

## Outcome
Manifest can express and enforce real operational rules with soft/hard constraints, structured overrides, multi-step workflows, concurrency safety, and predictable performance. It provides consistent diagnostics and prevents business-logic sprawl.

## Scope

### In scope
- Constraint evaluation outcomes (OK / WARN / BLOCK)
- Override semantics and auditing
- Workflow conventions (idempotency, step replay)
- Concurrency controls (versioning / ETags)
- Deterministic diagnostics and stable constraint codes
- Runtime caching and guard/policy evaluation optimization
- Conformance fixtures extended to cover new semantics

### Out of scope
- General-purpose scheduler engine
- Automatic global optimization (routing / rostering)
- Embedding external side effects directly in DSL (effects remain via events)

## Language / IR Changes

### Constraint blocks (concept)
Add a way to declare constraints that return outcomes.

**Requirements**
- Constraints have stable identifiers (codes)
- Constraints produce: severity, message, details
- Constraints can be attached to commands (pre-execution evaluation)

**IR additions**
- `constraints[]` on command nodes
- Each constraint node includes:
  - `code`
  - `expression`
  - `severity`
  - `messageTemplate`
  - `detailsMapping`

### Override mechanism
Add an override payload that can be passed to command execution.

**Runtime requirements**
- Overrides apply only to constraints explicitly marked overrideable
- Overrides are matched by constraint code
- Overrides require authorization checks (policy-driven)

**IR additions**
- `overrideable: boolean` per constraint
- `overridePolicyRef: policyId` (optional)

### Result shape standardization
Ensure runtime always returns a structured result that includes:
- Constraint outcomes
- Override requirements
- Ordered failures (policy / guard)
- Emitted events
- Entity version information

### Workflow conventions
Introduce a recommended pattern (spec-level convention) for workflow entities:
- Step commands are idempotent
- Workflow state is explicit
- Step events include replay metadata

This is convention-first, enforced via conformance tests before introducing heavy syntax.

## Runtime Enhancements

### A) Compilation and caching
- Compile specs to IR once per module version
- Cache keyed by provenance hash
- Runtime rejects execution if provenance mismatch

### B) Evaluation performance
- Short-circuit policies/guards in deterministic order
- Evaluate only constraints relevant to the invoked command
- Memoize relationship traversal within a single command execution context

### C) Concurrency and correctness
- Optional version checks for entity mutation
- If stale version is provided, return conflict with diagnostic and current version

### D) Diagnostics
- Every failure includes:
  - IR location
  - Code
  - Formatted expression
  - Resolved values
- Constraint outcomes include structured UI-safe details
- Diagnostic payload size must be bounded

## Conformance Additions

### New fixture categories
- Constraint severity: OK / WARN / BLOCK
- Override allowed / denied with audit event emitted
- Workflow idempotency (repeated step does not duplicate side effects)
- Concurrency conflicts (stale version rejected deterministically)
- Performance guardrails:
  - Commands with N constraints execute within expected step counts
  - Measured via instrumentation counters, not wall-clock timing

## Non-Functional Requirements
- Backwards compatibility: existing specs work unchanged
- Determinism: conformance runs produce identical results across environments
- Bounded complexity: enforce max constraints/guards per command unless explicitly overridden

## Rollout Strategy
- Introduce IR version bump only if required
- Otherwise extend IR in a backward-compatible manner
- Gate new semantics behind feature flags
- Migrate one domain slice first (PrepTask + Inventory reserve/consume)

## How This Saves Work and Stops Spaghetti
- Centralizes rules: fewer duplicated checks and divergent behaviors
- Standardizes failures: no custom error shapes per route
- Enables safe exceptions: overrides are uniform and auditable
- Makes refactors survivable: behavior lives in specs + fixtures, not scattered code



