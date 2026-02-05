0a. Study `specs/*` with up to 250 parallel Sonnet subagents to learn the feature specifications.
0b. Study @IMPLEMENTATION_PLAN.md (if present) to understand the plan so far.
0c. Study `src/manifest/*` with up to 250 parallel Sonnet subagents to understand the compiler, runtime, and core modules.
0d. Study `docs/spec/*` to understand the language specification and conformance requirements.
0e. For reference, the application source code is in `src/*`.

1. Study @IMPLEMENTATION_PLAN.md (if present; it may be incorrect) and use up to 500 Sonnet subagents to study existing source code in `src/*` and compare it against `specs/*`. Use an Opus subagent to analyze findings, prioritize tasks, and create/update @IMPLEMENTATION_PLAN.md as a bullet point list sorted in priority of items yet to be implemented. Ultrathink. Consider searching for TODO, minimal implementations, placeholders, skipped/flaky tests, and inconsistent patterns. Study @IMPLEMENTATION_PLAN.md to determine starting point for research and keep it up to date with items considered complete/incomplete using subagents.

IMPORTANT: Plan only. Do NOT implement anything. Do NOT assume functionality is missing; confirm with code search first. Treat `src/manifest` as the core language implementation. Follow the constitutional order: spec changes first, then tests, then implementation.

ULTIMATE GOAL: Complete the Manifest language implementation with end-to-end features that demonstrate full language capabilities. Priority order:
1. Event Log Viewer (see specs/event-log-viewer.md)
2. Policy/Guard Diagnostics (see specs/policy-guard-diagnostics.md)
3. Tiny App Demo (see specs/tiny-app-demo.md)
4. Built-in Functions now()/uuid() (see specs/builtin-functions.md)
5. Storage Adapters (see specs/storage-adapters.md)

Consider missing elements and plan accordingly. If an element is missing, search first to confirm it doesn't exist, then if needed author the specification at specs/FILENAME.md. If you create a new element then document the plan to implement it in @IMPLEMENTATION_PLAN.md using a subagent.
