---
title: 'Runtime Engine API'
description: 'Constructor options, methods, return types, and import paths for the public runtime surface.'
---

> **AUTO-GENERATED REFERENCE.** This file in `docs/codedocs/` is a
> code-derived reference snapshot of repository structure and signatures.
> It is intended for tooling (Context7, search indexers, etc.) and is
> NOT verified prose on every regeneration. For normative, hand-curated
> documentation see [`docs/spec/`](../../../spec/) — in particular
> [`docs/spec/manifest-vnext.md`](../../../spec/manifest-vnext.md) for language
> semantics and [`docs/spec/config/manifest.config.md`](../../../spec/config/manifest.config.md)
> for projection configuration. Projections are described here as
> **tooling, not language semantics** — they consume IR and emit
> artifacts; they do not redefine policy/guard/constraint behaviour.

Import path:

```ts
import {
  RuntimeEngine,
  ManifestEffectBoundaryError,
  EvaluationBudgetExceededError,
} from '@angriff36/manifest';

import type {
  RuntimeContext,
  RuntimeOptions,
  CommandResult,
  EmittedEvent,
  Store,
  IdempotencyStore,
  ProvenanceVerificationResult,
} from '@angriff36/manifest';
```

Source file: `src/manifest/runtime-engine.ts`

## Constructor

```ts
new RuntimeEngine(
  ir: IR,
  context: RuntimeContext = {},
  options: RuntimeOptions = {}
)
```

### `RuntimeContext`

| Field           | Type                                                    | Default | Description                                                                |
| --------------- | ------------------------------------------------------- | ------- | -------------------------------------------------------------------------- |
| `tenantId`      | `string`                                                | —       | Active tenant identifier. Required when `requireTenantContext` is enabled. |
| `orgId`         | `string`                                                | —       | Optional organization identifier for auth integrations.                    |
| `actorId`       | `string`                                                | —       | Acting user or service principal id.                                       |
| `requestId`     | `string`                                                | —       | Correlates logs and emitted diagnostics.                                   |
| `source`        | `string`                                                | —       | Origin surface such as `route`, `job`, `cli`, or `workflow`.               |
| `deterministic` | `boolean`                                               | `false` | Ambient deterministic hint. `options.deterministicMode` takes precedence.  |
| `user`          | `{ id: string; role?: string; [key: string]: unknown }` | —       | Legacy auth object still used by guards and policies.                      |

### `RuntimeOptions`

| Option                   | Type                                         | Default                                                 | Description                                                   |
| ------------------------ | -------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| `generateId`             | `() => string`                               | `crypto.randomUUID`                                     | Generates entity ids and runtime record ids.                  |
| `now`                    | `() => number`                               | `Date.now`                                              | Supplies timestamps for events, audit, and outbox.            |
| `requireValidProvenance` | `boolean`                                    | `true` in production, otherwise `false`                 | Enables IR hash verification before execution.                |
| `expectedIRHash`         | `string`                                     | IR self hash                                            | Optional explicit hash target for provenance verification.    |
| `storeProvider`          | `(entityName: string) => Store \| undefined` | —                                                       | Supplies custom per-entity stores.                            |
| `idempotencyStore`       | `IdempotencyStore`                           | —                                                       | Caches command results by caller-supplied idempotency key.    |
| `deterministicMode`      | `boolean`                                    | `false`                                                 | Throws on adapter actions `persist`, `publish`, and `effect`. |
| `evaluationLimits`       | `EvaluationLimits`                           | `{ maxExpressionDepth: 64, maxEvaluationSteps: 10000 }` | Caps recursive or expensive expression evaluation.            |
| `requireTenantContext`   | `boolean`                                    | `false`                                                 | Fails closed when `context.tenantId` is missing.              |
| `auditSink`              | `AuditSink`                                  | —                                                       | Emits one `AuditRecord` per `runCommand()` invocation.        |
| `outboxStore`            | `OutboxStore`                                | —                                                       | Persists emitted events after successful commands.            |

## Public Methods

### Runtime metadata and context

```ts
getIR(): IR
getProvenance(): IRProvenance | undefined
logProvenance(): void
verifyIRHash(expectedHash?: string): Promise<boolean>
assertValidProvenance(): Promise<void>
getContext(): RuntimeContext
setContext(ctx: Partial<RuntimeContext>): void
replaceContext(ctx: RuntimeContext): void
```

Example:

```ts
const [runtime, verification] = await RuntimeEngine.create(ir, { actorId: 'u1' });

if (!verification.valid) {
  throw new Error(verification.error);
}

runtime.setContext({ requestId: 'req-1' });
console.log(runtime.getProvenance());
```

### IR inspection helpers

```ts
getEntities(): IREntity[]
getEntity(name: string): IREntity | undefined
getCommands(): IRCommand[]
getCommand(name: string, entityName?: string): IRCommand | undefined
getPolicies(): IRPolicy[]
getStore(entityName: string): Store | undefined
```

These helpers read from the loaded IR and the initialized store map. They are useful for diagnostics, custom admin tooling, and projection-like integration code.

### State management

```ts
getAllInstances(entityName: string): Promise<EntityInstance[]>
getInstance(entityName: string, id: string): Promise<EntityInstance | undefined>
checkConstraints(entityName: string, data: Record<string, unknown>): Promise<ConstraintOutcome[]>
createInstance(entityName: string, data: Partial<EntityInstance>): Promise<EntityInstance | undefined>
updateInstance(entityName: string, id: string, data: Partial<EntityInstance>): Promise<EntityInstance | undefined>
deleteInstance(entityName: string, id: string): Promise<boolean>
```

Example:

```ts
await runtime.createInstance('Account', { id: 'acct-1', status: 'open' });
await runtime.updateInstance('Account', 'acct-1', { status: 'closed' });

const account = await runtime.getInstance('Account', 'acct-1');
const constraintFailures = await runtime.checkConstraints('Account', account!);
```

### Command execution and expressions

```ts
runCommand(
  commandName: string,
  input: Record<string, unknown>,
  options?: {
    entityName?: string;
    instanceId?: string;
    overrideRequests?: OverrideRequest[];
    correlationId?: string;
    causationId?: string;
    idempotencyKey?: string;
  }
): Promise<CommandResult>

evaluateExpression(expr: IRExpression, context: Record<string, unknown>): Promise<unknown>
evaluateComputed(entityName: string, instanceId: string, propertyName: string): Promise<unknown>
```

`runCommand()` is the load-bearing method. It returns:

```ts
export interface CommandResult {
  success: boolean;
  result?: unknown;
  error?: string;
  deniedBy?: string;
  guardFailure?: GuardFailure;
  policyDenial?: PolicyDenial;
  constraintOutcomes?: ConstraintOutcome[];
  overrideRequests?: OverrideRequest[];
  concurrencyConflict?: ConcurrencyConflict;
  correlationId?: string;
  causationId?: string;
  emittedEvents: EmittedEvent[];
}
```

Example:

```ts
const result = await runtime.runCommand(
  'publish',
  {},
  {
    entityName: 'Article',
    instanceId: 'article-1',
    idempotencyKey: 'article-1:publish',
  },
);

if (!result.success) {
  console.error(result.policyDenial ?? result.guardFailure ?? result.error);
}
```

### Events and snapshots

```ts
onEvent(listener: (event: EmittedEvent) => void): () => void
getEventLog(): EmittedEvent[]
clearEventLog(): void
serialize(): Promise<{ ir: IR; context: RuntimeContext; stores: Record<string, EntityInstance[]> }>
restore(data: { stores: Record<string, EntityInstance[]> }): Promise<void>
```

Example:

```ts
const unsubscribe = runtime.onEvent((event) => {
  console.log(event.name, event.channel);
});

const snapshot = await runtime.serialize();
runtime.clearEventLog();
await runtime.restore(snapshot);
unsubscribe();
```

### Static factory

```ts
static create(
  ir: IR,
  context: RuntimeContext = {},
  options: RuntimeOptions = {}
): Promise<[RuntimeEngine, ProvenanceVerificationResult]>
```

Use this when you want startup-time provenance verification with the same defaults as the runtime source.

## Exported Supporting Types

The root module also exports:

```ts
interface Store<T extends EntityInstance = EntityInstance> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | undefined>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T | undefined>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<void>;
}

interface IdempotencyStore {
  has(key: string): Promise<boolean>;
  set(key: string, result: CommandResult): Promise<void>;
  get(key: string): Promise<CommandResult | undefined>;
}
```

Error classes:

```ts
new ManifestEffectBoundaryError(actionKind: string)
new EvaluationBudgetExceededError(limitType: 'depth' | 'steps', limit: number)
```

In practice, you combine these root exports with `compileToIR()` from `@angriff36/manifest/ir-compiler` and optional adapters from the audit, outbox, or stores subpaths.
