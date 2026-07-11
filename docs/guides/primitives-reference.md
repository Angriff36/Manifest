# Manifest Runtime Primitives Reference

Last updated: 2026-02-13
Status: Active
Authority: Advisory
Enforced by: None

Quick-reference for every runtime primitive. Use this to decide what to reach for.

---

## At a Glance

| Primitive                                  | One-Liner                                                                                       | Configured Where        | Scope                     |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------- | ------------------------- |
| [`correlationId`](#correlationid)          | Group events across a multi-step workflow                                                       | Per command call        | Per command               |
| [`causationId`](#causationid)              | Link a command to the event that triggered it                                                   | Per command call        | Per command               |
| [`emitIndex`](#emitindex)                  | Deterministic per-command event counter                                                         | Automatic               | Per command               |
| [`IdempotencyStore`](#idempotencystore)    | Prevent duplicate command execution                                                             | `RuntimeOptions`        | Per engine                |
| [`idempotencyKey`](#idempotencystore)      | Caller-supplied deduplication key                                                               | Per command call        | Per command               |
| [`deterministicMode`](#deterministicmode)  | Block all side-effect actions                                                                   | `RuntimeOptions`        | Per engine                |
| [`EvaluationLimits`](#evaluationlimits)    | Cap expression depth and step count                                                             | `RuntimeOptions`        | Per engine                |
| [`transition`](#state-transitions)         | Enforce allowed state changes on a property                                                     | IR / `.manifest` source | Per entity                |
| Constraint `severity`                      | [`ok`](#constraint-severity) / [`warn`](#constraint-severity) / [`block`](#constraint-severity) | IR / `.manifest` source | Per constraint            |
| [`overrideRequests`](#override-mechanism)  | Bypass a blocking constraint with authorization                                                 | Per command call        | Per command               |
| [`versionProperty`](#concurrency-controls) | Optimistic locking via version number                                                           | IR / `.manifest` source | Per entity                |
| [`guards`](#guards)                        | Boolean preconditions that halt on first failure                                                | IR / `.manifest` source | Per command               |
| [`policies`](#policies)                    | Authorization rules (read/write/execute)                                                        | IR / `.manifest` source | Per entity                |
| [`computed`](#computed-properties)         | Derived properties recalculated on access                                                       | IR / `.manifest` source | Per entity                |
| [`events`](#events)                        | Emit structured events after successful commands                                                | IR / `.manifest` source | Per command               |
| [emit payloads](#follow-on-emit-payloads)  | Declare follow-on event payload fields (`emit E { f: expr }`)                                   | IR / `.manifest` source | Per command               |
| [`reactions`](#reactions)                  | Auto-dispatch a command when an event is emitted (`on E run Entity.cmd`)                        | IR / `.manifest` source | Program / module / entity |
| [`fanOut`](#fan-out-reactions)             | 1:N cascade — dispatch a command on every matching child row                                    | IR / `.manifest` source | Reaction                  |
| [`count(...)`](#aggregate-count)           | Count child rows matching ANDed equality predicates                                             | IR / `.manifest` source | Reaction expression       |
| [`stores`](#stores)                        | Persistence target (memory, postgres, etc.)                                                     | IR / `.manifest` source | Per entity                |

---

## Workflow Metadata

### correlationId

|                 |                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **What**        | A caller-supplied string attached to all events emitted by a command. Groups related events across multiple commands in a workflow.    |
| **Configure**   | Pass in command options: `{ correlationId: 'event-prep-42' }`                                                                          |
| **Scope**       | Per command invocation. Not inherited across commands.                                                                                 |
| **Default**     | `undefined` — events have no correlationId unless supplied.                                                                            |
| **Use when**    | Multi-step workflows (event prep → inventory → stations), saga patterns, any flow where you need to reconstruct "what happened" later. |
| **Limitations** | Caller's responsibility to generate and propagate. No automatic correlation. No storage — callers must persist events themselves.      |
| **Spec**        | `docs/spec/manifest-vnext.md` § "Workflow Metadata"                                                                                    |
| **Example**     | `docs/guides/complex-workflows.md` § Pattern 1                                                                                         |

### causationId

|                 |                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **What**        | A caller-supplied string linking a command to the event or action that caused it. Builds a causal graph across commands. |
| **Configure**   | Pass in command options: `{ causationId: 'PrepTaskClaimed-task-1' }`                                                     |
| **Scope**       | Per command invocation.                                                                                                  |
| **Default**     | `undefined` — events have no causationId unless supplied.                                                                |
| **Use when**    | You need to trace _why_ something happened. E.g., inventory was consumed _because_ a prep task started.                  |
| **Limitations** | Caller must construct the causation chain. The runtime does not auto-link events to downstream commands.                 |
| **Spec**        | `docs/spec/manifest-vnext.md` § "Workflow Metadata"                                                                      |
| **Example**     | `docs/guides/complex-workflows.md` § Pattern 3                                                                           |

### emitIndex

|                 |                                                                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What**        | A zero-based counter attached to every emitted event. Resets to 0 at the start of each command. Deterministic: identical IR + input + context = identical emitIndex values. |
| **Configure**   | Automatic. Cannot be overridden.                                                                                                                                            |
| **Scope**       | Per command invocation.                                                                                                                                                     |
| **Default**     | Always present on every `EmittedEvent`.                                                                                                                                     |
| **Use when**    | Replay verification (compare expected vs actual emitIndex), event deduplication (use as part of idempotency key), ordering events within a command.                         |
| **Limitations** | Per-command only. Does NOT provide cross-command ordering. For global ordering, use timestamps or a sequence from your event store.                                         |
| **Spec**        | `docs/spec/manifest-vnext.md` § "Workflow Metadata"                                                                                                                         |
| **Example**     | `docs/guides/complex-workflows.md` § Pattern 4                                                                                                                              |

---

## Idempotency

### IdempotencyStore

|                 |                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What**        | An adapter that caches command results by key. Same key = cached result returned without re-execution. Both successes and failures are cached.                            |
| **Configure**   | `RuntimeOptions.idempotencyStore` — an object implementing `has(key)`, `get(key)`, `set(key, result)`.                                                                    |
| **Scope**       | Per engine instance.                                                                                                                                                      |
| **Default**     | No idempotency store — every call executes.                                                                                                                               |
| **Use when**    | User-initiated actions from unreliable clients (tablet double-tap), webhook retries, any operation where duplicate execution causes damage.                               |
| **Limitations** | When a store is configured, every command MUST include an `idempotencyKey` in options — omitting it returns an error. Cache has no built-in TTL; caller manages eviction. |
| **Spec**        | `docs/spec/manifest-vnext.md` § "Idempotency", `docs/spec/adapters.md` § "IdempotencyStore"                                                                               |
| **Example**     | `docs/guides/complex-workflows.md` § Pattern 2                                                                                                                            |

---

## Safety & Testing

### deterministicMode

|                 |                                                                                                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **What**        | When `true`, `persist`, `publish`, and `effect` action kinds throw `ManifestEffectBoundaryError` instead of executing. Guarantees no side effects leak through.                                                                            |
| **Configure**   | `RuntimeOptions.deterministicMode: true`                                                                                                                                                                                                   |
| **Scope**       | Per engine instance.                                                                                                                                                                                                                       |
| **Default**     | `false` — side-effect actions run: `persist` flushes the working-copy buffer, `publish` requires `outboxStore` (else fails closed `MISSING_OUTBOX_STORE`), `effect` requires `effectHandler` (else fails closed `MISSING_EFFECT_HANDLER`). |
| **Use when**    | Replay verification, conformance testing, unit testing where you want to prove no side effects.                                                                                                                                            |
| **Limitations** | Throws a hard error (not a `CommandResult` failure) because effect boundary violations are programming mistakes. Callers must catch `ManifestEffectBoundaryError` if they expect it.                                                       |
| **Spec**        | `docs/spec/manifest-vnext.md` § "Effect Boundary Enforcement", `docs/spec/adapters.md` § "Deterministic Mode"                                                                                                                              |
| **Example**     | `docs/guides/complex-workflows.md` § Pattern 4                                                                                                                                                                                             |

### EvaluationLimits

|                 |                                                                                                                                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What**        | Caps expression evaluation depth and total steps to prevent stack overflow or CPU exhaustion from malformed/adversarial IR.                                                                                                         |
| **Configure**   | `RuntimeOptions.evaluationLimits: { maxExpressionDepth: 64, maxEvaluationSteps: 10_000 }`                                                                                                                                           |
| **Scope**       | Per engine instance. Budget resets per top-level entry point call.                                                                                                                                                                  |
| **Default**     | 64 depth, 10,000 steps. Permissive enough for any legitimate program.                                                                                                                                                               |
| **Use when**    | Running user-supplied or AI-generated Manifest programs. Tighter limits for user-facing (fast failure), looser for batch/admin.                                                                                                     |
| **Limitations** | Inside `runCommand`, budget exceeded → `CommandResult` failure (safe). From `checkConstraints`/`evaluateComputed`/`createInstance`/`updateInstance`, budget exceeded → thrown `EvaluationBudgetExceededError` (callers must catch). |
| **Spec**        | `docs/spec/manifest-vnext.md` § "Diagnostic Payload Bounding"                                                                                                                                                                       |
| **Example**     | `docs/guides/complex-workflows.md` § Pattern 6                                                                                                                                                                                      |

**Error behavior by entry point:**

| Entry Point        | Budget Exceeded Behavior                                               |
| ------------------ | ---------------------------------------------------------------------- |
| `runCommand`       | Returns `{ success: false, error: "Evaluation budget exceeded: ..." }` |
| `checkConstraints` | Throws `EvaluationBudgetExceededError`                                 |
| `createInstance`   | Throws `EvaluationBudgetExceededError`                                 |
| `updateInstance`   | Throws `EvaluationBudgetExceededError`                                 |
| `evaluateComputed` | Throws `EvaluationBudgetExceededError`                                 |

---

## State & Validation

### State Transitions

|                 |                                                                                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What**        | Declares allowed state changes for a property. The runtime rejects any mutation not in the allowed list. Replaces manual guard chains for state machines.                                                   |
| **Configure**   | In `.manifest` source: `transition status from "open" to ["claimed", "cancelled"]`                                                                                                                          |
| **Scope**       | Per entity property.                                                                                                                                                                                        |
| **Default**     | No transitions declared → property is unconstrained (any value change allowed).                                                                                                                             |
| **Use when**    | Status fields with a defined state machine (prep tasks, proposals, purchase orders).                                                                                                                        |
| **Limitations** | Validation happens BEFORE constraint evaluation. If no rule matches the current value, the transition is unconstrained from that state. Only works on properties explicitly referenced in transition rules. |
| **Spec**        | `docs/spec/manifest-vnext.md` § "State Transitions"                                                                                                                                                         |
| **Example**     | `docs/guides/complex-workflows.md` § Pattern 2                                                                                                                                                              |

**PrepTask state machine:**

```
open ──→ claimed ──→ in_progress ──→ done
  │         │            │
  ↓         ↓            ↓
cancelled  open         open
```

### Constraint Severity

Three levels, evaluated during command execution:

| Severity | Blocks Execution?       | Overrideable?           | Use For                                                                                                                                                                                                                    |
| -------- | ----------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ok`     | Never                   | No                      | Informational logging. The runtime forces `passed = true` regardless of expression result — an `ok` constraint never appears as a failure. The expression is still evaluated for observability (details, resolved values). |
| `warn`   | Never                   | No                      | Non-blocking alerts. UI shows yellow warning, operator sees it, proceeds.                                                                                                                                                  |
| `block`  | Yes (unless overridden) | If `overrideable: true` | Hard stops. Inventory stockout, capacity exceeded, invalid data.                                                                                                                                                           |

|                 |                                                                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Configure**   | In `.manifest` source: `constraint warnBelowPar:warn self.quantityAvailable - quantity < self.parLevel "..."`                                                               |
| **Scope**       | Per constraint on an entity or command.                                                                                                                                     |
| **Default**     | `block` if severity not specified.                                                                                                                                          |
| **Use when**    | You need graduated responses to rule violations instead of binary pass/fail.                                                                                                |
| **Limitations** | `ok` constraints never block — even when the expression evaluates to false. `warn` constraints produce outcomes but never halt. Only `block` constraints can be overridden. |
| **Spec**        | `docs/spec/manifest-vnext.md` § "Constraint Blocks"                                                                                                                         |
| **Example**     | `docs/guides/complex-workflows.md` § Pattern 5                                                                                                                              |

### Override Mechanism

|                 |                                                                                                                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What**        | Allows authorized bypass of `block` constraints. Produces an `OverrideApplied` audit event on the `system` channel.                                                                                                                                  |
| **Configure**   | Per command call: `{ overrideRequests: [{ constraintCode: 'blockStockout', reason: '...', authorizedBy: 'manager-jane' }] }`                                                                                                                         |
| **Scope**       | Per command invocation.                                                                                                                                                                                                                              |
| **Default**     | No overrides — blocking constraints halt execution.                                                                                                                                                                                                  |
| **Use when**    | Manager approval workflows. Emergency overrides with audit trail.                                                                                                                                                                                    |
| **Limitations** | Only works on constraints marked `overrideable: true` in the IR. If the constraint has an `overridePolicyRef`, that policy must also pass. Override attempts against non-overrideable constraints are silently rejected (constraint failure stands). |
| **Spec**        | `docs/spec/manifest-vnext.md` § "Override Mechanism"                                                                                                                                                                                                 |
| **Example**     | `docs/guides/complex-workflows.md` § Pattern 5                                                                                                                                                                                                       |

### Concurrency Controls

|                 |                                                                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What**        | Optimistic locking. Entity declares a version property that auto-increments on update. Callers provide expected version; mismatch returns `ConcurrencyConflict`. |
| **Configure**   | In IR: `versionProperty` (numeric field) and optional `versionAtProperty` (timestamp field) on entity.                                                           |
| **Scope**       | Per entity.                                                                                                                                                      |
| **Default**     | No concurrency controls — last write wins.                                                                                                                       |
| **Use when**    | Multiple users editing the same entity (recipe versions, event budgets, inventory adjustments).                                                                  |
| **Limitations** | Requires caller to supply expected version. No automatic retry — callers handle conflict resolution. Conflict detection only, not conflict resolution.           |
| **Spec**        | `docs/spec/manifest-vnext.md` § "Concurrency Controls"                                                                                                           |

---

## Core Language Primitives

### Guards

|                 |                                                                                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What**        | Boolean preconditions on commands. Evaluated in declaration order. Execution halts on first falsey guard.                                                                                                   |
| **Configure**   | In `.manifest` source: `guard self.status == "open"`                                                                                                                                                        |
| **Scope**       | Per command.                                                                                                                                                                                                |
| **Default**     | No guards → command always proceeds to actions.                                                                                                                                                             |
| **Use when**    | Preconditions that must be true before a command can run.                                                                                                                                                   |
| **Limitations** | No auto-repair, fallback, or permissive defaults. First failure stops — remaining guards are not evaluated. Guards can only reference spec-guaranteed bindings (`self.*`, `this.*`, `user.*`, `context.*`). |
| **Spec**        | `docs/spec/semantics.md` § "Commands"                                                                                                                                                                       |

### Policies

|                 |                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What**        | Authorization rules evaluated before guards. Control who can read/write/execute.                                                                                                                                                                                                                                                                                                                                                        |
| **Configure**   | In `.manifest` source: `policy CanExecute execute: user.role == "admin" "..."`                                                                                                                                                                                                                                                                                                                                                          |
| **Scope**       | Per entity.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Default**     | No policies → all operations permitted.                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Use when**    | Role-based access control, tenant isolation at the rule layer.                                                                                                                                                                                                                                                                                                                                                                          |
| **Limitations** | For `execute`/`all` policies at command time: rate-limit is checked first, then policies, then command-level constraints, then guards; a denied policy returns immediately. `read`/`all` policies are ALSO enforced at the runtime read gate (`getInstance`/`getAllInstances`): a denied read fails closed (`undefined` / row omitted), evaluated per row for `self.*` policies. `write`/`delete` scopes are not enforced on the store. |
| **Spec**        | `docs/spec/semantics.md` § "Commands", § "Policies"                                                                                                                                                                                                                                                                                                                                                                                     |

### Computed Properties

|                 |                                                                                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What**        | Derived properties recalculated from other properties. Spreadsheet-like: change a source value, computed values update.                                                            |
| **Configure**   | In `.manifest` source: `computed isOverdue = self.dueByDate != null and now() > self.dueByDate`                                                                                    |
| **Scope**       | Per entity.                                                                                                                                                                        |
| **Default**     | N/A — must be explicitly declared.                                                                                                                                                 |
| **Use when**    | Derived flags (isOverdue, isBelowPar, percentComplete), calculated costs, any value computable from other entity properties.                                                       |
| **Limitations** | Cannot reference other entities (single-entity scope). Cycle detection exists for computed→computed dependencies but not for arbitrary expressions. Subject to `EvaluationLimits`. |
| **Spec**        | `docs/spec/semantics.md`                                                                                                                                                           |

### Events

|                 |                                                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What**        | Structured messages emitted after successful command execution. Carry workflow metadata (emitIndex, correlationId, causationId).                                                                                    |
| **Configure**   | In `.manifest` source: `emit PrepTaskClaimed`                                                                                                                                                                       |
| **Scope**       | Per command.                                                                                                                                                                                                        |
| **Default**     | No events emitted unless declared.                                                                                                                                                                                  |
| **Use when**    | Real-time updates (Ably), async side effects (BullMQ), audit trails (outbox), webhook delivery.                                                                                                                     |
| **Limitations** | Events are emitted in declaration order, only after successful execution. If a guard or constraint fails, no events fire. Event handlers run synchronously during `runCommand` — dispatch to queues for async work. |
| **Spec**        | `docs/spec/semantics.md` § "Events", `docs/spec/manifest-vnext.md` § "Workflow Metadata"                                                                                                                            |
| **Example**     | `docs/guides/event-wiring.md`                                                                                                                                                                                       |

### Follow-on emit payloads

|                 |                                                                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **What**        | Explicitly-declared payload fields on an `emit`, computed at emit time and merged into the event's `payload`. Lets a follow-on reaction read real values via `payload.<field>` instead of `undefined`. |
| **Configure**   | In `.manifest` source: `emit ScheduleShiftCreated { scheduleId: self.scheduleId }`                                                                                                                     |
| **Scope**       | Per command (recorded on the command's `emitPayloads` in the IR).                                                                                                                                      |
| **Default**     | No declared fields — the event carries only the command input plus the last action result.                                                                                                             |
| **Use when**    | A reaction downstream of the event needs a value the default payload does not surface (a foreign key, a derived total). Replaces hand-written after-emit middleware that re-derived the value.         |
| **Limitations** | Each field is `name: <expr>` evaluated in the emitting command's context (`self.*`, command inputs). No cross-entity reads.                                                                            |
| **Spec**        | `docs/spec/semantics.md` § "Events"                                                                                                                                                                    |
| **Example**     | `src/manifest/conformance/fixtures/97-aggregate-count-reaction.manifest`                                                                                                                               |

---

## Reactions

Reactions connect events to commands declaratively: when an event is emitted, the runtime evaluates matching reactions in declaration order and dispatches the target command. Full reference: `mintlify/language/reactions.mdx` and `docs/features/event-reactions.md`.

### Reactions

|                 |                                                                                                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What**        | Auto-dispatch a command when a matching event is emitted. `resolve` finds the target instance; `params` maps payload fields into command arguments.                                                                  |
| **Configure**   | In `.manifest` source: `on OrderCompleted run Invoice.createFromOrder` + optional `resolve` / `params` blocks.                                                                                                       |
| **Scope**       | Program-level, module-level, or entity-level (targets the entity's own commands).                                                                                                                                    |
| **Default**     | No reactions — events fire but trigger no commands unless wired (declaratively here, or host-side via `runtime.onEvent`).                                                                                            |
| **Use when**    | Reactive workflows: an order completes → create an invoice → prepare shipment, without manual event handlers.                                                                                                        |
| **Limitations** | Reactions run synchronously within the same command turn. Cascading depth is capped at `MAX_REACTION_DEPTH = 10` (`ManifestReactionDepthError`). A reaction with no matching `resolve` instance is skipped silently. |
| **Spec**        | `docs/spec/semantics.md` § "Events", `docs/features/event-reactions.md`                                                                                                                                              |
| **Example**     | `src/manifest/conformance/fixtures/67-event-reactions.manifest`                                                                                                                                                      |

### Fan-out reactions

|                 |                                                                                                                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What**        | A 1:N cascade. Instead of resolving one instance, `fanOut` dispatches the target command on **every** target row matching a foreign-key predicate.                                                                                      |
| **Configure**   | In `.manifest` source: `on ParentDeactivated fanOut Child where parentId = self.id run deactivate` (optional shared `params`).                                                                                                          |
| **Scope**       | Per reaction. The match `where <field> = <sourceExpr>` selects the collection; `<sourceExpr>` reads the event payload (`self.*` / `payload.*`).                                                                                         |
| **Default**     | N/A — opt-in via the `fanOut` keyword.                                                                                                                                                                                                  |
| **Use when**    | "Do X to all children": cancel every line item, release every reservation, deactivate every child account. Replaces "query children by FK, loop, dispatch" middleware.                                                                  |
| **Limitations** | Each match runs the full command pipeline (guards/policies/actions/emits). Depth limit and `correlationId`/`causationId` apply per dispatched command. The Convex projection reads via `withIndex` on the FK, falling back to a filter. |
| **Spec**        | `docs/features/event-reactions.md`                                                                                                                                                                                                      |
| **Example**     | `src/manifest/conformance/fixtures/96-fanout-reaction.manifest`                                                                                                                                                                         |

### Aggregate count

|                 |                                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What**        | An expression — `count(Entity where field == value, ...)` — that counts rows matching every ANDed equality predicate. Typically a reaction param that recomputes a stored child count on a parent.                                                                                                                                                                        |
| **Configure**   | In `.manifest` source, inside a reaction `params`: `shiftCount: count(ScheduleShift where scheduleId == self.scheduleId, status == "active")`                                                                                                                                                                                                                             |
| **Scope**       | Reaction expression. Predicate values resolve against the event payload (`self.*` / `payload.*`).                                                                                                                                                                                                                                                                         |
| **Default**     | N/A — explicit.                                                                                                                                                                                                                                                                                                                                                           |
| **Use when**    | Per-parent recompute after a child event: "how many shifts does this schedule have now?" Replaces "count children where FK == parent, then patch parent" middleware.                                                                                                                                                                                                      |
| **Limitations** | Pure equality predicates only, ANDed; at least one (the FK match) required. No group-by, joins, multi-hop, or arbitrary SQL. Does **not** cover tenant-wide reconcile or dual-target moves. `count` is contextual, not reserved. Runtime scans the collection (deterministic); Convex reads via the FK's `by_<field>` index + tenant/soft-delete filters, then `.length`. |
| **Spec**        | `docs/features/event-reactions.md`                                                                                                                                                                                                                                                                                                                                        |
| **Example**     | `src/manifest/conformance/fixtures/97-aggregate-count-reaction.manifest`                                                                                                                                                                                                                                                                                                  |

---

### Stores

|                 |                                                                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What**        | Persistence target for entity state. The runtime reads/writes entity data through the store adapter.                                                                                                 |
| **Configure**   | In `.manifest` source: `store PrepTask in memory` or `store PrepTask in postgres`. Adapter provided via `RuntimeOptions.storeProvider`.                                                              |
| **Scope**       | Per entity.                                                                                                                                                                                          |
| **Default**     | In-memory store (data lost on engine disposal).                                                                                                                                                      |
| **Use when**    | Always — every entity needs a store. Use `memory` for tests, custom `PrismaStore` adapters for production.                                                                                           |
| **Limitations** | Store adapters must implement `getAll`, `getById`, `create`, `update`, `delete`, and `clear`. The runtime does not manage database transactions — wrap in `prisma.$transaction` at the caller level. |
| **Spec**        | `docs/spec/adapters.md` § "Store Adapters"                                                                                                                                                           |
| **Example**     | `docs/guides/implementing-custom-stores.md`                                                                                                                                                          |

---

## Command Execution Order

Every `runCommand` call follows this fixed order. No primitive changes it:

```
1. Tenant gate             → MISSING_TENANT_CONTEXT when required and absent
2. Idempotency check       → cached result returned if key exists (when configured)
3. Rate-limit check        → RATE_LIMIT_EXCEEDED before any domain logic
4. Policies                → authorization (deny = immediate failure)
5. Command constraints     → severity-based (block = failure unless overridden)
6. Guards                  → preconditions (first false = failure)
7. Actions                 → mutations (transition validation during mutate), effects
8. Events                  → emitted in declaration order
9. Return CommandResult
```

Budget tracking (`EvaluationLimits`) wraps the entire flow. If any expression evaluation exceeds the budget during steps 2–7, the command fails.

---

## Decision Guide

**"I need to..."** → **Use this:**

| Need                                            | Primitive                                 |
| ----------------------------------------------- | ----------------------------------------- |
| Trace a multi-step workflow                     | `correlationId`                           |
| Know why a command was triggered                | `causationId`                             |
| Verify replay produces identical events         | `emitIndex` + `deterministicMode`         |
| Prevent double-execution from retries           | `IdempotencyStore` + `idempotencyKey`     |
| Enforce a status state machine                  | `transition`                              |
| Warn without blocking                           | Constraint with `severity: warn`          |
| Let a manager bypass a rule                     | `overrideRequests` + `overrideable: true` |
| Prevent concurrent edit conflicts               | `versionProperty`                         |
| Protect against runaway expressions             | `EvaluationLimits`                        |
| Block side effects in tests                     | `deterministicMode: true`                 |
| Run a command automatically when an event fires | `reactions` (`on E run Entity.cmd`)       |
| Pass a value to a follow-on reaction            | emit payload (`emit E { field: expr }`)   |
| Do something to every child row                 | `fanOut` reaction                         |
| Recompute a stored child count on a parent      | `count(...)` reaction param               |

---

## Related Documentation

- **Spec (normative)**: `docs/spec/semantics.md`, `docs/spec/manifest-vnext.md`, `docs/spec/adapters.md`
- **Patterns (advisory)**: `docs/guides/complex-workflows.md`, `docs/guides/event-wiring.md`
- **Stores**: `docs/guides/implementing-custom-stores.md`
- **Compliance**: `docs/COMPLIANCE_MATRIX.md`
