# Convex Projection — Design Spec

**Date:** 2026-06-15
**Status:** Phase 1 locked for implementation; Phases 2–4 are the north-star roadmap.
**Author:** brainstormed with user (Angriff36)

## 1. Goal & motivation

Add a first-class **Convex** projection target to Manifest, so a single Manifest
domain (entities, enums, commands, policies, constraints, events, reactions)
projects to a Convex backend the same way it currently projects to Prisma +
Next.js. The payoff Convex uniquely unlocks: because Convex queries are natively
reactive, governed writes produce client updates with **no outbox/SSE glue** —
the runtime's event/reaction system maps directly onto Convex reactivity.

This is **full repo integration**, following every existing projection
convention (registered in `builtins.ts`, exported subpath, conformance fixtures,
unit tests, `pnpm test` green).

## 2. North-star architecture (all phases)

Convex write governance uses **runtime delegation** (decided; the alternative —
re-rendering guards/policies as inline TS — violates the projection boundary
rule "projections are tooling, not semantics" and duplicates the runtime). Every
existing write-capable projection (express/nextjs/hono) already delegates writes
to `runtime.runCommand(...)` and only reads touch the DB directly. Convex follows
the same contract.

Surfaces (mirroring `prisma` + `prisma-store` + `nextjs`):

| Surface | Output | Analogous to | Phase |
|---|---|---|---|
| `convex.schema` | `convex/schema.ts` (`defineSchema`/`defineTable` + `v.*`) | prisma.schema | **1** |
| `convex.functions` | `convex/<entity>.ts` (`query` reads + `mutation` writes → runtime) | nextjs routes | 2 |
| `convex.store` | `ConvexStore` runtime adapter over `ctx.db` | prisma-store | 3 |
| `convex.crons` + sagas/webhooks | `convex/crons.ts` etc. | nextjs.schedule | 4 |

Reactions are **not** re-generated per target. They fire through the existing
runtime reaction engine inside the governed mutation (Phase 2/3); Convex
reactivity then delivers the resulting query updates. No outbox table.

## 3. Phase 1 — `convex.schema` (this spec)

### 3.1 Scope

A `ConvexProjection` implementing `ProjectionTarget` with the single surface
`convex.schema`, emitting one artifact: `convex/schema.ts`.

Self-contained, independently shippable, no dependency on Phases 2–4.

### 3.2 Module layout (mirrors `projections/prisma/`)

```
src/manifest/projections/convex/
  generator.ts        # ConvexProjection class + emit logic
  options.ts          # ConvexProjectionOptions + normalizeOptions + defaults
  type-mapping.ts     # IR type.name -> Convex validator
  index.ts            # re-exports
  generator.test.ts   # unit tests
  README.md
```

### 3.3 Output shape

```ts
// convex/schema.ts  (GENERATED — do not edit)
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  recipe: defineTable({
    name: v.string(),
    status: v.union(v.literal("draft"), v.literal("published")),
    servings: v.int64(),
    price: v.string(),                 // decimal -> lossless string
    authorId: v.id("user"),            // belongsTo author -> User
    tenantId: v.string(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_author", ["authorId"]),
  // ...
});
```

### 3.4 Type mapping (safe-default + per-property override)

Mirrors the Prisma table's philosophy: an explicit, no-fallback interpreter of
Manifest's open type vocabulary. Unknown `type.name` with no override → **hard
`CONVEX_UNKNOWN_TYPE` diagnostic** (no guessing). Bare `number` → **hard
`CONVEX_AMBIGUOUS_NUMBER` diagnostic** (same rationale as Prisma: ambiguous
between int/float/money).

| IR `type.name` | Convex validator | Note |
|---|---|---|
| `string`, `text`, `uuid` | `v.string()` | |
| `boolean`, `bool` | `v.boolean()` | |
| `int`, `bigint` | `v.int64()` | bigint — lossless for ids/counts |
| `float` | `v.number()` | author opted into rounding |
| `decimal`, `money` | `v.string()` | **lossless**; numeric override available |
| `date`, `datetime`, `time` | `v.number()` | epoch ms (Convex-idiomatic); override for ISO string |
| `duration` | `v.number()` | |
| `json` | `v.any()` | structured override available |
| `bytes` | `v.bytes()` | |
| `number` (bare) | — | hard diagnostic |
| unknown | — | hard diagnostic |

Override via `typeMappings: { Entity: { prop: "v.number()" } }` — the value is the
literal validator expression, mirroring Prisma's `typeMappings`.

### 3.5 Property modifiers / nullability

- `optional` modifier → wrap field in `v.optional(...)` (field may be absent).
- `type.nullable` → union the validator with `v.null()`.
- both → `v.optional(v.union(<x>, v.null()))`.
- `computed` properties → **never emitted** (iterate `entity.properties` only,
  never `entity.computedProperties` — structural guarantee, same as Prisma).

### 3.6 Relationships → references

- `belongsTo` / `ref` → emit an id field `<fkName>: v.id("<targetTable>")`, where
  `fkName` defaults to `${relationshipName}Id` (or `relationship.foreignKey.fields[0]`
  if present) and `targetTable` is the resolved Convex table name of the target.
- `hasMany` / `hasOne` → **no column** (the FK lives on the other side), but emit a
  back-reference `.index("by_<fk>", ["<fk>"])` on the target table when discoverable.
- `onDelete` / `onUpdate` referential actions → **not** schema-level in Convex
  (document store). They become cascade logic the runtime runs in the delete
  command (Phase 2/3). Phase 1 records them as an `info` diagnostic noting they're
  deferred to the functions layer.

### 3.7 Indexes

- Each `indexed` property → `.index("by_<col>", ["<col>"])`.
- Tenant property (from `ir.tenant`) → `.index("by_tenant", ["<tenantProp>"])`.
- Each emitted reference field → `.index("by_<fkName>", ["<fkName>"])`.
- Composite/named indexes via `options.indexes: { Entity: [["a","b"], {fields,name}] }`
  (same shape as Prisma's `indexes`).
- Index names deduped deterministically; collisions resolved by suffixing.

### 3.8 Enums

`v.union(v.literal("A"), v.literal("B"), ...)`; single-value enum → `v.literal("A")`.
Value **names** are authoritative (labels/ordinals are UI hints, dropped — same as
Prisma). Phase 1 emits **only** `convex/schema.ts` (single-artifact contract);
exported TS union types per enum are deferred to the types surface in Phase 4.

### 3.9 Entity / store filtering

Mirror Prisma exactly:
- `external: true` entities → skipped.
- Stores with target `memory` / `localStorage` → skipped.
- Persistent targets (`durable`, `postgres`, `supabase`, and a custom `convex`
  target) → emitted. Entities with no store entry → skipped (no implicit ownership).

### 3.10 Table naming

Default: table name = entity IR name **verbatim** (back-compatible, like Prisma).
Options bag provides:
- `tableMappings: { Entity: "physical_name" }` (explicit override, always wins).
- `naming: 'snake_case' | { table, column, pluralizeTables }` (convention; only
  changes the physical table key). Same shape/semantics as Prisma's `naming`.

### 3.11 Options surface (`ConvexProjectionOptions`)

Nested `Record<Entity, Record<Property, X>>` shape throughout (no dotted keys),
matching the Prisma options invariant:

```ts
interface ConvexProjectionOptions {
  output?: string;                 // default "convex/schema.ts"
  tableMappings?: Record<EntityName, string>;
  typeMappings?: Record<EntityName, Record<PropertyName, string>>; // literal validator
  indexes?: Record<EntityName, IndexEntry[]>;
  references?: Record<EntityName, Record<string, string>>; // override fk field name
  naming?: NamingConventionInput;
}
```

`normalizeOptions(raw)` funnels the wire `Record<string,unknown>` into a typed,
defaulted object (single trust boundary), exactly like Prisma.

### 3.12 Diagnostics

- `CONVEX_UNKNOWN_TYPE` (error) — unknown `type.name`, no override.
- `CONVEX_AMBIGUOUS_NUMBER` (error) — bare `number`.
- `CONVEX_REFERENTIAL_ACTION_DEFERRED` (info) — onDelete/onUpdate noted for Phase 2.
- `CONVEX_EMPTY_SCHEMA` (warning) — no persistent entities found.

### 3.13 Registration & exports

- Add `ConvexProjection` to `registerBuiltinProjections()` and
  `listBuiltinProjections()` in `builtins.ts`.
- Add `./projections/convex` export subpath to `package.json` `exports` (pointing
  at `dist/manifest/projections/convex/generator.{d.ts,js}`).

## 4. Testing (Phase 1 "done")

1. **Unit tests** (`generator.test.ts`): each type mapping; nullable/optional;
   enum union; reference id field + back-index; computed exclusion; entity/store
   filtering; tableMappings + naming; every diagnostic path; deterministic output.
2. **Conformance**: add a `.manifest` fixture exercising entities/enums/refs/
   indexes/tenant/soft-delete; generate `convex/schema.ts`; commit expected output
   under the projection snapshot suite (follow the existing
   `projections/snapshot.test.ts` pattern).
3. `pnpm test` green (630+), `pnpm run typecheck` clean, `pnpm run lint` clean.

## 5. Definition of Done (Phase 1)

- `convex.schema` registered, exported, generating valid `convex/schema.ts`.
- All type/relationship/index/enum/filtering paths covered by tests.
- Diagnostics emitted for every error/info/warning path above.
- Determinism: identical IR + options → byte-identical output.
- `pnpm test` / `typecheck` / `lint` all green.
- README documents the surface, options bag, and type table.
- Spec/impl aligned; deferred behavior (referential actions, functions, store)
  explicitly marked as Phase 2+.

## 6. Out of scope for Phase 1 (roadmap)

- `convex.functions` (queries + governed mutations) — Phase 2.
- `ConvexStore` runtime adapter — Phase 3 (pins exact store interface from
  `prisma-store/persistence.ts`).
- Schedules → `convex/crons.ts`, sagas, webhooks, client/types/hooks — Phase 4.
- Release (`cut-release`) — after the phase(s) the user chooses to ship together.
