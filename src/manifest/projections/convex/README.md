# Convex projection

Projects Manifest IR to a [Convex](https://convex.dev) backend. **Phase 1**
emits the schema surface; functions and schedules are on the roadmap.

Design spec: `docs/superpowers/specs/2026-06-15-convex-projection-design.md`.

## Surface

| Surface            | Output                                                                         | Status     |
| ------------------ | ------------------------------------------------------------------------------ | ---------- |
| `convex.schema`    | `convex/schema.ts` (`defineSchema`/`defineTable` + `convex/values` validators) | ✅ Phase 1 |
| `convex.queries`   | `convex/queries.ts` (`list`/`get`/`listBy<Field>` reactive reads)              | ✅ Phase 2 |
| `convex.mutations` | `convex/mutations.ts` (governed `mutation` per command)                        | ✅ Phase 2 |
| `convex.crons`     | `convex/crons.ts` (`cronJobs()` scheduling command mutations)                  | ✅ Phase 3 |
| `convex.http`      | `convex/http.ts` (`httpRouter`/`httpAction` webhooks → commands)               | ✅ Phase 3 |
| `convex.sagas`     | `convex/sagas.ts` (orchestrator `action`s + compensation)                      | ✅ Phase 3 |

## Orchestration surfaces (Phase 3)

- **`convex.crons`** — each IR schedule → `crons.cron(id, "<cron>", api.mutations.<E>_<cmd>, params)`
  or `crons.interval(id, { minutes }, ...)`; params resolved from the schedule AST.
- **`convex.http`** — each IR webhook → `http.route({ path, method, handler: httpAction })`
  that reads `request.json()`, maps `transform` params against `body`, and
  `ctx.runMutation`s the command.
- **`convex.sagas`** — each IR saga → an orchestrator `action` that runs steps
  via `ctx.runMutation`, tracks completed steps, and (when `onFailure:
compensate`) runs each completed step's compensating command in reverse.
  `onFailure: abort` rethrows without compensation. Step argument mapping is not
  in the saga IR, so a single `input` payload is forwarded to each step.

All three typecheck against real `convex@1.41`.

## Functions surfaces (Phase 2)

`convex.queries` emits reactive reads (`list<E>`, `get<E>`, `list<E>By<Field…>`
over `.withIndex`, FK args typed `v.id`). Reads are not governed, but `list`/`get`
are **tenant-scoped + soft-delete-filtered by default** (see below).

- **Index parity:** every schema index gets a matching read — `indexed`
  properties, the tenant column, every reference FK (in BOTH `convexId` and
  `stringId` modes), and composite `options.indexes` entries
  (`list<E>By<A>And<B>`, multi-arg `.eq` chain). The single-field/reference set
  is derived from the same helper the schema uses (`collectReferenceFields`), so
  the two surfaces cannot drift.
- **Events table:** when emitted, `listRecentEvents` plus indexed lookups
  `listEventsByType` / `listEventsByEntity` / `listEventsByEntityId`.
- **Read filtering (field-aware, default on):** `list<E>` / `get<E>` are scoped
  to the current tenant — the tenant id is read from `ctx.auth.<tenantProp>`,
  **never a client arg**, so an un-scoped list fails closed (no auth → no rows)
  rather than leaking across tenants. `get<E>` returns `null` on a tenant
  mismatch or a soft-deleted row. `list<E>By<Field…>` reads drop soft-deleted
  rows and apply the auth tenant filter unless the index already constrains the
  tenant column. Toggle with `includeTenantFilter` / `includeSoftDeleteFilter`;
  override names with `tenantIdProperty` / `deletedAtProperty`. Mirrors the
  Next.js projection.

`convex.mutations` emits one `mutation` per IR command:

- **Governance is inline and FAIL CLOSED.** Each command runs its policies →
  guards → constraints (runtime order), rendered from IR by a pure
  expression resolver. Anything the resolver cannot map emits a hard
  `CONVEX_UNRESOLVED_{POLICY,GUARD,CONSTRAINT}` diagnostic **and** a denying
  `throw` — never a silent pass. (Measured: 100% of capsule's 2545 governance
  expressions resolve.)
- **Roles** become a `ROLE_PERMISSIONS` map + `checkRole()` (with `all`
  wildcard); `roleAllows(user.role, X)` → `checkRole(userRole, X)`.
- **create** commands: args are the command _parameters_; `mutate` actions map
  params → stored fields; guards reference the parameters.
- non-**create**: `docId: v.id(table)` + params; load, govern, `patch`.
- Each mutation appends an **event row** (to the `events` table) and fires
  matched **reactions** (create-target → insert; other → resolve + patch — the
  PoC's `// TODO` stubs are completed).
- **G7 emit payloads** (`emit Event { field: expr }`): declared event fields are
  evaluated against the post-action instance and populated into each event row's
  `payload` and the shared reaction payload — so a reaction on a MUTATE command
  can read entity-owned/computed fields (`payload.invoiceId`, `payload.total`)
  instead of finding them `undefined`. This is the fix that lets cross-entity
  cascades be declared as reactions rather than hand-written as after-emit
  middleware. Evaluated against `doc` (create) or a post-patch `{...doc,...updates}`
  instance (non-create); opt-in — commands without `emitPayloads` are unchanged.

Generated functions were typechecked against real `convex@1.41` (1043
mutations + 843 queries, zero type errors).

The schema surface emits a system `manifestEvents` table by default
(`emitEventsTable: false` to suppress, `eventsTable` to rename). The name is
collision-aware: if it would clash with an entity's table it is deterministically
suffixed (with a diagnostic). Reactions that create a tenant-scoped target
automatically thread the source entity's `tenantId` (`payload.<tenantProp>`)
into the insert, unless an explicit reaction param already sets it.

**Dev/demo builds:** `policyMode: 'skip'` omits the authorization-policy checks
(the role/`checkRole` gating) while still enforcing guards and constraints — for
local backends with no auth context configured. Default is `'enforce'`; keep it
for production. When skipped, the role map / `checkRole` helpers are not emitted
(no dead code).

## Usage

```ts
import { getProjection } from '@angriff36/manifest/projections'; // or registry
const result = projection.generate(ir, { surface: 'convex.schema', options });
// result.artifacts[0].code → convex/schema.ts
```

## Type mapping (safe-default + per-property override)

| IR `type.name`                               | Convex validator          | Note                                                                                                                          |
| -------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `string`, `text`, `uuid`                     | `v.string()`              |                                                                                                                               |
| `boolean`, `bool`                            | `v.boolean()`             |                                                                                                                               |
| `int`, `bigint`, `float`, `decimal`, `money` | `v.number()`              | matches Manifest runtime (all numerics are JS numbers); opt into `v.int64()`/`v.string()` per property for lossless transport |
| `date`, `datetime`, `time`, `duration`       | `v.number()`              | epoch ms (Convex-idiomatic)                                                                                                   |
| `json`                                       | `v.any()`                 |                                                                                                                               |
| `bytes`                                      | `v.bytes()`               |                                                                                                                               |
| `array<T>`                                   | `v.array(<T>)`            |                                                                                                                               |
| enum name                                    | `v.union(v.literal(...))` | single value → `v.literal(...)`                                                                                               |
| `number` (bare)                              | —                         | hard `CONVEX_AMBIGUOUS_NUMBER`                                                                                                |
| unknown                                      | —                         | hard `CONVEX_UNKNOWN_TYPE`                                                                                                    |

Override per property: `typeMappings: { Entity: { prop: "v.number()" } }`.

## Behaviour

- **Computed properties** are never emitted as fields.
- The IR **`id`** property is dropped — Convex's document `_id` is identity.
- **Nullable** → unioned with `v.null()`; **non-required** → wrapped in `v.optional(...)`.
- **References** (`belongsTo`/`ref`): the non-tenant FK column is typed
  `v.id("<targetTable>")` (convexId mode, default). A property that _backs_ a
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
`typeMappings`, `indexes`, `references`, `referenceMode`, `naming`,
`emitEventsTable`, `eventsTable`, `policyMode`, `includeTenantFilter`,
`includeSoftDeleteFilter`, `tenantIdProperty`, `deletedAtProperty`.

## Validation

The Phase 1 generator was validated against capsule's 199-table merged IR
(zero error diagnostics) and the emitted `convex/schema.ts` typechecks clean
against `convex@1.41` with `--strict`.
