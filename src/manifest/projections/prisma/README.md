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

| Layer | Contents | Example |
|---|---|---|
| **Manifest IR** | Entity names, property types, relationships, constraints, commands | `property required subtotal: money` |
| **projection-config** | Table/column names, DB types, precision, indexes, field attributes | `columnMappings: { subtotal: "subtotal" }` |
| **Generated Prisma** | The concrete `schema.prisma` output | `subtotal Decimal @db.Decimal(12, 2)` |

### What goes where

- **Manifest source** (.manifest files): Domain semantics — entity shapes, types, relationships, constraints, commands, policies. NO Prisma concepts.
- **projection-config.json**: Storage rendering — table names, column names, DB-native types, precision, indexes, field attributes. NO domain semantics.
- **PrismaProjection** (this code): Translates IR + config into Prisma schema. Carries NO knowledge of any specific application.

## Config Keys

| Key | Shape | Purpose |
|---|---|---|
| `provider` | `'postgresql' \| ...` | Datasource provider |
| `tableMappings` | `Record<Entity, string>` | `@@map("table_name")` |
| `columnMappings` | `Record<Entity, Record<Prop, string>>` | `@map("col_name")` |
| `typeMappings` | `Record<Entity, Record<Prop, string>>` | Override IR type → Prisma base scalar |
| `dbAttributes` | `Record<Entity, Record<Prop, string>>` | `@db.Uuid`, `@db.Timestamptz(6)`, etc. |
| `precision` | `Record<Entity, Record<Prop, {p,s}>>` | `@db.Decimal(precision, scale)` |
| `fieldAttributes` | `Record<Entity, Record<Prop, string[]>>` | `@unique`, `@default(now())`, `@updatedAt` |
| `indexes` | `Record<Entity, IndexEntry[]>` | `@@index([...])` |
| `foreignKeys` | `Record<Entity, Record<Rel, string>>` | Override FK column name |

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

| Feature | Status |
|---|---|
| `@@schema("name")` | Not in Manifest grammar |
| `@default(dbgenerated(...))` auto-detection | Available via `fieldAttributes` config |
| `@default(now())` auto-detection | Available via `fieldAttributes` config |
| `@updatedAt` auto-detection | Available via `fieldAttributes` config |
| `@unique` on composite-key id | Available via `fieldAttributes` config |
