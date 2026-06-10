# Changelog

All notable changes to `@angriff36/manifest` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.3.0] - 2026-06-09

Date/time primitive types with write-time validation, read-time property
masking, realtime entities with SSE surfaces in the Next.js projection, and
packaging fixes that make the published package install-and-go. No breaking
changes — all new syntax is opt-in.

### Added

- **Date/time primitive types** — `date`, `time`, and `datetime` property
  types with pure UTC-only validation and conversion builtins. Invalid values
  are rejected at write time with blocking `E_TYPE_*` outcomes. Type mappings
  added for the TypeScript generators, Prisma, Zod, and JSON Schema
  projections. Conformance fixture 92.
- **Property masking** — contextual `masked` modifier (with optional
  strategy arguments, e.g. `masked(redact)`) and `unmask when <expr>` clause.
  Masking is applied at read time in `getInstance`/`getAllInstances`; the IR
  carries `maskStrategy` with a compiler-enforced invariant (`masked` ∈
  modifiers ⇔ `maskStrategy` present). Conformance fixture 93.
- **Realtime entities** — contextual `realtime` entity flag (parser, AST, IR,
  schema) plus `runtime.subscribe(entityName, listener)` built on `onEvent`.
  The Next.js projection emits SSE surfaces for realtime entities: a
  `subscribe` route, a client subscription hook, and a module-scoped shared
  runtime accessor so subscriptions observe command events.

### Fixed

- **Packaging** — published package is now install-and-go: missing runtime
  dependencies declared, package exports corrected, and ESM import
  specifiers fixed.
- Reserved `hasPermission`/`roleAllows` and the date/time builtin names in
  the plugin API so plugins cannot shadow spec-guaranteed builtins.
- Deflaked projection registration tests via static registry import.

## [2.2.0] - 2026-06-03

A new opt-in identifier-casing convention for the Prisma projection, plus the
public typed config surface (`@angriff36/manifest/config`). No breaking changes —
the `naming` option is default-off, so existing projections emit identical
output.

### Added

- **Prisma auto-casing `naming` convention** — Standardize database identifier
  casing without hand-writing a `columnMappings`/`tableMappings` entry per field.
  Set `naming: 'snake_case'` (shorthand for
  `{ table: 'snake_case', column: 'snake_case', pluralizeTables: true }`) or the
  object form on the Prisma projection. `createdAt` emits `@map("created_at")`,
  `Widget` emits `@@map("widgets")`. The convention **only adds `@map`/`@@map`** —
  Prisma model names and field identifiers stay the IR name, so relation
  `fields`/`references`, `@@id`, `@@unique`, and `@@index` are unaffected, and a
  map is emitted only when the physical name differs. Resolution order: explicit
  `tableMappings`/`columnMappings` win → convention → IR name verbatim. See
  `src/manifest/projections/prisma/options.ts` and the new deterministic util
  `src/manifest/projections/shared/naming.ts` (snake/camel/pascal + pluralizer,
  no new dependency).
- **Global `naming` default with per-projection override** — A top-level
  `naming` in `manifest.config.yaml` is inherited by projections that map IR
  names to physical names; a per-projection `projections.<name>.options.naming`
  overrides it. Merge contract: `resolveProjectionOptions()` in
  `src/manifest/config.ts`. Both JSON config schemas accept `naming`, and
  `manifest config validate` enforces the allowed case values.
- **`@angriff36/manifest/config` package export** — Public typed config surface
  (`defineConfig`, `ManifestRuntimeConfig`, `ManifestBuildConfig`) for authoring
  a `manifest.config.ts` with editor autocomplete and compile-time checking.

## [2.1.0] - 2026-06-02

Three runtime defects that made advertised orchestration features silently fail
for downstream consumers (sagas, reactions, approvals) are fixed, plus a new
durable approval-persistence adapter family. No breaking API changes — the one
new `SagaStepResult.status` value and the widened `approveStage` approver
parameter are backward compatible.

### Fixed

- **Saga compensation passed empty input (data-loss / silent no-op)** — When a
  saga step failed and the engine compensated completed steps in reverse, each
  compensation command was invoked with `{}`. Any compensation needing the
  original step's payload (e.g. a refund needing the charge amount) got nothing,
  failed its guard, had the failure swallowed, and was still mislabeled
  `compensated`. The compensation now receives the **original forward step's
  input**, and a compensation that fails its guard/policy or throws is reported
  as the new status `compensation_failed` instead of `compensated`. See
  `src/manifest/runtime-engine.ts` (`compensateSagaSteps`) and
  `runtime-saga.test.ts`.
- **`on <Event> run <Entity>.create` reactions were a silent no-op** — Reaction
  dispatch always set `instanceId`, but auto-create only fires when `instanceId`
  is absent, so create-target reactions ran mutate actions against a
  non-existent instance and persisted nothing. Create-target reactions now route
  through the auto-create path (the resolved value becomes the new instance's
  `id`). The marketed "EventCreated → create Proposal/Budget/Tasks" fan-out works.
  See `runtime-engine.ts` reaction dispatch and `runtime-engine.test.ts`.
- **Approvals were in-memory only, with a role-as-userId hack** — Multi-stage
  approvals could not persist across requests (state lived in a private
  in-process `Map`), and stage policies were evaluated with the approver's userId
  doubling as their role, so real RBAC policies could not be expressed. Both are
  fixed (see Added).

### Added

- **`RuntimeOptions.approvalStore`** — a durable `ApprovalStore` adapter
  (`load`/`save`/`list`/`expire`) used as the backing store for pending approval
  requests when provided, falling back to the in-process Map otherwise. An
  approval created by one engine instance is now visible and approvable by a
  freshly-constructed engine bound to the same store (the normal
  stateless-per-request pattern). Ships first-party `MemoryApprovalStore`
  (`@angriff36/manifest/approval/memory`) and `PostgresApprovalStore`
  (`@angriff36/manifest/approval/postgres`), mirroring the audit/outbox adapter
  families. Contract exported as `ApprovalStore` from the package root.
- **Real approver role context for `approveStage`** — `approveStage(…, approver)`
  now accepts `{ id, role?, roles?, … }` in addition to the legacy `string`. The
  object is exposed to the stage policy as `user.*`, so policies like
  `user.role == "manager"` evaluate against the approver's actual role rather
  than their id. Passing a string keeps the prior (userId-doubles-as-role)
  behavior, so existing callers are unaffected.

### Behavior changes (non-breaking, worth noting)

- `SagaStepResult.status` gained the value `compensation_failed`. Consumers that
  exhaustively switch on saga step status should add a case; a failed
  compensation that previously surfaced (incorrectly) as `compensated` now
  surfaces as `compensation_failed`.

## [2.0.6] - 2026-06-02

### Fixed

- **Property-based test stability** — Added `noDefaultInfinity: true` to float generators in `runtime-expression-properties.test.ts` to prevent subnormal float edge cases causing non-deterministic CI failures

## [2.0.5] - 2026-06-02

### Fixed

- **Publish pipeline** — Simplified `prepublishOnly` to remove WASM build (requires `asc` not available in CI) and unpublished MCP/LSP server builds

## [2.0.4] - 2026-06-02

### Fixed

- **`replace()` builtin** — Use function-based replacement to avoid `$$` special pattern interpretation in `String.replace()`. `replace("hello", "l", "$$")` now correctly returns `"he$$$$o"` instead of `"he$o"`.

## [2.0.3] - 2026-06-02

### Fixed

- **Dart projection** — Removed unused `_irValueToDartLiteral` function and `IRValue` import causing TS6133/TS6196 typecheck failure

## [2.0.2] - 2026-06-02

### Fixed

- **CLI build errors** — Fixed TypeScript errors in `gen-tests.ts`, `load-test.ts`, `profile.ts`, and `validate-ai.ts` that blocked the release pipeline
- **Dart projection** — Removed unused `@ts-expect-error` directive causing TS2578

## [2.0.0] - 2026-06-02

76 new features across 5 themed groups. This is the largest Manifest release to date, adding 16 new projection targets, 4 store adapters, entity inheritance/generics, distributed workflow primitives, a full AI integration surface, and comprehensive developer tooling.

### Language & Type System

- **Expanded Date/Time types** — `date`, `time`, `datetime`, `duration` primitives with ISO 8601 semantics
- **Map / Record type** — `map<V>` for key-value property types
- **Entity inheritance** — `entity Child extends Parent { ... }` and `mixin` composition with cycle/unknown-parent detection
- **Generic / parameterized entities** — `entity Paginated<T> { ... }` with compile-time instantiation and type substitution
- **Command retry policy** — declarative retry with backoff, max attempts, and retryable error matching
- **Rate limiting** — per-command rate limit declarations with sliding window and bucket algorithms
- **Scheduled / cron commands** — `schedule "cron expression" run Entity.command` triggers
- **Field-level encryption** — `encrypted` property modifier with adapter-driven encrypt/decrypt
- **Full-text search** — `fulltext` index declarations with language-aware tokenization config
- **Webhook triggers** — inbound `webhook` declarations parsing HTTP payloads into commands
- **Data masking** — `masked` property modifier with role-based unmasking policies
- **Expression language extensions** — string interpolation, ternary, null coalescing, array comprehensions
- **Standard library (stdlib)** — curated set of reusable Manifest modules (validation, formatting, etc.)
- **Custom expression functions** — plugin API for registering user-defined builtins at runtime
- **Event sourcing store** — append-only event store adapter with snapshot + replay

### Projections & SDK Generation

- **OpenAPI 3.1 projection** — generates OpenAPI specs with schemas, security, and operation IDs from IR
- **JSON Schema projection** — Draft-07 JSON Schema from entity/property definitions
- **Zod schema projection** — Zod validation schemas with constraint-aware refinements
- **TanStack Query hooks** — React Query / Vue Query hook generation for entity CRUD
- **Remix projection** — Remix / React Router v7 route and loader generation
- **SvelteKit projection** — SvelteKit server routes and type-safe stores
- **Flutter / Dart projection** — Dart model classes with JSON serialization
- **Python Pydantic projection** — Pydantic v2 model generation with validators
- **Terraform projection** — Infrastructure-as-Code from store/entity declarations
- **Kysely projection** — Type-safe SQL query builder types from IR entities
- **Materialized view projection** — SQL materialized view DDL for PostgreSQL
- **Analytics projection** — Event schema generation for analytics platforms
- **Elasticsearch / OpenSearch projection** — Index mappings and ingest pipelines
- **Python SDK generation** — Full Python client SDK with type hints and async support
- **Storybook projection** — CSF3 stories with guard pass/fail and constraint interaction stories
- **Hono edge projection** — Hono edge-runtime handler generation

### Runtime, Stores & Infrastructure

- **DynamoDB store adapter** — Full DynamoDB store with outbox pattern support
- **Redis store adapter** — Redis-backed store with pub/sub event emission
- **Turso / libSQL store adapter** — libSQL-compatible store with WAL mode
- **Transactional outbox** — Atomic state + event commit pattern with PostgreSQL and DynamoDB implementations
- **Runtime middleware** — Before/after middleware pipeline for command execution hooks
- **Interactive REPL** — `manifest repl` for live Manifest expression and command evaluation
- **Time-travel debugger** — Runtime state rewind/replay for debugging command sequences
- **Federated multi-service runtime** — Cross-service entity references and remote command dispatch
- **Saga orchestration** — Multi-step distributed workflow declarations with compensating actions
- **Real-time subscriptions** — WebSocket-based entity change subscriptions
- **Custom store adapter API** — Plugin-based store registration via `definePlugin`
- **Plugin API** — Third-party extension system for projections, stores, and builtins
- **Seed data generator** — Auto-generate seed data from IR entity/relationship definitions
- **Performance profiler** — Runtime command/constraint profiling with bottleneck detection

### Developer Tooling & AI Integration

- **AI Agent SDK** — Typed SDK (`@angriff36/manifest/agent-sdk`) wrapping runtime with LLM-friendly tool interfaces (Anthropic, OpenAI, Vercel AI compatible)
- **AI test generator** — AI-assisted conformance test generation from IR descriptions
- **LLM context export** — `llms.txt` and structured context for LLM consumption
- **LLM IR validator** — Validate and repair LLM-generated IR against the schema
- **MCP server** — Manifest Model Context Protocol server for AI tool integration
- **Code formatter** — `manifest fmt` with configurable indentation and style rules
- **Import system** — `use "./path.manifest"` cross-file references with module resolution
- **Online playground** — Shareable web playground with URL-encoded state
- **VS Code extension** — Syntax highlighting, diagnostics, and go-to-definition
- **Language Server Protocol** — Full LSP implementation with completion, hover, diagnostics
- **Watch mode compiler** — Incremental rebuild on file change with diagnostic streaming
- **IR version control** — IR version registry with changelog tracking and diff
- **IR compression** — Binary serialization for compact IR transport and storage
- **IR graph visualizer** — Entity relationship graph from IR with interactive exploration
- **Changelog from IR diff** — Automated changelog generation comparing two IR versions
- **Command coverage reporter** — Guard and constraint coverage analysis for commands
- **Documentation site generator** — Auto-generated API docs from IR entities and commands
- **Natural language transpiler** — `manifest generate --from-prompt "..."` with LLM-backed generation
- **Environment variable mapping** — `manifest preflight` validates env vars against config schema
- **Event subject metadata** — Canonical `event.subject` metadata on all emitted events
- **Health check export fix** — Corrected HealthCheckProjection package exports and registration
- **Health check ESM fix** — Fixed missing `.js` extension in ESM import paths

### Advanced Runtime & Platform

- **WebAssembly runtime** — WASM compilation target for browser/edge Manifest execution
- **Interactive tutorial mode** — Step-by-step guided tutorial in the diagnostic UI
- **Constraint test harness** — Interactive constraint validation testing surface
- **Policy matrix viewer** — Visual policy/action/role matrix display
- **Bundle size analyzer** — Generated code bundle size reporting and tree-shaking analysis
- **Load testing fixtures** — k6/Artillery load test generation from IR commands
- **Mock server** — Auto-generated mock server for testing without real stores
- **Snapshot testing** — Snapshot testing for generated projection code
- **Property-based testing** — Fast-check property-based tests for runtime engine

### Feature List & Release Tooling

- **Feature list document** — `docs/FEATURE-LIST.md` cataloging all 116 features with implementation details
- **Feature list generator** — `tools/gen_feature_list.py` for regenerating from automaker state

## [1.8.0] - 2026-06-01

### Added

- **Declarative event reactions** — `on <Event> run <Entity>.<command>` reaction rules with `resolve <expr>` instance resolution and `params { ... }` mapping. The runtime auto-dispatches the downstream command when the event is emitted, sequenced by declaration order and guarded against runaway cascades (`ManifestReactionDepthError`). Enables cross-entity orchestration (e.g. `OrderCompleted → Invoice.createFromOrder`) declaratively inside Manifest's governance boundary. Conformance fixture `67-event-reactions`.
- **Multi-stage approval workflows** — `approval` declarations gating a command behind ordered, multi-stage sign-off. Stages declare `policy:`, `required:`, and optional `when:`; plus `timeout:` / `on_timeout:` and lifecycle events. The approval gate runs after guards and before actions (policies → constraints → guards → approval → actions → emits). Conformance fixture `68-approval-workflow`.
- **Async / background command execution** — `async command` modifier defers actions to a background worker queue. Policies, constraints, and guards are validated synchronously (fail-fast); the command then enqueues a `JobRecord` and returns `{ jobId, status: 'pending', enqueuedAt }`. Auto-synthesizes `{Command}Completed` / `{Command}Failed` events. New `JobQueue` adapter (`MemoryJobQueue` for tests, `RuntimeOptions.jobQueue`, `drainJobs()`). Conformance fixture `69-async-commands`.
- **Role hierarchy & permission inheritance** — `role <Name> [extends <Parent>] { (allow|deny) <action> [<target>] }`. Effective permissions (root-first union minus absolute deny) are resolved at compile time for O(1) runtime checks, with duplicate / unknown-parent / cycle detection. New builtins `hasPermission(action, target?)` and `roleAllows(roleName, action, target?)`; deny is absolute and unknown roles default-deny. `role` remains a contextual identifier, so existing `property role` / `user.role` usages are unaffected. Conformance fixture `71-role-hierarchy`.
- **Multi-module compilation** — `use "./path.manifest"` imports with a module resolver (BFS discovery, DFS cycle detection, topological sort) and a multi-compiler that performs cross-file validation and deterministic IR merge. Optional `IRProvenance.sources`; CLI `--merge` / `--entry` flags; new package exports `./multi-compiler`, `./module-resolver`, `./parser`. Single-file compilation is unchanged.
- **Cross-entity constraint expressions** — constraints can now traverse relationships to arbitrary depth (e.g. `self.customer.status == "active"`) via `_entity` metadata on resolved relationship instances. Conformance fixture `70-cross-entity-constraints`.
- **Health-check projection** — new built-in projection generating a `/manifest/health` endpoint (`health.handler`, `health.nextjs`, `health.express` surfaces): IR provenance-hash integrity, per-store-target connectivity, and outbox queue-depth checks, with configurable HTTP status mapping (200 healthy / 503 unhealthy|degraded).
- **Storybook projection** — new built-in projection generating Storybook CSF3 stories and arg types from entities and commands, including `GuardsPass` / `GuardFails` interaction stories and constraint-violation stories.

### Fixed

- **Next.js projection read routes are now field-aware** — the generated Prisma `findMany` / `findFirst` queries only emit the soft-delete filter (`deletedAt: null`) when the entity actually declares that column, and the list `orderBy` uses `createdAt` only when present, falling back to the always-present `id`. Previously these clauses were emitted for every entity, producing queries Prisma rejects at runtime (`Unknown argument deletedAt`) for entities without those columns.

## [1.7.0] - 2026-05-31

### Added

- **First-class `create` command auto-instantiation** — `runCommand('create', body, { entityName })` now prepares a non-persisted create candidate, evaluates policies, command constraints, and guards against it, then persists through `Store.create`.
  - Uses `body.id` when present, otherwise falls back to `RuntimeOptions.generateId`.
  - Returns the created entity in both `result` and `newInstance` on the command result.
  - Event and outbox behavior preserved, including correct `event.subject.id` for the created entity.
  - Update-style commands (with `instanceId`) are unchanged.

### Changed

- Agent instruction files (`AGENTS.md`, `CLAUDE.md`) corrected to use `pnpm` instead of `npm` throughout, matching the actual pnpm workspace setup.

## [1.6.0] - 2026-05-30

### Added

- **Canonical `event.subject` metadata** — every event emitted during `runCommand` now carries a `subject` of `{ entity?, command, id? }`, so downstream consumers can identify the originating entity, command, and target instance without inferring identifiers from payload shape.
  - Deterministic id resolution order: `instanceId` → single created record id → top-level `payload.id` → unset (no fabricated ids).
  - `subject` is threaded intact through the outbox pipeline (memory + PostgreSQL stores).
  - Optional `PostgresOutboxStore` `projectSubject` flag projects `subject.entity` / `subject.id` into indexed `subject_entity` / `subject_id` columns for querying.
- Fully additive and backward-compatible: `subject` is optional on `EmittedEvent`; existing payloads and consumers are unaffected.

## [1.5.0] - 2026-05-29

### Added

- **plugin-api** — registration hooks for custom store adapters and custom expression functions.
- **Computed property memoization** — `cache request` / `session` / `ttl` modifiers on computed properties.
- **Conformance fixture** `65-computed-property-caching`.

## [1.4.0] - 2026-05-29

### Added

- **New CLI commands** — `manifest watch` (incremental recompile/reproject), `manifest diagram` (Mermaid export), `manifest coverage` (command/guard/policy/constraint coverage), `manifest changelog` (changelog from IR diffs).

## [1.3.0] - 2026-05-29

### Added

- **`matches(value, pattern)` regex constraint** — compile-time regex syntax validation plus runtime enforcement.
- **Aggregate expression builtins** — `sum`, `avg`, `min_of`, `max_of`, `count_of`, `filter`, `map` over collections, each accepting an optional mapper/predicate lambda; usable in computed properties.
- **`flag(name)` feature-flag builtin** — resolves feature flags via a runtime-provided provider in guards and policies (returns `false` when no provider is configured).
- **Conformance fixtures** `63-regex-constraints`, `64-aggregate-computed-properties`, `66-feature-flags`.

### Notes

- `66-feature-flags` ships an expected IR fixture but not yet a `results.json`; feature-flag runtime behavior is not yet locked by a conformance results fixture.

## [1.2.0] - 2026-05-29

### Added

- **JSON Schema projection** — JSON Schema output from IR entity definitions (`pattern`, `minimum`/`maximum`, `required`, `enum`).
- **Mermaid projection** — ER/diagram export from IR, available via the `manifest diagram` CLI command.
- **LLM context projection** — structured IR/domain-model export for AI agent context injection.

## [1.1.0] - 2026-05-29

### Added

- **Projection framework foundation** — shared projection registration plus the IR, parser, and runtime updates underpinning the new projection targets.
- **GraphQL projection** — SDL type definitions plus resolver stubs from IR entities, commands, policies, and events.
- **Hono projection** — route handlers for edge runtimes (Cloudflare Workers, Vercel Edge, Deno Deploy).
- **Express projection** — route handlers and middleware with typed request/response shapes.

## [1.0.32] - 2026-05-26

### Added

- **`manifest-mcp` bin** on `@angriff36/manifest` — official MCP server (`compile`, `execute`, `validate`, `explain` tools + IR schema/semantics resources) is now included in the published tarball.
- Runtime dependencies **`@modelcontextprotocol/sdk`** and **`zod`** required by the MCP server.

### Fixed

- **MCP packaging gap (since v1.0.25)** — `packages/mcp-server` existed in the repo but was excluded from `files` and never built during publish; consumers installing from GitHub Packages could not run `manifest-mcp`.
- **`manifest://semantics` resource** — ships `docs/spec/semantics.md` in the tarball.

## [1.0.31] - 2026-05-26

### Added

- **Drizzle ORM schema projection** — generates TypeScript-first Drizzle table definitions from IR with column types, PKs, FKs, indexes, unique constraints, relations API, referential actions, array types, and multi-dialect support (PostgreSQL, MySQL, SQLite).
- **`drizzle.schema` surface** and **`@angriff36/manifest/projections/drizzle`** package export.
- **51 unit tests** covering type mapping, relationships, indexes, defaults, and diagnostics.

### Fixed

- **v1.0.30 publish gap** — builtins registered `DrizzleProjection` but the drizzle source files were not included in the tarball; this release adds the missing implementation.

## [1.0.30] - 2026-05-26

### Added

- **Array / list property type** — runtime support for `array<T>` and `T[]` properties with `.contains()`, `.all()`, and `.any()` method calls; `getDefaultForType('array')` returns `[]`; conformance fixture `40-array-properties`.
- **IR version control** — `src/manifest/ir-version-store.ts` with semver tagging, integrity verification, and changelog generation; `manifest versions` CLI with 8 subcommands (list, show, save, diff, changelog, tag, rollback, verify); `@angriff36/manifest/ir-version-store` export; exported `computeIRHash` from ir-compiler.
- **Plugin API** — `@angriff36/manifest/plugin-api` and `@angriff36/manifest/plugin-loader` with five extension points (projections, stores, audit sinks, builtins, CLI commands); `manifest plugins list` CLI; `plugins` config section; `docs/spec/plugins/plugin.schema.json`.
- **106 new tests** (conformance + ir-version-store + versions CLI + plugin-api + plugin-loader).

## [1.0.27] - 2026-05-26

### Added

- **Zod schema projection** — generates `z.object()` validation schemas from IR entities and command parameters with constraint refinements, computed property extensions, and nullable/optional/default handling.
- **Three surfaces:** `zod.entity`, `zod.command`, `zod.schemas`.
- **`@angriff36/manifest/projections/zod`** package export.
- **41 unit tests** covering type mapping, constraints, determinism, and edge cases.

## [1.0.26] - 2026-05-26

### Added

- **`manifest fmt`** — deterministic whitespace formatter for `.manifest` source with `--check` and `--write` modes; verifies parse success before accepting output.
- **`manifest install-hooks`** — installs Husky or simple-git-hooks pre-commit hooks running `manifest fmt --check` and `manifest validate` on staged `.manifest` files.
- **`hooks` config section** in `manifest.config.yaml` — `skipInCi`, `provider`, `runFmt`, and `runValidate` options.
- **12 unit tests** for fmt and install-hooks commands.

## [1.0.25] - 2026-05-26

### Added

- **Manifest MCP server** (`packages/mcp-server`) — Model Context Protocol server with `compile`, `execute`, `validate`, and `explain` tools plus IR schema, cached IR, and semantics resources.
- **`manifest-mcp` CLI bin** for stdio MCP transport.
- **`pnpm-workspace.yaml`** for monorepo package discovery (`packages/*`).
- **17 unit tests** for MCP tool handlers.

## [1.0.24] - 2026-05-26

### Added

- **TanStack Query projection** — generates typed `useEntityList`, `useEntityDetail`, and command mutation hooks with query key factories and cache invalidation.
- **`ManifestQueryProvider`** component surface with configurable staleTime and error boundary integration.
- **`@angriff36/manifest/projections/react-query`** package export.
- **21 unit tests** covering hooks, mutations, provider, determinism, and edge cases.

## [1.0.23] - 2026-05-26

### Added

- **OpenAPI 3.1 projection** — generates complete OpenAPI specs from IR entities, commands, and routes with JSON Schema-typed bodies, security schemes, and constraint error responses.
- **`@angriff36/manifest/projections/openapi`** package export.
- **40 unit tests** covering entity read/command operations, type mapping, security, determinism, and edge cases.

## [1.0.22] - 2026-05-26

### Added

- **Range constraint primitives** — `min`, `max`, `between`, and `length` builtins for declarative numeric range and string length validation.
- **`constraint-analysis` module** — static analysis extracting numeric ranges and length bounds from IR constraints for projection use (SQL CHECK, Zod, OpenAPI).
- **22 unit tests** for constraint analysis converters and merge logic.
- **Conformance fixtures** `56-expression-builtins` (diagnostics/results) and `57-range-constraint-builtins` (IR compilation).

## [1.0.21] - 2026-05-26

### Added

- **`manifest migrate`** CLI command — IR diff analysis for database migration planning with `--dry-run`, `--preview`, `--force`, `--tool`, and reversibility checks.
- Integrates `@angriff36/manifest/ir-diff` and `@angriff36/manifest/breaking-change` for SQL/Prisma migration preview output.

## [1.0.20] - 2026-05-26

### Added

- **IR Graph Visualizer** — force-directed canvas panel in Kitchen/Runtime UI showing entities, relationships, event flows, and computed dependencies.
- **Graph tab** between AST and Docs with pan/zoom, click-to-inspect, SVG/PNG export, and legend overlay.
- **`IRGraphPanel`** component (`src/artifacts/IRGraphPanel.tsx`) with zero new dependencies.

## [1.0.19] - 2026-05-26

### Added

- **`manifest preflight`** CLI command — validates environment variables against `env` mapping in `manifest.config.yaml`; supports `--format json` and `--generate-example`.
- **`env` mapping schema** in `manifest.config.schema.json` with `stores`, `auth`, `adapters`, and `custom` categories.
- **TypeScript types** `EnvMapping` and `EnvVarDefinition` in CLI config utilities.
- **15 unit tests** for preflight validation and `.env.example` generation.

## [1.0.18] - 2026-05-26

### Added

- **`manifest docs`** CLI command — generates static HTML or Markdown documentation from IR (entity reference pages with properties, commands, policies, constraints, events).
- **16 unit tests** covering HTML/Markdown output, all IR sections, error handling, and directory input.

## [1.0.17] - 2026-05-26

### Added

- **`manifest init --ci github`** — generates `.github/workflows/manifest-ci.yml` with validate, scan, test matrix (Node 18/20/22), and conformance fixture regen on main.
- **CLI flags** `--node-versions` and `--force` for CI workflow generation.
- **12 unit tests** for workflow generation and file creation.

## [1.0.16] - 2026-05-26

### Added

- **`@angriff36/manifest/agent-sdk`** — LLM-friendly SDK wrapping the runtime engine: `AgentRuntime`, tool definitions (Anthropic/OpenAI/Vercel), IR introspection, intent mapping, and JSON Schema helpers.
- **60 unit tests** for agent-sdk (tool naming, introspection, intent scoring, tool call routing).

## [1.0.15] - 2026-05-26

### Added

- **Entity `timestamps` modifier** — auto-injects `createdAt`/`updatedAt` on IR compile; runtime populates on create/update.
- Conformance fixture **`62-timestamp-auto-fields.manifest`**.
- Prisma projection: `@default(now())` on `createdAt`, `@updatedAt` on `updatedAt` when entity has `timestamps: true`.
- IR schema: `values`, `tenant`, `timestamps` fields aligned with compiler/runtime.

## [1.0.14] - 2026-05-26

### Added

- **`tenant` declaration** — `tenant <prop> : <type> from <context.path>` compiles to IR `tenant`, auto-injects on writes, filters reads, and fails closed on commands without tenant context.
- Conformance fixture **`61-tenant-isolation.manifest`**.
- Prisma projection: auto tenant column, `@@index`, and RLS policy hints when IR declares tenant.

## [1.0.13] - 2026-05-26

### Added

- **`value` declarations** — reusable composite types embedded on entity properties (IR `values[]`, Prisma `Json` columns).
- Conformance fixture **`60-value-objects.manifest`**.

## [1.0.12] - 2026-05-26

### Added

- **`@angriff36/manifest/ir-diff`** — compare two IR JSON files; optional SQL/Prisma migration hints.
- **`@angriff36/manifest/breaking-change`** — classify IR diffs as compatible, deprecated, or breaking.
- **CLI** `manifest diff ir-vs-ir` and `manifest diff breaking` with `--json`, `--sql`, `--prisma`, `--ci`.

## [1.0.11] - 2026-05-26

### Added

- **`npm run test:postgres`** — runs live Postgres adapter tests when `DATABASE_URL` is set (Manifest Neon DB, direct connection).
- Vitest loads `.env`; live suites use `DATABASE_URL` (legacy `MANIFEST_POSTGRES_TEST_URL` still accepted).

### Fixed

- **`PostgresOutboxStore.claim`** returns entries in stable FIFO order (`enqueued_at`, then `entry_id`).

## [1.0.10] - 2026-05-26

### Added

- **`manifest validate-ai`** CLI command: compile `.manifest` or validate `.ir.json` with schema + semantic checks, 0–100 scoring, and machine-readable JSON output for agent self-correction loops.
- **CLI tests** for IR validation, semantic diagnostics, scoring, text/JSON output, and manifest-source compilation.

## [1.0.9] - 2026-05-26

### Added

- **Expression builtins** in the reference runtime: string (`trim`, `split`, `replace`, …), math (`abs`, `min`, `max`, `between`, …), array (`sum`), and UTC date extractors (`year`, `month`, …).
- **Conformance fixture `56-expression-builtins`** for executable semantics.
- **`docs/spec/builtins.md`** Expression Library section documenting required callables.

## [1.0.8] - 2026-05-26

### Added

- **`decimal` and `money` type keywords** in the lexer (reserved words).
- **`IRType.params`** in `ir-v1.schema.json` for `precision` and `scale` on exact-decimal types.
- **Conformance fixture `56-decimal-type`** covering `decimal(10, 2)`, `money(12, 4)`, bare `decimal`, and nullable `money?`.
- **Compiler unit test** asserting decimal/money params survive IR lowering.

### Notes

- Parser and `transformType` already supported `decimal(p, s)` before this release; 1.0.8 completes the contract (schema + keywords + executable semantics).

## [1.0.7] - 2026-05-26

### Fixed

- **Enum property defaults**: `property status: Status = draft` now lowers to `defaultValue: { kind: "string", value: "draft" }` in IR.
- **`IRModule.enums`** added to `ir-v1.schema.json` (required + properties), matching `ir.ts` and the compiler.

### Changed

- Conformance expected IR hashes refreshed after enum-default lowering.
- Fixture **`57-enum-type`** restored with `status` default.

## [1.0.6] - 2026-05-26

### Added

- **First-class `enum` declarations** with optional labels and ordinals.
- Top-level **`IR.enums`** array (schema, compiler, types); existing programs emit `enums: []`.
- **Conformance fixture `57-enum-type`** for enum syntax and enum-typed properties.
- **`enum` lexer keyword**.

### Fixed

- **CLI `compile` directory glob** uses the source directory as `cwd` (multi-file duplicate-command detection works in temp dirs).
- **`runtime-smoke` IR fixture** includes `enums: []` (CLI build/typecheck).
- **ESLint** ignores `.worktrees/**`.

### Changed

- Regenerated conformance expected IR for `enums: []` on programs without enum declarations.

## [1.0.5] - 2026-05-25

### Added

- Postfix array type syntax (`string[]` → `array<string>`).
- Prisma scalar list fields from Manifest array types.

### Fixed

- Duplicate command-intent guard retained from 1.0.4.
