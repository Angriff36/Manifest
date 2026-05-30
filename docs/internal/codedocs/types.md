---
title: "Types"
description: "A grouped inventory of Manifest's exported TypeScript types and the source definitions they come from."
---

> **AUTO-GENERATED REFERENCE.** This file in `docs/codedocs/` is a
> code-derived reference snapshot of repository structure and signatures.
> It is intended for tooling (Context7, search indexers, etc.) and is
> NOT verified prose on every regeneration. For normative, hand-curated
> documentation see [`docs/spec/`](../spec/) — in particular
> [`docs/spec/manifest-vnext.md`](../spec/manifest-vnext.md) for language
> semantics and [`docs/spec/config/manifest.config.md`](../spec/config/manifest.config.md)
> for projection configuration. Projections are described here as
> **tooling, not language semantics** — they consume IR and emit
> artifacts; they do not redefine policy/guard/constraint behaviour.


Manifest exports a large TypeScript surface across the root runtime, compiler, IR, adapters, and route projection modules. This page groups the most important definitions and shows the actual shapes that package consumers build against.

## Runtime Types

Import path: `@angriff36/manifest`

```ts
export interface RuntimeContext {
  tenantId?: string;
  orgId?: string;
  actorId?: string;
  requestId?: string;
  source?: string;
  deterministic?: boolean;
  user?: { id: string; role?: string; [key: string]: unknown };
  [key: string]: unknown;
}

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

Use `RuntimeContext` to inject tenant, actor, request, and auth data into command execution. Use `CommandResult` as the canonical success or failure payload returned by `runCommand()`.

Other exported runtime types include `RuntimeOptions`, `EntityInstance`, `GuardFailure`, `PolicyDenial`, `GuardResolvedValue`, `ConstraintFailure`, `EmittedEvent`, `Store`, `IdempotencyStore`, `EvaluationLimits`, and `ProvenanceVerificationResult`.

## IR Types

Import path: `@angriff36/manifest/ir`

```ts
export interface IR {
  version: '1.0';
  provenance: IRProvenance;
  modules: IRModule[];
  entities: IREntity[];
  stores: IRStore[];
  events: IREvent[];
  commands: IRCommand[];
  policies: IRPolicy[];
}

export interface IRConstraint {
  name: string;
  code: string;
  expression: IRExpression;
  severity?: 'ok' | 'warn' | 'block';
  message?: string;
  messageTemplate?: string;
  detailsMapping?: Record<string, IRExpression>;
  overrideable?: boolean;
  overridePolicyRef?: string;
}

export interface ConstraintOutcome {
  code: string;
  constraintName: string;
  severity: 'ok' | 'warn' | 'block';
  formatted: string;
  message?: string;
  details?: Record<string, unknown>;
  passed: boolean;
  overridden?: boolean;
  overriddenBy?: string;
  resolved?: Array<{ expression: string; value: unknown }>;
}
```

These types are the cross-module contract. The compiler returns them, the runtime executes them, projections generate from them, and governance utilities inventory them.

Additional exported IR types include `IRProvenance`, `IRModule`, `IRTransition`, `IREntity`, `IRProperty`, `PropertyModifier`, `IRComputedProperty`, `IRRelationship`, `IRStore`, `IREvent`, `IREventField`, `IRCommand`, `IRParameter`, `IRAction`, `IRPolicy`, `IRType`, `IRValue`, `IRExpression`, `IRDiagnostic`, `OverrideRequest`, `ConcurrencyConflict`, and `CompileToIRResult`.

## Compiler AST Types

Import path: `@angriff36/manifest/compiler`

```ts
export interface ManifestProgram {
  modules: ModuleNode[];
  entities: EntityNode[];
  commands: CommandNode[];
  flows: FlowNode[];
  effects: EffectNode[];
  exposures: ExposeNode[];
  compositions: CompositionNode[];
  policies: PolicyNode[];
  stores: StoreNode[];
  events: OutboxEventNode[];
}

export interface CompilationResult {
  success: boolean;
  code?: string;
  serverCode?: string;
  testCode?: string;
  errors?: CompilationError[];
  ast?: ManifestProgram;
}
```

The compiler module re-exports many AST node types from `src/manifest/types.ts`, including `ModuleNode`, `EntityNode`, `PropertyNode`, `ComputedPropertyNode`, `RelationshipNode`, `CommandNode`, `ParameterNode`, `PolicyNode`, `StoreNode`, `OutboxEventNode`, `TypeNode`, `BehaviorNode`, `ConstraintNode`, `FlowNode`, `FlowStepNode`, `EffectNode`, `ExposeNode`, `CompositionNode`, `ComponentRefNode`, `ConnectionNode`, and the expression-node family.

These types are most useful if you are building parser-aware tooling. If you only need execution or code generation, prefer the IR types.

## Audit and Outbox Types

Import paths: `@angriff36/manifest/audit`, `@angriff36/manifest/outbox`

```ts
export type CommandOutcome =
  | 'success'
  | 'guard_denied'
  | 'policy_denied'
  | 'constraint_failed'
  | 'concurrency_conflict'
  | 'missing_tenant_context'
  | 'error';

export interface AuditRecord {
  recordId?: string;
  occurredAt: number;
  tenantId?: string;
  orgId?: string;
  actorId?: string;
  requestId?: string;
  source?: string;
  entity?: string;
  command: string;
  commandId?: string;
  outcome: CommandOutcome;
  diagnostics?: unknown;
  emittedEventNames?: string[];
  irHash?: string;
}

export interface OutboxEntry {
  entryId: string;
  enqueuedAt: number;
  event: EmittedEvent;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  lastError?: string;
}
```

These types matter when you build durable adapter implementations, workers, or monitoring tools around Manifest execution.

## Route and Registry Types

Import paths: `@angriff36/manifest/projections/routes`, `@angriff36/manifest/registry/emit`

```ts
export interface RouteParam {
  name: string;
  type: string;
  location: 'path' | 'query' | 'body';
  required?: boolean;
}

export interface RouteEntry {
  id: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  params: RouteParam[];
  source: RouteSource;
  auth: boolean;
  tenant: boolean;
}

export interface CommandRegistryEntry {
  entity: string;
  command: string;
  commandId: string;
  policies: string[];
  guardCount: number;
  emits: string[];
  effects: string[];
}
```

Use route types when you consume `RoutesProjection` outputs, and registry types when you feed governance or CI tooling from `emitRegistries()`.

## Type Inventory by Public Module

- `@angriff36/manifest`: runtime interfaces, command result types, event types, adapter root interfaces, and runtime error support types.
- `@angriff36/manifest/compiler`: AST node types and compilation result types.
- `@angriff36/manifest/ir`: canonical IR model and constraint or concurrency support types.
- `@angriff36/manifest/stores`: `EntityInstance`, `Store`, `PostgresConfig`, `SupabaseConfig`.
- `@angriff36/manifest/audit`: `CommandOutcome`, `AuditRecord`, `AuditSink`.
- `@angriff36/manifest/audit/memory`: `MemoryAuditSinkOptions`.
- `@angriff36/manifest/audit/postgres`: `PostgresAuditSinkOptions`.
- `@angriff36/manifest/outbox`: `OutboxEntryStatus`, `OutboxEntry`, `OutboxStore`.
- `@angriff36/manifest/outbox/memory`: `MemoryOutboxStoreOptions`.
- `@angriff36/manifest/outbox/postgres`: `PostgresOutboxStoreOptions`.
- `@angriff36/manifest/projections/routes`: `RouteEntry`, `RouteManifest`, `RouteParam`, `RoutesProjectionOptions`, `ManualRouteDeclaration`.
- `@angriff36/manifest/registry/emit`: `EntityClassification`, `CommandRegistryEntry`, `EntityRegistryEntry`, `CommandRegistry`, `EntityRegistry`.

For the method-bearing classes associated with those types, use the API pages under [API Reference](api-reference/runtime-engine.md).
