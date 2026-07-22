# Next.js Projection

The Next.js projection turns compiled Manifest IR into App Router API artifacts: route handlers for reads, a canonical command dispatcher for writes, generated TypeScript types, and a client SDK. Use it when you want transport code that stays anchored to your domain contract without hand-maintaining route handlers as the IR evolves.

## What it generates

The projection registers under the name `nextjs` and exposes ~~nine~~ **twelve** surfaces:

~~`nextjs.route`, `nextjs.detail`, `nextjs.command`, `nextjs.dispatcher`, `nextjs.subscribe`, `nextjs.subscriptionHook`, `nextjs.sharedRuntime`, `ts.types`, `ts.client`~~

> **Correction (2026-07-15) @RYANSIGNED:** `NEXTJS_DESCRIPTOR_META.surfaces` lists
> **12** surfaces (`src/manifest/projections/nextjs/descriptor-meta.ts`):
> `nextjs.route`, `nextjs.detail`, `nextjs.command`, `nextjs.dispatcher`,
> `nextjs.subscribe`, `nextjs.subscriptionHook`, `nextjs.sharedRuntime`,
> `nextjs.schedule`, `nextjs.webhook`, `nextjs.companions`, `ts.types`,
> `ts.client`. Package pin SoT: `package.json` = **3.6.41**.

`nextjs.route` and `nextjs.detail` emit GET handlers for an entity — a list route and a single-record detail route. By design these reads issue direct Prisma queries against the client at `databaseImportPath` and bypass the runtime engine, because Manifest does not enforce `read` policies during command execution and direct queries avoid runtime overhead for simple fetches.

`nextjs.dispatcher` is the canonical write surface. It emits a single handler mounted at `POST /api/manifest/[entity]/commands/[command]` that routes every command through the Manifest runtime. Writes must go through the runtime so that guards, constraints, execute/all policies, and event emission all run. The dispatcher defaults to constructing a `createManifestRuntime` instance per request and calling `runtime.runCommand`; it can instead delegate to an app-supplied executor (see Options).

`nextjs.command` emits a concrete per-command route. It is a deprecated surface — disabled by default and, when enabled, marked as a legacy alias of the dispatcher. `ts.types` emits shared TypeScript interfaces for the entities, and `ts.client` emits fetch helpers for a frontend client.

## Usage

Compile to IR, then call `generate` per surface, writing each artifact at its `pathHint`.

```ts
import { compileToIR } from '@angriff36/manifest/ir-compiler';
import { NextJsProjection } from '@angriff36/manifest/projections/nextjs';

const { ir, diagnostics } = await compileToIR(source);
if (!ir || diagnostics.some((d) => d.severity === 'error')) {
  throw new Error(JSON.stringify(diagnostics, null, 2));
}

const projection = new NextJsProjection();

const dispatcher = projection.generate(ir, {
  surface: 'nextjs.dispatcher',
  options: {
    authProvider: 'clerk',
    databaseImportPath: '@repo/database',
    runtimeImportPath: '@repo/manifest/runtime',
    responseImportPath: '@/lib/manifest-response',
  },
});

const listRoute = projection.generate(ir, {
  surface: 'nextjs.route',
  entity: 'Recipe',
  options: { authProvider: 'clerk', databaseImportPath: '@repo/database' },
});

const types = projection.generate(ir, { surface: 'ts.types' });
```

You can also resolve the projection through the registry, which auto-registers all builtins on first access:

```ts
import { getProjection } from '@angriff36/manifest/projections';

const projection = getProjection('nextjs');
const result = projection?.generate(ir, { surface: 'nextjs.dispatcher' });
```

From the CLI the same projection backs `manifest generate`. The `nextjs` projection has dedicated multi-surface orchestration so `--surface all` fans out across route, dispatcher, types, and client:

```bash
pnpm exec manifest compile modules/recipe.manifest -o ir/
pnpm exec manifest generate ir/recipe.ir.json -p nextjs -s all -o apps/api/app/api/
```

## Type mapping & behavior

The read routes generate Prisma `findMany` / `findUnique` calls. When tenant filtering is enabled (the default), the handler resolves a tenant from the configured auth identity and adds it to the `where` clause; soft-delete filtering adds `deletedAt: null`. Both the tenant ID property and the soft-delete property names are configurable, and either filter can be turned off entirely. The default tenant resolution looks up a `userTenantMapping.findUnique` record, but a pluggable `tenantProvider` can replace that with an app function keyed on `orgId` or `userId`.

The read-query builders are **field-aware**: a clause is only emitted when the entity actually declares the column. The soft-delete filter (`deletedAt: null`) is omitted for entities without the soft-delete property even when `includeSoftDeleteFilter` is on, and the list `orderBy` uses `createdAt` only when that column exists, falling back to the always-present `id` otherwise. This keeps generated queries valid for entities that don't follow the soft-delete / timestamp conventions, rather than emitting clauses Prisma rejects at runtime.

Authentication is driven by `authProvider`. `clerk` emits a `@clerk/nextjs` auth call, `nextauth` emits `getServerSession`, `custom` imports from `authImportPath`, and `none` uses a fixed anonymous identity. Auth rejections return the configurable `unauthorizedStatus` (default 401) and never surface as a 500.

The `ts.types` surface maps IR scalars to TypeScript. `float`, `bigint`, and `integer` (alongside `int`, `decimal`) all map to `number`; `boolean` to `boolean`; `string` to `string`. Array/list properties emit a real element type — `array<string>` becomes `string[]` (and falls back to `unknown[]` when the element type is absent) rather than leaking the bare `array` token. `date`/`datetime` map to `Date` by default, or to `string` when `dateSerialization: 'iso-string'` is set (see Options). A nullable IR type yields `T | null`.

The default URL route segment derived from each entity name is governed by `routeCasing`. The legacy default `'lowercase'` flattens `PrepTask` to `preptask`; `'kebab-case'` → `prep-task`, `'snake_case'` → `prep_task`, and `'preserve'` keeps `PrepTask` verbatim. Explicit `routeSegments` overrides always take precedence over the derived casing.

## Options

The full options object is `NextJsProjectionOptions` in `src/manifest/projections/interface.ts`. The commonly used fields are the import paths (`authImportPath`, `databaseImportPath`, `responseImportPath`, `runtimeImportPath`, default `@/lib/auth`, `@/lib/database`, `@/lib/manifest-response`, `@/lib/manifest-runtime`), the auth selector `authProvider`, the filter toggles `includeTenantFilter` and `includeSoftDeleteFilter` with their `tenantIdProperty` / `deletedAtProperty` names, the `appDir` (default `app/api`), and formatting flags `strictMode`, `includeComments`, and `indentSize`.

Three nested option groups control the write and read surfaces. `dispatcher` controls the canonical write route: `enabled` (default true), `executionMode` (`inline` default, or `externalExecutor` with `executorImportPath` / `executorImportName`), `deriveInstanceId` (default true, pulls `instanceId`/`id` from the body for non-create commands), and a `path` override. `concreteCommandRoutes` controls the deprecated per-command surface with `enabled` (default false) and `legacyAliasesOnly` (default true). `readRoutes` controls reads with `enabled` (default true) and `directDbReads` (default true; set false to emit read stubs without inlining a Prisma call).

Two options shape the generated route paths and types. `routeCasing` (default `'lowercase'`; `'kebab-case'`, `'snake_case'`, or `'preserve'`) normalizes the route segment derived from each entity name, while explicit `routeSegments` (and `accessorNames`) overrides still take precedence. `dateSerialization` (default `'date'`, or `'iso-string'`) selects whether `date`/`datetime` props in the `ts.types` surface are typed as `Date` or as a transport-friendly `string`. Both are non-breaking.

```ts
const types = projection.generate(ir, {
  surface: 'ts.types',
  options: { routeCasing: 'kebab-case', dateSerialization: 'iso-string' },
});
// PrepTask routes resolve under /api/prep-task; createdAt: string
```

## Notes & limitations

Reads deliberately bypass the runtime engine and assume a Prisma-compatible client. If your project routes reads through a separate query layer, set `readRoutes.directDbReads` to false rather than expecting the projection to enforce read policies — it does not.

The bundled `src/manifest/projections/nextjs/README.md` documents an older API (`projection.generateRoute(ir, 'Recipe')`, `generateTypes`, `generateClient`) and an `outputPath` option. The current generator implements the `ProjectionTarget` contract through the single `generate(ir, request)` entry point and does not accept `outputPath` — file writing is the caller's responsibility, with the suggested location returned as each artifact's `pathHint`. Prefer the surface-based API above; the README examples are stale.
