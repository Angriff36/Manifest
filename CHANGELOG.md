# Changelog

All notable changes to `@angriff36/manifest` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
