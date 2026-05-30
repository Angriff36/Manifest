---
session: 2026-05-20-capsule-pro-constitution-enforcement
project: "@angriff36/manifest"
project_root: C:/projects/manifest
head_at_save: 08d7f45
parent_at_session_start: d9ccfed
status: phases-1-5-done; phase-6-stage-1-done; phase-6-stage-2-deferred
tests_at_save: 815/815 passing
typecheck_at_save: clean
tags: [capsule-pro, constitution-enforcement, runtime-context, projections, registries, audit-suite, contracts]
---

# Capsule-Pro Constitution Enforcement — Session Handoff

> Save format: markdown with YAML frontmatter. Storage tier: project-local
> (`docs/context/`). Drop-in resumable: a fresh agent can read this file plus
> `docs/plans/2026-05-20-capsule-pro-constitution-enforcement.md` and pick up
> at Phase 6 stage 2 without re-deriving context.

## The Goal (verbatim, as set by the user)

> Add a typed runtime context: tenantId, orgId, actorId, requestId, source, deterministic/test flags.
> Add a nextjs.dispatcher projection that emits the canonical /api/manifest/[entity]/commands/[command]/route.ts.
> Emit machine-readable command and governed-entity registries from compiled IR.
> Add a bypass registry schema plus CLI validator.
> Expand audit-routes into a constitution audit suite: direct writes, event fabrication, route drift, missing tests, bypass violations.
> Add durable runtime audit/outbox contracts after the dispatcher/registry/audit basics are stable.

## Outcome

All six goal items landed. 24 atomic commits on `main` (22 in this session + 2 pre-existing dist artifacts). Tests: 757 baseline → **815 passing** (+58 across 9 new test files). Typecheck clean throughout. Lint clean on every file I touched (pre-existing 237 errors in `tools/` are unrelated and predate the session).

## Quick Resume Recipe

```bash
cd C:/projects/manifest
git log --oneline c7df744^..HEAD   # 22 session commits
npm test                            # confirm 815 still green
cat docs/capsule-pro/gap-matrix.md  # status per constitution clause
cat tasks/todo.md                   # phase-level checklist
cat docs/plans/2026-05-20-capsule-pro-constitution-enforcement.md  # full plan
```

## Phase Status

| Phase | Title | Commits | Status |
|---|---|---|---|
| 0 | Spec alignment (constitution mirror + gap matrix) | 2 | ✅ |
| 1 | Typed RuntimeContext + `requireTenantContext` fail-closed | 4 | ✅ |
| 2 | `nextjs.dispatcher` surface + DEPRECATED ALIAS for legacy command routes | 3 | ✅ |
| 3 | IR-derived `commands.json` + `entities.json` registries (CLI: `manifest emit registries`) | 4 | ✅ |
| 4 | Bypass registry schema + `manifest audit-bypasses` validator | 2 | ✅ |
| 5 | `manifest audit-constitution` umbrella (5 detectors) | 2 | ✅ |
| 6 stage 1 | AuditSink + OutboxStore **contracts** wired into RuntimeOptions | 2 | ✅ |
| 6 stage 2 | Concrete adapters (Memory/Postgres) + runtime emission lifecycle | 0 | ⏸ Deferred |

## Key Architectural Decisions

1. **Type widening, not type breaking.** `RuntimeContext` kept its `[key: string]: unknown` index signature so every existing test (including conformance fixtures) passes unchanged. Typed fields layer on top.
2. **Schema validation lives in the CLI, not the IR core.** Avoids pulling Ajv into `src/manifest/`. The CLI walks up from `import.meta.url` to find shipped `docs/spec/registry/*.schema.json` files. Schemas are added to `package.json#files` so installs work.
3. **`requireTenantContext` is opt-in, runs before idempotency.** Failure to provide `tenantId` returns `MISSING_TENANT_CONTEXT` *before* idempotency cache reads/writes, so caller can fix tenant context and retry under the same key without seeing a cached failure.
4. **`context.deterministic` honored alongside `options.deterministicMode`.** Options wins when both set (explicit caller intent). Source order: `options.deterministicMode ?? context.deterministic ?? false`.
5. **Module-level commands surfaced under `__unowned__` sentinel.** IR shape allows commands without an owning entity; the registry classifies these as `infrastructure` so they don't pollute the governed-entity inventory.
6. **Dispatcher uses route-param destructuring, not hardcoded entity/command names.** A single dynamic `[entity]/commands/[command]/route.ts` resolves both at request time, so the file is 100% generic and the test enforces "no entity/command literals in the generated code".
7. **Phase 6 split into stages.** The user's goal text said "after the basics are stable" — interpreted as "contracts now, runtime emission later". The contracts (`AuditSink`, `OutboxStore`) ship today as typed interfaces so capsule-pro can build adapters against a stable surface.

## Files Created This Session

### Source
- `src/manifest/registry/emit.ts` + `emit.test.ts` — pure-data emitter, 9 tests
- `src/manifest/runtime-context.test.ts` — type-level assertions, 4 tests
- `src/manifest/runtime-deterministic-context.test.ts` — 3 tests
- `src/manifest/runtime-tenant-required.test.ts` — 4 tests
- `src/manifest/projections/nextjs/dispatcher.test.ts` — 10 tests (covers both `nextjs.dispatcher` and `nextjs.command` deprecation banner)
- `src/manifest/audit/audit-sink.ts` + `audit-sink.test.ts` — contract, 2 tests
- `src/manifest/outbox/outbox-store.ts` + `outbox-store.test.ts` — contract, 2 tests

### CLI
- `packages/cli/src/commands/emit-registries.ts` + test — 5 tests
- `packages/cli/src/commands/audit-bypasses.ts` + test — 8 tests
- `packages/cli/src/commands/audit-constitution.ts` + test — 12 tests
- `packages/cli/src/audit/types.ts` — shared `AuditFinding`/`Detector`
- `packages/cli/src/audit/direct-writes.ts`
- `packages/cli/src/audit/event-fabrication.ts`
- `packages/cli/src/audit/route-drift.ts`
- `packages/cli/src/audit/missing-tests.ts`
- `packages/cli/src/audit/bypass-violations.ts`

### Spec & docs
- `docs/capsule-pro/constitution.md` (mirror of upstream)
- `docs/capsule-pro/gap-matrix.md` (status tracker)
- `docs/spec/registry/README.md`
- `docs/spec/registry/commands.schema.json`
- `docs/spec/registry/entities.schema.json`
- `docs/spec/registry/bypasses.schema.json`
- `docs/plans/2026-05-20-capsule-pro-constitution-enforcement.md` (the plan)
- `tasks/todo.md` (phase-level tracker)

### Files Modified
- `src/manifest/runtime-engine.ts` — `RuntimeContext` typed fields, deterministic source order, `requireTenantContext`, optional `auditSink`/`outboxStore` in `RuntimeOptions`
- `src/manifest/projections/nextjs/generator.ts` — `nextjs.dispatcher` surface + DEPRECATED ALIAS banner on `nextjs.command`
- `docs/spec/semantics.md` — Capsule-Pro Constitution Reference + Runtime Context Schema sections
- `docs/spec/builtins.md` — Context Member Access section
- `docs/spec/adapters.md` — Canonical Dispatcher + Audit Sink + Outbox Store contract sections
- `packages/cli/src/index.ts` — wired 3 new commands (`emit registries`, `audit-bypasses`, `audit-constitution`)
- `package.json` — added `./registry/emit` subpath export; added registry schemas to `files`
- `vitest.config.ts` — added alias for `@angriff36/manifest/registry/emit`

## Cli Surface (now available to consumers)

```bash
# Inventory the IR
manifest emit registries --source app.manifest --out ./manifest-registry/
manifest emit registries --ir compiled.ir.json --out ./manifest-registry/

# Validate the bypass list
manifest audit-bypasses --registry ./bypasses.json --strict-expiry --format json

# Run the full constitution audit
manifest audit-constitution \
  --root . \
  --commands-registry ./manifest-registry/commands.json \
  --bypass-registry ./bypasses.json \
  --strict \
  --format json

# Select a subset of detectors
manifest audit-constitution --only direct-writes,event-fabrication
```

Detector finding codes (stable, for CI exemption mapping):
- `DIRECT_WRITE` — `prisma.X.create/update/delete/upsert/*Many` outside runtime
- `EVENT_FABRICATION_PUBLISH` / `EVENT_FABRICATION_CTOR` / `EVENT_FABRICATION_EMIT_LITERAL`
- `ROUTE_DRIFT` — concrete command route calls `runCommand` without DEPRECATED ALIAS banner
- `MISSING_CONFORMANCE_TEST`, `MISSING_TESTS_NO_REGISTRY`, `MISSING_TESTS_REGISTRY_UNREADABLE`
- `BYPASS_VIOLATION`, `STALE_BYPASS`, `BYPASS_VIOLATIONS_NO_REGISTRY`, `BYPASS_VIOLATIONS_REGISTRY_UNREADABLE`
- (audit-bypasses): `BYPASS_REGISTRY_MISSING`, `BYPASS_REGISTRY_NOT_FOUND`, `BYPASS_REGISTRY_NOT_JSON`, `BYPASS_SCHEMA_INVALID`, `BYPASS_PATH_MISSING`, `BYPASS_REVIEW_OVERDUE`

## What Phase 6 Stage 2 Needs

These are pre-thought out — drop in and execute:

1. `src/manifest/audit/sinks/memory.ts` — `MemoryAuditSink` for tests (`emit` pushes to an in-memory array; idempotent against `recordId`).
2. `src/manifest/outbox/stores/memory.ts` — `MemoryOutboxStore` for tests (claim/markDelivered/markFailed all in-memory).
3. `src/manifest/stores.node.ts` — extend with `PostgresAuditSink` and `PostgresOutboxStore`. Reuse the existing pg client patterns. Outbox enqueue takes a transaction; the runtime opens one around mutate+publish actions.
4. **Runtime lifecycle hook**: in `RuntimeEngine.runCommand` (or `_executeCommandInternal`), after the success/failure branch, build an `AuditRecord` from the context + result and call `this.options.auditSink?.emit(record)`. The outcome enum is already exhaustive (`success | guard_denied | policy_denied | constraint_failed | concurrency_conflict | missing_tenant_context | error`).
5. **Outbox integration**: when emitting events on a successful command and an `OutboxStore` is wired, enqueue an `OutboxEntry` per `EmittedEvent` inside the same Prisma transaction as the persist action. This is the load-bearing change for §11 durability.
6. New tests: integration tests with `MemoryAuditSink` + `MemoryOutboxStore` asserting emission on every outcome class.
7. CI gate: extend `audit-constitution` with an `outbox-required` detector that flags commands emitting events without an outbox configured (warn-by-default, error-by-strict).

## Constraints to Remember

- `npm test` must stay ≥815 green (was 757 before this session; 58 new tests added).
- `npm run typecheck` must stay clean.
- **No `2>&1`** on Windows bash — creates spurious `nul` files (a `nul` was already in the repo before this session; I avoided creating new ones).
- Conformance fixtures are *executable semantics*; don't modify them, only add new ones.
- IR-first: spec changes in `docs/spec/**` *before* code (followed throughout this session).
- House style: explicit > inference; deterministic > convenient; no auto-repair; diagnostics explain, never compensate.
- Commit cadence: one committable unit per task; no `git add -A`; explicit file lists only.

## Open Pre-Existing Issues (Not Mine, Worth Knowing)

- `tools/manifest-ir-test-harnessv2/` and `tools/stress-simulator/` have 237 lint errors. Not from this work. Per the user's CLAUDE.md: "improve the codebase over time" — candidate cleanup but not blocking.
- `nul` file exists at repo root from a prior `2>&1` mistake. Already in `git status` as untracked; harmless.
- `dist/` artifacts and `package.json` were already modified in the working tree at session start. I never staged them.

## Constitution Coverage After This Session

`docs/capsule-pro/gap-matrix.md` is the live source of truth, but in summary: ✅ on §1, §3, §4, §5, §6, §8, §9, §10, §13, §14, §17, §19, §20. ◐ on §11 and §12 (contracts shipped, runtime emission deferred). §18 (RLS wiring) was never in scope of this goal.

## Resume Pointer

Next agent: read `docs/plans/2026-05-20-capsule-pro-constitution-enforcement.md` § "Phase 6 — Durable Audit + Outbox Contracts (SKETCH — DEFERRED)" plus the "What Phase 6 Stage 2 Needs" section above, then start with the `MemoryAuditSink` test-driven and work outward.
