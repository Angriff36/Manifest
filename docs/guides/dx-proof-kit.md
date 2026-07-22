---
title: DX Proof Kit
created: 2026-07-16
updated: 2026-07-16
status: Active
authority: Advisory
applies_to: '@angriff36/manifest@3.6.20+'
---

# DX Proof Kit

Prove that generated Manifest applications stay complete — without scraping
TypeScript or maintaining parallel entity/command inventories by hand.

**Package pin SoT:** `package.json` = **3.6.20**. Exact pin required (no `^`);
see [`docs/spec/sdk-stability.md`](../spec/sdk-stability.md).

Ownership boundary (Manifest vs application):  
[`docs/internal/plans/2026-07-16-dx-proof-kit-boundary.md`](../internal/plans/2026-07-16-dx-proof-kit-boundary.md).

## Purpose

Generated apps accumulate drift: docs claim a reaction is proven when the test
is gone, feature code bypasses generated hooks, lifecycle tables get reinvented
locally. The DX Proof Kit turns the compiled program (IR) and Convex projection
metadata into one machine-readable catalog, a proof registry with CI validation,
an integration guard engine, and optional Convex runtime helpers.

## Smallest valid example

```typescript
import type { IR } from '@angriff36/manifest/ir';
import {
  emitCapabilityCatalog,
  emitProofRegistry,
  validateProofRegistry,
  formatCapabilityCatalogMarkdown,
} from '@angriff36/manifest/proof-kit';

const ir = /* compiled IR */ {} as IR;

const catalog = emitCapabilityCatalog(ir, {
  entityFilter: ['IngredientDemand', 'PurchaseNeed'],
  versions: {
    manifestVersion: '3.6.20',
    projection: 'convex',
    preset: { id: 'convex-application', version: '1.3.4' },
  },
});

const registry = emitProofRegistry(ir, {
  entityFilter: ['IngredientDemand', 'PurchaseNeed'],
  versions: catalog.versions,
  testBindings: [
    {
      proofId: 'IngredientDemandConfirmed->PurchaseNeed.create',
      structuralTest: 'tests/event-reaction-projection.test.ts',
      runtimeTest: 'tests/proofs/ingredient-demand-confirm.runtime.test.ts',
    },
  ],
});

const issues = validateProofRegistry(registry, {
  rootDir: process.cwd(),
  catalog,
  installedManifestVersion: '3.6.20',
  installedPreset: { id: 'convex-application', version: '1.3.4' },
});
if (issues.length) throw new Error(issues.map((i) => i.message).join('\n'));

console.log(formatCapabilityCatalogMarkdown(catalog));
```

## Observable application effect

- A committed `capability-catalog.json` lists entities, commands, hooks, events,
  reactions, and proof statuses derived from IR (not from regex on generated TS).
- A committed `proof-registry.json` records which proofs have structural and/or
  runtime tests; CI fails when `runtime_proven` lacks a test file or versions drift.
- Feature-root integration guards report file + line when code imports raw Convex
  APIs or writes owned tables directly.
- Optional Convex tests exercise public generated mutations with tenant/role
  identity via `convex-test` (devDependency only).

## Behavior by layer

### Compile / IR

Catalog and registry emitters read the compiled program (IR) plus Convex naming
helpers (`resolveConvexTableName`, creation-entry aliases). They do not change
language semantics.

### Projection / generated SDK

| Subpath                                     | Role                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| `@angriff36/manifest/proof-kit`             | Catalog, registry, validator, guard engine — **must not** require `convex-test` |
| `@angriff36/manifest/proof-kit/convex-test` | Optional harness helpers; apps inject `convexTest`                              |

Optional peers on the package: `convex` (`>=1.32.0`), `convex-test` (`>=0.0.43`),
both marked optional. Core imports work with neither installed.

`verifyConvexApplicationAssembly` accepts optional `proofCatalogJson` and checks
schema `manifest-capability-catalog/v1` when provided.

### Application (consumer)

The application owns:

- feature-root paths, exceptions, and lifecycle-policy symbols for the guard
- scenario fixtures and runtime Vitest cases
- product-decision markers (`blocked_by_product_decision`,
  `intentionally_unavailable`)

Manifest does not own product decisions (for example unresolved receipt→stock).

## Use this when

- You ship a Convex (or Convex-preset) Manifest app and need CI to prove
  declared reactions/commands stay wired and tested.
- You want one guard engine instead of per-slice copy-pasted scripts.
- You need a human-readable capability summary that cannot drift from IR.

## Do not use this when

- You need to change language semantics — update `docs/spec/**` and conformance
  first; the proof kit only observes IR.
- You want Explorer/GraphRAG as a second truth source — Explorer may *consume*
  the catalog later; it must not redefine it.
- You are tempted to hand-edit `runtime_proven` in the registry without a test
  path — the validator rejects that.

## Related constructs and next steps

- Stable exports: [`docs/spec/sdk-stability.md`](../spec/sdk-stability.md)
- Ownership: [`docs/internal/plans/2026-07-16-dx-proof-kit-boundary.md`](../internal/plans/2026-07-16-dx-proof-kit-boundary.md)
- Registries (commands/entities inventory): `@angriff36/manifest/registry/emit`
- Contract-tests projection: export-name parity (structural), not runtime proofs
- Convex projection capabilities: `@angriff36/manifest/projections`

## Complete API surface

### `@angriff36/manifest/proof-kit`

| Export                                               | Purpose                                  |
| ---------------------------------------------------- | ---------------------------------------- |
| `emitCapabilityCatalog(ir, options?)`                | Machine-readable per-entity catalog      |
| `formatCapabilityCatalogMarkdown(catalog)`           | Human view of the same data              |
| `emitProofRegistry(ir, options?)`                    | Proof entries; status from test bindings |
| `reactionProofId(rule)`                              | Stable id `Event->Entity.command`        |
| `validateProofRegistry` / `assertProofRegistryValid` | CI checks                                |
| `emitIntegrationGuardConfig(catalog, options)`       | Guard config from catalog tables         |
| `runManifestIntegrationGuard(rootDir, config)`       | File/line violations                     |

**Proof statuses:** `declared` · `generated` · `structurally_proven` ·
`runtime_proven` · `intentionally_unavailable` · `blocked_by_product_decision`

**Schema ids:** `manifest-capability-catalog/v1` · `manifest-proof-registry/v1` ·
`manifest-integration-guard/v1`

### `@angriff36/manifest/proof-kit/convex-test`

| Export                                                       | Purpose                                                                                             |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `createManifestTestContext({ convexTest, schema, modules })` | Wrap app's `convex-test`                                                                            |
| `ManifestConvexProofHarness`                                 | `asRole`, `executeCommand`, `seedEntity`, `expectEvent`, `expectDocuments`, `expectTenantIsolation` |

Install in the app (example pins used with Convex 1.42.x):

```bash
pnpm add -D convex-test@0.0.54 @edge-runtime/vm
# or: bun add -d convex-test@0.0.54 @edge-runtime/vm
```

Choose `convex-test` from the [official peer range](https://www.npmjs.com/package/convex-test)
for your installed `convex` version — do not guess.

## Diagnostics and failure behavior

| Validator code                                               | Meaning                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------- |
| `RUNTIME_PROOF_MISSING_TEST`                                 | Status is `runtime_proven` but the test file is missing |
| `HANDWRITTEN_RUNTIME_CLAIM`                                  | `runtime_proven` without a `runtimeTest` path           |
| `VERSION_MISMATCH`                                           | Registry `manifestVersion` ≠ installed package version  |
| `PRESET_MISMATCH`                                            | Registry preset id/version ≠ app `manifestPreset`       |
| `UNKNOWN_COMMAND` / `UNKNOWN_TEST_PATH` / `REACTION_MISSING` | Registry references missing IR or files                 |

Product-decision statuses do not require a runtime test.

## Capsule reference pattern

Capsule (`C:\projects\Capsule`) demonstrates the first vertical slice:

1. `bun run proof:emit` — compile IR, write `generated/proof/*`
2. `bun run check:proof` — `assertProofRegistryValid`
3. Supply guard wraps `runManifestIntegrationGuard` with generated
   `guard.supply.json`
4. Runtime proof: `tests/proofs/ingredient-demand-confirm.runtime.test.ts`
   (`IngredientDemand_confirm` → `PurchaseNeed`)

Wire `proof:emit` + `check:proof` into the app's required `check` script so
stale registries fail CI.
