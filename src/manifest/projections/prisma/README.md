# PrismaProjection — Architecture

## Boundary Rules

The PrismaProjection is a **compiler backend** — it consumes Manifest IR and emits
Prisma schema artifacts. It does NOT participate in runtime semantics.

```
┌─────────────┐     ┌─────────┐     ┌──────────────────────┐     ┌──────────┐
│  .manifest   │ ──▶ │  IR     │ ──▶ │  PrismaProjection    │ ──▶ │ schema   │
│  (semantic)  │     │  (IR)   │     │  + projection-config │     │ .prisma  │
└─────────────┘     └─────────┘     └──────────────────────┘     └──────────┘
```

### Three layers

| Layer                 | Contents                                                           | Example                                    |
| --------------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| **Manifest IR**       | Entity names, property types, relationships, constraints, commands | `property required subtotal: money`        |
| **projection-config** | Table/column names, DB types, precision, indexes, field attributes | `columnMappings: { subtotal: "subtotal" }` |
| **Generated Prisma**  | The concrete `schema.prisma` output                                | `subtotal Decimal @db.Decimal(12, 2)`      |

### What goes where

- **Manifest source** (.manifest files): Domain semantics — entity shapes, types, relationships, constraints, commands, policies. NO Prisma concepts.
- **projection-config.json**: Storage rendering — table names, column names, DB-native types, precision, indexes, field attributes. NO domain semantics.
- **PrismaProjection** (this code): Translates IR + config into Prisma schema. Carries NO knowledge of any specific application.

## Nullability

A scalar column's Prisma optionality is driven **solely by the IR type's
`nullable` flag** — i.e. whether the `.manifest` source wrote an explicit `?` on
the property type:

| `.manifest` source                | IR `type.nullable` | Prisma column                  |
| --------------------------------- | ------------------ | ------------------------------ |
| `property name: string`           | `false`            | `name String` (NOT NULL)       |
| `property name: string?`          | `true`             | `name String?` (nullable)      |
| `property required name: string`  | `false`            | `name String` (NOT NULL)       |
| `property required name: string?` | `true`             | `name String?` — the type wins |

The `required` modifier and the `id` identity do **not** drive column
nullability: a non-`required` property with a non-nullable type still emits a
`NOT NULL` column. (A property named `id` is non-nullable by construction, so it
is always `NOT NULL` regardless.) This makes the generated schema match the
declared types exactly, rather than silently widening every non-`required`
column to nullable. In the edge case where a property is both `required` and has
a `?` type, the declared type wins and the column is nullable.

Two structural exceptions keep their existing behavior:

- **Scalar list** fields (`String[]`, `Int[]`, …) are implicitly optional in
  Prisma and never carry a `?`.
- **Relation** field optionality follows the nullability of its backing foreign
  key scalar(s): if any FK column is nullable (its IR type is nullable), the
  relation field is optional (`author User?`); otherwise it is required. A
  synthesized FK column (not declared as a property) is `NOT NULL`, so its
  relation is required.

## Config Keys

| Key               | Shape                                                   | Purpose                                                          |
| ----------------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| `provider`        | `'postgresql' \| ...`                                   | Datasource provider                                              |
| `tableMappings`   | `Record<Entity, string>`                                | `@@map("table_name")`                                            |
| `columnMappings`  | `Record<Entity, Record<Prop, string>>`                  | `@map("col_name")`                                               |
| `typeMappings`    | `Record<Entity, Record<Prop, string>>`                  | Override IR type → Prisma base scalar                            |
| `dbAttributes`    | `Record<Entity, Record<Prop, string>>`                  | `@db.Uuid`, `@db.Timestamptz(6)`, etc.                           |
| `precision`       | `Record<Entity, Record<Prop, {p,s}>>`                   | `@db.Decimal(precision, scale)`                                  |
| `fieldAttributes` | `Record<Entity, Record<Prop, string[]>>`                | `@unique`, `@default(now())`, `@updatedAt`                       |
| `indexes`         | `Record<Entity, IndexEntry[]>`                          | `@@index([...])`                                                 |
| `foreignKeys`     | `Record<Entity, Record<Rel, string>>`                   | Override FK column name                                          |
| `multiSchema`     | `{ enabled, schemas?, entitySchema?, defaultSchema? }`  | `@@schema("...")` per model + `schemas=[...]` on datasource      |
| `naming`          | `'snake_case' \| { table?, column?, pluralizeTables? }` | Auto-casing: emits `@map`/`@@map` for camelCase→snake_case, etc. |

## Naming convention (auto casing)

By default the projection emits IR names verbatim — to render camelCase IR
identifiers as `snake_case` database columns you would hand-write a
`columnMappings` entry per field. The `naming` option automates that:

```yaml
projections:
  prisma:
    options:
      naming: snake_case # createdAt → @map("created_at"), Widget → @@map("widgets")
```

The shorthand `snake_case` expands to
`{ table: 'snake_case', column: 'snake_case', pluralizeTables: true }`. The object
form lets you tune each axis:

```yaml
naming:
  table: snake_case # snake_case | camelCase | PascalCase | preserve
  column: snake_case # snake_case | camelCase | preserve
  pluralizeTables: true # Widget → widgets (default true)
```

**It only ever adds `@map`/`@@map`.** The Prisma _model name_ and _field
identifiers_ stay as the IR name, so relation `fields`/`references`, `@@id`,
`@@unique`, and `@@index` references are unaffected — only the physical database
name changes. A `@map`/`@@map` is emitted only when the physical name actually
differs (so `id` stays bare).

Resolution order per name:

1. explicit `tableMappings` / `columnMappings` (always win)
2. the `naming` convention
3. the IR name verbatim

Explicit `tableMappings` is also the **escape hatch** for irregular plurals the
built-in pluralizer gets wrong (it covers common English rules plus a small
irregular set: person→people, child→children, …).

A **global** `naming` may be set once at the top level of `manifest.config.yaml`
and is inherited by the Prisma projection; a per-projection
`projections.prisma.options.naming` overrides the global default.

## Multi-schema layout

Manifest entities already carry their **module** in IR (`IREntity.module`). By
default the projection flattens every model into the database's default schema.
Enabling `multiSchema` preserves the real module layout:

```yaml
projections:
  prisma:
    options:
      provider: postgresql # postgresql | cockroachdb | sqlserver only
      multiSchema:
        enabled: true # default false (flat, back-compatible)
        schemas: ['public', 'auth'] # optional explicit order; used schemas auto-appended
        entitySchema: # optional per-entity override (beats module)
          LegacyUser: identity
        defaultSchema: public # for entities with no module/override
```

Per-model schema resolution: `entitySchema[name]` → `entity.module` →
`defaultSchema` (`"public"`). The datasource lists explicit `schemas` first
(order preserved), then any used-but-unlisted schema appended sorted, so every
referenced schema is always declared. Emitting `@@schema` with a non-multi-schema
provider is a hard diagnostic and falls back to the flat layout. With no
`provider` (models-only mode) `@@schema` is still emitted for merging into an
existing datasource. Multi-schema is GA in current Prisma — no `previewFeatures`
flag is emitted.

### Split files (one `.prisma` per schema)

```yaml
projections:
  prisma:
    options:
      provider: postgresql
      output: prisma/schema.prisma
      multiSchema:
        enabled: true
        splitFiles:
          enabled: true
          dir: prisma/schemas # default
```

When `splitFiles.enabled` is true (requires `multiSchema.enabled`), the
projection emits:

- `output` — datasource + generator only (plus a comment listing partitions)
- `dir/<schema>.prisma` — models/enums for that schema (still with `@@schema`)

Prisma merges every `.prisma` file in the schema folder. `splitFiles` without
`multiSchema.enabled` is a hard diagnostic (`PRISMA_SPLITFILES_REQUIRES_MULTISCHEMA`).

## Extraction Bootstrap Workflow

For existing Prisma projects adopting Manifest, the projection-config is bootstrapped
from the existing schema:

```
existing schema.prisma
  → extraction script (parse models, @map, @db.*, indexes, etc.)
  → projection-config.json
  → PrismaProjection.generate(IR, config)
  → generated schema.prisma
```

The generated output should round-trip against the original with only known-semantic
diffs (e.g., Manifest default="" on optional fields, extra declared properties).

## Source Control Hygiene

1. **Projection code lives in the manifest source repo.** `node_modules` is never canonical.
2. **Generated artifacts must never be hand-edited.** If the output is wrong, fix the config or the projection.
3. **Config is extracted, not authored.** For existing schemas, run the extraction script. For greenfield, author manifests and let the projection generate the schema.
4. **Promotion workflow:**
   - Experimental changes → patch `node_modules` in consumer project → validate → port to source repo → build → publish → consumer updates dependency.

## Known Gaps

| Feature                                        | Status                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| `@@schema("name")`                             | **Available via `multiSchema` config** — derives from `IREntity.module` (G6) |
| Multi-file schema output (one file per schema) | Not yet — single-artifact only (deferred)                                    |
| `@default(dbgenerated(...))` auto-detection    | Available via `fieldAttributes` config                                       |
| `@default(now())` auto-detection               | Available via `fieldAttributes` config                                       |
| `@updatedAt` auto-detection                    | Available via `fieldAttributes` config                                       |
| `@unique` on composite-key id                  | Available via `fieldAttributes` config                                       |
