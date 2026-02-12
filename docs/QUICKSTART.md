# Manifest Quick Start

Authority: Advisory
Enforced by: None
Last updated: 2026-02-12

Get up and running with Manifest in 5 minutes.

---

## Installation

```bash
npm install @manifest/runtime
```

Or use the standalone CLI:

```bash
npx manifest-generate compile my-program.manifest
```

---

## Your First Manifest Program

Create `my-program.manifest`:

```manifest
entity Todo {
  property id: string
  property title: string
  property completed: boolean
  property createdAt: timestamp

  command create(title: string) {
    guard title is not empty
    guard title.length < 100

    mutate this.title = title
    mutate this.completed = false
    mutate this.createdAt = now()
  }

  command complete() {
    guard this.completed is false

    mutate this.completed = true
    emit TodoCompleted { todoId: this.id }
  }

  policy read allow if user.role == "admin"
  policy execute allow if user.id == this.createdBy
}
```

---

## Compile to IR

```typescript
import { compileToIR } from '@manifest/runtime/ir-compiler';

const source = `
  entity Todo {
    property id: string
    property title: string
  }
`;

const { ir, diagnostics } = await compileToIR(source);

if (diagnostics.some(d => d.severity === 'error')) {
  console.error('Compilation errors:');
  diagnostics.forEach(d => console.error(`  ${d.message}`));
  process.exit(1);
}

console.log('IR:', ir);
```

---

## Execute Commands

```typescript
import { RuntimeEngine } from '@manifest/runtime';

const runtime = new RuntimeEngine(ir, {
  userId: 'user-123',
  tenantId: 'tenant-456',
});

// Create a todo
const createResult = await runtime.runCommand('Todo', 'create', {
  title: 'Learn Manifest'
});

if (!createResult.success) {
  console.error('Failed:', createResult.diagnostics);
  process.exit(1);
}

console.log('Created:', createResult.instance);

// Complete it
const completeResult = await runtime.runCommand('Todo', 'complete', {
  id: createResult.instance.id
});

if (completeResult.success) {
  console.log('Events:', completeResult.events);
  // Output: Events: [{ name: 'TodoCompleted', channel: 'default', ... }]
}
```

---

## Generate Next.js Routes

Use the Next.js projection to generate API routes:

```bash
npx manifest-generate nextjs Todo my-program.manifest --output app/api/todos/route.ts
```

Generated route (simplified):

```typescript
import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { database } from "@/lib/database";
import { manifestSuccessResponse, manifestErrorResponse } from "@/lib/manifest-response";
import { RuntimeEngine } from "@manifest/runtime";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return manifestErrorResponse("Unauthorized", 401);
  }

  const userMapping = await database.userTenantMapping.findUnique({
    where: { userId },
  });

  if (!userMapping) {
    return manifestErrorResponse("User not mapped to tenant", 400);
  }

  const { tenantId } = userMapping;

  const input = await request.json();

  const runtime = new RuntimeEngine(ir, { userId, tenantId });
  const result = await runtime.runCommand('Todo', 'create', input);

  if (!result.success) {
    return manifestErrorResponse(result.diagnostics);
  }

  return manifestSuccessResponse({ todo: result.instance });
}
```

---

## Listen to Events

```typescript
runtime.on('TodoCompleted', (event) => {
  console.log('Todo completed:', event.payload.todoId);

  // Trigger side effects
  sendEmail(event.payload.todoId);
  updateAnalytics(event.payload.todoId);
});
```

---

## Using Custom Stores

Integrate with existing databases via the `Store` interface:

```typescript
import { RuntimeEngine, Store } from '@manifest/runtime';

class PrismaTodoStore implements Store<Todo> {
  async getAll() {
    return await prisma.todo.findMany({
      where: { deletedAt: null }
    });
  }

  async getById(id: string) {
    return await prisma.todo.findUnique({ where: { id } }) ?? undefined;
  }

  async create(data: Partial<Todo>) {
    return await prisma.todo.create({ data });
  }

  async update(id: string, data: Partial<Todo>) {
    return await prisma.todo.update({ where: { id }, data });
  }

  async delete(id: string) {
    await prisma.todo.delete({ where: { id } });
    return true;
  }

  async clear() {
    await prisma.todo.deleteMany({});
  }
}

const runtime = new RuntimeEngine(ir, {
  userId: 'user-123',
  tenantId: 'tenant-456',
  storeProvider: (entityName) => {
    if (entityName === 'Todo') {
      return new PrismaTodoStore();
    }
    return undefined; // Use default memory store
  }
});
```

---

## Next Steps

- **Language Reference**: `docs/spec/semantics.md`
- **Integration Patterns**: `docs/patterns/usage-patterns.md`
- **Next.js Integration**: `docs/patterns/external-projections.md`
- **Custom Stores**: `docs/patterns/implementing-custom-stores.md`
- **Full Examples**: `src/manifest/examples.ts`

---

## Common Commands

```bash
# Compile manifest file
npx manifest-generate compile program.manifest

# Generate Next.js routes
npx manifest-generate nextjs Recipe program.manifest --output app/api/recipes/route.ts

# Run tests
npm test

# Type check
npm run typecheck

# Lint
npm run lint

# Development server
npm run dev
```

---

## Troubleshooting

### "Entity not found in IR"

Check that the entity name matches exactly (case-sensitive).

### "Guard failed but no diagnostic"

Ensure you're not silently catching errors. The runtime always emits diagnostics for guard failures.

### Tests failing after "small" change

Conformance tests are executable semantics. If tests fail, you either changed language meaning (update spec) or have a bug.

### Unsupported storage target

The runtime throws clear errors for unsupported targets. Use `storeProvider` to add custom stores.

See: `docs/FAQ.md` for more troubleshooting.
