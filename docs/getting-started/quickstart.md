# Manifest Quick Start

Authority: Advisory
Enforced by: None
Last updated: 2026-06-09

Get up and running with Manifest in 5 minutes.

---

## Installation

```bash
pnpm add @angriff36/manifest
```

Configure GitHub Packages for the `@angriff36` scope if you have not already. See `docs/reference/packages-and-distribution.md`.

Or use the CLI from the installed package:

```bash
pnpm exec manifest compile my-program.manifest -o ir/
```

---

## Your First Manifest Program

Create `my-program.manifest`:

```manifest
entity Task {
  property required title: string = ""
  property required status: string = "todo"
  property required assigneeId: string = ""
  property required createdAt: number = 0

  command updateStatus(newStatus: string) {
    guard newStatus != null and newStatus != ""
    guard newStatus == "todo" or newStatus == "in-progress" or newStatus == "done"
    mutate status = newStatus
    emit TaskStatusUpdated
  }

  command assignTask(userId: string) {
    guard userId != null and userId != ""
    guard self.assigneeId == "" or user.role == "admin"
    mutate assigneeId = userId
    emit TaskAssigned
  }

  store Task in memory
}

policy OnlyCreatorOrAssignee execute: user.role == "admin" or user.id == self.assigneeId "Only admins or the assigned user can modify this task"

event TaskStatusUpdated: "tasks.updated" {
  id: string
  oldStatus: string
  newStatus: string
  updatedAt: number
}

event TaskAssigned: "tasks.assigned" {
  id: string
  assigneeId: string
  assignedAt: number
}
```

---

## Compile to IR

```typescript
import { compileToIR } from '@angriff36/manifest/ir-compiler';

const source = `
  entity Task {
    property required title: string = ""
    property required status: string = "todo"
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
import { RuntimeEngine } from '@angriff36/manifest';

const runtime = new RuntimeEngine(ir, {
  actorId: 'user-123',
  tenantId: 'tenant-456',
  user: { id: 'user-123', role: 'admin' },
});

// Create a task instance first (commands run on instances)
const instance = await runtime.createInstance('Task', {
  title: 'Learn Manifest',
});

if (!instance) {
  console.error('Failed to create instance');
  process.exit(1);
}

console.log('Created:', instance);

// Update status via command
const updateResult = await runtime.runCommand('updateStatus', {
  newStatus: 'done',
}, {
  entityName: 'Task',
  instanceId: instance.id,
});

if (updateResult.success) {
  console.log('Events:', updateResult.emittedEvents);
}
```

---

## Generate Next.js Routes

Use the Next.js projection to generate API routes:

```bash
pnpm exec manifest build my-program.manifest -p nextjs -s route --code-output generated/
```

Or compile to IR first, then generate:

```bash
pnpm exec manifest compile my-program.manifest -o ir/
pnpm exec manifest generate ir/ -p nextjs -s route -o generated/
```

Generated route (simplified):

```typescript
import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { database } from "@/lib/database";
import { manifestSuccessResponse, manifestErrorResponse } from "@/lib/manifest-response";
import { RuntimeEngine } from "@angriff36/manifest";

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

  const runtime = new RuntimeEngine(ir, {
    actorId: userId,
    tenantId,
    user: { id: userId, role: userMapping.role },
  });
  const result = await runtime.runCommand('updateStatus', input, { entityName: 'Task', instanceId: input.id });

  if (!result.success) {
    return manifestErrorResponse(result.guardFailure?.formatted ?? result.error ?? 'Command failed');
  }

  return manifestSuccessResponse({ task: result.instance });
}
```

---

## Listen to Events

```typescript
const unsubscribe = runtime.onEvent((event) => {
  if (event.name === 'TaskStatusUpdated') {
    console.log('Task status updated:', event.payload);
  }
});

// Later: unsubscribe();
unsubscribe();
```

---

## Using Custom Stores

Integrate with existing databases via the `Store` interface:

```typescript
import { RuntimeEngine, Store } from '@angriff36/manifest';

class PrismaTaskStore implements Store {
  async getAll() {
    return await prisma.task.findMany({
      where: { deletedAt: null }
    });
  }

  async getById(id: string) {
    return await prisma.task.findUnique({ where: { id } }) ?? undefined;
  }

  async create(data: Record<string, unknown>) {
    return await prisma.task.create({ data });
  }

  async update(id: string, data: Record<string, unknown>) {
    return await prisma.task.update({ where: { id }, data });
  }

  async delete(id: string) {
    await prisma.task.delete({ where: { id } });
    return true;
  }

  async clear() {
    await prisma.task.deleteMany({});
  }
}

const runtime = new RuntimeEngine(
  ir,
  {
    actorId: 'user-123',
    tenantId: 'tenant-456',
    user: { id: 'user-123', role: 'admin' },
  },
  {
    storeProvider: (entityName) => {
      if (entityName === 'Task') {
        return new PrismaTaskStore();
      }
      return undefined; // Use default memory store
    },
  }
);
```

---

## Next Steps

- **Language Reference**: `docs/spec/semantics.md`
- **Integration Patterns**: `docs/guides/usage-patterns.md`
- **Next.js Integration**: `docs/projections/nextjs.md`
- **Custom Stores**: `docs/guides/implementing-custom-stores.md`
- **Full Examples**: `src/manifest/examples.ts`

---

## Common Commands

```bash
# Compile manifest file to IR
pnpm exec manifest compile program.manifest -o ir/

# Build IR + generate Next.js routes
pnpm exec manifest build program.manifest -p nextjs -s route --code-output generated/

# Run tests
pnpm test

# Type check
pnpm run typecheck

# Lint
pnpm run lint

# Development server (Kitchen/Runtime UI)
pnpm run dev
```

---

## Troubleshooting

### "Entity not found in IR"

Check that the entity name matches exactly (case-sensitive).

### "Guard failed but no diagnostic"

Ensure you're not silently catching errors. The runtime returns `guardFailure` on guard failures with index, expression, and resolved values.

### Tests failing after "small" change

Conformance tests are executable semantics. If tests fail, you either changed language meaning (update spec) or have a bug.

### Unsupported storage target

The runtime throws clear errors for unsupported targets. Use `storeProvider` in the third constructor argument to add custom stores.

See: `docs/getting-started/faq.md` for more troubleshooting.
