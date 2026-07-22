---
title: Manifest Configuration Reference
updated: 2026-07-15
source_of_truth: true
source_of_truth_for: 'Prose reference for manifest.config keys and projection/runtime configuration'
authority: Binding
must_reconcile_to:
  - docs/spec/config/manifest.config.schema.json
does_not_define: 'Machine-validated key set when this prose disagrees — JSON schema wins'
---

# Manifest Configuration Reference

`manifest.config.{yaml,yml,ts,js}` is the **single declaration point** for
everything Manifest's projections and runtime do at code-generation time.
This document is the canonical reference: every documented key here exists
in the JSON schema at
[`docs/spec/config/manifest.config.schema.json`](./manifest.config.schema.json)
and in the exported defaults at
[`src/manifest/projections/nextjs/defaults.ts`](../../../src/manifest/projections/nextjs/defaults.ts).

If those three artifacts ever disagree, **the JSON schema wins** — it is
the executable contract that the CLI validates against.

---

## File formats

Manifest accepts both formats; if both exist, the TypeScript runtime
config takes precedence over YAML for its `build` sub-block.

| File                            | Role                                | Validated by        |
| ------------------------------- | ----------------------------------- | ------------------- |
| `manifest.config.yaml` / `.yml` | Build-level (declarative)           | JSON schema         |
| `.manifestrc.yaml` / `.yml`     | Build-level (alternate name)        | JSON schema         |
| `manifest.config.ts` / `.js`    | Runtime-level (stores, resolveUser) | Structural (loader) |

The TypeScript file may _also_ contain a `build` block — that block is
merged on top of YAML and validated identically.

### Validation and editor IntelliSense

`manifest config validate` always loads the schema **bundled with the package**
at `docs/spec/config/manifest.config.schema.json` (shipped via
`package.json#files`). It never fetches a URL. Manifest does **not** publish a
resolvable `$schema` URL — adding one to your config would imply remote
validation that does not happen.

For editor IntelliSense without a dead URL, map the bundled schema in
`.vscode/settings.json`:

```jsonc
// .vscode/settings.json
{
  "yaml.schemas": {
    "./node_modules/@angriff36/manifest/docs/spec/config/manifest.config.schema.json": [
      "manifest.config.yaml",
      "manifest.config.yml",
      ".manifestrc.yaml",
      ".manifestrc.yml",
    ],
  },
}
```

The `$schema` key is still accepted in config (it's optional). If you set it,
point it at a real local path — never a public URL Manifest doesn't host.

---

## Typed TypeScript config (`defineConfig`)

For `manifest.config.ts`, import the typed `defineConfig` helper to get
autocomplete and compile-time checking of the config shape:

```ts
// manifest.config.ts
import { defineConfig } from '@angriff36/manifest/config';
import { PrismaOrderStore } from './stores/order';

export default defineConfig({
  stores: {
    Order: { implementation: PrismaOrderStore, prismaModel: 'orders' },
  },
  resolveUser: async (auth) => {
    const session = await getSession(auth.headers);
    return session ? { id: session.userId, role: session.role } : null;
  },
  build: {
    src: 'modules/**/*.manifest',
    output: 'ir/',
    hooks: { provider: 'husky', runValidate: true },
    plugins: [{ module: '@acme/manifest-audit' }],
  },
});
```

`defineConfig` is an **identity function** — it returns its argument unchanged
at runtime and injects no defaults; it exists purely for editor/type support.
The exported types (`ManifestRuntimeConfig`, `ManifestBuildConfig`,
`ManifestHooksConfig`, `ManifestPluginDeclaration`, …) are available from the
same `@angriff36/manifest/config` entry point.

### Complete PostgreSQL runtime-companion example

`DATABASE_URL` alone is not enough. It tells a PostgreSQL adapter how to connect,
but the runtime also needs an adapter for every durable entity and the table that
adapter owns.

```manifest
entity Customer { property required id: uuid }
entity Invoice { property required id: uuid }
store Customer in postgres
store Invoice in postgres
```

```env
DATABASE_URL=postgresql://user:password@localhost:5432/acme
```

```ts
// manifest.config.ts
import { defineConfig } from '@angriff36/manifest/config';
import { PostgresStore } from '@angriff36/manifest/stores';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

export default defineConfig({
  stores: {
    Customer: { implementation: new PostgresStore({ connectionString, tableName: 'customers' }) },
    Invoice: { implementation: new PostgresStore({ connectionString, tableName: 'invoices' }) },
  },
});
```

```yaml
# manifest.config.yaml
projections:
  nextjs:
    output: generated
    options:
      # Relative to the emitted lib/manifest-runtime.ts companion.
      runtimeConfigImport: '../manifest.config'
```

The generated factory imports `manifest.config.ts`, builds a per-entity
`storeProvider`, and passes it to `RuntimeEngine`. A binding may contain a ready
instance, a zero-argument store class, or a zero-argument factory. Use an
instance or factory when construction needs arguments.

Only `memory` and browser `localStorage` work without runtime store
configuration. A zero-config generated factory for `postgres`, `supabase`,
`durable`, or a custom target fails clearly instead of falling back to memory.

> The types cover the config surface that ships **today**, including Config G5
> (`projections.enabled` / `projections.defaults`), Config G2
> (`validation.failOn`), Config G3 (`mergeIntegrity`), Config G8–G10, and
> related keys. Still proposed only: G2 rule registries / requireDescriptions,
> G4 provenance config, G7 runtime — see
> [design proposal](../../internal/proposals/config/manifest-config-vnext.md).
>
> ~~The richer vNext sections (validation, merge integrity, provenance, runtime,
> drift gates) are a design proposal, not implemented~~ — **Correction
> (2026-07-15):** G5 shipped; G2 `failOn` shipped (rules registry still open);
> G10 and other Part-2 keys remain unbuilt.
>
> ~~Correction (2026-07-15): G5 shipped; G2/G10 remain~~ — **Update
> (2026-07-15):** G2 `validation.failOn` also shipped.
>
> **Correction (2026-07-22):** G3 `mergeIntegrity` shipped (`error` \| `lastWins`).

---

## Top-level keys

| Key            | Default           | Type   | What it controls                                                                                                                                          |
| -------------- | ----------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src`          | `**/*.manifest`   | string | Glob for source `.manifest` files.                                                                                                                        |
| `output`       | `ir/`             | string | Directory for compiled IR JSON.                                                                                                                           |
| `prismaSchema` | (auto-discovered) | string | Optional path to a Prisma schema for property alignment scans. When omitted, Manifest checks `prisma/schema.prisma`, `schema.prisma`, `db/schema.prisma`. |
| `validation`   | (see G2)          | object | Config G2 CI exit policy (`failOn`). Does not change language severities.                                                                                 |
| `mergeIntegrity` | (see G3)        | object | Config G3 multi-module merge collision policy (`onDuplicateEntity` / `onDuplicateCommand`). Default remains strict `error`.                              |
| `driftGates`   | (see G10)         | object | Config G10 declarative CI gates for `manifest ci-gate`.                                                                                                   |
| `projections`  | `{}`              | object | Per-projection config blocks, plus optional G5 `enabled` / `defaults` (see below).                                                                         |
| `env`          | `{}`              | object | Environment-variable declarations for `manifest preflight`. Grouped under `stores`, `auth`, `adapters`, `custom`.                                         |
| `hooks`        | (see below)       | object | Git pre-commit hook settings consumed by `manifest install-hooks`.                                                                                        |
| `plugins`      | `[]`              | array  | Third-party plugin declarations loaded by the CLI; inspected via `manifest plugins`.                                                                      |
| `naming`       | (off)             | mixed  | Identifier naming policy. Legacy physical convention and/or opt-in normalization — see **`naming`**.                                                      |

---

## `validation.failOn` (Config G2)

Added 2026-07-15. Controls whether `manifest compile` / `manifest validate`
exit non-zero after reporting diagnostics. **Does not** change language
diagnostic severities (a `block` diagnostic remains a block).

```yaml
validation:
  failOn: warn   # block | warn | never  (default: block)
```

| Value   | Exit non-zero when                         |
| ------- | ------------------------------------------ |
| `block` | Error-severity diagnostics only (default)  |
| `warn`  | Errors **or** warnings                     |
| `never` | Never (report-only; still prints findings) |

## `mergeIntegrity` (Config G3)

Added 2026-07-22. Controls how `manifest compile --merge` / `compile --all`
handles the same entity or command name declared in more than one `.manifest`
file. **Default is unchanged:** duplicates are errors.

```yaml
mergeIntegrity:
  onDuplicateEntity: error      # error | lastWins  (default: error)
  onDuplicateCommand: error     # error | lastWins  (default: error)
  moduleOrder: lexicographic    # only supported value
  allowCrossModuleRefs: true    # set false to forbid cross-file relationships/stores
  forbidCycles: true            # required; false is rejected
```

| Policy     | Behavior                                                                 |
| ---------- | ------------------------------------------------------------------------ |
| `error`    | Duplicate names across files fail the compile (historical default)       |
| `lastWins` | Keep the declaration from the last file in topological compile order     |

`namespace` is **not** implemented. Enum and tenant duplicates stay hard errors.

CLI overrides: `--fail-on <policy>` on `compile` / `validate`. `validate --strict`
is an alias for `--fail-on warn`.

Rule registries / `requireDescriptions` / conformance knobs from the vNext
proposal remain unbuilt.

---

## `driftGates` (Config G10)

Added 2026-07-15. Declarative CI integrity gates enforced by
`manifest ci-gate`.

```yaml
driftGates:
  effectiveConfigSnapshot: .manifest/effective-config.snapshot.json
  failOnConfigDrift: true          # default true when snapshot path is set
  failOnGeneratedDrift: false      # runs generate --all --check when true
  pinIrSchemaVersion: "1.0"        # optional IR version pin
```

```bash
# Refresh the committed effective-config snapshot
manifest ci-gate --write-snapshot

# Run all configured gates (exits non-zero on failure)
manifest ci-gate
```

This replaces the prose four-step recipe below with a single command when
`driftGates` is configured. The manual recipe remains valid for repos that
prefer explicit steps.

---

## `projections.enabled` / `projections.defaults` (Config G5)

Added 2026-07-15. These are **meta keys** under `projections` — not projection
targets. `manifest config validate` accepts them; `manifest generate --all`
honors them.

```yaml
projections:
  enabled: [nextjs, zod]       # opt-in list (order preserved); omit = all declared targets
  defaults:                    # shared options under every target's options
    includeComments: true
  nextjs:
    output: apps/api/
    options:
      authProvider: clerk      # wins over defaults for the same key
  zod:
    output: schemas/
```

| Key        | Default                         | Type     | Behavior                                                                                                                                 |
| ---------- | ------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`  | (absent = all declared targets) | string[] | When set, `manifest generate --all` runs only these names. Declared blocks not listed are skipped. Names without `output` still warn-skip. |
| `defaults` | `{}`                            | object   | Shallow-merged under each projection's `options` via `resolveProjectionOptions` (per-projection keys win; then global `naming` inheritance). |

---

## `hooks`

Settings for `manifest install-hooks`, which installs a git pre-commit hook that
runs Manifest checks before each commit.

```yaml
hooks:
  skipInCi: true # default
  provider: husky # husky | simple-git-hooks
  runFmt: true # default
  runValidate: true # default
```

| Key           | Default | Type                          | What it controls                                            |
| ------------- | ------- | ----------------------------- | ----------------------------------------------------------- |
| `skipInCi`    | `true`  | boolean                       | Skip running the generated hook in CI environments.         |
| `provider`    | `husky` | `husky` \| `simple-git-hooks` | Git hook manager the pre-commit hook is installed into.     |
| `runFmt`      | `true`  | boolean                       | Run `manifest fmt` from the generated pre-commit hook.      |
| `runValidate` | `true`  | boolean                       | Run `manifest validate` from the generated pre-commit hook. |

---

## `plugins`

Declares Manifest plugins for the CLI to load. Each entry points at an npm
package or a relative module path. List loaded plugins with `manifest plugins`.

```yaml
plugins:
  - module: '@acme/manifest-audit' # npm package or relative path
    enabled: true # default true
    options:
      level: strict
  - module: './local/redaction-plugin.ts'
```

| Key       | Required | Default | Type    | What it controls                                             |
| --------- | -------- | ------- | ------- | ------------------------------------------------------------ |
| `module`  | yes      | —       | string  | npm package name or relative file path to the plugin module. |
| `options` | no       | —       | object  | Plugin-specific options passed to the plugin at load time.   |
| `enabled` | no       | `true`  | boolean | Whether the plugin is active.                                |

---

## `naming`

Controls identifier spelling. **Normalization is off by default** so existing
projects keep verbatim IR names.

### Legacy (unchanged)

```yaml
naming: snake_case
# or
naming:
  table: snake_case
  column: snake_case
  pluralizeTables: true
```

Inherited by projections as a physical `@map` / table convention only.

### Expanded (opt-in normalization)

```yaml
naming:
  normalization: true # master switch (default false)
  convention: snake_case # optional physical convention for projections
  entities: { casing: pascal, mismatch: fix }
  fields: { casing: camel, mismatch: fix }
  relationships: { casing: camel, idSuffix: Id, mismatch: fix }
  commands: { casing: camel, mismatch: fix }
  events: { casing: pascal, mismatch: fix }
  collections: { casing: camel, pluralization: automatic, mismatch: fix }
  tables: { casing: camel, pluralization: automatic, mismatch: fix }
  ambiguousWordBoundaries: warn
  aliases:
    writer: author
  irregularPlurals:
    Person: people
  projections:
    convex:
      tables:
        CateringEvent: events
      fields:
        Article.author: writerId
```

| `mismatch` | Behavior                                                             |
| ---------- | -------------------------------------------------------------------- |
| `off`      | Ignore                                                               |
| `warn`     | Keep source spelling; warn                                           |
| `error`    | Fail compile                                                         |
| `fix`      | Normalize generated output only (never rewrites `.manifest` sources) |

`resolveNamingConfig` / `resolveBuildNaming` from `@angriff36/manifest/config`
expose the resolved policy for Builder and tooling.

---

## `projections.nextjs`

| Key       | Default      | Type   | What it controls                                        |
| --------- | ------------ | ------ | ------------------------------------------------------- |
| `output`  | `generated/` | string | Directory where generated TypeScript files are written. |
| `options` | (see below)  | object | Surface-specific options for the Next.js projection.    |

### `projections.nextjs.options`

Every key here is **Manifest-generic** — it shapes the code Manifest
emits but encodes no downstream-app branding.

| Key                       | Default                                                                                     | Allowed values                                      | Generated behaviour                                                                                                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authProvider`            | `clerk`                                                                                     | `clerk`, `nextauth`, `custom`, `none`               | Selects the auth check template. `none` emits an `anonymous` user; `custom` imports `{ getUser }`; the others import their respective helpers.                                                                                                                                   |
| `authImportPath`          | `@repo/auth/server`                                                                         | string                                              | Module that exports the auth helper. Combined with `authProvider` to produce the `import { auth } from "..."` line.                                                                                                                                                              |
| `databaseImportPath`      | `@repo/database`                                                                            | string                                              | Module that exports the `database` client used by direct-read routes.                                                                                                                                                                                                            |
| `responseImportPath`      | `@/lib/manifest-response`                                                                   | string                                              | Module that exports `manifestErrorResponse`, `manifestSuccessResponse`, `normalizeCommandResult`.                                                                                                                                                                                |
| `runtimeImportPath`       | `@/lib/manifest-runtime`                                                                    | string                                              | Module that exports `createManifestRuntime`. **Only used when `dispatcher.executionMode` is `inline`.**                                                                                                                                                                          |
| `runtimeConfigImport`     | (none)                                                                                      | string                                              | Import written into the generated runtime companion for `manifest.config.ts`. Required for generated inline runtimes with durable stores. Resolve it relative to the emitted runtime file.                                                                                       |
| `includeTenantFilter`     | `true`                                                                                      | boolean                                             | When true, read routes emit `where: { tenantId, ... }` and POST handlers resolve a tenant before executing.                                                                                                                                                                      |
| `includeSoftDeleteFilter` | `true`                                                                                      | boolean                                             | When true, read routes emit `where: { deletedAt: null, ... }`.                                                                                                                                                                                                                   |
| `tenantIdProperty`        | `tenantId`                                                                                  | string                                              | Name of the tenant-scope property used in WHERE clauses and tenant context.                                                                                                                                                                                                      |
| `deletedAtProperty`       | `deletedAt`                                                                                 | string                                              | Name of the soft-delete timestamp property.                                                                                                                                                                                                                                      |
| `appDir`                  | `apps/api/app/api`                                                                          | string                                              | App Router base directory. All `pathHint`s are relative to this.                                                                                                                                                                                                                 |
| `strictMode`              | `true`                                                                                      | boolean                                             | Whether generated TypeScript is strict-mode friendly.                                                                                                                                                                                                                            |
| `includeComments`         | `true`                                                                                      | boolean                                             | Whether to emit explanatory comments above generated handlers.                                                                                                                                                                                                                   |
| `indentSize`              | `2`                                                                                         | integer 1–8                                         | Spaces of indentation in generated code.                                                                                                                                                                                                                                         |
| `unauthorizedStatus`      | `401`                                                                                       | integer (400–499)                                   | HTTP status returned when the auth helper rejects the request **or** throws (invalid/expired token). Auth failures MUST NEVER surface as 500. Override only if you standardise on 403 to avoid user-existence leak.                                                              |
| `routeCasing`             | `lowercase`                                                                                 | `lowercase`, `kebab-case`, `snake_case`, `preserve` | Casing for the default URL route segment derived from each entity name (when no explicit `routeSegments` override applies). `lowercase` (default) is the legacy flattened form (`PrepTask` → `preptask`); `kebab-case` → `prep-task`; `preserve` keeps the entity name verbatim. |
| `dateSerialization`       | `date`                                                                                      | `date`, `iso-string`                                | How `date`/`datetime` scalars are typed in the generated `ts.types` surface. `date` (default) emits `Date`; `iso-string` emits `string` to match JSON/HTTP transport.                                                                                                            |
| `tenantProvider`          | `{ importPath: '@/app/lib/tenant', functionName: 'getTenantIdForOrg', lookupKey: 'orgId' }` | object                                              | Override the default `userTenantMapping.findUnique` pattern with a project-supplied lookup. See **`tenantProvider`** below.                                                                                                                                                      |
| `dispatcher`              | (see below)                                                                                 | object                                              | Configuration for the canonical write surface. See **`dispatcher`** below.                                                                                                                                                                                                       |
| `concreteCommandRoutes`   | (see below)                                                                                 | object                                              | Opt-in policy for the deprecated per-command routes. See **`concreteCommandRoutes`** below.                                                                                                                                                                                      |
| `readRoutes`              | (see below)                                                                                 | object                                              | Policy for direct database read routes. See **`readRoutes`** below.                                                                                                                                                                                                              |

### `tenantProvider`

```yaml
projections:
  nextjs:
    options:
      tenantProvider:
        importPath: '@my-app/data'
        functionName: 'getTenantIdForOrg'
        lookupKey: 'orgId' # or "userId"
```

| Key            | Required | Type                | What it controls                                           |
| -------------- | -------- | ------------------- | ---------------------------------------------------------- |
| `importPath`   | yes      | string              | Module that exports the lookup helper.                     |
| `functionName` | yes      | string              | Named export to call.                                      |
| `lookupKey`    | yes      | `orgId` \| `userId` | Which auth-context field is passed as the lookup argument. |

### `dispatcher`

The dispatcher is the canonical Manifest write surface at
`POST /api/manifest/[entity]/commands/[command]`. Two execution modes are
supported, and any downstream repo can switch between them by editing config
alone — no projection-source edits.

```yaml
projections:
  nextjs:
    options:
      dispatcher:
        enabled: true
        executionMode: inline # or "externalExecutor"
        executorImportPath: '@/lib/manifest-executor'
        executorImportName: 'executeManifestCommand'
        deriveInstanceId: false
```

| Key                  | Default                                          | Type                           | Generated behaviour                                                                                                                                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`            | `true`                                           | boolean                        | When `false`, the `nextjs.dispatcher` surface emits no artifact and surfaces an info-diagnostic.                                                                                                                                                                                                                                 |
| `executionMode`      | `inline`                                         | `inline` \| `externalExecutor` | `inline` (default, back-compat): handler calls `createManifestRuntime(...)` then `runtime.runCommand(...)`. `externalExecutor`: handler imports the configured executor and delegates — **no `createManifestRuntime` or `runtime.runCommand` appears in the emitted code.**                                                      |
| `executorImportPath` | `@/lib/manifest-executor`                        | string                         | Module path for the external executor. Only used in `externalExecutor` mode.                                                                                                                                                                                                                                                     |
| `executorImportName` | `executeManifestCommand`                         | string                         | Named export to call on the external executor module.                                                                                                                                                                                                                                                                            |
| `deriveInstanceId`   | `true`                                           | boolean                        | When `true` (default), the dispatcher extracts an `instanceId` from `body.instanceId` or `body.id` and forwards it to `runCommand` (inline) **or** to the executor (`externalExecutor`). Non-create commands (release, archive, update, …) need this; create commands ignore it harmlessly. Set `false` only with strong reason. |
| `path`               | `/manifest/[entity]/commands/[command]/route.ts` | string                         | Dispatcher route path relative to `appDir`. Override for non-canonical prefixes.                                                                                                                                                                                                                                                 |

### `concreteCommandRoutes`

Per-command "concrete" routes (the `nextjs.command` surface) were the
original write path before the dispatcher existed. As of recent versions they are
**opt-in** — the canonical dispatcher is the only write surface emitted
by default. `manifest generate --surface all` skips them unless
`concreteCommandRoutes.enabled: true` is set.

```yaml
# OPT-IN: only set this if you still need per-command routes
# for legacy callers. The dispatcher is the canonical write path.
projections:
  nextjs:
    options:
      concreteCommandRoutes:
        enabled: true
        legacyAliasesOnly: true
```

| Key                 | Default | Type    | Generated behaviour                                                                                                                                                                                                                       |
| ------------------- | ------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`           | `false` | boolean | **Default false (opt-in).** When `false`, `nextjs.command` artifacts are suppressed entirely (an info-diagnostic is returned) and `--surface all` does not emit them.                                                                     |
| `legacyAliasesOnly` | `true`  | boolean | When `true` (default) and `enabled` is `true`, generated concrete routes carry the `DEPRECATED ALIAS` banner pointing callers at the dispatcher. Set `false` only if you intentionally treat per-command routes as a first-class surface. |

### `readRoutes`

Direct database read routes (`nextjs.route` for list, `nextjs.detail`
for single-entity GET). These bypass the runtime engine for read
performance and assume a Prisma-compatible client at
`databaseImportPath`.

```yaml
projections:
  nextjs:
    options:
      readRoutes:
        enabled: true # emit read routes at all
        directDbReads: true # inline Prisma call; false = stub only
```

| Key             | Default | Type    | Generated behaviour                                                                                                                                    |
| --------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `enabled`       | `true`  | boolean | When `false`, both list and detail read routes are suppressed (info diagnostic).                                                                       |
| `directDbReads` | `true`  | boolean | When `false`, read route handlers are emitted but contain no inline Prisma call — useful for projects that route reads through a separate query layer. |

> **Prisma 7 note.** When `includeTenantFilter` and/or `includeSoftDeleteFilter`
> are true, the detail route emits `findFirst` (not `findUnique`) because
> the where shape contains more than the unique constraint. The previous
> generator emitted `findUnique({ where: { id, tenantId, deletedAt: null } })`
> which fails type-check on Prisma 7+. Fixed in v0.7.x.

---

## `projections.routes`

The Canonical Routes projection emits a deterministic route manifest and
typed path builders. Configuration mirrors `ROUTES_DEFAULTS` in
`defaults.ts`.

| Key                     | Default      | Type    | What it controls                                        |
| ----------------------- | ------------ | ------- | ------------------------------------------------------- |
| `output`                | `generated/` | string  | Directory for `routes.manifest.json` and `routes.ts`.   |
| `options.basePath`      | `/api`       | string  | Base path prefix for every route.                       |
| `options.includeAuth`   | `true`       | boolean | Whether emitted route entries carry `auth: true`.       |
| `options.includeTenant` | `true`       | boolean | Whether emitted route entries carry `tenant: true`.     |
| `options.manualRoutes`  | `[]`         | array   | Hand-declared routes merged into the canonical surface. |

---

## `projections.prisma`

Emits a `schema.prisma` from the IR. The projection runtime consumes these via
`normalizeOptions` (`src/manifest/projections/prisma/options.ts`); the same keys
are the validated contract in `manifest.config.schema.json`
(`PrismaProjectionOptions`). `prisma-store` accepts all of these **plus** its own
metadata/registry keys.

| Key                         | Default                            | Type                    | What it controls                                                                                                                                                                                                                                                                             |
| --------------------------- | ---------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `output`                    | `generated/`                       | string                  | **Directory** the schema is written to. A projection with no top-level `output` is skipped by `manifest generate --all`.                                                                                                                                                                     |
| `options.output`            | `schema.prisma`                    | string                  | **Filename** (path hint) resolved against the directory above. Do not repeat the full path in both — that writes a doubled path.                                                                                                                                                             |
| `options.provider`          | (none)                             | enum                    | `postgresql` \| `mysql` \| `sqlite` \| `sqlserver` \| `mongodb` \| `cockroachdb`. When set, a `datasource` block (and a `prisma.config.ts` companion) is emitted.                                                                                                                            |
| `options.relationMode`      | (none)                             | enum                    | `prisma` \| `foreignKeys`. Emitted as `relationMode = "..."` on the datasource. Use `prisma` when relations are enforced in the client (PlanetScale, Neon pooled, …).                                                                                                                        |
| `options.generator`         | `{ provider: "prisma-client-js" }` | `Record<string,string>` | Fields for the `generator client { ... }` block, emitted verbatim as `key = "value"` in declaration order. Override for the newer `prisma-client` generator with `output`/`moduleFormat`/`generatedFileExtension`/`importFileExtension`.                                                     |
| `options.multiSchema`       | (flat)                             | object                  | Multi-schema layout. See below. PostgreSQL / CockroachDB / SQL Server only.                                                                                                                                                                                                                  |
| `options.autoBackRelations` | `false`                            | boolean                 | Auto-emit the inverse relation field on a target model for any `belongsTo`/`ref` lacking an explicit opposite (`<pluralCamelOwner> Owner[]`, with a deterministic `@relation` name for ambiguous pairs). Removes the need to hand-author inverse `hasMany` on hub entities (User, Event, …). |
| `options.naming`            | `preserve`                         | string\|object          | Identifier casing (`@map`/`@@map` only); `snake_case` shorthand expands to `{ table, column, pluralizeTables: true }`.                                                                                                                                                                       |
| `options.urlEnvVar`         | `DATABASE_URL`                     | string                  | Env var name for the DB URL in the emitted `prisma.config.ts` companion.                                                                                                                                                                                                                     |

Per-entity maps (all `Record<EntityName, …>`, no dotted keys):
`tableMappings`, `columnMappings`, `precision`, `indexes`, `typeMappings`,
`foreignKeys`, `dbAttributes`, `fieldAttributes`.

### `multiSchema`

```yaml
projections:
  prisma:
    output: packages/database/prisma
    options:
      provider: postgresql
      relationMode: prisma
      generator:
        provider: prisma-client
        output: '../generated'
        moduleFormat: esm
      multiSchema:
        enabled: true
        schemas: [public, tenant_crm, tenant_events]
        entitySchema: { Client: tenant_crm, Event: tenant_events }
        defaultSchema: public
```

| Key             | Default   | Type                    | What it controls                                                                                                                            |
| --------------- | --------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`       | `false`   | boolean                 | Master switch. Off = flat single-schema layout.                                                                                             |
| `schemas`       | (derived) | string[]                | Explicit datasource schema list. Any schema used by a model but missing here is appended.                                                   |
| `entitySchema`  | `{}`      | `Record<string,string>` | Per-entity override (entity name → schema). **Takes precedence over the entity's IR module** — this is how module-less entities get placed. |
| `defaultSchema` | `public`  | string                  | Schema for entities with neither an override nor an IR module.                                                                              |

Per-model schema resolution: `entitySchema[name]` → IR `module` → `defaultSchema`.

---

## Other projections

`nextjs`, `routes`, `prisma`, and `prisma-store` have the dedicated option
schemas documented above. **Every other registered projection** — `zod`,
`kysely`, `drizzle`, `express`, `pydantic`, `convex`, `graphql`, `openapi`,
`react-query`, `dart`, `hono`, `remix`, `sveltekit`, `terraform`,
`elasticsearch`, `dynamodb`, `mermaid`, `jsonschema`, `storybook`, `analytics`,
`health`, `materialized-views`, `llm-context` — is configurable under
`projections.<name>` with the same generic shape:

```yaml
projections:
  zod:
    output: generated/schemas # directory / path hint (required by `manifest generate --all`)
    options: # projection-specific; passed through verbatim
      # ...
```

`options` is an **open object** — its keys are projection-specific and are not
individually validated by the JSON schema. An unknown projection **name** is
still rejected by `manifest config validate` (`projections` is a closed set).
The allowed set is derived from the projection registry; the schema's
`projections` block is regenerated by `testing/scripts/generate-config-schema.mjs` and
guarded against drift by `src/manifest/config-schema-registry.test.ts`.

---

## Inspection CLI

Three commands surface what Manifest will actually do.

```bash
# Validate manifest.config.yaml against the JSON schema.
manifest config validate
manifest config validate --json     # structured output, non-zero exit on failure

# Print the canonical defaults snapshot.
manifest config print-defaults

# Print the *effective* config = defaults + user overrides.
# Stable, key-sorted output — safe to snapshot in CI.
manifest config inspect
manifest config inspect --json      # default
```

Effective-config output excerpt:

```json
{
  "configPath": "/work/app/manifest.config.yaml",
  "build": { "output": "ir/", "src": "**/*.manifest" },
  "projections": {
    "nextjs": {
      "output": "generated/",
      "options": {
        "appDir": "apps/api/app/api",
        "authProvider": "clerk",
        "dispatcher": {
          "enabled": true,
          "executionMode": "inline",
          ...
        },
        ...
      }
    }
  }
}
```

---

## externalExecutor migration example

Use `executionMode: externalExecutor` when a downstream app owns its
Manifest runtime construction (a shared executor, custom store wiring,
extra context injection) and wants the dispatcher to be a thin transport
adapter.

**Step 1 — author an executor in your app.** Place it where the
`executorImportPath` points; the function shape is your contract.

```ts
// apps/api/lib/manifest-executor.ts (or wherever you wire your runtime)

import { createManifestRuntime } from './manifest-runtime';

export interface ManifestExecutorCall {
  entityName: string;
  commandName: string;
  input: unknown;
  instanceId?: string;
  context: {
    tenantId?: string;
    orgId?: string;
    actorId?: string;
    requestId?: string;
    source?: string;
    user?: Record<string, unknown>;
  };
}

export async function executeManifestCommand(call: ManifestExecutorCall) {
  const runtime = await createManifestRuntime(call.context);
  return runtime.runCommand(call.commandName, call.input, {
    entityName: call.entityName,
    ...(call.instanceId ? { instanceId: call.instanceId } : {}),
  });
}
```

**Step 2 — flip config.** Use placeholder paths matching _your_ layout:

```yaml
# manifest.config.yaml
projections:
  nextjs:
    options:
      dispatcher:
        executionMode: externalExecutor
        executorImportPath: '@my-app/manifest-executor'
        executorImportName: 'executeManifestCommand'
        deriveInstanceId: false
```

**Step 3 — regenerate.** The generated dispatcher at
`<appDir>/manifest/[entity]/commands/[command]/route.ts` now imports your
executor and delegates to it. The emitted handler no longer contains
`createManifestRuntime` or `runtime.runCommand`.

```ts fragment
// Generated output (excerpt) under externalExecutor mode:
import { executeManifestCommand } from "@my-app/manifest-executor";
...
const result = await executeManifestCommand({
  entityName: entity,
  commandName: command,
  input: body,
  context: { tenantId, orgId, actorId: userId, ... }
});
```

**Step 4 — confirm with the CLI.**

```bash
manifest config inspect --json | jq '.projections.nextjs.options.dispatcher'
# {
#   "deriveInstanceId": false,
#   "enabled": true,
#   "executionMode": "externalExecutor",
#   "executorImportName": "executeManifestCommand",
#   "executorImportPath": "@my-app/manifest-executor"
# }
```

---

## CI / drift guidance

~~Recommended CI gate (manual four-step flow):~~
**Update (2026-07-15):** Prefer Config G10 — declare `driftGates` and run
`manifest ci-gate` (see **`driftGates`** above). The manual recipe below still
works for repos that opt out of `ci-gate`.

```bash
# Prefer:
manifest ci-gate
# or refresh snapshot:
manifest ci-gate --write-snapshot

# Manual equivalent (still valid):
# 1. Fail on invalid config.
manifest config validate

# 2. Snapshot the effective config (commit the snapshot under VCS).
manifest config inspect --json > .manifest/effective-config.snapshot.json
git diff --exit-code .manifest/effective-config.snapshot.json

# 3. Regenerate code from IR.
manifest build

# 4. Fail on drift between checked-in and just-generated code.
git diff --exit-code
```

This four-step flow guarantees:

1. The config is structurally valid against the published schema.
2. The effective config (= defaults + overrides) has not drifted from the
   last reviewed snapshot — defaults can't change without showing up here.
3. Any change in either Manifest defaults _or_ the local config produces a
   diff under VCS instead of silently changing emitted output.

---

## Where each default lives

| Layer                                    | Path                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Canonical default values                 | [`src/manifest/projections/nextjs/defaults.ts`](../../../src/manifest/projections/nextjs/defaults.ts)   |
| JSON schema (what's allowed)             | [`docs/spec/config/manifest.config.schema.json`](./manifest.config.schema.json)                         |
| Schema-enforced CLI validator            | [`packages/cli/src/utils/config-validate.ts`](../../../packages/cli/src/utils/config-validate.ts)       |
| Inspection CLI                           | [`packages/cli/src/commands/config.ts`](../../../packages/cli/src/commands/config.ts)                   |
| Projection consumer (`normalizeOptions`) | [`src/manifest/projections/nextjs/generator.ts`](../../../src/manifest/projections/nextjs/generator.ts) |

Adding a new key requires touching all five so they stay in sync. The
`getManifestDefaultsSnapshot` export plus the
`manifest config print-defaults` snapshot test catch any drift between
defaults.ts and the generator's `normalizeOptions`.
