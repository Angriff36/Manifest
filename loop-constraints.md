# Loop Constraints — Manifest

> The `loop-constraints` skill reads this file at the start of every run.
> Constraints here are **binding** — the agent MUST follow them.

## Push & Merge

- Don't push before telling me
- Never auto-merge to `main` without human approval
- Always create a draft PR first; let me review before marking ready

## Paths (hard rules + high scrutiny)

- Never edit or commit `.env`, `.env.*`, secrets, credentials, or publish
  tokens (loop branches get pushed; a leaked secret is unrecallable).
- Never hand-edit IR / generated artifacts (`.ir.json`, projected outputs) —
  wrong by construction, the next build erases them.
- Never weaken or delete `@RYAN_APPROVED` blocks in `AGENTS.md` without a new
  dated owner mark
- High-scrutiny paths are ATTEMPTABLE via draft PR, not skipped (2026-07-21:
  the PR gate is the safety boundary). The PR title must be prefixed
  "HIGH-SCRUTINY:" and the body must justify the change when touching:
  - `docs/spec/**`
  - `docs/internal/COMPLIANCE_MATRIX.md`
  - `docs/internal/contracts/**`
  - `src/manifest/lexer.ts`, `src/manifest/parser.ts`, `src/manifest/runtime-engine.ts`
  - `src/manifest/conformance/**`

## Compliance & meaning

- Never mark a Compliance Matrix row `FULLY_IMPLEMENTED` without hard proof:
  filename, inclusive line range, and git commit SHA
- Never classify Builder-owned work as a missing Manifest implementation
- Spec → tests → code. Do not change semantics to make UI or agents “nicer”
- Do not weaken determinism or house-style rules

## Code (L2+ only — L1 is report-only)

- Always run `pnpm test` and `pnpm typecheck` before proposing a fix
- Never disable tests to make CI green
- Never refactor unrelated code — one logical fix per worktree/PR
  (reviewability), but as many worktrees/PRs per tick as the queue and
  budget allow
- Max 3 fix attempts per item; escalate after
- Enforce the attempt limit mechanically: log each try to `loop-ledger.json`
  and run `loop-context --check` before retrying (when `loop-guard` is enabled)

## Communication

- Always tell me what you're about to do before doing it
- Never close an issue or PR without my approval

## Budget

- If token spend hits 80% of daily cap, switch to report-only
- If `loop-pause-all` is active, exit immediately

## L2 standing — queue-drain mode (human decisions 2026-07-19 + 2026-07-21)

- Draft-PR fix powers are permanent. "Tell me first" is satisfied by logging
  intent + result in STATE.md before/after each action.
- **The PR gate is the safety boundary** — worktree isolation + tests + Codex
  review + draft PR + human merge. Do NOT pre-filter items into safe/unsafe.
- **Drain the queue every tick**: one fresh worktree + one draft PR per
  logical fix, next item immediately after, until no actionable items remain
  or the budget gate trips. NO per-tick fix cap (one-fix-per-iteration is for
  back-to-back loops, not scheduled ticks — human decision 2026-07-21).
- Check `loop-ledger.json` first — 3 failed attempts on an item means
  escalate, not retry.
- All code edits happen in a fresh worktree:
  `git worktree add .loop-worktrees/<run-id> -b loop/<run-id> main`.
  The main checkout stays untouched (state files excepted).
- Verify inside the worktree (`pnpm install --frozen-lockfile` if needed, then
  `pnpm typecheck` + the focused check), then Codex gate:
  `git diff main | codex exec -s read-only "<review for reject reasons>"`.
  REJECT → log failure to ledger + STATE.md, move to the NEXT item.
- On APPROVE: commit in the worktree, `git push origin loop/<run-id>`,
  `gh pr create --draft` with verification evidence in the body.
- NEVER: push main, merge, mark PRs ready, close PRs.

## Formatting policy (durable; the 2026-07-12 red-CI saga itself is RESOLVED — PR #52 merged 2026-07-19)

1. Resolve any conflict markers in the tree FIRST — never format debris.
2. Formatting IS a normal CI gate; keep it. Prettier must never touch
   generated artifacts — `.prettierignore` already excludes dist/,
   conformance fixtures, and IR schemas; extend it if a generated path is
   missing rather than reformatting it.
3. **Prettier never formats docs** (human policy 2026-07-19): `*.md` and
   `*.mdx` are in `.prettierignore`. Prettier normalizes CODE into one
   style; doc files keep their author's formatting.
4. A format commit must be verifiably pure: `git diff` review shows
   formatting only; `pnpm exec prettier --check .` green afterward.

---
<!-- Repo-specific rules above. Add more below in plain English. -->
