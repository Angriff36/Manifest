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

**Governance-lane decision (revised after reviewing Hermes' PoC):** the write-
governance approach is decided **per phase**, and it only bites at Phase 2
(command → mutation). Phase 1 (schema) is identical either way.

Two lanes were considered:
- **Runtime delegation** — mutations call the Manifest `RuntimeEngine`. This is
  how express/nextjs/hono work, but those run in a *Node server you control*.
- **Inline codegen** — guards/policies/constraints are rendered as TS directly
  in each Convex function, with no runtime dependency.

Convex functions execute in **Convex's own managed runtime**, not a server we
own, so importing the full Manifest runtime + a `ctx.db`-backed store into every
mutation is heavy and of uncertain feasibility. Hermes' PoC already proves the
**inline-codegen** path compiles. **Decision: Phase 2 uses inline codegen**, with
the governance-rendering isolated behind a clean seam so a future runtime-
delegation variant can be swapped in without touching schema/query emission.
This keeps generated Convex code self-contained (Convex-idiomatic) while still
honouring IR semantics — the projection renders the IR's guards/policies/
constraints faithfully and does not invent new ones.

Surfaces (mirroring `prisma` + `prisma-store` + `nextjs`):

| Surface | Output | Analogous to | Phase |
|---|---|---|---|
| `convex.schema` | `convex/schema.ts` (`defineSchema`/`defineTable` + `v.*`) | prisma.schema | **1** |
| `convex.functions` | `convex/<entity>.ts` (`query` reads + `mutation` writes, inline IR-governance) | nextjs routes | 2 |
| `convex.crons` + sagas/webhooks | `convex/crons.ts` etc. | nextjs.schedule | 3 |

Reactions are rendered inline: a governed mutation emits its event row then runs
the IR's matched reactions (resolve + params from the reaction AST) before
returning. Convex reactivity delivers the resulting query updates to clients —
**no outbox/SSE table needed**. (The PoC stubbed non-`create` reactions; this
projection completes them.)

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

Default: **Convex-idiomatic** pluralized camelCase (e.g. `CateringEvent` →
`cateringEvents`, `Dish` → `dishes`). This intentionally differs from Prisma's
verbatim default because Convex convention is plural camelCase table keys, and it
keeps output diffable against the PoC. Resolution order:
- `tableMappings: { Entity: "physical_name" }` (explicit override, always wins).
- `naming` convention (reuse `shared/naming` where it fits; Convex needs
  lower-camel-first + pluralize, so a small `convexTableName(entityName)` helper
  owns the default — irregular plurals fall back to `tableMappings`).
- All `v.id("...")` reference targets resolve through the **same** table-name
  function so references always point at the real emitted table key.

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

## 5b. Validation & collaboration (projection-from-source)

This is being built **independently and in parallel** with Hermes' proof-of-concept
generator, for blind-spot coverage and pattern comparison. Merge strategy:
whichever generator compiles + runs against real Convex tooling wins as the base;
good ideas are cherry-picked from the other.

Non-negotiable for an apples-to-apples comparison: **generate from the same IR,
not hand-modeled entities.** Source of truth for validation runs is capsule's
merged IR at `C:/Projects/capsule-pro/manifest/ir/kitchen.ir.json` (the
`compileProjectToIR` output — 210+ entities, the same source Hermes projects
from). The projection itself is generic over any `IR`; the conformance fixture is
a small purpose-built `.manifest`, but the **integration/validation pass** runs
the projection over `kitchen.ir.json` and:

1. Typechecks the emitted `convex/schema.ts` against real Convex packages
   (`convex/server`, `convex/values`) — ideally `npx convex dev` / `tsc` in a
   scratch Convex app — to catch validator/signature bugs the unit tests can't.
2. Diffs structure against Hermes' PoC output to surface divergences (enum union
   handling, reference/`v.id` shape, tenancy, index naming).

Validator mapping is grounded in current Convex docs (confirmed: `v.id(table)`,
`v.null()`, `v.int64()`=Int64, `v.number()`=Float64, `v.boolean()`, `v.string()`,
`v.bytes()`, `.index("by_x", ["x"])`). Pull Convex docs via Context7
(`/get-convex/convex-backend`) whenever an emission detail is uncertain rather
than guessing. (`manifest-lab` with Hermes' generator lives on the user's other
machine — `ssh oc@100.86.15.13` — available if a direct side-by-side is needed.)

## 5c. Phase 2 design decisions (`convex.functions`)

Locked decisions for the functions surface (queries + governed mutations +
reactions), informed by Hermes' PoC at `manifest-lab/scripts/generate-convex.mjs`:

- **Expression resolver** (`convex/expression.ts`): a pure IR-expression → TS
  renderer. Reuse Hermes' battle-tested operator/builtin map verbatim (the part
  that took 5 rounds to get right): `now`→`Date.now()`, `uuid`→
  `crypto.randomUUID()`, `addDays(d,n)`, `percent(a,b)`→`(a/b)*100` /
  `percent(a)`→`a/100`, `between(x,lo,hi)`→`(x>=lo && x<=hi)`,
  `removeTagFromString`; operators `in`→`right.includes(left)`, `contains`/
  `notContains`, `or`/`and`/`==`/`!=` → `||`/`&&`/`===`/`!==`; unary `not`→`!`.
  Scopes: `self.x`/bare identifier → `doc.x`; `payload.x` preserved; literals
  rendered exactly (note: literal `0`/`false`/`""` are valid, not "missing").
- **Fail CLOSED on governance** (divergence from PoC). The PoC returns `"true"`
  for any expression it cannot resolve, so unparseable guards/policies silently
  pass — a security bypass that violates house style ("no permissive defaults").
  Instead: an unresolved guard/policy/constraint emits a hard
  `CONVEX_UNRESOLVED_GUARD` / `_POLICY` / `_CONSTRAINT` **diagnostic** at
  generation time AND renders a `throw` (deny) so the gap is loud, not open.
  Non-governance expressions (mutate targets, reaction params) may render a
  best-effort value with an info diagnostic.
- **Mutations** (`convex/<module-or-all>.ts`): one `mutation` per IR command.
  - `create`: args from entity properties (FK args typed `v.id("<targetTable>")`
    to match the Phase-1 schema, not `v.string()`); insert; emit event row;
    run matched reactions.
  - non-`create`: arg `docId: v.id("<table>")` + command params; load doc;
    run policies → guards → constraints (fail-closed order mirrors the runtime:
    policies → guards → actions → emits); `ctx.db.patch`; emit; reactions.
  - Role hierarchy from `ir.roles[].effectivePermissions` → a `checkRole()` map;
    `roleAllows(user.role, X)` → `checkRole(userRole, X)`.
- **Queries** (`convex/queries.ts`): `list<Entity>`, `get<Entity>`, and
  `list<Entity>By<Field>` for each indexed/reference field (uses `withIndex`).
  Reads bypass governance (reads are not governed mutations), tenant/soft-delete
  filterable.
- **Reactions**: complete the PoC's stubs. `create`-target reactions →
  `ctx.db.insert(targetTable, {params})` with params resolved from the reaction
  AST; non-`create` reactions resolve the target id and invoke the patch with
  mapped params (no `// TODO` left behind), each emitting a diagnostic if a
  param can't be resolved.
- **Surfaces emitted as separate artifacts**: `convex.schema` (Phase 1),
  `convex.queries`, `convex.mutations` (or a single `convex.functions` umbrella
  returning multiple artifacts). Decide during impl; keep each file regenerable.

## 6. Out of scope for Phase 1 (roadmap)

- `convex.functions` (queries + inline-governed mutations + complete reactions) — Phase 2.
- Schedules → `convex/crons.ts`, sagas, webhooks, client/types/hooks — Phase 3.
- Release (`cut-release`) — after the phase(s) the user chooses to ship together.
