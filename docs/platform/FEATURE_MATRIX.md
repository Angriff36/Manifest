---
title: Manifest Feature Matrix
created: 2026-02-28
updated: 2026-07-22
# Edit 2026-07-22: bulk-synced §2 FULLY rows from COMPLIANCE_MATRIX (FEATURE-LIST source)
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
| `@angriff36/manifest/ir-compiler` (`compile`)                                    | FULLY_IMPLEMENTED                                           | mirror of COMPLIANCE_MATRIX — `ir-compiler.test.ts` @ `a8e72f21…`          |
| `@angriff36/manifest/multi-compiler`                                             | FULLY_IMPLEMENTED                                           | mirror of COMPLIANCE_MATRIX — `multi-compiler.test.ts` @ `c75944c8…`       |
| `@angriff36/manifest/projections` (generate / list / capabilities / descriptors) | FULLY_IMPLEMENTED (APIs) + per-target capability rows       | mirror of COMPLIANCE_MATRIX — registry APIs §1                             |
| `@angriff36/manifest/runtime-engine`                                             | FULLY_IMPLEMENTED                                           | mirror of COMPLIANCE_MATRIX — runtime suite @ `2d0537e2…`                  |
| `@angriff36/manifest/ir-diff` + `/breaking-change`                               | FULLY_IMPLEMENTED                                           | mirror of COMPLIANCE_MATRIX — ir-diff + breaking-change tests @ `f96618e9…` |
| `@angriff36/manifest/projections/wiring`                                         | FULLY_IMPLEMENTED                                           | mirror of COMPLIANCE_MATRIX — wiring suites + ConsumerTracer fix           |
| `@angriff36/manifest/agent-sdk`                                                  | FULLY_IMPLEMENTED                                           | mirror of COMPLIANCE_MATRIX — agent-sdk @ `f96618e9…`                      |
| `@angriff36/manifest/language-metadata`                                          | FULLY_IMPLEMENTED (§1)                                      | `BUILDER_CONSUMED` (candidate `END_TO_END_VERIFIED` if Builder test green) |
| `@angriff36/manifest/seed-pack` + convex assembly helpers                        | FULLY_IMPLEMENTED                                           | mirror of COMPLIANCE_MATRIX — seed-pack @ `a8e72f21…`                      |
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
| [x]    | `record` type alias (= `map`)                         | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §1 — `parser.ts:1322-1349` @ `dc52bb5…`; IR `ir-compiler.ts:1885-1893`; `map-record-alias.test.ts` @ `08e1c54…`                                                                                                         |
| [x]    | Appendix E: `.length` member ≡ `length(v)`            | FULLY_IMPLEMENTED     | `runtime-engine.ts` member eval; `docs/spec/builtins.md` + `semantics.md`; `runtime-member-length.test.ts` — SHA after commit                                                                                                                   |
| [x]    | Appendix E: retry/rateLimit field-name ergonomics     | FULLY_IMPLEMENTED     | `retry-ratelimit-aliases.ts` + parser; `retry-ratelimit-aliases.test.ts` — SHA after commit                                                                                                                                                     |
| [x]    | Retry `maxDelay` delay-cap                            | FULLY_IMPLEMENTED     | IR `maxDelayMs` + `computeRetryDelays` clamp; `runtime-retry.test.ts` — SHA after commit                                                                                                                                                        |
| [x]    | Appendix E: reserved-word ergonomics (domain names)   | FULLY_IMPLEMENTED     | contextual `publish`/`persist`/`read`/`write`/`delete`/`execute`/`tenant`; `reserved-word-ergonomics.test.ts` — SHA after commit                                                                                                               |
| [x]    | OpenAPI ↔ dispatcher command path alignment           | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §1 — `command-paths.ts:1-58`; default `commandPathStyle: 'both'`; proofs `command-paths.test.ts` + `openapi/generator.test.ts` (48) 2026-07-22                                                                      |
| [x]    | Config G9 `plugins.order` / capabilities              | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §1 — `plugin-order.ts:1-67` + `loadPlugins` `loadOrder`/`declaredCapabilities`; proofs `plugin-order.test.ts`                                                                                                      |
| [x]    | Config G8 `hooks.lifecycle`                           | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §1 — `lifecycle-hooks.ts:1-119` + compile/generate wire; proofs `lifecycle-hooks.test.ts` (4)                                                                                                                      |
| [x]    | Config G3 `mergeIntegrity`                            | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §1 — `merge-integrity.ts` + multi-compiler wire; proofs `merge-integrity.test.ts` + multi-compiler G3 cases                                                                                                         |
| [x]    | Config G4 `provenance`                                | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §1 — `provenance-config.ts` + compile lockfile wire; proofs `provenance-config.test.ts` (8)                                                                                                                          |

---

## 2. Language (DSL) — full inventory

Statuses: `CLAIMED_NEEDS_PROOF` until §1-style proof is attached. Fixture IDs are evidence pointers, not commits.

| Status | Feature                                                                                                              | Implementation Status         | Evidence pointer                                                             |
| ------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------- |
| [x]    | Entities + typed properties + defaults                                                                               | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 — parseEntity/parseProperty + fixture `01` @ `cdb0a2e5…` / `f39b2f87…` |
| [x]    | Property modifiers (`required`/`unique`/`indexed`/`private`/`readonly`/`optional`/`searchable`/`encrypted`/`masked`) | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 — `property-modifiers.ts` SoT @ `11988d60…`; `optional` runtime gate OUT_OF_SCOPE by design |
| [x]    | `extends` inheritance + cycle detection                                                                              | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 — parse + `entity-composition` cycle DFS + fixtures `77`/`81` @ `e2a791c9…` / `9f3a9bfa…` |
| [x]    | `mixin` composition                                                                                                  | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 — parse + composition merge + fixtures `78`/`79` @ `e2a791c9…` / `9f3a9bfa…` |
| [x]    | Generic / parameterized entities `Entity<T>`                                                                         | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 — parse+expand @ `6658d3eccbe885b899a1e4417aad21c5ca9e004d`; fixtures `84`/`85` |
| [x]    | Value objects / embedded types                                                                                       | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 — parse `parser.ts:510-544` @ `ad02a4dc…`; IR `ir-compiler.ts:499,791-795`; fixture `60`; OpenAPI VO schemas @ `9f93a40e…` |
| [x]    | Enum types                                                                                                           | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 — parse `parser.ts:465-508` @ `68dc9c26…`; IR `ir-compiler.ts:506-508,1019-1028`; fixture `57`; Zod `z.enum` @ `3052dc56…` |
| [x]    | `decimal` / `money` types                                                                                            | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 — parse `parser.ts:1302-1321` @ `9e34bc43…`; IR params `ir-compiler.ts:1885-1893`; fixture `56`; Next.js number map @ `cc71f1fe…`; runtime = JS number |
| [x]    | `map` / record type                                                                                                  | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 — parse `parser.ts:1322-1349` @ `dc52bb5…`; IR `record`→`map`; fixture `73`; `map-record-alias.test.ts` @ `08e1c54…` |
| [x]    | Array types `T[]` / `array<T>`                                                                                       | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 — postfix sugar `parser.ts:1351-1365`; fixture `40` @ `75d3331d…`; Zod array map @ `cbaff934…` |
| [x]    | `date` / `time` / `datetime` / `duration`                                                                            | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 — `date-time.ts` + write-time validate @ `893e2889…`; fixture `92`; `timestamp` alias §1 @ `22c7792…` |
| [x]    | Composite primary keys (`key`)                                                                                       | FULLY_IMPLEMENTED           | mirror of COMPLIANCE_MATRIX — parse `parser.ts:403-405`; IR `ir-compiler.ts:872`; runtime `runtime-engine.ts:1686-1696,2706-2722`; fixture `109`; proofs `runtime-composite-key-persisted-id.t… |
| [~]    | `alternateKeys` (compile into IR)                                                                                    | FULLY_IMPLEMENTED             | §1 uniqueness; compile still CLAIMED_NEEDS_PROOF for parser path             |
| [x]    | Relationships `hasMany` / `hasOne` / `belongsTo` / `ref`                                                             | FULLY_IMPLEMENTED           | mirror of COMPLIANCE_MATRIX — `src/manifest/parser.ts:988-1054` @ `5ec24009c563f1ac869a40202b6e004310fa5f9b`; `src/manifest/ir-compiler.ts:1157-1182` @ `303ac9e45b46a8a57832af7133622c22af4c0… |
| [x]    | Referential actions `onDelete`/`onUpdate`                                                                            | FULLY_IMPLEMENTED             | see §1                                                                       |
| [x]    | Many-to-many `through`                                                                                               | FULLY_IMPLEMENTED             | see §1                                                                       |
| [x]    | Auto timestamps / `autoNow` (`now()`/`today()`)                                                                      | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 — parse `parser.ts:411-413,459` @ `4cfff8ec…`; IR inject + `autoNow` lower `ir-compiler.ts:841-858,876,1051-1067` @ `68afb8ab…`; runtime `runtime-engine.ts:2674-2705,3185-3186`; fixture `62`; `create-field-and-autonow.test.ts` @ `849e368…` |
| [x]    | `private` / `encrypted` / `masked` privacy                                                                           | FULLY_IMPLEMENTED           | mirror of COMPLIANCE_MATRIX — masking `masking.ts:1-38` + `runtime-masking.test.ts` + fixture `93` @ `b8b29a34ec291c779796da00dfb27bc9cc3e1347` / `4dbd09d96b6f474bee7f91669dd2aadcb07b8456`; … |
| [x]    | `searchable` declarations                                                                                            | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 — modifier + IR string-gate + fixture `89` @ `9f3a9bfa…`; Convex `.searchIndex` §1 @ `f8221d44…` |
| [x]    | Multi-tenancy (`tenant`)                                                                                             | FULLY_IMPLEMENTED           | mirror of COMPLIANCE_MATRIX — parse `parser.ts:124-133,547-561`; IR `ir-compiler.ts:676-677,798-804`; runtime resolve/filter/inject/fail-closed `runtime-engine.ts:1218-1237,3344-3354` (+ wri… |
| [x]    | Optimistic concurrency `versionProperty`                                                                             | FULLY_IMPLEMENTED           | mirror of COMPLIANCE_MATRIX — `runtime-engine.ts:2981-3016,4543-4546` @ `3acb0de282d3b2c3dfb05e6250094f32768e72af`; fixtures `24`, `54` @ same |
| [x]    | Commands (params, guards, mutate, emit, emitPayloads)                                                                | FULLY_IMPLEMENTED           | mirror of COMPLIANCE_MATRIX — parse `parser.ts:1062-1180`; IR `ir-compiler.ts:1428-1481`; runtime `runtime-engine.ts:3310-3452` (runCommand), `4291+` (_executeCommandInternal); fixture `04` … |
| [x]    | Async / background commands                                                                                          | FULLY_IMPLEMENTED           | mirror of COMPLIANCE_MATRIX — parse `parser.ts:134-140`; IR async + completion/failure events; runtime enqueue/validate/drain `runtime-engine.ts:3373-3419`+; fixture `69` (IR); proofs `runti… |
| [x]    | Command `retry` policy                                                                                               | FULLY_IMPLEMENTED           | mirror of COMPLIANCE_MATRIX — parse `parser.ts:2679-2744`; IR `ir-compiler.ts:2086-2116`; `runtime-retry.ts` + `executeWithRetry` `runtime-command-extensions.ts:106-176`; engine `runtime-eng… |
| [x]    | Command/policy `rateLimit`                                                                                           | FULLY_IMPLEMENTED           | mirror of COMPLIANCE_MATRIX — parse `parser.ts:2834-2894`; IR `ir-compiler.ts:2118-2143`; gate `runtime-command-extensions.ts:44-81`; engine command/policy wires; fixtures `74`/`75`/`100` (e… |
| [x]    | Computed properties                                                                                                  | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 — parse/runtime + fixture `03` @ `974f2775…` / `f96618e9…` / `f39b2f87…` |
| [x]    | Computed caching (`request`/`session`/`ttl`)                                                                         | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 — fixture `65` + `runtime-computed-cache.test.ts` @ `7a1ef496…` |
| [x]    | Constraints severity `ok`/`warn`/`block`                                                                             | FULLY_IMPLEMENTED           | mirror of COMPLIANCE_MATRIX — see §1; fixtures `21`, `36` |
| [x]    | Constraint `failWhen` polarity                                                                                       | FULLY_IMPLEMENTED             | see §1                                                                       |
| [x]    | Constraint override authorization                                                                                    | FULLY_IMPLEMENTED           | mirror of COMPLIANCE_MATRIX — see §1; fixtures `22`, `52`, `53` |
| [x]    | Entity-level constraint overrides evaluated                                                                          | FULLY_IMPLEMENTED             | see §1                                                                       |
| [x]    | Policies read/write/delete/execute/all/override                                                                      | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 — `parsePolicy` + `checkPolicies` + fixture `06-policy-denial` @ `46a8535e…` / `5ec24009…` / `f39b2f87…` |
| [x]    | State transitions                                                                                                    | FULLY_IMPLEMENTED           | mirror of COMPLIANCE_MATRIX — `runtime-engine.ts:3032-3044,4496-4509` @ `4d3b467a55b55cc239ca61e578f5664754e85563`; fixture `38-state-transitions` |
| [x]    | Aggregate `count()` in reactions                                                                                     | FULLY_IMPLEMENTED           | mirror of COMPLIANCE_MATRIX — parse `parser.ts:2514-2565`; IR `ir-compiler.ts:2005-2019`; runtime `runtime-engine.ts:5863-5889`; fixture `97`; proof `runtime-aggregate-count.test.ts:1-217` @… |
| [x]    | Events + reactions (`on Event run`)                                                                                  | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 — parse/IR/runtime + Reactions suite @ `83e6c4f…`; fixture `67` emit; fan-out fixture `96` separate row |
| [x]    | Reaction fan-out                                                                                                     | FULLY_IMPLEMENTED           | mirror of COMPLIANCE_MATRIX — classic 1:N `fanOut Target where … run cmd`; parse `parser.ts:1479-1562`; IR `ir-compiler.ts:1364-1371`; runtime `runtime-engine.ts:4921-5006`; fixture `96`; pr… |
| [x]    | Sagas + compensation                                                                                                 | FULLY_IMPLEMENTED           | mirror of COMPLIANCE_MATRIX — parse `parser.ts:1828-1910`; IR `ir-compiler.ts:1379-1398`; runtime `runtime-engine.ts:3507-3707` (`runSaga` + compensate, best-effort); fixture `88` (IR); proo… |
| [x]    | Approvals (multi-stage, `onTimeout: cancel`)                                                                         | FULLY_IMPLEMENTED           | mirror of COMPLIANCE_MATRIX — parse `parser.ts:683-758`; IR `ir-compiler.ts:932-941`; runtime gate `runtime-engine.ts:6681-6730`; expire cancel `runtime-engine.ts:6914-6954`; fixture `68` (I… |
| [x]    | Approval `onTimeout: escalate` (open author target)                                                                  | FULLY_IMPLEMENTED             | see §1; fixtures `111`, `103` (bare incomplete)                              |
| [x]    | Roles / RBAC hierarchy + deny                                                                                        | FULLY_IMPLEMENTED           | mirror of COMPLIANCE_MATRIX — parse `parser.ts:1217-1245`; IR `ir-compiler.ts:1734-1883`; runtime `runtime-engine.ts:1364-1385,2005-2022`; fixture `71` (6 runtime cases: inherit/deny/fail-cl… |
| [x]    | Webhooks + HMAC                                                                                                      | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 inbound HMAC — fixture `90` @ `853aac2d…`; outbound is separate row |
| [x]    | Outbound HTTP partner delivery (event → `POST` URL via outbox worker)                                                | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 — `HttpPartnerDeliverer` `outbox/http-partner-deliverer.ts:1-132` + `@angriff36/manifest/outbox/http-partner`; proofs `http-partner-deliverer.test.ts`; not IR `webhook` |
| [x]    | Schedules cron/interval/every                                                                                        | FULLY_IMPLEMENTED           | mirror of COMPLIANCE_MATRIX — parse `parser.ts:2746-2832`; IR `ir-compiler.ts:667-669,2159-2222`; due logic `runtime-schedule.ts`; engine `getSchedules`/`runSchedule`; worker `schedule-worke… |
| [x]    | Store declarations                                                                                                   | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 — `parseStore` + `transformStore` + `createConfiguredStore` @ `974f2775…` / `2af8191b…` / `9c94b2db…` |
| [x]    | Modules + `use` imports                                                                                              | FULLY_IMPLEMENTED           | mirror of COMPLIANCE_MATRIX — parse `use`/`module` `parser.ts:92-115,194-256`; resolve `module-resolver.ts:43-224` + `module-resolver.test.ts` @ `8ab04431c85031ef804e1e10ed87d49809ced293`; m… |
| [x]    | Regex constraints                                                                                                    | FULLY_IMPLEMENTED           | mirror of COMPLIANCE_MATRIX — compile `ir-compiler.ts:1944-1964`; runtime `matches` `runtime-engine.ts:1772-1779`; fixture `63` + results @ `0a2a0f9af2a08e24c51a6f902ae5d03867c14b72` (impl `… |
| [x]    | Range constraints                                                                                                    | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 — `between`/`min`/`max`/`length` + `constraint-analysis.ts` @ `1afc216b…` / `c0debb37…`; fixture `57`; doc `docs/features/range-constraints.md` (min/max runtime caveat) |
| [x]    | Security features surface (doc)                                                                                      | FULLY_IMPLEMENTED           | mirror of COMPLIANCE_MATRIX — `docs/features/security-features.md` matches runtime encryption no-op + masking + rateLimit/retry; Convex fail-closed note added 2026-07-22. Default encryption … |
| [x]    | Federation SDK (`@angriff36/manifest/federation`)                                                                    | FULLY_IMPLEMENTED             | COMPLIANCE_MATRIX §1; docs path is `docs/features/federation.md` (not `internal/`) |
| [x]    | Realtime subscriptions (language/runtime)                                                                            | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §2 — entity `realtime` + `RuntimeEngine.subscribe` + Next.js SSE (14 tests); Convex projection remains PARTIAL diagnostic |
| [x]    | Entity `behavior` blocks                                                                                             | REJECTED_LOUD → proven reject | see §1 / fixture `110`                                                       |
| [x]    | Language keyword `softDelete`                                                                                        | OUT_OF_SCOPE                  | mirror of COMPLIANCE_MATRIX §2 — parked 2026-07-15; projection-config softDelete is intentional SoT |
| [x]    | Appendix E: `map<K,V>` arbitrary non-string keys                                                                     | REJECTED_LOUD → by design     | String keys only; `record` alias ships (§1)                                  |
| [x]    | `record` type alias (= `map`)                                                                                        | FULLY_IMPLEMENTED             | §1                                                                           |
| [x]    | Appendix E: retry/rateLimit field-name ergonomics                                                                    | FULLY_IMPLEMENTED             | §1 — aliases                                                                |
| [x]    | Retry `maxDelay` delay-cap                                                                                           | FULLY_IMPLEMENTED             | §1                                                                          |
| [x]    | Appendix E: reserved-word ergonomics (domain names)                                                                  | FULLY_IMPLEMENTED             | §1 — contextual domain names                                                |
| [x]    | Appendix E: command-body policy clause                                                                               | REJECTED_LOUD → by design     | Top-level policies only; command-body `policy` will not ship                 |
| [x]    | Appendix E: `.length` vs `length()`                                                                                  | FULLY_IMPLEMENTED             | §1 — string/array member sugar                                               |

~~Language type `timestamp` (vs `datetime`) — NOT_IMPLEMENTED / zod alias only~~ → **FULLY_IMPLEMENTED** §1 (2026-07-15).

---

## 3. Expression builtins (49)

Mirror of `docs/internal/COMPLIANCE_MATRIX.md` §3 (2026-07-22). Granular Core/String/Math/Array/Date/`dateOf`…`durationSeconds`/`flag` rows are covered by the rolled-up builtins proof — not separate open gaps.

| Status | Feature                                        | Implementation Status                  | Evidence pointer                            |
| ------ | ---------------------------------------------- | -------------------------------------- | ------------------------------------------- |
| [x]    | Expression builtins (all 49 categories)         | FULLY_IMPLEMENTED                      | mirror of COMPLIANCE_MATRIX §3 — `getBuiltins()` `runtime-engine.ts:1732-2024` (Date/time helpers `dateOf`…`durationSeconds` at `1972-1990`); fixture `16`; proofs include `runtime-datetime-builtins.test.ts` @ `893e2889…` |
| [x]    | `hasPermission` / `roleAllows`                 | FULLY_IMPLEMENTED                      | mirror of COMPLIANCE_MATRIX §3 — fixture `71` @ `83e6c4f…` |
| [x]    | Custom builtins via plugin API                 | FULLY_IMPLEMENTED                      | mirror of COMPLIANCE_MATRIX §3 — plugin-api + loader + `customBuiltins` @ `ac727f90…` |
| [x]    | `today()` compile-time only → `autoNow`        | FULLY_IMPLEMENTED                      | mirror of COMPLIANCE_MATRIX §3 / §2 Auto timestamps @ `68afb8ab…` |

---

## 4. Runtime engine & adapters

| Status | Feature                                                                       | Implementation Status    | Evidence pointer                                                                          |
| ------ | ----------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| [x]    | Command order (rateLimit → policies → constraints → guards → actions → emits) | FULLY_IMPLEMENTED        | mirror of COMPLIANCE_MATRIX §4 — `runCommand` order @ `f96618e9…`                         |
| [x]    | `RuntimeContext` fields                                                       | FULLY_IMPLEMENTED        | mirror of COMPLIANCE_MATRIX §4 — typed fields `runtime-engine.ts:93-110` @ `2af8191b…`    |
| [x]    | Middleware (4 hooks)                                                          | FULLY_IMPLEMENTED        | mirror of COMPLIANCE_MATRIX §4 — `runtime-middleware.test.ts` @ `9f3a9bfa…`               |
| [x]    | `IRDiagnostic.code` optional                                                  | FULLY_IMPLEMENTED        | mirror of COMPLIANCE_MATRIX §4 — `IRDiagnostic.code` + fixtures 110/103 @ `2af8191b…`/`67f5c13d…` |
| [x]    | Batched persistence                                                           | FULLY_IMPLEMENTED        | mirror of COMPLIANCE_MATRIX §4 — `runtime-command-batched-persistence.test.ts` @ `9b7695c8…` |
| [x]    | `EncryptionProvider`                                                          | FULLY_IMPLEMENTED        | mirror of COMPLIANCE_MATRIX §4 — injectable seam @ `9f3a9bfa…`; no default provider       |
| [x]    | Deterministic mode / effect boundary                                          | FULLY_IMPLEMENTED        | mirror of COMPLIANCE_MATRIX §4 / §1                                                       |
| [x]    | EventBus (in-process)                                                         | FULLY_IMPLEMENTED        | mirror of COMPLIANCE_MATRIX §4 — `MemoryEventBus` + engine wire + proofs @ `61d5ab6f…`     |
| [x]    | RedisEventBus injectable                                                      | FULLY_IMPLEMENTED        | §1                                                                                        |
| [x]    | ~~WASM expression compatibility layer~~                                       | REMOVED 2026-07-15       | Quarantined prototype deleted — no `.wasm` artifact, never on default RuntimeEngine path  |
| [x]    | ~~Full WASM runtime~~                                                         | REMOVED / OUT_OF_SCOPE   | Same — do not reintroduce without a measured perf mandate + shipped artifact + real tests |
| [ ]    | Time-travel debugger (product UI)                                             | OUT_OF_SCOPE             | Builder owns verification/debugging UI — see boundary; not a Manifest language gap        |
| [x]    | IdempotencyStore                                                              | FULLY_IMPLEMENTED        | mirror of COMPLIANCE_MATRIX §4 / §1                                                       |
| [x]    | JobQueue / async worker path                                                  | FULLY_IMPLEMENTED        | mirror of COMPLIANCE_MATRIX §4 — same proof as Async commands @ `83e6c4f…` / `abe9595c…`   |
| [x]    | `optional` modifier (projection hint; no runtime gate)                        | OUT_OF_SCOPE / by design | semantics.md § Properties — enforced via `required` only                                  |
| [x]    | Runtime uses `alternateKeys`                                                  | FULLY_IMPLEMENTED        | §1                                                                                        |
| [x]    | `command.returns` (projection metadata; no runtime coerce)                    | OUT_OF_SCOPE / by design | semantics.md § Commands; schema `returns` description                                     |
| [x]    | Durable rate-limit (Postgres store)                                           | FULLY_IMPLEMENTED        | §1                                                                                        |

---

## 5. Stores & persistence subsystems

| Status | Feature                                        | Implementation Status | Evidence pointer                       |
| ------ | ---------------------------------------------- | --------------------- | -------------------------------------- |
| [x]    | MemoryStore                                    | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §5 — `runtime-engine.ts:757-795` + default memory target @ `2af8191b…` / `9c94b2db…` |
| [x]    | LocalStorageStore                              | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §5 — `runtime-engine.ts:797-856` + `localStorage` target wire @ `2af8191b…` / `9c94b2db…` |
| [x]    | PostgresStore                                  | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §5 — `stores.node.ts` + `stores.postgres.test.ts` (SHA after commit) |
| [x]    | SupabaseStore                                  | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §5 — `stores.node.ts` + `stores.supabase.test.ts` (SHA after commit) |
| [x]    | Turso / libSQL store                           | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §5 — `TursoStore` + `stores.turso.test.ts` @ `9f3a9bfa…` |
| [x]    | DynamoDB store                                 | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §5 — `DynamoDBStore` + `stores.dynamodb.test.ts` @ `9f3a9bfa…` |
| [x]    | GenericPrismaStore                             | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §5 — `stores/prisma-generic/` @ `d6d42fc8…` |
| [x]    | EventSourcedStore                              | FULLY_IMPLEMENTED     | §1 — in-process event log + projection |
| [x]    | Outbox memory (`MemoryOutboxStore`)            | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §5 — `outbox/stores/memory.ts` + `memory.test.ts` @ `b296e1a57f19…` |
| [x]    | Outbox postgres                                | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §5 — `outbox/stores/postgres.ts` + `postgres.test.ts` @ `b296e1a57f19…` |
| [x]    | Outbox redis / mongodb / dynamodb              | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §5 — `redis/mongodb/dynamodb.test.ts` (13) injectable mocks; Redis XACK stream-id fix |
| [x]    | Approval store memory/postgres                                                                                       | FULLY_IMPLEMENTED           | mirror of COMPLIANCE_MATRIX — contract `approval/approval-store.ts:27-61`; Memory `approval/stores/memory.ts:28-67`; Postgres `approval/stores/postgres.ts:80-159`; runtime wire `runtime-engi… |
| [x]    | Idempotency store memory/postgres                                                                                    | FULLY_IMPLEMENTED           | mirror of COMPLIANCE_MATRIX — §1 — `idempotency/stores/*` |
| [x]    | RateLimit store memory/postgres                | FULLY_IMPLEMENTED     | §1                                     |
| [x]    | Custom store via plugin API                    | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §5 — `StoreAdapterPlugin` + composition E2E @ `ac727f90…` |
| [x]    | `manifest db init` SQL apply/print             | FULLY_IMPLEMENTED     | §1                                     |

---

## 6. Projections — every registered target

Registration: `src/manifest/projections/builtins.ts` (`registerBuiltinProjections`). Each row = one registered projection. Status `CLAIMED_NEEDS_PROOF` until per-projection proof commit; Convex/capability nuances in Notes.

| Status | Projection            | Implementation Status          | Notes                                                                            |
| ------ | --------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| [x]    | nextjs                | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — proofs nextjs/generator + dispatcher/webhook/schedule/companions @ `3c10705ff78f`; batch 961 projection tests green 2026-07-22 |
| [x]    | routes                | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — routes/generator.test.ts + routes.conformance.test.ts @ `5290df259a44` |
| [x]    | prisma                | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — prisma/generator.test.ts @ `cf5be82e0fea` |
| [x]    | prisma-store          | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — prisma-store/generator.test.ts (6) @ `d6d42fc865e4`; softDelete = projection config only |
| [~]    | convex                | PARTIAL                        | mirror of COMPLIANCE_MATRIX §6 — relationship read hydration + saga shared-input + single + composite referential onDelete/onUpdate (cascade/restrict/setNull/setDefault) + trustedSource strip/inject Supported; composite FK Supported (`referential-edges`/`referential-emit` + schema composite indexes); read rateLimit/async/action-kind/retry/approvals REJECTED_LOUD; remaining Partial: realtime/computed-cache |
| [x]    | openapi               | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — dispatcher command paths + deprecated legacy alias (`commandPathStyle: 'both'`); `command-paths.ts` + generator tests (48) 2026-07-22 |
| [x]    | react-query           | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — react-query/generator.test.ts (34) @ `f5b2f4cd11a3` |
| [x]    | zod                   | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — zod/generator.test.ts (50) @ `31c780fecdb6` |
| [x]    | drizzle               | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — drizzle/generator.test.ts (57) @ `99c2249589cd` |
| [x]    | graphql               | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — graphql/generator.test.ts (41) @ `e3000a414b44` |
| [x]    | llm-context           | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — llm-context/generator.test.ts (38) @ `fb6e9252be79` |
| [x]    | express               | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — express companions+webhooks @ `5d83d8d47018`; authProvider §1 |
| [x]    | hono                  | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — hono companions+webhooks @ `5d83d8d47018`; authProvider §1 |
| [x]    | mermaid               | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — mermaid/mermaid.test.ts (21) @ `fb6e9252be79` |
| [x]    | jsonschema            | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — jsonschema/generator.test.ts (1) @ `52fbcda4397f` |
| [x]    | storybook             | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — storybook/generator.test.ts (24) @ `83e6c4f66ed1` |
| [x]    | health                | FULLY_IMPLEMENTED              | mirror of COMPLIANCE_MATRIX §6 — HealthProbes live IR/store/outbox + stub fallback; 44 tests |
| [x]    | materialized-views    | FULLY_IMPLEMENTED              | §1 — computed via `translateExpression`; raw `columns` escape hatch              |
| [x]    | elasticsearch         | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — elasticsearch/generator.test.ts (24) @ `9f3a9bfaed21` |
| [x]    | terraform             | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — terraform/generator.test.ts (25) @ `9f3a9bfaed21` |
| [x]    | analytics             | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — analytics/generator.test.ts (26) @ `9f3a9bfaed21` |
| [x]    | remix                 | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — remix/companions.test.ts @ `5d83d8d47018` |
| [x]    | sveltekit             | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — sveltekit/generator.test.ts (40) @ `9f3a9bfaed21` |
| [x]    | kysely                | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — kysely generator+options+column-mappings @ `59dd2eb16d30` |
| [x]    | dynamodb (projection) | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — dynamodb/generator.test.ts (9) @ `9f3a9bfaed21`; ≠ entity DynamoDBStore |
| [x]    | pydantic              | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — pydantic/generator.test.ts (19) @ `9f3a9bfaed21` |
| [x]    | dart                  | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — dart/generator.test.ts (24) + verify.test.ts @ `9f3a9bfaed21` |
| [x]    | wiring                | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — wiring/generator.test.ts + remediate suites @ `971df066351f` |
| [x]    | contract-tests        | FULLY_IMPLEMENTED            | mirror of COMPLIANCE_MATRIX §6 — contract-tests/generator.test.ts (4) @ `0c8c54d4abc5`; export-name suites only |
| [x]    | mongoose              | FULLY_IMPLEMENTED              | COMPLIANCE_MATRIX §1 — registered `mongoose.schema` projection                     |

**Cross-cutting projection gaps**

| Status | Feature                                        | Implementation Status | Notes                                                                             |
| ------ | ---------------------------------------------- | --------------------- | --------------------------------------------------------------------------------- |
| [x]    | Capability descriptors API                     | FULLY_IMPLEMENTED     | §1                                                                                |
| [x]    | Projection descriptor API                      | FULLY_IMPLEMENTED     | §1                                                                                |
| [x]    | `ir.tenant` in all web projections             | FULLY_IMPLEMENTED     | Next/Express/Hono/SvelteKit/Remix — `web-ir-tenant.test.ts` (2026-07-22)          |
| [x]    | Module → Prisma `@@schema` / OpenAPI title     | FULLY_IMPLEMENTED     | per-module file split remains NOT_IMPLEMENTED                                     |
| [x]    | Convex command `rateLimit`                     | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §6 — `rate-limit-emit.ts` |
| [x]    | Convex policy `rateLimit` (write/execute/delete) | FULLY_IMPLEMENTED   | mirror of COMPLIANCE_MATRIX §6 — mutation emit |
| [x]    | Convex read/`all` policy `rateLimit`           | REJECTED_LOUD         | mirror of COMPLIANCE_MATRIX §6 — queries cannot mutate buckets (error) |
| [x]    | Convex `flagProviderImport` / read `flag()`    | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §6 — public queries when seam + authContextImport set |
| [x]    | Convex read-policy `belongsTo`/`ref` hydration | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §6 — `__resolveRelation` on queries |
| [x]    | Convex read-policy one-hop `hasMany` hydration | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §6 — inverse FK index load |
| [x]    | Convex read-policy `hasMany through` hydration  | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §6 — join index + target resolve; missing edges internal |
| [x]    | Convex read/`all` policy query enforcement     | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §6 — renderable + flag + relationship hydration; read rateLimit REJECTED_LOUD |
| [x]    | Convex webhook HMAC signature                  | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §6 — `orchestration.ts` `_verifyHmac`; no false unsupported diagnostic |
| [x]    | Convex command `retry`                         | REJECTED_LOUD         | mirror of COMPLIANCE_MATRIX §6 — `CONVEX_UNSUPPORTED_RETRY` error                 |
| [x]    | Convex approvals                               | REJECTED_LOUD         | mirror of COMPLIANCE_MATRIX §6 — `CONVEX_UNSUPPORTED_APPROVAL` error              |
| [x]    | Convex `async` commands / job queue            | REJECTED_LOUD         | mirror of COMPLIANCE_MATRIX §6 — `CONVEX_UNSUPPORTED_ASYNC_COMMAND` error         |
| [x]    | Convex action kinds `effect`/`publish`/`persist` | REJECTED_LOUD       | mirror of COMPLIANCE_MATRIX §6 — `CONVEX_UNSUPPORTED_ACTION_KIND` error           |
| [x]    | Convex saga shared-input step forwarding       | FULLY_IMPLEMENTED     | mirror of COMPLIANCE_MATRIX §6 — one `input` to every step (IR contract)          |
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
| [x]    | CLI compile/generate/build/watch/validate/fmt/init  | FULLY_IMPLEMENTED                        | mirror of COMPLIANCE_MATRIX §7 — CLI suites `compile|generate|build|watch|validate|fmt|init.test.ts` — **176 passed** (2026-07-22). SHAs @ `f96618e90e54` / config family `7c4d3f30d1e3`. |
| [x]    | CLI writer commands support `--dry-run`             | FULLY_IMPLEMENTED             | §7 / COMPLIANCE_MATRIX @ `510ef3b28ecb04bde1447b5fece1674cd42687c8`   |
| [x]    | CLI `db init`                                       | FULLY_IMPLEMENTED             | §1                                                                    |
| [x]    | enforce-surface / audit-* / lint-routes             | FULLY_IMPLEMENTED                        | mirror of COMPLIANCE_MATRIX §7 — `enforce-surface(.cli).test.ts` + `lint-routes.test.ts` + `audit-routes.test.ts` — **92 passed**; ORM shapes + routes conformance already §1 FULL. |
| [x]    | wiring-coverage/inspect/remediate                   | FULLY_IMPLEMENTED                        | mirror of COMPLIANCE_MATRIX §7 — CLI entry `cli-claimed-gaps.test.ts` wiring-coverage; engines `projections/wiring` generator+remediate suites (projection row FULL). vitest alias `projections/wiring` → src. SHA after commit for CLI smoke. |
| [x]    | diff / versions / migrate / changelog               | FULLY_IMPLEMENTED                        | mirror of COMPLIANCE_MATRIX §7 — Engine `ir-diff.test.ts` (35); CLI `versions|changelog.test.ts` + `cli-claimed-gaps.test.ts` ir-diff/migrate json no-op. Apply path: migrate execution row. @ `f96618e90e54`. |
| [x]    | `manifest migrate` Prisma/Drizzle execution         | FULLY_IMPLEMENTED                        | mirror of COMPLIANCE_MATRIX §7 — `MigrationToolRunner` prisma migrate deploy + drizzle/SQL via DATABASE_URL; `migrate-tool-runner.test.ts` (6) |
| [x]    | AI: generate-from-prompt, gen-tests, validate-ai    | FULLY_IMPLEMENTED                        | mirror of COMPLIANCE_MATRIX §7 — `generate-from-prompt|gen-tests|validate-ai.test.ts` green in §7 batch (183 w/ peers). gen-tests fail-closed without ANTHROPIC_API_KEY. @ `f96618e90e54`. |
| [x]    | Dev: repl, mock, harness, load-test, profile, seed… | FULLY_IMPLEMENTED                        | mirror of COMPLIANCE_MATRIX §7 — `mock|harness|load-test|profile|seed.test.ts` green. **repl** is interactive TTY entry (`repl.ts`) — no non-TTY automated suite yet (manual smoke only). |
| [x]    | `@angriff36/manifest/language-metadata`             | FULLY_IMPLEMENTED             | §1                                                                    |
| [x]    | `@angriff36/manifest/agent-sdk`                     | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §7 — `agent-sdk.test.ts` @ `f96618e90e54…` |
| [x]    | `@angriff36/manifest/seed-pack`                     | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §7 — seed-pack suites + CLI @ `f96618e90e54…` |
| [x]    | IR version control / versions CLI                   | FULLY_IMPLEMENTED                        | mirror of COMPLIANCE_MATRIX §7 — `ir-version-store.test.ts` + CLI `versions.test.ts` — **90** with snapshot suite peer @ `f96618e90e54`. |
| [x]    | Snapshot testing tooling                            | FULLY_IMPLEMENTED                        | mirror of COMPLIANCE_MATRIX §7 — `src/manifest/projections/snapshot.test.ts` @ `ed8a4e1d12cd5fb56546e34b123a4dc0b363d6d8`. |
| [x]    | Config schema + `manifest config *`                 | FULLY_IMPLEMENTED                        | mirror of COMPLIANCE_MATRIX §7 — `packages/cli/src/commands/config.test.ts` + `utils/config.test.ts` + `config-validate.test.ts` @ `7c4d3f30d1e3`. |
| [x]    | Config G5 `projections.enabled`/`defaults`          | FULLY_IMPLEMENTED             | §1                                                                    |
| [x]    | Config G2 `validation.failOn`                       | FULLY_IMPLEMENTED             | §1                                                                    |
| [x]    | Config G10 `driftGates` / `manifest ci-gate`        | FULLY_IMPLEMENTED             | §1                                                                    |
| [x]    | Config G9 `plugins.order` / capabilities            | FULLY_IMPLEMENTED             | §1                                                                    |
| [x]    | Config G8 `hooks.lifecycle`                         | FULLY_IMPLEMENTED             | §1                                                                    |
| [x]    | Config G3 `mergeIntegrity`                          | FULLY_IMPLEMENTED             | §1                                                                    |
| [x]    | Config G4 `provenance`                              | FULLY_IMPLEMENTED             | §1                                                                    |
| [x]    | Published `@angriff36/manifest` npm                 | FULLY_IMPLEMENTED                        | mirror of COMPLIANCE_MATRIX §7 — `package.json` version **3.6.41** matches `npm view @angriff36/manifest version` (2026-07-22). Pin consumers to exact version per sdk-stability. |
| [x]    | Park `@manifest/mcp-server` (unpublished)           | FULLY_IMPLEMENTED             | §1 — `"private": true`; in-repo only                                  |
| [x]    | Park `@manifest/lsp-server` (unpublished)           | FULLY_IMPLEMENTED             | §1                                                                    |
| [x]    | Park `@manifest/stdlib` (unpublished)               | FULLY_IMPLEMENTED             | §1                                                                    |
| [x]    | Park VS Code `manifest-lang` (unpublished)          | FULLY_IMPLEMENTED             | §1                                                                    |
| [x]    | SDK stability policy                                | FULLY_IMPLEMENTED             | §1                                                                    |
| [x]    | Conformance suite (~99 fixtures)                    | FULLY_IMPLEMENTED             | mirror of COMPLIANCE_MATRIX §7 — `conformance.test.ts` 323 passed / 101 fixtures @ `3052dc56c456…` |
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
| [x]    | softDelete language keyword                                            | OUT_OF_SCOPE          | mirror of COMPLIANCE_MATRIX §8 — parked 2026-07-15; projection-config SoT |
| [x]    | Materialized-views SQL expression lowering                             | FULLY_IMPLEMENTED     | §1                                                                       |
| [x]    | Convex command `retry` / approvals (loud reject)                       | REJECTED_LOUD         | mirror §6 — `CONVEX_UNSUPPORTED_RETRY` / `_APPROVAL` errors                       |
| [x]    | Convex webhook HMAC signature                                          | FULLY_IMPLEMENTED     | mirror §6                                                                         |
| [x]    | Convex `masked` / `unmask when`                                        | FULLY_IMPLEMENTED     | §1                                                                                |
| [x]    | Config G5 `projections.enabled`/`defaults`                             | FULLY_IMPLEMENTED     | §1                                                                       |
| [x]    | Config G2 `validation.failOn`                                          | FULLY_IMPLEMENTED     | §1                                                                       |
| [x]    | Config G10 `driftGates` / `manifest ci-gate`                           | FULLY_IMPLEMENTED     | §1                                                                       |
| [x]    | Config G9 `plugins.order` / capabilities                               | FULLY_IMPLEMENTED     | §1                                                                       |
| [x]    | Config G8 `hooks.lifecycle`                                            | FULLY_IMPLEMENTED     | §1                                                                       |
| [x]    | Config G3 `mergeIntegrity`                                             | FULLY_IMPLEMENTED     | §1                                                                       |
| [x]    | Config G4 `provenance`                                                 | FULLY_IMPLEMENTED     | §1                                                                       |
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
| [x]    | Default encryption provider (common no-vendor case)                    | OUT_OF_SCOPE          | mirror of COMPLIANCE_MATRIX §8 — intentional non-goal; apps supply encryptionProvider |
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
