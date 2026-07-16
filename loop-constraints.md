# Loop Constraints — Manifest

> The `loop-constraints` skill reads this file at the start of every run.
> Constraints here are **binding** — the agent MUST follow them.

## Push & Merge

- Don't push before telling me
- Never auto-merge to `main` without human approval
- Always create a draft PR first; let me review before marking ready

## Paths (high scrutiny — human review required)

- Never edit `.env`, `.env.*`, secrets, credentials, or publish tokens
- Never hand-edit IR / generated artifacts (`.ir.json`, projected outputs)
- Never weaken or delete `@RYAN_APPROVED` blocks in `AGENTS.md` without a new
  dated owner mark
- High-scrutiny (report or escalate; do not auto-edit in L1):
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
- Never refactor unrelated code — one fix per run
- Max 3 fix attempts per item; escalate after
- Enforce the attempt limit mechanically: log each try to `loop-ledger.json`
  and run `loop-context --check` before retrying (when `loop-guard` is enabled)

## Communication

- Always tell me what you're about to do before doing it
- Never close an issue or PR without my approval

## Budget

- If token spend hits 80% of daily cap, switch to report-only
- If `loop-pause-all` is active, exit immediately

---
<!-- Repo-specific rules above. Add more below in plain English. -->
