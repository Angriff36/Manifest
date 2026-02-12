# Next.js Projection

Generates Next.js App Router API routes from Manifest IR.

## Overview

The Next.js projection creates type-safe API route handlers that:
- Use direct Prisma queries for reads (efficient, bypasses runtime)
- Include configurable authentication (Clerk, NextAuth, custom, or none)
- Support tenant isolation with optional filtering
- Support soft delete filtering
- Generate TypeScript types and client SDKs

## Usage

### Basic Example

```typescript
import { compileToIR } from '@manifest/ir-compiler';
import { NextJsProjection } from '@manifest/projections/nextjs';

// Compile your manifest source
const source = `
  entity Recipe {
    property id: string
    property name: string
    property category: string?
  }
`;

const { ir } = await compileToIR(source);

// Create the projection
const projection = new NextJsProjection();

// Generate a GET route
const result = projection.generateRoute(ir, 'Recipe');
console.log(result.code);
// => Generates Next.js API route code

// Write to file
if (result.filePath) {
  await fs.writeFile(result.filePath, result.code);
}
```

### Configuration Options

```typescript
interface NextJsProjectionOptions {
  /** Auth provider: 'clerk', 'nextauth', 'custom', or 'none' */
  authProvider?: 'clerk' | 'nextauth' | 'custom' | 'none';

  /** Custom import path for auth utilities (default: '@/lib/auth') */
  authImportPath?: string;

  /** Custom import path for database client (default: '@/lib/database') */
  databaseImportPath?: string;

  /** Custom import path for response helpers (default: '@/lib/manifest-response') */
  responseImportPath?: string;

  /** Whether to include tenant filtering (default: true) */
  includeTenantFilter?: boolean;

  /** Whether to include soft delete filtering (default: true) */
  includeSoftDeleteFilter?: boolean;

  /** Name of tenant ID property (default: 'tenantId') */
  tenantIdProperty?: string;

  /** Name of soft delete timestamp property (default: 'deletedAt') */
  deletedAtProperty?: string;

  /** App Router directory (default: 'app/api') */
  appDir?: string;

  /** Whether to generate TypeScript strict mode code (default: true) */
  strictMode?: boolean;

  /** Output path for generated code */
  outputPath?: string;
}
```

### Authentication Examples

#### Clerk (Default)

```typescript
const result = projection.generateRoute(ir, 'Recipe', {
  authProvider: 'clerk',
  // Generates: import { auth } from "@clerk/nextjs";
});
```

#### NextAuth

```typescript
const result = projection.generateRoute(ir, 'Recipe', {
  authProvider: 'nextauth',
  // Generates: import { getServerSession } from "next-auth";
});
```

#### Custom Auth

```typescript
const result = projection.generateRoute(ir, 'Recipe', {
  authProvider: 'custom',
  authImportPath: '@/lib/my-custom-auth',
  // Generates: import { getUser } from "@/lib/my-custom-auth";
});
```

#### No Auth

```typescript
const result = projection.generateRoute(ir, 'Recipe', {
  authProvider: 'none',
  // Generates: const userId = "anonymous";
});
```

### Tenant Filtering

```typescript
// Enable tenant filtering (default)
const result = projection.generateRoute(ir, 'Recipe', {
  includeTenantFilter: true,
  tenantIdProperty: 'tenantId',
  // Generates: where: { tenantId, deletedAt: null }
});

// Disable tenant filtering
const result = projection.generateRoute(ir, 'Recipe', {
  includeTenantFilter: false,
  // Generates: where: { deletedAt: null }
});
```

### Soft Delete Filtering

```typescript
// Enable soft delete filtering (default)
const result = projection.generateRoute(ir, 'Recipe', {
  includeSoftDeleteFilter: true,
  deletedAtProperty: 'deletedAt',
  // Generates: where: { deletedAt: null }
});

// Disable soft delete filtering
const result = projection.generateRoute(ir, 'Recipe', {
  includeSoftDeleteFilter: false,
  // Generates: where: { }
});
```

### Custom Property Names

```typescript
const result = projection.generateRoute(ir, 'Recipe', {
  tenantIdProperty: 'orgId',
  deletedAtProperty: 'removedAt',
  // Generates: where: { orgId, removedAt: null }
});
```

### Generating TypeScript Types

```typescript
const typesResult = projection.generateTypes(ir);
// Generates: export interface Recipe { id: string; name: string; ... }
```

### Generating Client SDK

```typescript
const clientResult = projection.generateClient(ir);
// Generates: export async function getRecipes(): Promise<Recipe[]> { ... }
```

## Generated Route Structure

```typescript
// Auto-generated Next.js API route for Recipe
// Generated from Manifest IR - DO NOT EDIT

import { NextRequest } from "next/server";
import { database } from "@/lib/database";
import { manifestSuccessResponse, manifestErrorResponse } from "@/lib/manifest-response";

export async function GET(request: NextRequest) {
  try {
    // Auth check
    const { userId } = await auth();
    if (!userId) {
      return manifestErrorResponse("Unauthorized", 401);
    }

    // Tenant lookup (if enabled)
    const userMapping = await database.userTenantMapping.findUnique({
      where: { userId },
    });

    if (!userMapping) {
      return manifestErrorResponse("User not mapped to tenant", 400);
    }

    const { tenantId } = userMapping;

    // Direct Prisma query (NOT runtime.query)
    const recipes = await database.recipe.findMany({
      where: {
        tenantId,
        deletedAt: null
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return manifestSuccessResponse({ recipes });
  } catch (error) {
    console.error("Error fetching recipes:", error);
    return manifestErrorResponse("Internal server error", 500);
  }
}
```

## Important Design Decisions

### Reads Bypass Runtime

This projection generates **GET routes that use direct Prisma queries**, NOT `runtime.query()` or `runtime.get()`. This is intentional and correct because:

1. **Read policies are NOT enforced by default** - Per Manifest semantics, only `execute` and `all` policy scopes apply during command execution. `read` policies are not enforced unless explicitly configured.

2. **Performance** - Direct DB queries are more efficient than runtime overhead for simple GET operations.

3. **Flexibility** - Projections are tooling, not semantics. If you need runtime-level query enforcement, you're defining new execution semantics (requires spec + conformance updates).

See `docs/patterns/external-projections.md` for detailed rationale.

### Writes Must Use Runtime

For POST/PUT/DELETE operations (mutations), you **MUST use `runtime.executeCommand()`** because mutations require:
- Guard evaluation (ordered, short-circuit)
- Constraint validation
- Policy checks (execute or all)
- Event emission

## Testing

The projection includes comprehensive smoke tests that verify:
- Direct Prisma query generation (not runtime.query)
- Tenant and soft delete filtering
- Auth provider customization
- Error handling and diagnostics

Run tests with:
```bash
npm test src/manifest/projections/nextjs/generator.test.ts
```

## License

Part of the Manifest language implementation.
