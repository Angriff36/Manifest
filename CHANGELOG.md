# Changelog

All notable changes to `@angriff36/manifest` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
