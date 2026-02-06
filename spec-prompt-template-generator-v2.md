# Ralph Wiggum Loop Template Generator (v2.0)

## Overview

Ralph Wiggum is an autonomous AI development technique that uses iterative loops to implement specifications. This document provides templates for setting up Ralph loops for any project.

**The Ralph Loop:**
```
Phase 1: Define Specs → Phase 2: Plan Mode → Phase 3: Build Mode (indefinite loop)
```

## Quick Start

1. Write your specs in `specs/[TOPIC].md`
2. Copy the templates below to your project root
3. Replace `[VARIABLES]` with your project-specific values
4. Run `./loop.sh plan` to create implementation plan
5. Run `./loop.sh build` to implement indefinitely

## File Templates

### PROMPT_plan.md

```
0a. Study `specs/*` with up to 250 parallel Sonnet subagents to learn the application specifications.
0b. Study @IMPLEMENTATION_PLAN.md (if present) to understand the plan so far.
0c. Study `src/lib/*` with up to 250 parallel Sonnet subagents to understand shared utilities & components.
0d. For reference, the application source code is in `src/*`.

1. Study @IMPLEMENTATION_PLAN.md (if present; it may be incorrect) and use up to 500 Sonnet subagents to study existing source code in `src/*` and compare it against `specs/*`. Use an Opus subagent to analyze findings, prioritize tasks, and create/update @IMPLEMENTATION_PLAN.md as a bullet point list sorted in priority of items yet to be implemented. Ultrathink. Consider searching for TODO, minimal implementations, placeholders, skipped/flaky tests, and inconsistent patterns.

IMPORTANT: Plan only. Do NOT implement anything. Do NOT assume functionality is missing; confirm with code search first. Treat `src/lib` as the project's standard library for shared utilities and components.

ULTIMATE GOAL: [YOUR_GOAL_HERE]. Consider missing elements and plan accordingly.
```

### PROMPT_build.md

```
0a. Study `specs/*` with up to 500 parallel Sonnet subagents to learn the application specifications.
0b. Study @IMPLEMENTATION_PLAN.md.
0c. For reference, the application source code is in `src/*`.

1. Your task is to implement functionality per the specifications using parallel subagents. Follow @IMPLEMENTATION_PLAN.md and choose the most important item to address. Before making changes, search the codebase (don't assume not implemented) using Sonnet subagents. You may use up to 500 parallel Sonnet subagents for searches/reads and only 1 Sonnet subagent for build/tests. Use Opus subagents when complex reasoning is needed.
2. After implementing, run tests. If functionality is missing, add it per the specifications. Ultrathink.
3. Update @IMPLEMENTATION_PLAN.md with findings using a subagent. When resolved, update and remove the item.
4. When tests pass, update @IMPLEMENTATION_PLAN.md, then `git add -A` and `git commit` with a descriptive message. After commit, `git push`.

99999. Important: When authoring documentation, capture the why.
999999. Single sources of truth, no migrations/adapters. If tests unrelated to your work fail, resolve them.
9999999. When no build/test errors, create a git tag. Start at 0.0.0 and increment patch by 1.
99999999. Add extra logging if required to debug.
999999999. Keep @IMPLEMENTATION_PLAN.md current with learnings using a subagent.
9999999999. Update @AGENTS.md with operational learnings (keep it brief).
99999999999. Resolve or document any bugs in @IMPLEMENTATION_PLAN.md.
999999999999. Implement completely - no placeholders or stubs.
9999999999999. Periodically clean completed items from IMPLEMENTATION_PLAN.md.
99999999999999. Use Opus 4.5 with ultrathink to resolve spec inconsistencies.
999999999999999. Keep AGENTS.md operational only - status goes in IMPLEMENTATION_PLAN.md.
```

### AGENTS.md

```
## Build & Run

How to BUILD the project:

## Validation

Run after implementing:

- Tests: [YOUR_TEST_COMMAND]
- Typecheck: [YOUR_TYPECHECK_COMMAND]
- Lint: [YOUR_LINT_COMMAND]

## Operational Notes

How to RUN the project:

...

### Codebase Patterns

...
```

### loop.sh

```bash
#!/bin/bash
# Usage: ./loop.sh [plan] [max_iterations]
# Examples: ./loop.sh plan 5, ./loop.sh build, ./loop.sh 20

if [ "$1" = "plan" ]; then
    MODE="plan"
    PROMPT_FILE="PROMPT_plan.md"
    MAX_ITERATIONS=${2:-0}
elif [[ "$1" =~ ^[0-9]+$ ]]; then
    MODE="build"
    PROMPT_FILE="PROMPT_build.md"
    MAX_ITERATIONS=$1
else
    MODE="build"
    PROMPT_FILE="PROMPT_build.md"
    MAX_ITERATIONS=0
fi

ITERATION=0
CURRENT_BRANCH=$(git branch --show-current)

echo "Mode: $MODE | Prompt: $PROMPT_FILE | Branch: $CURRENT_BRANCH"

if [ ! -f "$PROMPT_FILE" ]; then
    echo "Error: $PROMPT_FILE not found"
    exit 1
fi

while true; do
    if [ $MAX_ITERATIONS -gt 0 ] && [ $ITERATION -ge $MAX_ITERATIONS ]; then
        break
    fi

    cat "$PROMPT_FILE" | claude -p \
        --dangerously-skip-permissions \
        --output-format=stream-json \
        --model opus \
        --verbose

    git push origin "$CURRENT_BRANCH" || git push -u origin "$CURRENT_BRANCH"
    ITERATION=$((ITERATION + 1))
    echo "======================== LOOP $ITERATION ========================"
done
```

## How Ralph Works

### Context Management
- 176K usable context per iteration
- 40-60% "smart zone" for determinism
- Main agent = scheduler (orchestrates, delegates)
- Subagents = memory (156KB each, garbage collected)
- 250-500 parallel Sonnet subagents for exploration
- Opus for synthesis and complex reasoning

### Steering Ralph
- **Upstream**: Same starting state each iteration (PROMPT.md + AGENTS.md)
- **Downstream**: Backpressure (tests, typechecks, lints must pass)

### Let Ralph Ralph
- Don't micromanage - Ralph picks tasks and implementation
- Trust iteration - eventual consistency through loops
- Observe early, tune reactively
- The plan is disposable - regenerate if wrong

## Tips for Success

1. **Spec Writing**: One topic per spec, be specific, include examples
2. **AGENTS.md**: Keep operational, document patterns, add signs when Ralph fails
3. **Safety**: Use sandboxing, minimum credentials, Ctrl+C to stop
