---
title: "Prisma Projection"
description: "Generate a Prisma schema from compiled Manifest IR. Compile-time only, app-agnostic, with full @relation wiring and structured diagnostics for unhandleable shapes."
---

> **HAND-CURATED GUIDE.** Unlike most files under `docs/codedocs/`, this guide
> is not auto-regenerated — the Prisma projection is hand-built and its
> contract is human-verified. For the normative spec see
> [`docs/spec/manifest-vnext.md`](../../spec/manifest-vnext.md) (language)
> and [`docs/spec/config/`](../../spec/config/) (config schemas). The
> user-facing companion lives at
> [`mintlify/integration/prisma.mdx`](../../../mintlify/integration/prisma.mdx).

Use this guide when you want to emit a `schema.prisma` from compiled Manifest IR — either via the CLI or programmatically from a build script. The projection is **compile-time only**; it does not connect to a database, run migrations, or know about any specific application.

## Architectural position

The Prisma projection is a workspace package (`packages/manifest-projection-prisma/`) — not part of the core `@angriff36/manifest` library. It is the first projection that ships as its own package; the existing Next.js and routes projections live inside the core package's `src/manifest/projections/`. That separation is deliberate: it proves the projection contract is genuinely pluggable, and it keeps the core package free of Prisma-specific imports.

```
@angriff36/manifest           ← core: lexer, parser, IR, runtime, registry
  └─ src/manifest/projections/
      ├─ interface.ts         ← ProjectionTarget contract (shared)
      ├─ registry.ts          ← getProjection / registerProjection
      ├─ builtins.ts          ← nextjs + routes auto-registered
      ├─ nextjs/              ← Next.js projection (in-core)
      └─ routes/              ← Routes projection (in-core)

packages/manifest-projection-prisma   ← out-of-core, workspace package
  └─ src/
      ├─ generator.ts         ← PrismaProjection (implements ProjectionTarget)
      ├─ options.ts           ← PrismaProjectionOptions (config types)
      ├─ type-mapping.ts      ← IR type.name → Prisma scalar table
      └─ index.ts             ← barrel export

packages/cli
  └─ src/projections/
      ├─ register-extras.ts   ← registers PrismaProjection from the CLI side
      └─ dispatch.ts          ← pure registry-driven dispatch helper
```

The CLI imports both the core registry (`@angriff36/manifest/projections`) and the projection package (`@manifest/projection-prisma`), registers Prisma at startup, and dispatches by name. Core never imports the Prisma projection — the boundary holds.

## Contract

The projection implements `ProjectionTarget` from `src/manifest/projections/interface.ts`:

```ts
interface ProjectionTarget {
  readonly name: 'prisma';
  readonly description: string;
  readonly surfaces: readonly ['prisma.schema'];
  generate(ir: IR, request: ProjectionRequest): ProjectionResult;
}
```

`generate()` returns a single artifact (the schema text) plus a list of structured diagnostics. The CLI's writer (`packages/cli/src/commands/generate.ts`) writes the artifact at `pathHint` and surfaces the diagnostics through its spinner.

## What the projection emits, in order

For each entity in `ir.entities` (source order — the projection does **not** re-sort):

1. **Skip checks (info diagnostics):**
   - `entity.external === true` → `PRISMA_SKIPPED_EXTERNAL`
   - No `IRStore` declares this entity → `PRISMA_SKIPPED_NO_STORE`
   - Store target is `memory` or `localStorage` → `PRISMA_SKIPPED_NON_DURABLE`
   - Persistent targets: `durable`, `postgres`, `supabase`
2. **Open model:** `model EntityName {`
3. **Iterate `entity.properties`** (NEVER iterate `computedProperties` — structural invariant). For each property:
   - Resolve Prisma scalar via `typeMappings[Entity][prop]` override → `DEFAULT_TYPE_MAPPING[type.name]`. Unknown → diagnose and skip the column.
   - Special-case bare `number` → `PRISMA_AMBIGUOUS_NUMBER`, skip the column. No silent fallback.
   - Build attributes: `@id` (if `prop.name === 'id'`), `@unique` (if modifier), `@default(...)` (if `defaultValue`), `@map(...)` (if `columnMappings`), `@db.Decimal(p, s)` (if `precision`, or default `(12, 2)` when resolved scalar is `Decimal`).
4. **Iterate `entity.relationships`.** For each, call `emitRelationship()`. See "Relationship wiring" below.
5. **Close model:** add optional `@@map("table")` from `tableMappings` and `@@index([...])` lines from `indexes`, then `}`.

The artifact's header includes a `// DO NOT EDIT` banner. When `options.provider` is set, the projection also emits a `datasource db { ... }` and `generator client { ... }` block; when omitted, only model blocks are emitted (consumer merges into an existing schema).

## Type mapping (the projection's interpretation of `type.name`)

The IR carries `type.name` as an open string — Manifest's grammar does not enforce a type whitelist (decision: Checkpoint 1). The projection holds the entire mapping table:

```ts
// from packages/manifest-projection-prisma/src/type-mapping.ts
{
  string: 'String', text: 'String', uuid: 'String',
  boolean: 'Boolean', bool: 'Boolean',
  int: 'Int', bigint: 'BigInt', float: 'Float',
  decimal: 'Decimal', money: 'Decimal',
  date: 'DateTime', datetime: 'DateTime',
  json: 'Json', bytes: 'Bytes',
  // `number` is intentionally ABSENT — see "The number ambiguity rule" below.
}
```

Override per-property via the `typeMappings` projection option (`Record<EntityName, Record<PropertyName, string>>` — value is a literal Prisma scalar). Unknown names with no override produce `PRISMA_UNKNOWN_TYPE` and the column is skipped.

## The `number` ambiguity rule

Manifest's `number` type does not distinguish integers from real numbers from money. Silently mapping it to `Float` was the original Phase-3 default; user direction post-Phase-3 changed it to a hard diagnostic. Bare `number` with no override now produces:

```
PRISMA_AMBIGUOUS_NUMBER (Entity):
  Property 'Entity.field' is typed 'number', which is ambiguous
  (Manifest does not distinguish integers from real numbers from money).
  Pick a precise type in the .manifest source: 'int' or 'bigint' for
  counts and ids, 'float' for measurements where rounding is acceptable,
  'money' or 'decimal' for currency and other exact-decimal values.
  Or supply a 'typeMappings.Entity.field' override.
```

The column is skipped. Authors fix it by picking a precise type in the source. The diagnostic carries the exact entity-and-property reference plus all five precise-type alternatives so resolution is one read of the diagnostic away.

## Decimal default precision

Any property whose **resolved** Prisma scalar is `Decimal` (either via the default mapping for `money`/`decimal` IR types, or via a `typeMappings` override) picks up `@db.Decimal(12, 2)` by default. Consumers override per-property via the `precision` config option. The rule is keyed on the resolved scalar — not on the IR type name — so override paths can't bypass the precision floor.

`(12, 2)` was chosen as the conservative money default (up to 9,999,999,999.99 with cent precision). Configurable per-property; not globally.

## Relationship wiring

`emitRelationship()` in `generator.ts` consumes one `IRRelationship` and emits the appropriate Prisma field(s). The four handled cases:

| IR kind | Emitted lines | Notes |
| --- | --- | --- |
| `hasMany name: T` | `name T[]` | Parent side of 1:N |
| `hasOne name: T` | `name T?` | Parent side of 1:1 |
| `belongsTo name: T` | `nameId <fkType>` + `name T @relation(fields: [nameId], references: [id])` | Child side; FK type = target's `id` Prisma type |
| `ref name: T` | same as `belongsTo` | "Loose" — no missing-backside warning |

**1:1 vs 1:N detection** is done by inspecting the opposite side. The helper `findOppositeRelations(fromEntity, rel, ir)` finds all relationships on the target entity that point back at the source entity. If any opposite is `kind: 'hasOne'`, the FK is marked `@unique` (1:1); otherwise the FK is plain (1:N).

**FK field name resolution** is layered: `options.foreignKeys[Entity][relationshipName]` → `rel.foreignKey` (IR annotation) → default `${rel.name}Id`. FK fields are virtual properties from the consumer's perspective and respect the existing `columnMappings` knob, so `authorId String @map("author_id")` is a one-line config addition.

**FK type matching** is done by `targetIdPrismaType(targetEntityName, ir, options)` — it looks up the target entity's `id` property and resolves its IR type via the same mapping table as everything else. A `string` PK gets a `String` FK; an `int` PK gets an `Int` FK; etc.

## Unhandleable shapes (structured diagnostics, not silent miss-emits)

The projection produces structured diagnostics rather than emit Prisma that wouldn't validate:

- **`through` relationships** (`hasMany ... through X`): explicit many-to-many via a join entity. Prisma's M2M model requires the join entity to declare two `belongsTo` relations and the linked sides to declare `hasMany` pointing at the **join entity itself**. Manifest's `through` syntax doesn't carry that information. The projection emits `PRISMA_RELATION_VIA_THROUGH_UNIMPLEMENTED` info + a comment marker, leaving wire-up to the consumer (who already declared the join entity as a real Manifest entity).
- **Multi-relation between same pair**: e.g. `Book belongsTo author: Author` AND `Book belongsTo editor: Author`. Prisma requires `@relation("name")` to disambiguate; the projection refuses to invent names. Emits `PRISMA_RELATION_AMBIGUOUS` info.
- **One-sided relations**: a `hasMany` / `hasOne` / `belongsTo` with no matching opposite. The field IS emitted but Prisma will reject the schema. Emits `PRISMA_RELATION_MISSING_BACKSIDE` warning with the missing-declaration hint. `ref` is exempt (it's the explicit "loose" relation kind).
- **Missing primary key**: no property named literally `id`. Emits `PRISMA_NO_ID_PROPERTY` info; the model is still emitted, just without `@id`.
- **Unknown type.name**: `PRISMA_UNKNOWN_TYPE` error; column skipped.
- **Bare `number`**: `PRISMA_AMBIGUOUS_NUMBER` error; column skipped.

## CLI dispatch

The CLI's `manifest generate` command dispatches via the projection registry:

```
manifest generate <ir> -p <projection> -s <surface> -o <output>
```

Internally (`packages/cli/src/commands/generate.ts`):
- If `--projection nextjs`: existing CLI-specific multi-surface orchestration (route/command/dispatcher/types/client/all fan-out).
- Else: calls `dispatch({ ir, projectionName, surface, options })` from `packages/cli/src/projections/dispatch.ts`. The dispatch helper calls `registerCliExtraProjections()` (idempotent), looks up the projection by name via `getProjection(name)` from the core registry, and invokes `projection.generate(...)`. No name special-casing in the dispatch path.

`packages/cli/src/projections/register-extras.ts` is the single source of truth for which projections the CLI ships beyond the core builtins. Adding a future projection packaged as its own workspace:
1. Add the workspace dep to `packages/cli/package.json` (as `link:` or `workspace:` per the project's convention).
2. Import its `ProjectionTarget` in `register-extras.ts`.
3. Register it inside `registerCliExtraProjections()`.

Core's `src/manifest/projections/builtins.ts` is never touched.

## Package boundary: how the worktree resolves it

- `packages/manifest-projection-prisma/package.json` is `private: true`. The package is not published standalone; the CLI bundles it via a `link:../manifest-projection-prisma` dep.
- Its `dependencies` include `@angriff36/manifest: link:../..` (relative symlink at install time), so its own `tsc` build can type-resolve against the root's built dist.
- Its `exports` map points at `./dist/index.js` and `./dist/index.d.ts`. The package must be built (`npm run build` inside the package, which runs `tsc`) before the CLI's `tsc` can resolve `@manifest/projection-prisma`. CI runs this between the root build:lib and the CLI build steps; locally `pnpm install && npm run build` from the package root does it.
- The CLI's `tsconfig.json` has a path mapping `"@manifest/projection-prisma": ["../manifest-projection-prisma/dist/index.d.ts"]` that mirrors the runtime symlink resolution.

## Tests and the app-agnostic invariant

The package's tests (`packages/manifest-projection-prisma/src/generator.test.ts`) build IR object literals by hand using deliberately abstract names (`Widget`, `Author`, `Book`, `Profile`, `Tag`, `AuthorTag`, `Actor`). The dedicated `'app-agnostic invariant'` test scans the emitted schema for a forbidden-token list (`tenantId`, `deletedAt`, `clerk`, `userTenantMapping`, …) and fails if any appear. The test is the structural guard against future drift toward app coupling.

End-to-end CLI runs against generic fixtures live in `.tmp/step2b-demo/` and `.tmp/step3-demo/` (gitignored). These are not part of the test suite — they're scratch artifacts used to verify the actual CLI binary produces correct output on disk.

## Related references

- [Projections (auto-generated)](../projections.md) — top-level reference for the projection contract
- [Compilation and IR](../compilation-ir.md) — how IR is produced
- [Manifest vNext spec](../../spec/manifest-vnext.md) — normative language semantics
- [Prisma projection (user-facing)](../../../mintlify/integration/prisma.mdx) — Mintlify guide for consumers
