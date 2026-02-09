# External Projections Pattern

## The Boundary

Manifest defines language semantics. Projections generate platform code.

**Runtime responsibilities:**
- Execute commands with guards (in order, short-circuit on first failure)
- Check policies scoped to `execute` or `all`
- Emit events
- Return deterministic results

**Projection responsibilities:**
- Read IR and emit platform-specific code
- Choose storage strategy (direct DB, adapters, runtime)
- Handle platform concerns (auth, middleware, response format)

## Read vs. Write Strategy

### Reads (GET operations)

**Projections MAY generate direct reads.**

This is an **application choice**, not a language rule. The current Manifest runtime does not define read semantics (no `runtime.query()` or `runtime.get()` exists).

```typescript
// ✅ Valid - projection chooses direct DB access
const recipes = await database.recipe.findMany({
  where: { tenantId, deletedAt: null }
});

// ✅ Also valid - projection could use an adapter
const recipes = await storage.findMany('Recipe', {
  tenantId,
  deletedAt: null
});

// ❌ Not currently valid - runtime.query() doesn't exist
const recipes = await runtime.query('Recipe', { /* ... */ });
```

### Writes (POST/PUT/DELETE)

**Projections MUST use runtime.executeCommand().**

Mutations require runtime semantics:
- Guard evaluation (ordered, short-circuit)
- Constraint validation
- Policy checks (execute or all)
- Event emission

```typescript
// ✅ Valid - runtime enforces semantics
const result = await runtime.executeCommand("Recipe", "create", {
  name: "Pasta Carbonara",
  category: "Italian"
});

// ❌ Invalid - bypasses guards, policies, events
await database.recipe.create({ data: { /* ... */ } });
```

## If You Want Runtime Read APIs

Adding a runtime-level `query()` or `get()` method would be **defining new execution semantics**. This requires:

1. **Spec Update**: Document read execution order in `docs/spec/semantics.md`
2. **Policy Design**: Define how `read`-scoped policies are enforced (or not)
3. **Conformance Tests**: Add tests in `src/manifest/conformance/`
4. **Runtime Implementation**: Build the query API
5. **Test Updates**: Update all 437+ tests

**Don't add read APIs without this process.** The projection system exists because many applications don't need read policies—tenant isolation at the DB level is sufficient for them.

If your application needs runtime-level read enforcement, that's a language feature request, not a projection concern.

## Adapter Boundary (If Needed)

If projections need shared read logic, extend `docs/spec/adapters.md`:

```typescript
interface StorageAdapter<T> {
  // Projections can optionally use these
  findMany(entity: string, filter?: Filter): Promise<T[]>;
  findOne(entity: string, id: string): Promise<T | null>;

  // Runtime uses these (mutations only)
  create(entity: string, data: Partial<T>): Promise<T>;
  update(entity: string, id: string, data: Partial<T>): Promise<T>;
}
```

This keeps reads at the **adapter boundary** (tooling), not the **runtime core** (semantics).

## Reference Implementation

See `src/manifest/projections/nextjs/` for a working example:

- `generator.ts` - Configurable Next.js route generator
- `generator.test.ts` - Smoke tests verifying the contract
- `README.md` - Usage documentation

### The Contract

The Next.js projection tests verify:

```typescript
// ✅ Must use Prisma directly for reads
expect(code).toContain('database.recipe.findMany');
expect(code).not.toContain('runtime.query');
expect(code).not.toContain('runtime.get');

// ✅ Must filter by tenant (when enabled)
expect(code).toContain('tenantId');
expect(code).toContain('deletedAt: null');
```

## Decision Tree

```
Need to generate platform code?
├─ Yes → Use Projection
│   ├─ Need read-only GET?
│   │   ├─ Yes → Choose: direct DB, adapter, or request runtime read API
│   │   └─ No → Use runtime.executeCommand()
│   └─ Need auth/platform logic?
│       └─ Configure projection options (authProvider, etc.)
└─ No → Need new language feature?
    └─ Update spec → Add conformance tests → Implement runtime
```

## Common Pitfalls

### 1. "Let me add runtime.query() for convenience"

**Wrong.** This is a semantics change. Read APIs don't exist in Manifest. Adding them requires:
- Spec update
- Conformance tests
- Policy evaluation order for reads
- 437+ test updates

Use direct DB queries in projections instead.

### 2. "But I want shared read logic between projections"

**Use adapters.** Define `StorageAdapter` in `docs/spec/adapters.md` and implement it once. Projections can use it, but it's still tooling—not runtime semantics.

### 3. "I'll just inline the Prisma client"

**Consider your consumers.** The Next.js projection is configurable for a reason:
- Some projects use Clerk, others NextAuth, others custom
- Different database schemas
- Different tenant property names

Make your projection configurable via options, not hardcoded assumptions.

### 4. "The projection should enforce business logic"

**No.** Business logic belongs in Manifest commands and guards. Projections generate code based on IR, not new behavior.

If you find yourself adding business logic to a projection, you're either:
- Defining a new language feature (update spec first)
- Working around a missing runtime feature (implement it properly)
- Building app-specific logic (keep it out of Manifest core)

## Summary

| Concern | Where It Belongs |
|---------|------------------|
| Command execution | Runtime (semantics) |
| Guard evaluation | Runtime (semantics) |
| Policy enforcement | Runtime (semantics, execute/all only) |
| Read operations | Projections (direct DB, adapters, or future runtime API) |
| Auth handling | Projections (configurable) |
| Response format | Projections (platform-specific) |
| Event emission | Runtime (semantics) |

**Projections are tooling. Runtime is semantics. Keep the boundary sharp.**

**Read behavior is an application choice today.** If you want reads governed by Manifest policy, that requires a runtime read API with spec + conformance updates.
