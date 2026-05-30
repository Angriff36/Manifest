# JSON Schema Projection

The JSON Schema projection generates JSON Schema documents (draft-07, 2019-09, or 2020-12) from Manifest IR entity definitions. Use it when you need a language-neutral validation contract for your domain objects — for request validation at an API gateway, payload validation in non-TypeScript services, or publishing entity shapes to external consumers.

The projection is registered under the name `jsonschema` and lives at `src/manifest/projections/jsonschema/generator.ts`. It produces one schema document per entity.

## What it generates

The projection exposes two surfaces.

`jsonschema.entity` generates a single entity schema and requires the `entity` field on the request. If `entity` is omitted it falls back to generating all entities; if the named entity is not found it returns an `ENTITY_NOT_FOUND` error diagnostic.

`jsonschema.schemas` generates one schema artifact per entity, sorted alphabetically by entity name for deterministic output.

Each artifact is JSON content (path hint `schemas/<EntityName>.schema.json`, artifact id `jsonschema.entity.<EntityName>`) containing a `$schema` URI for the chosen draft, a `title` set to the entity name, `type: "object"`, a `properties` map, and — by default — `additionalProperties: false`. A `required` array is emitted only when at least one property carries the `required` modifier. When a `baseUri` option is set, each document also gets an `$id` of `<baseUri>/<EntityName>.schema.json`. An unrecognized surface returns an `UNKNOWN_SURFACE` error diagnostic.

## Usage

```ts
import { getProjection } from '@angriff36/manifest/projections';

const projection = getProjection('jsonschema');

// All entities as separate schema files
const all = projection.generate(ir, { surface: 'jsonschema.schemas' });

// A single entity, draft 2020-12, with $id references
const one = projection.generate(ir, {
  surface: 'jsonschema.entity',
  entity: 'Recipe',
  options: { draft: '2020-12', baseUri: 'https://example.com/schemas' },
});
```

## Type mapping & behavior

Scalar IR types map as follows: `string`/`text` to `{ type: "string" }`; `number`/`float`/`decimal` to `number`; `int`/`integer`/`bigint` to `integer`; `boolean`/`bool` to `boolean`; `date` to a string with `format: "date"`; `datetime` to `date-time`; `uuid` to `uuid`; `email` to `email`; `url`/`uri` to `uri`; `bytes` to a string with `format: "byte"`; `object` to an object with open `additionalProperties`; and `json`/`any` to an empty (unconstrained) schema. Generic `array<T>` becomes an array with mapped `items`; `map<V>` becomes an object with mapped `additionalProperties`; `record` becomes an object with open `additionalProperties`. An unknown type name produces a `string` schema plus an `UNKNOWN_TYPE` warning diagnostic.

A type name that matches an entry in `ir.enums` is emitted as `{ type: "string", enum: [...] }` using the enum value names. Nullable types are expressed as an array-form union (for example `type: ["string", "null"]`); a nullable type with no base `type` is left unchanged.

Property defaults are emitted as `default`, and the `readonly` modifier sets `readOnly: true`. Static constraint bounds are extracted via `analyzeConstraints()` from `src/manifest/constraint-analysis.ts`: numeric ranges populate `minimum`/`maximum`, length constraints populate `minLength`/`maxLength`, and the first pattern constraint per property populates `pattern`. Computed properties (when included) are emitted as `readOnly` with a `description` of `Computed: <expression>`.

## Options

`JsonSchemaProjectionOptions` accepts `draft` (`'draft-07' | '2019-09' | '2020-12'`, default `draft-07`), `includeComputed` (default `true`), `strictAdditionalProperties` (default `true`), and `baseUri` (default unset). The two boolean options default to `true` unless explicitly set to `false`.

## Notes & limitations

The projection is self-contained and adds no new dependencies; it relies only on existing IR types and the shared constraint-analysis utility. Pattern constraints are collapsed to a single `pattern` keyword — when a property has multiple pattern constraints, only the first is emitted. The nullable handling uses the array-type-union form across all three drafts rather than draft-specific idioms such as `oneOf`. There is no dedicated CLI command; invoke the projection programmatically through `getProjection('jsonschema')`.
