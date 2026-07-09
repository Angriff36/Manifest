# Product wiring projection

**Name:** `wiring`  
**Surfaces:** `wiring.contract`, `wiring.bindings`, `wiring.all`

The product wiring layer turns compiled Manifest IR into a **machine-readable integration contract** and **safe binding helpers** so applications and coding agents can wire real UI to Manifest capabilities without guessing types, inventing lifecycle states, or sending server-owned identity fields from the browser.

This is **not** a UI generator. It does not emit pages, dashboards, layouts, styling, buttons, forms, copy, or product design. The application still owns presentation and workflow composition.

## What Manifest owns vs what the app owns

| Manifest owns | Application owns |
| --- | --- |
| Command truth, types, required/optional | Page layout and visual design |
| Input ownership (client vs server) | Whether an action is a button, menu, swipe, dialog, … |
| Statically known constraints | Wording and labels |
| Lifecycle transition metadata (when proven) | Information hierarchy |
| Safe binding generation + command invocation path | Workflow composition not declared in Manifest |
| Invalidation metadata | |
| Coverage truth (capabilities vs declared consumers) | Explicit consumer registry |

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

## Coverage validation

Applications declare intentional consumers in a registry:

```json
{
  "$schema": "manifest-wiring-consumers/v1",
  "consumers": [
    { "capabilityId": "Task.create", "disposition": "consumed" },
    { "capabilityId": "Task.archive", "disposition": "backend-only" },
    { "capabilityId": "Task.internalReconcile", "disposition": "deferred" }
  ]
}
```

Gate:

```bash
manifest wiring-coverage \
  --contract src/generated/manifest-wiring-contract.json \
  --consumers manifest/wiring-consumers.json \
  --strict
```

| Status | Defect? |
| --- | --- |
| `exposed` (consumed) | no |
| `backend-only` | no |
| `deferred` | no |
| `unwired` | yes |
| `stale-consumer` | yes |

Backend-only commands are never automatic defects.

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
- No inference of UI from source code
- No encoding of runtime-only guards as fake form rules
- No Capsule-Pro-specific field names or heuristics
