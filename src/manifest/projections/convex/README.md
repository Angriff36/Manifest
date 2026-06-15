# Convex projection

Projects Manifest IR to a [Convex](https://convex.dev) backend. **Phase 1**
emits the schema surface; functions and schedules are on the roadmap.

Design spec: `docs/superpowers/specs/2026-06-15-convex-projection-design.md`.

## Surface

| Surface | Output | Status |
|---|---|---|
| `convex.schema` | `convex/schema.ts` (`defineSchema`/`defineTable` + `convex/values` validators) | ✅ Phase 1 |
| `convex.functions` | queries + governed mutations | ⏳ Phase 2 |
| `convex.crons` / sagas / webhooks | `convex/crons.ts` etc. | ⏳ Phase 3 |

## Usage

```ts
import { getProjection } from '@angriff36/manifest/projections'; // or registry
const result = projection.generate(ir, { surface: 'convex.schema', options });
// result.artifacts[0].code → convex/schema.ts
```

## Type mapping (safe-default + per-property override)

| IR `type.name` | Convex validator | Note |
|---|---|---|
| `string`, `text`, `uuid` | `v.string()` | |
| `boolean`, `bool` | `v.boolean()` | |
| `int`, `bigint` | `v.int64()` | bigint — lossless for ids/counts |
| `float` | `v.number()` | author accepted rounding |
| `decimal`, `money` | `v.string()` | **lossless** exact-decimal transport |
| `date`, `datetime`, `time`, `duration` | `v.number()` | epoch ms (Convex-idiomatic) |
| `json` | `v.any()` | |
| `bytes` | `v.bytes()` | |
| `array<T>` | `v.array(<T>)` | |
| enum name | `v.union(v.literal(...))` | single value → `v.literal(...)` |
| `number` (bare) | — | hard `CONVEX_AMBIGUOUS_NUMBER` |
| unknown | — | hard `CONVEX_UNKNOWN_TYPE` |

Override per property: `typeMappings: { Entity: { prop: "v.number()" } }`.

## Behaviour

- **Computed properties** are never emitted as fields.
- The IR **`id`** property is dropped — Convex's document `_id` is identity.
- **Nullable** → unioned with `v.null()`; **non-required** → wrapped in `v.optional(...)`.
- **References** (`belongsTo`/`ref`): the non-tenant FK column is typed
  `v.id("<targetTable>")` (convexId mode, default). A property that *backs* a
  relationship is retyped to the reference rather than its declared scalar.
  Set `referenceMode: 'stringId'` to keep app-level string ids instead.
- **Indexes**: `indexed` properties, the tenant column, and every reference
  field get a `by_<col>` index; supply composite/named indexes via
  `indexes: { Entity: [["a","b"], { fields: ["sku"], name: "by_sku" }] }`.
- **Referential actions** (`onDelete`/`onUpdate`) have no schema-level Convex
  equivalent; they emit a `CONVEX_REFERENTIAL_ACTION_DEFERRED` info diagnostic
  (cascade logic belongs to the Phase 2 functions surface).
- **Tables**: Convex-idiomatic camelCase + pluralized by default
  (`CateringEvent` → `cateringEvents`); override via `tableMappings`.
- **Persistence filtering**: only entities with a `durable`/`postgres`/`supabase`
  store are emitted; `external` entities, mixins, and `memory`/`localStorage`
  stores are skipped.

## Options

See `options.ts` (`ConvexProjectionOptions`): `output`, `tableMappings`,
`typeMappings`, `indexes`, `references`, `referenceMode`, `naming`.

## Validation

The Phase 1 generator was validated against capsule's 199-table merged IR
(zero error diagnostics) and the emitted `convex/schema.ts` typechecks clean
against `convex@1.41` with `--strict`.
