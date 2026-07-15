# Modules and Imports

## Summary

Manifest supports multi-file projects with `use` declarations. The module resolver detects cycles, performs topological sorting, and merges IR across all files into a single compiled output. Named `import { ... } from "..."` is **not** implemented — see `docs/spec/imports.md`.

## DSL Syntax

`shared/status.manifest`:

```manifest
enum Status {
  draft
  published
  archived
}
```

`app.manifest`:

```manifest
use "./shared/status.manifest"

entity Article {
  property required title: string
  property status: Status = draft
}
```

## Compilation Pipeline

1. **Resolution**: Walk `use` declarations to discover all files
2. **Cycle detection**: Detect circular imports (A uses B uses A)
3. **Topological sort**: Kahn's algorithm determines compile order
4. **Per-file compilation**: Each file is parsed and compiled to IR independently
5. **IR merging**: All per-file IRs are merged into a single output
6. **Cross-file validation**: References across files are validated (e.g., entity types, enum references)

## Module Blocks

Within a file, `module Name { ... }` groups declarations. Module-scoped entities are referenced as `Module.Entity` in cross-module relationships when required.

## Conformance

Multi-file behavior is covered by `module-resolver.test.ts` and parser tests using `use "./path.manifest"`. There is no `import` keyword in the lexer.

## Notes

- `use` must appear before other declarations in a file
- Only relative paths ending in `.manifest` are valid
>
> **Correction (2026-07-15) @RYANSIGNED:** Multi-file merge does **not** path-prefix entity/enum/event names. Duplicate top-level names across `use`d files are a **compile error**. Keep declaration names unique across the merged project (`src/manifest/multi-compiler.test.ts`).
