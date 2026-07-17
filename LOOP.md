# LOOP.md — Manifest Language

Same routing as `capsule-pro-loops` (2026-07-13), with **Cursor** in the Fable
brain seat. **Current phase: L1 report-only.**

## Model routing (matches capsule-pro)

| Role | Model | Mechanism |
|------|-------|-----------|
| Scheduler | Claude Code cron | Weekday ticks (see `.claude/scheduled_tasks.json` locally) |
| Brain (triage, state, dispatch) | Cursor (watch) + Claude Code cron tick | Cron runs `$loop-constraints` then `$loop-triage` on the **Anthropic / default Claude session** — owns `STATE.md`. Cursor reviews findings and decides dispatch. |
| Implementers (L2 — **OFF**) | GLM 5.2 ⇄ MiniMax-M3, alternating per item | `scripts/loop-dispatch.sh <glm\|minimax> "<item>"` + `~/.claude/switch-claude-profile.sh` |
| Review gate (L2 — **OFF**) | Codex (`gpt-5.6-sol`) | `.claude/agents/loop-verifier.md` wraps `codex exec` |
| Circuit breaker | `loop-context` | `loop-ledger.json` |
| Final gate | Human (Ryan) | Merges, denylist, Compliance Matrix proof |

**GLM/MiniMax are not the triage models.** They only run when the brain
dispatches an L2 fix through `loop-dispatch.sh` (same as capsule-pro).

Worker credentials: `~/.claude/claude-glm.ps1` / `claude-minimax.ps1` — never commit tokens.

## Active loops

| Pattern | Cadence | Status |
|---------|---------|--------|
| Daily Triage | Weekdays `30 15 * * 1-5` (~08:30 America/Los_Angeles) | L1 report-only |
| Minimal fix + Codex review | On brain dispatch | L2 — **OFF** |

## Cron prompt (Claude Code — brain tick)

```text
In C:\Projects\Manifest: if STATE.md contains loop-pause-all, exit.
Else run $loop-constraints then $loop-triage.
Update STATE.md and append loop-run-log.md.
L1 report-only — do not edit source, do not open fix PRs, do not switch to GLM/MiniMax.
```

Do **not** call `switch_claude_profile glm|minimax` on triage ticks.

## L1 → L2 graduation (all required)

1. ≥1 week of L1 ticks with &lt;20% noise in High Priority
2. One *manual* `loop-dispatch.sh` → Codex verifier round-trip proven
3. Human flips implementer status in this file from **OFF** to ON
4. Cursor brain confirms denylist + `pnpm test` path is solid

## L2 dispatch (when ON — same as capsule-pro)

```bash
bash scripts/loop-dispatch.sh glm "exact one-line fix target"
# or
bash scripts/loop-dispatch.sh minimax "exact one-line fix target"
# Brain then runs Agent loop-verifier (Codex) on the printed worktree
```

## Budget & kill switch

- Caps: `loop-budget.md`
- Kill: `loop-pause-all` in `STATE.md`
- GHA `daily-triage.yml` = dogfood scoreboard only — never rewrites triage findings

## Deferred

- capsule-v2 loop setup — separate phase

## Links

- Overseer: [`docs/internal/loop-overseer.md`](./docs/internal/loop-overseer.md)
- Constraints: [`loop-constraints.md`](./loop-constraints.md)
