# Manifest Language Implementation

**Manifest** is a formal domain modeling language with a reference runtime implementation. It enables AI agents and developers to define business logic, data models, and behavioral constraints in a declarative, executable format.

## What Manifest Is

Manifest is a **language for expressing domain models** with:
- **Entities** with typed properties, computed values, and relationships
- **Commands** that mutate state, enforce guards, and emit events
- **Policies** for authorization and access control
- **Events** for outbox patterns and real-time communication
- **Stores** for persistence (memory, localStorage, and adapters for databases)

The language compiles to an **Intermediate Representation (IR)** that serves as the canonical contract between the compiler and runtime. The runtime executes commands deterministically, enforcing guards and policies in strict order.

## Key Capabilities

### ✅ Implemented

- **Full Language Parser & Compiler**: Parses Manifest source code and compiles to IR v1
- **Reference Runtime Engine**: Executes commands with policy checks, guard evaluation, and event emission
- **Conformance Test Suite**: 448 tests (58 lexer + 79 parser + 91 IR compiler + 56 runtime + 142 conformance + 21 projection + 1 integration) covering compilation, runtime semantics, and edge cases
- **Projections System**: Generate platform-specific code from IR with 4 Next.js surfaces (route, command, types, client)
- **Runtime UI**: Interactive development environment for testing Manifest programs
- **Event Logging**: Persistent event log with payload inspection
- **Project Export**: Generates runnable React/TypeScript projects from Manifest source
- **Computed Properties**: Derived values that auto-update based on dependencies
- **Guard Diagnostics**: Detailed failure reporting with resolved expression values
- **Policy Enforcement**: Authorization checks before command execution
- **vNext Features**: Constraint severity/outcomes, override authorization, workflow idempotency, entity concurrency controls

### Language Features

- **Entities**: Define data structures with properties, defaults, and modifiers (`required`, `unique`, `readonly`, etc.)
- **Commands**: Business operations with parameters, guards, actions (`mutate`, `emit`, `compute`), and event emissions
- **Guards**: Boolean expressions evaluated in order; execution halts on first failure
- **Policies**: Authorization rules scoped to entities and actions (`read`, `write`, `execute`, `all`)
- **Events**: Typed event definitions with channels and payload schemas
- **Stores**: Persistence targets (`memory`, `localStorage`, with adapters for `postgres`, `supabase`)
- **Modules**: Logical grouping of related entities, commands, and policies
- **Computed Properties**: Derived values with explicit dependency tracking
- **Relationships**: Declarative relationships (`hasMany`, `hasOne`, `belongsTo`, `ref`)

## Getting Started

**New to Manifest?** Start with the [Usage Patterns Guide](docs/guides/usage-patterns.md) to understand the two ways to integrate Manifest into your application:

1. **Projections** - Auto-generate API routes from `.manifest` files (best for simple CRUD)
2. **Embedded Runtime** - Use the runtime directly in your handlers (best for complex workflows)

Most applications use both patterns together.

## Projection System

The projection system generates platform-specific code from Manifest IR. Projections are **tooling**, not runtime semantics—they consume IR and emit artifacts like API routes, type definitions, and client SDKs.

### Next.js Projection

The Next.js projection includes 4 surfaces:

**1. `nextjs.route` - Entity-scoped GET Operations**
- Generates Next.js App Router API routes for entity reads
- Uses direct Prisma/database queries (bypasses runtime for performance)
- Configurable auth providers (Clerk, NextAuth, custom, none)
- Tenant isolation and soft-delete filtering
- Returns entity lists and single entity retrieval

**2. `nextjs.command` - Command-scoped POST/PUT/DELETE Operations**
- Generates Next.js API routes for command execution
- **MUST use `runtime.executeCommand()`** to enforce guards, policies, and events
- Supports all HTTP methods (POST, PUT, DELETE, PATCH)
- Validates command parameters and runtime context
- Returns command results with event emissions

**3. `ts.types` - TypeScript Type Definitions**
- Generates TypeScript interfaces from IR entity definitions
- Includes property types, required/optional modifiers
- Type-safe client/server code

**4. `ts.client` - Client SDK**
- Generates type-safe client functions for API calls
- Includes fetch wrappers with error handling
- TypeScript-first with full IntelliSense support

### Projection Design Principles

From `docs/patterns/external-projections.md`:

- **Reads MAY bypass runtime**: Entity routes use direct DB queries for performance (read policies not enforced by default)
- **Writes MUST use runtime**: Command routes enforce guards, policies, constraints, and event emission
- **Configurable auth**: Support multiple auth providers without hardcoding
- **Tenant isolation**: Optional tenant filtering for multi-tenant applications
- **Platform-specific**: Projections adapt to platform conventions (Next.js App Router, future: Hono, Express)

See `src/manifest/projections/nextjs/README.md` for detailed usage examples.

## Architecture

```
┌─────────────────┐
│ Manifest Source │ (.manifest files)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   IR Compiler    │ (lexer → parser → IR transformation)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   IR v1 JSON    │ (canonical contract)
└────────┬────────┘
         │
         ├─────────────────┬──────────────────┬────────────────┐
         ▼                 ▼                  ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Runtime    │  │  Export      │  │  Conformance│  │ Projections  │
│   Engine     │  │  Templates   │  │  Tests      │  │ (Next.js)    │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

### Core Components

- **`src/manifest/lexer.ts`**: Tokenizes Manifest source code
- **`src/manifest/parser.ts`**: Parses tokens into AST
- **`src/manifest/ir-compiler.ts`**: Transforms AST to IR v1
- **`src/manifest/runtime-engine.ts`**: Executes IR commands with full semantics
- **`src/manifest/projections/`**: Platform-specific code generators
  - **`nextjs/`**: Next.js App Router projection with 4 surfaces
    - `nextjs.route`: Entity-scoped GET operations (list, retrieve)
    - `nextjs.command`: Command-scoped POST/PUT/DELETE operations
    - `ts.types`: TypeScript type definitions from IR
    - `ts.client`: Client SDK generation
  - **`interface.ts`**: Projection contracts and options
  - **`registry.ts`**: Projection registration and lookup
- **`src/manifest/conformance/`**: Executable test fixtures (27 .manifest files, 63 expected outputs)
- **`src/artifacts/`**: Runtime UI components for development and testing
- **`src/project-template/templates.ts`**: Code generators for exported projects
- **`bin/generate-projection.ts`**: CLI tool for code generation
- **`docs/spec/`**: Language specification (IR schema, semantics, builtins, adapters)
- **`docs/patterns/external-projections.md`**: Critical documentation on the projection boundary

## Example Program

```manifest
entity PrepTask {
  property required id: string
  property required name: string
  property assignedTo: string?
  property status: string = "pending"
  property priority: number = 1

  computed isUrgent: boolean = priority >= 3

  command claim(employeeId: string) {
    guard self.status == "pending"
    guard user.role == "cook" or user.role == "chef"
    mutate assignedTo = employeeId
    mutate status = "in_progress"
    emit taskClaimed
  }

  command complete() {
    guard self.status == "in_progress"
    guard self.assignedTo == user.id
    mutate status = "completed"
    emit taskCompleted
  }

  policy canClaim execute: user.role in ["cook", "chef"]
}

store PrepTask in memory

event taskClaimed: "kitchen.task.claimed" {
  taskId: string
  employeeId: string
}

event taskCompleted: "kitchen.task.completed" {
  taskId: string
  completedBy: string
}
```

## For AI Agents: Critical Constraints

This repository enforces **strict semantic invariants**. Read `AGENTS.md` and `house-style.md` before making changes.

### Core Invariants

1. **Determinism**: Identical IR + identical runtime context = identical results
2. **Explicitness**: Guards MUST reference spec-guaranteed bindings (`self.*`, `this.*`, `user.*`, `context.*`)
3. **Strict Execution Order**: Policies → Guards → Actions → Emits (no shortcuts)
4. **IR Immutability**: IR is immutable at runtime; all variability via runtime context
5. **Spec-First Workflow**: Spec changes → Tests → Implementation (never reverse)

### Source of Truth (Priority Order)

1. `docs/spec/ir/ir-v1.schema.json` - IR shape is the contract
2. `docs/spec/semantics.md` - Runtime meaning
3. `docs/spec/builtins.md` - Built-in identifiers/functions
4. `docs/spec/adapters.md` - Adapter hooks
5. `src/manifest/conformance/*` - Executable evidence

### Non-Negotiables

- ❌ **Never edit IR output by hand** - IR is compiler output, always derived
- ❌ **Never weaken conformance** - If tests "feel too strict," the agent is wrong
- ❌ **Never fix UI by changing semantics** - UI adapts to language, not reverse
- ❌ **Never make invalid programs succeed** - That's a language violation, not UX improvement

### Required Workflow

For any change:

1. **Determine purpose**: Language change (meaning) or tooling change (projection)?
2. **Locate governing law**: Find exact spec sections and conformance fixtures
3. **Update in order**: Spec → Tests → Implementation (if meaning changes)
4. **Prove it**: `npm test` must pass; document any nonconformance

## Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
npm install
```

### Commands

- `npm test` - Run all 448 tests (must pass)
- `npm run test:watch` - Run tests in watch mode
- `npm run dev` - Start development server with Runtime UI
- `npm run conformance:regen` - Regenerate expected IR outputs from fixtures
- `npm run bench` - Run performance benchmarks
- `npm run build` - Build for production
- `npm run typecheck` - TypeScript type checking
- `npm run lint` - ESLint validation

### Projection CLI

Generate platform-specific code from Manifest IR (dev-only, uses tsx):

```bash
# Generate a Next.js entity route (GET operations)
npx tsx bin/generate-projection.ts nextjs nextjs.route recipe.manifest Recipe --output route.ts

# Generate a Next.js command route (POST/PUT/DELETE operations)
npx tsx bin/generate-projection.ts nextjs nextjs.command recipe.manifest Recipe create --output route.ts

# Generate TypeScript types
npx tsx bin/generate-projection.ts nextjs ts.types recipe.manifest --output types.ts

# Generate client SDK
npx tsx bin/generate-projection.ts nextjs ts.client recipe.manifest --output client.ts

# Configure auth provider
npx tsx bin/generate-projection.ts nextjs nextjs.route recipe.manifest Recipe --auth clerk --output route.ts

# List available projections
npx tsx bin/generate-projection.ts --list

# Show help
npx tsx bin/generate-projection.ts --help
```

**Note**: The CLI is a development tool using `tsx`. For production use, import the projection functions directly into your build scripts.

**Important**: Entity routes (nextjs.route) generate READ operations that bypass the runtime (direct DB queries). Command routes (nextjs.command) MUST use `runtime.executeCommand()` for mutations. See `docs/patterns/external-projections.md` for detailed rationale.

### Testing

The project includes 448 tests across 7 test suites:

**Conformance Suite** (`src/manifest/conformance/conformance.test.ts` - 142 tests):
- 27 fixture files (`.manifest` source files)
- 63 expected outputs (IR, diagnostics, runtime results)
- Validates IR compilation correctness
- Runtime command execution semantics
- Guard and policy evaluation
- Event emission
- Computed property evaluation
- Instance creation with defaults
- vNext features (constraints, overrides, workflows, concurrency)

**Unit Tests** (285 tests):
- Lexer tests (58): Tokenization and edge cases
- Parser tests (79): AST construction
- IR Compiler tests (91): IR generation and normalization
- Runtime tests (56): Command execution, guards, policies

**Projection Tests** (21 tests):
- Next.js projection smoke tests
- Verifies all 4 surfaces (route, command, types, client)
- Auth provider configurations
- Tenant and soft-delete filtering

All tests use deterministic time and ID generation for reproducibility.

## Project Structure

```
.
├── bin/                    # CLI tools
│   └── generate-projection.ts  # Projection code generator
├── docs/
│   ├── spec/              # Language specification
│   │   ├── ir/
│   │   │   └── ir-v1.schema.json  # IR schema (authoritative contract)
│   │   ├── semantics.md    # Runtime meaning and execution model
│   │   ├── builtins.md     # Built-in identifiers and functions
│   │   ├── adapters.md     # Adapter hooks and contracts
│   │   ├── conformance.md  # Test rules and fixture contracts
│   │   ├── manifest-vnext.md  # vNext features documentation
│   │   └── README.md       # Spec overview (IR-first principles)
│   ├── migration/
│   │   └── vnext-migration-guide.md  # vNext migration guide
│   ├── patterns/
│   │   └── external-projections.md  # Projection boundary documentation
│   └── tools/             # Tool documentation and usage guides
├── src/
│   ├── manifest/          # Core language implementation
│   │   ├── lexer.ts        # Tokenizer
│   │   ├── parser.ts       # AST parser
│   │   ├── ir-compiler.ts  # IR transformation
│   │   ├── runtime-engine.ts # Command execution engine
│   │   ├── compiler.ts     # Main compiler orchestrator
│   │   ├── types.ts        # TypeScript type definitions
│   │   ├── ir.ts           # IR data structures
│   │   ├── version.ts      # Version constants
│   │   ├── projections/    # Platform-specific code generators
│   │   │   ├── interface.ts    # Projection contracts (ProjectionTarget, ProjectionRequest)
│   │   │   ├── registry.ts     # Projection registration and lookup
│   │   │   ├── builtins.ts     # Built-in projection utilities
│   │   │   └── nextjs/
│   │   │       ├── generator.ts      # Next.js projection implementation
│   │   │       ├── generator.test.ts # 21 smoke tests
│   │   │       └── README.md         # Usage documentation
│   │   ├── conformance/    # Test fixtures & expectations
│   │   │   ├── conformance.test.ts  # 142 conformance tests
│   │   │   ├── fixtures/   # 27 .manifest test files
│   │   │   └── expected/   # 63 expected outputs (.ir.json, .diagnostics.json, .results.json)
│   │   ├── *.test.ts       # Unit tests (lexer, parser, ir-compiler, runtime)
│   │   └── *.bench.ts      # Performance benchmarks
│   ├── artifacts/          # Runtime UI components
│   │   ├── ArtifactsPanel.tsx   # Generated code viewer
│   │   ├── RuntimePanel.tsx     # Interactive execution tester
│   │   ├── SmokeTestPanel.tsx   # Smoke testing UI
│   │   ├── FileTree.tsx         # File navigation
│   │   ├── FileViewer.tsx       # Code viewer
│   │   └── zipExporter.ts       # Project packaging
│   ├── project-template/   # Code generators for exported projects
│   │   ├── templates.ts    # Code generation templates
│   │   └── runtime.ts      # Runtime utilities
│   └── ui/                # UI components
├── tools/                 # Development tools and test harnesses
├── AGENTS.md             # Agent workflow rules and loop discipline
├── CLAUDE.md             # Project guidance for Claude Code
└── house-style.md        # Language design principles
```

## Key Concepts for AI Agents

### Instance Creation & Defaults

When creating an instance:
- **Omitted properties** receive default values from property definitions
- **Provided properties** (even empty strings `""`) use the provided value
- UI forms filter empty strings to allow defaults to apply (see `templates.ts`)

### Command Execution Semantics

Commands execute in strict order:
1. Build evaluation context (`self`, `this`, params, runtime context)
2. Evaluate applicable policies (fail fast on denial)
3. Evaluate guards in order (fail fast on first falsey guard)
4. Execute actions in order (`mutate`, `emit`, `compute`, etc.)
5. Emit declared events
6. Return `CommandResult` with success status and emitted events

### Guard Failures

When a guard fails, the runtime provides:
- Guard index (1-based)
- Formatted expression
- Resolved values for sub-expressions (for debugging)

### Event Payloads

Event payloads contain:
- Command input parameters
- Last action result

This enables event handlers to reconstruct the full execution context.

## Contributing

See `AGENTS.md` for detailed workflow requirements. Key points:

- All changes must pass `npm test`
- Spec changes require updating fixtures and expected outputs
- UI changes must not alter language semantics
- Document any nonconformance explicitly

## License & Status

This is a language implementation project. The Runtime UI is a diagnostic and observability surface, not an end-user application.

**Primary consumers**: AI agents that emit, validate, and reason about Manifest programs.

---

For detailed agent workflow rules, see [`AGENTS.md`](AGENTS.md).  
For language house style and invariants, see [`house-style.md`](house-style.md).  
For the complete specification, see [`docs/spec/README.md`](docs/spec/README.md).
