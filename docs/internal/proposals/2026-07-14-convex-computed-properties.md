# Convex projection — computed properties (M4)

**Date:** 2026-07-14
**Status:** Accepted for implementation
**Scope:** Projection-only. IR / grammar / schema unchanged.

## Problem

Computed properties are correctly excluded from Convex schema storage, but the
projection previously emitted nothing that materializes them. Apps either
re-derived values by hand or lost them — training agents to bypass Manifest.

## Decision

| Option                                  | Shape                                                           | Trade-off                                                                                                                      |
| --------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **(a) Helpers module** (chosen default) | `convex/computed.ts` with `compute<Entity>(doc)` pure functions | App/query code calls helpers; no extra DB reads; relation aggregates stay unresolved until expressed via reaction count params |
| **(b) Inline in reads**                 | Merge resolved computeds into `get`/`list` returns              | Convenient; relation-dependent computeds need indexed reads                                                                    |
| **(c) Both**                            | Gated by `projections.convex.options.computedProperties`        | `'helpers' \| 'inline'` — no `'off'` that silently drops                                                                       |

**Default:** `computedProperties: 'helpers'`.

Unresolved expressions emit `CONVEX_UNRESOLVED_COMPUTED` (warning) and are
omitted from the helper — never a silent success. Self-only expressions are
the supported set in this phase; relation/lambda/aggregate nodes fail loud.

## Config

```yaml
projections:
  convex:
    options:
      computedProperties: helpers   # or inline
```

Passed verbatim through `additionalProperties: true` — no config-schema change.

## Non-goals

- Storing computed values in tables
- Honoring `cache request|session|ttl` (diagnostic: `CONVEX_UNSUPPORTED_COMPUTED_CACHE`)
- Changing IR shape
