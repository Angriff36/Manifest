# Manifest Usage Patterns

This guide describes how to integrate Manifest without changing language semantics.

Normative behavior is defined in:

- `C:/Projects/Manifest/docs/spec/semantics.md`
- `C:/Projects/Manifest/docs/spec/adapters.md`
- `C:/Projects/Manifest/docs/spec/conformance.md`

## Two Integration Patterns

### 1) Projections

Use projections when you want generated platform code (for example Next.js routes).

- Projections are tooling, not language semantics.
- Mutating operations must execute through runtime command execution (`RuntimeEngine.runCommand`) so policies, constraints, guards, actions, and emits run in spec order.
- Read operations are application-defined and may use direct storage queries.

See:

- `C:/Projects/Manifest/docs/patterns/external-projections.md`
- `C:/Projects/Manifest/src/manifest/projections/nextjs/README.md`

### 2) Embedded Runtime

Use embedded runtime when you need full control over command orchestration, side effects, and response shape.

- Instantiate `RuntimeEngine` with IR and runtime context.
- Use `runCommand` for command execution.
- Handle emitted events in application code or via adapter patterns.

See:

- `C:/Projects/Manifest/docs/guides/embedded-runtime-pattern.md`

## Decision Guide

Use projections when:

- You want generated route/controller code.
- Your mutation flow can be represented as runtime command execution.

Use embedded runtime when:

- You need custom orchestration around command execution.
- You need custom event handling and side-effect pipelines.

## Constraints

No integration pattern may weaken semantics defined in `docs/spec/*`.

In particular:

- Do not bypass runtime execution for writes that are intended to enforce Manifest guards/policies/constraints.
- Do not introduce implicit context defaults that change guard outcomes.
- Do not alter guard ordering or short-circuit behavior in generated or embedded paths.