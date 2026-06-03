# Event Reactions and Subscriptions

## Summary

Declarative event reactions allow commands to be automatically dispatched when specific events are emitted. The `on <Event> run <Entity>.<command>` syntax creates reactive workflows without manual event wiring.

## DSL Syntax

```manifest
event OrderSubmitted: "order.submitted" {
  orderId: string
  amount: number
}

entity OrderProcessor {
  property required id: string

  command processOrder(orderId: string, amount: number) {
    guard amount > 0
    mutate status = "processing"
    emit OrderProcessing
  }
}

on OrderSubmitted run OrderProcessor.processOrder
  resolve self.id == "processor-1"
  params {
    orderId: event.orderId
    amount: event.amount
  }
```

## IR Schema Changes

- `IRReactionRule`: event (string), targetEntity (string), targetCommand (string), resolve (IRExpression), params (IRReactionParam[]), optional module/entity scope
- `IRRoot.reactions`: array of IRReactionRule
- `IRModule.reactions`: module-scoped reactions

## Runtime Behavior

1. After a command emits events, the runtime evaluates matching reactions in declaration order
2. For each reaction, the `resolve` expression identifies the target entity instance
3. Parameter mappings extract values from the event payload
4. The target command is invoked with the resolved parameters
5. Cascading depth limit: `MAX_REACTION_DEPTH=10` prevents infinite reaction loops
6. `correlationId` and `causationId` propagate through reaction chains

## Scopes

- **Program-level**: `on Event run Entity.command` at the top level
- **Module-level**: inside a `module` block
- **Entity-level**: inside an `entity` block, targeting the entity's own commands

## Conformance Fixtures

- `67-event-reactions.manifest` — OrderSubmitted triggering processOrder

## Test Coverage

Tests in `src/manifest/runtime-engine.test.ts` and conformance fixture covering reaction execution, resolve expressions, param mapping, and depth limiting.
