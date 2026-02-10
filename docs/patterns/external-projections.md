# External Projections Pattern

Manifest projections generate platform code from IR. They do not redefine runtime semantics.

## Boundary

Runtime responsibilities (semantic):

- Build evaluation context.
- Enforce applicable policies.
- Evaluate constraints/guards in required order.
- Execute actions.
- Emit declared events.

Projection responsibilities (tooling):

- Read IR.
- Generate framework-specific handlers.
- Integrate auth, transport, and response conventions.
- Choose read-path strategy for platform needs.

## Reads vs Writes

### Reads

Read behavior is application-defined. Projections may use direct storage reads or adapter-level abstractions.

### Writes

If write paths are expected to enforce Manifest semantics, they must execute commands via `RuntimeEngine.runCommand`.

Bypassing runtime command execution bypasses guard/policy/constraint semantics.

## Spec and Conformance Rule

If a projection requires new semantic behavior, that change must follow:

1. `docs/spec/*` update
2. conformance fixture/test update
3. implementation update

Do not ship projection-only behavior that changes language meaning.

## Related

- `C:/Projects/Manifest/docs/spec/semantics.md`
- `C:/Projects/Manifest/docs/spec/adapters.md`
- `C:/Projects/Manifest/src/manifest/projections/nextjs/README.md`