# Prisma Projection

The Prisma projection emits a `schema.prisma` from compiled Manifest IR, with full `@relation` wiring, composite key and referential-action support, and structured diagnostics for shapes Prisma cannot express. It is compile-time only — it never connects to a database, runs migrations, or knows about any specific application.

## What it generates

The projection registers under the name `prisma` and declares a single surface, `prisma.schema`. A `generate` call returns one artifact containing the schema text (`id: 'prisma.schema'`, content type `prisma`, written at the configured `output` path, default `schema.prisma`). When a datasource `provider` is supplied, a second `prisma.config.ts` companion artifact is emitted so the output is runnable on Prisma 7, which expects the connection URL there rather than in the schema.

The schema is built per entity in source order — the projection does not re-sort. For each entity it opens a `model`, iterates the declared `properties` (never computed properties, which are a structural invariant), emits relationship fields, and closes with optional `@@map` and `@@index` lines. When no entities qualify for persistence the artifact contains only the header and a comment noting that no persistent entities were found.

## Usage

```ts
import { compileToIR } from '@angriff36/manifest/ir-compiler';
import { getProjection } from '@angriff36/manifest/projections';

const { ir } = await compileToIR(source);

const projection = getProjection('prisma');
const result = projection?.generate(ir, {
  surface: 'prisma.schema',
  options: {
    provider: 'postgresql',
    tableMappings: { Widget: 'widgets' },
  },
});

for (const artifact of result?.artifacts ?? []) {
  // write artifact.code at artifact.pathHint
}
```

You can also import `PrismaProjection` directly from `@angriff36/manifest/projections/prisma`. Through the CLI the projection is dispatched by name:

```bash
manifest generate ir/widget.ir.json --projection prisma --surface prisma.schema --output prisma/schema.prisma
```

## Type mapping & behavior

The IR `type.name` string is translated to a Prisma scalar through `DEFAULT_TYPE_MAPPING` in `type-mapping.ts`. The table covers `string`, `boolean`, `int`, `bigint`, `float`, `decimal` and `money` (both `Decimal`), `date`/`datetime` (`DateTime`), `json`, `bytes`, `uuid`, and the aliases `text` and `bool`. A field whose type is not in the table and not overridden produces a hard diagnostic and the column is skipped — there is no fallback guessing.

Bare `number` is intentionally absent from the table. Because Manifest's `number` is ambiguous between integers, reals, and money, the projection emits a `PRISMA_AMBIGUOUS_NUMBER` diagnostic and skips the column rather than silently mapping it to `Float`. Authors must pick `int`, `bigint`, `float`, `decimal`, or `money`. Decimal-family columns resolve precision and scale in this order: (1) `options.precision[Entity][prop]` — explicit consumer override; (2) `IRType.params` — precision/scale compiled into the IR for the property (e.g. from a compiler that annotates the type); (3) default `@db.Decimal(12, 2)`. Properties carrying the `indexed` modifier emit a `@@index([prop])` model-level attribute in addition to any `options.indexes` entries; if the property is already covered by `options.indexes` no duplicate is emitted.

Properties named `id` get `@id`; `@unique` comes from a modifier, `@default(...)` from a default value, and `@map(...)` from a column-name override. Relationships drive `@relation` wiring: `belongsTo` and `ref` emit an FK scalar plus a relation field, while `hasMany` / `hasOne` emit the opposite side. The projection emits diagnostics for shapes Prisma cannot accept on its own — one-sided relations, ambiguous multi-relation pairs that need named relations, and missing keys.

## Options

The options object is `PrismaProjectionOptions` in `prisma/options.ts`; raw request options are normalized through `normalizeOptions`. `provider` selects the datasource (`postgresql`, `mysql`, `sqlite`, `sqlserver`, `mongodb`, `cockroachdb`) and gates emission of the datasource block and `prisma.config.ts` companion; `urlEnvVar` (default `DATABASE_URL`) names the env variable in that companion. `output` (default `schema.prisma`) is the artifact path hint.

Every per-property option uses the nested `Record<EntityName, Record<PropertyName, X>>` shape — there are no dotted `"Entity.property"` keys anywhere. `tableMappings` emits `@@map`; `columnMappings` emits `@map`; `precision` sets `@db.Decimal(precision, scale)`; `indexes` emits `@@index([...])` lines (plain `string[]` for a composite index or `{ fields, name }` for a named one); `typeMappings` overrides the scalar with a literal Prisma type; `foreignKeys` overrides the FK column name (string form) or supplies a full `{ fields, references, onDelete, onUpdate }` definition (object form); `dbAttributes` emits a generic `@db.*` annotation; and `fieldAttributes` appends verbatim Prisma attributes without duplicating ones the pipeline already emits.

## Notes & limitations

Only persistent entities are emitted. Entities marked `external`, entities with no `store` declaration, and entities whose store target is `memory` or `localStorage` are skipped with info diagnostics (`PRISMA_SKIPPED_EXTERNAL`, `PRISMA_SKIPPED_NO_STORE`, `PRISMA_SKIPPED_NON_DURABLE`); the persistent targets are `durable`, `postgres`, and `supabase`.

When both a `precision`-derived `@db.Decimal` and a `dbAttributes` entry would apply to the same field, the `@db.Decimal` wins, since Prisma allows only one `@db.*` per field. The generated header still references the historical package name `@manifest/projection-prisma`; the projection now lives inside core at `src/manifest/projections/prisma/` and the header string is cosmetic.
