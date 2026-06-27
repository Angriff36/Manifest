# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Manifest** is a domain-specific language (DSL) and reference runtime for defining business rules and workflows with declarative specifications. Version: **v0.3.21**.

This is a **language implementation**, not an end-user application. The Runtime UI is a diagnostic and observability surface only. Primary consumers are AI agents that emit, validate, and reason about Manifest programs.

## Essential Commands

```bash
pnpm test                    # Run all tests (must always pass; see test output for current count)
pnpm run typecheck          # TypeScript check without emit
pnpm run lint               # ESLint validation
pnpm run dev                # Development server (localhost:5173)
pnpm run conformance:regen  # Regenerate expected outputs after fixture changes
pnpm run bench              # Run benchmarks
```

**Critical**: `pnpm test` must remain green. No exceptions.

## Release Procedure — use the one-button workflow

**Do not release by hand.** Run the `cut-release` workflow and verify it
goes green:

```bash
pnpm manifest:publish            # patch bump + watch to green (shortcut)
pnpm manifest:publish minor      # or minor / major / explicit e.g. 2.4.0

# equivalent raw form:
gh workflow run cut-release.yml -f version=minor   # or patch / major / explicit e.g. 2.4.0
gh run watch --repo Angriff36/Manifest             # wait for green
```

`pnpm manifest:publish` wraps `scripts/release.mjs` (dispatch + watch with
`--exit-status`). Pre-write the `CHANGELOG.md` section for the target version
first — the workflow keeps an existing section, otherwise it auto-stubs.

It is publish-first. build + typecheck + the full test suite gate the run,
then it bumps `package.json` (the source of truth), ensures a `CHANGELOG.md`
section (stubbed from commit subjects if none was written — write a real one
beforehand for quality notes), commits `[release] vX.Y.Z` locally, and
**publishes `@angriff36/manifest` to npm via OIDC trusted publishing** — and
only after a successful publish does it tag, push main + tag, and create the
GitHub Release. A failed publish leaves npm and git untouched (no dangling
tags). Auth is OIDC (`id-token: write`; no `NPM_TOKEN`, no GitHub Packages);
register it once with `scripts/setup-npm-trusted-publish.ps1`.

**A release is done only when the `cut-release` run is green** — and confirm
the Publish step actually published (read its log, don't trust just the run
color). Manual fallback (only if the workflow itself is broken): `npm login`
(passkey) → `pnpm test` → `pnpm publish --no-git-checks`, then tag and push
by hand (`git tag -a vX.Y.Z && git push origin vX.Y.Z`) and create the
GitHub Release.

Do not move/force-push a tag after the publish job has run.

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

### Test Suite
1. **Conformance Tests** (209): Fixture-based testing with expected outputs
2. **Unit Tests** (322):
   - Lexer tests (58): Tokenization and edge cases
   - Parser tests (79): AST construction
   - IR Compiler tests (91): IR generation
   - Runtime tests (56): Execution engine and guards
3. **Projection Tests** (21): Next.js projection smoke tests
4. **CLI Tests** (78): compile, validate, scan, config commands

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
3. **Test-driven**: All changes must keep `pnpm test` green
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
pnpm test                    # Must pass
pnpm run typecheck          # TypeScript check
pnpm run lint               # ESLint
pnpm run dev                # Manual smoke test
```

## Danger Zones (High-Risk Changes)

Agents must treat these with explicit justification and verification:

1. **Spec & IR contract**: `docs/spec/**` - Language boundary changes
2. **Conformance fixtures**: `src/manifest/conformance/**` - Executable semantics
3. **Compiler / IR normalization**: Changes to IR shape require schema/fixture/runtime updates
4. **Runtime behavior**: Command execution order is fixed (policies → guards → actions → emits → return)
5. **Export templates**: Must stay aligned with real implementation

## Platform Rules (Windows)

- **NEVER use `2>&1`** in bash commands — on Windows it creates spurious `nul` files. Omit stderr redirection entirely; tool output captures both streams automatically.

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
- `pnpm test` is green
- `pnpm run typecheck` passes
- `pnpm run lint` passes
- Spec/test/impl are aligned (no undocumented nonconformance)
- UI changes have manual verification path described
- UI demos are actually functional (buttons clickable, flows completable)

# === COGNILAYER (auto-generated, do not delete) ===

## CogniLayer v4 Active
Persistent memory + code intelligence is ON.
ON FIRST USER MESSAGE in this session, briefly tell the user:
  'CogniLayer v4 active — persistent memory is on. Type /cognihelp for available commands.'
Say it ONCE, keep it short, then continue with their request.

## Tools — HOW TO WORK

FIRST RUN ON A PROJECT:
When DNA shows "[new session]" or "[first session]":
1. Run /onboard — indexes project docs (PRD, README), builds initial memory
2. Run code_index() — builds AST index for code intelligence
Both are one-time. After that, updates are incremental.
If file_search or code_search return empty → these haven't been run yet.

UNDERSTAND FIRST (before making changes):
- memory_search(query) → what do we know? Past bugs, decisions, gotchas
- code_context(symbol) → how does the code work? Callers, callees, dependencies
- file_search(query) → search project docs (PRD, README) without reading full files
- code_search(query) → find where a function/class is defined
Use BOTH memory + code tools for complete picture. They are fast — call in parallel.

BEFORE RISKY CHANGES (mandatory):
- Renaming, deleting, or moving a function/class → code_impact(symbol) FIRST
- Changing a function's signature or return value → code_impact(symbol) FIRST
- Modifying shared utilities used across multiple files → code_impact(symbol) FIRST
- ALSO: memory_search(symbol) → check for related decisions or known gotchas
Both required. Structure tells you what breaks, memory tells you WHY it was built that way.

AFTER COMPLETING WORK:
- memory_write(content) → save important discoveries immediately
  (error_fix, gotcha, pattern, api_contract, procedure, decision)
- session_bridge(action="save", content="Progress: ...; Open: ...")
DO NOT wait for /harvest — session may crash.

SUBAGENT MEMORY PROTOCOL:
When spawning Agent tool for research or exploration:
- Include in prompt: synthesize findings into consolidated memory_write(content, type, tags="subagent,<task-topic>") facts
  Assign a descriptive topic tag per subagent (e.g. tags="subagent,auth-review", tags="subagent,perf-analysis")
- Do NOT write each discovery separately — group related findings into cohesive facts
- Write to memory as the LAST step before return, not incrementally — saves turns and tokens
- Each fact must be self-contained with specific details (file paths, values, code snippets)
- When findings relate to specific files, include domain and source_file for better search and staleness detection
- End each fact with 'Search: keyword1, keyword2' — keywords INSIDE the fact survive context compaction
- Record significant negative findings too (e.g. 'no rate limiting exists in src/api/' — prevents repeat searches)
- Return: actionable summary (file paths, function names, specific values) + what was saved + keywords for memory_search
- If MCP tools unavailable or fail → include key findings directly in return text as fallback
- Launch subagents as foreground (default) for reliable MCP access — user can Ctrl+B to background later
Why: without this protocol, subagent returns dump all text into parent context (40K+ tokens).
With protocol, findings go to DB and parent gets ~500 token summary + on-demand memory_search.

BEFORE DEPLOY/PUSH:
- verify_identity(action_type="...") → mandatory safety gate
- If BLOCKED → STOP and ask the user
- If VERIFIED → READ the target server to the user and request confirmation

## VERIFY-BEFORE-ACT
When memory_search returns a fact marked ⚠ STALE:
1. Read the source file and verify the fact still holds
2. If changed → update via memory_write
3. NEVER act on STALE facts without verification

## Process Management (Windows)
- NEVER use `taskkill //F //IM node.exe` — kills ALL Node.js INCLUDING Claude Code CLI!
- Use: `npx kill-port PORT` or find PID via `netstat -ano | findstr :PORT` then `taskkill //F //PID XXXX`

## Git Rules
- Commit often, small atomic changes. Format: "[type] what and why"
- commit = Tier 1 (do it yourself). push = Tier 3 (verify_identity).

## Project DNA: @angriff36/manifest
Stack: React 18.3.1, TypeScript, Tailwind CSS
Style: [unknown]
Structure: .automaker, .bolt, .codex-main-push, .github, .opencode, .playwright-mcp, .tmp, .turbo
Deploy: [NOT SET]
Active: [new session]
Last: [first session]

## Last Session Bridge
[proactive bridge @ 94% context — saved before compacting]
Files (6):
  C:/Users/Ryan/.claude/projects/C--projects-manifest/memory/reference-npm-publish.md (create)
  C:/Users/Ryan/.claude/projects/C--projects-manifest/memory/MEMORY.md (edit)
  mintlify/installation.mdx (edit)
  docs/getting-started/new-project.md (edit)
  docs/getting-started/quickstart.md (edit)
  docs/internal/tools/CLI_REFERENCE.md (edit)

# === END COGNILAYER ===
