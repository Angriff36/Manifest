# Loop overseer (Cursor brain)

Matches **capsule-pro-loops** routing: triage runs on the Claude Code cron
session (Anthropic/default Claude); **GLM/MiniMax only via**
`scripts/loop-dispatch.sh` for L2 fixes. You (Cursor) watch `STATE.md`, prune
noise, and own dispatch/review calls. See [`LOOP.md`](../../LOOP.md).

## After every triage tick

1. Read `STATE.md` and the newest `loop-run-log.md` entry.
2. Prune ghosts (merged PRs, already-fixed CI).
3. Downgrade noisy High Priority → Watch/Noise.
4. If `loop-pause-all` — stop.
5. L1: do **not** call `loop-dispatch.sh`.

## When L2 is ON and you approve a fix

Same as capsule-pro:

```bash
bash scripts/loop-dispatch.sh glm "exact one-line fix target"
# or minimax — alternate using loop-ledger.json attempts
```

Then invoke Agent `loop-verifier` (Codex) on the printed worktree.
APPROVE → draft PR / human. REJECT → log ledger + retry other worker or escalate.

## Manual triage smoke (brain path — not GLM/MiniMax)

In a Claude Code session on Anthropic profile (not glm/minimax):

```text
Run $loop-constraints then $loop-triage. Update STATE.md. Report only.
```

## What not to do

- Do not run triage under `switch_claude_profile glm|minimax` (that is L2-only).
- Do not let GHA dogfood rewrite High Priority findings.
