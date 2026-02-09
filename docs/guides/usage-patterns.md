# Manifest Usage Patterns

This guide explains the two primary ways to use Manifest in your application: **Projections** and **Embedded Runtime**.

---

## Quick Reference

| Pattern | Best For | Generated Code | Control Level |
|---------|----------|----------------|---------------|
| **Projections** | Simple CRUD, greenfield apps | Auto-generated API routes | Low (convention-based) |
| **Embedded Runtime** | Complex workflows, existing apps | You write all handlers | High (full control) |

**Most real-world apps use both** — projections for standard CRUD, embedded runtime for complex business logic.

---

## Pattern 1: Projections (Auto-Generated Routes)

### How It Works

```
.manifest source → IR → Projection → Generated API Routes
```

You define your domain in `.manifest` files, and Manifest generates type-safe API routes for you.

### When to Use Projections

✅ **Use projections when:**

- Your operations are standard database CRUD
- Commands map 1:1 to database operations
- Events are for notification only (no complex side effects)
- Response format is `{ result, events }`
- You're building a greenfield app or new feature
- You want rapid development with minimal boilerplate

❌ **Don't use projections when:**

- You need custom file parsing or transformation
- Commands trigger external API calls
- Events require complex side effects (multiple DB writes, webhooks)
- Response format is custom or non-standard
- You have existing API logic to integrate

### Example: Simple CRUD App

```manifest
// modules/recipe.manifest
entity Recipe {
  property required id: string
  property required name: string
  property category: string?
  property required ingredients: array[]

  command create(name: string, category?: string, ingredients: array[]) {
    guard user.role == "chef"
    mutate id = generateId()
    mutate name = name
    mutate category = category
    mutate ingredients = ingredients
    emit RecipeCreated
  }

  command updateName(name: string) {
    guard user.id == self.id
    mutate name = name
  }
}

store Recipe in postgres
```

Generate routes:

```typescript
// scripts/generate-routes.ts
import { compileToIR } from '@manifest/compiler';
import { NextJsProjection } from '@manifest/projections/nextjs';
import fs from 'fs/promises';

async function generate() {
  const { ir } = await compileToIR(manifestSource);
  const projection = new NextJsProjection({
    authProvider: 'clerk',
    databaseImportPath: '@/lib/database',
    runtimeImportPath: '@/lib/manifest-runtime',
    responseImportPath: '@/lib/manifest-response',
  });

  // Generate Recipe GET route (list)
  const getRoute = projection.generateRoute(ir, 'Recipe');
  if (getRoute.filePath) {
    await fs.writeFile(getRoute.filePath, getRoute.code);
  }

  // Generate Recipe POST route (create command)
  const postRoute = projection.generateRoute(ir, 'Recipe', 'create');
  if (postRoute.filePath) {
    await fs.writeFile(postRoute.filePath, postRoute.code);
  }

  console.log(`Generated routes for Recipe`);
}

generate();
```

Run: `npm run generate` → Creates `app/api/recipe/route.ts`

### What Gets Generated

```typescript
// app/api/recipe/route.ts (DO NOT EDIT - auto-generated)
import { NextRequest } from "next/server";
import { database } from "@/lib/database";
import { manifestSuccessResponse, manifestErrorResponse } from "@/lib/manifest-response";
import { createManifestRuntime } from "@/lib/manifest-runtime";
import { auth } from "@clerk/nextjs";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return manifestErrorResponse("Unauthorized", 401);
    }

    // Direct Prisma query (bypasses runtime for performance)
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

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return manifestErrorResponse("Unauthorized", 401);
    }

    const body = await request.json();
    const runtime = createManifestRuntime({ user: { id: userId, tenantId } });

    // Writes MUST flow through runtime to enforce guards, policies, and constraints
    const result = await runtime.runCommand("create", body, {
      entityName: "Recipe",
    });

    if (!result.success) {
      if (result.policyDenial) {
        return manifestErrorResponse(`Access denied: ${result.policyDenial.policyName}`, 403);
      }
      if (result.guardFailure) {
        return manifestErrorResponse(`Guard ${result.guardFailure.index} failed: ${result.guardFailure.formatted}`, 422);
      }
      return manifestErrorResponse(result.error ?? "Command failed", 400);
    }

    return manifestSuccessResponse({ result: result.result, events: result.emittedEvents });
  } catch (error) {
    console.error("Error creating recipe:", error);
    return manifestErrorResponse("Internal server error", 500);
  }
}
```

### Files You Need (One-Time Setup)

```typescript
// lib/manifest-runtime.ts
import { createManifestRuntime } from '@manifest/runtime';

export function createRuntime(userContext: { id: string; tenantId?: string }) {
  return createManifestRuntime({
    user: userContext,
  });
}
```

```typescript
// lib/database.ts
import { PrismaClient } from '@prisma/client';

export const database = new PrismaClient();
```

```typescript
// lib/manifest-response.ts
import { NextResponse } from 'next/server';

export function manifestSuccessResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function manifestErrorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
```

### Regeneration Workflow

1. Edit `.manifest` source files
2. Run `npm run generate` (regenerates routes)
3. **DO NOT EDIT** generated route files
4. Test your API

---

## Pattern 2: Embedded Runtime (Custom Handlers)

### How It Works

```
Your API Route → RuntimeEngine → Manual Event Handling → Your DB Writes
```

You import `RuntimeEngine` directly in your API routes and have full control over execution flow.

### When to Use Embedded Runtime

✅ **Use embedded runtime when:**

- You have existing API logic to integrate
- Commands trigger complex workflows
- Events require multiple side effects (DB writes, webhooks, cache invalidation)
- You need custom file parsing or transformation
- Response format is non-standard
- You're integrating external services
- You need fine-grained control over execution

❌ **Don't use embedded runtime when:**

- You just need simple CRUD operations
- You want to minimize boilerplate
- You're starting a new feature from scratch

### Example: Document Import Workflow

```manifest
// modules/workflows.manifest
module DocumentImport {
  entity DocumentImport {
    property required id: string
    property status: string = "pending"
    property fileId: string
    property parseResult: object?

    command process(fileId: string) {
      guard user.role == "admin"
      mutate fileId = fileId
      mutate status = "processing"
      emit DocumentProcessing
    }

    command complete(parseResult: object) {
      guard self.status == "processing"
      mutate parseResult = parseResult
      mutate status = "completed"
      emit DocumentCompleted
    }
  }

  event DocumentProcessing: "import.document.processing" {
    importId: string
    fileId: string
  }

  event DocumentCompleted: "import.document.completed" {
    importId: string
    parseResult: object
  }
}
```

Custom API handler:

```typescript
// app/api/documents/import/route.ts
import { RuntimeEngine, compileToIR } from '@manifest/runtime';
import { auth } from '@clerk/nextjs';
import manifestSource from '../../../modules/workflows.manifest?raw';

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Compile and create runtime
  const { ir } = await compileToIR(manifestSource);
  const engine = new RuntimeEngine(ir, {
    user: { id: userId },
    tenantId: 'tenant-123', // from your auth context
  });

  // Custom file parsing (not handled by Manifest)
  const file = await request.formData().get('file') as File;
  const parseResult = await parseDocumentFile(file);

  // Execute Manifest command for validation + events
  const result = await engine.runCommand('process', {
    fileId: file.name,
  });

  if (!result.success) {
    return NextResponse.json({
      error: result.error,
      guardFailure: result.guardFailure,
    }, { status: 400 });
  }

  // Custom event handling - write to database
  engine.onEvent(async (event) => {
    if (event.name === 'DocumentProcessing') {
      // Write to import log table
      await database.documentImport.create({
        data: {
          id: event.payload.importId,
          fileId: event.payload.fileId,
          status: 'processing',
          userId,
        }
      });

      // Trigger background processing job
      await queue.add('process-document', {
        importId: event.payload.importId,
        fileId: event.payload.fileId,
        parseResult,
      });

      // Invalidate cache
      await cache.invalidate('document-imports');
    }

    if (event.name === 'DocumentCompleted') {
      await database.documentImport.update({
        where: { id: event.payload.importId },
        data: {
          status: 'completed',
          parseResult: event.payload.parseResult,
        }
      });

      // Send webhook notification
      await webhookService.send({
        event: 'document.completed',
        data: event.payload,
      });
    }
  });

  // Custom response format
  return NextResponse.json({
    imported: true,
    importId: result.emittedEvents[0]?.payload?.importId,
    documentCount: parseResult.documents.length,
  });
}
```

---

## Mixing Both Patterns

Most real-world applications use **both patterns** together:

### Example: SaaS Application

```manifest
// modules/crud.manifest - Use PROJECTIONS
entity User {
  property id: string
  property name: string
  property email: string

  command updateName(name: string) {
    mutate name = name
  }
}

entity Task {
  property id: string
  property title: string
  property status: string = "pending"

  command complete() {
    mutate status = "completed"
  }
}
```

```manifest
// modules/workflows.manifest - Use EMBEDDED RUNTIME
module DocumentImport {
  // ... complex workflow commands
}

module InvoiceProcessing {
  // ... complex workflow commands
}
```

```typescript
// scripts/generate-crud-routes.ts
// Generate routes for simple CRUD entities
import { compileToIR } from '@manifest/compiler';
import { NextJsProjection } from '@manifest/projections/nextjs';
import crudSource from '../modules/crud.manifest?raw';

async function generate() {
  const { ir } = await compileToIR(crudSource);
  const projection = new NextJsProjection({
    authProvider: 'clerk',
    databaseImportPath: '@/lib/database',
  });

  projection.generateRoute(ir, 'User');   // → app/api/user/route.ts
  projection.generateRoute(ir, 'Task');   // → app/api/task/route.ts
}

generate();
```

```typescript
// app/api/documents/import/route.ts
// Custom handler for complex workflows
export async function POST(request: NextRequest) {
  const engine = new RuntimeEngine(ir, { user, tenantId });
  // ... custom logic
}
```

### File Structure

```
your-app/
├── modules/
│   ├── crud.manifest           # ← For projections (simple CRUD)
│   └── workflows.manifest      # ← For embedded runtime (complex logic)
│
├── app/api/
│   ├── user/
│   │   └── route.ts            # ← GENERATED (don't edit)
│   ├── task/
│   │   └── route.ts            # ← GENERATED (don't edit)
│   └── documents/
│       └── import/
│           └── route.ts        # ← CUSTOM (you write this)
│
├── lib/
│   ├── manifest-runtime.ts     # ← One-time setup
│   ├── database.ts             # ← One-time setup
│   └── manifest-response.ts    # ← One-time setup
│
└── scripts/
    └── generate-crud-routes.ts # ← Run to regenerate CRUD routes
```

---

## Decision Tree

Not sure which pattern to use? Answer these questions:

```
Is this operation simple database CRUD?
│
├─ YES → Use PROJECTION
│
└─ NO → Does it involve file parsing or external APIs?
           │
           ├─ YES → Use EMBEDDED RUNTIME
           │
           └─ NO → Do events trigger complex side effects?
                      │
                      ├─ YES → Use EMBEDDED RUNTIME
                      │
                      └─ NO → Is response format custom?
                                 │
                                 ├─ YES → Use EMBEDDED RUNTIME
                                 │
                                 └─ NO → Use PROJECTION
```

---

## Quick Comparison

| Operation | Projection | Embedded Runtime |
|-----------|------------|------------------|
| **User profile CRUD** | ✅ | ❌ (overkill) |
| **Task management** | ✅ | ❌ (overkill) |
| **Settings/preferences** | ✅ | ❌ (overkill) |
| **File upload + parsing** | ❌ | ✅ |
| **Multi-step workflows** | ❌ | ✅ |
| **External API integration** | ❌ | ✅ |
| **Data pipelines/ETL** | ❌ | ✅ |
| **Webhook handling** | ❌ | ✅ |
| **Real-time sync** | ❌ | ✅ |

---

## Next Steps

- For projection details: See `src/manifest/projections/nextjs/README.md`
- For language semantics: See `docs/spec/semantics.md`
- For IR schema: See `docs/spec/ir/ir-v1.schema.json`

---

## Summary

**Projections**: Fast CRUD, convention-based, don't edit generated files
**Embedded Runtime**: Full control, custom workflows, you write everything

**Best practice**: Use both — projections for boring CRUD, embedded runtime for the complex logic that makes your app unique.
