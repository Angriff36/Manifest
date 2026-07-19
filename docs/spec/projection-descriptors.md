# Projection Descriptors

Last updated: 2026-07-19
Status: Active
Authority: Binding

Builder-facing contract for **how** to invoke a registered projection.
Published from `@angriff36/manifest/projections`.

## Registered vs safely invokable

| Concept | Meaning |
|---|---|
| **Registered** | Present in the projection registry (`listProjections` / `getProjection`). Has a name, description, and surfaces. |
| **Safely invokable** | `describeProjection(name).safelyInvokable === true`: every surface has resolved scope, and the options schema is declared. Builder must not invent options or guess entity/command requirements when this is false. |

Registration alone never implies safe invocation. Use
`validateProjectionInvocation(name, request)` before calling `generate`.

## Public API

```ts
import {
  describeProjection,
  listProjectionDescriptors,
  validateProjectionInvocation,
  UnknownProjectionError,
  type ProjectionDescriptor,
} from '@angriff36/manifest/projections';
```

- `describeProjection(name)` — throws `UnknownProjectionError` (`code: 'UNKNOWN_PROJECTION'`) when the name is not registered.
- `listProjectionDescriptors()` — one descriptor per registered projection (parity-tested).
- `validateProjectionInvocation(name, { surface, entity?, command?, options? })` — blocks missing required scope/options and unresolved descriptors.

## Descriptor schema (fields)

| Field | Source |
|---|---|
| `name`, `description`, `surfaceIds` | `ProjectionTarget` |
| `displayName`, per-surface `scope` / `requiresEntity` / `requiresCommand`, options, prerequisites, artifact categories, package/runtime deps, companions, incompatibilities | `ProjectionTarget.descriptorMeta` beside the owning projection |
| `capabilities` | `ProjectionTarget.capabilities` via `getProjectionCapabilities` (undeclared → `declared: false`, not “supports nothing”) |
| `safelyInvokable` | `descriptorMeta.resolved &&` surface ids cover the target exactly |

Capability maps are **not** a substitute for this contract; they are connected as the `capabilities` groups on the same descriptor.

## How projection authors declare meta

1. Add `descriptor-meta.ts` next to the projection generator.
2. Export a `ProjectionDescriptorMeta` using helpers from `descriptor-helpers.ts`.
3. Set `readonly descriptorMeta = …` on the `ProjectionTarget` class.
4. Set `resolved: true` only when every surface’s scope and the options list are proven from `generate()` / `normalizeOptions`.
5. Leave `compatibleCompanions` / `incompatibleWith` empty unless contracts are known to align.
6. Parity tests fail if a registered projection omits `descriptorMeta` or if descriptor names drift from the registry.

## Semver expectations

Descriptor API lives on the stable `./projections` subpath (`docs/spec/sdk-stability.md`).

- **Breaking** (breaking-tier bump): removing/renaming fields; changing a surface’s scope or required entity/command; making a previously optional option required; flipping `safelyInvokable` from true → false for a projection Builder already treats as complete.
- **Additive** (feature/fix-tier bump): new optional fields; new optional options; newly resolved projections (`safelyInvokable` false → true); new companion evidence.

Consumers must pin exact `@angriff36/manifest` versions.

## How Builder should consume

1. Import only `@angriff36/manifest/projections` (never internal `src/` paths).
2. List descriptors for UI; call `describeProjection` for a selection.
3. Gate generate on `validateProjectionInvocation` (or equivalent checks on `safelyInvokable` + required scope/options).
4. Render undeclared capability matrices as “undeclared”, never “unsupported”.
5. Do not reconstruct scope/options from markdown or heuristics when Manifest has not published them.
