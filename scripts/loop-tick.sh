#!/usr/bin/env bash
# Weekday triage tick — alternates GLM 5.2 and MiniMax-M3 workhorses.
# Invoked by Claude Code cron (see .claude/scheduled_tasks.json) or manually.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
STATE_WORKER_FILE="$ROOT/.loop-last-worker"

if grep -q 'loop-pause-all' "$ROOT/STATE.md" 2>/dev/null; then
  echo "loop-pause-all active — tick skipped." >&2
  exit 0
fi

LAST="minimax"
if [[ -f "$STATE_WORKER_FILE" ]]; then
  LAST="$(tr -d '[:space:]' < "$STATE_WORKER_FILE")"
fi

if [[ "$LAST" == "glm" ]]; then
  WORKER="minimax"
else
  WORKER="glm"
fi

echo "loop-tick: worker=$WORKER (previous=$LAST)"
bash "$ROOT/scripts/loop-triage.sh" "$WORKER"
printf '%s\n' "$WORKER" > "$STATE_WORKER_FILE"

echo "loop-tick: done. Cursor brain should review STATE.md."
