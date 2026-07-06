# Saga Orchestration

First-class `saga` declarations orchestrate multi-step distributed workflows with compensation (rollback) support. A saga declares a sequence of steps, each referencing an entity command and an optional compensating command. On step failure, the runtime either compensates completed steps in reverse order or aborts, based on the `on_failure` policy.

## DSL Syntax

```manifest
saga ProcessOrder {
  step chargePayment {
    command: Payment.charge
    compensate: Payment.refund
  }
  step reserveInventory {
    command: Inventory.reserve
    compensate: Inventory.release
  }
  step notifyCustomer {
    command: Notification.send
  }
  on_failure: "compensate"
  emit SagaStarted
  emit SagaCompleted
  emit SagaFailed
  emit SagaStepCompleted
}
```

A saga block is a top-level or module-level declaration. Each `step` has a `command` reference in `Entity.command` format and an optional `compensate` reference to the command that rolls back that step. The `on_failure` policy controls what happens when a step fails. Lifecycle events (`emit` entries) are opt-in.

## DSL Elements

- **`saga`** -- Reserved keyword. Opens a saga declaration block.
- **`step`** -- Not a reserved keyword. Matched context-sensitively by value inside the saga parser, so it can still be used as a property or variable name in other contexts.
- **`compensate`** -- Not a reserved keyword. Matched context-sensitively inside a step block.
- **`on_failure`** -- Accepts `"compensate"` (default) or `"abort"`. With `"compensate"`, completed steps are rolled back in reverse order. With `"abort"`, execution halts without compensation.
- **`emit`** -- Declares lifecycle events the saga should emit.

## Saga Lifecycle

1. **Start**: The first step's forward command is invoked, creating a saga execution record. If declared, `SagaStarted` is emitted.
2. **Execute forward**: Each step's `command` runs in sequence. After each successful step, `SagaStepCompleted` is emitted (if declared).
3. **On failure -- compensate**: If any forward command fails, and `on_failure` is `"compensate"`, the runtime runs each completed step's `compensate` command in reverse order. If `on_failure` is `"abort"`, no compensation runs.
4. **Complete or failed**: After all steps succeed, `SagaCompleted` is emitted. After a failure (and optional compensation), `SagaFailed` is emitted.

## Best-Effort Compensation

Compensation is best-effort. If a compensating command throws an error, the failure is recorded but does not halt the compensation process. All remaining compensations still execute in reverse order. This ensures partial rollback is attempted even when individual compensations fail.

The compensation order is strict reverse: if steps 1, 2, 3 completed and step 4 fails, compensation runs as step 3 compensate, step 2 compensate, step 1 compensate.

## Lifecycle Events

Events are only emitted when declared in the saga's `emit` array.

| Event | When emitted |
|-------|-------------|
| `SagaStarted` | Before the first step executes |
| `SagaStepCompleted` | After each successful step |
| `SagaCompleted` | After all steps succeed |
| `SagaFailed` | After a step fails (and optionally after compensation completes) |

Saga events carry `correlationId` and `causationId` for cross-service tracing.

## Runtime API

The runtime engine exposes saga execution through `runSaga`:

```typescript
const result = await runtime.runSaga('ProcessOrder', {
  chargePayment: { input: { amount: 100 }, instanceId: 'pay-1' },
  reserveInventory: { input: { quantity: 2 }, instanceId: 'inv-1' },
  notifyCustomer: { input: { email: 'user@example.com' } },
}, { correlationId: 'order-123' });
```

`SagaResult` contains:
- `saga: string` — Saga name
- `success: boolean` — Whether all steps completed
- `status: 'completed' | 'compensated' | 'aborted'`
- `steps: SagaStepResult[]` — Per-step forward/compensation results
- `failedStep?: string` — Name of the step that failed (if any)
- `error?: string` — Error message when saga cannot run
- `emittedEvents: EmittedEvent[]` — All events emitted during the saga

## IR Representation

```typescript
interface IRSaga {
  name: string;
  steps: IRSagaStep[];
  onFailure: 'compensate' | 'abort';
  emits?: string[];
  module?: string;
}

interface IRSagaStep {
  name: string;
  commandEntity: string;       // Entity on which the forward command is invoked
  command: string;             // "Entity.command" reference
  compensate?: string;         // Optional compensating command
  compensateEntity?: string;   // Optional: target entity for compensation when it differs from the forward step's entity
}
```

The IR root has an optional `sagas?: IRSaga[]` field. Modules record saga names in `sagas?: string[]`. The field is omitted when no sagas are declared, maintaining backward compatibility with existing IR consumers.

## Conformance Fixture

Conformance fixture `src/manifest/conformance/fixtures/88-saga-orchestration.manifest` exercises a complete saga with 3 entities, 5 commands, 9 events, and 1 saga declaration. Runtime tests in `src/manifest/runtime-saga.test.ts` cover:

1. Compilation through the full pipeline
2. Happy path execution (all steps succeed)
3. Lifecycle event emission
4. Command events from individual steps
5. Failure with compensation (step fails, completed steps compensated in reverse)
6. Abort mode (`on_failure: "abort"`)
7. Unknown saga rejection

## Notes

- `saga` is a reserved keyword. `step` and `compensate` are not reserved -- they are matched context-sensitively.
- Steps reference commands in `Entity.command` format. The referenced command must exist on the entity.
- The `on_failure` policy defaults to `"compensate"` when omitted.
- Steps without a `compensate` declaration are non-compensatable (fire-and-forget).
- Saga declarations are allowed at both program-level and module-level.
- The TypeScript code generator (`src/manifest/generator.ts`) emits `genSaga()` output for saga declarations.
