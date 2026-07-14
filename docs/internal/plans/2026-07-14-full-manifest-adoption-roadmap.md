# Full Manifest Adoption Roadmap — Capsule-V2 / capsule-pro / Manifest core

**Date:** 2026-07-14
**Audience:** AI agents implementing the items. Human owner: Angriff36.

**Reconciliation note (2026-07-14, later same day):** This roadmap's Part 1.5
addendum was committed at 05:09 (commit `dada8f4`). Twenty-seven minutes
later, commit `79093ec` ("preserve IR semantics - transitions, privacy,
computed, capability map") landed and closed **M2, M3 (phase 1), M4, M5
(substring/list\<T>), and M7** in one wave; it merged to `main` at `27b2159`
and released as **v3.5.0** at `22a19e1` (confirmed on npm: `npm view
@angriff36/manifest version` → `3.5.0`). **M1** (`authContextImport`, commit
`e30a863`) is also merged and released, not "unreleased" as M1 originally
stated. Each item below is corrected in place with the evidence. Two items
(M6, M11's `createManifestRuntime` sub-point) turn out to have been wrong
when originally written, not just overtaken by events — flagged accordingly.
**Basis:** three-way audit of `docs/FEATURE-LIST.md` (2026-06-02 snapshot, 116 features), `C:\projects\capsule-pro\manifest\source` (104 `.manifest` files, semantically identical to Capsule-V2's vendored copy), and `C:\projects\Capsule-V2` generated output (`@angriff36/manifest@3.4.25`, all-default Convex projection options). All counts below were verified against the repos on 2026-07-14; re-verify before relying on them.

Verified baseline: 213 entities → 211 tables, 1,065 mutations, 881 queries, 28 roles, 466 policies, ~2,000 guards, 782 constraints, 653 computed properties, 280 transition rules, 32 `private encrypted` properties, 10 reactions, 2 sagas, 0 schedules, 0 webhooks.

---

## Part 0 — Correct project setup (canonical pipeline)

### 0.1 Creating a new app via the builder (Manifest Studio, `C:\projects\builder`)

The builder is a Vite web app that compiles `.manifest` sources in-browser with `@angriff36/manifest` (`generateProjection`), assembles the selected projections into a project layout, and writes it to a local folder via the File System Access API (Chromium required; falls back to file download).

```bash
cd C:\projects\builder
npm install          # builder uses npm (package-lock.json)
npm run dev          # Vite dev server; open the printed localhost URL in Chrome
```

In the UI: import or author `.manifest` sources → select projections (note: projections in the same exclusive group conflict — only one backend family per assembly) → assemble/export to a target directory.

**The builder's output is a starting point, not the pipeline.** Immediately after export, set the produced app up per 0.2 — the builder does not install the regen loop, the drift gate, or the auth seam.

### 0.2 Setting up the produced app (the Capsule-V2 reference pattern)

Capsule-V2 is the proven layout. Reproduce these pieces in any Manifest-produced app:

1. **Vendor the sources** under `manifest/source/**/*.manifest` (single `_base.manifest` with shared mixins/roles + domain files). The `use "..."` paths are relative — keep them consistent with the directory depth.
2. **Pin the compiler exactly** (no caret) in devDependencies: `"@angriff36/manifest": "3.4.25"`.
3. **Add a regen script** (`scripts/manifest-regen.mjs` in Capsule-V2 is the template). It must:
   - run the native CLI, nothing else:
     ```bash
     node node_modules/@angriff36/manifest/packages/cli/dist/index.js \
       compile --merge -g "manifest/source/**/*.manifest" -o <tmp>/ir.json
     node node_modules/@angriff36/manifest/packages/cli/dist/index.js \
       generate -p convex -o <tmp>/convex <tmp>/ir.json
     ```
   - generate into a temp dir, then copy into `manifest/ir.json` + `convex/*.ts` (write mode) or byte-compare (check mode);
   - normalize `compiledAt`/`irHash` in `ir.json` before comparing (they change every compile);
   - **(until M1 ships)** apply `scripts/patch-generated-auth.mjs` between generate and copy/compare, and fail loudly if any patch rule found no match (generator shape changed). **(after M1)** replace the patch step with the `authContextImport` projection option and delete the patch script.
4. **Author-owned auth seam**: `convex/lib/authContext.ts` exporting `getAuthContext(ctx)` (verified identity → `{ id, role, tenantId }`, anonymous sentinels, NO env-var fallback), plus `convex/auth.config.ts` for the identity provider. This file is never generated; protect it from overwrites.
5. **package.json scripts** (Capsule-V2's, verbatim):
   ```json
   "manifest:regen":  "node scripts/manifest-regen.mjs",
   "manifest:drift":  "node scripts/manifest-regen.mjs --check",
   "manifest:update": "bun add -d @angriff36/manifest@latest && bun run manifest:regen"
   ```
6. **CI order** (Capsule-V2 `.github/workflows/ci.yml`): ownership check → `manifest:drift` → typecheck → lint → test → build. The ownership check (`scripts/check-manifest-ownership.mjs`) rejects generated-API imports outside the single seam module (`src/lib/api.ts`), app-defined Convex functions, and unsanctioned files in `convex/`.

### 0.3 The edit → regenerate loop (run after every `.manifest` source change)

```bash
# in the produced app (Capsule-V2):
bun run manifest:regen        # compile 104 sources → ir.json → convex/* (+ auth patch until M1)
bun run typecheck && bun run lint && bun run test && bun run build
bunx convex dev --once        # push functions/schema to the dev deployment
# commit the .manifest change AND the regenerated artifacts together
bun run manifest:drift        # what CI runs; must be green before push
```

Never hand-edit `convex/*.ts` (except `convex/lib/`) or `manifest/ir.json`. Compiler upgrades: `bun run manifest:update`, then the full gate.

---

## Part 0.5 — Config placement decisions (verified against schema at 3.4.25, 2026-07-14)

The config audit at `docs/internal/proposals/config/manifest-config-vnext.md` was written at v2.1.0; a dated accuracy addendum has been added to it. Current reality: `manifest.config.*` top-level keys are `src`/`output`/`prismaSchema`/`projections`/`env`/`hooks`/`plugins`/`naming`; `projections.*` accepts 28 projection keys including `convex`, each `{ output, options }` with `options` as `additionalProperties: true` **passed verbatim to the generator** — so new Convex projection options require NO config-schema change. None of the proposed **config-vNext** keys (`validation`, `mergeIntegrity`, `provenance`, `runtime`, `driftGates`, `projections.enabled/defaults`) exist yet. NOTE the name collision: "vNext" also names the **language/runtime feature set** (`docs/spec/manifest-vnext.md` — constraint outcomes, overrides, concurrency, state transitions, workflow metadata), which is FULLY IMPLEMENTED and conformance-covered. Only the config proposal's Part 2 keys are unbuilt.

Placement rules for the projection-repair work:

| Concern | Placement | Rationale |
|---|---|---|
| Auth seam module path (`authContextImport`) | `projections.convex.options` — **exists on branch** | Environment-specific seam, not semantics |
| Encryption seam module path (new, M3 phase 2 — e.g. `encryptionImport`) | `projections.convex.options` | Same pattern as authContextImport: author-owned module, projection calls it |
| Computed-property emission strategy (M4 — e.g. `computedProperties: 'helpers' \| 'inline'`) | `projections.convex.options` | Multiple legitimate codegen shapes; but NO `'off'`-that-silently-drops — absence of support emits diagnostics |
| Transition enforcement (M2) | **NOT config** — always on | Language semantics; a knob to disable = "make an invalid program succeed", a language violation |
| `private` field stripping in reads (M3 phase 1) | **NOT config** — always on | Security default; same argument |
| Constraints/guards/policies enforcement | **NOT config** (existing `policyMode: 'skip'` stays the only, documented, dev-build escape) | Already fail-closed |
| Capability-map diagnostics (M7 below) | **NOT config** — always emitted | Visibility must not be optional |
| CI failure policy on diagnostics (fail build on warning-level loss) | Future `validation.failOn` (config-vNext G2, unimplemented) | Until then: consumers' regen scripts must fail on error-severity diagnostics themselves |
| Surface/output selection | `projections.convex.output` + `manifest generate --all` — exists today | — |

## Part 1 — Manifest-core work (enablement; repo `C:\projects\manifest`)

Ordered by impact. Each item: problem → change → acceptance.

### M1. ~~Release the Convex auth seam and adopt it *(projection code DONE, unreleased)*~~
**Update (2026-07-14):** Merged and **released as v3.5.0** (commit `e30a863` →
merge `27b2159` → release `22a19e1`; confirmed on npm). `authContextImport` is
now listed as a Supported surface in `src/manifest/projections/convex/CAPABILITIES.md`.
Manifest-core work is done. **Downstream adoption is NOT done**: Capsule-V2
(`C:\projects\Capsule-V2\package.json`) is still pinned to `3.4.25`,
`scripts/patch-generated-auth.mjs` is still present, and no `authContextImport`
usage exists in `scripts/manifest-regen.mjs` — the "Do" steps below (adopt in
Capsule-V2) remain outstanding as app-side work (tracked as A1 in Part 2).
- **State:** `authContextImport` option implemented on branch `feat/convex-auth-context-seam` (commit `e30a863`): routes identity through author-owned `getAuthContext(ctx)`, server-derives tenant on create (drops the client arg — 3.4.25's patch flow still exposes a required-but-ignored `tenantId: v.string()` arg), adds cross-tenant "not found" rejection on instance commands.
- **Do:** merge → bundle into the next minor (pre-write the CHANGELOG section) → `pnpm manifest:publish minor` → in Capsule-V2: `manifest:update`, pass `authContextImport: "./lib/authContext"` to the generate step, delete `scripts/patch-generated-auth.mjs` and the patch invocation in `manifest-regen.mjs`, regen, full gate.
- **Accept:** `grep -c "(ctx as any).auth" convex/*.ts` = 0 with no patch script in the pipe; drift gate green; `tenantId` absent from every `*_create` args block.

### M2. ~~Lower `transition` declarations into generated Convex guards~~
**Update (2026-07-14):** Shipped in commit `79093ec` (released v3.5.0). New
`src/manifest/projections/convex/transitions.ts` lowers `entity.transitions`
to pre-patch legality checks with exact `runtime-engine.ts` message parity
(unknown from-states pass through, same denial shape). Listed as **Supported**
in `CAPABILITIES.md` ("Transitions | mutations | Pre-patch legality; always
on"). Not yet regenerated into Capsule-V2 (still on the `3.4.25` pin — see M1
update above), so the fix exists but the downstream app hasn't picked it up.
- **Problem:** sources declare 280 `transition <prop> from X to [Y]` rules; `ir.json` carries 97 `transitions` arrays; `runtime-engine.ts:2817` enforces them; `src/manifest/projections/convex/*.ts` has **zero** references to `entity.transitions` → no FSM enforcement in generated mutations. Invalid state jumps the reference runtime blocks succeed in Convex. Reference semantics → projection parity bug.
- **Do:** in `generateMutation` (`functions.ts`), for each mutate action whose target property has transition rules on the entity: emit a pre-patch check that `doc.<prop>` is a legal source for the assigned value (assignments to non-literal values need the rule set rendered as a lookup table). Mirror runtime-engine semantics exactly (same denial message shape). Emit a diagnostic for transitions on properties the command never mutates (no-op, info only).
- **Accept:** new unit tests in `functions.test.ts` (legal transition passes, illegal throws, non-transition props untouched); conformance untouched; regen Capsule-V2 and verify e.g. an `inventory-transfer` mutation now contains the from-state check; full `pnpm test` green.

### M3. ~~Enforce `private` / `encrypted` property modifiers in the Convex projection~~
**Update (2026-07-14):** Phase 1 shipped in commit `79093ec` (released v3.5.0)
— new `src/manifest/projections/convex/privacy.ts` strips `private` fields
from **both** query returns and mutation returns (create + instance
mutations; the roadmap's own accept criterion only asked for query
stripping, and the commit message notes a review fix specifically for the
mutation-return leak). `CONVEX_ENCRYPTED_UNSUPPORTED` diagnostic emitted per
encrypted field. Listed as **Supported** ("Private properties (read strip) |
queries | Always on") with **Partial** for encrypted ("Stored/returned as
plain strings | `CONVEX_ENCRYPTED_UNSUPPORTED` (phase 1; phase 2 needs
spec)"). **Phase 2 (at-rest encryption seam) is still not done** — matches
the roadmap's own phasing, not a gap.
- **Problem:** 32 `private encrypted property` declarations (bankRoutingNumber, taxId, licenseNumber…) land as plain `v.string()` in `schema.ts` and are returned wholesale by generated `get`/`list` queries. Neither modifier has any projection handling. Security/compliance gap.
- **Do (minimum, phase 1):** strip `private` fields from generated query returns (project the doc to non-private fields); emit a `CONVEX_ENCRYPTED_UNSUPPORTED` **warning** diagnostic for `encrypted` so the gap is loud instead of silent.
- **Do (phase 2, design first):** at-rest encryption seam analogous to `authContextImport` (author-owned `encrypt`/`decrypt` module invoked in generated mutations/queries for `encrypted` fields). Check `docs/spec/` for the modifier's guaranteed semantics BEFORE implementing — spec first if unspecified.
- **Accept (phase 1):** unit test — entity with `private` prop: `list`/`get` output omits it; diagnostics list the encrypted warning; capsule regen shows taxId/bankRoutingNumber no longer in query responses.

### M4. ~~Computed-property strategy for the Convex projection~~
**Update (2026-07-14):** Shipped in commit `79093ec` (released v3.5.0),
design doc at `docs/internal/proposals/2026-07-14-convex-computed-properties.md`.
Went with option (c): a `computedProperties: 'helpers' | 'inline'` projection
option (`src/manifest/projections/convex/computed.ts`, `options.ts`). Listed
as **Supported** ("Computed (self-only) | computed (+ optional inline)").
Relation-dependent aggregate computeds remain **Partial** — "Unresolved
unless self-only / count via reactions" with a `CONVEX_UNRESOLVED_COMPUTED`
diagnostic, matching the roadmap's own "minimum bar" (scalar computeds
solved, unresolved ones fail loud, not silently dropped).
- **Problem:** 653 `computed` declarations have no runtime existence in Convex output (correctly never stored; but nothing materializes them), so apps re-derive by hand or lose them.
- **Do:** design decision needed — options: (a) emit a generated `convex/computed.ts` module of pure functions `computeX(doc, related?) `; (b) inline computed evaluation into `get`/`list` query returns (cost: extra reads for relation-dependent ones); (c) both, gated by an option. Aggregate computeds (count/sum across relations) need indexed reads — reuse the reaction aggregate-count rendering. Propose in a design doc first (this is a language-boundary surface: keep IR authority, projection-only change).
- **Accept:** per chosen design; minimum bar — scalar computeds (self-only expressions) available server-side without hand-written code, unresolved ones fail loud with a diagnostic.

### M5. Small generator correctness bugs (recorded in Capsule-V2 goal.md/AGENTS.md — reproduce first)
**Update (2026-07-14):** Item 1 (`substring()` unresolved in expressions) is
**fixed** — commit `79093ec`'s commit message explicitly lists "expression
resolver: substring/string builtins; list\<T> = array\<T>" and
`src/manifest/projections/convex/expression.ts`/`expression.test.ts` changed
in that commit. Items 2 (`Event_create` array default) and 3 (enum/timestamp
→ `z.unknown()` in zod projection) are **not addressed by this wave** — they
weren't in the commit's file list (no `zod/generator.ts` change) and weren't
independently verified in this pass; still open.
1. `WorkOrder.create` / `Schedule.create`: number-generation expressions with `substring()` are unresolved → fields silently omitted. Either add `substring` to the expression resolver or fail loud.
2. `Event_create` omits a required array default (`accessibilityOptions`) → callers must pass `[]` manually. Reproduce against `defaultToTs`/create-default fill; likely a default-materialization miss for array-typed required fields.
3. Enum-like types and `timestamp` degrade to `z.unknown()` in the zod/wiring projection.
- **Accept:** failing regression test per bug first, then fix; capsule regen diff shows the fields now present/typed.

### M6. ~~Native drift-check ergonomics (nice-to-have)~~
**Update (2026-07-14):** This item was **already wrong when written** — the
roadmap's own instruction ("verify current CLI flags before building") wasn't
followed. `manifest generate --check` already existed before this doc was
authored (`packages/cli/src/index.ts:214-217`: "Compare generated code to
committed files and exit non-zero on drift (writes nothing)"; the flag was
added in commit `a1e8a51`, unrelated to and predating today's work). It's
also wired for `generate --all --check` via `generateAllFromConfig`
(`packages/cli/src/commands/generate.ts:822`), which throws `DriftError` and
exits 1 with the drifted projection names. No new work needed; Capsule-V2's
hand-rolled `--check` branch in `manifest-regen.mjs` can be retired in favor
of the native flag whenever that script is next touched.
- `manifest generate --check` style flag that generates to temp and byte-compares against the output dir with `compiledAt`/`irHash` normalization, exiting 1 with a file list — retires each consumer's hand-rolled compare (Capsule-V2's `--check` branch). Verify current CLI flags before building (`manifest generate --help`); do not duplicate an existing capability.

### M7. ~~Capability map — eliminate "parsed but ignored"~~
**Update (2026-07-14):** Shipped in commit `79093ec` (released v3.5.0).
`src/manifest/projections/convex/CAPABILITIES.md` (dated 2026-07-14) plus
`capabilities.ts` (165 lines) implement exactly this design: Supported /
Partial / Unsupported tables, with `CONVEX_UNSUPPORTED_<FEATURE>` diagnostics
for approvals, `realtime`, `versionProperty`, `masked`, `searchable`,
computed `cache`, `retry`, `rateLimit`, `async` commands, and action kinds
`effect`/`publish`/`persist`. Referenced from `README.md`. Accept criteria
met.
- **Problem:** the Convex projection consumes a subset of IR fields; everything else vanishes silently (transitions/computed/private/encrypted being the proven cases). Nothing tells a consumer which declarations survived.
- **Do:** audit every IR field (`src/manifest/ir.ts`) against the Convex generators; produce a checked-in capability matrix (`src/manifest/projections/convex/CAPABILITIES.md` or structured TS the README embeds): **Supported** (generated + tested) / **Partial** (exact limitation stated) / **Unsupported** (generation emits a diagnostic naming the dropped declaration). Add a projection-level pass that walks the IR for declarations in the Unsupported set and emits `CONVEX_UNSUPPORTED_<FEATURE>` warnings — a program using a dropped feature can never regenerate silently again.
- **Accept:** generating capsule's IR lists every dropped declaration in diagnostics; matrix file exists and is referenced from the projection README; test asserting an entity with an unsupported construct yields the diagnostic.

---

## Part 1.5 — Manifest-core gaps beyond the projection (verified 2026-07-14 unless marked VERIFY)

### M8. Approval timeout escalation is a declared-but-unsupported language feature
**Update (2026-07-14):** Re-verified, still open as a capability, but the
framing needs correction — this is **not silent grammar debt**. It's already
formally documented and conformance-tested as intentionally unsupported:
`docs/spec/semantics.md:742-746` has a dedicated "Unsupported: approval
`onTimeout: "escalate"`" section naming the diagnostic
(`APPROVAL_ONTIMEOUT_ESCALATE_UNSUPPORTED`), the IR schema narrows
`onTimeout` to `"cancel"` only, and conformance fixture
`103-approval-escalate-unsupported.manifest` is the canonical test case. This
is the same "formally closed as OUT_OF_SCOPE" pattern the sibling
`UNIMPLEMENTED_FEATURES_PLAN.md` used for the workflow replay engine — a
deliberate, spec'd non-feature, not an oversight. If escalation semantics are
ever wanted, spec-first as originally proposed; otherwise no action needed.
- `parser.ts` accepts `onTimeout: 'escalate'` on approvals; `ir-compiler.ts:884–889` emits a hard "not supported in this version" diagnostic. Either implement escalation semantics (spec first: docs/spec/, then conformance fixtures, then runtime) or remove it from the grammar — a keyword that always errors is grammar debt.

### M9. `through` (M2M) relationships — complete the chain or fail loud (VERIFY depth)
**Update (2026-07-14):** Verified — the chain already fails loud at the
earliest possible point, so the "or fail loud" half of this item is done.
`ir-compiler.ts:1059-1069` rejects `through` with a compile-time error
diagnostic ("uses 'through' (many-to-many via join entity), which is not
supported in this version. Model the join entity ... explicitly with two
belongsTo relationships") before it ever reaches IR, runtime, or projections
— there's no silent acceptance. The M2M feature itself is still not
implemented; that remains open if wanted (spec-first, Danger Zone per this
doc's own rules), but there is no dangling/silent gap to trace.
- `lexer.ts:36` + `parser.ts:921–975` parse `through`; the 2026-07-06 IR wiring audit recorded through/M2M as deferred. Trace parse → IR → runtime → projections; wherever the chain breaks, either finish it (spec-first, Danger Zone) or emit a compile-time diagnostic at the break point. No silent acceptance of a construct that does nothing.

### M10. ~~`retry` / `rateLimit` enforcement depth (VERIFY)~~
**Update (2026-07-14):** Verified — both are enforced in the reference
runtime (`src/manifest/runtime-engine.ts`: `RateLimiter` class + `rateLimiter`
field at line 963, `policyHasRateLimit`/`rateLimitDenial` handling at
2262-2266/3373/3996; `executeWithRetry` invoked at 3058-3061 and 3582-3585
for command `retry?`). The Convex capability map (M7, now shipped) already
classifies both honestly as Unsupported-with-diagnostic
(`CONVEX_UNSUPPORTED_RETRY`, `CONVEX_UNSUPPORTED_RATE_LIMIT` in
`CAPABILITIES.md`). Accept criteria met — closed, no gap.
- `IRRetry` exists (`ir.ts:262+`, command `retry?`); rate-limit has conformance fixtures (74/75). Verify the reference runtime actually enforces both (retry re-execution, limiter state) and that the capability map (M7) classifies their projection status honestly. Close or loudly-diagnose any gap found.

### M11. CLI + config leverage items
- **M6** (native `generate --check` drift gate) — see Part 1.
- **Config G5** (`projections.enabled` + `defaults`) — low-risk, unblocks multi-projection regen pipelines (Part 3/A9) without per-projection repetition.
- **Config G2/G10** (`validation.failOn`, `driftGates`/`manifest ci-gate`) — makes "CI fails on semantic-loss diagnostics" first-class instead of per-consumer script logic. Danger-Zone-adjacent: policy must never weaken language semantics (a block is always a block).
- **createManifestRuntime emission** (docs-audit native-gap #1, VERIFY still open) — the embedded-runtime import path that `nextjs` inline dispatcher mode assumes.

### M13. Platform-SDK gaps for Builder (see the binding contract)
- The Builder app (Manifest Studio) is the official Manifest control plane; the ownership contract is `docs/internal/contracts/manifest-builder-boundary.md`. Manifest-side prerequisites before ANY Builder feature growth: (a) `language-metadata` export (keywords/builtins/modifiers as data, sourced from the lexer's own tables — Builder currently hardcodes them at `builder/src/lib/completions.ts:12`); (b) structured `getProjectionCapabilities()` (capability matrices as API, not markdown); (c) a declared stable-for-Builder export subset with semver discipline.

### M12. FEATURE-LIST.md truth cleanup
- `docs/FEATURE-LIST.md` is a 6,399-line 2026-06-02 automaker snapshot with known phantom entries (16/116 per the 2026-07-01 audit). Replace with (or gate behind) a *verified* feature inventory — ideally generated from the registries the code already has (projection registry, CLI command table, conformance fixture list) so it cannot rot. Until then, add a header warning pointing at the verified inventory.

## Part 2 — App-side adoption (Capsule-V2 first; capsule-pro sources are the shared upstream)

### A1. Adopt the auth seam (depends on M1) — covered in M1 "Do".

### A2. Replace hand-rolled timer/expiry logic with `schedule` declarations
- Sources declare **zero** schedules; `convex/crons.ts` generates empty. Candidates (search sources for status-expiry/overdue patterns): dunning escalation (collections), certification expiry, cycle-count cadences, prep-list generation. One pilot: pick ONE (e.g. overdue-invoice flagging), declare `schedule` on the command, regen, verify `crons.ts` emits `crons.cron(...)` wiring to the mutation. NOTE: generated mutations run under system identity — `getAuthContext` must return a system context for scheduler calls (already required by the seam contract).

### A3. Inbound integrations as `webhook` declarations
- Sources declare zero webhooks; `convex/http.ts` generates empty. Candidates: sms-automation, email-workflow, payment-provider callbacks. Caveat (per Convex projection README): generated `httpAction`s do NOT verify `IRWebhook.signature` or enforce `idempotencyHeader` — either fix that in Manifest first (add to Part 1 if pursued) or front with a verifying edge.

### A4. Grow reactions / fan-out / aggregates where V2 slices need cascades
- Currently 10 reactions, 1 fanOut, 2 `count()` aggregates. As PARITY.md slices land (Kitchen production, Inventory, Procurement), express cross-entity cascades as `on Event run Command` (+ `fanOut` for 1:N) instead of UI-side chaining. The generated mutations already render reactions via `ctx.runMutation` with governance intact.

### A5. Approvals: evaluate native constructs before building approval UI
- Approvals today are hand-rolled status strings + transitions. Runtime has `approvalStore`/`approveStage` (shipped v2.1.0-era; **Convex projection support unverified — check before committing**). If the projection doesn't render approval stages, either stay with the FSM pattern (it works, and M2 will enforce it) or add projection support upstream first. Do not half-adopt.

### A6. Delete dead Studio artifacts in Capsule-V2
- `src/generated/manifest-wiring-bindings.ts`, `src/generated/manifest-wiring-contract.json`, `src/hooks/manifest-hooks.ts`, `src/providers/manifest-query-provider.tsx` — react-query/product-wiring projection output from the original download; mounted nowhere; not regenerated by `manifest:regen`. Delete (git preserves them) unless a REST dispatcher is actually planned.

### A7. Projection adoption decisions (deliberate, not drift)
- V2 already depends on `zod` and `@tanstack/react-query` but hand-writes both layers. If the hand-written `src/lib/api.ts` seam + Biome/tsc suffice, fine — record the decision. Otherwise wire the zod projection (arg validation at the UI boundary) and/or TanStack hooks projection INTO the regen script so they're governed by the same drift gate. Never re-import them as one-off Studio downloads (that's how A6's corpses were born).

### A8. Keep capsule-pro and Capsule-V2 sources from diverging
- Today they are semantically identical (only `use`-path prefixes differ). V2 is the fork that will evolve (lowercase roles noted in its regen header). Decide the source of truth (likely: V2 forward; capsule-pro frozen as intent reference per goal.md) and record it in both repos' AGENTS.md so agents stop treating capsule-pro's copy as live.

---

## Part 3 — The interconnection gap (single-consumer IR)

Capsule-V2 consumes exactly **two** features of the whole platform: multi-module compile (`compile --merge` with `use`/mixins) and the Convex projection. Everything else that makes the IR a *source of truth across surfaces* is unwired. From the same `manifest/ir.json`, without touching the sources, the toolchain can emit (verify each against the current CLI before wiring — some FEATURE-LIST entries are phantom per the 2026-07-01 audit):

- **Boundary contracts:** Zod schemas (arg/form validation in the UI), OpenAPI 3.1 (external API contract), JSON Schema.
- **Frontend layer:** TanStack Query hooks (V2 already deps @tanstack/react-query and hand-writes this layer).
- **Human/agent views:** Mermaid ER/entity diagrams (`manifest diagram`), generated API docs, policy matrix, llms.txt context export, MCP server for IR introspection.
- **Safety tooling:** IR diff + breaking-change detector between revisions, changelog generation, command/guard coverage reporter, seed-data generator, mock server.
- **Not applicable to a Convex-backed app** (record the decision, don't cargo-cult): reference runtime engine, store adapters (Redis/DynamoDB/Turso/event-sourcing), Express/Hono/Remix/SvelteKit/Prisma-family projections.

**A9. Wire the interconnection surfaces into `manifest-regen.mjs`** — the "one edit updates every surface" property only exists if every consumed artifact is generated in the SAME regen script and covered by the SAME drift gate. Pilot order: zod (validation at the UI boundary) → TanStack hooks (replace hand-written `src/lib/api.ts` seam incrementally) → `manifest diagram` + docs (repo artifacts for humans/agents) → IR-diff/breaking-change check as a CI step comparing the committed `ir.json` against the previous commit's.

**Ownership note (2026-07-14):** the Builder app (Manifest Studio) is the official control plane for these surfaces — binding contract at `docs/internal/contracts/manifest-builder-boundary.md`; Manifest-side prerequisites are M13.

**Why adoption stalled (evidence, not blame):** the language docs are NOT the gap — `mintlify/language/` has dedicated pages for computed-properties, reactions, events, approvals, async-commands, workflows (74 .mdx pages total). Causes: (1) the capsule sources were translated from an existing codebase, largely before the orchestration constructs existed (fan-out and aggregate-count were added to Manifest in June 2026 specifically to retire capsule middleware); (2) the Convex projection silently drops computed/transitions/encrypted (M2–M4), so app agents learned they couldn't rely on declared features and hand-rolled instead — fixing M2–M4 is what makes declaring features trustworthy again; (3) only one IR consumer was ever wired into the pipeline (this Part).

## Sequencing

1. **M1 → A1** (auth seam release + patch-script retirement) — unblocks everything, code already written.
2. **M2** (transitions) — 280 declared rules become enforced; biggest correctness win per line of work.
3. **M3 phase 1** (private stripping + encrypted warning) — security exposure, small diff.
4. **M5** (small generator bugs) — cheap, removes documented workarounds.
5. **A6** (delete dead artifacts) — trivial hygiene, any time.
6. **M4** (computed strategy) — design doc first.
7. **A2/A3/A4/A5/A7** — per-slice adoption as PARITY.md work proceeds.
8. **M6** — opportunistic.

**Standing rules for implementing agents:** IR is authority; spec → tests → implementation for any semantics change; conformance fixtures are executable semantics; `pnpm test` / `pnpm run typecheck` / `pnpm run lint` green before any "done"; releases only via `pnpm manifest:publish` (cut-release workflow), never by hand; verify every count/claim in this doc against the repos before acting on it.
