# TODO — verified open items

Created 2026-07-14 from a full reconciliation of the internal plan docs against
main @ v3.5.0 (commit 22a19e1). Every item below was verified open in source on
2026-07-14 — nothing here is copied from stale docs. Companion doc:
`docs/CONFIRMED-FEATURES.md` (what verifiably exists). AI-generated.

## Bugs

- [x] **WASM evaluator polarity aligned** — ~~`startsWith('severity')` heuristic~~
      fixed 2026-07-14: shared `constraint-polarity.ts` + `failWhen`/`severity`
      options on `WasmExpressionEvaluator.evaluateConstraint`; parity matrix tests.
- [x] **Entity `behaviors` loudly rejected** — ~~silently dropped~~ fixed 2026-07-14:
      `ir-compiler.ts` emits `ENTITY_BEHAVIOR_UNSUPPORTED` error (fixture 110).
      No IR field / no canonical semantics; use reactions or command actions.
- [ ] **M5 remainder (Convex/zod expression bugs)** — `Event_create` array-default
      bug and zod enum/timestamp mapping to `z.unknown()` were NOT fixed by the
      3.5.0 wave (not in commit 79093ec's file list).

## Native gaps (language / runtime)

- [ ] **`through` / many-to-many** — IR field exists, compiler rejects with
      "not supported in this version" (`ir-compiler.ts:1069`, fixture 102).
      Rejection is loud and tested; the capability itself is still missing.
- [ ] **Approval `onTimeout: 'escalate'`** — explicitly rejected
      (`ir-compiler.ts:884`, fixture 103). Only `cancel` semantics exist.
- [ ] **Referential actions inert at runtime** — `onDelete cascade` etc. compile
      into IR but `deleteInstance()` in `runtime-engine.ts` has zero cascade
      logic (DB projections only).
- [ ] **`optional` modifier never read by runtime**; **`alternateKeys` runtime-unused**;
      **entity-level constraint overrides never evaluated**; **`command.returns`
      projection-only** — see the reconciled matrix
      `docs/internal/plans/2026-07-06-ir-wiring-audit-matrix.md` (~50 rows still open).
- [ ] **Rate limiting is in-memory only** — `runtime-rate-limit.ts` Map-backed;
      no durable adapter, no projection exposure.
- [ ] **RedisEventBus never wired** — exists + tested but no RuntimeEngine wiring path.
- [ ] **`EventSourcedStore` doesn't exist** — IR accepts `eventSourced` store kind
      as passthrough only (zero grep hits for an implementation).
- [ ] **`flag()` has no static flags map** — only `RuntimeOptions.flagProvider`.
- [ ] **`softDelete` is not a language keyword** — only a prisma-store config option.
- [ ] **Materialized-views projection ignores `expression-to-sql.ts`** — view
      columns are raw-SQL passthrough.
- [ ] **Convex projection diagnostics-only surfaces** — approvals, masking,
      searchable, versionProperty, computed-cache, realtime, retry, rateLimit emit
      `CONVEX_UNSUPPORTED_*` diagnostics (good) but generate no Convex enforcement.
- [ ] **Config vNext G5/G2/G10** — `projections.enabled/defaults`,
      `validation.failOn`, drift gates: confirmed unbuilt (`src/manifest/config.ts:25`).
- [ ] **No `manifest db init`** — approval/audit/outbox/jobs/idempotency `.sql`
      schemas ship in the npm package but must be applied by hand.
- [ ] **Hono & Express projections have no `authProvider` option** (grep-verified
      in their `types.ts`) — auth wiring for those frameworks is hand-written glue.
- [ ] **`createUserResolver()` orphaned** — `packages/cli/src/utils/config.ts:723`
      is only called by `manifest scan` and its own tests; no generated route or
      runtime factory invokes it.

## Tooling / CI

- [ ] **Doctest gate skips TypeScript blocks** — `scripts/check-doc-snippets.mjs`
      only compiles ```manifest blocks, so TS API drift in docs is invisible.
      Direct consequence: the phantom entity-first `runCommand(Entity, cmd, args)`
      signature survives in `mintlify/language/commands.mdx:221`, `events.mdx:83`,
      `approvals.mdx:133` (real signature: `runCommand(commandName, input, options)`).
- [ ] **enforce-surface ORM coverage** — `--write-receiver` only renames the
      receiver; Drizzle (`db.insert(t).values()`) and Kysely (`.insertInto()`)
      call shapes and raw-SQL template-literal writes are still undetected.
- [ ] **`newguard.json` spec-of-truth lost** — the enforce-surface plan's contract
      file was never committed (checked `git log --all`); recreate it somewhere
      durable if that contract still matters.

## Docs

- [ ] **`mintlify/integration/projections.mdx:65-84`** still tells users to
      hand-call projection functions instead of `compile --all` / `generate --all` /
      `watch --all`.
- [ ] **Health projection undocumented** in both mintlify and docs/.
- [ ] **Replace `docs/FEATURE-LIST.md` with a registry-generated inventory** (M12) —
      currently a 2026-06-02 snapshot with a caveat header pointing at
      `docs/CONFIRMED-FEATURES.md`.
- [ ] **Appendix E language-design backlog** (recorded, never scheduled):
      `map<K,V>` two-param form, retry/rateLimit field-name ergonomics,
      reserved-word ergonomics, command-body policy clause, `.length` vs
      `length()`, no `timestamp` type.

## Distribution

- [x] **`getLanguageMetadata()` platform export** — shipped 2026-07-14 as
      `@angriff36/manifest/language-metadata` (derive-only from lexer/IR/runtime).
- [ ] **Publish or officially park the sub-packages** — `@manifest/mcp-server`,
      `@manifest/lsp-server`, `@manifest/stdlib` (all 0.1.0), VS Code extension
      `manifest-lang` 0.3.0: built and tested in-repo, published nowhere
      (npm 404 verified 2026-07-14; marketplace unverified).
- [x] **Projection capability descriptors API** — shipped 2026-07-14:
      `getProjectionCapabilities(name)` on the projections registry + optional
      `ProjectionTarget.capabilities`; Convex declares its matrix. Other
      projections still return `undefined` (undeclared) — declare incrementally.
- [x] **Stable Builder export contract (semver subset)** — declared 2026-07-14 in
      `docs/spec/sdk-stability.md` (stable subpaths; breaking = major + CHANGELOG entry).

## App-side (Capsule-V2 — different repo, tracked here because it's the critical path)

- [ ] **Adopt the v3.5.0 auth seam** — Capsule-V2 still pins `manifest@3.4.25`,
      still ships `scripts/patch-generated-auth.mjs`, zero `authContextImport`
      usage (verified 2026-07-14). Bump pin, set the option, delete the patch
      script. Then work roadmap items A2–A9.
