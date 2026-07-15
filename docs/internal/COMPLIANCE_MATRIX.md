---
title: Manifest Feature Completion Compliance Matrix
created: 2026-02-28
updated: 2026-07-15
source_of_truth: true
scope: Feature completion status for EVERY Manifest language, runtime, store, projection, tooling, and distribution surface
authority: Binding — agents and humans MUST treat this file as the source of truth for whether a feature is complete
companion_semantics: docs/spec/ir/ir-v1.schema.json → docs/spec/semantics.md → docs/spec/builtins.md → docs/spec/adapters.md → conformance fixtures
companion_inventory: docs/CONFIRMED-FEATURES.md (existence claims; must reconcile to this matrix)
companion_checklist: docs/TODO.md
---

# Manifest Compliance Matrix

**Authority:** Binding for feature-completion claims.  
**Enforced by:** `AGENTS.md` / `CLAUDE.md` / `docs/internal/DOCUMENTATION_GOVERNANCE.md` (`@RYAN_APPROVED 2026-07-15`).

~~Earlier 2026-07-15 drafts of this matrix only listed ~12 proven fixes + ~30 gaps and a short “existence” dump — that was **not** a complete feature inventory.~~  
**Correction (2026-07-15):** This file enumerates language, runtime, stores, **each** registered projection, CLI/SDK, packaging, and open gaps. Rows without filename+lines+commit stay `CLAIMED_NEEDS_PROOF` (or weaker) — never invent `FULLY_IMPLEMENTED`.

## Proof Protocol

| Status                | Meaning                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| `FULLY_IMPLEMENTED`   | End-to-end + tests; **requires** filename + line range + git commit SHA   |
| `PARTIAL`             | Present but incomplete across consumers/layers                            |
| `DIAGNOSTIC_ONLY`     | Loud unsupported path; no full enforcement                                |
| `REJECTED_LOUD`       | Compile/schema rejects until designed                                     |
| `NOT_IMPLEMENTED`     | Missing / passthrough / phantom                                           |
| `OUT_OF_SCOPE`        | Not a Manifest-core deliverable                                           |
| `CLAIMED_NEEDS_PROOF` | Exists in inventory/fixtures but **no** commit proof yet — **not** “done” |

Update this matrix first when closing work; then reconcile `docs/TODO.md` and `docs/CONFIRMED-FEATURES.md`.

---

## 1. Proven complete (`FULLY_IMPLEMENTED` + hard proof)

| Status | Feature                                               | Implementation Status | Proof (file:lines @ commit)                                                                                                                   |
| ------ | ----------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [x]    | Entity `behavior` rejected (no silent drop)           | FULLY_IMPLEMENTED     | `src/manifest/ir-compiler.ts:801-816` @ `3f41cb8da272c7d71efcad242ff498403ec09fd5`                                                            |
| [x]    | Constraint `failWhen` polarity (RuntimeEngine + WASM) | FULLY_IMPLEMENTED     | `src/manifest/constraint-polarity.ts:1-27` @ `55670fdd48891f336064bbbab1d402e5260ebfd7`; `src/manifest/wasm/wasm-evaluator.ts:200-215` @ same |
| [x]    | `getLanguageMetadata()` export                        | FULLY_IMPLEMENTED     | `src/manifest/language-metadata.ts:190-220` @ `11988d6055503c1046ba093cf007cc123778ec5a`; `package.json:275-278`                              |
| [x]    | `PROPERTY_MODIFIERS` single source                    | FULLY_IMPLEMENTED     | `src/manifest/property-modifiers.ts:1-18` @ `11988d6055503c1046ba093cf007cc123778ec5a`                                                        |
| [x]    | `getProjectionCapabilities(name)`                     | FULLY_IMPLEMENTED     | `src/manifest/projections/registry.ts:105-120` @ `2828d0da940de5d5004d65b6d2e1342f66807e4d`                                                   |
| [x]    | Projection descriptors API                            | FULLY_IMPLEMENTED     | `src/manifest/projections/registry.ts:151-175` @ `f335a74128466feaef1ffde8b14d52b1bbcd5eab`                                                   |
| [x]    | Stable Builder export contract                        | FULLY_IMPLEMENTED     | `docs/spec/sdk-stability.md:1-48` @ `11988d6055503c1046ba093cf007cc123778ec5a`                                                                |
| [x]    | `hasMany … through Join` M2M                          | FULLY_IMPLEMENTED     | `src/manifest/ir-compiler.ts:1132-1175` @ `3052dc56c45639f587a687017a13240d34dec997`; fixture `102-through-join`                              |
| [x]    | Referential actions in reference runtime              | FULLY_IMPLEMENTED     | `src/manifest/runtime-referential-actions.ts:1-300` @ `3052dc56c45639f587a687017a13240d34dec997`                                              |
| [x]    | `RuntimeOptions.flags` for `flag()`                   | FULLY_IMPLEMENTED     | `src/manifest/runtime-engine.ts:255-261,1894-1898` @ `3052dc56c45639f587a687017a13240d34dec997`                                               |
| [x]    | Hono/Express `authProvider`                           | FULLY_IMPLEMENTED     | `src/manifest/projections/hono/types.ts:30` @ `1b1e2be9e059e5524021a671dd45eeddf3c7026f`; `express/types.ts:37`                               |
| [x]    | `manifest db init`                                    | FULLY_IMPLEMENTED     | `packages/cli/src/commands/db-init.ts:1-195` @ `2b4f30cf6010e89d3e3e3000c704212fd0574aff`                                                     |
| [x]    | Doctest TS `check`/`invalid` fences                   | FULLY_IMPLEMENTED     | `scripts/check-doc-snippets.mjs:94-117` @ `6ed6549fc70c86cd7e586818175d44715e1332d5`                                                          |
| [x]    | RedisEventBus via `RuntimeOptions.eventBus`           | FULLY_IMPLEMENTED     | `src/manifest/runtime-engine.ts:307` @ `61d5ab6fb1da4dca32e683b45f9934e56dba141c`; `src/manifest/events/redis.ts:55-60`                       |
| [x]    | Durable `RateLimitStore` (Memory + Postgres)          | FULLY_IMPLEMENTED     | `src/manifest/runtime-rate-limit.ts:46-133` @ `fd4bb50a41dbfaf340013389e6023f31b9e23a79`; `src/manifest/rate-limit/stores/postgres.ts:48-137` @ same; `RuntimeOptions.rateLimitStore` `runtime-engine.ts:264,1187` @ same |
| [x]    | `createUserResolver` in config + runtime factory      | FULLY_IMPLEMENTED     | `src/manifest/config.ts:280-299` @ `3c1a4e61f845867cf3881edf42ea63005c17ea4d`; `src/manifest/projections/shared/companions.ts:225-280` @ same |

---

## 2. Language (DSL) — full inventory

Statuses: `CLAIMED_NEEDS_PROOF` until §1-style proof is attached. Fixture IDs are evidence pointers, not commits.

| Status | Feature                                                                                                              | Implementation Status         | Evidence pointer                                                    |
| ------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| [~]    | Entities + typed properties + defaults                                                                               | CLAIMED_NEEDS_PROOF           | fixture `01`                                                        |
| [~]    | Property modifiers (`required`/`unique`/`indexed`/`private`/`readonly`/`optional`/`searchable`/`encrypted`/`masked`) | CLAIMED_NEEDS_PROOF / PARTIAL | compile+IR; runtime `optional` unused (§6)                          |
| [~]    | `extends` inheritance + cycle detection                                                                              | CLAIMED_NEEDS_PROOF           | fixtures `77`–`79`, `81`                                            |
| [~]    | `mixin` composition                                                                                                  | CLAIMED_NEEDS_PROOF           | fixture `78`                                                        |
| [ ]    | Generic / parameterized entities `Entity<T>`                                                                         | NOT_IMPLEMENTED               | fixtures `84`–`85` negative only                                    |
| [~]    | Value objects / embedded types                                                                                       | CLAIMED_NEEDS_PROOF           | fixture `60`                                                        |
| [~]    | Enum types                                                                                                           | CLAIMED_NEEDS_PROOF           | fixture `57`                                                        |
| [~]    | `decimal` / `money` types                                                                                            | CLAIMED_NEEDS_PROOF           | fixture `56`; runtime = number                                      |
| [~]    | `map` / record type                                                                                                  | CLAIMED_NEEDS_PROOF           | fixture `73`                                                        |
| [~]    | Array types `T[]` / `array<T>`                                                                                       | CLAIMED_NEEDS_PROOF           | fixture `40`                                                        |
| [~]    | `date` / `time` / `datetime` / `duration`                                                                            | CLAIMED_NEEDS_PROOF           | fixture `92`                                                        |
| [~]    | Composite primary keys (`key`)                                                                                       | CLAIMED_NEEDS_PROOF           | fixture `109`                                                       |
| [~]    | `alternateKeys` (compile into IR)                                                                                    | CLAIMED_NEEDS_PROOF / PARTIAL | runtime unused (§6)                                                 |
| [~]    | Relationships `hasMany` / `hasOne` / `belongsTo` / `ref`                                                             | CLAIMED_NEEDS_PROOF           | fixtures `02`, `98`, `99`                                           |
| [x]    | Referential actions `onDelete`/`onUpdate`                                                                            | FULLY_IMPLEMENTED             | see §1                                                              |
| [x]    | Many-to-many `through`                                                                                               | FULLY_IMPLEMENTED             | see §1                                                              |
| [~]    | Auto timestamps / `autoNow` (`now()`/`today()`)                                                                      | CLAIMED_NEEDS_PROOF           | fixture `62`                                                        |
| [~]    | `private` / `encrypted` / `masked` privacy                                                                           | CLAIMED_NEEDS_PROOF           | fixtures `91`, `93`                                                 |
| [~]    | `searchable` declarations                                                                                            | CLAIMED_NEEDS_PROOF           | fixture `89`                                                        |
| [~]    | Multi-tenancy (`tenant`)                                                                                             | CLAIMED_NEEDS_PROOF           | fixture `61`                                                        |
| [~]    | Optimistic concurrency `versionProperty`                                                                             | CLAIMED_NEEDS_PROOF           | fixture `24`                                                        |
| [~]    | Commands (params, guards, mutate, emit, emitPayloads)                                                                | CLAIMED_NEEDS_PROOF           | fixture `04`                                                        |
| [~]    | Async / background commands                                                                                          | CLAIMED_NEEDS_PROOF           | fixture `69`                                                        |
| [~]    | Command `retry` policy                                                                                               | CLAIMED_NEEDS_PROOF           | fixture `72`                                                        |
| [~]    | Command/policy `rateLimit`                                                                                           | CLAIMED_NEEDS_PROOF           | fixtures `74`, `75`, `100`                                          |
| [~]    | Computed properties                                                                                                  | CLAIMED_NEEDS_PROOF           | fixture `03`                                                        |
| [~]    | Computed caching (`request`/`session`/`ttl`)                                                                         | CLAIMED_NEEDS_PROOF           | fixture `65`                                                        |
| [~]    | Constraints severity `ok`/`warn`/`block`                                                                             | CLAIMED_NEEDS_PROOF           | fixtures `21`, `36`                                                 |
| [x]    | Constraint `failWhen` polarity                                                                                       | FULLY_IMPLEMENTED             | see §1                                                              |
| [~]    | Constraint override authorization                                                                                    | CLAIMED_NEEDS_PROOF           | fixture `22`                                                        |
| [ ]    | Entity-level constraint overrides evaluated                                                                          | NOT_IMPLEMENTED               | §6                                                                  |
| [~]    | Policies read/write/delete/execute/all/override                                                                      | CLAIMED_NEEDS_PROOF           | fixture `06`                                                        |
| [~]    | State transitions                                                                                                    | CLAIMED_NEEDS_PROOF           | fixture `38`                                                        |
| [~]    | Aggregate `count()` in reactions                                                                                     | CLAIMED_NEEDS_PROOF           | fixture `97`                                                        |
| [~]    | Events + reactions (`on Event run`)                                                                                  | CLAIMED_NEEDS_PROOF           | fixtures `67`, `96`                                                 |
| [~]    | Reaction fan-out                                                                                                     | CLAIMED_NEEDS_PROOF           | fixture `96`                                                        |
| [~]    | Sagas + compensation                                                                                                 | CLAIMED_NEEDS_PROOF           | fixture `88`                                                        |
| [~]    | Approvals (multi-stage, `onTimeout: cancel`)                                                                         | CLAIMED_NEEDS_PROOF           | fixture `68`                                                        |
| [ ]    | Approval `onTimeout: escalate`                                                                                       | REJECTED_LOUD                 | fixture `103`                                                       |
| [~]    | Roles / RBAC hierarchy + deny                                                                                        | CLAIMED_NEEDS_PROOF           | fixture `71`                                                        |
| [~]    | Webhooks + HMAC                                                                                                      | CLAIMED_NEEDS_PROOF           | fixture `90`                                                        |
| [~]    | Schedules cron/interval/every                                                                                        | CLAIMED_NEEDS_PROOF           | fixture `76`                                                        |
| [~]    | Store declarations                                                                                                   | CLAIMED_NEEDS_PROOF           | multiple fixtures                                                   |
| [~]    | Modules + `use` imports                                                                                              | CLAIMED_NEEDS_PROOF           | module-resolver tests                                               |
| [~]    | Regex constraints                                                                                                    | CLAIMED_NEEDS_PROOF           | `docs/features/regex-constraints.md`                                |
| [~]    | Range constraints                                                                                                    | CLAIMED_NEEDS_PROOF           | `docs/features/range-constraints.md`                                |
| [~]    | Security features surface (doc)                                                                                      | CLAIMED_NEEDS_PROOF / PARTIAL | `docs/features/security-features.md` — verify vs privacy/encryption |
| [ ]    | Federation                                                                                                           | NOT_IMPLEMENTED or PARTIAL    | `docs/features/federation.md` — prove or strike                     |
| [ ]    | Realtime subscriptions (language/runtime)                                                                            | PARTIAL / DIAGNOSTIC_ONLY     | Convex diagnostic; Next.js may differ — prove per target            |
| [x]    | Entity `behavior` blocks                                                                                             | REJECTED_LOUD → proven reject | see §1 / fixture `110`                                              |
| [ ]    | Language keyword `softDelete`                                                                                        | NOT_IMPLEMENTED               | projection config only                                              |
| [ ]    | Appendix E: `map<K,V>` two-param form                                                                                | NOT_IMPLEMENTED               | backlog                                                             |
| [ ]    | Appendix E: retry/rateLimit field-name ergonomics                                                                    | NOT_IMPLEMENTED               | backlog                                                             |
| [ ]    | Appendix E: command-body policy clause                                                                               | NOT_IMPLEMENTED               | backlog                                                             |
| [ ]    | Appendix E: `.length` vs `length()`                                                                                  | NOT_IMPLEMENTED               | backlog                                                             |
| [ ]    | Language type `timestamp` (vs `datetime`)                                                                            | NOT_IMPLEMENTED               | zod alias only                                                      |

---

## 3. Expression builtins (47)

| Status | Feature                                        | Implementation Status                  | Evidence pointer                            |
| ------ | ---------------------------------------------- | -------------------------------------- | ------------------------------------------- |
| [~]    | Core `now`, `uuid`                             | CLAIMED_NEEDS_PROOF                    | `RuntimeEngine.getBuiltins()`; fixture `16` |
| [~]    | String builtins (trim…search)                  | CLAIMED_NEEDS_PROOF                    | builtins.md                                 |
| [~]    | Math builtins                                  | CLAIMED_NEEDS_PROOF                    |                                             |
| [~]    | Array/aggregate builtins                       | CLAIMED_NEEDS_PROOF                    |                                             |
| [~]    | Date component builtins                        | CLAIMED_NEEDS_PROOF                    |                                             |
| [~]    | Date/time helpers (`dateOf`…`durationSeconds`) | CLAIMED_NEEDS_PROOF                    |                                             |
| [~]    | `flag(name)` + provider and/or static map      | CLAIMED_NEEDS_PROOF + §1 for flags map |                                             |
| [~]    | `hasPermission` / `roleAllows`                 | CLAIMED_NEEDS_PROOF                    |                                             |
| [~]    | Custom builtins via plugin API                 | CLAIMED_NEEDS_PROOF                    | plugin-api                                  |
| [~]    | `today()` compile-time only → `autoNow`        | CLAIMED_NEEDS_PROOF                    | not runtime callable                        |

---

## 4. Runtime engine & adapters

| Status | Feature                                                                       | Implementation Status          | Evidence pointer                                                                                 |
| ------ | ----------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------ |
| [~]    | Command order (rateLimit → policies → constraints → guards → actions → emits) | CLAIMED_NEEDS_PROOF            | semantics.md § Commands                                                                          |
| [~]    | `RuntimeContext` fields                                                       | CLAIMED_NEEDS_PROOF            |                                                                                                  |
| [~]    | Middleware (4 hooks)                                                          | CLAIMED_NEEDS_PROOF            | runtime-middleware feature doc                                                                   |
| [~]    | `IRDiagnostic.code` optional                                                  | CLAIMED_NEEDS_PROOF            | seeded codes 2026-07-15                                                                          |
| [~]    | Batched persistence                                                           | CLAIMED_NEEDS_PROOF            | `runtime-command-batched-persistence.test.ts`                                                    |
| [~]    | `EncryptionProvider`                                                          | CLAIMED_NEEDS_PROOF            |                                                                                                  |
| [~]    | Deterministic mode / effect boundary                                          | CLAIMED_NEEDS_PROOF            |                                                                                                  |
| [~]    | EventBus (in-process)                                                         | CLAIMED_NEEDS_PROOF            | `runtime-eventbus.test.ts`                                                                       |
| [x]    | RedisEventBus injectable                                                      | FULLY_IMPLEMENTED              | §1                                                                                               |
| [~]    | WASM expression compatibility layer                                           | CLAIMED_NEEDS_PROOF / PARTIAL  | not a full WASM runtime                                                                          |
| [ ]    | Full WASM runtime                                                             | NOT_IMPLEMENTED                | phantom                                                                                          |
| [ ]    | Time-travel debugger                                                          | NOT_IMPLEMENTED / OUT_OF_SCOPE | phantom                                                                                          |
| [~]    | IdempotencyStore                                                              | CLAIMED_NEEDS_PROOF            |                                                                                                  |
| [~]    | JobQueue / async worker path                                                  | CLAIMED_NEEDS_PROOF            | fixture `69`                                                                                     |
| [x]    | `optional` modifier (projection hint; no runtime gate)                        | OUT_OF_SCOPE / by design   | semantics.md § Properties — enforced via `required` only                                         |
| [ ]    | Runtime uses `alternateKeys`                                                  | NOT_IMPLEMENTED                |                                                                                                  |
| [ ]    | `command.returns` runtime/projection-complete                                 | PARTIAL                        | projection-only                                                                                  |
| [x]    | Durable rate-limit (Postgres store)                                           | FULLY_IMPLEMENTED              | §1                                                                                               |

---

## 5. Stores & persistence subsystems

| Status | Feature                                        | Implementation Status | Evidence pointer         |
| ------ | ---------------------------------------------- | --------------------- | ------------------------ |
| [~]    | MemoryStore                                    | CLAIMED_NEEDS_PROOF   | runtime-engine           |
| [~]    | LocalStorageStore                              | CLAIMED_NEEDS_PROOF   |                          |
| [~]    | PostgresStore                                  | CLAIMED_NEEDS_PROOF   | `stores.node.ts`         |
| [~]    | SupabaseStore                                  | CLAIMED_NEEDS_PROOF   |                          |
| [~]    | Turso / libSQL store                           | CLAIMED_NEEDS_PROOF   |                          |
| [~]    | DynamoDB store                                 | CLAIMED_NEEDS_PROOF   |                          |
| [~]    | GenericPrismaStore                             | CLAIMED_NEEDS_PROOF   | `stores/prisma-generic/` |
| [ ]    | EventSourcedStore                              | NOT_IMPLEMENTED       | IR passthrough only      |
| [~]    | Outbox: memory/postgres/redis/mongodb/dynamodb | CLAIMED_NEEDS_PROOF   | `outbox/stores/*`        |
| [~]    | Approval store memory/postgres                 | CLAIMED_NEEDS_PROOF   |                          |
| [~]    | Idempotency store memory/postgres              | CLAIMED_NEEDS_PROOF   |                          |
| [x]    | RateLimit store memory/postgres                | FULLY_IMPLEMENTED     | §1                       |
| [~]    | Custom store via plugin API                    | CLAIMED_NEEDS_PROOF   |                          |
| [x]    | `manifest db init` SQL apply/print             | FULLY_IMPLEMENTED     | §1                       |

---

## 6. Projections — every registered target

Registration: `src/manifest/projections/builtins.ts` (`registerBuiltinProjections`). Each row = one registered projection. Status `CLAIMED_NEEDS_PROOF` until per-projection proof commit; Convex/capability nuances in Notes.

| Status | Projection            | Implementation Status          | Notes                                                                          |
| ------ | --------------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| [~]    | nextjs                | CLAIMED_NEEDS_PROOF            | createManifestRuntime, executionMode                                           |
| [~]    | routes                | CLAIMED_NEEDS_PROOF            |                                                                                |
| [~]    | prisma                | CLAIMED_NEEDS_PROOF            | multi-schema, naming options                                                   |
| [~]    | prisma-store          | CLAIMED_NEEDS_PROOF            | softDelete config (not language keyword)                                       |
| [~]    | convex                | PARTIAL                        | core generate + auth seam; many `CONVEX_UNSUPPORTED_*` (§7)                    |
| [~]    | openapi               | CLAIMED_NEEDS_PROOF            |                                                                                |
| [~]    | react-query           | CLAIMED_NEEDS_PROOF            |                                                                                |
| [~]    | zod                   | CLAIMED_NEEDS_PROOF            | enum/list/timestamp alias fixed 2026-07-15 per TODO                            |
| [~]    | drizzle               | CLAIMED_NEEDS_PROOF            |                                                                                |
| [~]    | graphql               | CLAIMED_NEEDS_PROOF            |                                                                                |
| [~]    | llm-context           | CLAIMED_NEEDS_PROOF            |                                                                                |
| [~]    | express               | CLAIMED_NEEDS_PROOF            | `authProvider` §1                                                              |
| [~]    | hono                  | CLAIMED_NEEDS_PROOF            | `authProvider` §1                                                              |
| [~]    | mermaid               | CLAIMED_NEEDS_PROOF            |                                                                                |
| [~]    | jsonschema            | CLAIMED_NEEDS_PROOF            |                                                                                |
| [~]    | storybook             | CLAIMED_NEEDS_PROOF            |                                                                                |
| [~]    | health                | CLAIMED_NEEDS_PROOF            | **undocumented** in mintlify/docs (§7)                                         |
| [~]    | materialized-views    | PARTIAL                        | ignores `expression-to-sql.ts`                                                 |
| [~]    | elasticsearch         | CLAIMED_NEEDS_PROOF            |                                                                                |
| [~]    | terraform             | CLAIMED_NEEDS_PROOF            |                                                                                |
| [~]    | analytics             | CLAIMED_NEEDS_PROOF            |                                                                                |
| [~]    | remix                 | CLAIMED_NEEDS_PROOF            |                                                                                |
| [~]    | sveltekit             | CLAIMED_NEEDS_PROOF            |                                                                                |
| [~]    | kysely                | CLAIMED_NEEDS_PROOF            |                                                                                |
| [~]    | dynamodb (projection) | CLAIMED_NEEDS_PROOF            | distinct from DynamoDB store                                                   |
| [~]    | pydantic              | CLAIMED_NEEDS_PROOF            |                                                                                |
| [~]    | dart                  | CLAIMED_NEEDS_PROOF            |                                                                                |
| [~]    | wiring                | CLAIMED_NEEDS_PROOF            |                                                                                |
| [~]    | contract-tests        | CLAIMED_NEEDS_PROOF            | Convex export name suites                                                      |
| [ ]    | mongoose folder       | NOT_IMPLEMENTED / unregistered | folder exists; **not** in `builtins.ts` register list — verify before claiming |

**Cross-cutting projection gaps**

| Status | Feature                                                                            | Implementation Status | Notes                  |
| ------ | ---------------------------------------------------------------------------------- | --------------------- | ---------------------- |
| [x]    | Capability descriptors API                                                         | FULLY_IMPLEMENTED     | §1                     |
| [x]    | Projection descriptor API                                                          | FULLY_IMPLEMENTED     | §1                     |
| [ ]    | `ir.tenant` in all web projections                                                 | PARTIAL               | wiring matrix          |
| [ ]    | Module-based output splitting                                                      | PARTIAL               |                        |
| [ ]    | Convex approvals/masking/searchable/versionProperty/cache/realtime/retry/rateLimit | DIAGNOSTIC_ONLY       | `CONVEX_UNSUPPORTED_*` |
| [ ]    | Convex complete lambda lowering                                                    | PARTIAL               |                        |
| [ ]    | Hono/Express historically missing authProvider                                     | FULLY_IMPLEMENTED     | fixed §1               |

---

## 7. CLI, SDK, config, packaging, docs tooling

| Status | Feature                                             | Implementation Status         | Evidence pointer                      |
| ------ | --------------------------------------------------- | ----------------------------- | ------------------------------------- |
| [~]    | CLI compile/generate/build/watch/validate/fmt/init  | CLAIMED_NEEDS_PROOF           | `packages/cli`                        |
| [x]    | CLI `db init`                                       | FULLY_IMPLEMENTED             | §1                                    |
| [~]    | enforce-surface / audit-* / lint-routes             | CLAIMED_NEEDS_PROOF / PARTIAL | ORM shapes incomplete                 |
| [~]    | wiring-coverage/inspect/remediate                   | CLAIMED_NEEDS_PROOF           |                                       |
| [~]    | diff / versions / migrate / changelog               | CLAIMED_NEEDS_PROOF           |                                       |
| [~]    | AI: generate-from-prompt, gen-tests, validate-ai    | CLAIMED_NEEDS_PROOF           |                                       |
| [~]    | Dev: repl, mock, harness, load-test, profile, seed… | CLAIMED_NEEDS_PROOF           |                                       |
| [x]    | `@angriff36/manifest/language-metadata`             | FULLY_IMPLEMENTED             | §1                                    |
| [~]    | `@angriff36/manifest/agent-sdk`                     | CLAIMED_NEEDS_PROOF           |                                       |
| [~]    | `@angriff36/manifest/seed-pack`                     | CLAIMED_NEEDS_PROOF           |                                       |
| [~]    | IR version control / versions CLI                   | CLAIMED_NEEDS_PROOF           | `docs/features/ir-version-control.md` |
| [~]    | Snapshot testing tooling                            | CLAIMED_NEEDS_PROOF           | `docs/features/snapshot-testing.md`   |
| [~]    | Config schema + `manifest config *`                 | CLAIMED_NEEDS_PROOF           | G0/G1                                 |
| [ ]    | Config G5/G2/G10                                    | NOT_IMPLEMENTED               |                                       |
| [~]    | Published `@angriff36/manifest` npm                 | CLAIMED_NEEDS_PROOF           | pin `package.json` each release       |
| [ ]    | Publish `@manifest/mcp-server`                      | NOT_IMPLEMENTED               | in-repo only                          |
| [ ]    | Publish `@manifest/lsp-server`                      | NOT_IMPLEMENTED               |                                       |
| [ ]    | Publish `@manifest/stdlib`                          | NOT_IMPLEMENTED               |                                       |
| [ ]    | Publish VS Code `manifest-lang`                     | NOT_IMPLEMENTED               |                                       |
| [x]    | SDK stability policy                                | FULLY_IMPLEMENTED             | §1                                    |
| [~]    | Conformance suite (~99 fixtures)                    | CLAIMED_NEEDS_PROOF           | `src/manifest/conformance/`           |
| [x]    | Doc snippet TS check mode                           | FULLY_IMPLEMENTED             | §1                                    |
| [ ]    | enforce-surface Drizzle/Kysely/raw-SQL              | PARTIAL                       |                                       |
| [ ]    | Restore `newguard.json`                             | NOT_IMPLEMENTED               |                                       |
| [ ]    | Health projection docs                              | NOT_IMPLEMENTED               |                                       |
| [ ]    | FEATURE-LIST → registry inventory (M12)             | NOT_IMPLEMENTED               |                                       |
| [ ]    | Capsule-V2 auth seam adoption                       | OUT_OF_SCOPE                  | other repo                            |

---

## 8. Open gaps / phantoms (checklist mirror)

Keep in sync with `docs/TODO.md`. Matrix wins disputes.

| Status | Gap                                                                            | Implementation Status      |
| ------ | ------------------------------------------------------------------------------ | -------------------------- |
| [ ]    | Approval escalate timeout                                                      | REJECTED_LOUD              |
| [ ]    | `optional` / `alternateKeys` / entity constraint overrides / `command.returns` | NOT_IMPLEMENTED or PARTIAL |
| [ ]    | EventSourcedStore                                                              | NOT_IMPLEMENTED            |
| [ ]    | softDelete language keyword                                                    | NOT_IMPLEMENTED            |
| [ ]    | Materialized-views SQL expression lowering                                     | PARTIAL                    |
| [ ]    | Convex unsupported surfaces (list in §6)                                       | DIAGNOSTIC_ONLY            |
| [ ]    | Config G5/G2/G10                                                               | NOT_IMPLEMENTED            |
| [x]    | `createUserResolver` wired into runtime factory                                | FULLY_IMPLEMENTED          | landing this commit — promote to §1 with SHA |
| [ ]    | Sub-package publish/park                                                       | NOT_IMPLEMENTED            |
| [ ]    | Full WASM runtime / time-travel debugger                                       | NOT_IMPLEMENTED            |
| [x]    | Durable `RateLimitStore` / Postgres adapter                                    | FULLY_IMPLEMENTED          | §1                                                   |
| [ ]    | `manifest test constraints` / ConstraintTestHarness                            | NOT_IMPLEMENTED            | phantom CLI                                          |
| [ ]    | `manifest generate-fixtures`                                                   | NOT_IMPLEMENTED            | phantom CLI                                          |
| [ ]    | Config `env(VAR)` / `MANIFEST_ENV` overlays / top-level `stores:` YAML         | NOT_IMPLEMENTED            | phantom config                                       |
| [ ]    | `projection.generateRoute` / `generateTypes` / `generateClient` API            | NOT_IMPLEMENTED            | phantom projection API                               |
| [ ]    | Kysely `columnMappings` actually applied                                       | NOT_IMPLEMENTED / PARTIAL  | option declared, unused                              |
| [ ]    | Kitchen tutorial UI wiring                                                     | NOT_IMPLEMENTED            | FEATURE-LIST / audit phantom                         |
| [ ]    | Default encryption provider (common no-vendor case)                            | NOT_IMPLEMENTED            | fail-closed by design until provider set             |

---

## 9. Feature-doc pages (`docs/features/*.md`)

Each page must map to ≥1 matrix row. **30 pages on disk** (excluding README):

| Page                      | Maps to                                       |
| ------------------------- | --------------------------------------------- |
| agent-sdk                 | §7 agent-sdk                                  |
| approval-workflows        | §2 Approvals                                  |
| array-types               | §2 Array types                                |
| async-commands            | §2 Async commands                             |
| computed-property-caching | §2 Computed caching                           |
| date-time-types           | §2 date/time                                  |
| decimal-money-types       | §2 decimal/money                              |
| entity-inheritance        | §2 extends/mixin (+ generics NOT_IMPLEMENTED) |
| enum-types                | §2 Enums                                      |
| event-reactions           | §2 Events + reactions                         |
| expression-builtins       | §3 Builtins                                   |
| feature-flags             | §3 `flag()`                                   |
| federation                | §2 Federation                                 |
| ir-version-control        | §7 IR version control                         |
| mcp-server                | §7 MCP publish gap                            |
| modules-and-imports       | §2 Modules                                    |
| plugin-api                | §3 custom builtins + §5 custom stores         |
| range-constraints         | §2 Range constraints                          |
| realtime-subscriptions    | §2 Realtime                                   |
| regex-constraints         | §2 Regex constraints                          |
| role-hierarchy            | §2 Roles/RBAC                                 |
| runtime-middleware        | §4 Middleware                                 |
| saga-workflow             | §2 Sagas                                      |
| scheduled-commands        | §2 Schedules                                  |
| security-features         | §2 Security features                          |
| snapshot-testing          | §7 Snapshot testing                           |
| tenant-isolation          | §2 Multi-tenancy                              |
| timestamp-fields          | §2 Auto timestamps                            |
| value-object-types        | §2 Value objects                              |

Agents: when auditing a feature page, update the matching row; do not invent completion from the page alone.

---

## 10. Coverage honesty

| Source                                 | Role vs this matrix                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `docs/CONFIRMED-FEATURES.md`           | Existence narrative — must not claim completion beyond this file                               |
| `docs/FEATURE-LIST.md`                 | Historical roadmap (2026-06-02); **not** completion SoT; ~116 names — use to find missing rows |
| `docs/features/*.md`                   | User guides (30 pages) — each capability should appear as a row above                          |
| `docs/TODO.md`                         | Working checklist                                                                              |
| Conformance fixtures                   | Executable semantics evidence pointers                                                         |
| Appendix D phantoms (2026-07-01 audit) | Names that must appear as `NOT_IMPLEMENTED` / struck claims until fixed                        |

When a feature is found in any of those sources but missing here: **add a row immediately** (even as `CLAIMED_NEEDS_PROOF` or `NOT_IMPLEMENTED`).

**Still not one-row-per-FEATURE-LIST-entry:** FEATURE-LIST has overlapping/historical names. Prefer CONFIRMED + fixtures + `builtins.ts` + CLI index as the enumeration sources; pull FEATURE-LIST names in when they describe a distinct capability not already listed.
