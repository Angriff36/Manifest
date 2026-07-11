# v2.3.0 Feature Wave — Design

**Date**: 2026-06-09
**Status**: Approved by owner (design review in session); spec-reviewed, revision 3 (approved)
**Features**: date/time primitive types, dynamic data masking, realtime entity subscriptions (SSE), time-travel debugger

## Background

Four features were marked `status: "verified"` in `.automaker/features/*/feature.json` and listed as "Implemented but Unreleased" in `docs/FEATURE-LIST.md`, but contain zero code anywhere in the repository (verified against main, all worktrees, all branches, and all stashes on 2026-06-09). This wave implements them for real, in dependency order:

1. `date-time-types` — core language; everything else can use it
2. `data-masking` — builds on role hierarchy; security value
3. `realtime-subscription` — projection-level; runtime backbone already exists
4. `runtime-time-travel` — diagnostic UI only; lowest risk

Each feature lands as its own commit series with `pnpm test` green at every commit. One minor version bump (v2.3.0) after all four.

---

## Feature 1: Date/time primitive types

### Goal

Add `date`, `time`, `datetime`, `duration` as first-class primitive types beyond plain `number` timestamps. `interval` (range type) is explicitly out of scope — a range is two datetimes.

### Grammar — contextual recognition, NOT lexer keywords

The four names are **not** added to the lexer keyword list. `date` and `time` are extremely common property names; making them keywords would silently break existing programs (`consumeIdentifier()` rejects keywords). Instead, `parseType` recognizes the four names contextually when they appear in type position (type position already accepts bare identifiers for value-object references, so this is zero new grammar).

Conformance must include a regression case proving `property date: string` and `property time: number` still parse.

### IR

`IRType.name` is a free-form string in `ir-v1.schema.json` (no enum exists) — no schema change is required for the type names themselves. The real enforcement points are:

- `parseType` name recognition (above)
- The reference TS generators' type maps (`generator.ts:785`, `standalone-generator.ts:540`): add `datetime → number`, `duration → number`, `date → string`, `time → string`. Default-value map: `datetime/duration → 0`; `date`/`time` → `""` — explicitly a **sentinel** that the runtime's write-time validation will `block`; generated defaults are placeholders for required-input shaping, not valid values, and semantics.md says so in one sentence (deterministic alternatives like "today" are impossible by design).
- `docs/spec/semantics.md` gains a Date/Time Types section defining representation and validation (the schema being free-form makes semantics.md the binding contract here).

Note: the IR compiler already stamps auto-timestamps with `type.name: 'datetime'` (`src/manifest/ir-compiler.ts:575`); that output is already schema-valid today and is unaffected.

### Runtime representation (determinism first)

| Type       | Representation                             | Rationale                                        |
| ---------- | ------------------------------------------ | ------------------------------------------------ |
| `datetime` | number, epoch ms UTC, finite               | matches existing `year(ts)`/`month(ts)` builtins |
| `duration` | number, ms, finite (may be negative)       | trivially arithmetic-compatible                  |
| `date`     | string `"YYYY-MM-DD"`, valid calendar date | lexicographically comparable, no TZ ambiguity    |
| `time`     | string `"HH:MM:SS"`, `00:00:00`–`23:59:59` | same; no `24:00:00`, no leap seconds             |

### Write-time validation (new, explicitly specified mechanism)

The runtime engine today has no property type validation; this feature adds one, scoped narrowly:

- **Where it fires**: in the reference runtime's write path (create and update mutations), at the same stage where `encrypted` and auto-timestamp processing occur — after guards, during action application.
- **What it checks**: `date`/`time` values must match the shapes above _including calendar validity_ (`"2026-02-30"` is rejected; month lengths and leap years enforced). `datetime`/`duration` must be finite numbers.
- **Failure shape**: the mutation fails with a constraint-violation-style result, severity `block`, code `E_TYPE_DATE` / `E_TYPE_TIME` / `E_TYPE_DATETIME` / `E_TYPE_DURATION`, carrying the property name and the offending resolved value (house diagnostics rule: explain with specifics).
- `null` on a nullable property passes; validation applies only to the four new type names (no behavior change for any existing program).

Documented in `docs/spec/semantics.md`.

### New builtins (pure, UTC-only)

- `dateOf(ts)` → `"YYYY-MM-DD"`; `timeOf(ts)` → `"HH:MM:SS"`
- `datetimeOf(dateStr, timeStr?)` → epoch ms (missing time = midnight UTC); malformed input → `NaN`-free failure: returns `null` (callers compose with existing null-handling semantics)
- `addDuration(ts, d)` → ms; `durationBetween(a, b)` → ms (`b - a`)
- Constructors: `durationDays(n)`, `durationHours(n)`, `durationMinutes(n)`, `durationSeconds(n)`

Documented in `docs/spec/builtins.md` under the existing Date section.

### Projections

| Projection    | date                | time                | datetime       | duration       |
| ------------- | ------------------- | ------------------- | -------------- | -------------- |
| Prisma        | `DateTime @db.Date` | `DateTime @db.Time` | `DateTime`     | `Float`        |
| Zod           | regex string        | regex string        | `z.number()`   | `z.number()`   |
| JSON Schema   | `format: date`      | `format: time`      | `type: number` | `type: number` |
| TS generators | `string`            | `string`            | `number`       | `number`       |

`duration` maps to Prisma `Float` (Postgres double precision), not `Int`: ms durations overflow 32-bit `Int` at ~24.8 days, and double precision represents integer ms exactly up to 2^53 — identical to the JS runtime representation. All other projections degrade to their existing `string`/`number` defaults — no special handling required.

### Tests

- Conformance fixture `92-date-time-types.manifest` (+ expected IR/diagnostics/results): declarations, builtins in computed properties and guards, write-time rejection of `"2026-02-30"` and `"24:00:00"`, and the `property date: string` keyword-collision regression.
- Parser/ir-compiler unit tests for contextual type recognition.
- Runtime tests for each builtin (month lengths, leap years, negative durations, `datetimeOf` malformed input → null).
- Projection tests for the Prisma/Zod/JSON-Schema mappings.

---

## Feature 2: Dynamic data masking

### Goal

`masked(...)` property modifier that transforms sensitive values at read time, with the strategy explicit in source.

### Syntax

Modifiers in Manifest precede the property name. `masked` follows that rule, optionally taking flat arguments (strategy first, then strategy params):

```manifest
property masked(partial, 0, 4) ssn: string
property masked(email) contact: string unmask when user.role == "admin"
property masked notes: string            // bare = redact
```

- Strategies: `redact` (default — replace with `"***"`), `partial(keepStart, keepEnd)` — written flat as `masked(partial, 0, 4)`, `email` (first char + domain), `phone` (last 4 digits), `last4`.
- Optional `unmask when <expr>` clause at the end of the property declaration; compile error if present without `masked`.
- Unknown strategy or wrong arity → compile diagnostic (negative parse tests required).
- Tokenization from the original automaker spec is dropped (needs an external token service — YAGNI).

### Parsing / IR

- **`masked` stays a contextual identifier, NOT a lexer keyword** (same collision class as `date`/`time` in feature 1: `property masked: string` is a valid program on main and must keep parsing). The modifier loop at `parser.ts:374` recognizes `masked` with a **one-token lookahead**: if the token after `masked` is `:`, it is the property name, not a modifier. Conformance regression case required: `property masked: string` parses as a plain property.
- When `masked` is consumed as a modifier, the parser optionally parses a parenthesized arg list (new code; the `decimal(10,2)` pattern at `parser.ts:818` is precedent for parenthesized params, not shared code).
- IR: `modifiers` stays a bare-string list; `'masked'` joins the `PropertyModifier` union (`ir.ts:157`) and the schema's modifier enum. Strategy params live in a new optional `IRProperty.maskStrategy`: `{ type: 'redact'|'partial'|'email'|'phone'|'last4', params?: number[], unmaskWhen?: IRExpression }`.
- **Invariant** (compiler-enforced, conformance-tested): `'masked' ∈ modifiers` ⇔ `maskStrategy` present. Bare `masked` compiles to `maskStrategy: { type: 'redact' }`.

### Runtime semantics

- Masking is applied in `getInstance` / `getAllInstances`, **after** `encrypted` decryption (mask operates on plaintext) and after tenant filtering, before returning data. If a property is both `private` and `masked`, `private` wins (the property is excluded entirely, as today).
- `unmaskWhen` bindings: spec-guaranteed bindings only — `self.*` (the instance being read) and `user.*` / `context.*` from the engine's runtime context. With no user in context, `user.*` resolves undefined → falsy → masked.
- **Secure by default, diagnostics still explain**: if `unmaskWhen` throws or evaluates falsy, the value stays masked; an evaluation _error_ additionally surfaces a diagnostic carrying the expression and resolved values (it never changes the masked outcome — diagnostics explain, never compensate).
- `null`/`undefined` pass through unmasked (nothing to leak).
- Masking is a read-projection transform only: guards, constraints, computed properties, and command actions always see real values. Identical IR + identical context still produce identical execution results.

### Scope boundaries (documented limitations, in semantics.md)

Masking in v2.3.0 covers **reference-runtime reads only**. Explicit non-goals, stated so nobody mistakes them for guarantees:

1. Generated Next.js read routes query the store directly and bypass the engine — they are NOT masked in this release (follow-up feature; the limitation is called out in the projection docs).
2. Computed properties derived from masked properties return computed-from-real values unmasked (`emailCopy: email` bypasses masking). Authors are warned in docs; mark the computed property `masked` too if it derives from sensitive data.
3. Event payloads contain whatever commands explicitly emit — author's responsibility.
4. Write-back hazard: the runtime does not detect a masked placeholder (`"***"`) being round-tripped into an update. Documented hazard; clients must not write masked reads back.

### Tests

- Conformance fixture `93-data-masking.manifest`: each strategy, bare `masked`, unmask-when allowed/denied/no-user, null passthrough, error-in-unmask-expression stays masked (and surfaces a diagnostic), masked+encrypted ordering, masked+private exclusion, the modifiers⇔maskStrategy invariant.
- Runtime unit tests for every masking helper.
- Negative parse tests: unknown strategy, bad arity, `unmask when` without `masked`.

---

## Feature 3: Realtime entity subscriptions (SSE)

### Goal

`realtime` entity flag that generates SSE subscription endpoints and typed client hooks, using the existing in-memory event stream as the backbone.

### Deployment model (pinned honestly)

`onEvent` is a per-engine-instance, in-memory listener list, and the generated Next.js dispatcher constructs runtimes per request — so SSE only works where the route handler and command executions share **one long-lived engine instance**. Therefore:

- Generated SSE code uses a **module-scoped singleton engine** (a generated `getSharedRuntime()` accessor; the SSE route and the command routes both use it when realtime is enabled).
- Documented constraint: requires a Node server runtime (e.g. `next start` / standalone), **single-instance deployments**. Serverless/multi-instance fan-out needs an external bus and is out of scope (interface stays transport-agnostic for that future).
- The earlier "serverless-safe" claim is withdrawn — it does not compose with in-memory pub/sub.

### Grammar / IR

- `realtime` parsed as a bare flag inside an entity block (contextual, same approach as feature 1 — not a global lexer keyword, avoiding collisions with `property realtime: ...`).
- `IREntity.realtime?: boolean` in `ir.ts` + schema.
- semantics.md states explicitly: `realtime` has **no runtime execution semantics** — it is a projection hint only. (Source-of-truth rule: if semantics.md is silent, implementers invent.)

### Runtime

- `subscribe(entityName, listener): () => void` — convenience over `onEvent`, delivering only events whose `subject.entity === entityName`. **Events without a subject entity are not delivered** (use `onEvent` for the firehose). Returns an unsubscribe function. Exists regardless of any entity's `realtime` flag.

### Projections

For entities with `realtime: true`:

- **Next.js**: SSE route surface (`app/api/<entity>/subscribe/route.ts`, `ReadableStream`-based, wired to the shared runtime accessor) + a `use<Entity>Subscription` React hook (EventSource, auto-reconnect with backoff, typed payloads).
- **Express**: equivalent SSE route handler surface (Express apps are long-lived by nature; same shared-engine requirement, trivially satisfied).
- Entities without `realtime` generate nothing new.

### Tests

- Conformance fixture `94-realtime-entity.manifest`: IR flag presence; non-realtime entities unaffected.
- Runtime tests: `subscribe` filtering, subject-less events dropped, unsubscribe stops delivery.
- Projection snapshot tests for the SSE route, shared-runtime accessor, and hook surfaces.

---

## Feature 4: Time-travel debugger (diagnostic UI only)

### Goal

Replayable execution history in the diagnostic UI. Strictly observational. **Zero runtime-engine changes** — the recorder is a UI-layer wrapper, which is what makes "never alters execution" trivially true rather than aspirational.

### Components

**`src/manifest/time-travel.ts` — `TimeTravelManager`**

- NOT middleware (the engine's middleware hooks are constructor-time only and lack a post-completion hook with outcome/state). Instead, the manager wraps command execution at the call site: `manager.execute(engine, entity, command, input, ctx)` invokes `engine.runCommand(...)` and records `{ seq, entity, command, input, runtimeContext, outcome, stateSnapshotAfter, emittedEvents }`. The RuntimePanel funnels all its command executions through this wrapper while recording is active — that IS the attach mechanism; no engine API changes.
- `runtimeContext` (user/tenant) is captured per entry so history is self-describing.
- Sequence numbers, never wall-clock. History is serializable/exportable as JSON. Bounded (default cap 500 entries, oldest evicted).
- **"Replay" is snapshot inspection only, not re-execution**: selecting a step renders that step's recorded snapshot **directly from the recorded JSON** in the panel's state inspector. No engine is reconstructed (the engine has no state-load API, and seeding via `createInstance` would re-run validation/encryption — exactly the alteration this feature forbids). The live engine is never touched. (Re-execution replay and engine reconstruction are out of scope.)

**`src/artifacts/TimeTravelPanel.tsx`**

- Timeline scrubber + step prev/next, state inspector per step, emitted-event list per step, export-history button.
- Integrated into the existing `RuntimePanel` as an optional panel; recording is active only while the panel is open (the funnel above checks a recording flag).

### Tests

- Unit tests for `TimeTravelManager`: recording fidelity (recorded snapshot deep-equals `getAllInstances` at that step), cap eviction, JSON round-trip (serialize → parse → identical history), and the no-alteration guarantee: executions through the wrapper vs direct `runCommand` produce identical results **with injected `now()`/`generateId`** (both already exist in `RuntimeOptions`; required because event timestamps are wall-clock).
- Panel smoke test consistent with existing artifact panel testing patterns.

---

## Cross-cutting rules

- **Spec-first order per feature**: semantics/builtins docs (+ schema where shapes change) → conformance fixtures → lexer/parser/ir-compiler/runtime → projections → UI.
- Every commit keeps `pnpm test`, `pnpm run typecheck`, `pnpm run lint` green. Conformance expected outputs regenerated via `pnpm run conformance:regen` only when fixture changes are intentional.
- UTF-8 without BOM for all JSON fixtures; no random IDs/timestamps in fixtures.
- **Danger-zone touches**: features 1–3 modify parser/ir-compiler/runtime-engine and the IR schema — each such commit states its justification and cites the conformance fixture that locks the behavior.
- **Automaker hygiene**: as each feature ships, its `.automaker/features/<id>/feature.json` gets a truthful summary replacing the hallucinated one; `docs/FEATURE-LIST.md` regenerated at the end.
- **Release**: single minor bump to v2.3.0 after all four features land.

## Out of scope

- `interval` range type (use two datetimes)
- Masking tokenization strategy (external service dependency)
- Masking enforcement in generated projection read routes (documented limitation; follow-up)
- WebSocket transport / multi-instance event fan-out (SSE + shared-engine ships first; interface left open)
- Re-execution-based time-travel replay (snapshot inspection only)
- Locale-aware date formatting (determinism violation)
