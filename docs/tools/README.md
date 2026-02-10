# Manifest Development Tools

This section documents tools used to validate IR, runtime behavior, and generator behavior.

These tools are supportive. Language semantics are defined only in `C:/Projects/Manifest/docs/spec/*`.

## Start Here

- `C:/Projects/Manifest/tools/QUICK_REFERENCE.md`
- `C:/Projects/Manifest/tools/TEST_EXAMPLE.md`

## Tooling Areas

### IR Validation

- `C:/Projects/Manifest/tools/manifest-ir-schema-validator/project`
- Purpose: validate IR JSON against `ir-v1.schema.json`.

### Runtime Scripted Testing

- `C:/Projects/Manifest/tools/manifest-IR-consumer-test-harness/project/packages/manifest-ir-harness`
- Purpose: run script-driven runtime checks and snapshots.

### IR Diffing

- `C:/Projects/Manifest/tools/IR-diff-explainer/project/packages/ir-diff`
- Purpose: compare IR artifacts and explain changes.

### Generator Access Guarding

- `C:/Projects/Manifest/tools/generator-field-access-guard/packages/field-access-guard`
- Purpose: enforce which IR fields generators are allowed to access.

## Validation Principle

Tool output must never be used to justify semantic drift from spec or conformance. If behavior changes, update spec and conformance first.

## Related

- `C:/Projects/Manifest/docs/tools/USAGE_GUIDE.md`
- `C:/Projects/Manifest/docs/tools/RECOMMENDATIONS.md`
- `C:/Projects/Manifest/docs/spec/conformance.md`