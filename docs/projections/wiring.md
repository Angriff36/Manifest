# Product wiring projection

**Name:** `wiring`  
**Surfaces:** `wiring.contract`, `wiring.bindings`, `wiring.all`

The product wiring layer turns compiled Manifest IR into a **machine-readable integration contract** and **safe binding helpers** so applications and coding agents can wire real UI to Manifest capabilities without guessing types, inventing lifecycle states, or sending server-owned identity fields from the browser.

This is **not** a UI generator. It does not emit pages, dashboards, layouts, styling, buttons, forms, copy, or product design. The application still owns presentation and workflow composition.

## What Manifest owns vs what the app owns

| Manifest owns                                     | Application owns                                      |
| ------------------------------------------------- | ----------------------------------------------------- |
| Command truth, types, required/optional           | Page layout and visual design                         |
| Input ownership (client vs server)                | Whether an action is a button, menu, swipe, dialog, … |
| Statically known constraints                      | Wording and labels                                    |
| Lifecycle transition metadata (when proven)       | Information hierarchy                                 |
| Safe binding generation + command invocation path | Workflow composition not declared in Manifest         |
| Invalidation metadata                             |                                                       |
| Coverage truth (automatic inspect + overrides)    | Explicit overrides for backend-only / deferred        |

## Generate

```bash
manifest generate -p wiring --surface all
# or
manifest generate -p wiring --surface wiring.contract
manifest generate -p wiring --surface wiring.bindings
```

Artifacts (defaults):

- `src/generated/manifest-wiring-contract.json` — one descriptor per entity command
- `src/generated/manifest-wiring-bindings.ts` — client input types + bind helpers

## Contract shape (per command)

Each capability answers:

1. Inputs accepted (names, TS types, required/optional, nullable, array element type)
2. Enum / finite values when statically derivable
3. Numeric/string constraints when statically derivable (from command constraints)
4. Server-owned vs client-owned parameters
5. Route / dispatcher identity
6. Instance vs create/static
7. Return type, emits, affected entity
8. Lifecycle transitions when proven from `transition` + literal `mutate`
9. Recommended invalidation targets (entity list + detail)
10. Structured error states the caller must handle

Anything not statically provable is omitted or left unconstrained — the contract never invents Active/Inactive or other product fiction.

## Trusted server-owned inputs

Declare ownership in Manifest with the same `from context.*` grammar as `tenant`:

```manifest
command markCompleted(completedBy: string from context.actorId) {
  mutate completedBy = completedBy
  mutate completed = true
}
```

Effects:

- Compiler records `IRParameter.trustedSource` (e.g. `context.actorId`)
- Client input types **omit** the field
- Runtime strips spoofed client values and injects from `RuntimeContext` before gates
- Missing required trusted context fails closed with `MISSING_TRUSTED_CONTEXT`

Do **not** rely on naming heuristics (`*UserId`). Only an explicit `from context.*` (or IR `trustedSource`) marks a parameter as server-owned.

## Automatic application consumer inspection

**Manifest does not design the interface.**  
**Manifest proves whether application code correctly consumes declared capabilities.**

Primary coverage truth comes from inspecting application source against the wiring contract. The explicit consumer registry is an **override/fallback**, not the primary source of truth — use it for backend-only, deferred, and accepted ambiguous cases that static analysis cannot prove.

```bash
manifest wiring-inspect \
  --contract src/generated/manifest-wiring-contract.json \
  --root apps/app \
  --root apps/api \
  --overrides manifest/wiring-overrides.json \
  --strict
```

### Supported trace forms (Next.js App Router)

| Trace                   | Counts as consumed when                                        |
| ----------------------- | -------------------------------------------------------------- |
| Direct generated client | UI calls `entityCommand(...)`                                  |
| Direct `executeCommand` | UI calls `executeCommand("Entity", "cmd", …)`                  |
| Server action           | UI uses/calls action → `runManifestCommand`                    |
| API route               | UI `apiFetch`/`fetch` → route → service → `runtime.runCommand` |
| Server action + API     | UI → action → `apiFetch` → route → runtime                     |
| Imported helper         | UI calls helper → Manifest client or API chain                 |

Import-only actions, dead/unreferenced actions, generated definitions, tests, and docs are **not** consumers by default.

### Coverage classifications

| Status           | Meaning                               | Default defect?               |
| ---------------- | ------------------------------------- | ----------------------------- |
| `consumed`       | Reachable application consumer proven | only if contract mismatch     |
| `unwired`        | No consumer, no override              | only with `--strict-coverage` |
| `backend-only`   | Explicit override                     | no                            |
| `deferred`       | Explicit override                     | no                            |
| `stale-consumer` | App references nonexistent capability | **yes**                       |
| `ambiguous`      | Potential evidence, chain unproven    | no                            |

### Contract mismatch diagnostics (static only)

Reported when evidence is strong:

- missing required client input
- wrong input shape (e.g. `.join(",")` where `string[]` required)
- invalid finite literal (enum / numeric range)
- required date sent as `""`
- client-supplied trusted (`from context.*`) field
- stale capability reference

Uncertain cases stay `ambiguous` — never invented defects.

### CI gate

`--fail-on stale-consumer,contract-mismatch,unwired` (comma-separated).  
Defaults: fail on `stale-consumer` and `contract-mismatch`. Ambiguous never fails by default. Backend-only is never an automatic failure.

### Explicit overrides (optional)

```json
{
  "$schema": "manifest-wiring-consumers/v1",
  "consumers": [
    { "capabilityId": "Task.archive", "disposition": "backend-only" },
    { "capabilityId": "Task.internalReconcile", "disposition": "deferred" }
  ]
}
```

### Framework support / limitations

**Supported (v1):** TypeScript/TSX, Next.js App Router, server actions, generated Manifest clients, `executeCommand`, `runManifestCommand`, API routes, imported helpers, dynamic `[id]` routes.

**Performance:** Full Capsule-Pro-scale scans (`apps/app` + `apps/api`, ~10k source files, ~1k capabilities) are designed to complete in well under a minute on a developer machine. The inspector uses indexed import resolution, parallel source loading, stubbed generated bulk files, and memoized module-intent extraction. Include/exclude filters remain available for focused debugging, but are **not required** for a repo-wide gate.

**Not supported yet:** other frontend frameworks, proving arbitrary runtime behavior, inferring UI intent from CSS/button copy alone. Large `unwired` counts are expected until applications supply backend-only/deferred overrides — that is coverage truth, not a performance failure.

Library entry: `@angriff36/manifest/projections/wiring` → `inspectWiringConsumers`.

## Registry-only coverage (legacy / override gate)

`manifest wiring-coverage` still compares contract ↔ explicit registry when you want a declaration-only gate without source inspection:

```bash
manifest wiring-coverage \
  --contract src/generated/manifest-wiring-contract.json \
  --consumers manifest/wiring-consumers.json \
  --strict
```

## End-to-end example

**Manifest**

```manifest
entity Ingredient {
  property required id: string
  property name: string = ""
  property allergens: string[] = []
  property createdBy: string = ""

  command create(
    name: string,
    allergens: array<string>,
    createdBy: string from context.actorId
  ) {
    constraint nameOk: length(name) >= 1 "name required"
    mutate name = name
    mutate allergens = allergens
    mutate createdBy = createdBy
  }

  store Ingredient in memory
}
```

**Generated contract (excerpt)**

- `allergens.tsType` → `string[]` (not `string`)
- `name.constraints.nonEmpty` → `true`
- `createdBy.ownership` → `server`, `trustedSource` → `context.actorId`
- `invalidation` → entity list + detail query-key hints

**Application consumption**

```ts
import {
  bindIngredientCreateInput,
  type IngredientCreateClientInput,
  IngredientCreateInvalidation,
} from '@/generated/manifest-wiring-bindings';

// UI builds only client fields — never createdBy
const client: IngredientCreateClientInput = {
  name: form.name,
  allergens: form.allergens, // string[]
};

// Server route: inject trusted context, then runCommand
const input = bindIngredientCreateInput(client, {
  createdBy: runtimeContext.actorId!,
});
await runtime.runCommand('create', input, { entityName: 'Ingredient' });
// On success: invalidate IngredientCreateInvalidation targets
```

The app chooses whether create is a form, sheet, or voice flow. Manifest only guarantees the contract.

## Deliberate non-goals

- No generated pages, buttons, or form widgets
- No redesign of application UX from inspection results
- No encoding of runtime-only guards as fake form rules
- No Capsule-Pro-specific field names or hardcoded entity paths
- No claiming duplicate product models without strong read/write evidence
