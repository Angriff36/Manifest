# Manifest Documentation Index

> **Canonical reading order for humans and Context7 ingestion.**
>
> Last updated: 2026-05-20
> Status: Active
> Authority: Advisory (this file routes; it does not define semantics)
> Applies to: `@angriff36/manifest@0.5.0+`

## What Manifest is

Manifest is a deterministic, IR-first domain-specific language (DSL) for
business rules and workflows.

- You write Manifest source (`.manifest`).
- The compiler produces IR — the Intermediate Representation.
- The runtime (`RuntimeEngine`) executes IR.
- Conformance tests prove compiler/runtime behavior matches spec.

The IR (`docs/spec/ir/ir-v1.schema.json`) is the single source of truth.
Generated TypeScript/routes are derivative views, not authority.

## Authority levels in this repo

| Tier | Location | Meaning |
|---|---|---|
| **Binding** | `docs/spec/` | Normative language law. Changes here require conformance test updates. |
| **Advisory** | `docs/patterns/`, `docs/tools/`, `docs/contracts/` | How-to guidance. Does NOT define semantics. |
| **Non-authoritative** | `docs/integrations/`, `docs/migration/` | Downstream examples / version-jump guides. |
| **Historical** | `docs/archive/`, `docs/context/`, `docs/plans/`, `docs/proposals/`, `docs/notes/` | Snapshots, drafts, design history. Read for context, not as truth. |

## Canonical reading order

### 1. Start here

- [`docs/QUICKSTART.md`](./QUICKSTART.md) — get a manifest running in five minutes
- [`docs/ARCHITECTURE_AND_POSITIONING.md`](./ARCHITECTURE_AND_POSITIONING.md) — what Manifest is and is NOT
- [`docs/FAQ.md`](./FAQ.md) — common questions

### 2. Language semantics (Binding)

Read in this order; each builds on the last:

1. [`docs/spec/README.md`](./spec/README.md) — spec entrypoint
2. [`docs/spec/ir/ir-v1.schema.json`](./spec/ir/ir-v1.schema.json) — the authoritative IR schema
3. [`docs/spec/semantics.md`](./spec/semantics.md) — runtime meaning of IR nodes
4. [`docs/spec/builtins.md`](./spec/builtins.md) — built-in identifiers and functions
5. [`docs/spec/adapters.md`](./spec/adapters.md) — adapter hooks (audit, outbox, stores, dispatcher)
6. [`docs/spec/conformance.md`](./spec/conformance.md) — conformance test rules
7. [`docs/spec/manifest-vnext.md`](./spec/manifest-vnext.md) — vNext features (constraint outcomes, overrides, workflows)
8. [`docs/spec/registry/README.md`](./spec/registry/README.md) — registry schemas (commands, governed entities, bypasses)
9. [`docs/spec/project-layout.md`](./spec/project-layout.md) — **where files go** in consumer apps (`.manifest`, IR, codegen, registries)

### 3. Integration patterns (Advisory)

How to embed Manifest in your app. None of these define language semantics.

- [`docs/patterns/usage-patterns.md`](./patterns/usage-patterns.md) — decision guide: projections vs embedded runtime
- [`docs/patterns/embedded-runtime-pattern.md`](./patterns/embedded-runtime-pattern.md) — direct `RuntimeEngine` integration
- [`docs/patterns/external-integration-checklist.md`](./patterns/external-integration-checklist.md) — generic adoption checklist for downstream apps
- [`docs/patterns/event-wiring.md`](./patterns/event-wiring.md) — connect emitted events to infrastructure
- [`docs/patterns/complex-workflows.md`](./patterns/complex-workflows.md) — multi-step business processes
- [`docs/patterns/hybrid-integration.md`](./patterns/hybrid-integration.md) — projections + embedded runtime together
- [`docs/patterns/multi-tenancy.md`](./patterns/multi-tenancy.md) — tenant isolation and `requireTenantContext`
- [`docs/patterns/implementing-custom-stores.md`](./patterns/implementing-custom-stores.md) — `Store` interface for ORM adapters
- [`docs/patterns/transactional-outbox-pattern.md`](./patterns/transactional-outbox-pattern.md) — outbox semantics (note: runtime-managed transactional outbox remains **deferred** — see `docs/spec/adapters.md` § "Transactional Limitation")
- [`docs/patterns/external-projections.md`](./patterns/external-projections.md) — writing your own projection
- [`docs/patterns/primitives-reference.md`](./patterns/primitives-reference.md) — language primitives at a glance

### 4. CLI and tooling (Advisory)

- [`docs/tools/README.md`](./tools/README.md) — tooling overview
- [`docs/tools/CLI_REFERENCE.md`](./tools/CLI_REFERENCE.md) — every command with options
- [`docs/tools/integration-check.md`](./tools/integration-check.md) — the umbrella validation command
- [`docs/tools/API_REFERENCE.md`](./tools/API_REFERENCE.md) — programmatic surface
- [`docs/tools/COMPILE_REFERENCE.md`](./tools/COMPILE_REFERENCE.md) — compiler internals
- [`docs/tools/USAGE_GUIDE.md`](./tools/USAGE_GUIDE.md) — task-oriented walkthroughs
- [`docs/tools/PACKAGES_AND_DISTRIBUTION.md`](./tools/PACKAGES_AND_DISTRIBUTION.md) — package shape and distribution
- [`docs/tools/PUBLISHING.md`](./tools/PUBLISHING.md) — release process

### 5. Contracts (Advisory signpost)

- [`docs/contracts/README.md`](./contracts/README.md) — note: this folder is a signpost only; canonical contracts live in `docs/spec/`
- [`docs/contracts/deployment-boundaries.md`](./contracts/deployment-boundaries.md) — what is and is not language semantics
- [`docs/contracts/house-style.md`](./contracts/house-style.md) — language design principles

### 6. Migration (Non-authoritative)

- [`docs/migration/vnext-migration-guide.md`](./migration/vnext-migration-guide.md) — adopting vNext features
- [`docs/migration/v0.3.8.md`](./migration/v0.3.8.md) — earlier version-jump notes

### 7. Downstream integration examples (Non-authoritative)

- [`docs/integrations/README.md`](./integrations/README.md) — how this folder works
- [`docs/integrations/capsule-pro/`](./integrations/capsule-pro/) — example downstream consumer (Capsule-Pro). **Non-authoritative**; included to demonstrate the public-surface contract.

### 8. Governance and contributor rules

- [`docs/DOCUMENTATION_GOVERNANCE.md`](./DOCUMENTATION_GOVERNANCE.md) — doc authority tiers, edit rules, mandatory-vs-temporary test policy
- [`docs/REPO_GUARDRAILS.md`](./REPO_GUARDRAILS.md) — high-risk-change checklist
- [`docs/MANIFEST_PROJECT_SCAFFOLDING.md`](./MANIFEST_PROJECT_SCAFFOLDING.md) — repo structure walkthrough

### 9. Diagnostics and audits

- [`docs/COMPLIANCE_MATRIX.md`](./COMPLIANCE_MATRIX.md) — feature-by-feature implementation status
- [`docs/DETERMINISM_AUDIT.md`](./DETERMINISM_AUDIT.md) — determinism guarantees and gaps
- [`docs/CONFORMANCE_EXPANSION_PLAN.md`](./CONFORMANCE_EXPANSION_PLAN.md) — planned conformance coverage
- [`docs/TROUBLESHOOTING.md`](./TROUBLESHOOTING.md) — common problems

### 10. Historical / deferred work

Read for context only. None of these are current authority.

- [`docs/context/`](./context/) — session handoff snapshots (dated)
- [`docs/plans/`](./plans/) — active or recently completed implementation plans
- [`docs/proposals/`](./proposals/) — drafts and design proposals
- [`docs/notes/`](./notes/) — observations and scratch notes
- [`docs/archive/`](./archive/) — pre-IR design history and legacy UI specs
- [`docs/DOCUMENTATION_IMPROVEMENTS_2026-02-12.md`](./DOCUMENTATION_IMPROVEMENTS_2026-02-12.md) — historical doc cleanup record

## Enforcement boundaries: what Manifest actually guarantees

A frequent source of confusion is which guarantees are statically enforced,
which are runtime-enforced, which are contract-only, and which are deferred.
This table is the current truth:

| Guarantee | Where it lives | Enforced |
|---|---|---|
| IR schema validity | `docs/spec/ir/ir-v1.schema.json` | **Statically** — `manifest validate`, `manifest check` |
| Policy / guard / constraint semantics | `docs/spec/semantics.md` | **At runtime** — `RuntimeEngine.runCommand` |
| Deterministic mode | `docs/spec/adapters.md § Deterministic Mode` | **At runtime** — `ManifestEffectBoundaryError` |
| `requireTenantContext` fail-closed | `docs/spec/semantics.md § Runtime Context` | **At runtime** — `MISSING_TENANT_CONTEXT` outcome |
| `AuditSink.emit` exactly-once per command | `docs/spec/adapters.md § Audit Sink` | **At runtime** — `b296e1a` onward; fail-open on sink errors |
| `OutboxStore.enqueue` per emitted-event command | `docs/spec/adapters.md § Outbox Store` | **At runtime** — non-transactional w.r.t. mutation (see below) |
| Canonical dispatcher route presence | — | **Statically** — `manifest integration-check § dispatcher` |
| Direct-writes / route-drift / event-fabrication detection | `manifest audit-governance` | **Statically** — CI gate |
| Bypass registry schema + path existence | `docs/spec/registry/bypasses.schema.json` | **Statically** — `manifest audit-bypasses` |
| Subpath imports / tarball shape | `package.json` `exports` + `files` | **Statically** — `manifest integration-check § package-shape` |
| **Transactional outbox** (mutation + enqueue atomicity) | — | **Deferred** — `docs/spec/adapters.md § Transactional Limitation`. Adapters honor a caller-supplied `tx`, but `RuntimeEngine` does not open one for you. |
| **Live Postgres adapter integration tests** | `src/manifest/{audit,outbox}/.../postgres.live.test.ts` | **Env-gated** — set `MANIFEST_POSTGRES_TEST_URL` to enable |
| **Row-level security policies** | `src/manifest/audit/sinks/postgres.sql` (commented template) | **Deferred** — uncomment + adapt to consumer's tenant strategy |

## For Context7

The intended ingestion path is:

1. Root [`README.md`](../README.md) (project overview, getting started)
2. This file (`docs/README.md`) (canonical hierarchy)
3. The `docs/spec/` tree (normative semantics) in the order listed in section 2 above
4. The `docs/tools/` and `docs/patterns/` trees (how to consume the language)

Skip on ingest:

- `docs/archive/` (pre-IR design history)
- `docs/context/` (session handoffs — out of date by construction)
- `docs/integrations/capsule-pro/` (specific downstream example — adds noise to general queries)
- `docs/plans/` (work-in-progress)
- `docs/proposals/` (drafts)
- `docs/notes/` (scratch)

## Change rules

If you are changing language meaning:

1. Update `docs/spec/**` first.
2. Update conformance fixtures/tests.
3. Update implementation.
4. Keep `npm test`, `npm run typecheck`, and `npm run lint` green.

See `docs/DOCUMENTATION_GOVERNANCE.md` for the full policy.
