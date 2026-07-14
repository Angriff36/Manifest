# Full Manifest Adoption Roadmap — Capsule-V2 / capsule-pro / Manifest core

**Date:** 2026-07-14
**Audience:** AI agents implementing the items. Human owner: Angriff36.
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

## Part 1 — Manifest-core work (enablement; repo `C:\projects\manifest`)

Ordered by impact. Each item: problem → change → acceptance.

### M1. Release the Convex auth seam and adopt it *(projection code DONE, unreleased)*
- **State:** `authContextImport` option implemented on branch `feat/convex-auth-context-seam` (commit `e30a863`): routes identity through author-owned `getAuthContext(ctx)`, server-derives tenant on create (drops the client arg — 3.4.25's patch flow still exposes a required-but-ignored `tenantId: v.string()` arg), adds cross-tenant "not found" rejection on instance commands.
- **Do:** merge → bundle into the next minor (pre-write the CHANGELOG section) → `pnpm manifest:publish minor` → in Capsule-V2: `manifest:update`, pass `authContextImport: "./lib/authContext"` to the generate step, delete `scripts/patch-generated-auth.mjs` and the patch invocation in `manifest-regen.mjs`, regen, full gate.
- **Accept:** `grep -c "(ctx as any).auth" convex/*.ts` = 0 with no patch script in the pipe; drift gate green; `tenantId` absent from every `*_create` args block.

### M2. Lower `transition` declarations into generated Convex guards
- **Problem:** sources declare 280 `transition <prop> from X to [Y]` rules; `ir.json` carries 97 `transitions` arrays; `runtime-engine.ts:2817` enforces them; `src/manifest/projections/convex/*.ts` has **zero** references to `entity.transitions` → no FSM enforcement in generated mutations. Invalid state jumps the reference runtime blocks succeed in Convex. Reference semantics → projection parity bug.
- **Do:** in `generateMutation` (`functions.ts`), for each mutate action whose target property has transition rules on the entity: emit a pre-patch check that `doc.<prop>` is a legal source for the assigned value (assignments to non-literal values need the rule set rendered as a lookup table). Mirror runtime-engine semantics exactly (same denial message shape). Emit a diagnostic for transitions on properties the command never mutates (no-op, info only).
- **Accept:** new unit tests in `functions.test.ts` (legal transition passes, illegal throws, non-transition props untouched); conformance untouched; regen Capsule-V2 and verify e.g. an `inventory-transfer` mutation now contains the from-state check; full `pnpm test` green.

### M3. Enforce `private` / `encrypted` property modifiers in the Convex projection
- **Problem:** 32 `private encrypted property` declarations (bankRoutingNumber, taxId, licenseNumber…) land as plain `v.string()` in `schema.ts` and are returned wholesale by generated `get`/`list` queries. Neither modifier has any projection handling. Security/compliance gap.
- **Do (minimum, phase 1):** strip `private` fields from generated query returns (project the doc to non-private fields); emit a `CONVEX_ENCRYPTED_UNSUPPORTED` **warning** diagnostic for `encrypted` so the gap is loud instead of silent.
- **Do (phase 2, design first):** at-rest encryption seam analogous to `authContextImport` (author-owned `encrypt`/`decrypt` module invoked in generated mutations/queries for `encrypted` fields). Check `docs/spec/` for the modifier's guaranteed semantics BEFORE implementing — spec first if unspecified.
- **Accept (phase 1):** unit test — entity with `private` prop: `list`/`get` output omits it; diagnostics list the encrypted warning; capsule regen shows taxId/bankRoutingNumber no longer in query responses.

### M4. Computed-property strategy for the Convex projection
- **Problem:** 653 `computed` declarations have no runtime existence in Convex output (correctly never stored; but nothing materializes them), so apps re-derive by hand or lose them.
- **Do:** design decision needed — options: (a) emit a generated `convex/computed.ts` module of pure functions `computeX(doc, related?) `; (b) inline computed evaluation into `get`/`list` query returns (cost: extra reads for relation-dependent ones); (c) both, gated by an option. Aggregate computeds (count/sum across relations) need indexed reads — reuse the reaction aggregate-count rendering. Propose in a design doc first (this is a language-boundary surface: keep IR authority, projection-only change).
- **Accept:** per chosen design; minimum bar — scalar computeds (self-only expressions) available server-side without hand-written code, unresolved ones fail loud with a diagnostic.

### M5. Small generator correctness bugs (recorded in Capsule-V2 goal.md/AGENTS.md — reproduce first)
1. `WorkOrder.create` / `Schedule.create`: number-generation expressions with `substring()` are unresolved → fields silently omitted. Either add `substring` to the expression resolver or fail loud.
2. `Event_create` omits a required array default (`accessibilityOptions`) → callers must pass `[]` manually. Reproduce against `defaultToTs`/create-default fill; likely a default-materialization miss for array-typed required fields.
3. Enum-like types and `timestamp` degrade to `z.unknown()` in the zod/wiring projection.
- **Accept:** failing regression test per bug first, then fix; capsule regen diff shows the fields now present/typed.

### M6. Native drift-check ergonomics (nice-to-have)
- `manifest generate --check` style flag that generates to temp and byte-compares against the output dir with `compiledAt`/`irHash` normalization, exiting 1 with a file list — retires each consumer's hand-rolled compare (Capsule-V2's `--check` branch). Verify current CLI flags before building (`manifest generate --help`); do not duplicate an existing capability.

---

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
