---
name: loop-triage
description: >
  Manifest language-repo triage tick. Scans CI, PRs, issues, recent commits on
  main. Writes prioritized findings into STATE.md. L1: report only — never
  edits code. Invoked by GLM/MiniMax workhorses via scripts/loop-triage.sh.
user_invocable: true
---

# Loop Triage — Manifest

You are the triage pass of the Manifest loop (see `LOOP.md`). Run
`$loop-constraints` first if it has not run this tick.

## Inputs (gather each run)

- `STATE.md` — read FIRST
- `LOOP.md` — phase (L1 vs L2) and routing
- Recent commits: `git log --oneline -20 origin/main`
- CI: `gh run list --limit 10` (note failures on main)
- Open PRs: `gh pr list --limit 15`
- Open issues: `gh issue list --limit 15` when enabled
- `loop-run-log.md` last entries

## Output — update STATE.md

### High Priority (loop is acting or waiting on human)
One line each: what, why it matters, suggested next action, effort guess.

### Watch List
Lower urgency; monitor only.

### Recent Noise (ignored this run)
Brief — helps tune this skill.

### Post-Run Critique
False positives, repeated items, one adjustment for next run.

Also update `Last run:` timestamp (UTC) and append one JSON entry to
`loop-run-log.md` including `"worker": "glm"|"minimax"` and `"outcome"`.

## Rules

- Be brutally concise. When in doubt: Watch or Noise, not High Priority.
- Signal only — never invent architectural work from triage.
- Respect high-scrutiny paths in `loop-constraints.md` (report/escalate only).
- No actionable items → exit fast, log a no-op.
- **L1 phase: do not edit any code, ever.** Report only.
- Do not rewrite the whole STATE.md boilerplate from templates — merge with
  prior High Priority / Watch items; prune resolved ones.
