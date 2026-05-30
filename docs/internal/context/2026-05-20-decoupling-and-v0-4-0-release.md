---
session: 2026-05-20-decoupling-and-v0-4-0-release
project: "@angriff36/manifest"
project_root: C:/projects/manifest
head_at_save: efd8203
parent_at_session_start: 74ae68e
status: v0.4.0 published; CI lint debt out-of-scope; runtime audit/outbox still deferred
tests_at_save: 822/822 passing
typecheck_at_save: clean
tags: [decoupling, application-agnostic, audit-governance, capsule-pro, release, v0.4.0, github-packages, pnpm, crlf-fix]
---

# Application-Agnostic Decoupling + v0.4.0 Release — Session Handoff

> Save format: markdown with YAML frontmatter. Storage tier: project-local
> (`docs/context/`). Drop-in resumable: a fresh agent can read this file and
> pick up the next deferred slice without re-deriving context.

## The Goal (verbatim, as set by the user)

Two-stage goal across this session:

1. *(decoupling)* "Validate and patch Manifest's enforcement layer so it is an application-agnostic governance system, then prove Capsule-Pro can integrate only through documented adapters/projections without Manifest depending on Capsule-Pro."

2. *(release)* "commit and push and update the npm package"

## Outcome

Both shipped. `@angriff36/manifest@0.4.0` is live on GitHub Packages. 8 atomic commits on `main` (`33442c2` → `efd8203`). All 822 tests pass on Windows local and Linux CI. The release workflow now exists and is green.

## Quick Resume Recipe

```bash
cd C:/projects/manifest
git log --oneline 74ae68e..HEAD   # 8 session commits
npm test -- --run                 # confirm 822 still green
cat fixtures/sample-app/Verify.md # how the non-Capsule sample audits clean
cat docs/integrations/capsule-pro/integration-proof.md  # the dependency map
```

## What Shipped (the v0.4.0 cut)

| Layer | Change |
|---|---|
| Spec (`docs/spec/**`) | Removed all "Constitution §N" and Capsule-Pro authority wording. Replaced with application-neutral phrasing (governance, governed entity, downstream application, command/bypass registry, route drift, etc.). |
| Runtime (`src/manifest/**`) | Stripped Capsule-Pro / Constitution references from `runtime-engine.ts`, `audit/audit-sink.ts`, `outbox/outbox-store.ts`, `registry/emit.ts`, and the test files. `RuntimeContext` typed shape unchanged. |
| Generator | `nextjs.dispatcher` now emits Next.js 15 App Router shape: `ctx.params: Promise<{entity:string;command:string}>` and `await ctx.params` before destructuring. Regression test added that fails if synchronous params shape regresses. |
| CLI | Renamed `audit-constitution` → `audit-governance` (canonical). Kept `audit-constitution` as a Commander alias that emits a stderr deprecation hint when invoked. Detector descriptions and finding codes all application-neutral. |
| Lexer | **Cross-platform fix**: normalizes `\r\n` and bare `\r` to `\n` in the constructor, so column tracking is platform-independent. Was a latent CRLF-vs-LF bug. 36 conformance fixtures regenerated. |
| Docs | Moved `docs/capsule-pro/` → `docs/integrations/capsule-pro/` via `git mv`. Added `docs/integrations/README.md` and `docs/integrations/capsule-pro/integration-proof.md` (one-directional dependency map). |
| Fixture | New `fixtures/sample-app/` (library/book domain) — a non-Capsule generic governed app that audits clean against all 5 detectors. Proof of application-agnosticism. |
| Release infra | New `.github/workflows/release.yml` — triggers on `v*` tag push, runs pnpm install on both root and `packages/cli/`, typechecks, tests, publishes to GitHub Packages via `secrets.GITHUB_TOKEN`. |
| Repo hygiene | Added `.gitattributes` pinning LF for all source/fixture/lockfile types. |
| Version | `package.json` 0.3.39 → 0.4.0 (minor — bundled four feature waves). |

## Commits (8, oldest first)

| Hash | Message | Notes |
|---|---|---|
| `33442c2` | Decouple governance enforcement from Capsule-Pro | The main decoupling commit (41 files, +982/-404) |
| `4911285` | chore(release): bump @angriff36/manifest to 0.4.0 | package.json bump |
| `8b51fc0` | ci(release): publish to GitHub Packages on v* tag push | First version of release.yml |
| `e9195ee` | fix(ci/release): use pnpm install + test (workspace deps) | Discovered root npm ci misses packages/cli/ deps |
| `352a456` | fix(ci/release): pin pnpm to v9 (matches lockfileVersion 9.0) | pnpm/action-setup requires explicit version |
| `b70d8e3` | fix(repo): add .gitattributes to pin LF (conformance column drift) | Without renormalizing committed content, only affects future checkouts |
| `b737ff6` | fix(lexer): normalize CRLF/CR to LF for platform-independent positions | The real cross-platform fix. Regenerated 36 conformance fixtures. |
| `efd8203` | fix(ci/release): also install packages/cli deps | packages/cli is its own pnpm project, not a workspace member |

## Tag State

- `v0.4.0` → today's release at `efd8203`. Published to GitHub Packages.
- `v0.3.8-tools` → the rescued tooling-enhancements snapshot at `f2f02bb` (formerly mis-tagged as `v0.4.0`, package.json there is 0.3.8). User explicitly asked to preserve this work after recognizing it from a zip in their Downloads folder.

## Repo Layout Gotchas (Worth Knowing Up Front)

1. **Two pnpm projects, not a workspace.** Root has `pnpm-lock.yaml`; `packages/cli/` has its own `pnpm-lock.yaml`. No `pnpm-workspace.yaml`, no `workspaces` field in root `package.json`. CI must install both, separately. Tests in root import from `packages/cli/src/**` and need its transitive deps (chalk, ora, glob, …) resolvable.

2. **`packageManager` field is absent from root `package.json`.** Any pnpm-action usage must pass `version` explicitly. We pinned to `9` to match the lockfile.

3. **Pre-existing lint debt (~237 errors).** Lives in `tools/`, `.opencode/`, `generated/`, `packages/cli/dist/`, `packages/cli/src/commands/{build,compile,…}.ts`. Predates this session (per the prior handoff). The `CI` workflow (`ci.yml`) still fails because it runs `eslint .` repo-wide. The `Release` workflow (`release.yml`) deliberately skips lint so it can run typecheck/test/publish. **Do not try to "fix CI" by adding lint exclusions or muting rules.** The right move is a separate cleanup pass on those directories.

4. **Working-tree carry-overs at session end (not staged, not from this session):** `CLAUDE.md`, `dist/**`, `packages/cli/dist/**`, `tsconfig.lib.json`, `vite.config.ts`, plus untracked `.automaker/`, `dist-app/`, `packages/cli/dist/commands/harness.*`. Same set carried in from the prior handoff. The `prepublishOnly` script regenerates dist/ on publish.

## Open Pre-Existing Issues

- `tools/manifest-ir-test-harnessv2/`, `tools/stress-simulator/`, `.opencode/`, `generated/` — lint debt (~237 errors). Out-of-scope cleanup candidate; not blocking.
- `nul` file at repo root from a prior `2>&1` mistake. Still untracked, still harmless.

## Application-Agnostic Invariants (Now Pinned by CI)

These should remain true on every future `audit-governance.sample-app.test.ts` run:

```bash
# Manifest core has no Capsule-Pro vocabulary except the deprecated CLI alias.
rg -n "[Cc]apsule.?[Pp]ro|[Cc]onstitution" src/manifest docs/spec \
  packages/cli/src --type-not md
#  → only matches `audit-constitution` (deprecated alias by name)

# Sample fixture's executable content has zero downstream-app vocabulary.
rg -n "Capsule|Constitution" fixtures/sample-app --type-not md
#  → empty
```

If a future PR introduces a Capsule-Pro reference outside `docs/integrations/`, the first grep should fail review.

## What's Still Deferred (Not in 0.4.0)

Carrying forward from Phase 6 stage 2 (per the prior handoff). All of these surfaces are contract-only today:

1. `src/manifest/audit/sinks/memory.ts` — `MemoryAuditSink` (in-memory for tests)
2. `src/manifest/outbox/stores/memory.ts` — `MemoryOutboxStore` (in-memory)
3. `src/manifest/stores.node.ts` extensions: `PostgresAuditSink`, `PostgresOutboxStore`
4. **Runtime emission lifecycle** in `RuntimeEngine.runCommand` — call `auditSink.emit(record)` for every outcome (`success | guard_denied | policy_denied | constraint_failed | concurrency_conflict | missing_tenant_context | error`)
5. **Outbox transactional integration** — enqueue `OutboxEntry` per `EmittedEvent` inside the same Prisma transaction as the persist action
6. Integration tests with the Memory sinks asserting emission on every outcome class
7. CI gate: extend `audit-governance` with an `outbox-required` detector (warn-by-default, error-by-strict)
8. Postgres / RLS adapter wiring (was never in scope of the original goal but is the next sensible piece)

## Resume Pointer

Next agent should:

1. Read this file plus `docs/plans/2026-05-20-capsule-pro-constitution-enforcement.md` § "Phase 6 — Durable Audit + Outbox Contracts (SKETCH — DEFERRED)".
2. Start with `MemoryAuditSink` test-driven and work outward (Phase 6 stage 2 item 1).
3. Do NOT regenerate the deprecated `audit-constitution` test surface — the alias coverage in `packages/cli/src/commands/audit-constitution.test.ts` already pins forward-compatibility.

Next operational task that needs to happen sometime (not part of audit/outbox):

- Drain the pre-existing lint debt in `tools/`, `.opencode/`, `generated/`, `packages/cli/dist/`. When that's done, the `CI` workflow goes green and the CI badge returns alongside Release. Do it as one focused pass, not interleaved with feature work.
