# Tooling Recommendations

This roadmap keeps tooling aligned with Manifest's IR-first and conformance-first model.

## Priority 1: Keep Existing Tools Healthy

- Ensure each tool builds and tests in CI.
- Keep docs and CLI examples in sync with actual package paths.
- Prefer deterministic outputs for snapshot and diff stability.

## Priority 2: Strengthen Conformance Integration

- Add CI jobs that run schema validation on conformance IR fixtures.
- Add guardrails that fail builds when generated artifacts drift from source fixtures.
- Keep tool baselines versioned with clear update procedures.

## Priority 3: Expand Only When Driven by Real Gaps

Candidates:

- Guard-expression debugging UX.
- Fixture generation helpers.
- Runtime profiling views for large programs.

Adopt only when tied to concrete maintenance pain in this repository.

## Non-Negotiable Rule

No tool should introduce semantic behavior. If a tool implies a semantics change, route it through:

1. `docs/spec/*`
2. `src/manifest/conformance/*`
3. implementation

in that order.