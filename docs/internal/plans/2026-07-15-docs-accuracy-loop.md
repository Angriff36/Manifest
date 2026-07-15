# Docs accuracy loop ledger

Created: 2026-07-15
Status: Active — requested remaining deep-audit set closed 2026-07-15
Authority: Advisory (operational ledger for the docs-accuracy loop)
Enforced by: None

Progress checklist for making every Manifest doc accurate against Tier A
schemas / conformance / shipped code. Repairs use the `@RYANSIGNED`
strikethrough + dated correction method. Do not invent unsupported behavior;
label gaps when needed.

**Scope order:** mintlify (user-facing) → `docs/getting-started|features|guides|projections|reference` → root `docs/*.md` → `docs/internal/**` (fix false paths/claims only; no mass rewrite of plans).

**Package pin verified this ledger:** `@angriff36/manifest` / repo `package.json` = **3.6.4**.

## Mintlify — Get Started

- [x] `mintlify/index.mdx`
- [x] `mintlify/introduction.mdx` — audited 2026-07-15 (execution-order correction)
- [x] `mintlify/quickstart.mdx` — audited 2026-07-15 (Node>=20, runCommand tip, --all)
- [x] `mintlify/installation.mdx`
- [x] `mintlify/whats-new.mdx` — audited 2026-07-15 (3.0 note + current pin 3.6.4)
- [x] `mintlify/faq.mdx`
- [x] `mintlify/troubleshooting.mdx`

## Mintlify — Language

- [x] `mintlify/language/manifest-files.mdx`
- [x] `mintlify/language/entities.mdx`
- [x] `mintlify/language/commands.mdx` — audited 2026-07-15 (runCommand, retry, rateLimit, policies, approval)
- [x] `mintlify/language/guards-policies.mdx` — audited 2026-07-15 (no command-body policies)
- [x] `mintlify/language/events.mdx` — audited 2026-07-15 (runCommand, emit timing, eventSourced gap)
- [x] `mintlify/language/approvals.mdx` — audited 2026-07-15 (runCommand, escalate unsupported)
- [x] `mintlify/language/reactions.mdx` — audited 2026-07-15 (runCommand; no silent skip; causationId=event name; entity `on run` vs behavior)
- [x] `mintlify/language/async-commands.mdx` — audited 2026-07-15 (runCommand; ctor; nested result; JobQueue.enqueue void; jobs.* channel)
- [x] `mintlify/language/stores.mdx`
- [x] `mintlify/language/computed-properties.mdx` — audited 2026-07-15 (cache cross-link; priority field)
- [x] `mintlify/language/computed-caching.mdx` — audited 2026-07-15 (verified)
- [x] `mintlify/language/types.mdx` — audited 2026-07-15 (no timestamp; date/time/duration + builtins)
- [x] `mintlify/language/constraints.mdx` — audited 2026-07-15 (min/max are not boolean bounds)
- [x] `mintlify/language/expressions.mdx` — audited 2026-07-15 (no registerBuiltin; customBuiltins/plugin)
- [x] `mintlify/language/roles.mdx` — audited 2026-07-15 (runCommand; hasPermission(action); IRRole shape)
- [x] `mintlify/language/modules.mdx` — audited 2026-07-15 (no path namespace; duplicates error)
- [x] `mintlify/language/advanced-entities.mdx` — audited 2026-07-15 (parent/mixins in IR; merge order)
- [x] `mintlify/language/workflows.mdx` — audited 2026-07-15 (fixed Saga* lifecycle; runSaga; schedules≠sagas)
- [x] `mintlify/language/feature-flags.mdx` — audited 2026-07-15 (store entity name)
- [x] `mintlify/language/timestamps.mdx` — audited 2026-07-15 (verified)
- [x] `mintlify/language/tenancy.mdx`

## Mintlify — Projections / integration

- [x] `mintlify/integration/overview.mdx` — audited 2026-07-15 (12 Next.js surfaces + dispatcher)
- [x] `mintlify/integration/projections.mdx` — audited 2026-07-15 (--all + generate API + read-policy wording)
- [x] `mintlify/integration/nextjs.mdx` — audited 2026-07-15 (Node>=20; runCommand)
- [x] `mintlify/integration/prisma.mdx` — audited 2026-07-15 (composite `key` / PRISMA_NO_ID)
- [x] `mintlify/integration/embedded-runtime.mdx` — audited 2026-07-15 (runCommand verified)
- [x] `mintlify/projections/convex.mdx` — audited 2026-07-15 (tenant defaults ≠ Next.js)
- [x] `mintlify/projections/drizzle.mdx` — audited 2026-07-15 (verified)
- [x] `mintlify/projections/remix.mdx` — audited 2026-07-15 (defaults, phantom options, HTTP status)
- [x] `mintlify/projections/sveltekit.mdx` — audited 2026-07-15 (phantom entity-first runCommand; options)
- [x] `mintlify/projections/flutter.mdx` — audited 2026-07-15 (registry `dart`; Dio not httpx)
- [x] `mintlify/projections/python-pydantic.mdx` — audited 2026-07-15 (legacy Config emission)
- [x] `mintlify/projections/openapi.mdx` — audited 2026-07-15 (verified)
- [x] `mintlify/projections/graphql.mdx` — audited 2026-07-15 (phantom 3-arg runCommand stubs)
- [x] `mintlify/projections/zod.mdx` — audited 2026-07-15 (TYPE_MAP: timestamp/list/enum/time/duration)
- [x] `mintlify/projections/react-query.mdx` — audited 2026-07-15 (CLI `-p react-query` works)
- [x] `mintlify/projections/json-schema.mdx` — audited 2026-07-15 (CLI `-p jsonschema`)
- [x] `mintlify/projections/express.mdx` — audited 2026-07-15 (facade vs RuntimeEngine runCommand)
- [x] `mintlify/projections/hono.mdx` — audited 2026-07-15 (facade vs RuntimeEngine runCommand)
- [x] `mintlify/projections/mermaid.mdx` — audited 2026-07-15 (`manifest diagram` + generate)
- [x] `mintlify/projections/llm-context.mdx` — audited 2026-07-15 (CLI `-p llm-context`)
- [x] `mintlify/projections/wiring.mdx` — audited 2026-07-15 (verified wiring-inspect/remediate)
- [x] `mintlify/projections/additional-projections.mdx` — audited 2026-07-15 (registry names verified)

## Mintlify — Adapters / CLI / extensibility

- [x] `mintlify/adapters/event-sourced-store.mdx` — audited 2026-07-15 (gap already labeled; pin 3.6.4)
- [x] `mintlify/adapters/redis.mdx` — audited 2026-07-15 (RedisStore pub/sub throws; RedisEventBus via eventBus)
- [x] `mintlify/adapters/custom-stores.mdx` — audited 2026-07-15 (redis/eventSourced rows)
- [x] `mintlify/adapters/turso.mdx` — audited 2026-07-15 (no turso projection; tableName + generateTursoSchema)
- [x] `mintlify/adapters/outbox.mdx` — audited 2026-07-15 (verified against outbox exports)
- [x] `mintlify/adapters/audit-sink.mdx` — audited 2026-07-15 (verified)
- [x] `mintlify/adapters/dynamodb.mdx` — audited 2026-07-15 (DynamoDBOutboxStore not public — already labeled)
- [x] `mintlify/cli/overview.mdx` — audited 2026-07-15 (pin 3.6.4 / node>=20)
- [x] `mintlify/cli/commands.mdx` — audited 2026-07-15 (CI node matrix note)
- [x] `mintlify/cli/configuration.mdx` — audited 2026-07-15 (spot-check OK)
- [x] `mintlify/cli/ci-cd.mdx` — audited 2026-07-15 (node matrix vs engines)
- [x] `mintlify/cli/governance.mdx` — audited 2026-07-15 (spot-check OK)
- [x] `mintlify/cli/dev-tools.mdx` — audited 2026-07-15 (VS Code/LSP unpublished; manifest-lsp bin)
- [x] `mintlify/cli/testing.mdx` — audited 2026-07-15 (phantom test/fixtures APIs → harness/seed/mock/load-test)
- [x] `mintlify/extensibility/runtime-tooling.mdx` — audited 2026-07-15 (REPL cmds + prior TimeTravelDebugger fix)
- [x] `mintlify/extensibility/federation.mdx` — audited 2026-07-15 (runCommand signature)
- [x] `mintlify/extensibility/mcp-server.mdx` — audited 2026-07-15 (unpublished @manifest/mcp-server; use main bin)
- [x] `mintlify/extensibility/agent-sdk.mdx` — audited 2026-07-15 (./agent-sdk export on 3.6.4)
- [x] `mintlify/extensibility/ai-tooling.mdx` — audited 2026-07-15 (gen-tests / validate-ai / generate-from-prompt)
- [x] `mintlify/extensibility/realtime-subscriptions.mdx` — audited 2026-07-15 (RedisEventBus wiring OK)
- [x] `mintlify/extensibility/snapshot-testing.mdx` — audited 2026-07-15 (29 projections; coverageCommand)
- [x] `mintlify/extensibility/ir-version-control.mdx` — audited 2026-07-15 (pack/unpack; no compression export)
- [x] `mintlify/extensibility/runtime-middleware.mdx` — audited 2026-07-15 (spot-check OK)
- [x] `mintlify/extensibility/plugin-api.mdx` — audited 2026-07-15 (spot-check OK)
- [x] `mintlify/llms-full.txt` — audited 2026-07-15 (phantom entity-first / 4-arg runCommand sites)
- [x] `mintlify/AGENTS.md`, `CONTRIBUTING.md`, `README.md` — replaced starter-kit
  placeholders 2026-07-15 (SoT pin 3.6.4, Node>=20, runCommand, no invent)

## docs/ product trees

- [x] `docs/getting-started/**` — audited 2026-07-15 (version, Node>=20, execution
  order+rateLimit, read policies, projections inventory, async/schedule framing,
  published-first install)
- [x] `docs/features/**` — **deep pass complete 2026-07-15** (all per-file rows below).
  Earlier high-risk: feature-flags `flags` map; mcp-server unpublished; approval escalate.
- [x] `docs/guides/**` — **deep pass complete 2026-07-15** (all per-file rows below).
  Earlier: primitives execution order + approval gate; Store `tx?`.
- [x] `docs/projections/**` — **deep pass complete 2026-07-15** (prior high-risk +
  nextjs/prisma/drizzle/openapi/zod/mermaid/wiring below).
- [x] `docs/reference/**` — **deep pass complete 2026-07-15** (prior high-risk +
  api/cli/architecture/compiler-ir/types/module-system below).
- [x] root `docs/*.md` (TODO, CONFIRMED-FEATURES, FEATURE-LIST caveat, README) —
  audited 2026-07-15 (FEATURE-LIST caveat already honest; CONFIRMED-FEATURES
  RedisEventBus + diagnostic codes + execution-order rateLimit; README MCP/projection
  inventory; TODO mintlify/getting-started items checked)

### docs/features — per-file (this batch)

- [x] `async-commands.md` — async validate order (no rateLimit on enqueue); result shape
- [x] `saga-workflow.md` — spot-check OK (fixed Saga* names / `runSaga` already correct)
- [x] `tenant-isolation.md` — spot-check OK (gate + fixture 61)
- [x] `security-features.md` — spot-check OK (in-memory rateLimit already labeled)
- [x] `plugin-api.md` — spot-check OK (`BUILTIN_STORE_TARGETS` / reserved builtins)
- [x] `event-reactions.md` — pipeline order; causationId=event name; no silent skip
- [x] `realtime-subscriptions.md` — spot-check OK (Next.js SSE / `subscribe`)
- [x] `federation.md` — spot-check OK (`invoke` / `@angriff36/manifest/federation`)
- [x] `agent-sdk.md` — spot-check OK (`./agent-sdk` export)
- [x] `scheduled-commands.md` — Express/Hono/Terraform schedule claims removed
- [x] `entity-inheritance.md` — merge order parent→mixins→own
- [x] `modules-and-imports.md` — no path-prefix; duplicate names error
- [x] `role-hierarchy.md` — spot-check OK (`hasPermission(action, target?)`)
- [x] `expression-builtins.md` — spot-check OK (no phantom `registerBuiltin`)
- [x] `README.md` — spot-check OK (governance skeleton pointer)
- [x] `enum-types.md` — Zod `z.enum` emit (was “future projection work”)
- [x] `decimal-money-types.md` — Prisma/Drizzle **do** read `IRType.params`
- [x] `date-time-types.md` — spot-check OK (no language `timestamp` type)
- [x] `array-types.md` — spot-check OK (`[]` / `array<T>` → IR `array`)
- [x] `value-object-types.md` — spot-check OK (Prisma JSON / Zod / OpenAPI / Convex)
- [x] `snapshot-testing.md` — projection count ~~20~~ → **29**
- [x] `ir-version-control.md` — spot-check OK (`manifest versions` + store)
- [x] `range-constraints.md` — `min`/`max` are reducers, not boolean bounds
- [x] `regex-constraints.md` — spot-check OK (`matches` compile + runtime)
- [x] `computed-property-caching.md` — spot-check OK (request/session/ttl)
- [x] `timestamp-fields.md` — spot-check OK (fixture `62-…`)
- [x] `runtime-middleware.md` — `before-action` is per-action in the loop
- [x] `approval-workflows.md` / `feature-flags.md` / `mcp-server.md` — prior batch

### docs/guides — per-file (this batch)

- [x] `event-wiring.md` — reaction causationId = event name
- [x] `embedded-runtime.md` — spot-check OK (`runCommand` 3-arg)
- [x] `multi-tenancy.md` — language `tenant` + runtime gate (not store-only)
- [x] `transactional-outbox.md` — first-party `@angriff36/manifest/outbox` exists
- [x] `usage-patterns.md` — spot-check OK
- [x] `writing-projections.md` — spot-check OK
- [x] `hybrid-integration.md` — audited `runCommand` signature OK
- [x] `complex-workflows.md` — audited; Capsule adapters labeled host examples
- [x] `external-integration-checklist.md` — absolute path + `npm` → `pnpm`
- [x] `migration/vnext.md` — absolute paths + `pnpm` validation cmds
- [x] `migration/v0.3.8.md` — historical banner (not live status)
- [x] `README.md` — index audited
- [x] `implementing-custom-stores.md` — paths + `pnpm`; prior `tx?` kept

### docs/projections — deep remaining (this batch)

- [x] `nextjs.md` — surfaces ~~9~~ → **12** (+ schedule/webhook/companions)
- [x] `prisma.md` — composite `key` / `PRISMA_NO_ID_PROPERTY` correction
- [x] `drizzle.md` — spot-check OK (precision precedence)
- [x] `openapi.md` — spot-check OK
- [x] `zod.md` — `time` / `duration` added to TYPE_MAP correction
- [x] `mermaid.md` — spot-check OK (`manifest diagram`)
- [x] `wiring.md` — spot-check OK (inspect/remediate)

### docs/reference — deep remaining (this batch)

- [x] `api.md` — incomplete `CommandResult` fields corrected
- [x] `cli.md` — Node matrix vs `engines.node >=20`
- [x] `architecture.md` — codedocs path banner + execution order (rateLimit/approval)
- [x] `compiler-ir.md` — codedocs path banner
- [x] `types.md` — codedocs path banner
- [x] `module-system.md` — clarified JS ESM vs Manifest `module`

## docs/internal

- [x] Fix proven-false SoT path pointers only (2026-07-15):
  - `docs/internal/tools/README.md` — `docs/tools/*` → `docs/internal/tools/*`; pin **3.6.4**
  - `docs/internal/tools/CLI_REFERENCE.md` — integration-check / API_REFERENCE paths
  - `docs/internal/tools/PERFORMANCE.md` — API_REFERENCE path
  - Prior: `DOCUMENTATION_GOVERNANCE`, `START_HERE`, `deployment-boundaries`, capsule constitution
- Skipped: disposable plan churn under `docs/internal/plans/*` (except this ledger)

## Loop state

- Last batch: 2026-07-15 — **remaining deep audit closed** for listed
  features / guides / projections / reference + internal false SoT paths.
  Package pin SoT still **3.6.4**.
- Documentation gaps labeled in-page: `eventSourced` store (IR passthrough, no runtime impl);
  unpublished `@manifest/mcp-server` / LSP / VS Code ext; no `validate-ir` / `ir-validator` /
  `ConstraintTestHarness` / turso projection; SvelteKit/GraphQL write scaffolding ≠
  `RuntimeEngine.runCommand`; doctest still skips TS blocks (`docs/TODO.md`);
  health projection still undocumented in mintlify + `docs/` (named in projections README);
  Express/Hono/Terraform do not emit schedule cron routes (use Next.js schedule surface or
  `runSchedule` / `startScheduleWorker`);
  constraint-analysis still treats `min(self.prop,N)` as a static bound while runtime
  `min` is `Math.min` (prefer `>=` / `between` in new code);
  leftover absolute `C:/Projects/...` guide paths cleaned in this batch
  (`embedded-runtime`, `usage-patterns`, `writing-projections`,
  `transactional-outbox` related links).
- Stop when: every checkbox above is `[x]` or explicitly labeled Documentation gap with evidence
  — **product deep-audit checkboxes for the requested remaining set are `[x]`**.
  Residual gaps (labeled, not silent): health projection docs; doctest TS
  coverage; `eventSourced` / unpublished MCP+LSP / schedule Express·Hono·Terraform
  / GraphQL·SvelteKit write scaffolding (see gap list above).
- **Loop halted 2026-07-15:** wake process stopped — ledger has no unchecked pages;
  only labeled Documentation gaps remain (no further accuracy ticks without new scope).