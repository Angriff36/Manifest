---
title: "Projections and Registries API"
description: "Public projection classes, route types, and registry emission APIs."
---

> **AUTO-GENERATED REFERENCE.** This file in `docs/codedocs/` is a
> code-derived reference snapshot of repository structure and signatures.
> It is intended for tooling (Context7, search indexers, etc.) and is
> NOT verified prose on every regeneration. For normative, hand-curated
> documentation see [`docs/spec/`](../../spec/) — in particular
> [`docs/spec/manifest-vnext.md`](../../spec/manifest-vnext.md) for language
> semantics and [`docs/spec/config/manifest.config.md`](../../spec/config/manifest.config.md)
> for projection configuration. Projections are described here as
> **tooling, not language semantics** — they consume IR and emit
> artifacts; they do not redefine policy/guard/constraint behaviour.


## Import Paths

```ts
import { NextJsProjection } from '@angriff36/manifest/projections/nextjs';
import { RoutesProjection } from '@angriff36/manifest/projections/routes';
import type {
  RouteEntry,
  RouteManifest,
  RouteParam,
  RoutesProjectionOptions,
  ManualRouteDeclaration,
} from '@angriff36/manifest/projections/routes';

import { emitRegistries, UNOWNED_ENTITY_NAME } from '@angriff36/manifest/registry/emit';
import type {
  EntityClassification,
  CommandRegistryEntry,
  EntityRegistryEntry,
  CommandRegistry,
  EntityRegistry,
} from '@angriff36/manifest/registry/emit';
```

## `NextJsProjection`

Source: `src/manifest/projections/nextjs/generator.ts`

```ts
class NextJsProjection {
  readonly name = 'nextjs'
  readonly description: string
  readonly surfaces = [
    'nextjs.route',
    'nextjs.detail',
    'nextjs.command',
    'nextjs.dispatcher',
    'ts.types',
    'ts.client',
  ]

  generate(ir: IR, request: ProjectionRequest): ProjectionResult
}
```

Supported surfaces:

- `nextjs.route`
- `nextjs.detail`
- `nextjs.command`
- `nextjs.dispatcher`
- `ts.types`
- `ts.client`

The request's `options` object uses the shape defined in `src/manifest/projections/interface.ts`, including `authProvider`, import paths, tenant and soft-delete filtering flags, tenant-provider settings, `appDir`, `strictMode`, `includeComments`, and `indentSize`.

Example:

```ts
const projection = new NextJsProjection();

const result = projection.generate(ir, {
  surface: 'nextjs.command',
  entity: 'Recipe',
  command: 'publish',
  options: {
    authProvider: 'clerk',
    runtimeImportPath: '@repo/manifest/runtime',
    responseImportPath: '@/lib/manifest-response',
  },
});
```

## `RoutesProjection`

Source: `src/manifest/projections/routes/generator.ts`

```ts
class RoutesProjection {
  readonly name = 'routes'
  readonly description: string
  readonly surfaces = ['routes.manifest', 'routes.ts']

  generate(ir: IR, request: ProjectionRequest): ProjectionResult
}
```

### `RoutesProjectionOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `basePath` | `string` | `"/api"` | Prefix applied to all derived routes. |
| `includeAuth` | `boolean` | `true` | Whether emitted entries include auth expectations. |
| `includeTenant` | `boolean` | `true` | Whether emitted entries include tenant expectations. |
| `manualRoutes` | `ManualRouteDeclaration[]` | `[]` | Extra transport routes to merge into the manifest. |
| `generatedAt` | `string` | `new Date().toISOString()` | Optional deterministic timestamp override. |

### Route Types

```ts
type ParamLocation = 'path' | 'query' | 'body';

interface RouteParam {
  name: string;
  type: string;
  location: ParamLocation;
  required?: boolean;
}

interface RouteEntry {
  id: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  params: RouteParam[];
  source: RouteSource;
  auth: boolean;
  tenant: boolean;
}

interface RouteManifest {
  $schema: string;
  version: '1.0';
  generatedAt: string;
  basePath: string;
  routes: RouteEntry[];
}
```

Example:

```ts
const projection = new RoutesProjection();
const manifest = projection.generate(ir, {
  surface: 'routes.manifest',
  options: {
    manualRoutes: [{
      id: 'health',
      path: '/api/health',
      method: 'GET',
    }],
  },
});
```

## `emitRegistries`

Source: `src/manifest/registry/emit.ts`

```ts
const UNOWNED_ENTITY_NAME = '__unowned__'

function emitRegistries(ir: IR): {
  commands: CommandRegistry;
  entities: EntityRegistry;
}
```

Registry types:

```ts
type EntityClassification =
  | 'governed'
  | 'read_only_projection'
  | 'infrastructure'
  | 'bypass_allowed'
  | 'unknown_nonconforming';

interface CommandRegistryEntry {
  entity: string;
  command: string;
  commandId: string;
  policies: string[];
  guardCount: number;
  emits: string[];
  effects: string[];
}

interface EntityRegistryEntry {
  name: string;
  classification: EntityClassification;
  tenantScoped: boolean;
  commands: string[];
  properties: string[];
}
```

Example:

```ts
const { commands, entities } = emitRegistries(ir);

console.log(commands.commands.map((entry) => entry.commandId));
console.log(entities.entities.find((entry) => entry.name === 'Recipe'));
```

## `PrismaProjection`

Source: `src/manifest/projections/prisma/generator.ts`

```ts
import { PrismaProjection } from '@angriff36/manifest/projections/prisma';

class PrismaProjection {
  readonly name = 'prisma'
  readonly description: string
  readonly surfaces = ['prisma.schema']

  generate(ir: IR, request: ProjectionRequest): ProjectionResult
}
```

Supported surfaces:

- `prisma.schema` — emits a `schema.prisma` artifact. When `provider` is set, also emits a `prisma.config.ts` companion artifact (Prisma 7+ requires the connection URL there, not in the schema file).

`options` shape (`PrismaProjectionOptions`):

| Field | Type | Description |
|-------|------|-------------|
| `provider` | `'postgresql' \| 'mysql' \| ...` | Emits a `datasource db { ... }` block. When set, a `prisma.config.ts` companion is also emitted. |
| `urlEnvVar` | `string` | Env var for the URL in the companion (default: `DATABASE_URL`). |
| `tableMappings` | `Record<EntityName, string>` | `@@map(...)` table name overrides per entity. |
| `columnMappings` | `Record<EntityName, Record<PropName, string>>` | `@map(...)` column overrides. |
| `precision` | `Record<EntityName, Record<PropName, { precision, scale }>>` | `@db.Decimal(p, s)` per field. |
| `typeMappings` | `Record<EntityName, Record<PropName, string>>` | Override IR type → Prisma scalar (required for `number`-typed fields). |
| `foreignKeys` | `Record<EntityName, Record<RelName, string>>` | FK field name override for `belongsTo`/`ref` without an IR `foreignKey` annotation. |
| `indexes` | `Record<EntityName, IndexEntry[]>` | Additional `@@index([...])` lines. |
| `output` | `string` | `pathHint` for the schema artifact (default: `schema.prisma`). |

**IR features emitted:**

- Composite PK (`key [f1, f2]`) → `@@id([f1, f2])`
- Alternate key (`unique [f1, f2]`) → `@@unique([f1, f2])`
- Composite FK (`fields [...] references [...]`) → `@relation(fields: [...], references: [...])`
- Referential actions (`onDelete restrict`) → `onDelete: Restrict` in PascalCase
- Absent `onDelete`/`onUpdate` → nothing emitted (Prisma default)

**Diagnostics:**

- `PRISMA_AMBIGUOUS_NUMBER` (error) — `number`-typed property with no `typeMappings` override; column skipped
- `PRISMA_NO_ID_PROPERTY` (error) — entity has no `id` property and no `key`; model skipped
- `PRISMA_SKIPPED_NON_DURABLE` (info) — entity store is `memory`/`localStorage`; skipped
- `PRISMA_SKIPPED_NO_STORE` (info) — entity has no store declaration; skipped
- `PRISMA_SKIPPED_EXTERNAL` (info) — entity is marked external; skipped

Example:

```ts
const projection = new PrismaProjection();

const result = projection.generate(ir, {
  surface: 'prisma.schema',
  options: {
    provider: 'postgresql',
    tableMappings: { Order: 'orders' },
    typeMappings: { Order: { createdAt: 'BigInt', totalAmount: 'Decimal' } },
  },
});

// result.artifacts[0] → schema.prisma
// result.artifacts[1] → prisma.config.ts (present when provider is set)
const schema = result.artifacts[0].code;
const config = result.artifacts[1]?.code;
```

---

## Common Pattern

Generate app code and governance data from the same IR:

```ts
const nextjs = new NextJsProjection();
const routes = new RoutesProjection();

const dispatcher = nextjs.generate(ir, { surface: 'nextjs.dispatcher' });
const routeManifest = routes.generate(ir, { surface: 'routes.manifest' });
const registries = emitRegistries(ir);
```

This is the intended composition model in the source tree: one IR, many tooling outputs, no duplicated semantics.
