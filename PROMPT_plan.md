0a. Study `docs/spec/*` with up to 250 parallel Sonnet subagents to learn the Manifest language and IR specifications.
0b. Study @IMPLEMENTATION_PLAN.md (if present) to understand the plan so far.
0c. Study `src/manifest/*` with up to 250 parallel Sonnet subagents to understand the compiler, runtime, IR types, and conformance tests.
0d. For reference, the application source code is in `src/*`.

1. Study @IMPLEMENTATION_PLAN.md (if present; it may be incorrect) and use up to 500 Sonnet subagents to study existing source code in `src/manifest/*` and compare it against the Manifest vNext enhancement requirements. Use an Opus subagent to analyze findings, prioritize tasks, and create/update @IMPLEMENTATION_PLAN.md as a bullet point list sorted in priority of items yet to be implemented. Ultrathink. Consider searching for TODO, minimal implementations, placeholders, skipped/flaky tests, and inconsistent patterns. Study @IMPLEMENTATION_PLAN.md to determine starting point for research and keep it up to date with items considered complete/incomplete using subagents.

IMPORTANT: Plan only. Do NOT implement anything. Do NOT assume functionality is missing; confirm with code search first. Treat `src/manifest` as the core implementation. Prefer consolidated implementations in runtime-engine.ts and ir.ts over scattered changes.

ULTIMATE GOAL: Enhance Manifest to express and enforce real operational rules with soft/hard constraints (OK/WARN/BLOCK), structured overrides with auditing, multi-step workflows with idempotency, concurrency safety with versioning, deterministic diagnostics, and predictable runtime performance. Consider missing elements and plan accordingly. If an element is missing, search first to confirm it doesn't exist, then if needed author the specification at docs/spec/FILENAME.md. If you create a new element then document the plan to implement it in @IMPLEMENTATION_PLAN.md using a subagent.
