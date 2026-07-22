# Manifest Configuration — Current Reality & vNext Design Proposal

> **Read this first.**
> This document has three parts and they are **not** the same status level:
>
> | Part                         | Status                               | Trust level                                                                         |
> | ---------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------- |
> | **1. Current config**        | Shipped. Reflects code as of v2.1.0. | Authoritative — examples validate today.                                            |
> | **2. Proposed vNext config** | **Design only. NOT implemented.**    | Aspirational — every key in Part 2 is rejected by `manifest config validate` today. |
> | **3. Implementation gaps**   | Roadmap to make Part 2 real.         | Planning.                                                                           |
>
> Do **not** copy Part 2 into a real `manifest.config.*` and expect it to work.
> The canonical reference for what works _now_ is
> [`docs/spec/config/manifest.config.md`](../../../spec/config/manifest.config.md)
> and the schema at
> [`docs/spec/config/manifest.config.schema.json`](../../../spec/config/manifest.config.schema.json).

---

# Part 1 — Current config (what actually works today)

> **2026-07-14 accuracy update (verified against the schema at v3.4.25):**
> Part 1 below was written against v2.1.0 and is stale in these ways:
>
> - `projections.*` now accepts **28 projection keys**, not 3: analytics,
>   convex, dart, drizzle, dynamodb, elasticsearch, express, graphql, health,
>   hono, jsonschema, kysely, llm-context, materialized-views, mermaid, nextjs,
>   openapi, prisma, prisma-store, pydantic, react-query, remix, routes,
>   storybook, sveltekit, terraform, wiring, zod. Each takes `output` +
>   `options` (options are `additionalProperties: true` — passed verbatim to
>   the projection, so new projection options like the Convex
>   `authContextImport` need **no schema change**).
> - Top-level keys are now: `$schema`, `src`, `output`, `prismaSchema`,
>   `projections`, `env`, `hooks`, `plugins`, **`naming`** (naming is new
>   since this doc).
> - `manifest compile --merge` / `--all` exists (multi-module merged IR),
>   though the G3 collision-policy config below remains unimplemented.
>
> Part 2 status is UNCHANGED: none of `validation`, `mergeIntegrity`,
> `provenance`, `runtime`, `driftGates`, `projections.enabled/defaults` exist
> at v3.4.25 (verified: absent from the schema's top-level and projections
> properties).
>
> ~~Part 2 status UNCHANGED including G5~~
> **Correction (2026-07-15):** G5 (`projections.enabled` / `defaults`) shipped.
> Remaining Part 2 still unbuilt: `validation`, `mergeIntegrity`, `provenance`,
> `runtime`, `driftGates` (G2/G3/G4/G7/G10).
>
> ~~Remaining Part 2 still unbuilt: … (G2/G3/G4/G7/G10).~~
> **Correction (2026-07-15, re-verified vs `config.ts` @ package 3.6.7):**
> Also shipped: G2 `validation.failOn`, G10 `driftGates` / `manifest ci-gate`
> (matrix §1). Still open: G2 rule registry beyond `failOn`, G3 mergeIntegrity,
> G4 provenance config block, G7 runtime config, G8 hooks.lifecycle,
> G9 plugins.order/capabilities.
>
> **Correction (2026-07-22):** G9 shipped. **Correction (2026-07-22):** G8
> `hooks.lifecycle` shipped (`lifecycle-hooks.ts` + compile/generate wire).
> **Correction (2026-07-22):** G3 `mergeIntegrity` shipped (`error` \| `lastWins`;
> `namespace` deferred). **Correction (2026-07-22):** G4 `provenance` shipped
> (`provenance-config.ts` + schema `ProvenanceConfig` + lockfile CLI + deterministic
> compiledAt + `failIfStale`; `gitSha` deferred). **Correction (2026-07-22):** G7
> `runtime` generation slice shipped (`runtime-config.ts` + nextjs
> `executionMode` / factory `deterministicMode`). **Update (2026-07-22):**
> `stores` → `runtimeConfigImport` + express/hono/remix/sveltekit factory fan-in.
> **Update (2026-07-22):** `forbidWallClock`/`seed`/`defaultContext` fan-in.
> **Update (2026-07-22):** G2 `validation.rules` shipped. **Update (2026-07-22):**
> G7 `concurrency.maxParallelCommands` shipped. Still open: G2
> `requireDescriptions`.

Manifest's real config surface is **small**. There are two files, with different
validation paths:

| File                                                                     | Role                                                            | Validated by                                                |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------- |
| `manifest.config.yaml` / `.yml` / `.manifestrc.yaml` / `.manifestrc.yml` | Build config (declarative)                                      | JSON schema (`manifest config validate`)                    |
| `manifest.config.ts` / `.js`                                             | Runtime config (stores, `resolveUser`) + optional `build` block | Structural check in the loader (contains functions/classes) |

## 1.1 The real key surface

**Schema-validated build keys** (top-level, `additionalProperties: false`):

| Key                                 | Status     | Notes                                                                                                      |
| ----------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| `$schema`                           | ✅ accepted | Optional, editor-only. Manifest publishes no resolvable URL — use a local `.vscode/settings.json` mapping. |
| `src`                               | ✅          | Glob for `.manifest` sources. Default `**/*.manifest`.                                                     |
| `output`                            | ✅          | IR output dir. Default `ir/`.                                                                              |
| `prismaSchema`                      | ✅          | Optional path for property-alignment scans.                                                                |
| `projections.nextjs`                | ✅          | `output` + full `options` surface (auth, tenant, dispatcher, readRoutes, concreteCommandRoutes).           |
| `projections.routes`                | ✅          | Canonical routes projection (`basePath`, `includeAuth`, `includeTenant`, `manualRoutes`).                  |
| `projections.prisma`                | ✅          | Prisma schema projection (`provider`, mappings, indexes, FKs, `@db.*`, etc.).                              |
| `env.{stores,auth,adapters,custom}` | ✅          | Env-var declarations for `manifest preflight`.                                                             |

**Runtime keys** (`manifest.config.ts`, structural validation only):

| Key           | Status | Notes                                                                           |
| ------------- | ------ | ------------------------------------------------------------------------------- |
| `stores`      | ✅      | Per-entity store bindings (`implementation`, `prismaModel`, `propertyMapping`). |
| `resolveUser` | ✅      | `(auth) => Promise<UserContext \| null>`.                                       |
| `build`       | ✅      | A `build`-level block merged over YAML, validated identically.                  |

**`hooks` and `plugins` — now schema-valid (G0 shipped):**

| Key       | Status          | Notes                                                                                                                   |
| --------- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `hooks`   | ✅ accepted (G0) | Read by `manifest install-hooks` (`config.hooks`); now in the schema (`skipInCi`, `provider`, `runFmt`, `runValidate`). |
| `plugins` | ✅ accepted (G0) | Read by `manifest plugins` (`config.plugins`); now in the schema (array of `{ module*, options, enabled }`).            |

> **Resolved.** Originally these were consumed by the CLI but rejected by
> `manifest config validate` (the schema's top-level `additionalProperties:
false` omitted them). **Gap G0 is now fixed** — both keys are in
> `manifest.config.schema.json`, documented in `manifest.config.md`, and covered
> by `config-validate.test.ts`. A config using them now validates.

## 1.2 Current valid YAML example (validates today)

This uses **only** schema-accepted keys. `manifest config validate` returns
`ok: true` for it.

```yaml
# manifest.config.yaml — every CURRENTLY-VALID key, with representative values.
# No $schema URL (Manifest publishes none). For editor IntelliSense, map the
# bundled schema in .vscode/settings.json under "yaml.schemas".

src: 'modules/**/*.manifest'
output: 'ir/'
prismaSchema: 'prisma/schema.prisma'

projections:
  nextjs:
    output: 'apps/api/app/api'
    options:
      authProvider: clerk # clerk | nextauth | custom | none
      authImportPath: '@repo/auth/server'
      databaseImportPath: '@repo/database'
      responseImportPath: '@/lib/manifest-response'
      runtimeImportPath: '@/lib/manifest-runtime'
      includeTenantFilter: true
      includeSoftDeleteFilter: true
      tenantIdProperty: tenantId
      deletedAtProperty: deletedAt
      appDir: 'apps/api/app/api'
      strictMode: true
      includeComments: true
      indentSize: 2
      unauthorizedStatus: 401
      tenantProvider:
        importPath: '@repo/data'
        functionName: getTenantIdForOrg
        lookupKey: orgId # orgId | userId
      dispatcher:
        enabled: true
        executionMode: inline # inline | externalExecutor
        executorImportPath: '@/lib/manifest-executor'
        executorImportName: executeManifestCommand
        deriveInstanceId: true
        path: '/manifest/[entity]/commands/[command]/route.ts'
      concreteCommandRoutes:
        enabled: false # opt-in legacy per-command routes
        legacyAliasesOnly: true
      readRoutes:
        enabled: true
        directDbReads: true

  routes:
    output: 'generated/'
    options:
      basePath: '/api'
      includeAuth: true
      includeTenant: true
      manualRoutes:
        - id: healthcheck
          path: '/health'
          method: GET
          auth: false
          tenant: false
          params: []

  prisma:
    output: 'prisma/schema.prisma'
    options:
      provider: postgresql # postgresql | mysql | sqlite | sqlserver | mongodb | cockroachdb
      urlEnvVar: DATABASE_URL
      tableMappings:
        Order: orders
      columnMappings:
        Order:
          createdAt: created_at
      typeMappings:
        Order:
          total: Decimal
      precision:
        Order:
          total: { precision: 12, scale: 2 }
      dbAttributes:
        Order:
          total: 'Decimal(12, 2)'
      fieldAttributes:
        Order:
          updatedAt: ['@updatedAt']
      indexes:
        Order:
          - ['tenantId', 'createdAt']
          - { fields: ['status'], name: 'order_status_idx' }
      foreignKeys:
        Order:
          customer:
            fields: ['customerId']
            references: ['id']
            onDelete: Cascade
            onUpdate: Cascade

env:
  stores:
    DATABASE_URL:
      name: DATABASE_URL
      description: 'Primary Postgres connection string'
      required: true
      example: 'postgresql://user:pass@localhost:5432/app'
  auth:
    CLERK_SECRET_KEY:
      name: CLERK_SECRET_KEY
      required: true
  adapters: {}
  custom: {}
```

### 1.2.1 `hooks` and `plugins` — part of the current surface (now validate-clean)

These two keys are **part of today's config surface** — the CLI reads and acts
on them — and as of **G0** they are also schema-valid, so `manifest config
validate` accepts them. They were originally shown separately because the schema
rejected them; that gap is now closed and they may live in the main config.

```yaml
# Consumed by `manifest install-hooks` and `manifest plugins`,
# and accepted by `manifest config validate` (G0 shipped).

hooks:
  skipInCi: true
  provider: husky # husky | simple-git-hooks
  runFmt: true
  runValidate: true

plugins:
  - module: '@acme/manifest-audit' # npm package or relative path
    enabled: true
    options:
      level: strict
  - module: './local/redaction-plugin.ts'
    enabled: true
```

So the complete _current_ surface is exactly:
`src`, `output`, `prismaSchema`, `projections`, `env`, `hooks`, `plugins`
(all schema-valid) **plus** the runtime-only `stores` / `resolveUser` / `build`
in `manifest.config.ts`.

## 1.3 Current runtime config (`manifest.config.ts`)

As of **G1**, author this with the typed `defineConfig` helper for autocomplete
and type-checking (it is an identity function — no runtime behaviour change):

```ts
// manifest.config.ts — runtime bindings. Validated structurally, not by JSON schema.
import { defineConfig } from '@angriff36/manifest/config'; // G1 — shipped
import { PrismaOrderStore } from './stores/order';

export default defineConfig({
  // Per-entity store implementations (class, factory, or instance).
  stores: {
    Order: { implementation: PrismaOrderStore, prismaModel: 'orders' },
  },

  // Extract user context from auth for generated routes.
  resolveUser: async (auth) => {
    const session = await getSession(auth.headers);
    return session ? { id: session.userId, role: session.role, tenantId: session.orgId } : null;
  },

  // Optional: a build block, merged OVER manifest.config.yaml and validated identically.
  build: {
    src: 'modules/**/*.manifest',
    output: 'ir/',
  },
});
```

## 1.4 Known gaps in the CURRENT system

- ✅ **G0 — `hooks`/`plugins` not in schema — FIXED.** Both keys are now in the
  schema, docs, and tests; configs using them validate.
- ✅ **G1 — typed `defineConfig` — SHIPPED.** Exported from
  `@angriff36/manifest/config` (identity helper + config types) so
  `manifest.config.ts` authors get autocomplete and type-checking.
- The schema's `$id` is `https://manifest.lang/...`, which does not resolve. As a
  JSON-Schema `$id` this is a legal canonical identifier (never fetched), so it is
  _not_ false validation confidence — but it is worth noting it is not a live URL.

---

# Part 2 — Proposed vNext config (DESIGN ONLY — NOT IMPLEMENTED)

> ⛔ **None of the keys below exist.** `manifest config validate` will reject
> every section in this part today. This is a target design to argue about, not
> a feature you can use. Status tags: 🟥 new (no code), 🟧 partial (some code
> exists, no config wiring), 🟩 exists today (shown for completeness).

The vNext design is **TypeScript-first** with a typed `defineConfig()` helper so
authors get autocomplete and compile-time checking for the whole surface. YAML
remains supported for the declarative subset, but the rich sections
(`validation`, `mergeIntegrity`, `provenance`, `runtime`, `driftGates`) are
expected to live in TS where expressions and functions are natural.

## 2.1 Full proposed `manifest.config.ts`

```ts
// manifest.config.ts (PROPOSED vNext — does NOT work today)
import { defineConfig } from '@angriff36/manifest/config'; // 🟩 helper SHIPPED (G1) — but only types today's keys; the vNext sections below are NOT yet typed and will NOT compile/validate

export default defineConfig({
  // ── Sources & IR output ───────────────────────────────────────────── 🟩
  src: 'modules/**/*.manifest',
  output: 'ir/',

  // ── Validation policy ─────────────────────────────────────────────── 🟥
  // Today validation severity is fixed by the language (ok/warn/block) and
  // `manifest validate` has no config knobs. vNext lets a repo set its OWN
  // gate policy WITHOUT weakening language semantics (a block is still a block;
  // this only controls which diagnostics fail CI and which extra checks run).
  validation: {
    failOn: 'warn', // "block" | "warn" | "never" — CI exit policy
    rules: {
      'unused-entity': 'warn',
      'missing-policy': 'block',
      'orphan-relationship': 'warn',
    },
    requireDescriptions: ['entity', 'command'], // doc-coverage gate
    conformance: {
      regenOnMismatch: false, // never auto-rewrite expected outputs in CI
      treatMismatchAs: 'block',
    },
  },

  // ── Merge integrity (multi-module IR) ─────────────────────────────── 🟧
  // Today multiple .manifest files compile to separate IR; cross-file name
  // collisions are not centrally policed. vNext defines deterministic merge
  // semantics for a multi-module program.
  mergeIntegrity: {
    onDuplicateEntity: 'error', // "error" | "lastWins" | "namespace"
    onDuplicateCommand: 'error',
    moduleOrder: 'lexicographic', // deterministic; never filesystem-order
    allowCrossModuleRefs: true,
    forbidCycles: true,
  },

  // ── Provenance (artifact trust) ───────────────────────────────────── 🟥
  // Stamp IR + generated code with deterministic origin metadata so a reviewer
  // can prove an artifact came from a specific source + generator version.
  provenance: {
    stamp: true,
    fields: ['sourceHash', 'generatorVersion', 'irSchemaVersion', 'gitSha'],
    deterministic: true, // no wall-clock timestamps in output
    lockfile: '.manifest/provenance.lock.json',
    failIfStale: true, // generated artifact's sourceHash must match IR
  },

  // ── Projections ───────────────────────────────────────────────────── 🟩/🟧
  // Same per-projection shape as today (Part 1), plus a shared `defaults`
  // block and an explicit `enabled` list. 🟧 = defaults/enabled are new.
  projections: {
    enabled: ['nextjs', 'routes', 'prisma'], // 🟧 explicit opt-in list (new)
    defaults: {
      // 🟥 shared across projections (new)
      includeComments: true,
      indentSize: 2,
    },
    nextjs: {
      output: 'apps/api/app/api',
      options: { authProvider: 'clerk', includeTenantFilter: true /* …Part 1 keys… */ },
    },
    routes: { output: 'generated/', options: { basePath: '/api' } },

    // ── Prisma multi-schema output ──────────────────────────────────── 🟩/🟥
    // CORE SHIPPED (G6): `schemas = [...]` on the datasource + `@@schema(...)`
    // per model, derived from the entity's IR `module` (overridable). Still
    // 🟥: `splitFiles` (one .prisma file per schema) is deferred.
    prisma: {
      output: 'prisma/schema.prisma',
      options: {
        provider: 'postgresql',
        urlEnvVar: 'DATABASE_URL',
        multiSchema: {
          enabled: true, // 🟩 shipped
          schemas: ['public', 'auth', 'billing'], // 🟩 → datasource `schemas = [...]`
          entitySchema: {
            // 🟩 per-entity @@schema("…") override
            User: 'auth',
            Session: 'auth',
            Invoice: 'billing',
            Order: 'public',
          },
          // defaultSchema: "public",                // 🟩 module-less fallback (default "public")
          splitFiles: {
            // 🟥 DEFERRED — not implemented
            enabled: true,
            dir: 'prisma/schemas',
          },
        },
        // …all current Prisma options (tableMappings, indexes, foreignKeys…) still apply.
      },
    },
  },

  // ── Runtime options ───────────────────────────────────────────────── 🟧
  // Today runtime knobs live in code (RuntimeEngine options) and the
  // dispatcher executionMode lives under projections.nextjs. vNext centralizes
  // execution + determinism policy.
  runtime: {
    executionMode: 'inline', // mirrors dispatcher mode; single source
    determinism: {
      seed: 1, // seed any non-deterministic builtins
      clock: 'injected', // forbid Date.now() in runtime context
      forbidWallClock: true,
    },
    defaultContext: { source: 'api' },
    stores: './manifest.stores.ts', // path to store bindings (replaces inline TS)
    concurrency: { maxParallelCommands: 8 },
  },

  // ── Lifecycle hooks ───────────────────────────────────────────────── 🟧
  // Today `hooks` controls git pre-commit only (and is schema-rejected, G0).
  // vNext adds build-lifecycle hooks AND keeps the git-hook config.
  hooks: {
    git: {
      // 🟩 (exists today, minus schema coverage)
      provider: 'husky', // husky | simple-git-hooks
      skipInCi: true,
      runFmt: true,
      runValidate: true,
    },
    lifecycle: {
      // 🟥 new
      beforeCompile: ['./scripts/check-env.ts'],
      afterGenerate: ['./scripts/format-generated.ts'],
    },
  },

  // ── Plugins ───────────────────────────────────────────────────────── 🟧
  // Today `plugins` is read by `manifest plugins` (and is schema-rejected, G0).
  // vNext adds ordering + declared capabilities.
  plugins: [
    { module: '@acme/manifest-audit', enabled: true, options: { level: 'strict' }, order: 10 },
    { module: './local/redaction-plugin.ts', enabled: true, order: 20 },
  ],

  // ── Drift gates (CI integrity) ────────────────────────────────────── 🟧
  // Today the four-step drift flow is documented prose (manifest.config.md
  // § CI / drift guidance). vNext makes it declarative so `manifest ci-gate`
  // enforces it from config.
  driftGates: {
    effectiveConfigSnapshot: '.manifest/effective-config.snapshot.json',
    failOnConfigDrift: true,
    failOnGeneratedDrift: true, // git diff --exit-code on generated/
    pinIrSchemaVersion: 'ir-v1',
    pinGeneratorVersion: '^2.1.0',
    failOnUnpinnedProjection: true,
  },

  // ── Env (preflight) ───────────────────────────────────────────────── 🟩
  env: {
    stores: { DATABASE_URL: { name: 'DATABASE_URL', required: true } },
  },
});
```

## 2.2 Why each new section exists

- **`validation`** — lets a repo choose its CI gate strictness and turn on
  doc-coverage / lint-style rules **without** altering language semantics. A
  `block` diagnostic always blocks; this only governs CI exit codes and opt-in
  extra checks. Keeps the house rule "diagnostics explain, never compensate."
- **`mergeIntegrity`** — a multi-module program needs deterministic, documented
  rules for name collisions and module ordering. Default `error` keeps the
  language strict; `lastWins`/`namespace` are explicit opt-ins.
- **`provenance`** — makes generated artifacts auditable: a reviewer can verify
  output came from a known source hash + generator version. Determinism-friendly
  (no wall-clock), consistent with conformance philosophy.
- **`projections.enabled`/`defaults`** — removes repetition and makes target
  selection explicit instead of relying on `--surface all` heuristics.
- **`prisma.multiSchema`** — real Prisma capability (`schemas = [...]`,
  `@@schema`) the projection cannot express today.
- **`runtime`** — one home for execution mode + determinism instead of being
  split between code and `projections.nextjs.dispatcher`.
- **`hooks.lifecycle`** — build-time hooks (format generated code, check env)
  beyond git pre-commit.
- **`plugins.order`/`capabilities`** — deterministic plugin application order.
- **`driftGates`** — turns today's prose CI recipe into an enforceable,
  single-command gate.

---

# Part 3 — Implementation gaps to make vNext real

Ordered roughly by dependency. "Danger Zone" marks `docs/spec/**` /
conformance / IR-shape changes that require schema + fixture + runtime updates.

| ID                 | Gap                                  | Exists today                                                | Needed to ship                                                                                                                                                                                                 | Files (indicative)                                                                                                     | Risk                                        |
| ------------------ | ------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| ~~**G0**~~ ✅ DONE  | `hooks`/`plugins` rejected by schema | —                                                           | Added both to schema + `.md` + tests; configs using them validate                                                                                                                                              | `docs/spec/config/manifest.config.schema.json`, `manifest.config.md`, `config-validate.test.ts`                        | Shipped                                     |
| ~~**G1**~~ ✅ DONE  | No typed `defineConfig()`            | —                                                           | Shipped `defineConfig` + config types at `@angriff36/manifest/config`                                                                                                                                          | `src/manifest/config.ts`, `src/manifest/config.test.ts`, package `exports`                                             | Shipped                                     |
| ~~**G2**~~ ✅ DONE (slice) | `validation` policy            | Fixed language severities; `manifest validate` has no knobs | ~~Config-driven gate policy + rule registry~~ **DONE 2026-07-15 (failOn):** `validation.failOn`. **DONE 2026-07-22 (rules):** `missing-policy` / `unused-entity` / `orphan-relationship` via `validation-rules.ts` + compile wire. `requireDescriptions` deferred (no IR description). | `validation-gate-policy.ts`, `validation-rules.ts`, schema, compile                                           | Shipped (`requireDescriptions` deferred)    |
| ~~**G3**~~ ✅ DONE  | `mergeIntegrity`                     | Per-file IR; no central collision policy                    | ~~Multi-module merge pass with deterministic ordering + collision policy~~ **DONE 2026-07-22 (error\|lastWins):** `merge-integrity.ts` + uniqueness checks; wired in `multi-compiler` / CLI compile. `namespace` deferred. | `merge-integrity.ts`, `merge-integrity-checks.ts`, `multi-compiler.ts`, schema                                         | Shipped (namespace deferred)                |
| ~~**G4**~~ ✅ DONE  | `provenance`                         | None                                                        | ~~Source-hash + version stamping; deterministic; lockfile + staleness~~ **DONE 2026-07-22:** `deterministic` fixed `compiledAt`, lockfile write, `failIfStale` under deterministic. `gitSha` field deferred (no IR field). | `provenance-config.ts`, `ir-compiler.ts`, `multi-compiler.ts`, CLI `provenance-lockfile.ts`, schema                     | Shipped (`gitSha` deferred)                 |
| **G5**             | `projections.enabled`/`defaults`     | Per-projection blocks; `--surface all`                      | ~~Merge `defaults` into each projection; honor `enabled` list in CLI generate~~ **DONE 2026-07-15:** schema meta keys + `resolveProjectionOptions` / `listConfiguredProjectionNames` / `generateAllFromConfig` | `packages/cli/src/commands/generate*`, schema, `src/manifest/config.ts`                                                | Shipped                                     |
| **G6** ✅ CORE DONE | `prisma.multiSchema`                 | Was: single-schema (flat) output                            | **Shipped:** `schemas = [...]` + `@@schema` per model from `IREntity.module` (+ `entitySchema`/`defaultSchema` overrides, provider guard). **Deferred:** `splitFiles` (one .prisma file per schema).           | `src/manifest/projections/prisma/{options,generator}.ts`, `prisma-projection.schema.json`, `generator.test.ts`, README | Med                                         |
| ~~**G7**~~ ✅ DONE | `runtime` block               | Runtime opts in code; dispatcher mode under nextjs          | ~~Central runtime config~~ **DONE 2026-07-22:** `executionMode`, `deterministicMode`, `stores`, `forbidWallClock`/`seed`→`now`/`generateId`, `defaultContext` merge, `concurrency.maxParallelCommands`→`RuntimeOptions.maxParallelCommands` on web factories. | `runtime-config.ts`, `runtime-engine.ts`, companions, web generators, schema `RuntimeConfig`                                                | Shipped            |
| ~~**G8**~~ ✅ DONE  | `hooks.lifecycle`                    | git pre-commit only                                         | ~~Lifecycle hook runner around compile/generate~~ **DONE 2026-07-22:** `beforeCompile` / `afterGenerate` via `lifecycle-hooks.ts`; wired in `compile.ts` / `generate.ts` (batch once); schema `LifecycleHooksConfig` | `packages/cli/src/utils/lifecycle-hooks.ts`, `compile.ts`, `generate.ts`, schema                                       | Shipped                                     |
| ~~**G9**~~ ✅ DONE  | `plugins.order`/capabilities         | `module/options/enabled` read-only listing                  | ~~Deterministic ordering + capability registration~~ **DONE 2026-07-22:** `order` + `capabilities` on declarations; `sortPluginDeclarations` / `loadOrder` / `declaredCapabilities` in `plugin-loader`         | `plugin-order.ts`, `plugin-loader.ts`, schema, `config.ts`                                                             | Shipped                                     |
| **G10**            | `driftGates`                         | Prose CI recipe                                             | ~~`manifest ci-gate` reading declarative gates~~ **DONE 2026-07-15:** `driftGates` schema + `manifest ci-gate` (config snapshot, generated `--check`, IR version pin)                                          | `packages/cli/src/commands/ci-gate.ts`, schema                                                                         | Shipped                                     |

## Recommended sequencing

1. ~~**G0 + G1**~~ ✅ **DONE** — schema gap fixed (`hooks`/`plugins`) and typed
   `defineConfig` shipped at `@angriff36/manifest/config`.
2. **G5 + G6** ✅ **G6 core DONE** (Prisma multi-schema layout shipped;
   `splitFiles` deferred) — ✅ **G5 DONE 2026-07-15** (`projections.enabled` /
   `defaults`). Original framing: contained to the
   projection layer, no IR/semantics risk.
3. **G2 + G10** ✅ **G2 failOn DONE** + ✅ **G10 DONE 2026-07-15** (`manifest ci-gate`).
4. ~~**G4 + G3 + G7**~~ ✅ **G4/G3 DONE**; ✅ **G7 DONE** (2026-07-22), including
   `concurrency.maxParallelCommands`.

> Each Danger-Zone item must follow the house rule order: **update spec →
> add/adjust conformance fixtures → implement → verify 630/630 green.** None of
> these may make an invalid program succeed.
