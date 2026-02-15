<!-- Context: project-intelligence/technical | Priority: critical | Version: 1.1 | Updated: 2026-02-14 -->

# Technical Domain

**Purpose**: Tech stack, architecture, and development patterns for Manifest language implementation.
**Last Updated**: 2026-02-14

## Quick Reference
**Update Triggers**: Tech stack changes | New patterns | Architecture decisions
**Audience**: Developers, AI agents

## Primary Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Language | TypeScript | 5.5 (strict) | Type safety for language implementation |
| Runtime | Node.js | ES Modules | Native ESM support, CLI tools |
| UI | React + Vite + Tailwind | 18/5/3 | Dev tools UI with fast HMR |
| Database | PostgreSQL + Supabase | pg 8.x | IR storage, runtime state |
| Testing | Vitest | 4.x | Fast unit + conformance tests |
| Build | Vite (app) + tsc (lib) | 5.x | Dual output: app + library |

## Architecture Pattern

```
Type: Language Implementation (Compiler + Runtime)
Pattern: IR-first architecture - source → lexer → parser → IR → runtime
Diagram: docs/spec/README.md
```

### Why This Architecture?

IR-first ensures semantic consistency. The IR (Intermediate Representation) is the single source of truth. All runtime behavior derives from IR. Generated code is derivative, not authoritative.

## Project Structure

```
manifest/
├── src/manifest/           # Core language implementation
│   ├── lexer.ts            # Tokenization
│   ├── parser.ts           # AST generation
│   ├── compiler.ts         # Source → IR compilation
│   ├── ir.ts               # IR types
│   ├── ir-compiler.ts      # IR optimization
│   ├── runtime-engine.ts   # IR execution
│   ├── projections/        # Code generators (Next.js, etc.)
│   └── conformance/        # Executable semantics tests
├── src/artifacts/          # Dev tools UI (Kitchen)
├── packages/cli/           # CLI tool
├── docs/spec/              # Language specification (AUTHORITATIVE)
└── src/project-template/   # Export templates
```

**Key Directories**:
- `src/manifest/` - Core language: lexer, parser, compiler, runtime
- `src/manifest/conformance/` - Executable semantics (fixtures + expected)
- `docs/spec/` - Authoritative language specification
- `src/artifacts/` - Kitchen UI for development/testing

## Code Patterns

### Runtime Execution
```typescript
export function executeCommand(
  ir: IR,
  commandName: string,
  context: RuntimeContext
): CommandResult {
  // 1. Find command in IR
  // 2. Build evaluation context (self/this, params, runtime)
  // 3. Evaluate guards in order (halt on first falsey)
  // 4. Execute actions in order
  // 5. Emit events
  // 6. Return CommandResult
}
```

### Component Pattern
```typescript
interface RuntimePanelProps {
  ir: IR | null;
  onExecute: (command: string, context: RuntimeContext) => void;
}

export function RuntimePanel({ ir, onExecute }: RuntimePanelProps) {
  return (
    <div className="p-4 border rounded-lg">
      {/* Tailwind-styled UI */}
    </div>
  );
}
```

## Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Files | kebab-case | runtime-engine.ts |
| Components | PascalCase | RuntimePanel |
| Functions | camelCase | executeCommand |
| Types | PascalCase | IR, RuntimeContext |
| Tests | *.test.ts alongside source | runtime-engine.test.ts |
| Fixtures | NN-description.manifest | 05-guard-denial.manifest |

## Code Standards

- TypeScript strict mode enabled
- ES modules (type: "module")
- Conformance tests are executable semantics, not just unit tests
- Spec-first development: spec → tests → implementation
- IR is immutable at runtime - all variability through context
- Determinism required: IDs/timestamps controllable for tests
- npm test must remain green - no exceptions

**Non-negotiables** (from AGENTS.md):
- Do not edit IR output by hand
- Do not weaken conformance tests
- Do not fix UI by changing semantics

## Security Requirements

- Guard semantics are strict - no auto-repair or permissive defaults
- Guards reference spec-guaranteed bindings only (self.*, this.*, user.*, context.*)
- Runtime context is mandatory - missing context = correct failure
- Guards evaluated in order, halt on first falsey
- Diagnostics explain failures (guard index + expression), never compensate
- Route handlers: strip client identity, inject auth/path-authoritative values

## 📂 Codebase References

**Core Implementation**: `src/manifest/runtime-engine.ts` - Command execution engine
**Compiler**: `src/manifest/compiler.ts` - Source to IR compilation
**IR Types**: `src/manifest/ir.ts` - IR type definitions
**UI Components**: `src/artifacts/*.tsx` - Kitchen dev tools
**Conformance**: `src/manifest/conformance/` - Executable semantics tests
**Spec**: `docs/spec/` - Authoritative language specification

## Key Technical Decisions

| Decision | Rationale | Impact |
|----------|-----------|--------|
| IR-first architecture | Single source of truth for semantics | All behavior derives from IR |
| Conformance fixtures | Tests are executable semantics | No undocumented behavior |
| Deterministic IDs/timestamps | Reproducible test outputs | Stable fixtures |
| Guard ordering | Predictable execution flow | Fail-fast on authorization |

See `decisions-log.md` for full decision history.

## Related Files

- [Business Domain](business-domain.md) - Why this language exists
- [Business-Tech Bridge](business-tech-bridge.md) - Requirements → implementation
- [Decisions Log](decisions-log.md) - Full decision history
