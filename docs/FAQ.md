# Manifest FAQ

Authority: Advisory
Enforced by: None
Last updated: 2026-02-12

Frequently asked questions about Manifest DSL, its architecture, and integration patterns.

---

## Core Concepts

### What is Manifest?

Manifest is a domain-specific language for defining business rules and workflows with declarative specifications. It's an **IR-first language**—the Intermediate Representation (IR) is the single source of truth for program semantics.

### Why IR-first?

IR-first prevents semantic drift:

- **IR is Authority**: The IR schema (`docs/spec/ir/ir-v1.schema.json`) is the executable contract
- **Generated Code is Derivative**: Any TypeScript, React components, or other code generated from IR is a *view*—not source of truth
- **Provenance is Mandatory**: IR includes `contentHash`, `irHash`, `compilerVersion`, `schemaVersion`, `compiledAt` for traceability
- **No Silent Drift**: Changes to IR schema or semantics MUST be reflected in spec, fixtures, and templates

### Who is Manifest for?

Primary consumers are **AI agents** that emit, validate, and reason about Manifest programs. Secondary consumers are developers who want:
- Declarative business rules that compile to full-stack implementations
- Deterministic execution (same IR + same context = same result)
- Guard-based authorization that cannot be bypassed
- Event-driven architectures with guaranteed ordering

### What makes Manifest different from ORMs like Prisma?

| Prisma | Manifest |
|--------|----------|
| Database schema + type-safe queries | Business rules + execution semantics |
| Queries are imperative (`findMany`, `update`) | Commands are declarative (`create Recipe { ... }`) |
| No built-in authorization | Guards and policies are first-class |
| No event system | Events are first-class with ordering guarantees |
| Generated code is source | IR is source; generated code is derivative |

---

## Architecture

### What is the compilation pipeline?

```
.manifest source → Lexer → Parser → AST → IR Compiler → IR
                                                      ↓
                                                Runtime Engine
```

1. **Lexer**: Tokenizes source (e.g., `entity`, `command`, `property`)
2. **Parser**: Builds Abstract Syntax Tree (AST) from tokens
3. **IR Compiler**: Transforms AST into IR (JSON contract)
4. **Runtime Engine**: Executes IR deterministically

### What is the difference between `docs/spec/` and `specs/`?

- **`docs/spec/`**: Binding language specification. What the language **means**. Enforced by conformance tests.
- **`specs/`**: Ideas, proposals, and design notes. Not binding. Drafts for future features.

### What are conformance tests?

Conformance tests are **executable semantics**, not coverage tests. They prove that compiler and runtime behavior match the specification. If you change language meaning, you MUST update conformance fixtures.

Location: `src/manifest/conformance/`

**Critical**: 467/467 tests must pass. No exceptions.

---

## Integration

### How do I integrate Manifest into my app?

Two integration patterns:

1. **Projections**: Generate platform code (Next.js routes, Express controllers) from IR
2. **Embedded Runtime**: Hand-written app code that calls `RuntimeEngine.runCommand` directly

See: `docs/patterns/external-projections.md` and `docs/patterns/embedded-runtime-pattern.md`

### Should I use projections or embedded runtime?

| Use Projections when | Use Embedded Runtime when |
|---------------------|--------------------------|
| You want generated route/controller code | You need custom orchestration around commands |
| Your mutation flow is standard runtime execution | You need custom event handling pipelines |
| You want convention-over-configuration | You need framework-specific behavior |

### Can I use Manifest with existing databases?

Yes. Manifest supports custom storage adapters via the `Store` interface:

```typescript
interface Store<T extends EntityInstance = EntityInstance> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | undefined>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T | undefined>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<void>;
}
```

Provide your store via the `storeProvider` option in `RuntimeOptions`.

See: `docs/patterns/implementing-custom-stores.md`

### What storage targets are supported?

- **MUST support**: `memory`
- **MAY support**: `localStorage`, `postgres`, `supabase`, custom stores

Unsupported targets MUST emit diagnostics. No silent fallback (unless explicitly configured).

### Does Manifest handle authentication?

No. Manifest handles **authorization** (policies, guards), not authentication.

Authentication is handled by your application layer (Clerk, Auth0, NextAuth, etc.). You derive identity from auth context and inject authoritative values (e.g., `userId`, `tenantId`) before command execution.

**Important**: Never trust `id`, `userId`, `tenantId` from `request.json()`. Derive from auth context.

---

## Semantics

### What is the execution order for commands?

Fixed order (defined in `docs/spec/semantics.md`):

1. **Policy check** (scoped to `execute` or `all`)
2. **Guard evaluation** (in order, short-circuit on first `falsey`)
3. **Constraint validation** (severity: `block`, `warn`, `ok`)
4. **Action execution** (`persist`, `publish`, `effect`)
5. **Event emission** (in declaration order)
6. **Return** result

### What happens if a guard fails?

Execution halts immediately. No auto-repair, no fallback, no permissive defaults.

The runtime returns a failure diagnostic that includes:
- Failing guard index
- Guard expression
- Resolved values at failure time

### What is the difference between `read`, `execute`, and `all` policy scopes?

- **`read`**: NOT enforced by default (application-defined reads)
- **`execute`**: Enforced during command execution
- **`all`**: Enforced during all operations

See: `docs/spec/semantics.md` → Authorization

### What are constraint severity levels?

- **`block`**: Must pass for command to proceed (default)
- **`warn`**: May fail; outcome recorded but execution continues
- **`ok`**: Informational only; never blocks

Non-blocking constraints are recorded in the result under `nonBlockingViolations`.

### Are read operations (GET) validated?

No. Per `docs/spec/semantics.md`, policies scoped to `read` are NOT enforced by default.

Reads are application-defined and may use direct storage queries. Only mutations require runtime command execution.

See: `docs/patterns/external-projections.md` → Read vs. Write Strategy

---

## Projections

### What is a projection?

A projection is **tooling, not semantics**. It generates platform-specific code (routes, controllers, SDKs) from IR.

Projections MUST remain aligned with IR/runtime semantics and MUST NOT redefine language meaning.

### What projections are available?

Built-in: `nextjs` (App Router API routes with Prisma)

Planned: `hono`, `express`

### Do projections bypass the runtime?

For reads (GET): **Yes, and this is correct**. Reads MAY bypass runtime entirely and query storage directly.

For writes (POST/PUT/DELETE): **No**. Mutations MUST use `runtime.runCommand()` to enforce guards, policies, constraints, and events.

See: `docs/patterns/external-projections.md`

### Can I add a runtime `query()` or `get()` method for reads?

**Don't.** If you want runtime-level read APIs, you are defining new execution semantics. This requires:

1. Update `docs/spec/semantics.md` with read execution order
2. Define policy enforcement behavior for `read` scope
3. Write conformance tests in `src/manifest/conformance/`
4. Update all 467 tests

Unless you need language-level read policies, use adapters or go direct to storage.

---

## Testing

### How many tests are there?

467 tests total:
- 142 conformance tests (executable semantics)
- 285 unit tests (lexer, parser, compiler, runtime)
- 21 projection tests (Next.js smoke tests)
- 19 other tests

### What is the test command?

```bash
npm test              # Run all tests (must always pass)
npm run typecheck     # TypeScript check
npm run lint          # ESLint validation
npm run dev           # Development server
npm run conformance:regen  # Regenerate expected outputs
```

### How do I regenerate conformance fixtures?

```bash
npm run conformance:regen
```

**Warning**: Only do this when you are intentionally changing language semantics.

---

## Versioning

### What is the current version?

v0.3.8

### What are vNext features?

Implemented in IR and runtime, ready for adoption:
- Constraint severity and outcomes
- Command-level constraints
- Entity concurrency controls
- Policy-based authorization (read/execute/all)
- IR caching for compilation performance

See: `docs/spec/manifest-vnext.md` and `docs/migration/vnext-migration-guide.md`

### How do I migrate to vNext?

See: `docs/migration/vnext-migration-guide.md`

---

## Common Gotchas

### Why does my test say "guard failed but no diagnostic"?

Check that you are not silently catching errors. The runtime MUST emit diagnostics for guard failures.

### Why is my constraint not blocking?

Check the severity level. Only `block` severity stops execution. Use `severity: warn` for non-blocking validation.

### Why are my `read` policies not being enforced?

This is correct behavior. `read` policies are NOT enforced by default. Use `execute` or `all` for policies that must be enforced during command execution.

### Can I edit IR at runtime?

**No.** IR is immutable at runtime. All variability enters through runtime context, never by editing IR.

If you need dynamic behavior, use computed properties, context bindings, or runtime context.

### Why did my conformance test fail after a "small" change?

Conformance tests are executable semantics. If a test fails, you either:
1. Changed language meaning (update spec + fixtures)
2. Introduced a bug (fix implementation)

There is no third option.

---

## Contributing

### How do I propose a language change?

1. Update `docs/spec/**` first
2. Update conformance fixtures
3. Update implementation
4. Keep `npm test`, `npm run typecheck`, and `npm run lint` green

See: `docs/DOCUMENTATION_GOVERNANCE.md`

### What are the house style rules?

From `house-style.md`:

1. **Determinism over convenience**: Identical IR + identical runtime context must produce identical results
2. **Explicitness over inference**: Guards MUST reference spec-guaranteed bindings
3. **Strict guard semantics**: Guards evaluated in order, halts on first falsey
4. **Diagnostics explain, never compensate**: Failures must surface failing info; diagnostics MUST NOT alter behavior
5. **IR is immutable at runtime**: All variability enters through runtime context

### What is the definition of "done"?

A change is only done when:
- `npm test` is green (467/467 passing)
- `npm run typecheck` passes
- `npm run lint` passes
- Spec/test/impl are aligned (no undocumented nonconformance)
- UI changes have manual verification path

---

## Further Reading

- **Spec**: `docs/spec/README.md`
- **Semantics**: `docs/spec/semantics.md`
- **Adapters**: `docs/spec/adapters.md`
- **Conformance**: `docs/spec/conformance.md`
- **Patterns**: `docs/patterns/`
- **Governance**: `docs/DOCUMENTATION_GOVERNANCE.md`
- **Repo Rules**: `docs/REPO_GUARDRAILS.md`
