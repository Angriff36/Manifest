# Changelog

All notable changes to `@angriff36/manifest` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.3.0] - 2026-05-29

### Added

- **`matches(value, pattern)` regex constraint** — compile-time regex syntax validation plus runtime enforcement.
- **Aggregate expression builtins** — `sum`, `avg`, `min_of`, `max_of`, `count_of`, `filter`, `map` over collections, each accepting an optional mapper/predicate lambda; usable in computed properties.
- **`flag(name)` feature-flag builtin** — resolves feature flags via a runtime-provided provider in guards and policies (returns `false` when no provider is configured).
- **Conformance fixtures** `63-regex-constraints`, `64-aggregate-computed-properties`, `66-feature-flags`.

### Notes

- `66-feature-flags` ships an expected IR fixture but not yet a `results.json`; feature-flag runtime behavior is not yet locked by a conformance results fixture.

## [1.2.0] - 2026-05-29

### Added

- **JSON Schema projection** — JSON Schema output from IR entity definitions (`pattern`, `minimum`/`maximum`, `required`, `enum`).
- **Mermaid projection** — ER/diagram export from IR, available via the `manifest diagram` CLI command.
- **LLM context projection** — structured IR/domain-model export for AI agent context injection.

## [1.1.0] - 2026-05-29

### Added

- **Projection framework foundation** — shared projection registration plus the IR, parser, and runtime updates underpinning the new projection targets.
- **GraphQL projection** — SDL type definitions plus resolver stubs from IR entities, commands, policies, and events.
- **Hono projection** — route handlers for edge runtimes (Cloudflare Workers, Vercel Edge, Deno Deploy).
- **Express projection** — route handlers and middleware with typed request/response shapes.

## [1.0.32] - 2026-05-26

### Added

- **`manifest-mcp` bin** on `@angriff36/manifest` — official MCP server (`compile`, `execute`, `validate`, `explain` tools + IR schema/semantics resources) is now included in the published tarball.
- Runtime dependencies **`@modelcontextprotocol/sdk`** and **`zod`** required by the MCP server.

### Fixed

- **MCP packaging gap (since v1.0.25)** — `packages/mcp-server` existed in the repo but was excluded from `files` and never built during publish; consumers installing from GitHub Packages could not run `manifest-mcp`.
- **`manifest://semantics` resource** — ships `docs/spec/semantics.md` in the tarball.

## [1.0.31] - 2026-05-26

### Added

- **Drizzle ORM schema projection** — generates TypeScript-first Drizzle table definitions from IR with column types, PKs, FKs, indexes, unique constraints, relations API, referential actions, array types, and multi-dialect support (PostgreSQL, MySQL, SQLite).
- **`drizzle.schema` surface** and **`@angriff36/manifest/projections/drizzle`** package export.
- **51 unit tests** covering type mapping, relationships, indexes, defaults, and diagnostics.

### Fixed

- **v1.0.30 publish gap** — builtins registered `DrizzleProjection` but the drizzle source files were not included in the tarball; this release adds the missing implementation.

## [1.0.30] - 2026-05-26

### Added

- **Array / list property type** — runtime support for `array<T>` and `T[]` properties with `.contains()`, `.all()`, and `.any()` method calls; `getDefaultForType('array')` returns `[]`; conformance fixture `40-array-properties`.
- **IR version control** — `src/manifest/ir-version-store.ts` with semver tagging, integrity verification, and changelog generation; `manifest versions` CLI with 8 subcommands (list, show, save, diff, changelog, tag, rollback, verify); `@angriff36/manifest/ir-version-store` export; exported `computeIRHash` from ir-compiler.
- **Plugin API** — `@angriff36/manifest/plugin-api` and `@angriff36/manifest/plugin-loader` with five extension points (projections, stores, audit sinks, builtins, CLI commands); `manifest plugins list` CLI; `plugins` config section; `docs/spec/plugins/plugin.schema.json`.
- **106 new tests** (conformance + ir-version-store + versions CLI + plugin-api + plugin-loader).

## [1.0.27] - 2026-05-26

### Added

- **Zod schema projection** — generates `z.object()` validation schemas from IR entities and command parameters with constraint refinements, computed property extensions, and nullable/optional/default handling.
- **Three surfaces:** `zod.entity`, `zod.command`, `zod.schemas`.
- **`@angriff36/manifest/projections/zod`** package export.
- **41 unit tests** covering type mapping, constraints, determinism, and edge cases.

## [1.0.26] - 2026-05-26

### Added

- **`manifest fmt`** — deterministic whitespace formatter for `.manifest` source with `--check` and `--write` modes; verifies parse success before accepting output.
- **`manifest install-hooks`** — installs Husky or simple-git-hooks pre-commit hooks running `manifest fmt --check` and `manifest validate` on staged `.manifest` files.
- **`hooks` config section** in `manifest.config.yaml` — `skipInCi`, `provider`, `runFmt`, and `runValidate` options.
- **12 unit tests** for fmt and install-hooks commands.

## [1.0.25] - 2026-05-26

### Added

- **Manifest MCP server** (`packages/mcp-server`) — Model Context Protocol server with `compile`, `execute`, `validate`, and `explain` tools plus IR schema, cached IR, and semantics resources.
- **`manifest-mcp` CLI bin** for stdio MCP transport.
- **`pnpm-workspace.yaml`** for monorepo package discovery (`packages/*`).
- **17 unit tests** for MCP tool handlers.

## [1.0.24] - 2026-05-26

### Added

- **TanStack Query projection** — generates typed `useEntityList`, `useEntityDetail`, and command mutation hooks with query key factories and cache invalidation.
- **`ManifestQueryProvider`** component surface with configurable staleTime and error boundary integration.
- **`@angriff36/manifest/projections/react-query`** package export.
- **21 unit tests** covering hooks, mutations, provider, determinism, and edge cases.

## [1.0.23] - 2026-05-26

### Added

- **OpenAPI 3.1 projection** — generates complete OpenAPI specs from IR entities, commands, and routes with JSON Schema-typed bodies, security schemes, and constraint error responses.
- **`@angriff36/manifest/projections/openapi`** package export.
- **40 unit tests** covering entity read/command operations, type mapping, security, determinism, and edge cases.

## [1.0.22] - 2026-05-26

### Added

- **Range constraint primitives** — `min`, `max`, `between`, and `length` builtins for declarative numeric range and string length validation.
- **`constraint-analysis` module** — static analysis extracting numeric ranges and length bounds from IR constraints for projection use (SQL CHECK, Zod, OpenAPI).
- **22 unit tests** for constraint analysis converters and merge logic.
- **Conformance fixtures** `56-expression-builtins` (diagnostics/results) and `57-range-constraint-builtins` (IR compilation).

## [1.0.21] - 2026-05-26

### Added

- **`manifest migrate`** CLI command — IR diff analysis for database migration planning with `--dry-run`, `--preview`, `--force`, `--tool`, and reversibility checks.
- Integrates `@angriff36/manifest/ir-diff` and `@angriff36/manifest/breaking-change` for SQL/Prisma migration preview output.

## [1.0.20] - 2026-05-26

### Added

- **IR Graph Visualizer** — force-directed canvas panel in Kitchen/Runtime UI showing entities, relationships, event flows, and computed dependencies.
- **Graph tab** between AST and Docs with pan/zoom, click-to-inspect, SVG/PNG export, and legend overlay.
- **`IRGraphPanel`** component (`src/artifacts/IRGraphPanel.tsx`) with zero new dependencies.

## [1.0.19] - 2026-05-26

### Added

- **`manifest preflight`** CLI command — validates environment variables against `env` mapping in `manifest.config.yaml`; supports `--format json` and `--generate-example`.
- **`env` mapping schema** in `manifest.config.schema.json` with `stores`, `auth`, `adapters`, and `custom` categories.
- **TypeScript types** `EnvMapping` and `EnvVarDefinition` in CLI config utilities.
- **15 unit tests** for preflight validation and `.env.example` generation.

## [1.0.18] - 2026-05-26

### Added

- **`manifest docs`** CLI command — generates static HTML or Markdown documentation from IR (entity reference pages with properties, commands, policies, constraints, events).
- **16 unit tests** covering HTML/Markdown output, all IR sections, error handling, and directory input.

## [1.0.17] - 2026-05-26

### Added

- **`manifest init --ci github`** — generates `.github/workflows/manifest-ci.yml` with validate, scan, test matrix (Node 18/20/22), and conformance fixture regen on main.
- **CLI flags** `--node-versions` and `--force` for CI workflow generation.
- **12 unit tests** for workflow generation and file creation.

## [1.0.16] - 2026-05-26

### Added

- **`@angriff36/manifest/agent-sdk`** — LLM-friendly SDK wrapping the runtime engine: `AgentRuntime`, tool definitions (Anthropic/OpenAI/Vercel), IR introspection, intent mapping, and JSON Schema helpers.
- **60 unit tests** for agent-sdk (tool naming, introspection, intent scoring, tool call routing).

## [1.0.15] - 2026-05-26

### Added

- **Entity `timestamps` modifier** — auto-injects `createdAt`/`updatedAt` on IR compile; runtime populates on create/update.
- Conformance fixture **`62-timestamp-auto-fields.manifest`**.
- Prisma projection: `@default(now())` on `createdAt`, `@updatedAt` on `updatedAt` when entity has `timestamps: true`.
- IR schema: `values`, `tenant`, `timestamps` fields aligned with compiler/runtime.

## [1.0.14] - 2026-05-26

### Added

- **`tenant` declaration** — `tenant <prop> : <type> from <context.path>` compiles to IR `tenant`, auto-injects on writes, filters reads, and fails closed on commands without tenant context.
- Conformance fixture **`61-tenant-isolation.manifest`**.
- Prisma projection: auto tenant column, `@@index`, and RLS policy hints when IR declares tenant.

## [1.0.13] - 2026-05-26

### Added

- **`value` declarations** — reusable composite types embedded on entity properties (IR `values[]`, Prisma `Json` columns).
- Conformance fixture **`60-value-objects.manifest`**.

## [1.0.12] - 2026-05-26

### Added

- **`@angriff36/manifest/ir-diff`** — compare two IR JSON files; optional SQL/Prisma migration hints.
- **`@angriff36/manifest/breaking-change`** — classify IR diffs as compatible, deprecated, or breaking.
- **CLI** `manifest diff ir-vs-ir` and `manifest diff breaking` with `--json`, `--sql`, `--prisma`, `--ci`.

## [1.0.11] - 2026-05-26

### Added

- **`npm run test:postgres`** — runs live Postgres adapter tests when `DATABASE_URL` is set (Manifest Neon DB, direct connection).
- Vitest loads `.env`; live suites use `DATABASE_URL` (legacy `MANIFEST_POSTGRES_TEST_URL` still accepted).

### Fixed

- **`PostgresOutboxStore.claim`** returns entries in stable FIFO order (`enqueued_at`, then `entry_id`).

## [1.0.10] - 2026-05-26

### Added

- **`manifest validate-ai`** CLI command: compile `.manifest` or validate `.ir.json` with schema + semantic checks, 0–100 scoring, and machine-readable JSON output for agent self-correction loops.
- **CLI tests** for IR validation, semantic diagnostics, scoring, text/JSON output, and manifest-source compilation.

## [1.0.9] - 2026-05-26

### Added

- **Expression builtins** in the reference runtime: string (`trim`, `split`, `replace`, …), math (`abs`, `min`, `max`, `between`, …), array (`sum`), and UTC date extractors (`year`, `month`, …).
- **Conformance fixture `56-expression-builtins`** for executable semantics.
- **`docs/spec/builtins.md`** Expression Library section documenting required callables.

## [1.0.8] - 2026-05-26

### Added

- **`decimal` and `money` type keywords** in the lexer (reserved words).
- **`IRType.params`** in `ir-v1.schema.json` for `precision` and `scale` on exact-decimal types.
- **Conformance fixture `56-decimal-type`** covering `decimal(10, 2)`, `money(12, 4)`, bare `decimal`, and nullable `money?`.
- **Compiler unit test** asserting decimal/money params survive IR lowering.

### Notes

- Parser and `transformType` already supported `decimal(p, s)` before this release; 1.0.8 completes the contract (schema + keywords + executable semantics).

## [1.0.7] - 2026-05-26

### Fixed

- **Enum property defaults**: `property status: Status = draft` now lowers to `defaultValue: { kind: "string", value: "draft" }` in IR.
- **`IRModule.enums`** added to `ir-v1.schema.json` (required + properties), matching `ir.ts` and the compiler.

### Changed

- Conformance expected IR hashes refreshed after enum-default lowering.
- Fixture **`57-enum-type`** restored with `status` default.

## [1.0.6] - 2026-05-26

### Added

- **First-class `enum` declarations** with optional labels and ordinals.
- Top-level **`IR.enums`** array (schema, compiler, types); existing programs emit `enums: []`.
- **Conformance fixture `57-enum-type`** for enum syntax and enum-typed properties.
- **`enum` lexer keyword**.

### Fixed

- **CLI `compile` directory glob** uses the source directory as `cwd` (multi-file duplicate-command detection works in temp dirs).
- **`runtime-smoke` IR fixture** includes `enums: []` (CLI build/typecheck).
- **ESLint** ignores `.worktrees/**`.

### Changed

- Regenerated conformance expected IR for `enums: []` on programs without enum declarations.

## [1.0.5] - 2026-05-25

### Added

- Postfix array type syntax (`string[]` → `array<string>`).
- Prisma scalar list fields from Manifest array types.

### Fixed

- Duplicate command-intent guard retained from 1.0.4.
