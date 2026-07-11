# Sample Governed App (non-Capsule)

A minimal generic governed application that uses Manifest's public surfaces with **zero Capsule-Pro vocabulary**. The purpose is to prove the governance system is application-agnostic.

Normative layout for consumer apps: [`docs/spec/project-layout.md`](../../docs/spec/project-layout.md) (Profile **G**). Capsule-Pro uses renamed paths — see [`docs/integrations/capsule-pro/layout-conformance.md`](../../docs/integrations/capsule-pro/layout-conformance.md).

Domain: a simple library that lends books to members. Two governed entities (`Book`, `Loan`) with one tenant per library branch.

## What this fixture exercises

| Manifest surface                                                                   | Used by this fixture?                                                                                        |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Typed `RuntimeContext` (tenantId, actorId, requestId, source)                      | yes (auth shim in route)                                                                                     |
| `requireTenantContext: true`                                                       | yes                                                                                                          |
| `nextjs.dispatcher` generated route at `/api/manifest/[entity]/commands/[command]` | yes (a paste of generator output lives in `app/api/manifest/[entity]/commands/[command]/route.ts`)           |
| `manifest emit registries`                                                         | yes (committed under `manifest-registry/`)                                                                   |
| `manifest audit-governance` (all 5 detectors)                                      | yes (see `Verify.md`)                                                                                        |
| Approved-bypass registry                                                           | yes (`bypasses.json`)                                                                                        |
| `AuditSink` / `OutboxStore` contracts                                              | the contracts are referenced but not implemented here — this fixture is a CI-gate sample, not a runnable app |

No Capsule-Pro identifier appears anywhere under this directory. Verification:

```bash
rg -n "Capsule|Constitution" fixtures/sample-app
#  → must be empty
```

## Files

- `manifest/library.manifest` — Manifest source defining `Book`, `Loan`, and one tenant boundary.
- `manifest-registry/commands.json` — Output of `manifest emit registries`. Used by `audit-governance --commands-registry`.
- `manifest-registry/entities.json` — Output of `manifest emit registries`.
- `bypasses.json` — One approved-bypass entry to exercise the bypass-violations detector.
- `app/api/manifest/[entity]/commands/[command]/route.ts` — Canonical dispatcher route (verbatim shape produced by `nextjs.dispatcher`).
- `Verify.md` — Step-by-step commands that prove this sample audits clean.
