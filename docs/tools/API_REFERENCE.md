# Manifest API Reference

Authority: Advisory
Enforced by: None
Last updated: 2026-02-12

Complete API reference for the Manifest runtime and compiler.

---

## Core Exports

### `compileToIR(source: string): Promise<CompileResult>`

Compiles Manifest source code to IR.

```typescript
import { compileToIR } from '@manifest/runtime/ir-compiler';

const { ir, diagnostics } = await compileToIR(`
  entity Todo {
    property id: string
    property title: string
  }
`);

if (diagnostics.some(d => d.severity === 'error')) {
  console.error('Errors:', diagnostics);
  process.exit(1);
}

console.log('IR:', ir);
```

**Parameters:**
- `source`: Manifest source code

**Returns:**
```typescript
interface CompileResult {
  ir?: IR;                              // Compiled IR if successful
  diagnostics: Diagnostic[];            // Compilation errors/warnings
}
```

---

### `class RuntimeEngine`

Executes IR and manages runtime state.

#### Constructor

```typescript
constructor(
  ir: IR,
  context: RuntimeContext
)
```

**Parameters:**
- `ir`: Compiled IR from `compileToIR()`
- `context.userId`: User identifier for authorization
- `context.tenantId`: Tenant identifier for multi-tenancy
- `context.storeProvider`: Custom store factory (optional)
- `context.debug`: Enable debug logging (boolean, optional)

#### `runCommand(entityName: string, commandName: string, input: Record<string, unknown>): Promise<CommandResult>`

Executes a command on an entity.

```typescript
const result = await runtime.runCommand('Todo', 'create', {
  title: 'Learn Manifest'
});

if (result.success) {
  console.log('Created:', result.instance);
  console.log('Events:', result.events);
} else {
  console.error('Failed:', result.diagnostics);
}
```

**Returns:**
```typescript
interface CommandResult {
  success: boolean;                     // True if command succeeded
  instance?: EntityInstance;            // Created/updated instance (if successful)
  events?: Event[];                     // Emitted events
  diagnostics?: Diagnostic[];           // Error details (if failed)
  nonBlockingViolations?: ConstraintViolation[];  // Non-blocking constraint failures
}
```

#### `query(entityName: string, filter?: QueryFilter): Promise<EntityInstance[]>`

Queries entities from storage (if supported by store).

**Note**: Read operations are application-defined. This method may not be available in all runtimes. See `docs/patterns/external-projections.md` for read strategy.

#### `on(event: string, handler: (event: Event) => void): void`

Registers an event listener.

```typescript
runtime.on('TodoCompleted', (event) => {
  console.log('Todo completed:', event.payload.todoId);
});
```

#### `off(event: string, handler: (event: Event) => void): void`

Removes an event listener.

---

## Types

### `IR`

Intermediate Representation - compiled Manifest program.

```typescript
interface IR {
  version: string;                      // IR schema version
  contentHash: string;                  // Hash of source content
  irHash: string;                       // Hash of IR structure
  compilerVersion: string;              // Compiler version
  schemaVersion: string;                // Schema version
  compiledAt: string;                   // ISO timestamp
  entities: Entity[];                   // Entity definitions
  modules?: Module[];                   // Module definitions (optional)
}
```

### `Entity`

Entity definition from IR.

```typescript
interface Entity {
  name: string;                         // Entity name
  properties: Property[];               // Entity properties
  commands?: Command[];                 // Entity commands
  policies?: Policy[];                  // Authorization policies
  constraints?: Constraint[];           // Entity-level constraints
  computed?: ComputedProperty[];        // Computed properties
  relationships?: Relationship[];       // Entity relationships
  metadata?: Record<string, unknown>;   // Custom metadata
}
```

### `Property`

Entity property definition.

```typescript
interface Property {
  name: string;                         // Property name
  type: PropertyType;                   // Property type
  optional?: boolean;                   // Is optional
  default?: unknown;                    // Default value
  constraints?: Constraint[];           // Property-level constraints
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
  name: string;                         // Command name
  parameters?: Parameter[];             // Command parameters
  guards?: Guard[];                     // Guard expressions
  mutations?: Mutation[];               // State mutations
  actions?: Action[];                   // Side effects
  emits?: EventEmit[];                  // Event emissions
  constraints?: Constraint[];           // Command-level constraints
  metadata?: Record<string, unknown>;
}
```

### `Policy`

Authorization policy.

```typescript
interface Policy {
  name: string;                         // Policy name
  scope: 'read' | 'execute' | 'all';    // Policy scope
  effect: 'allow' | 'deny';             // Allow or deny
  condition: string;                    // Boolean expression
}
```

### `Guard`

Guard expression.

```typescript
interface Guard {
  expression: string;                   // Guard expression
  description?: string;                 // Human-readable description
}
```

### `Constraint`

Validation constraint.

```typescript
interface Constraint {
  name: string;                         // Constraint name
  expression: string;                   // Constraint expression
  severity: 'ok' | 'warn' | 'block';    // Severity level
  message?: string;                     // Error message
}
```

### `Action`

Side effect action.

```typescript
interface Action {
  kind: 'persist' | 'publish' | 'effect';  // Action kind
  expression: string;                   // Action expression
  options?: Record<string, unknown>;
}
```

### `EventEmit`

Event emission definition.

```typescript
interface EventEmit {
  name: string;                         // Event name
  channel?: string;                     // Event channel (default: 'default')
  payload: Record<string, string>;      // Payload mapping
}
```

### `Event`

Emitted event instance.

```typescript
interface Event {
  id: string;                           // Event ID
  name: string;                         // Event name
  channel: string;                      // Event channel
  payload: Record<string, unknown>;     // Event payload
  timestamp: string;                    // ISO timestamp
  metadata?: Record<string, unknown>;
}
```

### `Diagnostic`

Error or warning diagnostic.

```typescript
interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  code: string;                         // Error code
  message: string;                      // Human-readable message
  source?: {                            // Source location
    file?: string;
    line?: number;
    column?: number;
  };
  details?: Record<string, unknown>;
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

### `class MemoryStore<T>`

In-memory store implementation (default).

```typescript
import { MemoryStore } from '@manifest/runtime';

const store = new MemoryStore<Todo>();
```

### `class LocalStorageStore<T>`

Browser localStorage store.

```typescript
import { LocalStorageStore } from '@manifest/runtime';

const store = new LocalStorageStore<Todo>('todos');
```

### `class PostgresStore<T>`

PostgreSQL store (Node.js only).

```typescript
import { PostgresStore } from '@manifest/runtime/node';

const store = new PostgresStore<Todo>({
  connectionString: process.env.DATABASE_URL,
  tableName: 'todos'
});
```

### `class SupabaseStore<T>`

Supabase store (Node.js only).

```typescript
import { SupabaseStore } from '@manifest/runtime/node';

const store = new SupabaseStore<Todo>({
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_ANON_KEY,
  tableName: 'todos'
});
```

---

## Projection Interface

### `interface ProjectionTarget`

Projection target for platform-specific code generation.

```typescript
interface ProjectionTarget {
  readonly name: string;                // Target identifier (e.g., "nextjs")
  readonly description: string;         // Human-readable description

  generateRoute(
    ir: IR,
    entityName: string,
    options?: Record<string, unknown>
  ): string;

  generateTypes?(ir: IR): string;
  generateClient?(ir: IR): string;
}
```

### `registerProjection(projection: ProjectionTarget): void`

Register a projection target.

```typescript
import { registerProjection } from '@manifest/runtime';

registerProjection(new NextJsProjection());
```

### `getProjection(name: string): ProjectionTarget | undefined`

Get a registered projection.

### `listProjections(): ProjectionTarget[]`

List all registered projections.

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

### `COMPILER_VERSION`

Current Manifest compiler version.

```typescript
import { COMPILER_VERSION } from '@manifest/runtime';
console.log(COMPILER_VERSION); // "0.3.8"
```

### `SCHEMA_VERSION`

IR schema version.

```typescript
import { SCHEMA_VERSION } from '@manifest/runtime';
console.log(SCHEMA_VERSION); // "1.0"
```
