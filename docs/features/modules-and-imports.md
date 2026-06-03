# Modules and Imports

## Summary

Manifest supports multi-file projects with `use` declarations and `import` statements. The module resolver detects cycles, performs topological sorting, and merges IR across all files into a single compiled output.

## DSL Syntax

```manifest
// In shared/types.manifest
enum Status {
  draft
  published
  archived
}

// In app.manifest
use "./shared/types.manifest"

entity Article {
  property required title: string
  property status: Status = draft
}
```

Alternative import syntax:

```manifest
import { Status } from "./shared/types.manifest"
```

## Compilation Pipeline

1. **Resolution**: Walk `use`/`import` declarations to discover all files
2. **Cycle detection**: Detect circular imports (A imports B imports A)
3. **Topological sort**: Kahn's algorithm determines compile order
4. **Per-file compilation**: Each file is parsed and compiled to IR independently
5. **IR merging**: All per-file IRs are merged into a single output
6. **Cross-file validation**: References across files are validated (e.g., entity types, enum references)

## CLI Flags

- `manifest compile --merge` — merge all discovered files into a single IR output
- `manifest compile --entry src/app.manifest` — specify the entry point for resolution

## Namespace Isolation

Each module's entities, events, and enums are namespaced by default. Two files can define entities with the same name without collision — the module prefix disambiguates them in the merged IR.

## Conformance Fixtures

Multi-module compilation tested via conformance fixtures.

## Notes

- Cycle detection is transitive (A → B → C → A is caught)
- Circular imports produce a compile error diagnostic listing the cycle path
- The merged IR contains a `modules` array preserving module boundaries for downstream tooling
