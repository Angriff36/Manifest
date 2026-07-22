---
title: Manifest Feature Matrix
created: 2026-02-28
updated: 2026-07-22
source_of_truth: true
source_of_truth_for: none — canonical completion status lives in docs/internal/COMPLIANCE_MATRIX.md
scope: Manifest-owned feature completion only — language/syntax, compiler/AST/IR, runtime semantics, projections, analysis/verification APIs, stable public SDK contracts
authority: Non-binding mirror — docs/internal/COMPLIANCE_MATRIX.md is the sole completion source of truth
must_reconcile_to:
  - docs/spec/ir/ir-v1.schema.json
  - docs/spec/semantics.md
  - docs/SOURCE_OF_TRUTH_INDEX.md
companion_boundary: docs/internal/contracts/manifest-builder-boundary.md
companion_builder_matrix: ../../../builder/docs/CAPABILITY_CONSUMPTION_MATRIX.md
companion_semantics: docs/spec/ir/ir-v1.schema.json → docs/spec/semantics.md → docs/spec/builtins.md → docs/spec/adapters.md → conformance fixtures
companion_inventory: docs/platform/CONFIRMED-FEATURES.md (existence claims; must reconcile to this matrix)
companion_checklist: docs/TODO.md
---

RYAN_APPROVED MESSAGE: If it doesnt have my mark next to it, its NOT out of scope,

# Manifest Feature Matrix

~~Earlier claim (2026-07-15): this file replaced `docs/internal/COMPLIANCE_MATRIX.md` as the Tier-1 source of truth.~~
**Correction (2026-07-15):** This file is a non-binding working mirror. [`docs/internal/COMPLIANCE_MATRIX.md`](../internal/COMPLIANCE_MATRIX.md) remains the sole source of truth for Manifest-owned feature completion.

> **NOT THE SOURCE OF TRUTH.** Statuses here are informational copies only. A feature counts as `FULLY_IMPLEMENTED` only when the canonical compliance matrix records a hand-verified end-to-end compile and tests with exact filenames, inclusive line ranges, and the proving git commit SHA.

**Authority:** Non-binding mirror for navigation and working notes.
**Canonical authority:** `docs/internal/COMPLIANCE_MATRIX.md`, enforced by `AGENTS.md` / `CLAUDE.md` / `docs/internal/DOCUMENTATION_GOVERNANCE.md` (`@RYAN_APPROVED 2026-07-15`).

**Ownership boundary (canonical):** [`docs/internal/contracts/manifest-builder-boundary.md`](../internal/contracts/manifest-builder-boundary.md)

| Owner        | Owns                                                                                                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Manifest** | Language/syntax; compiler, AST, IR; runtime semantics; projections; analysis/verification APIs; stable public SDK contracts                                                             |
| **Builder**  | Visual editing; workspace/project management; presets; projection orchestration; generated-app assembly; consumer wiring inspection; verification/debugging UI; generated-app lifecycle |

Builder consumption / end-to-end proof lives in Builder’s matrix:  
`C:\projects\builder\docs\CAPABILITY_CONSUMPTION_MATRIX.md` (repo-relative from Builder: `docs/CAPABILITY_CONSUMPTION_MATRIX.md`).

~~Earlier 2026-07-15 drafts of this matrix only listed ~12 proven fixes + ~30 gaps and a short “existence” dump — that was **not** a complete feature inventory.~~  
~~Correction that treated product UI / Capsule adoption / kitchen tutorials as Manifest “missing features.”~~  
**Correction (2026-07-15):** This file enumerates **Manifest-owned** language, runtime, stores, **each** registered projection, CLI/SDK, packaging, and open **Manifest** gaps. Builder-owned work is `OUT_OF_SCOPE` here (tracked in Builder). Rows without filename+lines+commit stay `CLAIMED_NEEDS_PROOF` (or weaker) — never invent `FULLY_IMPLEMENTED`.

## Proof Protocol

| Status                | Meaning                                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FULLY_IMPLEMENTED`   | Mirrored only from the canonical matrix after hand-verified end-to-end compile + tests with exact filename, inclusive line range, and git commit SHA |
| `PARTIAL`             | Present but incomplete across Manifest consumers/layers                                                                                              |
| `DIAGNOSTIC_ONLY`     | Loud unsupported path; no full enforcement                                                                                                           |
| `REJECTED_LOUD`       | Compile/schema rejects until designed                                                                                                                |
| `NOT_IMPLEMENTED`     | Missing / passthrough / phantom **in Manifest**                                                                                                      |
| `OUT_OF_SCOPE`        | Not a Manifest-core deliverable (often Builder-owned)                                                                                                |
| `CLAIMED_NEEDS_PROOF` | Exists in inventory/fixtures but **no** commit proof yet — **not** “done”                                                                            |

Update `docs/internal/COMPLIANCE_MATRIX.md` first when closing Manifest work; then reconcile this mirror, `docs/TODO.md`, and `docs/platform/CONFIRMED-FEATURES.md`.

## Integration status (Manifest × Builder)

These states are **orthogonal** to implementation status above. A Manifest gap is never “fixed” by Builder UI. Builder-owned work is never a Manifest `NOT_IMPLEMENTED` row.

| Integration state     | Meaning                                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MANIFEST_COMPLETE`   | Manifest matrix marks the capability `FULLY_IMPLEMENTED` (hard proof) **or** the published SDK surface is declared stable and present for that capability |
| `BUILDER_CONSUMED`    | Builder’s consumption matrix records a real import of the Manifest public API + Builder implementation location                                           |
| `END_TO_END_VERIFIED` | `MANIFEST_COMPLETE` **and** `BUILDER_CONSUMED` **and** a focused Builder test proves consumption (see Builder matrix “Focused test” column)               |

Do **not** write `END_TO_END_VERIFIED` in this file without a matching Builder matrix row. Track consumption details only in Builder.

### Platform SDK integration ledger (summary)

Pin / consumption evidence: Builder `package.json` currently pins `@angriff36/manifest@3.6.3` (Manifest SoT version is `package.json` — verify before asserting). Detail rows: Builder matrix.

| Manifest public API                                                              | Manifest status                                             | Integration (as of 2026-07-15)                                             |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| `@angriff36/manifest/ir-compiler` (`compile`)                                    | CLAIMED_NEEDS_PROOF / shipped                               | `BUILDER_CONSUMED` → see Builder matrix                                    |
| `@angriff36/manifest/multi-compiler`                                             | CLAIMED_NEEDS_PROOF / shipped                               | `BUILDER_CONSUMED`                                                         |
| `@angriff36/manifest/projections` (generate / list / capabilities / descriptors) | PARTIAL (capabilities declared incrementally) + §1 for APIs | `BUILDER_CONSUMED`                                                         |
| `@angriff36/manifest/runtime-engine`                                             | CLAIMED_NEEDS_PROOF / shipped                               | `BUILDER_CONSUMED`                                                         |
| `@angriff36/manifest/ir-diff` + `/breaking-change`                               | CLAIMED_NEEDS_PROOF / shipped                               | `BUILDER_CONSUMED`                                                         |
| `@angriff36/manifest/projections/wiring`                                         | CLAIMED_NEEDS_PROOF / shipped                               | `BUILDER_CONSUMED`                                                         |
| `@angriff36/manifest/agent-sdk`                                                  | CLAIMED_NEEDS_PROOF / shipped                               | `BUILDER_CONSUMED`                                                         |
| `@angriff36/manifest/language-metadata`                                          | FULLY_IMPLEMENTED (§1)                                      | `BUILDER_CONSUMED` (candidate `END_TO_END_VERIFIED` if Builder test green) |
| `@angriff36/manifest/seed-pack` + convex assembly helpers                        | CLAIMED_NEEDS_PROOF / shipped                               | `BUILDER_CONSUMED` (preset path)                                           |
| Stable export contract (`docs/spec/sdk-stability.md`)                            | FULLY_IMPLEMENTED (§1)                                      | `MANIFEST_COMPLETE` — Builder must stay on listed subpaths                 |

---

## 1. Proven complete (`FULLY_IMPLEMENTED` + hard proof)

| Status | Feature                                               | Implementation Status | Proof (file:lines @ commit)                                                                                                                                                                                                                        |
| ------ | ----------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [x]    | Entity `behavior` rejected (no silent drop)           | FULLY_IMPLEMENTED     | `src/manifest/ir-compiler.ts:801-816` @ `3f41cb8da272c7d71efcad242ff498403ec09fd5`                                                                                                                                                                 |
| [x]    | Constraint `failWhen` polarity (RuntimeEngine)        | FULLY_IMPLEMENTED     | `src/manifest/constraint-polarity.ts:1-27` @ `55670fdd48891f336064bbbab1d402e5260ebfd7`; RuntimeEngine uses shared helper. ~~WASM evaluator path~~ **removed 2026-07-15** (never shipped a `.wasm` artifact).                                      |
| [x]    | `getLanguageMetadata()` export                        | FULLY_IMPLEMENTED     | `src/manifest/language-metadata.ts:190-220` @ `11988d6055503c1046ba093cf007cc123778ec5a`; `package.json:275-278`                                                                                                                                   |
| [x]    | `PROPERTY_MODIFIERS` single source                    | FULLY_IMPLEMENTED     | `src/manifest/property-modifiers.ts:1-18` @ `11988d6055503c1046ba093cf007cc123778ec5a`                                                                                                                                                             |
| [x]    | `getProjectionCapabilities(name)`                     | FULLY_IMPLEMENTED     | `src/manifest/projections/registry.ts:105-120` @ `2828d0da940de5d5004d65b6d2e1342f66807e4d`                                                                                                                                                        |
| [x]    | Projection descriptors API                            | FULLY_IMPLEMENTED     | `src/manifest/projections/registry.ts:151-175` @ `f335a74128466feaef1ffde8b14d52b1bbcd5eab`                                                                                                                                                        |
| [x]    | Stable Builder export contract                        | FULLY_IMPLEMENTED     | `docs/spec/sdk-stability.md:1-48` @ `11988d6055503c1046ba093cf007cc123778ec5a`                                                                                                                                                                     |
| [x]    | `hasMany … through Join` M2M                          | FULLY_IMPLEMENTED     | `src/manifest/ir-compiler.ts:1132-1175` @ `3052dc56c45639f587a687017a13240d34dec997`; fixture `102-through-join`                                                                                                                                   |
| [x]    | Referential actions in reference runtime              | FULLY_IMPLEMENTED     | `src/manifest/runtime-referential-actions.ts:1-300` @ `3052dc56c45639f587a687017a13240d34dec997`                                                                                                                                                   |
| [x]    | `RuntimeOptions.flags` for `flag()`                   | FULLY_IMPLEMENTED     | `src/manifest/runtime-engine.ts:255-261,1894-1898` @ `3052dc56c45639f587a687017a13240d34dec997`                                                                                                                                                    |
| [x]    | Hono/Express `authProvider`                           | FULLY_IMPLEMENTED     | `src/manifest/projections/hono/types.ts:30` @ `1b1e2be9e059e5524021a671dd45eeddf3c7026f`; `express/types.ts:37`                                                                                                                                    |
| [x]    | `manifest db init`                                    | FULLY_IMPLEMENTED     | `packages/cli/src/commands/db-init.ts:1-195` @ `2b4f30cf6010e89d3e3e3000c704212fd0574aff`                                                                                                                                                          |
| [x]    | Doctest TS `check`/`invalid` fences                   | FULLY_IMPLEMENTED     | `testing/scripts/check-doc-snippets.mjs:94-117` @ `6ed6549fc70c86cd7e586818175d44715e1332d5`                                                                                                                                                       |
| [x]    | RedisEventBus via `RuntimeOptions.eventBus`           | FULLY_IMPLEMENTED     | `src/manifest/runtime-engine.ts:307` @ `61d5ab6fb1da4dca32e683b45f9934e56dba141c`; `src/manifest/events/redis.ts:55-60`                                                                                                                            |
| [x]    | Durable `RateLimitStore` (Memory + Postgres)          | FULLY_IMPLEMENTED     | `src/manifest/runtime-rate-limit.ts:46-133` @ `fd4bb50a41dbfaf340013389e6023f31b9e23a79`; `src/manifest/rate-limit/stores/postgres.ts:48-137` @ same; `RuntimeOptions.rateLimitStore` `runtime-engine.ts:264,1187` @ same                          |
| [x]    | `createUserResolver` in config + runtime factory      | FULLY_IMPLEMENTED     | `src/manifest/config.ts:280-299` @ `3c1a4e61f845867cf3881edf42ea63005c17ea4d`; `src/manifest/projections/shared/companions.ts:225-280` @ same                                                                                                      |
| [x]    | Materialized-views computed → SQL                     | FULLY_IMPLEMENTED     | `src/manifest/projections/materialized-views/generator.ts:215-265` @ `7ce53859bdc162263384825043b2ecbb0ab96191`; `expression-to-sql.ts:67-88` @ same                                                                                               |
| [x]    | `EventSourcedStore` for `eventSourced` target         | FULLY_IMPLEMENTED     | `src/manifest/stores/event-sourced.ts:37-140` @ `ca526f02c67d1db7138d6e34a400fe459a87caef`; `runtime-engine.ts:1279-1283` @ same                                                                                                                   |
| [x]    | `alternateKeys` uniqueness on create/update           | FULLY_IMPLEMENTED     | `src/manifest/runtime-engine.ts:2832-2864,2876,2966-2977` @ `a8af116268de8f4329eb2af1a4df82fb5a65fa5b`                                                                                                                                             |
| [x]    | Entity-level constraint overrides on create/update    | FULLY_IMPLEMENTED     | `src/manifest/runtime-engine.ts:2625-2642,4958-4995,5934-5985` @ `f36c83dd63690e83812ee286f42379f18d65e0d9`; `src/manifest/runtime-entity-constraint-overrides.test.ts:1-149` @ same                                                               |
| [x]    | Config G5 `projections.enabled`/`defaults`            | FULLY_IMPLEMENTED     | `src/manifest/config.ts:117-168,380-414` @ `505e5051f67b0d1a33f59f7e4d1f48b14e124f2b`; `packages/cli/src/commands/generate.ts:822-895` @ same; schema meta keys in `docs/spec/config/manifest.config.schema.json`                                  |
| [x]    | Config G2 `validation.failOn`                         | FULLY_IMPLEMENTED     | `packages/cli/src/utils/validation-gate-policy.ts:1-45` @ `7c3e16a9349af3130ae5408beee5297e33b7200d`; wired in `compile.ts`/`validate.ts`; schema `validation.failOn`                                                                              |
| [x]    | Config G10 `driftGates` / `manifest ci-gate`          | FULLY_IMPLEMENTED     | `packages/cli/src/commands/ci-gate.ts:1-160` @ `c28e3e437a9d4af3a121e7cbdbf211c09997a98f`; `packages/cli/src/utils/drift-gates.ts:1-59` @ same                                                                                                     |
| [x]    | Health projection docs                                | FULLY_IMPLEMENTED     | `docs/projections/health.md:1-68` @ `ebf2164dff1ab0ea648b12cc109ac5eaa0ee332b`; `mintlify/projections/health.mdx:1-77` @ same; generator `src/manifest/projections/health/generator.ts:1-429` @ `f335a74128466feaef1ffde8b14d52b1bbcd5eab`         |
| [x]    | Approval `onTimeout: escalate` (open routing)         | FULLY_IMPLEMENTED     | `src/manifest/parser.ts:748-820` @ `a16d2bf16c54d8d20a4d58323415513163ab0b4e`; `ir-compiler.ts:934-1005` @ same; `runtime-engine.ts:6539-6595` @ same; fixtures `111`, `103`                                                                       |
| [x]    | Convex `searchable` → `.searchIndex`                  | FULLY_IMPLEMENTED     | `src/manifest/projections/convex/generator.ts:367-441` @ `f8221d44be41a80725ab58981658edf3cfe64f30`; `capabilities.ts` string-gate @ same; `type-mapping.ts:85-87` @ same; `semantics.test.ts`                                                     |
| [x]    | Convex `versionProperty` OCC                          | FULLY_IMPLEMENTED     | `src/manifest/projections/convex/version-occ.ts:1-76` @ `4660059ba17fcc00f06de523b14c361df421fea8`; `functions.ts` create/update OCC @ same; `generator.ts` schema synthesize; `semantics.test.ts`                                                 |
| [x]    | FEATURE-LIST → registry inventory (M12)               | FULLY_IMPLEMENTED     | `scripts/generate-feature-list.ts:1-301` @ `e0ffb716ffc627fdfe7bdb8df8ea6882be3dff66`; `src/manifest/feature-list-generator.test.ts:1-52` @ same; `package.json` `docs:feature-list` / `docs:check:feature-list`; generated `docs/FEATURE-LIST.md` |
| [x]    | Convex realtime/cache PARTIAL reclass                 | FULLY_IMPLEMENTED     | `src/manifest/projections/convex/capabilities.ts` @ `03a019efbeddbf2bc177b745957de81c5a9384a1` (`CONVEX_PARTIAL_REALTIME` / `CONVEX_PARTIAL_COMPUTED_CACHE`); `semantics.test.ts` @ same; `CAPABILITIES.md`                                        |
| [x]    | Park unpublished sub-packages (mcp/lsp/stdlib/vscode) | FULLY_IMPLEMENTED     | `packages/mcp-server/package.json` (+ lsp/stdlib/vscode) `"private": true` @ `500f14712174bee2c989c869980ced8fd1397505`; `src/manifest/parked-packages.test.ts:1-28` @ same; `docs/reference/packages-and-distribution.md`                         |
| [x]    | Language type `timestamp` (= `datetime` alias)        | FULLY_IMPLEMENTED     | `src/manifest/date-time.ts:12-18` @ `22c7792cf045450ab02fdccd982bfbf5551f4978`; `runtime-engine.ts:2676-2694` @ same; `runtime-datetime-validation.test.ts` @ same; `projections/shared/typescript-types.ts:21-24` @ same; semantics § Date/Time   |
| [x]    | Appendix E: `map<string,V>` sugar (= `map<V>`)        | FULLY_IMPLEMENTED     | `src/manifest/parser.ts:1316-1341` @ `dc52bb5daa23fad540252654862a3b1db5ed23c6`; fixture `73`; semantics Properties; non-string keys unsupported by design                                                                                         |
| [x]    | `record` type alias (= `map`)                         | FULLY_IMPLEMENTED     | `parser.ts` + `ir-compiler.ts` lower `record`→`map`; `map-record-alias.test.ts` — SHA after commit                                                                                                                                                |
| [x]    | Appendix E: `.length` member ≡ `length(v)`            | FULLY_IMPLEMENTED     | `runtime-engine.ts` member eval; `docs/spec/builtins.md` + `semantics.md`; `runtime-member-length.test.ts` — SHA after commit                                                                                                                   |
| [x]    | Appendix E: retry/rateLimit field-name ergonomics     | FULLY_IMPLEMENTED     | `retry-ratelimit-aliases.ts` + parser; `retry-ratelimit-aliases.test.ts` — SHA after commit                                                                                                                                                     |
| [x]    | Retry `maxDelay` delay-cap                            | FULLY_IMPLEMENTED     | IR `maxDelayMs` + `computeRetryDelays` clamp; `runtime-retry.test.ts` — SHA after commit                                                                                                                                                        |
| [x]    | Appendix E: reserved-word ergonomics (domain names)   | FULLY_IMPLEMENTED     | contextual `publish`/`persist`/`read`/`write`/`delete`/`execute`/`tenant`; `reserved-word-ergonomics.test.ts` — SHA after commit                                                                                                               |

---

## 2. Language (DSL) — full inventory

Statuses: `CLAIMED_NEEDS_PROOF` until §1-style proof is attached. Fixture IDs are evidence pointers, not commits.

| Status | Feature                                                                                                              | Implementation Status         | Evidence pointer                                                             |
| ------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------- |
| [~]    | Entities + typed properties + defaults                                                                               | CLAIMED_NEEDS_PROOF           | fixture `01`                                                                 |
| [~]    | Property modifiers (`required`/`unique`/`indexed`/`private`/`readonly`/`optional`/`searchable`/`encrypted`/`masked`) | CLAIMED_NEEDS_PROOF / PARTIAL | compile+IR; runtime `optional` unused (§6)                                   |
| [~]    | `extends` inheritance + cycle detection                                                                              | CLAIMED_NEEDS_PROOF           | fixtures `77`–`79`, `81`                                                     |
| [~]    | `mixin` composition                                                                                                  | CLAIMED_NEEDS_PROOF           | fixture `78`                                                                 |
| [ ]    | Generic / parameterized entities `Entity<T>`                                                                         | NOT_IMPLEMENTED               | fixtures `84`–`85` negative only                                             |
| [~]    | Value objects / embedded types                                                                                       | CLAIMED_NEEDS_PROOF           | fixture `60`                                                                 |
| [x]    | Enum types                                                                                                           | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 — parse `parser.ts:465-508` @ `68dc9c26…`; IR `ir-compiler.ts:506-508,1019-1028`; fixture `57`; Zod `z.enum` @ `3052dc56…` |
| [~]    | `decimal` / `money` types                                                                                            | CLAIMED_NEEDS_PROOF           | fixture `56`; runtime = number                                               |
| [~]    | `map` / record type                                                                                                  | CLAIMED_NEEDS_PROOF           | fixture `73`                                                                 |
| [~]    | Array types `T[]` / `array<T>`                                                                                       | CLAIMED_NEEDS_PROOF           | fixture `40`                                                                 |
| [~]    | `date` / `time` / `datetime` / `duration`                                                                            | CLAIMED_NEEDS_PROOF           | fixture `92`                                                                 |
| [~]    | Composite primary keys (`key`)                                                                                       | CLAIMED_NEEDS_PROOF           | fixture `109`                                                                |
| [~]    | `alternateKeys` (compile into IR)                                                                                    | FULLY_IMPLEMENTED             | §1 uniqueness; compile still CLAIMED_NEEDS_PROOF for parser path             |
| [~]    | Relationships `hasMany` / `hasOne` / `belongsTo` / `ref`                                                             | CLAIMED_NEEDS_PROOF           | fixtures `02`, `98`, `99`                                                    |
| [x]    | Referential actions `onDelete`/`onUpdate`                                                                            | FULLY_IMPLEMENTED             | see §1                                                                       |
| [x]    | Many-to-many `through`                                                                                               | FULLY_IMPLEMENTED             | see §1                                                                       |
| [x]    | Auto timestamps / `autoNow` (`now()`/`today()`)                                                                      | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 — parse `parser.ts:411-413,459` @ `4cfff8ec…`; IR inject + `autoNow` lower `ir-compiler.ts:841-858,876,1051-1067` @ `68afb8ab…`; runtime `runtime-engine.ts:2674-2705,3185-3186`; fixture `62`; `create-field-and-autonow.test.ts` @ `849e368…` |
| [~]    | `private` / `encrypted` / `masked` privacy                                                                           | CLAIMED_NEEDS_PROOF           | fixtures `91`, `93`                                                          |
| [~]    | `searchable` declarations                                                                                            | CLAIMED_NEEDS_PROOF           | fixture `89`                                                                 |
| [~]    | Multi-tenancy (`tenant`)                                                                                             | CLAIMED_NEEDS_PROOF           | fixture `61`                                                                 |
| [~]    | Optimistic concurrency `versionProperty`                                                                             | CLAIMED_NEEDS_PROOF           | fixture `24`                                                                 |
| [~]    | Commands (params, guards, mutate, emit, emitPayloads)                                                                | CLAIMED_NEEDS_PROOF           | fixture `04`                                                                 |
| [~]    | Async / background commands                                                                                          | CLAIMED_NEEDS_PROOF           | fixture `69`                                                                 |
| [~]    | Command `retry` policy                                                                                               | CLAIMED_NEEDS_PROOF           | fixture `72`                                                                 |
| [~]    | Command/policy `rateLimit`                                                                                           | CLAIMED_NEEDS_PROOF           | fixtures `74`, `75`, `100`                                                   |
| [~]    | Computed properties                                                                                                  | CLAIMED_NEEDS_PROOF           | fixture `03`                                                                 |
| [~]    | Computed caching (`request`/`session`/`ttl`)                                                                         | CLAIMED_NEEDS_PROOF           | fixture `65`                                                                 |
| [~]    | Constraints severity `ok`/`warn`/`block`                                                                             | CLAIMED_NEEDS_PROOF           | fixtures `21`, `36`                                                          |
| [x]    | Constraint `failWhen` polarity                                                                                       | FULLY_IMPLEMENTED             | see §1                                                                       |
| [~]    | Constraint override authorization                                                                                    | CLAIMED_NEEDS_PROOF           | fixture `22`                                                                 |
| [x]    | Entity-level constraint overrides evaluated                                                                          | FULLY_IMPLEMENTED             | see §1                                                                       |
| [~]    | Policies read/write/delete/execute/all/override                                                                      | CLAIMED_NEEDS_PROOF           | fixture `06`                                                                 |
| [~]    | State transitions                                                                                                    | CLAIMED_NEEDS_PROOF           | fixture `38`                                                                 |
| [~]    | Aggregate `count()` in reactions                                                                                     | CLAIMED_NEEDS_PROOF           | fixture `97`                                                                 |
| [x]    | Events + reactions (`on Event run`)                                                                                  | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 — parse/IR/runtime + Reactions suite @ `83e6c4f…`; fixture `67` emit; fan-out fixture `96` separate row |
| [~]    | Reaction fan-out                                                                                                     | CLAIMED_NEEDS_PROOF           | fixture `96`                                                                 |
| [~]    | Sagas + compensation                                                                                                 | CLAIMED_NEEDS_PROOF           | fixture `88`                                                                 |
| [~]    | Approvals (multi-stage, `onTimeout: cancel`)                                                                         | CLAIMED_NEEDS_PROOF           | fixture `68`                                                                 |
| [x]    | Approval `onTimeout: escalate` (open author target)                                                                  | FULLY_IMPLEMENTED             | see §1; fixtures `111`, `103` (bare incomplete)                              |
| [~]    | Roles / RBAC hierarchy + deny                                                                                        | CLAIMED_NEEDS_PROOF           | fixture `71`                                                                 |
| [~]    | Webhooks + HMAC                                                                                                      | CLAIMED_NEEDS_PROOF           | fixture `90`                                                                 |
| [~]    | Schedules cron/interval/every                                                                                        | CLAIMED_NEEDS_PROOF           | fixture `76`                                                                 |
| [~]    | Store declarations                                                                                                   | CLAIMED_NEEDS_PROOF           | multiple fixtures                                                            |
| [~]    | Modules + `use` imports                                                                                              | CLAIMED_NEEDS_PROOF           | module-resolver tests                                                        |
| [~]    | Regex constraints                                                                                                    | CLAIMED_NEEDS_PROOF           | `docs/internal/features/regex-constraints.md`                                |
| [~]    | Range constraints                                                                                                    | CLAIMED_NEEDS_PROOF           | `docs/internal/features/range-constraints.md`                                |
| [~]    | Security features surface (doc)                                                                                      | CLAIMED_NEEDS_PROOF / PARTIAL | `docs/internal/features/security-features.md` — verify vs privacy/encryption |
| [x]    | Federation SDK (`@angriff36/manifest/federation`)                                                                    | FULLY_IMPLEMENTED             | COMPLIANCE_MATRIX §1; docs path is `docs/features/federation.md` (not `internal/`) |
| [ ]    | Realtime subscriptions (language/runtime)                                                                            | PARTIAL / DIAGNOSTIC_ONLY     | Convex diagnostic; Next.js may differ — prove per target                     |
| [x]    | Entity `behavior` blocks                                                                                             | REJECTED_LOUD → proven reject | see §1 / fixture `110`                                                       |
| [ ]    | Language keyword `softDelete`                                                                                        | NOT_IMPLEMENTED               | projection config only                                                       |
| [x]    | Appendix E: `map<K,V>` arbitrary non-string keys                                                                     | REJECTED_LOUD → by design     | String keys only; `record` alias ships (§1)                                  |
| [x]    | `record` type alias (= `map`)                                                                                        | FULLY_IMPLEMENTED             | §1                                                                           |
| [x]    | Appendix E: retry/rateLimit field-name ergonomics                                                                    | FULLY_IMPLEMENTED             | §1 — aliases                                                                |
| [x]    | Retry `maxDelay` delay-cap                                                                                           | FULLY_IMPLEMENTED             | §1                                                                          |
| [x]    | Appendix E: reserved-word ergonomics (domain names)                                                                  | FULLY_IMPLEMENTED             | §1 — contextual domain names                                                |
| [x]    | Appendix E: command-body policy clause                                                                               | REJECTED_LOUD → by design     | Top-level policies only; command-body `policy` will not ship                 |
| [x]    | Appendix E: `.length` vs `length()`                                                                                  | FULLY_IMPLEMENTED             | §1 — string/array member sugar                                               |

~~Language type `timestamp` (vs `datetime`) — NOT_IMPLEMENTED / zod alias only~~ → **FULLY_IMPLEMENTED** §1 (2026-07-15).

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

| Status | Feature                                                                       | Implementation Status    | Evidence pointer                                                                          |
| ------ | ----------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| [~]    | Command order (rateLimit → policies → constraints → guards → actions → emits) | CLAIMED_NEEDS_PROOF      | semantics.md § Commands                                                                   |
| [~]    | `RuntimeContext` fields                                                       | CLAIMED_NEEDS_PROOF      |                                                                                           |
| [~]    | Middleware (4 hooks)                                                          | CLAIMED_NEEDS_PROOF      | runtime-middleware feature doc                                                            |
| [~]    | `IRDiagnostic.code` optional                                                  | CLAIMED_NEEDS_PROOF      | seeded codes 2026-07-15                                                                   |
| [~]    | Batched persistence                                                           | CLAIMED_NEEDS_PROOF      | `runtime-command-batched-persistence.test.ts`                                             |
| [~]    | `EncryptionProvider`                                                          | CLAIMED_NEEDS_PROOF      |                                                                                           |
| [~]    | Deterministic mode / effect boundary                                          | CLAIMED_NEEDS_PROOF      |                                                                                           |
| [~]    | EventBus (in-process)                                                         | CLAIMED_NEEDS_PROOF      | `runtime-eventbus.test.ts`                                                                |
| [x]    | RedisEventBus injectable                                                      | FULLY_IMPLEMENTED        | §1                                                                                        |
| [x]    | ~~WASM expression compatibility layer~~                                       | REMOVED 2026-07-15       | Quarantined prototype deleted — no `.wasm` artifact, never on default RuntimeEngine path  |
| [x]    | ~~Full WASM runtime~~                                                         | REMOVED / OUT_OF_SCOPE   | Same — do not reintroduce without a measured perf mandate + shipped artifact + real tests |
| [ ]    | Time-travel debugger (product UI)                                             | OUT_OF_SCOPE             | Builder owns verification/debugging UI — see boundary; not a Manifest language gap        |
| [~]    | IdempotencyStore                                                              | CLAIMED_NEEDS_PROOF      |                                                                                           |
| [~]    | JobQueue / async worker path                                                  | CLAIMED_NEEDS_PROOF      | fixture `69`                                                                              |
| [x]    | `optional` modifier (projection hint; no runtime gate)                        | OUT_OF_SCOPE / by design | semantics.md § Properties — enforced via `required` only                                  |
| [x]    | Runtime uses `alternateKeys`                                                  | FULLY_IMPLEMENTED        | §1                                                                                        |
| [x]    | `command.returns` (projection metadata; no runtime coerce)                    | OUT_OF_SCOPE / by design | semantics.md § Commands; schema `returns` description                                     |
| [x]    | Durable rate-limit (Postgres store)                                           | FULLY_IMPLEMENTED        | §1                                                                                        |

---

## 5. Stores & persistence subsystems

| Status | Feature                                        | Implementation Status | Evidence pointer                       |
| ------ | ---------------------------------------------- | --------------------- | -------------------------------------- |
| [~]    | MemoryStore                                    | CLAIMED_NEEDS_PROOF   | runtime-engine                         |
| [~]    | LocalStorageStore                              | CLAIMED_NEEDS_PROOF   |                                        |
| [~]    | PostgresStore                                  | CLAIMED_NEEDS_PROOF   | `stores.node.ts`                       |
| [~]    | SupabaseStore                                  | CLAIMED_NEEDS_PROOF   |                                        |
| [~]    | Turso / libSQL store                           | CLAIMED_NEEDS_PROOF   |                                        |
| [~]    | DynamoDB store                                 | CLAIMED_NEEDS_PROOF   |                                        |
| [~]    | GenericPrismaStore                             | CLAIMED_NEEDS_PROOF   | `stores/prisma-generic/`               |
| [x]    | EventSourcedStore                              | FULLY_IMPLEMENTED     | §1 — in-process event log + projection |
| [~]    | Outbox: memory/postgres/redis/mongodb/dynamodb | CLAIMED_NEEDS_PROOF   | `outbox/stores/*`                      |
| [~]    | Approval store memory/postgres                 | CLAIMED_NEEDS_PROOF   |                                        |
| [~]    | Idempotency store memory/postgres              | CLAIMED_NEEDS_PROOF   |                                        |
| [x]    | RateLimit store memory/postgres                | FULLY_IMPLEMENTED     | §1                                     |
| [~]    | Custom store via plugin API                    | CLAIMED_NEEDS_PROOF   |                                        |
| [x]    | `manifest db init` SQL apply/print             | FULLY_IMPLEMENTED     | §1                                     |

---

## 6. Projections — every registered target

Registration: `src/manifest/projections/builtins.ts` (`registerBuiltinProjections`). Each row = one registered projection. Status `CLAIMED_NEEDS_PROOF` until per-projection proof commit; Convex/capability nuances in Notes.

| Status | Projection            | Implementation Status          | Notes                                                                            |
| ------ | --------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| [~]    | nextjs                | CLAIMED_NEEDS_PROOF            | createManifestRuntime, executionMode                                             |
| [~]    | routes                | CLAIMED_NEEDS_PROOF            |                                                                                  |
| [~]    | prisma                | CLAIMED_NEEDS_PROOF            | multi-schema, naming options                                                     |
| [~]    | prisma-store          | CLAIMED_NEEDS_PROOF            | softDelete config (not language keyword)                                         |
| [~]    | convex                | PARTIAL                        | core generate + auth seam; many `CONVEX_UNSUPPORTED_*` (§7)                      |
| [~]    | openapi               | CLAIMED_NEEDS_PROOF            |                                                                                  |
| [~]    | react-query           | CLAIMED_NEEDS_PROOF            |                                                                                  |
| [~]    | zod                   | CLAIMED_NEEDS_PROOF            | enum/list/timestamp alias fixed 2026-07-15 per TODO                              |
| [~]    | drizzle               | CLAIMED_NEEDS_PROOF            |                                                                                  |
| [~]    | graphql               | CLAIMED_NEEDS_PROOF            |                                                                                  |
| [~]    | llm-context           | CLAIMED_NEEDS_PROOF            |                                                                                  |
| [~]    | express               | CLAIMED_NEEDS_PROOF            | `authProvider` §1                                                                |
| [~]    | hono                  | CLAIMED_NEEDS_PROOF            | `authProvider` §1                                                                |
| [~]    | mermaid               | CLAIMED_NEEDS_PROOF            |                                                                                  |
| [~]    | jsonschema            | CLAIMED_NEEDS_PROOF            |                                                                                  |
| [~]    | storybook             | CLAIMED_NEEDS_PROOF            |                                                                                  |
| [~]    | health                | PARTIAL                        | generator registered; live IR/store/outbox checks still TODO stubs; docs §7      |
| [x]    | materialized-views    | FULLY_IMPLEMENTED              | §1 — computed via `translateExpression`; raw `columns` escape hatch              |
| [~]    | elasticsearch         | CLAIMED_NEEDS_PROOF            |                                                                                  |
| [~]    | terraform             | CLAIMED_NEEDS_PROOF            |                                                                                  |
| [~]    | analytics             | CLAIMED_NEEDS_PROOF            |                                                                                  |
| [~]    | remix                 | CLAIMED_NEEDS_PROOF            |                                                                                  |
| [~]    | sveltekit             | CLAIMED_NEEDS_PROOF            |                                                                                  |
| [~]    | kysely                | CLAIMED_NEEDS_PROOF            |                                                                                  |
| [~]    | dynamodb (projection) | CLAIMED_NEEDS_PROOF            | distinct from DynamoDB store                                                     |
| [~]    | pydantic              | CLAIMED_NEEDS_PROOF            |                                                                                  |
| [~]    | dart                  | CLAIMED_NEEDS_PROOF            |                                                                                  |
| [~]    | wiring                | CLAIMED_NEEDS_PROOF            |                                                                                  |
| [~]    | contract-tests        | CLAIMED_NEEDS_PROOF            | See `docs/internal/COMPLIANCE_MATRIX.md` (list/get + mutations; auth visibility) |
| [x]    | mongoose              | FULLY_IMPLEMENTED              | COMPLIANCE_MATRIX §1 — registered `mongoose.schema` projection                     |

**Cross-cutting projection gaps**

| Status | Feature                                        | Implementation Status | Notes                                                                             |
| ------ | ---------------------------------------------- | --------------------- | --------------------------------------------------------------------------------- |
| [x]    | Capability descriptors API                     | FULLY_IMPLEMENTED     | §1                                                                                |
| [x]    | Projection descriptor API                      | FULLY_IMPLEMENTED     | §1                                                                                |
| [x]    | `ir.tenant` in all web projections             | FULLY_IMPLEMENTED     | Next/Express/Hono/SvelteKit/Remix — `web-ir-tenant.test.ts` (2026-07-22)          |
| [x]    | Module → Prisma `@@schema` / OpenAPI title     | FULLY_IMPLEMENTED     | per-module file split remains NOT_IMPLEMENTED                                     |
| [ ]    | Convex approvals/retry/rateLimit               | DIAGNOSTIC_ONLY       | `CONVEX_UNSUPPORTED_*` (masking closed §1)                                        |
| [x]    | Convex `masked` / `unmask when`                | FULLY_IMPLEMENTED     | §1                                                                                |
| [x]    | Convex `searchable` → `.searchIndex`           | FULLY_IMPLEMENTED     | §1                                                                                |
| [x]    | Convex `versionProperty` OCC                   | FULLY_IMPLEMENTED     | §1                                                                                |
| [x]    | Convex realtime / computed-cache PARTIAL       | FULLY_IMPLEMENTED     | §1                                                                                |
| [x]    | Convex collection lambda lowering              | FULLY_IMPLEMENTED     | count_of/sum/avg/min_of/max_of/filter/map/flat_map — sum-avg-lambda.test.ts       |
| [ ]    | Hono/Express historically missing authProvider | FULLY_IMPLEMENTED     | fixed §1                                                                          |

---

## 7. CLI, SDK, config, packaging, docs tooling

| Status | Feature                                             | Implementation Status         | Evidence pointer                                                      |
| ------ | --------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------- |
| [~]    | CLI compile/generate/build/watch/validate/fmt/init  | CLAIMED_NEEDS_PROOF           | `packages/cli`                                                        |
| [x]    | CLI writer commands support `--dry-run`             | FULLY_IMPLEMENTED             | §7 / COMPLIANCE_MATRIX @ `510ef3b28ecb04bde1447b5fece1674cd42687c8`   |
| [x]    | CLI `db init`                                       | FULLY_IMPLEMENTED             | §1                                                                    |
| [~]    | enforce-surface / audit-* / lint-routes             | CLAIMED_NEEDS_PROOF / PARTIAL | ORM shapes incomplete                                                 |
| [~]    | wiring-coverage/inspect/remediate                   | CLAIMED_NEEDS_PROOF           |                                                                       |
| [~]    | diff / versions / migrate / changelog               | CLAIMED_NEEDS_PROOF           |                                                                       |
| [~]    | AI: generate-from-prompt, gen-tests, validate-ai    | CLAIMED_NEEDS_PROOF           |                                                                       |
| [~]    | Dev: repl, mock, harness, load-test, profile, seed… | CLAIMED_NEEDS_PROOF           |                                                                       |
| [x]    | `@angriff36/manifest/language-metadata`             | FULLY_IMPLEMENTED             | §1                                                                    |
| [~]    | `@angriff36/manifest/agent-sdk`                     | CLAIMED_NEEDS_PROOF           |                                                                       |
| [~]    | `@angriff36/manifest/seed-pack`                     | CLAIMED_NEEDS_PROOF           |                                                                       |
| [~]    | IR version control / versions CLI                   | CLAIMED_NEEDS_PROOF           | `docs/internal/features/ir-version-control.md`                        |
| [~]    | Snapshot testing tooling                            | CLAIMED_NEEDS_PROOF           | `docs/internal/features/snapshot-testing.md`                          |
| [~]    | Config schema + `manifest config *`                 | CLAIMED_NEEDS_PROOF           | G0/G1                                                                 |
| [x]    | Config G5 `projections.enabled`/`defaults`          | FULLY_IMPLEMENTED             | §1                                                                    |
| [x]    | Config G2 `validation.failOn`                       | FULLY_IMPLEMENTED             | §1                                                                    |
| [x]    | Config G10 `driftGates` / `manifest ci-gate`        | FULLY_IMPLEMENTED             | §1                                                                    |
| [~]    | Published `@angriff36/manifest` npm                 | CLAIMED_NEEDS_PROOF           | pin `package.json` each release                                       |
| [x]    | Park `@manifest/mcp-server` (unpublished)           | FULLY_IMPLEMENTED             | §1 — `"private": true`; in-repo only                                  |
| [x]    | Park `@manifest/lsp-server` (unpublished)           | FULLY_IMPLEMENTED             | §1                                                                    |
| [x]    | Park `@manifest/stdlib` (unpublished)               | FULLY_IMPLEMENTED             | §1                                                                    |
| [x]    | Park VS Code `manifest-lang` (unpublished)          | FULLY_IMPLEMENTED             | §1                                                                    |
| [x]    | SDK stability policy                                | FULLY_IMPLEMENTED             | §1                                                                    |
| [~]    | Conformance suite (~99 fixtures)                    | CLAIMED_NEEDS_PROOF           | `src/manifest/conformance/`                                           |
| [x]    | Doc snippet TS check mode                           | FULLY_IMPLEMENTED             | §1                                                                    |
| [x]    | enforce-surface Drizzle/Kysely/raw-SQL              | FULLY_IMPLEMENTED             | §1 / COMPLIANCE_MATRIX                                                |
| [x]    | Restore `newguard.json`                             | FULLY_IMPLEMENTED             | `docs/internal/contracts/enforce-surface.newguard.json`               |
| [x]    | Health projection docs                              | FULLY_IMPLEMENTED             | §1                                                                    |
| [x]    | FEATURE-LIST → registry inventory (M12)             | FULLY_IMPLEMENTED             | §1                                                                    |
| [ ]    | Capsule-V2 / consumer app auth-seam adoption        | OUT_OF_SCOPE                  | Generated-app lifecycle — Builder + consumer apps; not a Manifest gap |

---

## 8. Open gaps / phantoms (checklist mirror)

Keep in sync with `docs/TODO.md`. The canonical `docs/internal/COMPLIANCE_MATRIX.md` wins disputes.

| Status | Gap                                                                    | Implementation Status |
| ------ | ---------------------------------------------------------------------- | --------------------- |
| [x]    | Approval escalate timeout (open `to` expression)                       | FULLY_IMPLEMENTED     | §1; author-defined routing — not person/department platform choice       |
| [ ]    | `optional` runtime gate (beyond `required`)                            | OUT_OF_SCOPE          | by design — see §4; not a missing Manifest feature                       |
| [x]    | Entity-level constraint overrides                                      | FULLY_IMPLEMENTED     | §1                                                                       |
| [x]    | `command.returns` runtime validation                                   | OUT_OF_SCOPE          | by design — projection metadata only; semantics § Commands               |
| [x]    | EventSourcedStore                                                      | FULLY_IMPLEMENTED     | §1                                                                       |
| [ ]    | softDelete language keyword                                            | NOT_IMPLEMENTED       | Manifest language gap (projection config exists)                         |
| [x]    | Materialized-views SQL expression lowering                             | FULLY_IMPLEMENTED     | §1                                                                       |
| [ ]    | Convex unsupported surfaces (approvals/retry/rateLimit)                | DIAGNOSTIC_ONLY       |
| [x]    | Convex `masked` / `unmask when`                                        | FULLY_IMPLEMENTED     | §1                                                                                |
| [x]    | Config G5 `projections.enabled`/`defaults`                             | FULLY_IMPLEMENTED     | §1                                                                       |
| [x]    | Config G2 `validation.failOn`                                          | FULLY_IMPLEMENTED     | §1                                                                       |
| [x]    | Config G10 `driftGates` / `manifest ci-gate`                           | FULLY_IMPLEMENTED     | §1                                                                       |
| [x]    | `createUserResolver` wired into runtime factory                        | FULLY_IMPLEMENTED     | §1                                                                       |
| [x]    | Sub-package publish/park                                               | FULLY_IMPLEMENTED     | §1 — parked unpublished (`private: true`)                                |
| [x]    | ~~Full WASM runtime~~                                                  | REMOVED 2026-07-15    | Prototype deleted; TypeScript evaluator is the only path                 |
| [ ]    | Time-travel / product debugger UI                                      | OUT_OF_SCOPE          | Builder-owned                                                            |
| [x]    | Durable `RateLimitStore` / Postgres adapter                            | FULLY_IMPLEMENTED     | §1                                                                       |
| [x]    | ~~`manifest test constraints` / ConstraintTestHarness~~                | REMOVED (docs struck) | use `manifest harness` / `repl`                                          |
| [x]    | ~~`manifest generate-fixtures`~~                                       | REMOVED (docs struck) | use `manifest seed` / `load-test`                                        |
| [x]    | ~~Config `env(VAR)` / `MANIFEST_ENV` overlays / YAML `stores:` urls~~  | REMOVED (docs struck) | use `env:` preflight + `process.env` in `manifest.config.ts`             |
| [x]    | ~~`projection.generateRoute` / `generateTypes` / `generateClient`~~    | REMOVED (docs struck) | use `generate(ir, request)` / CLI `--all`                                |
| [x]    | Kysely `columnMappings` actually applied                               | FULLY_IMPLEMENTED     | COMPLIANCE_MATRIX §8 — generator applies mappings to property + FK keys  |
| [ ]    | Kitchen tutorial / product editor UI                                   | OUT_OF_SCOPE          | Builder owns visual editing; Kitchen is Manifest diagnostic surface only |
| [ ]    | Default encryption provider (common no-vendor case)                    | NOT_IMPLEMENTED       | fail-closed by design until provider set                                 |
| [ ]    | Projection orchestration / presets / app assembly UX                   | OUT_OF_SCOPE          | Builder — see Builder consumption matrix                                 |

---

## 9. Feature-doc pages (`docs/internal/features/*.md`)

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

| Source                                                      | Role vs this matrix                                                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `docs/internal/contracts/manifest-builder-boundary.md`      | **Ownership law** — what belongs in this matrix vs Builder                                                        |
| `C:\projects\builder\docs\CAPABILITY_CONSUMPTION_MATRIX.md` | Builder consumption + `BUILDER_CONSUMED` / `END_TO_END_VERIFIED` evidence                                         |
| `docs/platform/CONFIRMED-FEATURES.md`                       | Existence narrative — must not claim completion beyond this file                                                  |
| `docs/FEATURE-LIST.md`                                      | **Generated** registry inventory (`pnpm docs:feature-list`); existence/registration only — **not** completion SoT |
| `docs/internal/features/*.md`                               | User guides — each Manifest capability should appear as a row above                                               |
| `docs/TODO.md`                                              | Working checklist (Manifest gaps; Builder items must be `OUT_OF_SCOPE` or moved)                                  |
| Conformance fixtures                                        | Executable semantics evidence pointers                                                                            |
| Appendix D phantoms (2026-07-01 audit)                      | Names that must appear as `NOT_IMPLEMENTED` / struck claims until fixed                                           |

When a **Manifest-owned** feature is found in any of those sources but missing here: **add a row immediately** (even as `CLAIMED_NEEDS_PROOF` or `NOT_IMPLEMENTED`). When the capability is Builder-owned: mark `OUT_OF_SCOPE` here and add/update the Builder consumption matrix — do **not** treat it as a missing Manifest implementation.

**Still not one-row-per-FEATURE-LIST-entry:** FEATURE-LIST has overlapping/historical names. Prefer CONFIRMED + fixtures + `builtins.ts` + CLI index as the enumeration sources; pull FEATURE-LIST names in when they describe a distinct Manifest capability not already listed.
