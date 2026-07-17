#!/usr/bin/env bash
# L2 worker dispatch — Manifest (same contract as capsule-pro-loops).
# Usage: bash scripts/loop-dispatch.sh <glm|minimax> "<one-line fix target>"
#
# DISABLED until L1 graduation (see LOOP.md — L2 must not say OFF).
# Workers alternate per item: the brain picks glm or minimax based on
# who took the previous item (check loop-ledger.json attempts).
set -euo pipefail

WORKER="${1:?worker required: glm|minimax}"
TARGET="${2:?fix target required}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if grep -q 'L2 — \*\*OFF\*\*' "$ROOT/LOOP.md"; then
  echo "L2 is OFF in LOOP.md. Dispatch refused." >&2
  exit 3
fi

if grep -q 'loop-pause-all' "$ROOT/STATE.md" 2>/dev/null; then
  echo "loop-pause-all active — dispatch refused." >&2
  exit 3
fi

npx --yes @cobusgreyling/loop-context --check --ledger "$ROOT/loop-ledger.json" || {
  echo "Circuit breaker tripped — escalate to human (see STATE.md)." >&2
  exit 2
}

RUN_ID="fix-$(date -u +%Y%m%dT%H%M%S)"
WT="${LOOP_WORKTREE_ROOT:-/c/Projects/.loop-worktrees}/manifest-$RUN_ID"
mkdir -p "$(dirname "$WT")"
git -C "$ROOT" worktree add "$WT" -b "loop/$RUN_ID" main

# Worker: GLM or MiniMax via profile switch, minimal-fix contract.
# No --model flag: z.ai maps server-side to its latest (docs discourage pins);
# MiniMax pins via ANTHROPIC_MODEL in the profile.
# shellcheck disable=SC1090
source "$HOME/.claude/switch-claude-profile.sh"
switch_claude_profile "$WORKER"

(cd "$WT" && echo "Apply the minimal-fix skill contract (.claude/skills/minimal-fix/SKILL.md): fix exactly this and nothing else: $TARGET. Respect loop-constraints.md denylist. Run pnpm test / focused tests. Do not commit." \
  | claude -p --permission-mode acceptEdits --output-format=stream-json --verbose)

switch_claude_profile claude

echo ""
echo "Worker done in worktree: $WT"
echo "Brain next: invoke Agent loop-verifier (Codex gate) on that worktree, then log to loop-ledger.json."
echo "The maker's script must not run its own checker."
