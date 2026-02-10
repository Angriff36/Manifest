# Manifest Documentation

This directory contains implementation docs for the Manifest language runtime.

`docs/spec/*` is the normative source of truth. Non-spec docs in this directory are operational guidance and must never contradict the spec.

## Context7 Ingestion Order

For Context7 indexing, ingest in this order:

1. `C:/Projects/Manifest/docs/spec/ir/ir-v1.schema.json`
2. `C:/Projects/Manifest/docs/spec/semantics.md`
3. `C:/Projects/Manifest/docs/spec/builtins.md`
4. `C:/Projects/Manifest/docs/spec/adapters.md`
5. `C:/Projects/Manifest/docs/spec/conformance.md`
6. `C:/Projects/Manifest/src/manifest/conformance/conformance.test.ts`
7. `C:/Projects/Manifest/docs/spec/manifest-vnext.md`
8. `C:/Projects/Manifest/docs/spec/README.md`

Then ingest the non-spec docs in this order:

1. `C:/Projects/Manifest/docs/guides/usage-patterns.md`
2. `C:/Projects/Manifest/docs/guides/embedded-runtime-pattern.md`
3. `C:/Projects/Manifest/docs/guides/implementing-custom-stores.md`
4. `C:/Projects/Manifest/docs/guides/transactional-outbox-pattern.md`
5. `C:/Projects/Manifest/docs/patterns/external-projections.md`
6. `C:/Projects/Manifest/docs/migration/vnext-migration-guide.md`
7. `C:/Projects/Manifest/docs/tools/README.md`
8. `C:/Projects/Manifest/docs/tools/USAGE_GUIDE.md`
9. `C:/Projects/Manifest/docs/tools/RECOMMENDATIONS.md`

## Rules for Non-Spec Docs

- Treat `docs/spec/*` as law.
- When behavior changes, update spec first, then conformance, then implementation, then guidance docs.
- Guidance docs should reference runtime and conformance behavior, not redefine language semantics.
- If implementation differs from spec, record nonconformance in the relevant file under `docs/spec/*`.

## Contents

- `spec/`: Normative language definition and conformance policy.
- `guides/`: Implementation guidance for runtime embedding, stores, and operations.
- `patterns/`: Integration boundary guidance for projections.
- `migration/`: Upgrade planning for vNext features.
- `tools/`: Tooling usage for validation, diffing, and harness workflows.
- `capsule-pro-integration-spec.md`: Integration checklist template for external applications.