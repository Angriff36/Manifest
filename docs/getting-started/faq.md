# Manifest FAQ

Authority: Advisory
Enforced by: None
Last updated: 2026-07-15

Frequently asked questions about Manifest DSL, its architecture, and integration patterns.

---

## Core Concepts

### What is Manifest?

Manifest is a domain-specific language for defining business rules and workflows with declarative specifications. It's an **IR-first language**—the Intermediate Representation (IR) is the single source of truth for program semantics.

### Why IR-first?

IR-first prevents semantic drift:

- **IR is Authority**: The IR schema (`docs/spec/ir/ir-v1.schema.json`) is the executable contract
- **Generated Code is Derivative**: Any TypeScript, React components, or other code generated from IR is a _view_—not source of truth
- **Provenance is Mandatory**: IR includes `contentHash`, `irHash`, `compilerVersion`, `schemaVersion`, `compiledAt` for traceability
- **No Silent Drift**: Changes to IR schema or semantics MUST be reflected in spec, fixtures, and templates

### Who is Manifest for?

Primary consumers are **AI agents** that emit, validate, and reason about Manifest programs. Secondary consumers are developers who want:

- Declarative business rules that compile to full-stack implementations
- Deterministic execution (same IR + same context = same result)
- Guard-based authorization that cannot be bypassed
- Event-driven architectures with guaranteed ordering

### What makes Manifest different from ORMs like Prisma?

| Prisma                                        | Manifest                                              |
| --------------------------------------------- | ----------------------------------------------------- |
| Database schema + type-safe queries           | Business rules + execution semantics                  |
| Queries are imperative (`findMany`, `update`) | Commands are declarative (`command create() { ... }`) |
| No built-in authorization                     | Guards and policies are first-class                   |
| No event system                               | Events are first-class with ordering guarantees       |
| Generated code is source                      | IR is source; generated code is derivative            |

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

**Critical**: All tests must pass (`pnpm test`). No exceptions.

---

## Integration

### How do I integrate Manifest into my app?

Two integration patterns:

1. **Projections**: Generate platform code (Next.js routes, Express controllers) from IR
2. **Embedded Runtime**: Hand-written app code that calls `RuntimeEngine.runCommand` directly

See: `docs/guides/usage-patterns.md` and `docs/guides/embedded-runtime.md`

### Should I use projections or embedded runtime?

| Use Projections when                             | Use Embedded Runtime when                     |
| ------------------------------------------------ | --------------------------------------------- |
| You want generated route/controller code         | You need custom orchestration around commands |
| Your mutation flow is standard runtime execution | You need custom event handling pipelines      |
| You want convention-over-configuration           | You need framework-specific behavior          |

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

See: `docs/guides/implementing-custom-stores.md`

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

~~Fixed order (defined in `docs/spec/semantics.md`):
1. Build evaluation context → 2. Policy check → 3. Command-level constraints →
4. Guard evaluation → 5. Action execution → 6. Event emission → 7. Return~~

> **Correction (2026-07-15) @RYANSIGNED:** Normative order in `docs/spec/semantics.md` § Commands:
>
> 1. **Build evaluation context** (`self`/`this`, params with defaults, runtime context)
> 2. **Command `rateLimit` gate** (if declared; denial → `rateLimitDenial`)
> 3. **Policy check** (`execute` / `all`; policy-level `rateLimit` before each expression)
> 4. **Command-level constraints** (severity: `block`, `warn`, `ok`)
> 5. **Guard evaluation** (in order, short-circuit on first falsey)
> 6. **Action execution** (`mutate`, `compute`, `persist`, etc.)
> 7. **Event emission** (in declaration order)
> 8. **Return** `CommandResult`
>
> Policies are **not** declared inside command bodies; they are top-level `policy`
> decls referenced by name on the command / entity `defaultPolicies`.

### What happens if a guard fails?

Execution halts immediately. No auto-repair, no fallback, no permissive defaults.

The runtime returns a failure diagnostic that includes:

- Failing guard index
- Guard expression
- Resolved values at failure time

### What is the difference between `read`, `execute`, and `all` policy scopes?

- **`read`**: Enforced at the runtime read gate (`getInstance`/`getAllInstances`), fail-closed. Reads that bypass the engine (e.g. direct-DB projection routes) are not gated.
- **`execute`**: Enforced during command execution
- **`all`**: Enforced during command execution AND at the read gate

See: `docs/spec/semantics.md` → Authorization

### What are constraint severity levels?

- **`block`**: Must pass for command to proceed (default)
- **`warn`**: May fail; outcome recorded but execution continues
- **`ok`**: Informational only; never blocks

Non-blocking constraints are recorded in the result under `constraintOutcomes`.

### Are read operations (GET) validated?

Reads that go through the engine are gated: per `docs/spec/semantics.md` § Policies, `read` (and `all`) policies are enforced at a central read gate in `getInstance`/`getAllInstances` (denied reads fail closed — `undefined` / row omitted).

Reads that bypass the engine (e.g. generated direct-DB projection routes) are not gated by the runtime. Mutations require runtime command execution.

See: `docs/guides/usage-patterns.md` → Read vs. Write Strategy

---

## Projections

### What is a projection?

A projection is **tooling, not semantics**. It generates platform-specific code (routes, controllers, SDKs) from IR.

Projections MUST remain aligned with IR/runtime semantics and MUST NOT redefine language meaning.

### What projections are available?

~~Built-in: `nextjs` (App Router API routes with Prisma). Planned: `hono`, `express`.~~

> **Correction (2026-07-15) @RYANSIGNED:** 29 registered projections in
> `registerBuiltinProjections()` (`src/manifest/projections/builtins.ts`), including
> `nextjs`, `prisma`, `convex`, `express`, `hono`, `drizzle`, `openapi`, `zod`,
> `graphql`, `react-query`, `jsonschema`, `remix`, `sveltekit`, and others.
> See `docs/CONFIRMED-FEATURES.md` §5 and `docs/projections/README.md`.
>
> **Correction (2026-07-22):** count is now **30** (`mongoose` registered).

### Do projections bypass the runtime?

For reads (GET): **Yes, and this is correct**. Reads MAY bypass runtime entirely and query storage directly.

For writes (POST/PUT/DELETE): **No**. Mutations MUST use `runtime.runCommand()` to enforce guards, policies, constraints, and events.

See: `docs/guides/usage-patterns.md`

### Can I add a runtime `query()` or `get()` method for reads?

~~**Don't.** If you want runtime-level read APIs, you are defining new execution
semantics… Unless you need language-level read policies, use adapters or go
direct to storage.~~

> **Correction (2026-07-15) @RYANSIGNED:** The reference runtime already exposes
> gated reads: `getInstance` / `getAllInstances` enforce `read` / `all` policies
> (`docs/spec/semantics.md` § Policies). Do not invent a parallel `query()`/`get()`
> API. Projection GET routes that hit the DB directly still bypass the engine —
> that is intentional for those surfaces, not a missing language feature.

---

## Testing

### How many tests are there?

Run `pnpm test` to see the current count. The suite includes conformance tests (executable semantics), unit tests (lexer, parser, compiler, runtime), projection tests, and CLI tests.

### What is the test command?

```bash
pnpm test              # Run all tests (must always pass)
pnpm run typecheck     # TypeScript check
pnpm run lint          # ESLint validation
pnpm run dev           # Development server
pnpm run conformance:regen  # Regenerate expected outputs
```

### How do I regenerate conformance fixtures?

```bash
pnpm run conformance:regen
```

**Warning**: Only do this when you are intentionally changing language semantics.

---

## Versioning

### What is the current version?

~~v2.3.0 (see root `package.json`)~~

> **Correction (2026-07-15) @RYANSIGNED:** Root `package.json` / published npm
> SoT is **`@angriff36/manifest` v3.6.41**. `engines.node` is `>=20`. Pin exact
> versions (see `docs/spec/sdk-stability.md`).

### What are vNext features?

Language/runtime features specified in `docs/spec/manifest-vnext.md`
(constraint severity/outcomes, overrides, command constraints, concurrency,
state transitions, workflow metadata, idempotency, deterministicMode, etc.).
**Implemented** — completion SoT: `docs/internal/COMPLIANCE_MATRIX.md` §1.
~~Remaining open: canonical-routes conformance fixtures (PARTIAL), diagnostics
completeness tests (PARTIAL), evaluation step-count counters (NOT_IMPLEMENTED).~~
**Update (2026-07-15):** Those three remainder items closed.

~~Implemented in IR and runtime, ready for adoption:~~
~~- Constraint severity and outcomes~~
~~- Command-level constraints~~
~~- Entity concurrency controls~~
~~- Policy-based authorization (read/execute/all)~~
~~- IR caching for compilation performance~~

> **Correction (2026-07-15):** Prefer the matrix over this bullet list. See also
> `docs/guides/migration/vnext.md`. Historical notes:
> `docs/guides/migration/v0.3.8.md`.

See: `docs/spec/manifest-vnext.md` and `docs/guides/migration/vnext.md`.

### How do I migrate to vNext?

See: `docs/guides/migration/v0.3.8.md` (historical v0.3.8 notes) and
`docs/guides/migration/vnext.md`.

---

## Common Gotchas

### Why does my test say "guard failed but no diagnostic"?

Check that you are inspecting the correct fields on `CommandResult`. The runtime returns guard failure details in `result.guardFailure`, not `result.diagnostics` (which doesn't exist on `CommandResult`).

```typescript
if (!result.success && result.guardFailure) {
  console.error('Guard failed:', {
    index: result.guardFailure.index,
    expression: result.guardFailure.formatted,
    resolved: result.guardFailure.resolved,
  });
}
```

### Why is my constraint not blocking?

Check the severity level. Only `block` severity stops execution. Use `severity: warn` for non-blocking validation.

### Why are my `read` policies not being enforced?

~~This is correct behavior. `read` policies are NOT enforced by default. Use
`execute` or `all` for policies that must be enforced during command execution.~~

> **Correction (2026-07-15) @RYANSIGNED:** `read` / `all` policies **are** enforced
> at the runtime read gate (`getInstance` / `getAllInstances`), fail-closed.
> They are **not** applied during command execution (use `execute` / `all` for
> that). If reads go through a generated direct-DB projection route, the engine
> gate never runs — switch to engine reads or enforce auth in the app layer.

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
4. Keep `pnpm test`, `pnpm run typecheck`, and `pnpm run lint` green

See: `docs/internal/DOCUMENTATION_GOVERNANCE.md`

### What are the house style rules?

From `house-style.md`:

1. **Determinism over convenience**: Identical IR + identical runtime context must produce identical results
2. **Explicitness over inference**: Guards MUST reference spec-guaranteed bindings
3. **Strict guard semantics**: Guards evaluated in order, halts on first falsey
4. **Diagnostics explain, never compensate**: Failures must surface failing info; diagnostics MUST NOT alter behavior
5. **IR is immutable at runtime**: All variability enters through runtime context

### What is the definition of "done"?

A change is only done when:

- `pnpm test` is green
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
- **Patterns**: `docs/guides/`
- **Governance**: `docs/internal/DOCUMENTATION_GOVERNANCE.md`
- **Repo Rules**: `docs/internal/REPO_GUARDRAILS.md`
