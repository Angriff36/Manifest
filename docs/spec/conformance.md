# Conformance

Conformance tests are the executable source of truth for Manifest semantics.

## Source of Truth

- `docs/spec/ir/ir-v1.schema.json` defines the valid IR shape.
- `src/manifest/conformance` fixtures define required compilation output and
  runtime behavior.

## Fixture Layout

- `src/manifest/conformance/fixtures/*.manifest`
- `src/manifest/conformance/expected/*.ir.json` - expected IR output.
- `src/manifest/conformance/expected/*.diagnostics.json` - expected diagnostics
  for failing cases.
- `src/manifest/conformance/expected/*.results.json` - expected runtime
  outcomes.

## Test Rules

- Diagnostics are compared in order and MUST match line/column when present.
- IR output is compared structurally after normalization.
- Whitespace, property ordering, and JSON encoding details are not semantically
  significant.
- IR output SHOULD validate against `docs/spec/ir/ir-v1.schema.json`.
- Runtime results MUST match emitted event name and channel, as well as
  success/error outcomes.
- In conformance tests, timestamps MUST equal the injected deterministic time
  source.
- Outside conformance tests, timestamps MAY use any runtime time source.

## Adding a New Fixture

1. Add a `.manifest` file under `fixtures`.
2. If it should compile, add the expected `.ir.json` under `expected`.
3. If it should fail, add the expected `.diagnostics.json` under `expected`.
4. If runtime behavior is specified, add a `.results.json` file.

### Instance Creation and Defaults

When testing instance creation behavior:
- Omitted properties in test data receive default values from the property definition.
- Explicit empty strings (`""`) are treated as provided values and do not trigger defaults.
- Test fixtures verify that defaults apply correctly when properties are omitted (see `18-empty-string-defaults.manifest`).

## Determinism

Conformance tests use deterministic time and ID generation. New tests MUST be
deterministic.

## Nonconformance

If implementation behavior differs from this document or the specification, the
specification MUST be updated first, then tests, then implementation.

## Conformance as Evidence

Passing the conformance suite is evidence that the specification, compiler,
runtime, and fixtures are mutually consistent at a given version.

### Example: IR Command Ownership Change

A refactor changed `IREntity.commands` from embedded command objects to string
references, with authoritative command definitions moved to the IR root.

This change initially caused failures in IR compilation conformance tests.

The failures persisted until:

- the IR compiler,
- runtime command resolution,
- expected IR fixtures, and
- embedded export templates

were updated to match the specification.

This demonstrates that the conformance suite detects partial or inconsistent
language changes and prevents unintentional semantic drift.
