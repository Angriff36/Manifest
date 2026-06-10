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

## Test Coverage

Tests in `src/manifest/runtime-engine.test.ts` and conformance fixtures covering reaction execution, resolve expressions, param mapping, and depth limiting.
