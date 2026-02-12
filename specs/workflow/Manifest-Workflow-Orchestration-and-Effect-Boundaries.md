# Spec Addendum: Manifest Workflow Orchestration and Effect Boundaries

## Title

Manifest vNext+ Addendum: Workflow Conventions, Explicit Effect Boundaries, and
Replay-Safe Determinism

## Status

Additive to `docs/spec/manifest-vnext.md`. This document does not replace IR v1
semantics; it constrains how workflow orchestration and effect handling are
modeled on top of current runtime behavior.

## Outcome

Manifest remains a deterministic domain runtime for commands, constraints,
policies, guards, and events, while formalizing:

- Workflow execution as a convention-first model.
- External effects as explicit boundaries.
- Determinism requirements for time/ID sources and replay inputs.

## Non-goals

- No general-purpose scheduler engine.
- No built-in saga/compensation runtime.
- No direct embedding of external side effects as inline DSL execution.

References:

- `docs/spec/manifest-vnext.md:20`
- `docs/spec/manifest-vnext.md:21`
- `docs/spec/manifest-vnext.md:23`

## Normative Baseline (Current Runtime)

### 1) Store Model Is Core-Agnostic

Manifest core is store-agnostic. IR supports store targets `memory`,
`localStorage`, `postgres`, and `supabase`; runtime also supports custom storage
via `storeProvider`.

Normative statements:

- `Prisma` is not a core runtime store target.
- Runtime core behavior is defined by IR store target + adapter/store provider,
  not ORM choice.
- `PostgresStore` and `SupabaseStore` are Node-side adapters; browser runtime
  defaults to memory/localStorage and throws for unsupported server-only
  targets.

References:

- `docs/spec/ir/ir-v1.schema.json:168`
- `src/manifest/runtime-engine.ts:85`
- `src/manifest/runtime-engine.ts:327`
- `src/manifest/runtime-engine.ts:338`
- `src/manifest/stores.node.ts:2`
- `src/manifest/stores.node.ts:36`
- `src/manifest/stores.node.ts:159`

Clarification:

- Prisma appears in projection/tooling documentation (for generated read
  routes), not as a core runtime storage contract.

References:

- `src/manifest/projections/nextjs/README.md:8`
- `src/manifest/projections/nextjs/README.md:235`

### 2) Transactional Outbox Is an Application Pattern

Manifest runtime does not provide a built-in transactional outbox subsystem.
Outbox is an application-level integration pattern that can be implemented in a
custom store or application service.

Normative statements:

- Core runtime actions `persist` / `publish` / `effect` are adapter hooks.
- Without adapters, default behavior is no-op that returns evaluated expression
  value.
- Outbox usage is optional and external to core runtime semantics.

References:

- `docs/spec/adapters.md:75`
- `docs/guides/transactional-outbox-pattern.md:3`
- `docs/spec/semantics.md:180`
- `src/manifest/runtime-engine.ts:1231`

### 3) Workflow Model Is Convention-First

Current workflow support is convention-first through entities, commands,
constraints, and events. Conformance fixtures already validate idempotent and
state-driven workflow patterns, but this is not a scheduler engine.

Normative statements:

- Workflow behavior today is expressed as command/state/event patterns.
- General scheduling/orchestration engine remains out of scope.
- Workflow evolution path is conformance-first, then optional metadata and
  syntax.

References:

- `docs/spec/manifest-vnext.md:14`
- `docs/spec/manifest-vnext.md:20`
- `docs/spec/manifest-vnext.md:64`
- `docs/spec/manifest-vnext.md:70`
- `src/manifest/conformance/fixtures/23-workflow-idempotency.manifest:1`
- `src/manifest/conformance/fixtures/27-vnext-integration.manifest:1`

### 4) Determinism Boundary Is Explicit

Determinism is guaranteed only when time/ID sources are injected (or otherwise
fixed) and nondeterministic outcomes are recorded as replay inputs.

Normative statements:

- `now()` and `uuid()` built-ins are runtime-provided and can be backed by
  injected functions.
- Conformance determinism depends on injected deterministic time/ID providers.
- Outside conformance, runtime may use ambient time/ID sources unless callers
  inject deterministic sources.
- Any nondeterministic external result must be captured as durable input
  (command input and/or recorded event payload) before deterministic state
  transition is applied.

References:

- `src/manifest/runtime-engine.ts:41`
- `src/manifest/runtime-engine.ts:42`
- `src/manifest/runtime-engine.ts:512`
- `src/manifest/runtime-engine.ts:519`
- `docs/spec/builtins.md:23`
- `docs/spec/builtins.md:28`
- `docs/spec/conformance.md:29`
- `docs/spec/conformance.md:31`
- `src/manifest/conformance/conformance.test.ts:18`
- `src/manifest/conformance/conformance.test.ts:21`
- `docs/spec/semantics.md:189`
- `src/manifest/runtime-engine.ts:902`

## Additive Specification

### A) Workflow Roadmap (Conformance + Metadata + Optional DSL Sugar)

Workflow progression SHALL remain:

1. Conformance-first enforcement of idempotent step/state/event conventions.
2. Optional IR metadata for workflow step identity and replay bookkeeping.
3. Optional DSL sugar that compiles to the same IR/runtime semantics.

This sequence MUST NOT introduce a general scheduler requirement in core
runtime.

References:

- `docs/spec/manifest-vnext.md:64`
- `docs/spec/manifest-vnext.md:70`
- `docs/spec/manifest-vnext.md:21`

### B) Effect Boundary Contract

Effects SHALL be treated as external interactions whose results are reintroduced
as recorded inputs.

Required pattern:

1. Deterministic command emits effect request event (or equivalent durable
   intent).
2. External worker performs nondeterministic operation.
3. Worker records result artifact/failure as input event.
4. Deterministic command consumes recorded input to mutate domain state.

This preserves existing semantics where runtime emits structured events from
command input and action result.

References:

- `docs/spec/manifest-vnext.md:23`
- `docs/spec/semantics.md:185`
- `docs/spec/semantics.md:189`
- `src/manifest/runtime-engine.ts:896`
- `src/manifest/runtime-engine.ts:902`
- `docs/guides/transactional-outbox-pattern.md:15`

### C) Deterministic Replay Requirements

For replay-safe orchestration:

- Use injected deterministic `now`/ID providers in deterministic runs.
- Persist nondeterministic outputs as explicit inputs before state mutation.
- Keep command semantics unchanged: policy -> command constraints -> guards ->
  actions -> emits.

References:

- `src/manifest/runtime-engine.ts:836`
- `src/manifest/runtime-engine.ts:848`
- `src/manifest/runtime-engine.ts:861`
- `src/manifest/runtime-engine.ts:884`
- `src/manifest/runtime-engine.ts:896`
- `docs/spec/semantics.md:126`
- `docs/spec/semantics.md:127`
- `docs/spec/semantics.md:133`

## Compatibility with Current Runtime

This addendum is compatible with the current implementation without requiring a
runtime rewrite.

- Store compatibility: already satisfied by IR targets + `storeProvider`.
- Effect compatibility: already satisfied by adapter-hook action model and event
  logging.
- Workflow compatibility: already satisfied by convention-first fixtures and
  command/state modeling.
- Determinism compatibility: already satisfied when callers inject `now`/ID
  providers and treat nondeterministic outputs as recorded inputs.

References:

- `docs/spec/ir/ir-v1.schema.json:168`
- `src/manifest/runtime-engine.ts:85`
- `docs/spec/adapters.md:84`
- `src/manifest/runtime-engine.ts:806`
- `src/manifest/conformance/fixtures/23-workflow-idempotency.manifest:1`
- `src/manifest/conformance/conformance.test.ts:18`

## Implementation Notes

- If future syntax is added, it MUST compile to existing IR semantics unless IR
  schema/version is intentionally advanced with spec + conformance updates.
- Any divergence MUST be documented as Nonconformance and resolved through spec
  -> fixtures -> implementation.

References:

- `docs/spec/README.md:60`
- `docs/spec/README.md:71`
- `docs/spec/conformance.md:54`
