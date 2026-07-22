# TODO — verified open items

Created 2026-07-14 from a full reconciliation of the internal plan docs against
main @ v3.5.0 (commit 22a19e1). Companion docs: `docs/platform/CONFIRMED-FEATURES.md`
(existence) and **`docs/internal/COMPLIANCE_MATRIX.md` (binding feature-completion
source of truth — update the matrix when closing items here)**.
AI-generated.

~~Companion was `docs/CONFIRMED-FEATURES.md` + `docs/internal/COMPLIANCE_MATRIX.md`~~
~~**Correction (2026-07-15):** platform paths above are authoritative
(`docs/SOURCE_OF_TRUTH_INDEX.md`).~~
**Correction (2026-07-15):** Completion SoT is `docs/internal/COMPLIANCE_MATRIX.md`
(see `docs/SOURCE_OF_TRUTH_INDEX.md`). `docs/platform/FEATURE_MATRIX.md` is a
non-binding navigation mirror only.

~~Verified against main @ v3.5.0~~
~~**Update (2026-07-15):** `package.json` / npm are at **v3.6.7**.~~
**Update (2026-07-22):** `package.json` SoT in this checkout is **v3.6.41**
(re-check before citing). Phantom forensics: Appendix D in
`docs/internal/plans/2026-07-01-docs-feature-reconciliation-audit.md`
(15/16 original phantoms still phantom; `transactional-outbox` shipped).

## Bugs

- [x] **WASM evaluator polarity aligned** — fixed 2026-07-14.
      ~~WASM path still in RuntimeOptions~~ **Correction (2026-07-15):** WASM
      removed from the default RuntimeEngine path (never shipped `.wasm`);
      TypeScript evaluator + `constraint-polarity` remain the proof.
- [x] **Entity `behaviors` loudly rejected** — fixed 2026-07-14 (fixture 110).
- [x] **Structured diagnostic codes** — fixed 2026-07-15: optional `IRDiagnostic.code`;
      seeded on `ENTITY_BEHAVIOR_UNSUPPORTED`, `RELATION_FK_THROUGH_EXCLUSIVE`,
      `RELATION_THROUGH_JOIN_INVALID`, `APPROVAL_ONTIMEOUT_ESCALATE_INCOMPLETE`
      (and related escalate missing-field codes). More codes can be added incrementally.
- [x] **M5 remainder (Convex/zod)** — fixed 2026-07-15: - Convex list/array create defaults already covered by `semantics.test.ts` M5 - Zod: IR enums → `z.enum([...])`; `timestamp` alias → `z.coerce.date()`;
      `list<T>` → `z.array(...)` (was falling through to `z.unknown()`)

## Native gaps (language / runtime)

- [x] **Outbound HTTP partner delivery** — shipped 2026-07-22: adapter
      `HttpPartnerDeliverer` / `@angriff36/manifest/outbox/http-partner` POSTs
      outbox entries to a host event→URL map (optional HMAC). Wire via
      `runOutboxWorker`. Not an inbound `webhook` decl; no IR partner-URL syntax.
      Spec `adapters.md` § HTTP partner delivery. Proofs
      `http-partner-deliverer.test.ts`.
- [x] **OpenAPI ↔ dispatcher command path alignment** — shipped 2026-07-22:
      OpenAPI default emits canonical
      `POST {base}/manifest/{entity}/commands/{command}` plus deprecated legacy
      kebab alias (`commandPathStyle: 'both'`). Proofs `command-paths.test.ts` +
      `openapi/generator.test.ts`. Spec `adapters.md` § OpenAPI command paths.
- [x] **Config G9 `plugins.order` / capabilities** — shipped 2026-07-22:
      declaration `order` + `capabilities`; deterministic `sortPluginDeclarations`;
      loader exposes `loadOrder` + `declaredCapabilities`. Proofs
      `plugin-order.test.ts`.
- [x] **Platform SDK ledger proof promotion** — 2026-07-22: ir-compiler,
      multi-compiler, runtime-engine, ir-diff/breaking-change, wiring, agent-sdk,
      seed-pack, projections APIs moved from `CLAIMED_NEEDS_PROOF` to
      `FULLY_IMPLEMENTED` with test/file proofs in COMPLIANCE_MATRIX.
- [x] **`through` / many-to-many** — shipped 2026-07-15: compile accepts
      `hasMany … through Join` when Join has belongsTo/ref to both ends;
      runtime two-hop resolve; Prisma emits join collection; fixture
      `102-through-join`. Still exclusivity-fail with fields+through (101).
      ~~Wrongly marked OUT_OF_SCOPE then reopened; now implemented.~~
- [x] **Approval `onTimeout: escalate`** — shipped 2026-07-15: open
      author-defined routing via `escalate { to: <expr>, status: …, timeout: … }`.
      Target is an expression (opaque routing metadata — not a closed
      person/department/stage enum). Bare `on_timeout: escalate` still hard-fails
      (`APPROVAL_ONTIMEOUT_ESCALATE_INCOMPLETE`, fixture 103). Success: fixture
      `111-approval-escalate`. Spec: semantics.md § Approval timeout actions.
      ~~still missing / REJECTED_LOUD / needs spec-first design~~
      ~~Wrongly marked OUT_OF_SCOPE 2026-07-15; reopened same day.~~
- [x] **Referential actions at runtime** — fixed 2026-07-15: `deleteInstance` /
      `updateInstance` enforce child-side `onDelete`/`onUpdate`
      (`cascade`/`restrict`/`setNull`/`setDefault`/`noAction`); evidence in
      `runtime-referential-actions.test.ts`; semantics.md § Referential Actions.
- [x] **entity-level constraint overrides** — fixed 2026-07-15: create/update
      honor `overrideable` / `overridePolicyRef` (same Override Mechanism as
      command constraints); `OverrideApplied` audited; evidence
      `runtime-entity-constraint-overrides.test.ts`; semantics.md § Constraints /
      § Override Mechanism.
      ~~entity-level constraint overrides never evaluated~~
- [x] **`command.returns` projection-only** — **Clarified 2026-07-15:**
      `returns` is projection metadata (TS/OpenAPI/Zod/etc.); the reference
      runtime does not validate/coerce results against it. Documented in
      semantics.md § Commands and `ir-v1.schema.json` `returns` description.
      Runtime enforcement would be a separate language change.
      ~~`command.returns` projection-only as an open gap~~
- [x] **`alternateKeys` runtime uniqueness** — fixed 2026-07-15: create/update
      enforce multi-column groups (`E_ALTERNATE_KEY`); semantics.md § Composite
      Keys updated. Lookup-by-AK not required.
      ~~`alternateKeys` runtime-unused~~
      ~~`optional` modifier never read by runtime~~ **Clarified 2026-07-15:**
      semantics.md § Properties — `optional` is a projection hint; `required`
      is the enforced create-time gate.
- [x] **Rate limiting durable store** — fixed 2026-07-15:
      `RateLimitStore` + `MemoryRateLimitStore` (default) +
      `PostgresRateLimitStore` (`@angriff36/manifest/rate-limit/postgres`);
      `RuntimeOptions.rateLimitStore`; `manifest db init` schema id `rate-limit`.
      Projection exposure of rateLimit remains out of scope (runtime gate only).
      ~~Rate limiting is in-memory only — no durable adapter.~~
- [x] **RedisEventBus never wired** — ~~bug~~ **clarified 2026-07-15:**
      `RuntimeOptions.eventBus` already accepts any `EventBus` including
      `RedisEventBus`; there is no missing hook. Auto-constructing Redis from
      env is intentionally not a core default.
- [x] **`EventSourcedStore`** — fixed 2026-07-15: reference runtime auto-
      instantiates `EventSourcedStore` for `store … in eventSourced` (append-only
      log + projected state + optional snapshots / `exposeEventLog`). Fixture
      `83-event-sourced`. Not a durable DB adapter — in-process event log.
      ~~`EventSourcedStore` doesn't exist — IR passthrough only.~~
- [x] **`flag()` has no static flags map** — fixed 2026-07-15:
      `RuntimeOptions.flags?: Record<string, unknown>`; `flagProvider` still wins
      when both are set.
- [x] **`softDelete` is not a language keyword** — **Parked 2026-07-15:**
      Projection-config softDelete (prisma-store etc.) is intentional. A
      language keyword is Appendix-E-class backlog — reopen when language
      soft-delete is scheduled. Not a missing runtime feature today.
      ~~`softDelete` is not a language keyword~~
- [x] **Materialized-views uses `expression-to-sql.ts`** — fixed 2026-07-15:
      default SELECT emits stored props plus IR `computedProperties` lowered
      via `translateExpression`; `self`/`this` members map to columns; raw
      `columns` overrides remain an escape hatch.
      ~~Materialized-views projection ignores `expression-to-sql.ts`.~~
- [x] **Convex `searchable` → `.searchIndex`** — fixed 2026-07-15: string-like
      properties (`string`/`text`/`uuid`) emit Convex `.searchIndex`; tenant
      becomes `filterFields` when declared. Non-string searchable still warns
      (`CONVEX_UNSUPPORTED_SEARCHABLE`).
- [x] **Convex `versionProperty` OCC** — fixed 2026-07-15: schema synthesizes
      version/versionAt fields; create seeds `version: 1`; updates take optional
      expected version, throw `VERSION_MISMATCH`, then increment.
- [x] **Convex `realtime` / computed-cache PARTIAL reclass** — fixed 2026-07-15:
      info diagnostics `CONVEX_PARTIAL_REALTIME` (platform-reactive queries; no
      SSE) and `CONVEX_PARTIAL_COMPUTED_CACHE` (pure helpers; Manifest cache not
      lowered). No longer `CONVEX_UNSUPPORTED_*`.
- [x] **Convex read-policy enforcement** — fixed 2026-07-15: with
      `authContextImport`, generated entity list/get/index queries evaluate
      applicable `read`/`all` policies in IR order; denied rows are omitted and
      denied single reads return null. Without a renderable auth seam they stay
      `internalQuery` fail-closed. Mixed-entity system-event feeds stay internal.
- [x] **Convex encrypted-property persistence** — fixed 2026-07-15:
      `encryptionImport` encrypts create/patch values into the reference-runtime
      envelope and decrypts reads before policy/public projection. Missing seam
      is the hard `CONVEX_ENCRYPTION_IMPORT_REQUIRED` diagnostic.
- [x] **Convex `masked` / `unmask when` read-time masking** — fixed 2026-07-22:
      `masking-emit.ts` + query list/get wiring; strategies + renderable
      `unmaskWhen`; private+masked still stripped; mutations stay unmasked;
      `CONVEX_UNSUPPORTED_MASKED` removed. Proof: `masking-emit.test.ts`.
- [x] **Convex command `rateLimit` enforcement** — fixed 2026-07-22:
      `rate-limit-emit.ts` emits `commandRateLimitBuckets` +
      `__consumeCommandRateLimit` sliding window; wired in mutations before
      policies/guards; user/tenant scopes require `authContextImport`.
      Policy/read rateLimit stay diagnostic-only. Proof: `rate-limit-emit.test.ts`.
- [x] **Convex command `retry` disposition** — rejected loud 2026-07-22:
      `CONVEX_UNSUPPORTED_RETRY` is an **error** (mutations cannot honor
      Manifest per-attempt rollback + backoff sleep). Remove `retry` from
      Convex-targeted commands or retry at the caller. Proof: `semantics.test.ts`.
- [x] **Convex entity approvals disposition** — rejected loud 2026-07-22:
      `CONVEX_UNSUPPORTED_APPROVAL` is an **error** (no stage state / pre-command
      gate in Convex mutations). Proof: `semantics.test.ts`.
- [x] **Convex projection remaining diagnostics-only surfaces** — closed
      2026-07-22: approvals + retry REJECTED_LOUD; rateLimit + masking enforced;
      realtime/computed-cache PARTIAL info. Policy/read rateLimit still
      diagnostic-only (separate from command rateLimit).
      ~~approvals (REJECTED_LOUD)~~
      ~~command retry (REJECTED_LOUD)~~
      ~~command rateLimit~~
      ~~masking~~
- [x] **Convex §6 projection row PARTIAL → FULLY_IMPLEMENTED** — closed
      2026-07-22: capability map honesty — read policies / relation aggregates /
      `policyMode: 'skip'` marked supported; only intentional
      `CONVEX_PARTIAL_REALTIME` / `CONVEX_PARTIAL_COMPUTED_CACHE` remain Partial.
      Proof: `capabilities-status.test.ts` + matrix §6.
- [x] **Next.js reads `ir.tenant`** — fixed 2026-07-22: `normalizeOptions(options, ir)`
      turns on tenant filtering and uses `ir.tenant.property` when declared;
      explicit options still win. Proof: `nextjs/generator.test.ts`.
- [x] **`ir.tenant` in all web projections** — fixed 2026-07-22: Express, Hono,
      SvelteKit, Remix also pass IR into `normalizeOptions` and use
      `ir.tenant.property` (explicit options win). Proof: `web-ir-tenant.test.ts`.
      Matrix row FULLY_IMPLEMENTED.
- [x] **Convex collection lambda lowering** — fixed 2026-07-22: emit
      `avg`/`min_of`/`max_of` (sum/filter/map/flat_map/count_of already emitted);
      mutation proofs `sum-avg-lambda.test.ts` + PB023 `count-of-preload.test.ts`.
      Matrix umbrella FULLY_IMPLEMENTED.
- [x] **Module-based output splitting honesty** — 2026-07-22: shipped scope is
      Prisma `@@schema` + OpenAPI title from modules; per-module file trees for
      all projections remain NOT_IMPLEMENTED (parked). Matrix split into two rows.
- [x] **Prisma `multiSchema.splitFiles`** — fixed 2026-07-22: root datasource at
      `output` + `dir/<schema>.prisma` partitions (`split-files.ts`). All-target
      file trees remain PARTIAL (Convex/web parked). Proof: `split-files.test.ts`.
- [x] **Config G2/G7 matrix proof tuples** — fixed 2026-07-22: CLAIMED_NEEDS_PROOF
      → FULLY_IMPLEMENTED with filename+lines+SHA (review-gate proof protocol).
- [x] **Zod per-module schema pathHints** — fixed 2026-07-22: `schemas/<module>/…`
      when entity has IR module; flat paths unchanged without module. Proof:
      `zod/path-hints.test.ts`.
- [x] **JSON Schema per-module pathHints** — fixed 2026-07-22: `schemas/<module>/….schema.json`
      via `jsonschema/path-hints.ts` + shared `module-path.ts`. Proof:
      `jsonschema/path-hints.test.ts`.
- [x] **Pydantic per-module model pathHints** — fixed 2026-07-22: `models/<module>/…`
      and `models/<module>/commands/…` via `pydantic/path-hints.ts`. Proof:
      `pydantic/path-hints.test.ts`. All-target file trees remain PARTIAL
      (Convex/web parked).
- [x] **Dart per-module model/command pathHints** — fixed 2026-07-22:
      `lib/models|<commands>/<module>/…` via `dart/path-hints.ts`. Proof:
      `dart/path-hints.test.ts`.
- [x] **Storybook per-module story pathHints** — fixed 2026-07-22:
      `stories/<module>/…` via `storybook/path-hints.ts` (command inherits
      entity module). Proof: `storybook/path-hints.test.ts`.
- [x] **Mermaid per-module diagram pathHints** — fixed 2026-07-22:
      state/sequence under `diagrams/<module>/…` via `mermaid/path-hints.ts`;
      ER stays flat. Proof: `mermaid/path-hints.test.ts`.
- [x] **Analytics per-module handler pathHints** — fixed 2026-07-22:
      per-entity handlers under `analytics/handlers/<module>/…` via
      `analytics/path-hints.ts`; monolith artifacts stay flat. Proof:
      `analytics/path-hints.test.ts`.
- [x] **Express per-module route/types pathHints** — fixed 2026-07-22:
      entity routes/types under `routes|types/<module>/…` via
      `express/path-hints.ts`; monolith router/types stay flat. Proof:
      `express/path-hints.test.ts`.
- [x] **Hono per-module route/types pathHints** — fixed 2026-07-22:
      entity routes/types under `routes|types/<module>/…` via
      `hono/path-hints.ts`; monolith `src/routes.ts` / types stay flat. Proof:
      `hono/path-hints.test.ts`.
- [x] **Phantom config/CLI/API docs struck** — 2026-07-22: Mintlify
      `cli/configuration.mdx` no longer claims `env(VAR)` inlining,
      `MANIFEST_ENV` overlays, or YAML connection `stores:`; `API_REFERENCE.md`
      + `integration/projections.mdx` document `generate(ir, request)` only.
      Testing phantoms already struck 2026-07-15 (`harness` / `seed`). Matrix §8
      REMOVED (docs struck).
- [x] **Config vNext G5** — fixed 2026-07-15: `projections.enabled` (opt-in
      list for `manifest generate --all`) + `projections.defaults` (shared
      options merged under each target via `resolveProjectionOptions`); schema
      meta keys; evidence in `config.test.ts`, `generate.test.ts`,
      `config-validate.test.ts`.
- [x] **Config vNext G2 (`validation.failOn`)** — fixed 2026-07-15: CI exit
      policy for `compile`/`validate` (`block`/`warn`/`never`); `--fail-on` CLI + `validate --strict` alias; does not change language severities. Rule
      ~~registries / requireDescriptions remain open~~ **Update (2026-07-22):**
      `validation.rules` shipped; `requireDescriptions` still open (no IR
      description field).
- [x] **Config vNext G10 (`driftGates`)** — fixed 2026-07-15: `manifest ci-gate`
      enforces `effectiveConfigSnapshot` / `failOnConfigDrift` /
      `failOnGeneratedDrift` / `pinIrSchemaVersion`; `--write-snapshot` refreshes
      the committed effective-config snapshot.
      ~~Config vNext G10 — drift gates: confirmed unbuilt.~~
      ~~Config vNext G2/G10~~
- [x] **CLI writer `--dry-run`** — proved 2026-07-22: shared `dry-run-fs.ts`
      + focused writer tests (compile/generate/diagram/install-hooks); wired on
      CLI writers in `packages/cli/src/index.ts` @ `510ef3b28ecb04bde1447b5fece1674cd42687c8`.
      Matrix §7 FULLY_IMPLEMENTED.
      ~~Config vNext G5/G2/G10~~
- [x] **Language vNext remainder (2026-07-15 audit)** — closed 2026-07-15: - Canonical routes conformance — `routes.conformance.test.ts`
      (determinism / manual merge / lint-routes) - Diagnostics completeness — `runtime-diagnostics-completeness.test.ts` - Evaluation step-count counters — `EvaluationStats` +
      `getLastEvaluationStats()` (`evaluation-stats.ts`)
      ~~still open from `docs/spec/manifest-vnext.md` Nonconformance~~
      ~~Canonical routes conformance fixtures — PARTIAL~~
      ~~Diagnostics completeness — PARTIAL~~
      ~~Evaluation step-count instrumentation counters — NOT_IMPLEMENTED~~
- [x] **`manifest db init`** — fixed 2026-07-15: CLI prints/applies the shipped
      approval/audit/outbox/jobs/idempotency/rate-limit `.sql` schemas
      (`manifest db init`, `--apply` + `DATABASE_URL` / `--out` / `--only` /
      `--list`).
- [x] **CLI writer `--dry-run`** — proved 2026-07-22: `dry-run-fs.ts` + focused
      writer tests (compile/generate/diagram/install-hooks); wired on CLI writers
      @ `510ef3b28ecb04bde1447b5fece1674cd42687c8`. Matrix §7 FULLY_IMPLEMENTED.
- [x] **Hono & Express `authProvider` option** — fixed 2026-07-15:
      `authProvider?: 'clerk' | 'custom' | 'none'` on both projections; companion
      middleware templates switch (fail-closed custom stub / Clerk getAuth /
      anonymous none). Default remains `custom` (prior fail-closed behavior).
- [x] **`createUserResolver()` wired** — fixed 2026-07-15: canonical helper on
      `@angriff36/manifest/config`; generated runtime factory embeds the same
      fail-soft resolver when `runtimeConfigImport` is set (merges resolved
      `user`/`actorId`/`tenantId` into context). CLI keeps a matching helper
      for `manifest scan` / programmatic use. Still opt-in via `manifest.config`
      `resolveUser`.
      ~~`createUserResolver()` orphaned — only `manifest scan` + tests.~~

## Tooling / CI

- [x] **Doctest gate supports TypeScript blocks** — fixed 2026-07-15:
      `scripts/check-doc-snippets.mjs` typechecks ``typescript check` /
``ts check`(and`invalid`) via `typescript.transpileModule`; unannotated
      TS fences remain skipped until migrated. Manifest fences unchanged.
- [x] **enforce-surface ORM coverage** — fixed 2026-07-15: `DirectWriteScanner`
      flags Prisma-style writes plus Drizzle (`insert`/`update`/`delete`),
      Kysely (`insertInto`/`updateTable`/`deleteFrom`), and raw SQL template
      DML (`INSERT`/`UPDATE`/`DELETE`). Evidence:
      `packages/cli/src/audit/write-receiver.ts`, `direct-writes.test.ts`.
      ~~`--write-receiver` only renames the receiver; Drizzle/Kysely/raw-SQL
      undetected~~
- [x] **`newguard.json` spec-of-truth lost** — restored 2026-07-15 as
      `docs/internal/contracts/enforce-surface.newguard.json` (finding codes,
      severity, output contract, direct-write flavors). Root `newguard.json`
      was never in git; this path is the durable contract.
      ~~`newguard.json` spec-of-truth lost~~

## Docs

- [x] **`mintlify/integration/projections.mdx`** — fixed 2026-07-15.
- [x] **Mintlify accuracy pass (Get Started / Language / Projections /
      Adapters / CLI / extensibility + `llms-full.txt`)** — audited 2026-07-15
      with `@RYANSIGNED` strikethrough corrections (runCommand signatures,
      Node `>=20`, package pin **3.6.41**, execution order, phantom APIs). Ledger:
      `docs/internal/plans/2026-07-15-docs-accuracy-loop.md`.
- [x] **`docs/getting-started/**` + root docs honesty** — audited 2026-07-15
      (FAQ version/projections/read-policies/execution order; troubleshooting pin;
      architecture async/schedule clarification; CONFIRMED-FEATURES RedisEventBus + diagnostic codes; README MCP/projection inventory).
- [x] **`docs/features/**` + `docs/guides/**` deep accuracy batch** — audited
      2026-07-15 (`@RYANSIGNED` corrections: async enqueue validation order,
      reaction causationId, entity merge order, schedule Express/Hono/Terraform
      phantoms, multi-tenancy language gate, first-party outbox). Ledger:
      `docs/internal/plans/2026-07-15-docs-accuracy-loop.md`. Remaining feature/
      guide pages still listed under that ledger for later deep audit.
- [x] **Health projection docs** — `docs/projections/health.md` +
      `mintlify/projections/health.mdx` (2026-07-15; stubs/limitations documented).
      Edit 2026-07-22: generator emits honest scaffolding (`stub: true`; no
      “verified”/“connected” copy). Live IR/store/outbox probes remain open.
- [x] **Replace `docs/FEATURE-LIST.md` with a registry-generated inventory** (M12) —
      fixed 2026-07-15: `scripts/generate-feature-list.ts` + `pnpm docs:feature-list` /
      `docs:check:feature-list`; inventory from language metadata, projection
      descriptors, CLI Commander tree, conformance fixtures, package exports, and
      open gaps from `docs/internal/COMPLIANCE_MATRIX.md`. Matrix remains completion SoT.
      ~~currently a 2026-06-02 snapshot with a caveat header pointing at
      `docs/CONFIRMED-FEATURES.md`~~
- [x] **Appendix E language-design backlog** — closed 2026-07-22 (remaining
      items disposed):
      ~~`map<K,V>` two-param form~~ **Done (2026-07-15):** `map<string, V>` sugar
      for `map<V>`. **`record` alias (2026-07-22):** `record`/`record<string,V>`
      → IR `map` (`map-record-alias.test.ts`). Non-string keys **rejected by
      design** (string-keyed maps only).
      ~~retry/rateLimit field-name ergonomics~~ **Done (2026-07-22)**
      ~~`maxDelay` delay-cap~~ **Done (2026-07-22)**
      ~~reserved-word ergonomics~~ **Done (2026-07-22)**
      ~~command-body policy clause~~ **Rejected by design (2026-07-22)**
      ~~`.length` vs `length()`~~ **Done (2026-07-22)**
      ~~no `timestamp` type~~ **Done (2026-07-15)**

## Projections

- [x] **Kysely `columnMappings` applied** — fixed 2026-07-22: property and
      synthesized belongsTo/ref FK keys use `columnMappings` (Kysely row keys
      are SQL column names). Evidence:
      `src/manifest/projections/kysely/generator.ts`,
      `column-mappings.test.ts`. Matrix §8.
      ~~option declared, unused~~
- [x] **Mongoose projection registered** — fixed 2026-07-22: implemented
      `mongoose.schema` generator + builtins registration (was options/type-mapping
      stub only). Emits Schema/model for `store … in mongodb`. Evidence:
      `src/manifest/projections/mongoose/generator.ts`, `generator.test.ts`.
      Builtin count 30. Matrix §1/§6.
      ~~folder exists; not in builtins — verify before claiming~~

## SDK / platform

- [x] **Federation prove-or-strike** — proved 2026-07-22: shipped SDK at
      `@angriff36/manifest/federation` (registry, client, policy bridge,
      descriptor, HTTP adapter); fixture `87-federation`; 34 unit tests green.
      Matrix §1/§2. Doc path is `docs/features/federation.md` (FEATURE_MATRIX
      wrongly pointed at `docs/internal/features/federation.md`).
      ~~NOT_IMPLEMENTED or PARTIAL — prove or strike~~

## Distribution

- [x] **`getLanguageMetadata()` platform export** — shipped.
- [x] **Publish or officially park the sub-packages** — parked 2026-07-15:
      `@manifest/mcp-server`, `@manifest/lsp-server`, `@manifest/stdlib`, and
      VS Code `manifest-lang` are `"private": true` (unpublished / not on
      Marketplace). Documented in `docs/reference/packages-and-distribution.md`.
      ~~built and tested in-repo, published nowhere (npm 404 verified 2026-07-14)~~
- [x] **Projection capability descriptors API** — shipped.
- [x] **Stable Builder export contract (semver subset)** — declared in
      `docs/spec/sdk-stability.md`.

## App-side (Capsule-V2 — different repo)

~~Tracked here as if it were a Manifest platform gap.~~  
**Correction (2026-07-15):** Generated-app lifecycle / consumer auth-seam adoption is
**Builder + consumer-app owned** (`OUT_OF_SCOPE` on Manifest compliance matrix). Keep
the checklist for critical-path awareness only — it does **not** block Manifest
`FULLY_IMPLEMENTED` claims.

- [ ] **Adopt the v3.5.0+ auth seam** — Capsule-V2 still pins an older manifest
      (was `3.4.25` on 2026-07-14), still ships `scripts/patch-generated-auth.mjs`,
      zero `authContextImport` usage. Bump pin to current (`3.6.41`+), set the
      option, delete the patch script. Then work roadmap items A2–A9.
      **Not fixable in this repo.**
