# External Integration Checklist (Template)

This document is a reusable checklist for integrating Manifest into an external application without changing language semantics.

Use this as a process template. Do not treat it as normative language spec.

## Preconditions

- Read and accept `C:/Projects/Manifest/docs/spec/*` as authoritative.
- Confirm target app can supply required runtime context used by guards/policies (`user`, `context`, etc.).
- Confirm mutation paths can execute through runtime command execution (`runCommand`).

## Integration Steps

1. Sync runtime/compiler/projection package versions.
2. Compile `.manifest` sources to IR and verify diagnostics.
3. Wire runtime factory with explicit context mapping from app auth/session model.
4. Route mutating operations through `RuntimeEngine.runCommand`.
5. Keep read paths explicit (direct storage or adapter strategy).
6. Map command failures to API responses without mutating semantic outcomes.
7. Wire emitted events to application event pipeline if needed.

## Verification

- Run repository tests (`npm test`) after integration updates in this repo.
- Add application-level tests in the external app for auth/context mapping and response contracts.
- Confirm deterministic behavior in tests via injectable time/id options when relevant.

## Common Failure Modes

- Missing runtime context fields for guards.
- Write paths bypassing runtime command execution.
- Generated code or templates drifting from real runtime semantics.
- External error-shape conventions masking policy/guard/constraint diagnostics.

## Escalation Rule

If integration requires new runtime behavior, follow constitutional order:

1. spec update
2. conformance update
3. implementation update

Do not ship integration-only semantic changes.