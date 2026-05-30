# Plugin API

The Plugin API is a stable contract for extending Manifest tooling and runtime without touching language semantics. Plugins are declared in `manifest.config.yaml`, loaded by the plugin loader, and may contribute projections, store adapters, audit sinks, expression builtins, and CLI commands. This page combines the plugin-api, custom-store-adapter, and custom-expression-functions features. It is verified against `src/manifest/plugin-api.ts` and `src/manifest/plugin-loader.ts`.

## Usage / Syntax

A plugin is an object matching the `ManifestPlugin` interface, typically built with the `definePlugin` helper:

```ts
import { definePlugin } from '@angriff36/manifest/plugin-api';

export default definePlugin({
  manifest: {
    name: '@acme/manifest-plugin-redis',
    version: '1.0.0',
    pluginApiVersion: '1',
    manifestVersion: '>=1.0.0',
    description: 'Redis store adapter for Manifest',
  },
  storeAdapters: [
    {
      scheme: 'redis',
      createStore(entityName, options) {
        return new RedisStore(entityName, options?.connectionUrl as string);
      },
    },
  ],
  builtins: [
    { name: 'slugify', purity: 'pure', arity: 1, fn: (s) => String(s).toLowerCase().replace(/\s+/g, '-') },
  ],
});
```

Plugins are declared in config under the `plugins` key as `PluginDeclaration` entries (`{ module, options?, enabled? }`) and loaded with `loadPlugins(declarations, { manifestVersion })` from `@angriff36/manifest/plugin-loader`.

## Behavior / What it does

`PLUGIN_API_VERSION` is `'1'`. `definePlugin` validates at definition time: it requires `manifest`, `manifest.name`, and `manifest.version`, enforces that `manifest.pluginApiVersion` equals `PLUGIN_API_VERSION` exactly, and rejects any store adapter whose `scheme` is a built-in target (`memory`, `localStorage`, `postgres`, `supabase`, `durable`, `mongodb`).

The loader (`loadPlugins`) processes each declaration in order: it skips disabled plugins, resolves the module (absolute, relative `./`/`../`, or npm package via `createRequire`), dynamic-imports it, and validates shape (accepting either a default export or a named `plugin`-shaped object). It then checks Manifest version compatibility against `manifest.manifestVersion` using a minimal SemVer matcher that supports exact, `>=`, `<`, `^`, `~`, and compound ranges; an incompatible plugin produces a warning and is skipped.

For each loaded plugin the loader:

- **Projections** are registered via `registerProjection`; a registration failure becomes a warning and does not abort the load.
- **Store adapters** are collected into a `CompositeStoreProvider`. Schemes colliding with built-in targets are rejected with an error; duplicate schemes across plugins are skipped (first registered wins). The provider lazily creates and caches one store per `scheme:entityName` key.
- **Audit sinks** are collected into a factory map keyed by sink `id`; duplicate ids are skipped.
- **Builtins** are merged into a name→function map. Reserved names (see reference) are rejected with an error; a name already registered by another plugin produces a warning and the duplicate is skipped.
- **CLI commands** are collected for later registration via `registerPluginCliCommands(cliCommands, program)`, which calls each command's `register(program)` against a minimal `CliProgramLike` interface (decoupled from commander.js).
- **onLoad** lifecycle hooks are awaited, receiving a `PluginContext` with `options` and `manifestVersion`.

`loadPlugins` returns `LoadedPluginRegistries` containing the composite store provider, builtins map, audit sink factories, collected CLI commands, the list of loaded plugins, and an array of diagnostics (severity `error`/`warning`/`info`).

## Reference

Extension-point interfaces (from `plugin-api.ts`):

- `StoreAdapterPlugin`: `{ scheme: string; createStore(entityName, options?): Store | Promise<Store> }`. `Store<T>` exposes `getAll`, `getById`, `create`, `update`, `delete`, `clear`.
- `AuditSinkPlugin`: `{ id: string; createSink(options?): AuditSink | Promise<AuditSink> }`.
- `BuiltinFunctionPlugin`: `{ name: string; purity: 'pure' | 'time-dependent' | 'random'; arity: number; fn: (...args) => unknown }` (`arity` of `-1` indicates variadic).
- `CliCommandPlugin`: `{ name: string; register(program: CliProgramLike): void }`.
- `ManifestPlugin`: `{ manifest, projections?, storeAdapters?, auditSinks?, builtins?, cliCommands?, onLoad? }`.

Constants: `PLUGIN_API_VERSION = '1'`. `BUILTIN_STORE_TARGETS` = `memory`, `localStorage`, `postgres`, `supabase`, `durable`, `mongodb`. `RESERVED_BUILTIN_NAMES` = `now`, `uuid`, `trim`, `split`, `count`, `startsWith`, `endsWith`, `replace`, `toUpperCase`, `toLowerCase`, `length`, `substring`, `indexOf`, `matches`, `abs`, `round`, `floor`, `ceil`, `min`, `max`, `between`, `sum`, `avg`, `min_of`, `max_of`, `count_of`, `filter`, `map`, `year`, `month`, `day`, `hours`, `minutes`, `seconds`, `flag`.

## Notes & limitations

The API has no IR-mutation hook by design: plugins extend tooling and runtime, never language semantics. The store provider only resolves a store when a `scheme` argument is supplied; without a scheme it returns `undefined`. The SemVer matcher is intentionally minimal and recognizes only the forms listed above. Version incompatibility is non-fatal (warn-and-skip), as are projection registration failures and duplicate builtin/sink registrations, so a partially-loaded plugin set is possible — inspect the returned `diagnostics` to detect skipped contributions. The `manifest plugins list` CLI command reads declarations from config and reports module name, enabled flag, and whether options are present; it does not import or execute the plugins.
