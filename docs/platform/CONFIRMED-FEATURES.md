---
title: Manifest Confirmed Features
created: 2026-07-14
updated: 2026-07-15
source_of_truth: true
source_of_truth_for: 'Inventory of which Manifest features verifiably exist (wired + tested)'
authority: Advisory
must_reconcile_to:
  - docs/platform/FEATURE_MATRIX.md
  - docs/spec/ir/ir-v1.schema.json
  - docs/spec/semantics.md
  - docs/SOURCE_OF_TRUTH_INDEX.md
verified_against: 'main (package.json SoT; see §7 for published npm version). Entries marked unreleased mean built-in-repo but not published as their own package — re-check §7 / package.json before treating as installable.'
note: 'Feature completion (done vs open) is governed by COMPLIANCE_MATRIX — that matrix wins disputes. Semantics follow the Tier A spec chain.'
---

# Manifest Confirmed Features (verified 2026-07-14 on `main`; package.json version drifts — see §7)

This document lists what Manifest **actually does today**, verified against source
code, registration points, and tests on `main` — not against docs, roadmaps, or
`.automaker` status files. ~~Anything dated 2026-07-14 and marked **unreleased**
landed on `main` after the v3.5.0 tag and is not installable from npm until the
next release.~~
**Update (2026-07-15):** npm and `package.json` have moved past v3.5.0 (see §7).
Treat FEATURE-LIST as a **generated registry inventory** only
(`pnpm docs:feature-list`) — existence/registration, not completion.
Completion SoT: `docs/platform/FEATURE_MATRIX.md`.
~~Treat FEATURE-LIST “unreleased” labels as historical only. Use this file + Gaps
for what exists vs phantoms. It supersedes the verification status of
`docs/FEATURE-LIST.md` (a 2026-06-02 roadmap snapshot).~~

**Verification bar:** a feature is listed only if (1) implementation source
exists, (2) it is wired/registered/exported, and (3) tests cover it. Items that
fail the bar appear in "Verified Limitations & Gaps" at the end. This document
is AI-generated (per repo doc policy: no `@RYANSIGNED` mark) but every claim
carries file evidence checked on 2026-07-14.

---

## 1. Language (DSL) Features

All verified via `docs/spec/ir/ir-v1.schema.json` + `src/manifest/ir-compiler.ts`

- a dedicated conformance fixture in `src/manifest/conformance/fixtures/`
  (99 fixtures — executable semantics, not just tests).

**Entities & data model**

- Entities with typed properties; defaults; `optional`/`unique` and other modifiers
- `extends` / `mixin` inheritance & composition, with cycle detection (fixtures 77–79, 81)
- ~~Generic / parameterized entities, with arity-mismatch diagnostics (fixtures 84–85)~~
  - **Correction (2026-07-15):** generics are still **not implemented**. Fixtures 84–85 are
    _negative_ tests (`shouldFail: true`, message `Expected {, got <`) — they pin the parse
    rejection, they do not prove `entity X<T>` works. Appendix D still correctly lists
    `generic-entity-types` as phantom.
- Value objects / embedded types (fixture 60)
- Enum types (fixture 57); decimal/money type (fixture 56); map/record type (fixture 73)
- Date/time primitive types (fixture 92)
- Composite primary keys (`key`), `alternateKeys`
- Relationships: `hasMany` / `hasOne` / `belongsTo` / `ref` (fixtures 98–99), composite FKs, referential actions (`onDelete`/`onUpdate` **enforced by the reference runtime** as of 2026-07-15 — see `runtime-referential-actions.test.ts`), **many-to-many via `hasMany … through Join`** (fixture 102; Join must belongsTo both ends; runtime two-hop)
- Automatic timestamps / `autoNow` defaults — `= now()` / `= today()` (fixture 62)
- Property privacy & protection modifiers: `private`, `encrypted`, `masked` (fixtures 91, 93)
- Full-text `searchable` declarations (fixture 89)
- Multi-tenancy isolation (fixture 61); optimistic concurrency via `versionProperty` (fixture 24)

**Behavior**

- Commands with params, guards (strict in-order, halt-on-first-falsey), mutations, emits, `emitPayloads`, modifiers
- Async/background commands with completion/failure events (fixture 69)
- Command `retry` policy (fixture 72); `rateLimit` on commands and policies (fixtures 74, 75, 100)
- Computed properties incl. caching/memoization strategies (fixtures 03, 65)
- Constraints with severity `ok`/`warn`/`block`, explicit `failWhen` polarity (fixtures 105–106), override authorization (fixture 22)
- Policies: read/write/delete/execute/all/override
- State machines: `transitions` with runtime enforcement (fixture 38)
- Aggregate `count()` expressions, usable in reactions (fixture 97)

**Orchestration & integration**

- Events + declarative reactions (`on Event run Command`), incl. 1:N fan-out (fixture 96)
- Sagas with compensation/abort (fixture 88)
- Multi-stage approval workflows with timeouts (fixture 68) — `onTimeout: cancel` only (see Gaps)
- Roles/RBAC with hierarchy, inheritance, and deny rules (fixture 71)
- Inbound webhooks with HMAC signature verification (fixture 90)
- Schedules: cron / interval / every (fixture 76)
- Stores (persistence targets), modules (namespacing), cross-file `use`/imports

## 2. Expression Language — 47 built-ins

Single registry: `RuntimeEngine.getBuiltins()` (`src/manifest/runtime-engine.ts`);
spec: `docs/spec/builtins.md` (corrected 2026-07-14).

- Core: `now`, `uuid`
- String: `trim`, `split`, `count`, `startsWith`, `endsWith`, `replace`, `toUpperCase`, `toLowerCase`, `length`, `substring`, `indexOf`, `matches`, `search`
- Math: `abs`, `round`, `floor`, `ceil`, `min`, `max`, `between`
- Array/aggregate: `sum`, `avg`, `min_of`, `max_of`, `count_of`, `filter`, `map`
- Date (UTC, epoch-ms, null-safe where noted): `year`, `month`, `day`, `hours`, `minutes`, `seconds`, `dateOf`, `timeOf`, `datetimeOf`, `addDuration`, `durationBetween`, `durationDays`, `durationHours`, `durationMinutes`, `durationSeconds`
- Feature flags: `flag(name)` via `RuntimeOptions.flagProvider` **or** static
  `RuntimeOptions.flags` map (2026-07-15); provider wins when both are set.
  Missing flags → `false`.
- Roles: `hasPermission(action, target?)`, `roleAllows(roleName, action, target?)` — role names are **case-sensitive**
- Custom builtins via plugin API (`RuntimeOptions.customBuiltins`); core names cannot be overridden

`today()` is compile-time only (lowered to the `autoNow` flag); it is not a runtime callable.

## 3. Runtime Engine (`src/manifest/runtime-engine.ts`)

- ~~Fixed execution order: policies → guards → actions → emits → return~~
  - ~~**Correction (2026-07-15):** policies → **command constraints** → guards → actions → emits → return (see `docs/spec/semantics.md`)~~
  - **Correction (2026-07-15) @RYANSIGNED:** Full order in `docs/spec/semantics.md` § Commands: build context → **command `rateLimit`** → policies (policy-level rateLimit) → **command constraints** → guards → actions → emits → return. Policies are not command-body clauses.
- `RuntimeContext`: `tenantId` / `orgId` / `actorId` / `requestId` / `source` / `deterministic`
- Middleware pipeline with 4 hooks: before-policy, before-guard, before-action, after-emit
- Compile diagnostics may carry optional machine-readable `IRDiagnostic.code`
  (2026-07-15; seeded on behavior / `through` / approval-escalate unsupported)
- Batched persistence: per-command working-copy buffer, one flush, atomic-on-failure (`runtime-command-batched-persistence.test.ts`)
- Pluggable `EncryptionProvider`; feature-flag provider; deterministic mode
- EventBus (`src/manifest/events/event-bus`, `runtime-eventbus.test.ts`)
- ~~Scoped WASM expression-compatibility layer (`isWasmCompatible()`)~~ **Removed 2026-07-15:** no `.wasm` artifact ever shipped; TypeScript evaluator is the only path. Constraint polarity remains via `constraint-polarity.ts` (`failWhen` + severity) in RuntimeEngine.

## 4. Stores & Persistence Subsystems

- Entity stores: memory, localStorage (browser-safe), postgres, supabase (`stores.node.ts`), Turso/libSQL, DynamoDB, Prisma-generic (`stores/prisma-generic/store.ts`) — each test-backed
- Transactional outbox with memory/postgres/redis/mongodb/dynamodb adapters (`src/manifest/outbox/stores/*`)
- Approval store: memory/postgres (`src/manifest/approval/stores/*`)
- Idempotency store: memory/postgres (`src/manifest/idempotency/stores/*`)
- Custom store adapters registrable via plugin API

## 5. Projections — 29 registered

Single registration point `registerBuiltinProjections()` in
`src/manifest/projections/builtins.ts`; every projection folder is registered
(zero dead folders, zero unregistered projections):

nextjs, routes, prisma, prisma-store, convex, openapi, react-query, zod,
drizzle, graphql, llm-context, express, hono, mermaid, jsonschema, storybook,
health, materialized-views, elasticsearch, terraform, analytics, remix,
sveltekit, kysely, dynamodb, pydantic, dart, wiring, contract-tests.

Highlights:

- **Convex** (`src/manifest/projections/convex/`): schema/queries/mutations/crons/http/sagas/`convex.computed`/`convex.react`; companions `wiring`, `llm-context`, `mermaid`, `zod`, `contract-tests`; `authContextImport`; transition enforcement; private-field stripping; capability map with `CONVEX_UNSUPPORTED_*`; assembly gate `verifyConvexApplicationAssembly`
- **contract-tests**: Vitest suites asserting Convex query/mutation export names match IR (list/get when `clientReadable` per `resolveConvexReadVisibility` + optional `authContextImport`; skips true `internalQuery` surfaces; does not assert `listBy*` or behavior)
- **Next.js**: full command surface incl. `createManifestRuntime` emission, executionMode dispatcher (`dispatcher-modes.test.ts`), field-aware soft-delete/timestamp reads
- **Prisma**: multi-schema (`@@schema` from modules), opt-in snake_case/pluralize naming, autoBackRelations, composite-unique/optional-FK/cycle correctness — natively generates capsule-pro's 199-model schema

## 6. CLI (`packages/cli`, runs from src via jiti)

~50 registered commands/groups in `packages/cli/src/index.ts` (61 test files under `packages/`):

- **Compile & generate**: `compile [--all]`, `generate [--all] [--check]`, `build [--all]`, `watch [--all]`, `validate`, `fmt`, `init`, `init-ci`
- **Surface governance**: `enforce-surface` (7 spec finding codes, `--strict`, `--write-receiver`; registry-driven guard against bypass write paths), `audit-governance` (alias `audit-constitution`), `audit-routes`, `audit-bypasses`, `lint-routes`, `routes`, `emit registries`
- **Wiring & inspection**: `wiring-coverage`, `wiring-inspect`, `wiring-remediate`, `inspect entity`, `coverage`, `duplicates`, `runtime-check`, `integration-check`, `check`, `preflight`, `scan`, `doctor`, `cache-status`
- **Diff & versions**: `diff` (source-vs-ir / ir-vs-ir / breaking), `migrate`, `changelog`, `versions` (list/show/save/diff/changelog/tag/rollback/verify)
- **AI/LLM**: `generate-from-prompt`, `gen-tests` / `generate-tests`, `validate-ai`
- **Dev & testing**: `repl`, `mock`, `harness`, `load-test`, `profile`, `seed` (template/fill/validate), `analyze`, `diagram`, `docs`, `pack`/`unpack`, `install-hooks`, `config` (validate/print-defaults/inspect), `plugins list`

Note: breaking-change detection and IR diff exist as `diff breaking` / `diff ir-vs-ir` subcommands, not top-level commands.

## 7. Packages & Distribution

- ~~**Published**: `@angriff36/manifest` v3.6.0 on npmjs.org~~
  - ~~**Published (corrected 2026-07-15):** `@angriff36/manifest` **v3.6.3** on npmjs.org~~
  - **Published (corrected 2026-07-15):** `@angriff36/manifest` **v3.6.4** on npmjs.org (OIDC trusted publishing via the one-button `cut-release.yml` workflow); `package.json` is the version SoT
- **Platform API for Builder (2026-07-14, shipped in v3.6.0):** `@angriff36/manifest/language-metadata` → `getLanguageMetadata()` — keywords/operators from lexer, modifiers from `property-modifiers.ts` / IR schema, builtins from `RuntimeEngine.getBuiltins()`, date/time primitives from `date-time.ts`. Keyword/operator/modifier/builtin lists are derived (no second registry); the categorized construct lists are curated subsets, lexer-asserted and drift-tested against parser source.
- **Projection capabilities API (2026-07-14, shipped in v3.6.0):** `@angriff36/manifest/projections` → `getProjectionCapabilities(name)` + optional `ProjectionTarget.capabilities` (`feature` + `supported`/`partial`/`unsupported` + `note`). Convex declares its full matrix; projections without a declared matrix return `undefined` (undeclared ≠ unsupported).
- **Projection descriptor API (2026-07-14, shipped in v3.6.1):** `@angriff36/manifest/projections` → `describeProjection` / `listProjectionDescriptors` / `validateProjectionInvocation` + `ProjectionDescriptor`. Scope, options, prerequisites, artifacts, deps, companions; `safelyInvokable` distinguishes registered vs safely invokable. Meta lives beside each projection (`descriptorMeta`); parity-tested against the registry. Spec: `docs/spec/projection-descriptors.md`.
- **Convex application assembly proofs (2026-07-14, shipping in v3.6.2):** `convex.react`; zod↔convex companions; `@angriff36/manifest/seed-pack` Convex binding; `contract-tests` projection; `verifyConvexApplicationAssembly`.
- **In-repo, tested, NOT published** (see Gaps): `@manifest/mcp-server` 0.1.0 (tools: compile/execute/explain/validate), `@manifest/lsp-server` 0.1.0 (completion/definition/diagnostics/document-symbols/hover), `@manifest/stdlib` 0.1.0, `manifest-lang` VS Code extension 0.3.0 (marketplace status unverified)

## 8. Config System

- JSON schema: `docs/spec/config/manifest.config.schema.json` (+ Prisma projection schema)
- `src/manifest/config.ts` wired to `manifest config validate/print-defaults/inspect`
- `executionMode` dispatcher is a **Next.js-projection** setting, not a global runtime concept
- config-vNext: G0+G1+G5+G2(`failOn`)+G10(`ci-gate`) shipped; G2 rule
  registries still open
  ~~G5/G2/G10 still unbuilt (stated in `config.ts` comments)~~
  **Correction (2026-07-15):** G5 shipped.
  **Update (2026-07-15):** G2 `validation.failOn` shipped.
  **Update (2026-07-15):** G10 `driftGates` / `manifest ci-gate` shipped.

## 9. Testing & Release Infrastructure

- 234 test files (173 under `src/`, 61 under `packages/`); ~3,973 passing + 21 skipped as of the 2026-07-14 SDK wave (counts drift — run `pnpm test` for current)
- 99 conformance fixtures with expected IR/diagnostics/results — executable semantics
- 4 benchmark files; coverage floors + dependency-cycle check in CI
- Docs integrity gate in CI (`pnpm run docs:check` via `.github/workflows/ci.yml`):
  Manifest fences compile (`fragment` forbidden); TypeScript fences transpile
  (or `fragment`/`invalid`); entity-first `runCommand` linted; internal links
  resolve including `#anchors`; page skeleton enforced on guide pages; metadata
  - spec headers enforced
- One-button release: `cut-release.yml` (build+typecheck+test gate → version bump → npm publish via OIDC → tag → GitHub Release)

---

## Verified Limitations & Gaps (as of 2026-07-14)

**Unimplemented today (loud compile errors, tested — still open gaps in `docs/TODO.md`):**

- ~~`through` (many-to-many join) — IR field exists; compiler rejects…~~
  - **Update (2026-07-15):** `hasMany … through Join` is supported when Join
    declares belongsTo/ref to both ends; runtime two-hop navigation; Prisma/Drizzle
    wire the join entity. Fixture `102-through-join`. ForeignKey+through still
    exclusive (101).
- ~~Approval `onTimeout: escalate` — schema allows only `cancel`; compiler rejects with `APPROVAL_ONTIMEOUT_ESCALATE_UNSUPPORTED` (fixture 103). Escalation semantics still need a spec-first design if shipped.~~
  - **Update (2026-07-15):** Open author-defined escalate shipped:
    `on_timeout: escalate { to: <expr>, status: …, timeout: … }`. Target is an
    expression (opaque routing — not a closed person/department/stage enum).
    Bare `escalate` still fails (`APPROVAL_ONTIMEOUT_ESCALATE_INCOMPLETE`,
    fixture 103). Success: fixture `111-approval-escalate`.

**IR fields not consumed by the reference runtime** (per the reconciled
2026-07-06 wiring matrix — ~50 rows still open; see `docs/TODO.md`):
`optional` modifier, `alternateKeys`,
~~referential actions (DB-only)~~ **Update (2026-07-15):** runtime now enforces
`onDelete`/`onUpdate` on `deleteInstance`/`updateInstance`,
entity-level constraint overrides, `command.returns` (projection-only),
lambda expressions in the Convex projection, `ir.tenant` in most web
projections, module-based output splitting, and durable rate-limit storage
(in-memory Map only in committed tree).
~~**Update (2026-07-15):** durable rate-limit via `RuntimeOptions.rateLimitStore`…~~

> **Correction (2026-07-15):** `src/manifest/rate-limit/` (Postgres store, etc.)
> is **uncommitted working-tree WIP** — do not treat as shipped until merged with
> hard proof on `docs/platform/FEATURE_MATRIX.md`. Rate limiting remains
> Map-backed in HEAD.
> ~~RedisEventBus exists but is test-only, never wired.~~
> **Correction (2026-07-15) @RYANSIGNED:** `RuntimeOptions.eventBus` accepts any
> `EventBus`, including `RedisEventBus`. There is no missing hook. Auto-constructing
> Redis from env is intentionally not a core default (see `docs/TODO.md`).

**Convex projection — diagnostics-only surfaces:** approvals, masking,
searchable, versionProperty/optimistic concurrency, retry, rateLimit are
declared via `CONVEX_UNSUPPORTED_*` diagnostics but not generated/enforced in
Convex output.

**Not implemented at all (doc-only phantoms if claimed elsewhere):**
time-travel debugger; full WASM runtime (only the scoped expression-compat
layer above exists); `EventSourcedStore` (IR accepts the `eventSourced` store
kind as passthrough only).

~~**Silently dropped (violates the no-silent-failure house style):** entity
`behaviors` blocks parse but never reach the IR (`IREntity` has no such field,
`ir-compiler.ts` never reads it) and no diagnostic is emitted.~~

**Update (2026-07-14, unreleased):** entity `behavior` / bare `on Event { ... }`
blocks are hard compile errors (~~message-only diagnostic, fixture 110 —
`IRDiagnostic` has no machine-readable `code` field yet; see TODO~~).

> **Correction (2026-07-15) @RYANSIGNED:** Optional `IRDiagnostic.code` exists;
> fixture 110 seeds `ENTITY_BEHAVIOR_UNSUPPORTED` (also ~~`RELATION_THROUGH_UNSUPPORTED`,~~
> **Update (2026-07-15):** Bare escalate still fails as
> `APPROVAL_ONTIMEOUT_ESCALATE_INCOMPLETE` on 103; complete escalate block is fixture 111.
> ~~also RELATION_THROUGH_UNSUPPORTED on 102~~
> **Update (2026-07-15):** `through` is implemented; fixture `102-through-join` is the
> happy path. Exclusivity remains `RELATION_FK_THROUGH_EXCLUSIVE` (101). Canonical IR and `docs/spec`
> define no behavior semantics; use top-level reactions or command actions
> instead.

**Distribution gap:** MCP server, LSP server, stdlib, and the VS Code
extension are built and tested but published nowhere.

~~**Known bug:** `wasm/wasm-evaluator.ts` still uses the retired
`startsWith('severity')` constraint-polarity heuristic and disagrees with the
runtime engine's explicit `failWhen` handling.~~

~~**Update (2026-07-14):** WASM-compatible evaluator uses shared
`constraint-polarity.ts` (`failWhen` + severity); name heuristics removed.
Parity matrix covers ok/warn/block × both polarities.~~

> **Correction (2026-07-15):** Entire WASM / AssemblyScript prototype removed
> (`src/manifest/wasm/`, `assembly/`, `asconfig.json`, `assemblyscript` /
> `@assemblyscript/loader` devDeps, `RuntimeOptions.wasmEvaluator`). Expression
> evaluation is TypeScript-only via RuntimeEngine + `constraint-polarity.ts`.
