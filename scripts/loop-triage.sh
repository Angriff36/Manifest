#!/usr/bin/env bash
# L1 triage workhorse — Manifest.
# Usage: bash scripts/loop-triage.sh <glm|minimax>
#
# Runs Claude Code under the GLM or MiniMax profile with the loop-triage skill.
# Does not edit application source — report-only into STATE.md.
set -euo pipefail

WORKER="${1:?worker required: glm|minimax}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if grep -q 'loop-pause-all' "$ROOT/STATE.md" 2>/dev/null; then
  echo "loop-pause-all active in STATE.md — triage refused." >&2
  exit 3
fi

case "$WORKER" in
  glm|minimax) ;;
  *)
    echo "usage: bash scripts/loop-triage.sh <glm|minimax>" >&2
    exit 1
    ;;
esac

# shellcheck disable=SC1090
source "$HOME/.claude/switch-claude-profile.sh"
switch_claude_profile "$WORKER"

PROMPT=$(cat <<'EOF'
Run $loop-constraints, then $loop-triage for this Manifest language repo.

Read LOOP.md and STATE.md first.
Gather: gh run list --limit 10, gh pr list --limit 15, git log --oneline -20 origin/main,
and recent loop-run-log.md entries.

Update STATE.md (High Priority / Watch / Noise / Post-Run Critique + Last run).
Append one JSON entry to loop-run-log.md (include "worker": "WORKER_PLACEHOLDER").

L1 report-only: do NOT edit source, specs, or open fix PRs.
Be brutally concise. Empty watchlist → no-op exit.
EOF
)
PROMPT="${PROMPT//WORKER_PLACEHOLDER/$WORKER}"

echo "$PROMPT" | claude -p \
  --permission-mode acceptEdits \
  --output-format=stream-json \
  --verbose

# Restore Anthropic defaults for any follow-on brain/verifier work in this shell
switch_claude_profile claude

echo ""
echo "Triage worker ($WORKER) finished. Brain: read STATE.md and decide next action."
