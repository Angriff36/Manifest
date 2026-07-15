# Manifest Troubleshooting Guide

Authority: Advisory
Enforced by: None
Last updated: 2026-07-15

Solutions to common problems when working with Manifest.

---

## CLI Issues

### `manifest validate` reports "Missing required field: metadata"

**Cause:** You are running a stale global CLI binary. The old `validate` command ignored the schema it loaded and ran hardcoded validation against a `metadata` field that does not exist in the IR spec. The IR was valid; the CLI was wrong.

**Solution:** Stop using the global binary. Use `pnpm exec manifest` instead, which resolves from the installed package:

```bash
pnpm exec manifest validate path/to/output.ir.json
```

If you don't have the current version installed yet:

```bash
~~pnpm add @angriff36/manifest@2.3.0~~
pnpm add @angriff36/manifest@3.6.4
pnpm exec manifest validate path/to/output.ir.json
```

> **Correction (2026-07-15) @RYANSIGNED:** Pin to the published SoT in root
> `package.json` (**3.6.4** as of this edit). Do not install the stale `2.3.0`
> example. Node.js **`>=20`** (`engines.node`).

Do not copy schema files, modify provenance, or create symlinks as workarounds. The IR is valid.

---

### `manifest validate` reports "Schema not found at docs/spec/ir/ir-v1.schema.json"

**Cause:** You are running a stale global CLI binary. The old CLI resolved the schema relative to `process.cwd()`, which only works inside the manifest repo itself. Consumer projects don't have that path.

**Solution:** Same as above — use `pnpm exec manifest` with the current package. The schema is bundled inside the package and resolved relative to the CLI binary, not the working directory.

---

### `manifest --version` reports a different version than the installed package

**Cause:** You have a globally installed CLI binary that is a different version from the `@angriff36/manifest` package installed in your project. These are independent and will drift.

**Solution:** Always use `pnpm exec manifest` (or `npx manifest`). Never rely on a global install. `manifest --version` reads from the package's own `package.json` at runtime, so `pnpm exec manifest --version` will always match the installed package version.

---

## Compilation Errors

### "Unexpected token at line X"

**Cause**: Syntax error in `.manifest` source.

**Solution**:

- Check for missing braces, semicolons, or keywords
- Verify property types are valid (`string`, `number`, `boolean`, `timestamp`, etc.)
- Use the lexer output to see how tokens are being parsed

```typescript
import { Lexer } from '@angriff36/manifest/lexer';
const tokens = new Lexer(source).tokenize();
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
console.log(result.ir.entities.map((e) => e.name));
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

**Cause**: Not checking the correct fields on `CommandResult`.

**Solution**:

- Always check `result.success` before accessing `result.result`
- Inspect `result.guardFailure`, `result.policyDenial`, or `result.error` for detailed error information
- Note: `CommandResult` does NOT have a `diagnostics` field - use the specific failure fields instead

```typescript
const result = await runtime.runCommand('create', input, { entityName: 'Todo' });

if (!result.success) {
  if (result.guardFailure) {
    console.error('Guard failed:', {
      index: result.guardFailure.index,
      expression: result.guardFailure.formatted,
      resolved: result.guardFailure.resolved,
    });
  } else if (result.policyDenial) {
    console.error('Policy denied:', {
      policy: result.policyDenial.policyName,
      message: result.policyDenial.message,
    });
  } else {
    console.error('Error:', result.error);
  }
  return;
}

console.log('Success:', result.result);
```

**For API responses**, map `CommandResult` fields to your HTTP response shape in application code. The runtime returns structured failure details on `guardFailure`, `policyDenial`, and `error` — there is no `diagnostics` field on `CommandResult`. Next.js projections generate helpers such as `manifestSuccessResponse` / `manifestErrorResponse` in `@/lib/manifest-response`.

### "Policy denied"

**Cause**: Authorization policy rejected the command.

**Solution**:

- Check that `user.*` bindings are correctly set in runtime context
- Verify policy scope (`read`, `execute`, or `all`)
- Ensure user context matches policy conditions

```typescript
// Verify your runtime context
const runtime = new RuntimeEngine(ir, {
  actorId: 'user-123',
  tenantId: 'tenant-456',
  user: {
    id: 'user-123',
    role: 'admin',
  },
});
```

### "Constraint violation"

**Cause**: Data constraint failed validation.

**Solution**:

- Check constraint severity (`block`, `warn`, `ok`)
- Review constraint expression and resolved values
- For non-blocking constraints, check `result.constraintOutcomes`

```typescript
const warnings = result.constraintOutcomes?.filter((o) => o.severity === 'warn');
if (warnings?.length) {
  console.warn('Non-blocking constraint outcomes:', warnings);
}
```

### "Store not supported"

**Cause**: Runtime doesn't support the requested storage target.

**Solution**:

- `memory` and browser `localStorage` need no provider.
- `postgres`, `supabase`, `durable`, and custom targets require a matching store from `storeProvider`.
- Generated companions require entity bindings in `manifest.config.ts` and `runtimeConfigImport` in projection options.
- Check that you're using the correct runtime for your environment

```typescript
// Custom store (storeProvider is the third constructor argument):
const runtime = new RuntimeEngine(
  ir,
  { actorId: 'user-123', user: { id: 'user-123', role: 'admin' } },
  {
    storeProvider: (entityName) => {
      if (entityName === 'Todo') {
        return new MyCustomStore();
      }
      return undefined; // only safe when the declared target has a built-in store
    },
  },
);
```

See the [complete generated-companion PostgreSQL example](../spec/config/manifest.config.md#complete-postgresql-runtime-companion-example).

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
pnpm exec manifest compile program.manifest -o program.ir.json
# Then inspect entities (requires jq)
jq '.entities[].name' program.ir.json
```

### "Cannot find module '@/lib/manifest-response'"

**Cause**: The Next.js projection's generated routes import `manifestSuccessResponse` /
`manifestErrorResponse` / `normalizeCommandResult` from this module. It is emitted for
you as a **companion module**, so this error means it wasn't written — either you
generated with `emitCompanions: false`, or with a build predating the companions surface.

**Solution**:
Regenerate with companions enabled. `emitCompanions` defaults to `true`, so a plain
`manifest generate` (or `manifest build`) now writes the module to the path in
`responseImportPath` (default `@/lib/manifest-response`) alongside the runtime factory,
database client, and auth stub — no hand-written files required:

```bash
manifest generate ir/app.ir.json --projection nextjs --surface companions --output app/api/
```

Only hand-write the module if you have deliberately set `emitCompanions: false` to keep
your own implementation. In that case create `src/lib/manifest-response.ts` exporting
`manifestSuccessResponse(data, status)` and `manifestErrorResponse(message, status)`.

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
import { compileToIR } from '@angriff36/manifest/ir-compiler';
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

  if (result.diagnostics.some((d) => d.severity === 'error')) {
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
import { PostgresStore } from '@angriff36/manifest/stores';

const store = new PostgresStore({
  connectionString: process.env.DATABASE_URL,
  tableName: 'todos',
});
```

The URL establishes the connection; it does not associate this store with an
entity. Bind the store through `storeProvider` or `manifest.config.ts`.

---

## Getting Help

Still stuck?

1. **Check the FAQ**: `docs/getting-started/faq.md`
2. **Review semantics**: `docs/spec/semantics.md`
3. **Check examples**: `src/manifest/examples.ts`
4. **Review conformance fixtures**: `src/manifest/conformance/fixtures/`
5. **Open an issue**: Include manifest source, IR, and diagnostics

---

## Debugging Tips

### Enable profiling

```typescript
const runtime = new RuntimeEngine(ir, { actorId: 'user-123' }, { profiling: { enabled: true } });
```

### Dump IR for inspection

```bash
pnpm exec manifest compile program.manifest -o ir.json
```

### Trace guard evaluation

```typescript
// Check guard failure details from CommandResult
const result = await runtime.runCommand('update', input, { entityName: 'Task' });

if (!result.success && result.guardFailure) {
  console.log('Guard failed:', {
    guardIndex: result.guardFailure.index,
    expression: result.guardFailure.formatted,
    resolved: result.guardFailure.resolved,
  });
}
```

**Note**: The runtime does NOT emit events like `runtime.on('guardFailed')`. All diagnostic information is returned in the `CommandResult` object.

### Inspect runtime state

```typescript
console.log('Entities:', runtime.getEntities());
console.log('Context:', runtime.getContext());
// Per-entity store: runtime.getStore('Task')
```
