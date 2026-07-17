---
name: loop-triage
description: >
  Manifest language-repo triage tick. Scans CI, PRs, issues, recent commits on
  main. Writes prioritized findings into STATE.md. L1: report only — never
  edits code. Runs on the Claude Code cron / brain session (Anthropic default),
  NOT on GLM/MiniMax (those are L2 implementers via loop-dispatch.sh).
user_invocable: true
---

# Loop Triage — Manifest

Same role as capsule-pro-loops `loop-triage`: eyes for the brain tick.
Run `$loop-constraints` first if it has not run this tick.

## Inputs (gather each run)

- `STATE.md` — read FIRST
- `LOOP.md` — phase (L1 vs L2) and routing
- Recent commits: `git log --oneline -20 origin/main`
- CI: `gh run list --limit 10`
- Open PRs: `gh pr list --limit 15`
- Open issues: `gh issue list --limit 15` when enabled
- `loop-run-log.md` last entries

## Output — update STATE.md

### High Priority / Watch / Noise / Post-Run Critique
Same sections as the loop-engineering daily-triage skill. Merge with prior
items; prune resolved. Update `Last run` (UTC). Append JSON to `loop-run-log.md`
with `"source": "claude-cron-triage"`.

## Rules

- Be brutally concise. When in doubt: Watch or Noise.
- Signal only — no architectural invention.
- Respect `loop-constraints.md` high-scrutiny paths.
- **L1: do not edit any code.** Do not call `loop-dispatch.sh`.
- Do not switch Claude profiles to glm/minimax during triage.
