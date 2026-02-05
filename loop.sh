#!/bin/bash
# Usage: ./loop.sh [plan] [max_iterations]
# Examples:
#   ./loop.sh              # Build mode, unlimited iterations
#   ./loop.sh 20           # Build mode, max 20 iterations
#   ./loop.sh plan         # Plan mode, unlimited iterations
#   ./loop.sh plan 5       # Plan mode, max 5 iterations
#
# ============================================================================
# PROMPT TEMPLATE REFERENCE (DO NOT MODIFY LOOP STRUCTURE)
# ============================================================================
#
# PROMPT_build.md format:
# ----------------------------------------------------------------------------
# 0a. Study `specs/*` with up to 500 parallel Sonnet subagents to learn the application specifications.
# 0b. Study @IMPLEMENTATION_PLAN.md.
# 0c. For reference, the application source code is in `src/*`.
#
# 1. Your task is to implement functionality per the specifications using parallel subagents.
#    Follow @IMPLEMENTATION_PLAN.md and choose the most important item to address.
#    Before making changes, search the codebase (don't assume not implemented) using Sonnet subagents.
#    You may use up to 500 parallel Sonnet subagents for searches/reads and only 1 Sonnet subagent for build/tests.
#    Use Opus subagents when complex reasoning is needed (debugging, architectural decisions).
# 2. After implementing functionality or resolving problems, run the tests for that unit of code.
#    If functionality is missing then add it as per the application specifications. Ultrathink.
# 3. When you discover issues, immediately update @IMPLEMENTATION_PLAN.md with findings using a subagent.
#    When resolved, update and remove the item.
# 4. When the tests pass, update @IMPLEMENTATION_PLAN.md, then `git add -A` then `git commit`.
#    After the commit, `git push`.
#
# 99999+. Important rules (numbered high to indicate priority):
#   - Capture the why in documentation
#   - Single sources of truth, no migrations/adapters
#   - Create git tags when no errors (start 0.0.0, increment patch)
#   - Keep @IMPLEMENTATION_PLAN.md current with learnings
#   - Update @AGENTS.md with operational learnings (keep brief)
#   - Resolve bugs or document them even if unrelated
#   - Implement completely - no placeholders/stubs
#   - Clean out completed items periodically
#   - Use Opus 4.5 ultrathink for spec inconsistencies
#   - Keep AGENTS.md operational only - status goes in IMPLEMENTATION_PLAN.md
#
# PROMPT_plan.md format:
# ----------------------------------------------------------------------------
# 0a. Study `specs/*` with up to 250 parallel Sonnet subagents.
# 0b. Study @IMPLEMENTATION_PLAN.md (if present) to understand the plan so far.
# 0c. Study `src/lib/*` with up to 250 parallel Sonnet subagents.
# 0d. For reference, the application source code is in `src/*`.
#
# 1. Study @IMPLEMENTATION_PLAN.md and use up to 500 Sonnet subagents to study existing source code
#    and compare against `specs/*`. Use an Opus subagent to analyze findings, prioritize tasks,
#    and create/update @IMPLEMENTATION_PLAN.md as a bullet point list sorted by priority.
#    Consider: TODO, minimal implementations, placeholders, skipped/flaky tests, inconsistent patterns.
#
# IMPORTANT: Plan only. Do NOT implement anything. Confirm functionality missing with code search first.
# Treat `src/lib` as the project's standard library. Prefer consolidated implementations there.
#
# ULTIMATE GOAL: [project-specific goal]. Search first, then author specs/FILENAME.md if needed.
#
# ============================================================================
# END TEMPLATE REFERENCE
# ============================================================================

# Parse arguments
if [ "$1" = "plan" ]; then
    # Plan mode
    MODE="plan"
    PROMPT_FILE="PROMPT_plan.md"
    MAX_ITERATIONS=${2:-0}
elif [[ "$1" =~ ^[0-9]+$ ]]; then
    # Build mode with max iterations
    MODE="build"
    PROMPT_FILE="PROMPT_build.md"
    MAX_ITERATIONS=$1
else
    # Build mode, unlimited (no arguments or invalid input)
    MODE="build"
    PROMPT_FILE="PROMPT_build.md"
    MAX_ITERATIONS=0
fi

ITERATION=0
CURRENT_BRANCH=$(git branch --show-current)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Mode:   $MODE"
echo "Prompt: $PROMPT_FILE"
echo "Branch: $CURRENT_BRANCH"
[ $MAX_ITERATIONS -gt 0 ] && echo "Max:    $MAX_ITERATIONS iterations"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Verify prompt file exists
if [ ! -f "$PROMPT_FILE" ]; then
    echo "Error: $PROMPT_FILE not found"
    exit 1
fi

# Pre-flight: check for uncommitted work (context rot signal)
UNCOMMITTED=$(git status --porcelain | wc -l)
if [ "$UNCOMMITTED" -gt 0 ]; then
    echo "⚠️  WARNING: $UNCOMMITTED uncommitted changes detected"
    echo "   This may indicate incomplete work from a previous run."
    echo "   Check IMPLEMENTATION_PLAN.md for 'RESUME HERE' notes."
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Pre-flight: verify tests pass before starting loop
echo "Running pre-flight test check..."
npm test
if [ $? -ne 0 ]; then
    echo "❌ Tests are not passing. Fix issues before running loop."
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

while true; do
    if [ $MAX_ITERATIONS -gt 0 ] && [ $ITERATION -ge $MAX_ITERATIONS ]; then
        echo "Reached max iterations: $MAX_ITERATIONS"
        break
    fi

    # Run Ralph iteration with selected prompt
    # -p: Headless mode (non-interactive, reads from stdin)
    # --dangerously-skip-permissions: Auto-approve all tool calls (YOLO mode)
    # --output-format=stream-json: Structured output for logging/monitoring
    # --model opus: Primary agent uses Opus for complex reasoning (task selection, prioritization)
    #               Can use 'sonnet' in build mode for speed if plan is clear and tasks well-defined
    # --verbose: Detailed execution logging
    cat "$PROMPT_FILE" | claude -p \
        --dangerously-skip-permissions \
        --output-format=stream-json \
        --model opus \
        --verbose

    # Push changes after each iteration
    git push origin "$CURRENT_BRANCH" || {
        echo "Failed to push. Creating remote branch..."
        git push -u origin "$CURRENT_BRANCH"
    }

    ITERATION=$((ITERATION + 1))
    echo -e "\n\n======================== LOOP $ITERATION ========================\n"
done
