# Manifest vNext Migration Guide

This guide helps plan migration to vNext capabilities while keeping semantics aligned with spec and conformance.

Primary references:

~~- `C:/Projects/Manifest/docs/spec/manifest-vnext.md`~~
~~- `C:/Projects/Manifest/docs/spec/semantics.md`~~
~~- `C:/Projects/Manifest/docs/spec/ir/ir-v1.schema.json`~~
~~- `C:/Projects/Manifest/src/manifest/conformance/fixtures/`~~

> **Correction (2026-07-15) @RYANSIGNED:** Use repo-relative paths (machine-local
> absolute paths are not portable): `docs/spec/manifest-vnext.md`,
> `docs/spec/semantics.md`, `docs/spec/ir/ir-v1.schema.json`,
> `src/manifest/conformance/fixtures/`. Package pin SoT: `package.json` = **3.6.7**.
>
> **Completion (2026-07-15):** Language/runtime vNext normative features are
> implemented — see `docs/internal/COMPLIANCE_MATRIX.md` §1.
> ~~Remaining gaps: canonical-routes conformance fixtures (PARTIAL), diagnostics
> completeness tests (PARTIAL), evaluation step-count counters (NOT_IMPLEMENTED).~~
> **Update (2026-07-15):** Those three remainder items closed
> (`routes.conformance.test.ts`, `runtime-diagnostics-completeness.test.ts`,
> `getLastEvaluationStats`). Config-vNext is a separate proposal
> (G0/G1/G5/G2-failOn/G10 shipped; G3/G4/G7–G9 open).

## vNext Features

- Constraint outcomes and severity levels.
- Override authorization for marked constraints.
- Command-level constraints.
- Optional optimistic concurrency metadata.
- Deterministic diagnostics and runtime instrumentation support.

## Migration Sequence

1. Identify behavior to adopt from vNext.
2. Confirm IR and semantic requirements in spec.
3. Add or update conformance fixtures first for the new behavior.
4. Update implementation.
5. Regenerate expected outputs where needed.
6. Run full tests.

## Practical Checklist

- Inventory entities and commands that need stricter validation or override flows.
- Introduce stable constraint codes where auditing matters.
- Add override policy references only where exceptions are truly required.
- Apply concurrency version fields only to mutation hotspots.
- Ensure application surfaces structured failure diagnostics instead of generic errors.

## Validation Commands

```bash
pnpm run conformance:regen
pnpm test
pnpm run typecheck
pnpm run lint
```

> **Correction (2026-07-15) @RYANSIGNED:** This repo is a **pnpm** workspace
> (`packageManager` in `package.json`). Prefer `pnpm` over `npm` for validation.

## Fixture References

Current conformance includes vNext-oriented coverage in fixtures such as:

- `21-constraint-outcomes.manifest`
- `22-override-authorization.manifest`
- `23-workflow-idempotency.manifest`
- `24-concurrency-conflict.manifest`
- `25-command-constraints.manifest`
- `26-performance-constraints.manifest`
- `27-vnext-integration.manifest`

## Do Not

- Do not treat migration examples as normative if they conflict with spec.
- Do not implement behavior without corresponding conformance evidence.
- Do not change semantics in generated code templates without spec/test updates.
