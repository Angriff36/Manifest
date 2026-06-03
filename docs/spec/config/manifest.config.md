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

| File                          | Role                                  | Validated by |
|-------------------------------|---------------------------------------|--------------|
| `manifest.config.yaml` / `.yml` | Build-level (declarative)           | JSON schema  |
| `.manifestrc.yaml` / `.yml`   | Build-level (alternate name)          | JSON schema  |
| `manifest.config.ts` / `.js`  | Runtime-level (stores, resolveUser)   | Structural (loader) |

The TypeScript file may *also* contain a `build` block — that block is
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
      ".manifestrc.yml"
    ]
  }
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
import { defineConfig } from "@angriff36/manifest/config";
import { PrismaOrderStore } from "./stores/order";

export default defineConfig({
  stores: {
    Order: { implementation: PrismaOrderStore, prismaModel: "orders" },
  },
  resolveUser: async (auth) => {
    const session = await getSession(auth.headers);
    return session ? { id: session.userId, role: session.role } : null;
  },
  build: {
    src: "modules/**/*.manifest",
    output: "ir/",
    hooks: { provider: "husky", runValidate: true },
    plugins: [{ module: "@acme/manifest-audit" }],
  },
});
```

`defineConfig` is an **identity function** — it returns its argument unchanged
at runtime and injects no defaults; it exists purely for editor/type support.
The exported types (`ManifestRuntimeConfig`, `ManifestBuildConfig`,
`ManifestHooksConfig`, `ManifestPluginDeclaration`, …) are available from the
same `@angriff36/manifest/config` entry point.

> The types cover the config surface that ships **today**. The richer vNext
> sections (validation, merge integrity, provenance, runtime, drift gates) are a
> [design proposal](../../internal/proposals/config/manifest-config-vnext.md),
> not implemented, and are intentionally not modelled by `defineConfig`.

---

## Top-level keys

| Key            | Default            | Type       | What it controls |
|----------------|--------------------|------------|------------------|
| `src`          | `**/*.manifest`    | string     | Glob for source `.manifest` files. |
| `output`       | `ir/`              | string     | Directory for compiled IR JSON. |
| `prismaSchema` | (auto-discovered)  | string     | Optional path to a Prisma schema for property alignment scans. When omitted, Manifest checks `prisma/schema.prisma`, `schema.prisma`, `db/schema.prisma`. |
| `projections`  | `{}`               | object     | Per-projection config blocks. |
| `env`          | `{}`               | object     | Environment-variable declarations for `manifest preflight`. Grouped under `stores`, `auth`, `adapters`, `custom`. |
| `hooks`        | (see below)        | object     | Git pre-commit hook settings consumed by `manifest install-hooks`. |
| `plugins`      | `[]`               | array      | Third-party plugin declarations loaded by the CLI; inspected via `manifest plugins`. |

---

## `hooks`

Settings for `manifest install-hooks`, which installs a git pre-commit hook that
runs Manifest checks before each commit.

```yaml
hooks:
  skipInCi: true            # default
  provider: husky           # husky | simple-git-hooks
  runFmt: true              # default
  runValidate: true         # default
```

| Key           | Default  | Type                            | What it controls |
|---------------|----------|---------------------------------|------------------|
| `skipInCi`    | `true`   | boolean                         | Skip running the generated hook in CI environments. |
| `provider`    | `husky`  | `husky` \| `simple-git-hooks`   | Git hook manager the pre-commit hook is installed into. |
| `runFmt`      | `true`   | boolean                         | Run `manifest fmt` from the generated pre-commit hook. |
| `runValidate` | `true`   | boolean                         | Run `manifest validate` from the generated pre-commit hook. |

---

## `plugins`

Declares Manifest plugins for the CLI to load. Each entry points at an npm
package or a relative module path. List loaded plugins with `manifest plugins`.

```yaml
plugins:
  - module: "@acme/manifest-audit"      # npm package or relative path
    enabled: true                        # default true
    options:
      level: strict
  - module: "./local/redaction-plugin.ts"
```

| Key       | Required | Default | Type   | What it controls |
|-----------|----------|---------|--------|------------------|
| `module`  | yes      | —       | string | npm package name or relative file path to the plugin module. |
| `options` | no       | —       | object | Plugin-specific options passed to the plugin at load time. |
| `enabled` | no       | `true`  | boolean| Whether the plugin is active. |

---

## `projections.nextjs`

| Key       | Default        | Type     | What it controls |
|-----------|----------------|----------|------------------|
| `output`  | `generated/`   | string   | Directory where generated TypeScript files are written. |
| `options` | (see below)    | object   | Surface-specific options for the Next.js projection. |

### `projections.nextjs.options`

Every key here is **Manifest-generic** — it shapes the code Manifest
emits but encodes no downstream-app branding.

| Key                       | Default                       | Allowed values                              | Generated behaviour |
|---------------------------|-------------------------------|---------------------------------------------|---------------------|
| `authProvider`            | `clerk`                       | `clerk`, `nextauth`, `custom`, `none`       | Selects the auth check template. `none` emits an `anonymous` user; `custom` imports `{ getUser }`; the others import their respective helpers. |
| `authImportPath`          | `@repo/auth/server`           | string                                      | Module that exports the auth helper. Combined with `authProvider` to produce the `import { auth } from "..."` line. |
| `databaseImportPath`      | `@repo/database`              | string                                      | Module that exports the `database` client used by direct-read routes. |
| `responseImportPath`      | `@/lib/manifest-response`     | string                                      | Module that exports `manifestErrorResponse`, `manifestSuccessResponse`, `normalizeCommandResult`. |
| `runtimeImportPath`       | `@/lib/manifest-runtime`      | string                                      | Module that exports `createManifestRuntime`. **Only used when `dispatcher.executionMode` is `inline`.** |
| `includeTenantFilter`     | `true`                        | boolean                                     | When true, read routes emit `where: { tenantId, ... }` and POST handlers resolve a tenant before executing. |
| `includeSoftDeleteFilter` | `true`                        | boolean                                     | When true, read routes emit `where: { deletedAt: null, ... }`. |
| `tenantIdProperty`        | `tenantId`                    | string                                      | Name of the tenant-scope property used in WHERE clauses and tenant context. |
| `deletedAtProperty`       | `deletedAt`                   | string                                      | Name of the soft-delete timestamp property. |
| `appDir`                  | `apps/api/app/api`            | string                                      | App Router base directory. All `pathHint`s are relative to this. |
| `strictMode`              | `true`                        | boolean                                     | Whether generated TypeScript is strict-mode friendly. |
| `includeComments`         | `true`                        | boolean                                     | Whether to emit explanatory comments above generated handlers. |
| `indentSize`              | `2`                           | integer 1–8                                 | Spaces of indentation in generated code. |
| `unauthorizedStatus`      | `401`                         | integer (400–499)                           | HTTP status returned when the auth helper rejects the request **or** throws (invalid/expired token). Auth failures MUST NEVER surface as 500. Override only if you standardise on 403 to avoid user-existence leak. |
| `tenantProvider`          | `{ importPath: '@/app/lib/tenant', functionName: 'getTenantIdForOrg', lookupKey: 'orgId' }` | object                  | Override the default `userTenantMapping.findUnique` pattern with a project-supplied lookup. See **`tenantProvider`** below. |
| `dispatcher`              | (see below)                   | object                                      | Configuration for the canonical write surface. See **`dispatcher`** below. |
| `concreteCommandRoutes`   | (see below)                   | object                                      | Opt-in policy for the deprecated per-command routes. See **`concreteCommandRoutes`** below. |
| `readRoutes`              | (see below)                   | object                                      | Policy for direct database read routes. See **`readRoutes`** below. |

### `tenantProvider`

```yaml
projections:
  nextjs:
    options:
      tenantProvider:
        importPath: "@my-app/data"
        functionName: "getTenantIdForOrg"
        lookupKey: "orgId"    # or "userId"
```

| Key            | Required | Type                       | What it controls |
|----------------|----------|----------------------------|------------------|
| `importPath`   | yes      | string                     | Module that exports the lookup helper. |
| `functionName` | yes      | string                     | Named export to call. |
| `lookupKey`    | yes      | `orgId` \| `userId`        | Which auth-context field is passed as the lookup argument. |

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
        executionMode: inline           # or "externalExecutor"
        executorImportPath: "@/lib/manifest-executor"
        executorImportName: "executeManifestCommand"
        deriveInstanceId: false
```

| Key                     | Default                         | Type                                  | Generated behaviour |
|-------------------------|---------------------------------|---------------------------------------|---------------------|
| `enabled`               | `true`                          | boolean                               | When `false`, the `nextjs.dispatcher` surface emits no artifact and surfaces an info-diagnostic. |
| `executionMode`         | `inline`                        | `inline` \| `externalExecutor`        | `inline` (default, back-compat): handler calls `createManifestRuntime(...)` then `runtime.runCommand(...)`. `externalExecutor`: handler imports the configured executor and delegates — **no `createManifestRuntime` or `runtime.runCommand` appears in the emitted code.** |
| `executorImportPath`    | `@/lib/manifest-executor`       | string                                | Module path for the external executor. Only used in `externalExecutor` mode. |
| `executorImportName`    | `executeManifestCommand`        | string                                | Named export to call on the external executor module. |
| `deriveInstanceId`      | `true`                          | boolean                               | When `true` (default), the dispatcher extracts an `instanceId` from `body.instanceId` or `body.id` and forwards it to `runCommand` (inline) **or** to the executor (`externalExecutor`). Non-create commands (release, archive, update, …) need this; create commands ignore it harmlessly. Set `false` only with strong reason. |
| `path`                  | `/manifest/[entity]/commands/[command]/route.ts` | string             | Dispatcher route path relative to `appDir`. Override for non-canonical prefixes. |

### `concreteCommandRoutes`

Per-command "concrete" routes (the `nextjs.command` surface) were the
original write path before the dispatcher existed. As of v0.7.x they are
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

| Key                  | Default | Type    | Generated behaviour |
|----------------------|---------|---------|---------------------|
| `enabled`            | `false` | boolean | **Default false (opt-in).** When `false`, `nextjs.command` artifacts are suppressed entirely (an info-diagnostic is returned) and `--surface all` does not emit them. |
| `legacyAliasesOnly`  | `true`  | boolean | When `true` (default) and `enabled` is `true`, generated concrete routes carry the `DEPRECATED ALIAS` banner pointing callers at the dispatcher. Set `false` only if you intentionally treat per-command routes as a first-class surface. |

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
        enabled: true        # emit read routes at all
        directDbReads: true  # inline Prisma call; false = stub only
```

| Key             | Default | Type    | Generated behaviour |
|-----------------|---------|---------|---------------------|
| `enabled`       | `true`  | boolean | When `false`, both list and detail read routes are suppressed (info diagnostic). |
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

| Key                          | Default  | Type     | What it controls |
|------------------------------|----------|----------|------------------|
| `output`                     | `generated/` | string   | Directory for `routes.manifest.json` and `routes.ts`. |
| `options.basePath`           | `/api`   | string   | Base path prefix for every route. |
| `options.includeAuth`        | `true`   | boolean  | Whether emitted route entries carry `auth: true`. |
| `options.includeTenant`      | `true`   | boolean  | Whether emitted route entries carry `tenant: true`. |
| `options.manualRoutes`       | `[]`     | array    | Hand-declared routes merged into the canonical surface. |

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

import { createManifestRuntime } from "./manifest-runtime";

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

**Step 2 — flip config.** Use placeholder paths matching *your* layout:

```yaml
# manifest.config.yaml
projections:
  nextjs:
    options:
      dispatcher:
        executionMode: externalExecutor
        executorImportPath: "@my-app/manifest-executor"
        executorImportName: "executeManifestCommand"
        deriveInstanceId: false
```

**Step 3 — regenerate.** The generated dispatcher at
`<appDir>/manifest/[entity]/commands/[command]/route.ts` now imports your
executor and delegates to it. The emitted handler no longer contains
`createManifestRuntime` or `runtime.runCommand`.

```ts
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

Downstream repos should commit their `manifest.config.yaml` and pin
generation output. Recommended CI gate:

```bash
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
3. Any change in either Manifest defaults *or* the local config produces a
   diff under VCS instead of silently changing emitted output.

---

## Where each default lives

| Layer                                   | Path |
|-----------------------------------------|------|
| Canonical default values                | [`src/manifest/projections/nextjs/defaults.ts`](../../../src/manifest/projections/nextjs/defaults.ts) |
| JSON schema (what's allowed)            | [`docs/spec/config/manifest.config.schema.json`](./manifest.config.schema.json) |
| Schema-enforced CLI validator           | [`packages/cli/src/utils/config-validate.ts`](../../../packages/cli/src/utils/config-validate.ts) |
| Inspection CLI                          | [`packages/cli/src/commands/config.ts`](../../../packages/cli/src/commands/config.ts) |
| Projection consumer (`normalizeOptions`)| [`src/manifest/projections/nextjs/generator.ts`](../../../src/manifest/projections/nextjs/generator.ts) |

Adding a new key requires touching all five so they stay in sync. The
`getManifestDefaultsSnapshot` export plus the
`manifest config print-defaults` snapshot test catch any drift between
defaults.ts and the generator's `normalizeOptions`.
