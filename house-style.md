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
