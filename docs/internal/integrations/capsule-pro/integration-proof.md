# Capsule-Pro × Manifest Integration Proof

Status: integration map only — no Manifest code depends on Capsule-Pro.

This document records the exact public surfaces Capsule-Pro consumes from Manifest, and pins the constraint that the dependency is **one-directional**:

```
Capsule-Pro  ── depends on ──▶  Manifest (this repo)
Capsule-Pro  ◀──── nothing ────  Manifest
```

A non-Capsule sample app (`fixtures/sample-app/`) consumes the same public surfaces, proving the system is application-agnostic.

## Public Manifest surfaces consumed by Capsule-Pro

| #   | Surface                                                                                                | Where it lives in Manifest                                                   | How Capsule-Pro consumes it                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `RuntimeContext` typed fields (`tenantId`, `orgId`, `actorId`, `requestId`, `source`, `deterministic`) | `src/manifest/runtime-engine.ts`                                             | Capsule-Pro's auth middleware maps Clerk session → typed context. No Manifest patch required.                                                      |
| 2   | `requireTenantContext` option                                                                          | `RuntimeOptions` in `src/manifest/runtime-engine.ts`                         | Passed `true` for governed entities.                                                                                                               |
| 3   | `nextjs.dispatcher` projection                                                                         | `src/manifest/projections/nextjs/generator.ts` (surface `nextjs.dispatcher`) | Generated dispatcher mounted at `apps/api/app/api/manifest/[entity]/commands/[command]/route.ts`. Capsule-Pro keeps no per-command override files. |
| 4   | Command registry (`commands.json`)                                                                     | `src/manifest/registry/emit.ts` → CLI: `manifest emit registries`            | Capsule-Pro CI commits the emitted file under `manifest-registry/`.                                                                                |
| 5   | Governed-entity registry (`entities.json`)                                                             | Same as #4                                                                   | Same as #4.                                                                                                                                        |
| 6   | Approved-bypass registry (`bypasses.json`)                                                             | Schema: `docs/spec/registry/bypasses.schema.json`                            | Capsule-Pro hand-curates `bypasses.json` in its own repo; Manifest never sees the file.                                                            |
| 7   | `manifest audit-governance` CLI (umbrella detector)                                                    | `packages/cli/src/commands/audit-governance.ts`                              | Capsule-Pro CI step runs `manifest audit-governance --strict --commands-registry … --bypass-registry …`.                                           |
| 8   | `manifest audit-bypasses` CLI                                                                          | `packages/cli/src/commands/audit-bypasses.ts`                                | Capsule-Pro CI runs in `--strict-expiry` mode.                                                                                                     |
| 9   | `AuditSink` adapter contract                                                                           | `src/manifest/audit/audit-sink.ts`                                           | Capsule-Pro implements `PostgresAuditSink` in its own repo.                                                                                        |
| 10  | `OutboxStore` adapter contract                                                                         | `src/manifest/outbox/outbox-store.ts`                                        | Capsule-Pro implements `PostgresOutboxStore` in its own repo.                                                                                      |
| 11  | Conformance fixtures format                                                                            | `src/manifest/conformance/`                                                  | Capsule-Pro authors its own fixtures using Manifest's fixture format.                                                                              |

## What Manifest does NOT do for Capsule-Pro

- Manifest does **not** import any file from `docs/integrations/capsule-pro/` from `src/manifest/**` or `packages/cli/**`.
- Manifest's specs in `docs/spec/**` do **not** cite Capsule-Pro's constitution as authority.
- Manifest's audit detectors and finding codes do **not** name Capsule-Pro entities, routes, or sections.
- Manifest's generated code does **not** contain `Capsule-Pro` or `Constitution §N` references.
- Manifest's CLI command is `audit-governance` (canonical), with `audit-constitution` retained only as a deprecated alias.

## Dependency-direction proof commands

The integration is one-directional iff each command below returns zero hits. Each line is an invariant that should be enforced in Manifest CI:

```bash
# 1. No Manifest source file references Capsule-Pro by name.
rg -n "Capsule-?Pro|Constitution" src/manifest packages/cli/src docs/spec
#    → must be empty (deprecation alias mentions are the single allowed exception, by name only)

# 2. No Manifest source imports from docs/integrations/.
rg -n "docs/integrations" src/manifest packages/cli/src
#    → must be empty

# 3. Manifest's generated dispatcher has no Capsule-Pro identifiers.
rg -n "Capsule|Constitution" src/manifest/projections/nextjs/generator.ts
#    → must be empty
```

The current repo state passes all three. Adding a Capsule-Pro reference to Manifest core would surface here.

## How Capsule-Pro wires the contracts

Pseudocode showing the consumer side of the boundary (lives in Capsule-Pro's repo, not here):

```ts
// apps/api/lib/manifest-runtime.ts (Capsule-Pro repo)
import { RuntimeEngine } from '@angriff36/manifest';
import { PostgresAuditSink } from './audit/postgres-sink';
import { PostgresOutboxStore } from './outbox/postgres-store';
import { compiledIR } from './generated/manifest-ir';

export function createRuntime(ctx: SessionCtx) {
  return new RuntimeEngine(
    compiledIR,
    {
      tenantId: ctx.orgId,
      orgId: ctx.orgId,
      actorId: ctx.userId,
      requestId: ctx.requestId,
      source: 'route',
    },
    {
      requireTenantContext: true,
      auditSink: new PostgresAuditSink(pgPool),
      outboxStore: new PostgresOutboxStore(pgPool),
    },
  );
}
```

The arrows go one way: Capsule-Pro imports Manifest classes and contracts, then implements adapters against them. Manifest never reaches back.

## Replacing Capsule-Pro with another app

To prove the system isn't Capsule-Pro-shaped, see `fixtures/sample-app/`. It is a minimal generic governed application (a "Library/Book" domain) that emits registries via the same CLI, runs `manifest audit-governance` against the same detectors, and exercises the same RuntimeContext + dispatcher surfaces — with zero Capsule-Pro vocabulary.
