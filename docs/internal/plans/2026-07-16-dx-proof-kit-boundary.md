# DX Proof Kit — dependency boundary

**Created:** 2026-07-16  
**Updated:** 2026-07-16  
**Status:** Binding for the first vertical slice (IngredientDemand_confirm → PurchaseNeed)

**User-facing guide (usage, not ownership):** [`docs/guides/dx-proof-kit.md`](../../guides/dx-proof-kit.md)  
**Mintlify:** `mintlify/integration/dx-proof-kit.mdx`

## Ownership

| Surface                                                          | Owner    | Notes                                                                    |
| ---------------------------------------------------------------- | -------- | ------------------------------------------------------------------------ |
| Capability catalog + proof-registry schemas/emit/validate        | Manifest | Derived from IR + projection metadata; never hand-maintained inventories |
| Integration guard engine                                         | Manifest | App supplies feature roots / exceptions / rollout only                   |
| `@angriff36/manifest/proof-kit`                                  | Manifest | Core APIs; **must not** import `convex-test`                             |
| `@angriff36/manifest/proof-kit/convex-test`                      | Manifest | Optional adapter; `convex-test` + `convex` are optional peers            |
| Runtime proof cases, scenario fixtures, product-decision markers | Capsule  | Application-owned                                                        |
| Feature-root guard wrappers                                      | Capsule  | Thin config over Manifest engine (Supply first)                          |

## Dependency rule

- Capsule installs `convex-test` (and `@edge-runtime/vm`) as **devDependencies**.
- Compatible pin for Capsule’s installed Convex **1.42.x**: `convex-test@0.0.54` (official peer `convex@^1.32.0`).
- Importing `@angriff36/manifest` or `@angriff36/manifest/proof-kit` must succeed with **no** `convex-test` installed.
- Only `@angriff36/manifest/proof-kit/convex-test` may reference `convex-test`.

## Vertical slice (this pass)

`IngredientDemand.confirm` → emit `IngredientDemandConfirmed` → reaction `PurchaseNeed.create`.

Deferred: Event/Culinary guard migration, broad reaction rollout, Explorer, Builder, receipt→stock.

## Capsule consumption (vertical slice)

~~Until `@angriff36/manifest` is cut-released with `./proof-kit`, Capsule may pin
`file:../Manifest` locally to consume the new subpaths. After cut-release, pin
the published exact version again (no `^`).~~

**Correction (2026-07-16):** Published in `@angriff36/manifest@3.6.13`
(`[release] v3.6.13` / tag `v3.6.13`). Capsule must pin the exact version
`3.6.13` (no `^`).
