# Plan: Address NOT_IMPLEMENTED Features in Compliance Matrix

Last updated: 2026-02-12
Status: Implemented
Authority: Advisory
Enforced by: npm test (482 tests)

This plan addresses the two NOT_IMPLEMENTED items from `docs/COMPLIANCE_MATRIX.md` § "Implementation Summary":

1. **Bounded complexity limits** — ~~No expression depth or step-count limits enforced~~ **IMPLEMENTED**
2. **Workflow replay engine** — ~~Explicitly out of scope per design~~ **FORMALLY CLOSED as OUT_OF_SCOPE**

**Implementation summary**: Feature 1 implemented in `src/manifest/runtime-engine.ts` with `EvaluationLimits` interface, `EvaluationBudgetExceededError` class, and re-entrant budget tracking via `initEvalBudget`/`clearEvalBudget` across all 5 entry points (`_executeCommandInternal`, `createInstance`, `updateInstance`, `checkConstraints`, `evaluateComputed`). 8 unit tests added. Feature 2 formally closed via doc updates to manifest-vnext.md and COMPLIANCE_MATRIX.md. The BLOCKER identified during audit (4 uncovered entry points) was resolved by the re-entrant `initEvalBudget()` pattern that returns `false` when budget is already active.

---

## Feature 1: Bounded Complexity Limits

**Priority**: Medium (per COMPLIANCE_MATRIX.md § "Recommendations")
**Spec authority**: manifest-vnext.md § "Diagnostic Payload Bounding" (SHOULD, implementation-defined)
**Current state**: ZERO enforcement — `evaluateExpression` recurses without depth or step limits

### Problem

The expression evaluator (`runtime-engine.ts:1388-1493`) is fully recursive with no safeguards:

- `binary` → recurses into `evaluateExpression(left)` + `evaluateExpression(right)`
- `member` → recurses into `evaluateExpression(object)`
- `call` → recurses into `evaluateExpression(callee)` + all args
- `conditional` → recurses into condition + branch
- `array`/`object` → recurses into all elements/properties
- `lambda` → captures closure that calls `evaluateExpression` again

A malformed or adversarial IR could cause stack overflow or CPU exhaustion. The only existing cycle protection is `visited: Set<string>` in `evaluateComputedInternal` (line 1581), which only applies to computed property dependency chains.

### Design

#### 1.1 Add `EvaluationLimits` to `RuntimeOptions`

```typescript
// runtime-engine.ts — new interface
export interface EvaluationLimits {
  /** Maximum expression nesting depth. Default: 64 */
  maxExpressionDepth?: number;
  /** Maximum total evaluation steps per command. Default: 10_000 */
  maxEvaluationSteps?: number;
}
```

Add to `RuntimeOptions` (line 94):

```typescript
/** Optional complexity limits for expression evaluation */
evaluationLimits?: EvaluationLimits;
```

Defaults are permissive — no existing programs should be affected. Values chosen to catch runaway recursion while allowing legitimate deep expressions (nested conditionals, chained member access).

#### 1.2 Add `EvaluationBudget` tracking class

```typescript
// runtime-engine.ts — new class
export class EvaluationBudgetExceededError extends Error {
  readonly limitType: 'depth' | 'steps';
  readonly limit: number;
  constructor(limitType: 'depth' | 'steps', limit: number) {
    super(`Evaluation budget exceeded: ${limitType} limit ${limit} reached`);
    this.name = 'EvaluationBudgetExceededError';
    this.limitType = limitType;
    this.limit = limit;
  }
}
```

#### 1.3 Add depth/step tracking to `evaluateExpression`

The evaluator needs two counters threaded through the call stack. Since `evaluateExpression` is already `async` and called from many sites, the cleanest approach is a per-command mutable state object on `RuntimeEngine`:

```typescript
// runtime-engine.ts — new private field
private evalBudget: { depth: number; steps: number; maxDepth: number; maxSteps: number } | null = null;
```

**Reset** at the start of `_executeCommandInternal` (before policies/guards/constraints):

```typescript
this.evalBudget = {
  depth: 0,
  steps: 0,
  maxDepth: this.options.evaluationLimits?.maxExpressionDepth ?? 64,
  maxSteps: this.options.evaluationLimits?.maxEvaluationSteps ?? 10_000,
};
```

**Clear** at the end (in finally block):

```typescript
this.evalBudget = null;
```

**Check** at the top of `evaluateExpression`:

```typescript
async evaluateExpression(expr: IRExpression, context: Record<string, unknown>): Promise<unknown> {
  if (this.evalBudget) {
    this.evalBudget.steps++;
    if (this.evalBudget.steps > this.evalBudget.maxSteps) {
      throw new EvaluationBudgetExceededError('steps', this.evalBudget.maxSteps);
    }
    this.evalBudget.depth++;
    if (this.evalBudget.depth > this.evalBudget.maxDepth) {
      throw new EvaluationBudgetExceededError('depth', this.evalBudget.maxDepth);
    }
  }
  try {
    // ... existing switch statement
  } finally {
    if (this.evalBudget) {
      this.evalBudget.depth--;
    }
  }
}
```

The `depth` counter increments on entry and decrements on exit (try/finally), tracking recursive nesting. The `steps` counter is monotonic — never decrements — tracking total work per command.

#### 1.4 Catch budget errors in `_executeCommandInternal`

Wrap the command execution in a try/catch that converts `EvaluationBudgetExceededError` into a `CommandResult` failure:

```typescript
try {
  // ... existing policy/constraint/guard/action flow
} catch (e) {
  if (e instanceof EvaluationBudgetExceededError) {
    return {
      success: false,
      error: e.message,
      emittedEvents: [],
    };
  }
  throw e; // re-throw other errors (ManifestEffectBoundaryError, etc.)
}
```

This keeps `EvaluationBudgetExceededError` as a domain failure (CommandResult), not an uncaught exception. Contrast with `ManifestEffectBoundaryError` which is intentionally a thrown error because it represents a programming mistake.

### Implementation Steps

| Step | File | Change |
|------|------|--------|
| 1 | `src/manifest/runtime-engine.ts` | Add `EvaluationLimits` interface, `EvaluationBudgetExceededError` class |
| 2 | `src/manifest/runtime-engine.ts` | Add `evaluationLimits` to `RuntimeOptions` |
| 3 | `src/manifest/runtime-engine.ts` | Add `evalBudget` field, reset in `_executeCommandInternal`, clear in finally |
| 4 | `src/manifest/runtime-engine.ts` | Add depth/step checks at top of `evaluateExpression` with try/finally |
| 5 | `src/manifest/runtime-engine.ts` | Catch `EvaluationBudgetExceededError` in `_executeCommandInternal`, convert to CommandResult |
| 6 | `src/manifest/runtime-engine.test.ts` | Add unit tests: depth limit exceeded, step limit exceeded, default limits permissive, custom limits respected |
| 7 | `docs/spec/manifest-vnext.md` | Move "Bounded complexity limits" from NOT_IMPLEMENTED to IMPLEMENTED in nonconformance table |
| 8 | `docs/COMPLIANCE_MATRIX.md` | Update bounded complexity row from `[ ]` NOT_IMPLEMENTED to `[x]` FULLY_IMPLEMENTED |
| 9 | `CHANGELOG-workflow-framework.md` | Add changelog entry for bounded complexity |

### Test Cases

```
1. Default limits (no evaluationLimits) — existing 474 tests still pass
2. Depth limit = 5 — deeply nested binary expression (depth 10) returns CommandResult failure
3. Step limit = 50 — command with many constraints exceeding 50 evaluations returns failure
4. Depth limit hit produces descriptive error message with limit type and value
5. Step counter resets between commands (second command should not inherit first command's budget)
6. Lambda closures respect depth limits (closure invocation increments depth)
7. Computed property evaluation respects limits (evaluateComputedInternal calls evaluateExpression)
```

### Risk Assessment

- **Breaking change risk**: NONE. Default limits (64 depth, 10K steps) are far above what any legitimate Manifest program produces. Existing tests will pass without modification.
- **Performance impact**: Negligible. Two integer comparisons and one increment per `evaluateExpression` call. No allocation.
- **Determinism impact**: NONE. Limits are deterministic — same IR + same limits = same result.

---

## Feature 2: Workflow Replay Engine

**Priority**: Low (explicitly out of scope per design)
**Spec authority**: manifest-vnext.md § "Workflow Patterns" (advisory, not normative)
**Current state**: Metadata primitives FULLY_IMPLEMENTED, orchestration intentionally absent

### Context

The compliance matrix lists this as NOT_IMPLEMENTED, but `docs/COMPLIANCE_MATRIX.md` itself notes: "explicitly out of scope per design." The spec (`manifest-vnext.md:315-320`) classifies replay patterns as advisory conventions, not normative requirements.

The runtime already provides all the building blocks a caller needs to build their own replay:

| Primitive | Status | Location |
|-----------|--------|----------|
| `correlationId` on events | IMPLEMENTED | runtime-engine.ts:157 |
| `causationId` on events | IMPLEMENTED | runtime-engine.ts:159 |
| `emitIndex` per-command counter | IMPLEMENTED | runtime-engine.ts:161 |
| `IdempotencyStore` interface | IMPLEMENTED | runtime-engine.ts:179-186 |
| `deterministicMode` (block side effects) | IMPLEMENTED | runtime-engine.ts:86-93 |
| Event log (`getEventLog()`) | IMPLEMENTED | runtime-engine.ts:1875-1880 |
| State transitions (`IRTransition`) | IMPLEMENTED | runtime-engine.ts:822-836 |

### Recommended Resolution: Formally Close as OUT_OF_SCOPE

A full replay engine (event store, replay orchestrator, state reconstruction, causality validation) is a separate product concern that belongs in the adapter/integration layer, not in the reference runtime. Building it here would violate the project's design boundary: the runtime provides **primitives**, callers build **orchestration**.

### Steps to Formally Close

| Step | File | Change |
|------|------|--------|
| 1 | `docs/COMPLIANCE_MATRIX.md` § 9 | Change "Not Implemented Features (2%)" to "Out of Scope Features" and reword the replay engine entry: "Workflow replay engine — OUT_OF_SCOPE. Runtime provides replay primitives (correlationId, causationId, emitIndex, IdempotencyStore, deterministicMode). Replay orchestration is the caller's responsibility per manifest-vnext.md § 'Workflow Patterns'." |
| 2 | `docs/COMPLIANCE_MATRIX.md` § 9 | Update percentage breakdown to reflect that bounded complexity (once implemented) moves to Fully Implemented, and replay engine is reclassified as out-of-scope rather than unimplemented |
| 3 | `docs/spec/manifest-vnext.md` § "Out of scope" | Add explicit line: "Workflow replay orchestration (event store, state reconstruction, causality validation). The runtime provides metadata primitives; replay is the caller's responsibility." |
| 4 | `docs/spec/manifest-vnext.md` § "Workflow Patterns" | Add a brief "What the runtime does NOT do" clarification noting that correlationId/causationId/emitIndex/idempotency are primitives for callers to build replay on, not a replay engine |

### If Replay Is Later Brought Into Scope

If the decision changes, the minimal viable replay feature would be:

1. **`EventStore` adapter interface** — `append(event)`, `readByCorrelation(id)`, `readByCausation(id)` — analogous to the existing `IdempotencyStore` pattern
2. **`replayCommand` method** — Takes an `EmittedEvent`, re-derives the command invocation, runs it with `deterministicMode: true` + `idempotencyKey`, and compares the resulting `emitIndex` values against the original
3. **Conformance tests** — Verify replay determinism: same IR + same input + same context = identical event sequence

This would be a separate planning document if/when the scope changes.

---

## Execution Order

The two features are independent. Recommended order:

1. **Bounded complexity limits** (code changes + tests + spec/matrix updates)
2. **Workflow replay engine closure** (doc-only changes)

After both:
- Run `npm test` — verify 474+ tests passing
- Update `COMPLIANCE_MATRIX.md` § 9 summary to reflect 0 NOT_IMPLEMENTED items
- Update compliance matrix checkmarks: bounded complexity `[ ]` → `[x]`
