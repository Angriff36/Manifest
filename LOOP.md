# LOOP.md — Manifest Language

Real agent loop (not the GHA scoreboard). Architecture mirrors the proven
`capsule-pro-loops` setup, with **Cursor as brain**.

**Current phase: L1 report-only.** L2 implementers + Codex review are wired
but **OFF** until graduation criteria below are met.

## Model routing

| Role | Model / host | Mechanism |
|------|----------------|-----------|
| Brain (watch, prioritize, dispatch, send to review) | Cursor (this chat / Automation) | Reads `STATE.md`; never rubber-stamps workers; owns graduation calls |
| Work horses (triage L1; implement L2 when ON) | GLM 5.2 ⇄ MiniMax-M3 via Claude Code | `scripts/loop-tick.sh` / `scripts/loop-triage.sh` / `scripts/loop-dispatch.sh` + `~/.claude/switch-claude-profile.sh` |
| Review gate (L2 — **OFF**) | Codex (`gpt-5.6-sol` per `~/.codex/config.toml`) | `.claude/agents/loop-verifier.md` → `codex exec` / `codex review` |
| Circuit breaker | `loop-context` | `loop-ledger.json` |
| Final gate | Human (Ryan) | Merges, denylist paths, Compliance Matrix proof |

Worker credentials stay in `~/.claude/claude-glm.ps1` and
`~/.claude/claude-minimax.ps1` — **never** commit tokens.

## What runs when

| Job | Cadence | What it does |
|-----|---------|--------------|
| **Real triage** | Claude Code cron weekdays `30 15 * * 1-5` (08:30 America/Los_Angeles ≈ 15:30 UTC) | `scripts/loop-tick.sh` → alternating GLM/MiniMax runs `$loop-constraints` then `$loop-triage` → updates `STATE.md` |
| **Brain watch** | Cursor (you) after each tick / on demand | Read `STATE.md` + run log; prune noise; decide dispatch; send approved diffs to Codex |
| **GHA dogfood** | `daily-triage.yml` weekdays 08:00 UTC | Audit score + CI health only — **does not own or rewrite triage findings** |

## Active loops

| Pattern | Cadence | Status |
|---------|---------|--------|
| Daily Triage | Weekdays ~08:30 local via Claude Code cron | L1 report-only |
| Minimal fix + Codex review | On brain dispatch | L2 — **OFF** |

## L1 → L2 graduation (all required)

1. ≥1 week of L1 ticks with &lt;20% noise in High Priority
2. One *manual* `loop-dispatch.sh` → Codex verifier round-trip proven
3. Human flips implementer status in this file from **OFF** to ON
4. Brain (Cursor) confirms denylist + `pnpm test` verifier path is solid

## How the brain dispatches (L2, when ON)

```bash
# After approving a High Priority item in STATE.md:
bash scripts/loop-dispatch.sh glm "exact one-line fix target"
# or
bash scripts/loop-dispatch.sh minimax "exact one-line fix target"

# Then (brain / Claude wrapper): invoke Agent loop-verifier on the printed worktree
# Verdict APPROVE → draft PR; REJECT → log attempt + alternate worker or escalate
```

## Manual triage (smoke)

```bash
bash scripts/loop-triage.sh glm
bash scripts/loop-triage.sh minimax
```

## Budget & kill switch

- Caps: `loop-budget.md`
- Run history: `loop-run-log.md`
- Kill: put `loop-pause-all` in `STATE.md` High Priority → ticks exit immediately

## Deferred

- capsule-v2 loop setup — separate phase
- Manifest DSL `schedule` for triage — wrong layer (agent ops ≠ runtime cron)

## Links

- Overseer playbook: [`docs/internal/loop-overseer.md`](./docs/internal/loop-overseer.md)
- Constraints: [`loop-constraints.md`](./loop-constraints.md)
- Agents guide: [`AGENTS.md`](./AGENTS.md)
