# Event Reactions and Subscriptions

## Summary

Declarative event reactions allow commands to be automatically dispatched when specific events are emitted. The `on <Event> run <Entity>.<command>` syntax creates reactive workflows without manual event wiring.

## DSL Syntax

From conformance fixture `67-event-reactions.manifest`:

```manifest
entity Order {
  property required id: string
  property total: number = 0
  property status: string = "open"

  command complete() {
    guard self.total > 0
    mutate status = "completed"
    emit OrderCompleted
  }
}

entity Invoice {
  property required id: string
  property orderId: string = ""
  property amount: number = 0
  belongsTo order: Order

  command createFromOrder(orderId: string, amount: number) {
    mutate orderId = orderId
    mutate amount = amount
  }
}

event OrderCompleted: "order.completed" {
  orderId: string
  finalTotal: number
}

on OrderCompleted run Invoice.createFromOrder
  resolve payload._subject.id
  params {
    orderId: payload._subject.id,
    amount: payload.result
  }
```

Reaction handlers receive `payload` (enriched event payload) and `self` (alias of payload) in resolve/params expressions — not a separate `event` binding.

## Follow-on emit payloads

By default an emitted event carries the command's input plus the last action result. To pass additional values down a reaction chain, declare them with an `emit Event { field: expr }` block — the fields are computed at emit time and merged into `payload`, so a follow-on reaction reading `payload.<field>` resolves real values instead of `undefined`.

From fixture `97-aggregate-count-reaction.manifest`:

```manifest
command assign(scheduleId: string) {
  mutate scheduleId = scheduleId
  emit ScheduleShiftCreated { scheduleId: self.scheduleId }
}
```

Each field is `name: <expr>`, evaluated in the emitting command's context (`self.*`, command inputs). The IR records these on the command as `emitPayloads` (`{ eventName, fields }`).

## Fan-out reactions (1:N cascade)

A single-target reaction dispatches on ONE resolved instance. The `fanOut` form dispatches a command on **every** target row matching a foreign-key predicate — the declarative replacement for "query children by FK, loop, dispatch" middleware (cancel every line item, release every reservation, deactivate every child).

From fixture `96-fanout-reaction.manifest`:

```manifest fragment
on ParentDeactivated fanOut Child where parentId = self.id
  run deactivate
```

- `fanOut <Target> where <field> = <sourceExpr>` selects the collection — `<field>` is a property on the target entity (foreign key preferred), `<sourceExpr>` is evaluated against the event payload (`self.*` / `payload.*`).
- `run <command>` names the target command (no `Entity.` prefix — the target entity is already given). An optional shared `params { ... }` block applies to every match.
- Each match runs the target command through the full pipeline (guards, policies, actions, emits). The reaction depth limit and `correlationId`/`causationId` propagation apply per dispatched command.
- The Convex projection reads matching rows via `withIndex` on the FK and dispatches each through the generated target mutation.

## Aggregate count expressions

`count(<Entity> where <field> == <value>, ...)` counts rows of `<Entity>` matching every ANDed **equality** predicate. It is an expression, so it can appear anywhere a reaction param value does — typically to recompute a stored child count on a parent after a child event.

From fixture `97-aggregate-count-reaction.manifest`:

```manifest fragment
on ScheduleShiftCreated run Schedule.syncShiftCount
  resolve self.scheduleId
  params {
    shiftCount: count(ScheduleShift where scheduleId == self.scheduleId, status == "active")
  }
```

- Predicate values are expressions resolved against the reaction's event payload (`self.*` / `payload.*`), like any param. Predicates are pure equality, ANDed.
- At least one predicate (the foreign-key match) is required. `count` is a contextual operator, not a reserved word — it is recognized only in the `count(<Entity> where ...)` shape, so a property may still be named `count`.
- Scope is deliberately narrow: count only — no group-by, joins, multi-hop traversal, or arbitrary SQL.
- The runtime scans the collection (deterministic). The Convex projection reads via the FK predicate's `by_<field>` index, applies remaining predicates plus tenant/soft-delete filters, and binds `.length`.

## IR Schema Changes

- `IRReactionRule`: event (string), targetEntity (string), targetCommand (string), resolve (IRExpression), params (IRReactionParam[]), optional module/entity scope
- `IR.reactions`: array of IRReactionRule
- `IRModule.reactions`: module-scoped reactions

## Runtime Behavior

1. After a command emits events, the runtime evaluates matching reactions in declaration order
2. For each reaction, the `resolve` expression identifies the target entity instance
3. Parameter mappings extract values from the event payload
4. The target command is invoked with the resolved parameters
5. Cascading depth limit prevents infinite reaction loops
6. `correlationId` and `causationId` propagate through reaction chains

## Scopes

- **Program-level**: `on Event run Entity.command` at the top level
- **Module-level**: inside a `module` block
- **Entity-level**: inside an `entity` block, targeting the entity's own commands

## Conformance Fixtures

- `67-event-reactions.manifest` — `OrderCompleted` triggering `Invoice.createFromOrder`
- `96-fanout-reaction.manifest` — `ParentDeactivated` fanning out to `Child.deactivate`
- `97-aggregate-count-reaction.manifest` — `count(...)` recomputing a parent's child count, plus an `emit Event { field: expr }` payload

## Test Coverage

Tests in `src/manifest/runtime-engine.test.ts` and conformance fixtures covering reaction execution, resolve expressions, param mapping, and depth limiting.
