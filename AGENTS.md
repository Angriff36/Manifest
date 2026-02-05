# Agents Guide (Manifest)

## Validation Commands (Backpressure)

Run these after implementing to get immediate feedback:

```bash
npm test                    # Conformance + runtime tests (must pass)
npm run typecheck          # TypeScript check (no emit)
npm run lint               # ESLint
npm run dev                # Kitchen/Runtime manual smoke test (localhost:5173)
npm run conformance:regen  # Regenerate expected outputs after fixture changes
```

**Critical**: `npm test` must remain green. No exceptions.

---

Manifest Language – House Style (Normative)

This system defines a formal language and reference runtime. It is not an end-user application.

The Runtime UI is a diagnostic and observability surface only. UX convenience must never weaken semantics.

Primary consumers are AI agents that emit, validate, and reason about Manifest programs.

Core invariants:

Determinism over convenience.
Identical IR + identical runtime context must produce identical results.

Explicitness over inference.
Guards MUST reference spec-guaranteed bindings (self.*, this.*, user.*, context.*).
No reliance on identifier hoisting or implicit scope.

Runtime context is mandatory input.
If a guard references user, execution without a provided user is a correct failure.

Guard semantics are strict.
Guards are evaluated in order.
Execution halts on the first falsey guard.
No auto-repair, fallback, or permissive defaults.

Diagnostics explain, never compensate.
Failures must surface:

failing guard index

guard expression

resolved values when available
Diagnostics MUST NOT alter execution behavior.

The IR is immutable at runtime.
All variability enters through runtime context, never by editing IR.

Any change that makes an invalid program succeed is a language violation, not a UX improvement.

That’s the contract. If Codex violates it, Codex is wrong. Not “needs a tweak”, not “almost there”. Wrong.

Confidence: 98% — Directly derived from the language goals you’ve articulated and the failure modes you’re actively eliminating.

Reference: `house-style.md`.

This repo is a language implementation. Agents must treat **meaning as law** and
code as an instrument.

If behavior changes, the **spec changes first**, then **tests**, then
**implementation**.

## Source of Truth (in order)

1. `docs/spec/ir/ir-v1.schema.json` (IR shape is the contract)
2. `docs/spec/semantics.md` (runtime meaning)
3. `docs/spec/builtins.md` (built-ins)
4. `docs/spec/adapters.md` (adapter hooks / missing behavior)
5. `docs/spec/conformance.md` + `src/manifest/conformance/*` (executable
   evidence)

If any implementation behavior differs, it must be called out as
**Nonconformance** in the spec docs, then fixed via spec → tests → code.

## Non-negotiables

- **Do not edit IR output by hand.** IR is compiler output and must remain
  derived.
- **Do not weaken conformance.** If tests “feel too strict,” the agent is wrong.
- **Do not “fix UI” by changing semantics.** UI adapts to the language, not the
  reverse.
- **Determinism is required.** IDs/timestamps must remain controllable for
  tests.
- **No silent drift in export templates.** Exported runnable projects must track
  real compiler/runtime meaning.

## Agent Workflow (required)

Agents must follow this sequence for any change:

1. Determine the purpose
   - What user-visible behavior is being changed and why?
   - Is this a language change (meaning) or a tooling/UI change (projection)?

2. Locate the governing law
   - Identify the exact spec sections and conformance fixtures that define the
     behavior.

3. Update in constitutional order
   - If meaning changes: update spec docs first, then fixtures/expected outputs,
     then compiler/runtime/UI.
   - If meaning does NOT change: do not touch spec; modify implementation/UI
     only.

4. Prove it
   - Run conformance tests. No green = not done.
   - If UI is involved, do a minimal manual smoke test in Kitchen/Runtime.

## Commands Agents Are Allowed to Run

Use npm for this repo.

- `npm test` (must remain green)
- `npm run dev` (Kitchen/Runtime manual smoke)

If dependency security work is requested:

- Prefer `npm audit` / `npm audit fix`
- Avoid `npm audit fix --force` unless the user explicitly accepts breaking
  upgrades.

## Repository “Danger Zones”

Agents must treat these as high-risk and make changes only with explicit
justification and verification:

### 1) Spec & IR contract

- `docs/spec/**`
- `docs/spec/ir/ir-v1.schema.json`

Any change here is a **language boundary**. Expect cascade updates.

### 2) Conformance fixtures & expectations

- `src/manifest/conformance/fixtures/*.manifest`
- `src/manifest/conformance/expected/*.ir.json`
- `src/manifest/conformance/expected/*.diagnostics.json`
- `src/manifest/conformance/expected/*.results.json`

Conformance tests are not “tests.” They are **executable semantics**.

### 3) Compiler / IR normalization

Anything that changes IR shape or normalization must be reflected in:

- schema
- fixture expected IR
- runtime interpretation

### 4) Runtime behavior and evaluation context

Semantics require command execution order:

1. Build evaluation context (`self/this`, params, runtime context)
2. Policies
3. Guards (ordered)
4. Actions (ordered)
5. Emits (ordered)
6. Return CommandResult

If Runtime UI cannot provide runtime context (e.g., `user.role`), that’s a UI
feature gap, not a semantics bug.

### 5) Export templates

If generated runtime/compiler code is embedded in templates, it must stay
aligned with the real implementation. Template drift is treated as a regression.

## UI Change Rules (Kitchen + Runtime)

UI must reflect IR and semantics, not invent them.

Allowed UI improvements:

- Better diagnostics: show which guard failed (index + expression) and why.
- Add runtime context editor (e.g., `{ user: { id, role }, ... }`) so programs
  using `user` are runnable.
- Display current selected instance, computed values, event payloads, and action
  results.

Not allowed:

- Auto-injecting permissive default `user` to “make demos work.”
- Reordering guard/policy/action semantics for convenience.
- Letting UI mutate IR directly.

## File Integrity Rules

- Preserve UTF-8 **without BOM** for JSON fixtures and expected files.
- Keep fixture JSON stable and deterministic (no random IDs/times).

## How Agents Must Write Changes

- Prefer small, isolated commits.
- When touching spec or conformance, changes must include:
  - exact spec sections updated
  - which fixtures changed and why
  - proof: `npm test` output

## If Something Is Ambiguous

Agents must not guess.

Required behavior:

- search in-repo for the governing rule (spec section, fixture, or runtime
  function)
- if still unclear, document the uncertainty and stop before modifying meaning

## Definition of “Done”

A change is only done when:

- `npm test` is green
- spec/test/impl are aligned (no undocumented nonconformance)
- any UI change has a minimal manual verification path described
