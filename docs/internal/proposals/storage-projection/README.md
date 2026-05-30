Last updated: 2026-05-24
Status: Active
Authority: Advisory
Enforced by: None

# Storage Projection: IR → schema.prisma

This document describes how the Prisma projection translates compiled Manifest IR into a
`schema.prisma` artifact. It records what **v1.0 already built** — not a proposal for
future work. For the normative IR contract, see `docs/spec/ir/ir-v1.schema.json`.

For programmatic API reference, see `docs/codedocs/api-reference/projections.md`.
For Mintlify user docs, see `mintlify/integration/prisma.mdx`.

## What the projection does

`PrismaProjection` (source: `src/manifest/projections/prisma/generator.ts`) reads IR and
emits one or two artifacts:

1. `schema.prisma` — always emitted. Contains `model` blocks for each entity whose store
   is `durable` (and that has an `id` property or a composite `key`).
2. `prisma.config.ts` — emitted **only when `options.provider` is set**. Required by
   Prisma 7+, which moved the connection URL out of the schema file.

The projection is invoked via:
```typescript
import { PrismaProjection } from '@angriff36/manifest/projections/prisma';

const result = projection.generate(ir, {
  surface: 'prisma.schema',
  options: { provider: 'postgresql', ... },
});

// result.artifacts[0] → schema.prisma
// result.artifacts[1] → prisma.config.ts  (only when provider is set)
```

## IR → Prisma mapping (v1.0)

### Entity model

Each IR entity with `store.target === 'durable'` becomes a Prisma `model`. Entities with
no store, `memory` store, `localStorage` store, or `external: true` are skipped with an
info diagnostic.

### Properties

| IR type | Prisma scalar | Notes |
|---|---|---|
| `string` | `String` | |
| `boolean` | `Boolean` | |
| `timestamp` | `DateTime` | |
| `number` | — | **Ambiguous**: must supply `typeMappings` entry (`Float`, `Decimal`, or `BigInt`). Emits `PRISMA_AMBIGUOUS_NUMBER` error and skips column if absent. |

### Primary key

| IR declaration | Prisma output |
|---|---|
| `property id: string` (no `key`) | `id String @id` |
| `key [tenantId, id]` | `@@id([tenantId, id])` — no `@id` on any single field |

An entity with no `id` property and no `key` declaration triggers `PRISMA_NO_ID_PROPERTY`
(error severity) and the model is skipped entirely.

### Alternate keys

```manifest
unique [tenantId, externalId]
```
→
```prisma
@@unique([tenantId, externalId])
```

Multiple `unique` declarations are each emitted as a separate `@@unique` line.

### Relationships

| IR declaration | Prisma output |
|---|---|
| `belongsTo x: T with colName` | `x T @relation(fields: [colName], references: [id])` |
| `belongsTo x: T fields [a, b] references [c, d]` | `x T @relation(fields: [a, b], references: [c, d])` |
| `belongsTo x: T fields [a] references [r] onDelete cascade` | `x T @relation(fields: [a], references: [r], onDelete: Cascade)` |

`onDelete` and `onUpdate` values (`cascade`, `restrict`, `setNull`, `setDefault`,
`noAction`) are emitted in PascalCase. Absent values emit nothing — Prisma uses its own
default.

### Table and column name overrides

Options `tableMappings` and `columnMappings` emit `@@map(...)` and `@map(...)` respectively:

```typescript
options: {
  tableMappings: { Order: 'orders' },
  columnMappings: { Order: { createdAt: 'created_at' } },
}
```

### Custom indexes

```typescript
options: {
  indexes: {
    Order: [{ fields: ['tenantId', 'status'] }],
  },
}
```
→ `@@index([tenantId, status])`

## Options reference

| Option | Type | Default | Description |
|---|---|---|---|
| `provider` | string | — | Datasource provider. Triggers `prisma.config.ts` emission. |
| `urlEnvVar` | string | `"DATABASE_URL"` | Env var used in `prisma.config.ts`. |
| `tableMappings` | `Record<EntityName, string>` | `{}` | `@@map` overrides. |
| `columnMappings` | `Record<EntityName, Record<PropName, string>>` | `{}` | `@map` overrides. |
| `precision` | `Record<EntityName, Record<PropName, {precision, scale}>>` | `{}` | `@db.Decimal(p,s)` per field. |
| `typeMappings` | `Record<EntityName, Record<PropName, string>>` | `{}` | Required for `number`-typed fields. |
| `foreignKeys` | `Record<EntityName, Record<RelName, string>>` | `{}` | FK column override for relationships without explicit `fields [...]`. |
| `indexes` | `Record<EntityName, IndexEntry[]>` | `[]` | Additional `@@index` declarations. |
| `output` | string | `"schema.prisma"` | Path hint for the schema artifact. |

## Diagnostics

| Code | Severity | Condition |
|---|---|---|
| `PRISMA_AMBIGUOUS_NUMBER` | error | `number`-typed property with no `typeMappings` override. Column skipped. |
| `PRISMA_NO_ID_PROPERTY` | error | Entity has no `id` property and no `key`. Model skipped. |
| `PRISMA_SKIPPED_NON_DURABLE` | info | Store is `memory` or `localStorage`. |
| `PRISMA_SKIPPED_NO_STORE` | info | No store declaration. |
| `PRISMA_SKIPPED_EXTERNAL` | info | Entity has `external: true`. |

## Runtime scope boundary

The Manifest runtime (`RuntimeEngine`) is a **single-key, in-memory store**. Composite
foreign keys are a projection concern only:

- Single-column FK (`fields.length === 1`): runtime resolves via `fields[0]`.
- Composite FK (`fields.length > 1`): runtime does **not** attempt resolution — returns
  `null` explicitly. Composite-FK resolution requires a `storeProvider` adapter backed
  by a real database.

This boundary is normative. See `docs/spec/manifest-vnext.md § Runtime behavior for
composite FK` for the binding statement.
