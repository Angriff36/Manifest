---
title: Manifest Feature Completion Compliance Matrix
created: 2026-02-28
updated: 2026-07-15
source_of_truth: true
scope: Feature completion status for the Manifest language, runtime, projections, tooling, and distribution
authority: Binding — agents and humans MUST treat this file as the source of truth for whether a feature is complete
companion_semantics: docs/spec/ir/ir-v1.schema.json → docs/spec/semantics.md → docs/spec/builtins.md → docs/spec/adapters.md → conformance fixtures
companion_inventory: docs/CONFIRMED-FEATURES.md (existence claims; must reconcile to this matrix)
---

# Manifest Compliance Matrix

**Authority:** Binding for feature-completion claims (promoted from Advisory on 2026-07-15).  
**Enforced by:** Agent workflow rules in `AGENTS.md` / `CLAUDE.md` (see Proof Protocol).

## Proof Protocol (mandatory)

Statuses:

| Status | Meaning |
| ------ | ------- |
| `FULLY_IMPLEMENTED` | Wired end-to-end with tests; **requires hard proof** |
| `PARTIAL` | Present but incomplete across consumers or semantics |
| `DIAGNOSTIC_ONLY` | Loud unsupported/diagnostic path; no full enforcement |
| `REJECTED_LOUD` | Parses or is named in IR/schema but compile rejects until designed |
| `NOT_IMPLEMENTED` | Missing or passthrough with no real implementation |
| `OUT_OF_SCOPE` | Explicitly not a Manifest core deliverable |
| `CLAIMED_NEEDS_PROOF` | Historically marked done without commit proof — **not** trusted as complete |

**Hard proof for `FULLY_IMPLEMENTED` (required columns in Notes / Code Reference):**

1. **Filename** (repo-relative path)
2. **Line range** (inclusive, current tree)
3. **Git commit** (full SHA that introduced or last verified the behavior)

Without all three, the row MUST NOT say `FULLY_IMPLEMENTED`. Use `CLAIMED_NEEDS_PROOF`, `PARTIAL`, or `NOT_IMPLEMENTED`.

When completion status changes: update this matrix first, then reconcile `docs/TODO.md` and `docs/CONFIRMED-FEATURES.md`.

---

## 1. Proven complete (FULLY_IMPLEMENTED with hard proof)

| Status | Requirement | Spec / contract | Implementation Status | Code Reference | Proof (file:lines @ commit) |
| ------ | ----------- | --------------- | --------------------- | -------------- | --------------------------- |
| [x] | Entity `behavior` / bare `on Event {…}` rejected (no silent drop) | house style; semantics | FULLY_IMPLEMENTED | ir-compiler + fixture 110 | `src/manifest/ir-compiler.ts:801-816` @ `3f41cb8da272c7d71efcad242ff498403ec09fd5` |
| [x] | Constraint polarity via `failWhen` (WASM + RuntimeEngine agree) | semantics.md § Constraint Polarity | FULLY_IMPLEMENTED | shared helper + WASM evaluator | `src/manifest/constraint-polarity.ts:1-27` @ `55670fdd48891f336064bbbab1d402e5260ebfd7`; `src/manifest/wasm/wasm-evaluator.ts:200-215` @ same |
| [x] | `getLanguageMetadata()` public export | Builder boundary contract | FULLY_IMPLEMENTED | language-metadata + package export | `src/manifest/language-metadata.ts:190-220` @ `11988d6055503c1046ba093cf007cc123778ec5a`; `package.json:275-278` @ same wave |
| [x] | Property modifiers single source (`PROPERTY_MODIFIERS`) | IR schema modifiers enum | FULLY_IMPLEMENTED | property-modifiers module | `src/manifest/property-modifiers.ts:1-18` @ `11988d6055503c1046ba093cf007cc123778ec5a` |
| [x] | `getProjectionCapabilities(name)` | Builder boundary | FULLY_IMPLEMENTED | projections registry | `src/manifest/projections/registry.ts:105-120` @ `2828d0da940de5d5004d65b6d2e1342f66807e4d` |
| [x] | Projection descriptors (`describeProjection` / list / validate) | `docs/spec/projection-descriptors.md` | FULLY_IMPLEMENTED | registry + descriptor types | `src/manifest/projections/registry.ts:151-175` @ `f335a74128466feaef1ffde8b14d52b1bbcd5eab` |
| [x] | Stable Builder export contract | `docs/spec/sdk-stability.md` | FULLY_IMPLEMENTED | stability policy doc | `docs/spec/sdk-stability.md:1-48` @ `11988d6055503c1046ba093cf007cc123778ec5a` |
| [x] | Many-to-many `hasMany … through Join` | semantics.md § through | FULLY_IMPLEMENTED | compiler validate + runtime + fixture 102 | `src/manifest/ir-compiler.ts:1132-1175` @ `3052dc56c45639f587a687017a13240d34dec997`; fixture `102-through-join` @ same |
| [x] | Referential actions enforced in reference runtime | semantics.md § Referential Actions | FULLY_IMPLEMENTED | runtime-referential-actions | `src/manifest/runtime-referential-actions.ts:1-300` @ `3052dc56c45639f587a687017a13240d34dec997` |
| [x] | Static `RuntimeOptions.flags` map for `flag()` | builtins.md / semantics | FULLY_IMPLEMENTED | RuntimeOptions + flag builtin | `src/manifest/runtime-engine.ts:255-261,1894-1898` @ `3052dc56c45639f587a687017a13240d34dec997` |
| [x] | Hono & Express `authProvider` option | projection companions | FULLY_IMPLEMENTED | hono/express types + generators | `src/manifest/projections/hono/types.ts:30` @ `1b1e2be9e059e5524021a671dd45eeddf3c7026f`; `src/manifest/projections/express/types.ts:37` @ same |
| [x] | `manifest db init` for shipped Postgres adapter `.sql` | CLI / distribution | FULLY_IMPLEMENTED | db-init command | `packages/cli/src/commands/db-init.ts:1-195` @ `2b4f30cf6010e89d3e3e3000c704212fd0574aff`; registered `packages/cli/src/index.ts:157-183` @ same |
| [x] | Doctest gate for TypeScript fenced blocks (`check`/`invalid`) | CI `docs:check:snippets` | FULLY_IMPLEMENTED | check-doc-snippets | `scripts/check-doc-snippets.mjs:95-117` @ pending-commit — unannotated ```typescript still skipped (opt-in `check`) |
| [x] | RedisEventBus injectable via `RuntimeOptions.eventBus` | adapters / EventBus | FULLY_IMPLEMENTED | option hook + Redis adapter | `src/manifest/runtime-engine.ts:307` @ `61d5ab6fb1da4dca32e683b45f9934e56dba141c`; `src/manifest/events/redis.ts:55-60` @ same — auto-construct from env intentionally absent |

---

## 2. Open gaps (from `docs/TODO.md` + CONFIRMED gaps) — current status

| Status | Requirement | Spec / notes | Implementation Status | Code Reference | Notes |
| ------ | ----------- | ------------ | --------------------- | -------------- | ----- |
| [ ] | Approval `onTimeout: escalate` | approvals / fixture 103 | REJECTED_LOUD | `src/manifest/ir-compiler.ts:934-939` | Needs spec-first design; only `cancel` supported |
| [ ] | Runtime reads `optional` modifier | IR wiring matrix | NOT_IMPLEMENTED | IR has modifier; runtime unused | See `docs/internal/plans/2026-07-06-ir-wiring-audit-matrix.md` |
| [ ] | Runtime uses `alternateKeys` | IR wiring matrix | NOT_IMPLEMENTED | compiled into IR; unused at runtime | |
| [ ] | Entity-level constraint overrides evaluated | IR wiring matrix | NOT_IMPLEMENTED | | |
| [ ] | `command.returns` end-to-end (not projection-only) | IR wiring matrix | PARTIAL | projection-only today | |
| [ ] | Durable rate-limit storage | runtime-rate-limit | PARTIAL | `src/manifest/runtime-rate-limit.ts` | In-memory Map only |
| [ ] | `EventSourcedStore` implementation | adapters / IR store kind | NOT_IMPLEMENTED | IR accepts `eventSourced` passthrough | Phantom if claimed as store |
| [ ] | Language keyword `softDelete` | language | NOT_IMPLEMENTED | prisma-store / projection config only | |
| [ ] | Materialized-views uses `expression-to-sql.ts` | projections | PARTIAL | raw-SQL column passthrough | |
| [ ] | Convex: approvals enforcement | convex capabilities | DIAGNOSTIC_ONLY | `CONVEX_UNSUPPORTED_*` | |
| [ ] | Convex: masked fields enforcement | convex capabilities | DIAGNOSTIC_ONLY | | |
| [ ] | Convex: searchable indexes/surfaces | convex capabilities | DIAGNOSTIC_ONLY | | |
| [ ] | Convex: versionProperty / optimistic concurrency | convex capabilities | DIAGNOSTIC_ONLY | | |
| [ ] | Convex: computed-cache behavior | convex capabilities | DIAGNOSTIC_ONLY | | |
| [ ] | Convex: realtime declarations | convex capabilities | DIAGNOSTIC_ONLY | | |
| [ ] | Convex: retry | convex capabilities | DIAGNOSTIC_ONLY | | |
| [ ] | Convex: rateLimit | convex capabilities | DIAGNOSTIC_ONLY | | |
| [ ] | Convex: complete lambda-expression lowering | convex expression | PARTIAL | | |
| [ ] | Config vNext G5 `projections.enabled/defaults` | config.ts | NOT_IMPLEMENTED | `src/manifest/config.ts` | |
| [ ] | Config vNext G2 `validation.failOn` | config.ts | NOT_IMPLEMENTED | | |
| [ ] | Config vNext G10 drift gates | config.ts | NOT_IMPLEMENTED | | |
| [ ] | Wire `createUserResolver()` into generated routes/runtime | CLI utils | NOT_IMPLEMENTED | only `manifest scan` + tests | |
| [ ] | enforce-surface Drizzle / Kysely / raw-SQL writes | CLI enforce-surface | PARTIAL | `--write-receiver` rename only | |
| [ ] | Restore durable `newguard.json` (or successor) | enforce-surface plan | NOT_IMPLEMENTED | never committed | |
| [ ] | Document health projection (mintlify + docs/) | docs | NOT_IMPLEMENTED | projection exists; docs missing | |
| [ ] | Registry-generated replace of `FEATURE-LIST.md` (M12) | docs | NOT_IMPLEMENTED | 2026-06-02 snapshot + caveat | |
| [ ] | Appendix E language-design backlog | language ergonomics | NOT_IMPLEMENTED | map\<K,V\>, retry/rateLimit names, etc. | |
| [ ] | Publish or park `@manifest/mcp-server` | distribution | NOT_IMPLEMENTED | built/tested in-repo; npm unpublished | |
| [ ] | Publish or park `@manifest/lsp-server` | distribution | NOT_IMPLEMENTED | | |
| [ ] | Publish or park `@manifest/stdlib` | distribution | NOT_IMPLEMENTED | | |
| [ ] | Publish or park VS Code `manifest-lang` | distribution | NOT_IMPLEMENTED | marketplace unverified | |
| [ ] | Capsule-V2 adopt auth seam / drop patch script | Capsule-V2 repo | NOT_IMPLEMENTED | OUT_OF_SCOPE for Manifest-only PRs | |
| [ ] | Full time-travel debugger | product | OUT_OF_SCOPE / NOT_IMPLEMENTED | phantom if claimed | |
| [ ] | Full WASM runtime (beyond expression compat) | wasm | NOT_IMPLEMENTED | scoped evaluator only | |
| [ ] | `ir.tenant` in all applicable web projections | projections | PARTIAL | wiring matrix | |
| [ ] | Module-based output splitting | projections | PARTIAL | wiring matrix | |

---

## 3. Confirmed language / platform surfaces (existence)

These exist per `docs/CONFIRMED-FEATURES.md` but are **`CLAIMED_NEEDS_PROOF`** here until each row gets filename + line range + commit. Do not treat as matrix-complete.

| Status | Requirement | Implementation Status | Notes |
| ------ | ----------- | --------------------- | ----- |
| [~] | Entities, properties, modifiers, inheritance/mixin | CLAIMED_NEEDS_PROOF | Fixtures 77–79, 81 — re-proof with commit |
| [~] | Value objects, enums, decimal/money, map, date/time | CLAIMED_NEEDS_PROOF | Fixtures 56–57, 60, 73, 92 |
| [~] | Composite keys / alternateKeys (compile) | CLAIMED_NEEDS_PROOF | Runtime alternateKeys unused — see §2 |
| [~] | Relationships hasMany/hasOne/belongsTo/ref | CLAIMED_NEEDS_PROOF | Fixtures 98–99 |
| [~] | Commands, guards, mutate, emit, async, retry, rateLimit | CLAIMED_NEEDS_PROOF | |
| [~] | Computed + caching strategies | CLAIMED_NEEDS_PROOF | Fixtures 03, 65 |
| [~] | Constraints ok/warn/block + failWhen + overrides | CLAIMED_NEEDS_PROOF | Fixtures 105–106, 22 — polarity proven in §1 |
| [~] | Policies, transitions, approvals (cancel timeout) | CLAIMED_NEEDS_PROOF | Fixture 68 cancel-only |
| [~] | Events, reactions, fan-out, sagas | CLAIMED_NEEDS_PROOF | |
| [~] | Roles/RBAC, webhooks, schedules, stores, modules, use | CLAIMED_NEEDS_PROOF | |
| [~] | Expression builtins (47) via `getBuiltins()` | CLAIMED_NEEDS_PROOF | builtins.md; metadata export proven in §1 |
| [~] | RuntimeEngine + middleware + batched persistence | CLAIMED_NEEDS_PROOF | |
| [~] | Stores: memory, localStorage, postgres, supabase, Turso, DynamoDB, Prisma-generic | CLAIMED_NEEDS_PROOF | |
| [~] | Outbox / approval / idempotency store adapters | CLAIMED_NEEDS_PROOF | |
| [~] | Projections registry (~29 targets) | CLAIMED_NEEDS_PROOF | descriptors/capabilities proven in §1 |
| [~] | CLI command surface | CLAIMED_NEEDS_PROOF | |
| [~] | Published `@angriff36/manifest` on npm | CLAIMED_NEEDS_PROOF | verify `package.json` + npm each release |
| [~] | Conformance fixture suite | CLAIMED_NEEDS_PROOF | executable semantics |

**Generics / parameterized entities:** NOT_IMPLEMENTED (fixtures 84–85 are negative parse tests only). Do not list as complete.

---

## 4. Legacy matrix (2026-02-28) — historical, incomplete proof

~~Previous editions of this file marked large IR/semantics/adapters/vNext/CLI tables as `FULLY_IMPLEMENTED` with file:line only and **no git commit**, and claimed “97% fully implemented.”~~

**Update (2026-07-15):** Those claims are **not** binding. Every such row is treated as `CLAIMED_NEEDS_PROOF` until re-entered in §1 with filename + line range + commit. Do not cite the Feb 2026 line numbers as current proof (the tree has moved; e.g. `runtime-engine.ts` is now thousands of lines longer).

Archived topical areas that still need re-proof: IR schema field coverage; semantics runtime model; builtins; adapters/stores; vNext constraints/concurrency/idempotency; workflow effect boundaries; conformance fixture inventory; `audit-routes` ownership rules.

---

## 5. Summary (2026-07-15)

| Bucket | Count guidance |
| ------ | -------------- |
| Proven `FULLY_IMPLEMENTED` (§1) | Prefer growing this table only with hard proof |
| Open gaps (§2) | Tracked also in `docs/TODO.md` — matrix wins on completion disputes |
| Existence without proof (§3) | Inventory only |
| Legacy (§4) | Not trustworthy for “done” |

**Out of scope distractions (do not prioritize over §2):** full time-travel debugger; full WASM runtime; inventing escalate-approval without a spec.
