# Manifest Troubleshooting Guide

Authority: Advisory
Enforced by: None
Last updated: 2026-02-12

Solutions to common problems when working with Manifest.

---

## Compilation Errors

### "Unexpected token at line X"

**Cause**: Syntax error in `.manifest` source.

**Solution**:
- Check for missing braces, semicolons, or keywords
- Verify property types are valid (`string`, `number`, `boolean`, `timestamp`, etc.)
- Use the lexer output to see how tokens are being parsed

```typescript
import { lex } from '@manifest/runtime';
const tokens = lex(source);
console.log(tokens);
```

### "Entity X not found"

**Cause**: Referencing an entity that doesn't exist in the IR.

**Solution**:
- Verify entity name is spelled correctly (case-sensitive)
- Check that the entity is defined before it's referenced
- Ensure compilation succeeded and IR contains the entity

```typescript
// Check what entities are in the IR
console.log(result.ir.entities.map(e => e.name));
```

### "Command X not found on entity Y"

**Cause**: Referencing a command that doesn't exist on the entity.

**Solution**:
- Verify the command is defined within the entity block
- Check command name spelling (case-sensitive)
- Ensure the command is defined before being called

---

## Runtime Errors

### "Guard failed but no diagnostic"

**Cause**: Silently catching errors or not checking result diagnostics.

**Solution**:
- Always check `result.success` before accessing `result.instance`
- Inspect `result.diagnostics` for detailed error information

```typescript
const result = await runtime.runCommand('Todo', 'create', input);

if (!result.success) {
  console.error('Failed:', result.diagnostics);
  // diagnostics contains: guard index, expression, resolved values
  return;
}

console.log('Success:', result.instance);
```

### "Policy denied"

**Cause**: Authorization policy rejected the command.

**Solution**:
- Check that `user.*` bindings are correctly set in runtime context
- Verify policy scope (`read`, `execute`, or `all`)
- Ensure user context matches policy conditions

```typescript
// Verify your runtime context
const runtime = new RuntimeEngine(ir, {
  userId: 'user-123',
  tenantId: 'tenant-456',
  // Add any other context your policies reference
  user: {
    id: 'user-123',
    role: 'admin'
  }
});
```

### "Constraint violation"

**Cause**: Data constraint failed validation.

**Solution**:
- Check constraint severity (`block`, `warn`, `ok`)
- Review constraint expression and resolved values
- For non-blocking constraints, check `result.nonBlockingViolations`

```typescript
if (result.nonBlockingViolations) {
  console.warn('Non-blocking violations:', result.nonBlockingViolations);
  // Execution continues but warnings are recorded
}
```

### "Store not supported"

**Cause**: Runtime doesn't support the requested storage target.

**Solution**:
- Use a supported target (`memory`, `localStorage`, `postgres`, `supabase`)
- Implement custom store via `storeProvider`
- Check that you're using the correct runtime for your environment

```typescript
// Browser: use memory or localStorage
// Node.js: can use postgres or supabase

// Custom store:
const runtime = new RuntimeEngine(ir, {
  userId: 'user-123',
  storeProvider: (entityName) => {
    if (entityName === 'Todo') {
      return new MyCustomStore();
    }
    return undefined; // default to memory
  }
});
```

---

## Projection Issues

### Generated Next.js route doesn't work

**Cause**: Projection configuration mismatch or missing dependencies.

**Solution**:
- Verify IR contains the entity you're generating for
- Check that import paths are correct for your project structure
- Ensure `@/lib/database` and other dependencies exist

```bash
# Verify entity exists in IR
npx manifest-generate compile program.manifest | jq '.entities[].name'
```

### "Cannot find module '@/lib/manifest-response'"

**Cause**: Missing response helper utilities.

**Solution**:
Create `src/lib/manifest-response.ts`:

```typescript
export function manifestSuccessResponse(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function manifestErrorResponse(
  message: string | Diagnostics,
  status = 400
) {
  return Response.json(
    typeof message === 'string' ? { error: message } : message,
    { status }
  );
}
```

### Auth integration failing

**Cause**: Next.js projection uses Clerk by default; you may use a different auth provider.

**Solution**:
- Modify the projection template to use your auth provider
- Or implement custom projection via `ProjectionTarget` interface

---

## Conformance Test Failures

### Test fixture changed but test still fails

**Cause**: Fixture update didn't regenerate expected outputs.

**Solution**:
```bash
npm run conformance:regen
```

**Warning**: Only run this when you are intentionally changing language semantics.

### "Expected IR differs from actual"

**Cause**: IR compiler behavior changed.

**Solution**:
- If change is intentional: update spec and regenerate fixtures
- If change is unintentional: fix the compiler bug

### "Expected results differ from actual"

**Cause**: Runtime behavior changed.

**Solution**:
- If change is intentional: update spec and regenerate fixtures
- If change is unintentional: fix the runtime bug

---

## Performance Issues

### Slow compilation for large programs

**Cause**: No IR caching; recompiling entire program each time.

**Solution**:
Cache compiled IR to avoid recompilation:

```typescript
import { compileToIR } from '@manifest/runtime/ir-compiler';
import fs from 'fs/promises';

// Check for cached IR
const cachePath = '.manifest-cache/recipe.ir.json';
let ir;

try {
  const cached = await fs.readFile(cachePath, 'utf-8');
  ir = JSON.parse(cached);
} catch {
  // Compile fresh if no cache
  const source = await fs.readFile('manifest/Recipe.manifest', 'utf-8');
  const result = await compileToIR(source);

  if (result.diagnostics.some(d => d.severity === 'error')) {
    throw new Error('Compilation failed');
  }

  ir = result.ir;

  // Write to cache
  await fs.mkdir('.manifest-cache', { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(ir, null, 2));
}
```

### Slow command execution

**Cause**: Inefficient store implementation or missing indexes.

**Solution**:
- Add database indexes on frequently queried fields
- Use store provider to optimize queries
- Enable constraint pre-check for faster validation failure

### Memory issues with large entities

**Cause**: Loading all instances into memory.

**Solution**:
- Use streaming/pagination for large datasets
- Implement cursor-based pagination in custom store

---

## Development Workflow Issues

### "npm test fails but I only changed docs"

**Cause**: Docs change shouldn't affect tests; check for unintended file modifications.

**Solution**:
```bash
git status  # Check what changed
git diff    # Review changes
```

### Type errors after pulling latest changes

**Cause**: TypeScript types changed but not rebuilt.

**Solution**:
```bash
npm run typecheck
npm run build  # If needed
```

### Lint errors on formatting

**Cause**: Code formatting doesn't match ESLint rules.

**Solution**:
```bash
npm run lint -- --fix
```

---

## Environment-Specific Issues

### Browser: localStorage quota exceeded

**Cause**: Storing too much data in localStorage.

**Solution**:
- Use `memory` store for large datasets
- Implement server-side persistence
- Clear old data periodically

### Node.js: Postgres connection issues

**Cause**: Database connection pool exhausted or misconfigured.

**Solution**:
- Configure connection pool size
- Use connection timeouts
- Implement retry logic

```typescript
const store = new PostgresStore({
  connectionString: process.env.DATABASE_URL,
  pool: { min: 1, max: 10 }
});
```

---

## Getting Help

Still stuck?

1. **Check the FAQ**: `docs/FAQ.md`
2. **Review semantics**: `docs/spec/semantics.md`
3. **Check examples**: `src/manifest/examples.ts`
4. **Review conformance fixtures**: `src/manifest/conformance/fixtures/`
5. **Open an issue**: Include manifest source, IR, and diagnostics

---

## Debugging Tips

### Enable verbose logging

```typescript
const runtime = new RuntimeEngine(ir, {
  userId: 'user-123',
  debug: true  // Enable debug logging
});
```

### Dump IR for inspection

```bash
node scripts/debug/dump-ir.mts program.manifest > ir.json
```

### Trace guard evaluation

```typescript
// Runtime emits guard failures with full context
runtime.on('guardFailed', (event) => {
  console.log('Guard failed:', {
    entity: event.entityName,
    command: event.commandName,
    guardIndex: event.guardIndex,
    expression: event.guardExpression,
    resolved: event.resolvedValues
  });
});
```

### Inspect runtime state

```typescript
console.log('Entities:', runtime.entities);
console.log('Stores:', runtime.stores);
console.log('Context:', runtime.context);
```
