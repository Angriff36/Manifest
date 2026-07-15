# Drizzle Projection

> **Audited (2026-07-15) @RYANSIGNED:** Spot-check OK — precision precedence
> `(options → IRType.params → 12,2)`, bare-`number` diagnostic, durable-store
> skip rules match generator on package **3.6.4**.

The Drizzle projection emits a TypeScript-first Drizzle ORM schema from compiled Manifest IR, compatible with Drizzle Kit. Use it when your persistence layer is Drizzle rather than Prisma; it mirrors the Prisma projection's compile-time, app-agnostic contract but targets Drizzle's `pgTable` / `mysqlTable` / `sqliteTable` column builders.

## What it generates

The projection registers under the name `drizzle` and declares a single surface, `drizzle.schema`. A `generate` call returns one artifact (`id: 'drizzle.schema'`, content type `typescript`, written at the configured `output` path, default `schema.ts`).

The emitted file contains a table definition per persistent entity built with the dialect's table function, the dialect-appropriate imports, any `relations()` exports for entities that declare relationships, and index definitions. Relationships of kind `belongsTo` / `ref` emit a foreign-key column; `hasMany` / `hasOne` do not emit a column and are expressed through Drizzle's `relations()` API instead.

## Usage

```ts
import { compileToIR } from '@angriff36/manifest/ir-compiler';
import { getProjection } from '@angriff36/manifest/projections';

const { ir } = await compileToIR(source);

const projection = getProjection('drizzle');
const result = projection?.generate(ir, {
  surface: 'drizzle.schema',
  options: {
    dialect: 'postgresql',
    tableMappings: { Widget: 'widgets' },
  },
});

for (const artifact of result?.artifacts ?? []) {
  // write artifact.code at artifact.pathHint
}
```

`DrizzleProjection` can also be imported directly from `@angriff36/manifest/projections/drizzle`. Through the CLI it is dispatched by name:

```bash
manifest generate ir/widget.ir.json --projection drizzle --surface drizzle.schema --output src/db/schema.ts
```

## Type mapping & behavior

The IR `type.name` string maps to a Drizzle column builder through `DEFAULT_TYPE_MAPPING` in `type-mapping.ts`. The table covers `string` (`varchar(255)`), `text`, `uuid`, `boolean`/`bool`, `int` (`integer`), `bigint`, `float` (`real`), `decimal` and `money` (both `numeric`), `date`, `datetime` (`timestamp`), `json` (`jsonb`), and `bytes` (`bytea`). A type that is not in the table and not overridden produces a hard diagnostic and the column is skipped.

As with Prisma, bare `number` is intentionally absent. The projection emits a `DRIZZLE_AMBIGUOUS_NUMBER` diagnostic and skips the column rather than guessing; authors must pick `int`, `bigint`, `float`, `decimal`, or `money`. Numeric/decimal columns resolve precision and scale in this order: (1) `options.precision[Entity][prop]` — explicit consumer override; (2) `IRType.params` — precision/scale compiled into the IR for the property; (3) default `(12, 2)`. Properties carrying the `indexed` modifier emit a standalone `index("varName_prop_idx").on(table.prop)` export; if the property is already covered by `options.indexes` no duplicate is emitted.

The `dialect` option selects the column set and imports: `postgresql` uses `pgTable` from `drizzle-orm/pg-core`, `mysql` uses `mysqlTable` from `drizzle-orm/mysql-core`, and `sqlite` uses `sqliteTable` from `drizzle-orm/sqlite-core`. The projection emits diagnostics for relationship shapes it cannot wire on its own, including many-to-many relationships (which it asks you to model as a join entity with two `belongsTo` relations) and ambiguous multi-relation pairs.

## Options

The options object is `DrizzleProjectionOptions` in `drizzle/options.ts`, normalized through `normalizeOptions`. `dialect` (default `postgresql`) selects the SQL flavor, `schemaExportName` (default `schema`) is used for imports, and `output` (default `schema.ts`) is the artifact path hint.

Per-property options use the nested `Record<EntityName, Record<PropertyName, X>>` shape. `tableMappings` overrides the table name; `columnMappings` overrides a column name; `precision` sets `{ precision, scale }` on numeric columns; `indexes` defines composite or named indexes (`string[]` or `{ fields, name }`); `typeMappings` overrides the builder with a literal Drizzle builder name (e.g. `"integer"`, `"timestamp"`); and `foreignKeys` overrides the FK column name (string form) or supplies a full `{ fields, references, onDelete, onUpdate }` definition (object form), defaulting the FK column to `${relationshipName}Id`.

## Notes & limitations

Only persistent entities are emitted. Entities marked `external`, entities with no `store` declaration, and entities with a non-durable store target are skipped with info diagnostics (`DRIZZLE_SKIPPED_EXTERNAL`, `DRIZZLE_SKIPPED_NO_STORE`, `DRIZZLE_SKIPPED_NON_DURABLE`).

This projection has no consolidated entry in `completed-feature-summaries.md`; its behavior here is taken directly from `src/manifest/projections/drizzle/generator.ts`, `type-mapping.ts`, and `options.ts`. Like Prisma, an entity missing a usable key (no `id` property and no `key [...]` declaration) produces a diagnostic and is skipped.
