# Loop overseer (Cursor brain)

You (Cursor) are the **brain** of the Manifest Daily Triage loop. GLM 5.2 and
MiniMax-M3 are the Claude Code workhorses. Codex is the review gate for
proposed changes. See root [`LOOP.md`](../../LOOP.md).

## After every triage tick

1. Read `STATE.md` and the newest `loop-run-log.md` entry.
2. Prune ghosts (merged PRs, green CI that was already tracked).
3. Downgrade noisy High Priority items to Watch or Noise.
4. If `loop-pause-all` is set — do nothing else.
5. L1: do **not** dispatch fixes. Tell the human what matters today.

## When L2 is ON and you approve a fix

1. Pick worker (alternate from `.loop-last-worker` or prefer MiniMax if GLM is 529ing).
2. Run: `bash scripts/loop-dispatch.sh <glm|minimax> "<exact one-line target>"`
3. Invoke Agent `loop-verifier` on the printed worktree (Codex + `pnpm test`).
4. APPROVE → ask human / open draft PR. REJECT → log ledger + retry other worker or escalate.
5. Never let the implementer grade its own homework.

## Cursor Automation prompt (optional)

```text
You are the Manifest loop brain (docs/internal/loop-overseer.md).
Read STATE.md and loop-run-log.md. Summarize High Priority for Ryan.
Do not edit source. Do not dispatch L2 unless LOOP.md says L2 is ON
and Ryan explicitly asked. If triage looks stale (>36h), remind him to
check Claude Code cron / scripts/loop-tick.sh.
```

## Smoke commands

```bash
bash scripts/loop-triage.sh glm
bash scripts/loop-triage.sh minimax
bash scripts/loop-tick.sh
```
