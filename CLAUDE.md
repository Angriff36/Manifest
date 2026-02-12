# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Manifest** is a domain-specific language (DSL) and reference runtime for defining business rules and workflows with declarative specifications. Version: **v0.3.8**.

This is a **language implementation**, not an end-user application. The Runtime UI is a diagnostic and observability surface only. Primary consumers are AI agents that emit, validate, and reason about Manifest programs.

## Essential Commands

```bash
npm test                    # Run all tests (467 tests - must always pass)
npm run typecheck          # TypeScript check without emit
npm run lint               # ESLint validation
npm run dev                # Development server (localhost:5173)
npm run conformance:regen  # Regenerate expected outputs after fixture changes
npm run bench              # Run benchmarks
```

**Critical**: `npm test` must remain green. No exceptions.

## Architecture

### IR-First Language Design

Manifest is an **IR-first language**. The Intermediate Representation (IR) is the single source of truth for program semantics.

- **IR is Authority**: The IR (defined by `docs/spec/ir/ir-v1.schema.json`) is the executable contract
- **Generated Code is Derivative**: TypeScript/React generated from IR is a *view*, not source of truth
- **Source of Truth Order**:
  1. `docs/spec/ir/ir-v1.schema.json` (IR shape is the contract)
  2. `docs/spec/semantics.md` (runtime meaning)
  3. `docs/spec/builtins.md` (built-ins)
  4. `docs/spec/adapters.md` (adapter hooks)
  5. `docs/spec/conformance.md` + `src/manifest/conformance/*` (executable evidence)

### Compilation Pipeline

```
.manifest source → Lexer → Parser → AST → IR Compiler → IR
                                                       ↓
                                                 Runtime Engine
```

### Key Source Files

- `src/manifest/compiler.ts` - Main compiler orchestrator
- `src/manifest/lexer.ts` - Tokenization
- `src/manifest/parser.ts` - AST construction
- `src/manifest/ir-compiler.ts` - IR generation from AST
- `src/manifest/runtime-engine.ts` - Execution engine
- `src/manifest/generator.ts` - Code generation (TypeScript/React)
- `src/manifest/examples.ts` - Comprehensive language examples
- `src/manifest/types.ts` - TypeScript type definitions

### Artifacts System

The `src/artifacts/` directory provides UI for viewing generated code:
- `ArtifactsPanel.tsx` - View generated client/server code
- `RuntimePanel.tsx` - Interactive runtime testing
- `SmokeTestPanel.tsx` - Smoke testing interface
- `zipExporter.ts` - Project packaging utilities

## Language Features

### Core Concepts
- **Entities**: Business objects with properties and behaviors
- **Properties**: Data fields with types and constraints
- **Computed Properties**: Auto-calculating derived fields (spreadsheet-like)
- **Commands**: Business operations with guards and mutations
- **Policies**: Authorization rules (read/write/execute)
- **Relationships**: hasMany, hasOne, belongsTo, ref connections
- **Constraints**: Data validation with severity levels (ok/warn/block)
- **Events**: Realtime pub/sub for state changes
- **Stores**: Persistence targets (memory, localStorage, Supabase, PostgreSQL)
- **Modules**: Namespace grouping

### vNext Features (Recently Implemented)
- Commands with guards and mutations
- Computed/derived properties
- Constraint severity and outcomes
- Entity concurrency controls
- Policy-based authorization
- Store persistence

## Testing Strategy

### Test Suite (467 tests total)
1. **Conformance Tests** (142): Fixture-based testing with expected outputs
2. **Unit Tests** (304):
   - Lexer tests (58): Tokenization and edge cases
   - Parser tests (79): AST construction
   - IR Compiler tests (91): IR generation
   - Runtime tests (56): Execution engine and guards
3. **Projection Tests** (21): Next.js projection smoke tests

### Test Files
- `src/manifest/conformance/conformance.test.ts` - Conformance suite
- `src/manifest/*.test.ts` - Unit tests for each module
- `src/manifest/*.bench.ts` - Performance benchmarks

### Conformance Fixtures
- `src/manifest/conformance/fixtures/*.manifest` - Language source
- `src/manifest/conformance/expected/*.ir.json` - Expected IR output
- `src/manifest/conformance/expected/*.diagnostics.json` - Expected diagnostics
- `src/manifest/conformance/expected/*.results.json` - Expected execution results

**Critical**: Conformance tests are not "tests"—they are **executable semantics**. If they "feel too strict," the agent is wrong.

## House Style (Language Design Principles)

From `house-style.md` and `AGENTS.md`:

1. **Determinism over convenience**: Identical IR + identical runtime context must produce identical results
2. **Explicitness over inference**: Guards MUST reference spec-guaranteed bindings (self.*, this.*, user.*, context.*)
3. **Strict guard semantics**: Guards evaluated in order, execution halts on first falsey guard. No auto-repair, fallback, or permissive defaults
4. **Diagnostics explain, never compensate**: Failures must surface failing guard index, expression, resolved values. Diagnostics MUST NOT alter execution behavior
5. **IR is immutable at runtime**: All variability enters through runtime context, never by editing IR

**Any change that makes an invalid program succeed is a language violation, not a UX improvement.**

## Development Workflow

1. **One iteration = one committable unit**: Commit within ~15 minutes. If you can't, scope is too big
2. **Backpressure rules**: Partial progress committed > perfect progress lost
3. **Test-driven**: All changes must maintain 467/467 test passing
4. **Spec-driven**: If behavior changes, update spec first, then tests, then implementation
5. **Commit early**: Touching 5+ files without committing is a red flag

## Loop Discipline (for Ralph/Agent workflows)

From `AGENTS.md`:

**Signs of context rot**:
- Reading the same file twice → you forgot
- "Let me also..." → stop, commit what you have first
- Large uncommitted diff → commit now

**Validation commands** (run after implementing):
```bash
npm test                    # Must pass
npm run typecheck          # TypeScript check
npm run lint               # ESLint
npm run dev                # Manual smoke test
```

## Danger Zones (High-Risk Changes)

Agents must treat these with explicit justification and verification:

1. **Spec & IR contract**: `docs/spec/**` - Language boundary changes
2. **Conformance fixtures**: `src/manifest/conformance/**` - Executable semantics
3. **Compiler / IR normalization**: Changes to IR shape require schema/fixture/runtime updates
4. **Runtime behavior**: Command execution order is fixed (policies → guards → actions → emits → return)
5. **Export templates**: Must stay aligned with real implementation

## File Integrity Rules

- Preserve UTF-8 **without BOM** for JSON fixtures
- Keep fixture JSON stable and deterministic (no random IDs/times)
- Conformance fixtures use `// @ts-check` for type safety

## TypeScript Configuration

- Uses project references: `tsconfig.json` references `tsconfig.app.json` and `tsconfig.node.json`
- Strict type checking enabled
- `src/manifest` compiled as CommonJS for test compatibility
- `src` (UI) compiled as ES modules for Vite

## UI Change Rules

UI must reflect IR and semantics, not invent them:

**Allowed**:
- Better diagnostics (show which guard failed and why)
- Add runtime context editor for testing programs
- Display current state, computed values, events

**Not allowed**:
- Auto-injecting permissive defaults to "make demos work"
- Reordering guard/policy semantics for convenience
- Letting UI mutate IR directly

## Definition of "Done"

A change is only done when:
- `npm test` is green (467/467 passing)
- `npm run typecheck` passes
- `npm run lint` passes
- Spec/test/impl are aligned (no undocumented nonconformance)
- UI changes have manual verification path described
- UI demos are actually functional (buttons clickable, flows completable)
