# Manifest API Reference

Authority: Advisory
Enforced by: None
Last updated: 2026-06-09

Complete API reference for the Manifest runtime and compiler.

---

## Core Exports

### `compileToIR(source: string, options?): Promise<CompileToIRResult>`

Compiles Manifest source code to IR.

```typescript
import { compileToIR } from '@angriff36/manifest/ir-compiler';

const { ir, diagnostics } = await compileToIR(`
  entity Todo {
    property id: string
    property title: string
  }
`);

if (diagnostics.some((d) => d.severity === 'error')) {
  console.error('Errors:', diagnostics);
  process.exit(1);
}

console.log('IR:', ir);
```

**Parameters:**

- `source`: Manifest source code
- `options.useCache` (optional): Enable in-memory IR compilation cache

**Returns:**

```typescript
interface CompileToIRResult {
  ir: IR | null; // Compiled IR if successful
  diagnostics: IRDiagnostic[]; // Compilation errors/warnings
}
```

---

### `class RuntimeEngine`

Executes IR and manages runtime state.

#### Constructor

```typescript
constructor(
  ir: IR,
  context?: RuntimeContext,
  options?: RuntimeOptions
)
```

**Parameters:**

- `ir`: Compiled IR from `compileToIR()`
- `context.actorId`: Acting user identifier (prefer over legacy `userId` keys)
- `context.tenantId`: Tenant identifier for multi-tenancy
- `context.user`: User object for policy/guard bindings (`user.id`, `user.role`, etc.)
- `options.storeProvider`: Custom store factory (optional)
- `options.middleware`: Middleware pipeline (optional)
- `options.profiling`: Enable execution profiling (optional)

#### `runCommand(commandName: string, input: Record<string, unknown>, options?): Promise<CommandResult>`

Executes a command. Entity-scoped commands require `options.entityName` (and usually `options.instanceId`).

```typescript
const result = await runtime.runCommand(
  'create',
  {
    title: 'Learn Manifest',
  },
  { entityName: 'Todo' },
);

if (result.success) {
  console.log('Created:', result.result);
  console.log('Events:', result.emittedEvents);
} else {
  if (result.guardFailure) {
    console.error('Guard failed:', result.guardFailure.formatted);
  } else if (result.policyDenial) {
    console.error('Policy denied:', result.policyDenial.policyName);
  } else {
    console.error('Error:', result.error);
  }
}
```

**Returns:**

```typescript
interface CommandResult {
  success: boolean; // True if command succeeded
  result?: unknown; // Command result value
  error?: string; // Error message (if failed)
  guardFailure?: GuardFailure; // Guard failure details (if guard failed)
  policyDenial?: PolicyDenial; // Policy denial details (if policy denied)
  constraintOutcomes?: ConstraintOutcome[]; // Constraint evaluation results
  emittedEvents: EmittedEvent[]; // Events emitted during execution
}

interface GuardFailure {
  index: number; // 1-based guard index
  expression: IRExpression; // Guard expression AST
  formatted: string; // Human-readable expression
  resolved?: Array<{
    // Resolved values for debugging
    expression: string;
    value: unknown;
  }>;
}

interface PolicyDenial {
  policyName: string; // Name of denying policy
  expression: IRExpression; // Policy expression AST
  formatted: string; // Human-readable expression
  message?: string; // Optional policy message
  resolved?: Array<{
    // Resolved values for debugging
    expression: string;
    value: unknown;
  }>;
}
```

**For API responses**, map `CommandResult` fields to your HTTP response in application code. Next.js projections generate `manifestSuccessResponse` / `manifestErrorResponse` helpers.

#### `onEvent(listener: (event: EmittedEvent) => void): () => void`

Registers a global event listener. Returns an unsubscribe function.

```typescript
const unsubscribe = runtime.onEvent((event) => {
  if (event.name === 'TodoCompleted') {
    console.log('Todo completed:', event.payload);
  }
});
```

#### `subscribe(entityName: string, listener: (event: EmittedEvent) => void): () => void`

Registers an entity-scoped event listener. Returns an unsubscribe function.

---

## Types

### `IR`

Intermediate Representation - compiled Manifest program.

```typescript
interface IR {
  version: '1.0';
  provenance: IRProvenance; // contentHash, irHash, compilerVersion, etc.
  tenant?: IRTenant;
  modules: IRModule[];
  values: IRValueObject[];
  entities: IREntity[];
  enums: IREnum[];
  stores: IRStore[];
  events: IREvent[];
  commands: IRCommand[];
  policies: IRPolicy[];
  reactions?: IRReactionRule[];
  sagas?: IRSaga[];
  roles?: IRRole[];
  webhooks?: IRWebhook[];
}
```

### `Entity`

Entity definition from IR.

```typescript
interface Entity {
  name: string; // Entity name
  properties: Property[]; // Entity properties
  commands?: Command[]; // Entity commands
  policies?: Policy[]; // Authorization policies
  constraints?: Constraint[]; // Entity-level constraints
  computed?: ComputedProperty[]; // Computed properties
  relationships?: Relationship[]; // Entity relationships
  metadata?: Record<string, unknown>; // Custom metadata
}
```

### `Property`

Entity property definition.

```typescript
interface Property {
  name: string; // Property name
  type: PropertyType; // Property type
  optional?: boolean; // Is optional
  default?: unknown; // Default value
  constraints?: Constraint[]; // Property-level constraints
}
```

**Property Types:**

- `string`
- `number`
- `boolean`
- `timestamp`
- `date`
- `uuid`
- `array<T>`
- `record<string, T>`

### `Command`

Command definition.

```typescript
interface Command {
  name: string; // Command name
  parameters?: Parameter[]; // Command parameters
  guards?: Guard[]; // Guard expressions
  mutations?: Mutation[]; // State mutations
  actions?: Action[]; // Side effects
  emits?: EventEmit[]; // Event emissions
  constraints?: Constraint[]; // Command-level constraints
  metadata?: Record<string, unknown>;
}
```

### `Policy`

Authorization policy.

```typescript
interface IRPolicy {
  name: string;
  action: 'read' | 'execute' | 'all';
  expression: IRExpression;
  entity?: string;
  module?: string;
  message?: string;
}
```

### `Guard`

Guard expression.

```typescript
// Guards in IR are IRExpression values on IRCommand.guards
interface IRCommand {
  name: string;
  guards?: IRExpression[];
  // ...
}
```

### `Constraint`

Validation constraint.

```typescript
interface Constraint {
  name: string; // Constraint name
  expression: string; // Constraint expression
  severity: 'ok' | 'warn' | 'block'; // Severity level
  message?: string; // Error message
}
```

### `Action`

Side effect action.

```typescript
interface Action {
  kind: 'persist' | 'publish' | 'effect'; // Action kind
  expression: string; // Action expression
  options?: Record<string, unknown>;
}
```

### `EventEmit`

Event emission definition.

```typescript
interface EventEmit {
  name: string; // Event name
  channel?: string; // Event channel (default: 'default')
  payload: Record<string, string>; // Payload mapping
}
```

### `EmittedEvent`

Event emitted during command execution.

```typescript
interface EmittedEvent {
  name: string; // Event name
  channel: string; // Event channel
  payload: Record<string, unknown>; // Event payload
  timestamp: number; // Milliseconds since epoch
  emitIndex: number; // Deterministic emission order index
}
```

### `IRDiagnostic`

Error or warning diagnostic from compilation.

```typescript
interface IRDiagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  line?: number;
  column?: number;
}
```

---

## Store Interface

### `interface Store<T>`

Custom storage adapter interface.

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

### Built-in stores

`MemoryStore` and `LocalStorageStore` are internal to the runtime. Use the default in-memory stores, or provide a custom `Store` via `storeProvider` in `RuntimeOptions`.

Node.js durable stores are exported from `@angriff36/manifest/stores`:

```typescript
import { PostgresStore, SupabaseStore } from '@angriff36/manifest/stores';

const store = new PostgresStore({
  connectionString: process.env.DATABASE_URL,
  tableName: 'todos',
});
```

Creating the adapter does not bind it to an entity. Return it from
`RuntimeOptions.storeProvider`, or place it under the entity name in
`manifest.config.ts` and configure `runtimeConfigImport`. `DATABASE_URL` alone
is not runtime storage configuration. See the
[complete example](../spec/config/manifest.config.md#complete-postgresql-runtime-companion-example).

---

## Projection Interface

### `ProjectionTarget`

Projection targets generate platform-specific code from IR. See `src/manifest/projections/interface.ts`.

```typescript
interface ProjectionTarget {
  readonly name: string;
  readonly description: string;
  readonly surfaces: ProjectionSurface[];
  generate(ir: IR, request: ProjectionRequest): ProjectionResult;
}
```

Built-in projections are registered in `@angriff36/manifest/projections`. Use the CLI to generate code:

```bash
pnpm exec manifest generate ir/ -p nextjs -s route -o generated/
```

---

## Built-in Functions

### Required Context Bindings

Per `docs/spec/builtins.md`, a conforming runtime MUST provide:

- `self` - Current entity instance, or `null` when no instance is bound
- `this` - Alias of `self`
- `user` - Current user object, or `null` when unauthenticated
- `context` - Runtime context object (empty object if none)

### Required Standard Library

Per `docs/spec/builtins.md`:

- `now(): number` - Returns current time (milliseconds since epoch)
- `uuid(): string` - Returns a globally unique identifier

### Property Access

Member access (`.`) is supported for accessing object properties:

- `self.title` - Entity property
- `user.id` - User property
- `items.length` - Array length (works via JavaScript member access)

### Operators

Per `docs/spec/semantics.md`:

**Binary**: `+`, `-`, `*`, `/`, `%`, `==`, `!=`, `<`, `>`, `<=`, `>=`, `and`, `or`, `in`, `contains`
**Unary**: `!`, `not`, `-`

**Note**: `==` and `is` use loose equality (JavaScript `==` semantics).
**Note**: `in` checks membership in array or substring in string.
**Note**: `contains` checks membership where left side is array or string.

See: `docs/spec/builtins.md` for complete list.

---

## Version Info

Compiler and schema version strings are embedded in IR `provenance` after compilation. Import from internal modules if needed for tooling:

```typescript
// Not exported from the main package entry — read from compiled IR instead:
// ir.provenance.compilerVersion
// ir.provenance.schemaVersion
```
