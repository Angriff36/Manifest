# Multi-File Programs (`use`)

Last updated: 2026-07-01
Status: Active
Authority: Binding
Enforced by: src/manifest/module-resolver.ts, src/manifest/multi-compiler.ts, pnpm test
Applies to: `@angriff36/manifest@2.x`

## Overview

Manifest supports multi-file programs via `use` declarations. A file referenced with `use` contributes its top-level declarations (entities, enums, value objects, commands, policies, etc.) to the compilation unit. There is **no** named `import { Symbol } from "..."` syntax in the current parser — only `use`.

## Syntax

```manifest
use "./path/to/other.manifest"
```

**Rules:**
- Path must be relative (`./` or `../`)
- Path must end with `.manifest`
- `use` declarations MUST appear before all other declarations in the file

## Resolution

1. Walk `use` declarations to discover dependent files
2. Detect circular dependencies (compile error)
3. Topologically sort files (dependencies first)
4. Parse and compile each file; merge into a single IR program
5. Validate cross-file references (entity types, enum references, relationships)

## Examples

### Shared types + app file

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

### Multiple uses

```manifest
use "./types.manifest"
use "./enums.manifest"

entity Order {
  property required id: string
}
```

## Errors

| Condition | Result |
|-----------|--------|
| Circular `use` chain | Compile error with cycle path |
| Absolute path | `use path must be relative` |
| Wrong extension | `use path must end with '.manifest'` |
| `use` after other declarations | Parse error |

## Relationship to modules

`module { ... }` blocks namespace declarations within a file. `use` links **files**. Both can appear in the same program; see `docs/features/modules-and-imports.md` for module syntax.

## Not implemented (v1)

The following are **not** supported by the current parser:

- Named imports: `import { User } from "./types.manifest"`
- Wildcard aliases: `import * as Types from "..."`
- Re-exports

Do not document or emit `import` syntax until parser support lands and conformance fixtures exist.
