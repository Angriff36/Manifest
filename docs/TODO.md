# TODO — verified open items

Created 2026-07-14 from a full reconciliation of the internal plan docs against
main @ v3.5.0 (commit 22a19e1). Companion docs: `docs/CONFIRMED-FEATURES.md`
(existence) and **`docs/internal/COMPLIANCE_MATRIX.md` (binding feature-completion
source of truth — update the matrix when closing items here)**.
AI-generated.

~~Verified against main @ v3.5.0~~
**Update (2026-07-15):** `package.json` / npm are at **v3.6.4**. Phantom
forensics: Appendix D in
`docs/internal/plans/2026-07-01-docs-feature-reconciliation-audit.md`
(15/16 original phantoms still phantom; `transactional-outbox` shipped).

## Bugs

- [x] **WASM evaluator polarity aligned** — fixed 2026-07-14.
- [x] **Entity `behaviors` loudly rejected** — fixed 2026-07-14 (fixture 110).
- [x] **Structured diagnostic codes** — fixed 2026-07-15: optional `IRDiagnostic.code`;
      seeded on `ENTITY_BEHAVIOR_UNSUPPORTED`, `RELATION_FK_THROUGH_EXCLUSIVE`,
      `RELATION_THROUGH_JOIN_INVALID`, `APPROVAL_ONTIMEOUT_ESCALATE_UNSUPPORTED`
      (and related). More codes can be added incrementally.
- [x] **M5 remainder (Convex/zod)** — fixed 2026-07-15:
      - Convex list/array create defaults already covered by `semantics.test.ts` M5
      - Zod: IR enums → `z.enum([...])`; `timestamp` alias → `z.coerce.date()`;
        `list<T>` → `z.array(...)` (was falling through to `z.unknown()`)

## Native gaps (language / runtime)

- [x] **`through` / many-to-many** — shipped 2026-07-15: compile accepts
      `hasMany … through Join` when Join has belongsTo/ref to both ends;
      runtime two-hop resolve; Prisma emits join collection; fixture
      `102-through-join`. Still exclusivity-fail with fields+through (101).
      ~~Wrongly marked OUT_OF_SCOPE then reopened; now implemented.~~
- [ ] **Approval `onTimeout: 'escalate'`** — still missing. Rejected today with
      `APPROVAL_ONTIMEOUT_ESCALATE_UNSUPPORTED` (fixture 103); schema allows
      only `cancel`. Escalation semantics need a spec-first design before
      implementation — still an open gap, not a closed decision to never ship it.
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
- [ ] **`softDelete` is not a language keyword** — only a prisma-store / projection
      config option. **Clarified 2026-07-15:** still open only if language-level
      soft-delete is scheduled; projection-config softDelete is intentional and
      not a runtime gap.
- [x] **Materialized-views uses `expression-to-sql.ts`** — fixed 2026-07-15:
      default SELECT emits stored props plus IR `computedProperties` lowered
      via `translateExpression`; `self`/`this` members map to columns; raw
      `columns` overrides remain an escape hatch.
      ~~Materialized-views projection ignores `expression-to-sql.ts`.~~
- [ ] **Convex projection diagnostics-only surfaces** — approvals, masking,
      searchable, versionProperty, computed-cache, realtime, retry, rateLimit emit
      `CONVEX_UNSUPPORTED_*` diagnostics (good) but generate no Convex enforcement.
- [ ] **Config vNext G5/G2/G10** — `projections.enabled/defaults`,
      `validation.failOn`, drift gates: confirmed unbuilt (`src/manifest/config.ts`).
- [x] **`manifest db init`** — fixed 2026-07-15: CLI prints/applies the shipped
      approval/audit/outbox/jobs/idempotency/rate-limit `.sql` schemas
      (`manifest db init`, `--apply` + `DATABASE_URL` / `--out` / `--only` /
      `--list`).
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
      `scripts/check-doc-snippets.mjs` typechecks ```typescript check` /
      ```ts check` (and `invalid`) via `typescript.transpileModule`; unannotated
      TS fences remain skipped until migrated. Manifest fences unchanged.
- [ ] **enforce-surface ORM coverage** — `--write-receiver` only renames the
      receiver; Drizzle (`db.insert(t).values()`) and Kysely (`.insertInto()`)
      call shapes and raw-SQL template-literal writes are still undetected.
- [ ] **`newguard.json` spec-of-truth lost** — the enforce-surface plan's contract
      file was never committed (checked `git log --all`); recreate it somewhere
      durable if that contract still matters.

## Docs

- [x] **`mintlify/integration/projections.mdx`** — fixed 2026-07-15.
- [x] **Mintlify accuracy pass (Get Started / Language / Projections /
      Adapters / CLI / extensibility + `llms-full.txt`)** — audited 2026-07-15
      with `@RYANSIGNED` strikethrough corrections (runCommand signatures,
      Node `>=20`, package pin **3.6.4**, execution order, phantom APIs). Ledger:
      `docs/internal/plans/2026-07-15-docs-accuracy-loop.md`.
- [x] **`docs/getting-started/**` + root docs honesty** — audited 2026-07-15
      (FAQ version/projections/read-policies/execution order; troubleshooting pin;
      architecture async/schedule clarification; CONFIRMED-FEATURES RedisEventBus
      + diagnostic codes; README MCP/projection inventory).
- [x] **`docs/features/**` + `docs/guides/**` deep accuracy batch** — audited
      2026-07-15 (`@RYANSIGNED` corrections: async enqueue validation order,
      reaction causationId, entity merge order, schedule Express/Hono/Terraform
      phantoms, multi-tenancy language gate, first-party outbox). Ledger:
      `docs/internal/plans/2026-07-15-docs-accuracy-loop.md`. Remaining feature/
      guide pages still listed under that ledger for later deep audit.
- [ ] **Health projection undocumented** in both mintlify and docs/.
- [ ] **Replace `docs/FEATURE-LIST.md` with a registry-generated inventory** (M12) —
      currently a 2026-06-02 snapshot with a caveat header pointing at
      `docs/CONFIRMED-FEATURES.md` (caveat verified honest 2026-07-15).
- [ ] **Appendix E language-design backlog** (recorded, never scheduled):
      `map<K,V>` two-param form, retry/rateLimit field-name ergonomics,
      reserved-word ergonomics, command-body policy clause, `.length` vs
      `length()`, no `timestamp` type (note: zod now accepts `timestamp` as a
      datetime alias; language/spec still use `datetime`).

## Distribution

- [x] **`getLanguageMetadata()` platform export** — shipped.
- [ ] **Publish or officially park the sub-packages** — `@manifest/mcp-server`,
      `@manifest/lsp-server`, `@manifest/stdlib` (all 0.1.0), VS Code extension
      `manifest-lang` 0.3.0: built and tested in-repo, published nowhere
      (npm 404 verified 2026-07-14; marketplace unverified).
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
      zero `authContextImport` usage. Bump pin to current (`3.6.4`+), set the
      option, delete the patch script. Then work roadmap items A2–A9.
      **Not fixable in this repo.**
