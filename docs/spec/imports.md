# Import System

## Overview

The import system allows .manifest files to reference entities, enums, and value objects defined in other files. Imports enable code reuse and organization by letting shared domain primitives (e.g., `Money`, `Address`) be defined once and referenced across multiple files.

## Syntax

### Import Declaration

```manifest
import { SymbolName, AnotherName as Alias } from "./path/to/file.manifest"
```

**Components:**
- `import` keyword
- `{ ... }` - comma-separated list of specifiers
- `from` keyword
- String literal path to .manifest file

### Specifiers

Each specifier can be:
- **Simple import**: `{ User }` - imports `User` as-is
- **Aliased import**: `{ User as Customer }` - imports `User` as `Customer`

### Path Rules

- Must be relative (starting with `./` or `../`)
- Must end with `.manifest`
- Resolved relative to the importing file's directory

## Importable Kinds

Only the following can be imported:

| Kind | Example |
|------|---------|
| Entities | `import { User, Product } from "./types.manifest"` |
| Enums | `import { Status, Priority } from "./enums.manifest"` |
| Value Objects | `import { Money, Address } from "./primitives.manifest"` |

**Cannot be imported:**
- Commands (entity-scoped or module-scoped)
- Flows
- Policies
- Stores
- Events
- Reactions
- Roles
- Modules

These must be defined in the file that uses them or inherited via `use` declarations.

## Ordering

Import declarations must appear **before** all other declarations in a file:

```manifest
import { User } from "./types.manifest"
import { Order } from "./commerce.manifest"

entity Order {
  property customer: User
}
```

Imports after other declarations are a compile error.

## Resolution Algorithm

1. **Parse Phase**: Each file is parsed, extracting import declarations
2. **Graph Resolution**: Dependency graph is built with imports as edges
3. **Cycle Detection**: DFS-based cycle detection reports circular dependencies
4. **Validation**: Each import specifier is validated against the exported symbols of the target file
5. **Topological Sort**: Files are ordered such that dependencies are compiled before dependents

## Errors

### Unknown Symbol

```manifest
import { NonExistent } from "./types.manifest"
```

**Error**: `Cannot import 'NonExistent' from './types.manifest': not exported (must be an entity, enum, or value object)`

### Wrong Kind

```manifest
import { UpdateName } from "./user.manifest"  // UpdateName is a command
```

**Error**: `Cannot import 'UpdateName' from './user.manifest': not exported (must be an entity, enum, or value object)`

### Circular Dependency

```manifest
// a.manifest
import { B } from "./b.manifest"
entity A { property b: B }

// b.manifest
import { A } from "./a.manifest"
entity B { property a: A }
```

**Error**: `Circular dependency detected: /project/a.manifest -> /project/b.manifest -> /project/a.manifest`

### Absolute Path

```manifest
import { User } from "/absolute/path.manifest"
```

**Error**: `import path must be relative (start with './' or '../'), got '/absolute/path.manifest'`

### Wrong Extension

```manifest
import { User } from "./types.ts"
```

**Error**: `import path must end with '.manifest', got './types.ts'`

## Integration with Multi-File Compilation

The import system is fully integrated with the multi-file compilation pipeline:

1. **Module Resolution**: `module-resolver.ts` resolves import paths and builds the dependency graph
2. **Symbol Validation**: Import specifiers are validated against exported symbols
3. **Cross-File Validation**: The multi-compiler validates cross-file references (e.g., relationships targeting entities from other files)

## Relationship with `use` Declarations

The `import` keyword provides **named imports** with explicit symbol lists:

```manifest
import { User, Order } from "./types.manifest"
```

The `use` keyword provides **legacy wildcard imports** (all symbols are imported):

```manifest
use "./types.manifest"
```

Both can be used in the same file, but must appear before other declarations:

```manifest
import { User } from "./user.manifest"
use "./legacy.manifest"

entity Order {
  property customer: User
}
```

## Examples

### Basic Import

```manifest
// shared/types.manifest
entity User {
  property name: string
}

entity Order {
  property total: number
}

// app/main.manifest
import { User, Order } from "./shared/types.manifest"

entity Invoice {
  property customer: User
  property order: Order
}
```

### Import with Alias

```manifest
// types.manifest
entity User {
  property name: string
}

// app/main.manifest
import { User as Customer } from "./types.manifest"

entity Order {
  property customer: Customer
}
```

### Multiple Imports

```manifest
import { User } from "./user.manifest"
import { Order, Product } from "./commerce.manifest"
import { Money } from "./primitives.manifest"

entity Purchase {
  property buyer: User
  property order: Order
  property item: Product
  property total: Money
}
```

### Transitive Imports

```manifest
// a.manifest
entity User {
  property name: string
}

// b.manifest
import { User } from "./a.manifest"

entity Order {
  property user: User
}

// c.manifest
import { Order } from "./b.manifest"

entity Invoice {
  property order: Order
}
```

## Future Enhancements

The following features are **not** supported in v1 but may be added in future versions:

- **Wildcard imports**: `import * as Types from "./types.manifest"`
- **Re-exports**: `export { User } from "./types.manifest"`
- **Bare specifiers**: `import { User } from "types"` (would require module resolution configuration)
- **Type-only imports**: `import type { User } from "./types.manifest"`
