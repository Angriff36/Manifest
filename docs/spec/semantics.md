# Manifest IR v1 Semantics

Last updated: 2026-02-12
Status: Active
Authority: Binding
Enforced by: src/manifest/conformance/**, npm test

This document defines the runtime meaning of IR v1. The IR schema is authoritative; this document defines how conforming runtimes MUST interpret it.

## Runtime Model
- A runtime hosts an IR program plus execution state (stores, context, event log).
- A runtime evaluates IRExpressions against an evaluation context, producing a value or undefined.
- A runtime MAY expose a context object containing `user` and arbitrary fields.

## Modules
- IR modules are a logical grouping only.
- Module membership does not change runtime behavior.

## Entities
- Entities define structured data and behavior. The runtime MUST support:
  - properties (IRProperty)
  - computedProperties (IRComputedProperty)
  - relationships (IRRelationship)
  - commands (references to IRCommand by name)
  - constraints (IRConstraint)
  - policies (IRPolicy references by name)

### Properties
- Each property has a type, optional defaultValue, and modifiers.
- Modifiers are declarative; the runtime MAY enforce them but is not required to.
- When creating an instance, if a property is omitted from the provided data, the runtime MUST apply the property's defaultValue if present, or the type's default value if no defaultValue is specified.
- If a property is explicitly provided (even with an empty string `""`), that value is used and defaults do not apply.

### Computed Properties
- A computed property MUST be derived by evaluating its expression in a context containing:
  - `self` and `this` bound to the entity instance
  - the instance's fields
  - any computed dependencies listed in `dependencies`
  - `user` and `context` if provided by the runtime
- The runtime MUST prevent infinite recursion. If a dependency cycle is detected, the computed value MUST evaluate to `undefined`.

### Relationships
- Relationships define connections between entities. A conforming runtime MUST support relationship traversal in expressions.
- Relationship kinds:
  - `hasMany`: One-to-many; returns an array of related instances (may be empty)
  - `hasOne`: One-to-one; returns a single related instance or `null`
  - `belongsTo`: Many-to-one; returns a single related instance or `null`
  - `ref`: Simple reference; returns a single related instance or `null`

#### Relationship Traversal in Expressions
- When a member expression references a relationship (e.g., `self.author` or `post.comments`), the runtime MUST resolve the relationship by:
  1. Identifying the relationship metadata on the current entity
  2. Looking up related instance(s) from the store using the foreign key or inverse relationship
  3. Returning the resolved instance(s) or `null`/`[]` for empty relationships

#### Relationship Resolution Rules
- For `belongsTo` and `ref`: The foreign key property on the source instance contains the ID of the target instance. The runtime MUST look up the target instance by that ID.
- For `hasOne`: The inverse `belongsTo` relationship on the target entity is used. The runtime MUST query the target entity where the foreign key equals the current instance's ID.
- For `hasMany`: The inverse `belongsTo` relationship on the target entity is used. The runtime MUST query all target instances where the foreign key equals the current instance's ID.

#### Relationship Constraints
- Relationship resolution is synchronous within the current store context.
- Circular relationships MUST be handled gracefully; runtime MAY prevent infinite recursion.
- Accessing a relationship on a non-existent instance returns `null` for `hasOne`/`belongsTo`/`ref` or `[]` for `hasMany`.
- If the target entity or instance does not exist, the relationship returns `null` or `[]`.

#### Entity Concurrency (vNext)
- Entities MAY define optimistic concurrency controls via `versionProperty` and `versionAtProperty`.
- `versionProperty`: Name of a numeric field that increments on each update (e.g., "version")
- `versionAtProperty`: Name of a timestamp field that tracks when the version was last updated (e.g., "versionAt")
- When a command attempts to mutate an entity with concurrency controls:
  - The runtime MUST compare the provided `versionProperty` value against the current stored value
  - If values match, the mutation proceeds and the version is incremented
  - If values differ, a `ConcurrencyConflict` is returned:
    - `entityType`: Type of entity that conflicted
    - `entityId`: ID of the entity instance
    - `expectedVersion`: Version number provided by the caller
    - `actualVersion`: Current version in storage
    - `conflictCode`: Stable code for categorizing the conflict type
- Commands receiving a `ConcurrencyConflict` MUST NOT apply mutations and SHOULD surface the conflict to the caller.

#### State Transitions (vNext)
- Entities MAY define `transitions`: an array of `IRTransition` objects specifying allowed state changes.
- Each `IRTransition` has: `property` (the field name), `from` (current value), `to` (array of allowed new values).
- When a command mutates a property that has transition rules:
  - The runtime MUST find the transition rule matching the property's current value via `from`.
  - If a matching rule exists and the new value is NOT in `to`, the command MUST fail with a descriptive error.
  - If no matching rule exists for the current value, the transition is unconstrained from that state.
- Properties not referenced in any transition rule are unconstrained.
- Transition validation occurs before entity constraint validation.

### Constraints
- Constraints are boolean expressions. A runtime MAY enforce them when mutating properties or creating instances.

#### Constraint Severity (vNext)
- Each constraint has a `severity` field: `ok`, `warn`, or `block` (default: `block`).
- `ok` constraints are informational only; their outcome is always `passed` regardless of expression result.
- `warn` constraints produce a `ConstraintOutcome` with `passed` based on expression evaluation but do not halt execution.
- `block` constraints produce a `ConstraintOutcome` with `passed` based on expression evaluation and halt execution on failure.

#### Constraint Codes (vNext)
- Each constraint has a `code` field that provides a stable identifier for overrides and auditing.
- The `code` defaults to the constraint `name` if not specified.
- `code` MUST be unique within the scope of an entity for proper override matching.

#### Constraint Evaluation (vNext)
- When evaluated, constraints produce a `ConstraintOutcome` containing:
  - `code`: Stable constraint identifier
  - `constraintName`: Human-readable constraint name
  - `severity`: The constraint's severity level
  - `formatted`: String representation of the constraint expression
  - `message`: Optional message from the constraint
  - `details`: Resolved `detailsMapping` key-value pairs
  - `passed`: Boolean indicating if expression evaluated truthily
  - `overridden`: Boolean indicating if constraint was overridden
  - `overriddenBy`: User ID who authorized the override (if applicable)
  - `resolved`: Array of `{expression, value}` pairs for debugging

## Stores
- Stores define persistence targets for entities.
- A runtime MUST support at least `memory` stores.
- Other targets (`localStorage`, `postgres`, `supabase`) are adapters (see `adapters.md`).
- When creating an instance via a store, omitted properties receive their default values as specified in the Properties section.

## Policies
- Policies are boolean expressions with an action scope.
- The default runtime behavior is:
  - Policies with action `execute` or `all` MUST be checked for command execution.
  - Policies with action `read`, `write`, or `delete` are not enforced by default.
  - Policies with action `override` MUST be checked when authorizing constraint overrides (vNext).
- A policy with an `entity` applies only to commands bound to that entity.

### Default Policies (vNext)
- Entities MAY define `defaultPolicies` — an array of policy names that apply to all commands bound to that entity unless overridden at the command level.
- Default policies provide entity-level authorization baseline, reducing boilerplate for common authorization patterns.

#### Inheritance Rules
- When an entity defines `defaultPolicies`, those policies are implicitly applied to every command bound to that entity.
- A command MAY override default policies by declaring its own `policies` array. When command-level policies are declared, default policies are NOT merged — the command's explicit policies replace the defaults entirely.
- If a command declares no policies and the entity has no `defaultPolicies`, the command has no policy protection (scanner SHOULD warn).

#### Evaluation Order
- When evaluating policies for a command:
  1. If the command has explicit policies declared, evaluate only those policies.
  2. If the command has no explicit policies but the entity has `defaultPolicies`, evaluate the entity's default policies.
  3. If neither command nor entity has policies, no policy check is performed (scanner SHOULD warn about missing policy coverage).

#### Override Semantics
- Default policies are a compile-time convenience, not a runtime construct.
- The IR compiler MUST expand entity `defaultPolicies` into each command's effective policy list during transformation.
- The runtime evaluates the command's expanded policy list exactly as if the policies were declared directly on the command.
- This means:
  - A command that overrides defaults by declaring its own policies has a different IR representation than one that inherits defaults.
  - Scanner tools can detect inherited vs. declared policies by comparing source AST to IR output.

#### IR Representation
- `IREntity.defaultPolicies`: Array of policy name strings (references to policies in `IR.policies`).
- `IRCommand.policies`: Array of policy name strings (explicitly declared or expanded from entity defaults).
- When compiling, if a command has no declared policies and the entity has `defaultPolicies`, the compiler MUST copy the entity's `defaultPolicies` into the command's `policies` array.
- This expansion ensures runtime behavior is consistent regardless of whether policies were inherited or declared.

#### Example
```manifest
entity InventoryItem {
  // Default policy: all commands require kitchen staff role
  default policy execute: user.role in ["kitchen_staff", "kitchen_lead", "manager", "admin"]

  command consume(...) { ... }  // Inherits default policy

  command adjust(...) {
    // Override: managers only
    policy execute: user.role in ["kitchen_lead", "manager", "admin"]
    ...
  }
}
```

In this example:
- `consume` inherits the default policy (kitchen staff and above)
- `adjust` overrides with a stricter policy (kitchen lead and above)
- The IR for `consume` will have `policies: ["InventoryItem_Execute_Default"]` (synthesized name)
- The IR for `adjust` will have `policies: [explicit declared policy]`

## Commands
- The IR root `commands` array is the authoritative command definition list.
- `IREntity.commands` is a list of command names that reference definitions in the root `commands` array.
- A command referenced by an entity MUST have its `entity` field equal to that entity's name.
- Command name matching is case-sensitive.
- Command names in the root `commands` array MUST be unique.
- If an entity references a command name that does not exist in the root command list, compilation MUST fail.
- Commands take parameters, optional guards, actions, emits, and optional return type.
- On execution, a runtime MUST:
  1) Build an evaluation context containing `self`, `this`, input parameters, and runtime context.
  2) Evaluate applicable policies (see Policies). If any fail, execution MUST stop with a denial.
  3) Evaluate command-level constraints (see Command Constraints). If any `block` constraint fails without an authorized override, execution MUST stop.
  4) Evaluate guards in order; if any guard is falsey, execution MUST stop with a guard failure.
  5) Execute actions in order.
  6) Emit declared events in order.
  7) Return a CommandResult with success status, emitted events, and the last action result.

### Command Constraints (vNext)
- Commands may define a `constraints` array for pre-execution validation.
- Command constraints are evaluated after policies but before guards.
- Command constraints use the same constraint schema as entity constraints (code, severity, overrideable, etc.).
- Command constraints support all three severity levels: `ok`, `warn`, `block`.
- A command with failing `block` constraints MUST NOT execute unless an override is authorized.

### Override Mechanism (vNext)
- Constraints may be marked `overrideable: true` to allow authorized bypass.
- An `overridePolicyRef` may be specified to reference the policy that authorizes overrides.
- To override a constraint, the runtime receives an `OverrideRequest` containing:
  - `constraintCode`: The code of the constraint to override
  - `reason`: Human-readable explanation for the override
  - `authorizedBy`: User ID of the authorizer
  - `timestamp`: When the override was requested
- Override authorization flow:
  1. Runtime checks if constraint is marked `overrideable`
  2. If `overridePolicyRef` is specified, the referenced policy is evaluated
  3. If policy passes, the constraint outcome is marked with `overridden: true` and `overriddenBy` set to the authorizer
  4. An `OverrideApplied` event MUST be emitted with the override details
- Constraints NOT marked `overrideable` MAY NOT be overridden; override attempts MUST be rejected.

### Generated Artifacts
Generated code MUST conform to the same semantics as the IR runtime:

- **Server code**: MUST enforce policies (action `execute` or `all`) before executing commands
- **Client code**: Commands MUST return the last action result (not void)

Generated server endpoints SHALL:
1. Check applicable policies for the entity/command
2. Check guards in order
3. Execute the command
4. Return the result with success status

Generated client command methods SHALL:
1. Check applicable policies (if entity has policies)
2. Check guards in order
3. Execute actions in order
4. Emit declared events
5. Return the last action result

### Generated Projections
- Projections are generated views/outputs derived from IR, not semantic authority.
- Runtime meaning remains anchored in IR semantics.
- Projections MUST NOT diverge from IR semantics.

Brief source alignment:
- `README.md`: "Projections are tooling, not runtime semantics."
- `docs/patterns/usage-patterns.md`: "Projections are tooling, not language semantics."

See also:
- `../patterns/usage-patterns.md`
- `../patterns/embedded-runtime-pattern.md`
- `adapters.md`

## Actions
- `mutate`: Evaluate expression and, if a current instance is bound, assign the result to the target field and return the value. If no instance is bound, the action has no storage effect and returns the value.
- `emit`: Evaluate expression; return the value. Runtimes MAY emit a generic action event.
- `publish`: Evaluate expression; return the value. Runtimes MAY emit a generic action event.
- `persist`: Evaluate expression; return the value. Runtimes MAY persist via adapters.
- `compute`: Evaluate expression; return the value.
- `effect`: Evaluate expression; return the value. Runtimes MAY invoke side effects via adapters.

### Deterministic Mode (vNext)
- When `deterministicMode` is `true`, a conforming runtime MUST throw `ManifestEffectBoundaryError` for `persist`, `publish`, and `effect` action kinds instead of the default no-op behavior.
- This enforces the effect boundary contract: adapter actions in a deterministic context are programming errors, not runtime domain failures.
- See `adapters.md` for the normative exception to default no-op behavior.

## Events
- Commands declare `emits` as a list of event names.
- When a command emits an event, the runtime MUST log an EmittedEvent with:
  - `name`: the emitted event name
  - `channel`: the event channel if defined in IR, otherwise the event name
  - `payload`: an object containing command input and the last action result
  - `timestamp`: the runtime time source

### Event Workflow Metadata (vNext)
- A conforming runtime MUST attach `emitIndex` (zero-based per-command emission index) to emitted events. `emitIndex` resets to 0 at the start of each `runCommand` invocation.
- If `correlationId` or `causationId` are provided in command options, the runtime MUST propagate them to emitted events.
- `emitIndex` is a per-command counter only. It is NOT a global sequence. Cross-command ordering is the caller's responsibility.
- Given identical IR + identical runtime context (including injected `now`/`generateId`) + identical input + identical options, emitted events MUST have identical `emitIndex` values.

### Idempotency (vNext)
- A conforming runtime MAY support an `IdempotencyStore` for command deduplication.
- When configured, the runtime MUST require a caller-provided `idempotencyKey` in command options. If no key is provided, the runtime MUST return an error.
- If the key exists in the store, the runtime MUST return the cached `CommandResult` without re-executing the command.
- Both successful and failed results MUST be cached.
- The idempotency check occurs BEFORE any command evaluation (before building evaluation context, policy checks, constraints, guards, actions, or event emission).

## Expressions
- Literal, identifier, member access, unary, binary, call, conditional, array, object, and lambda expressions are supported.
- The following operators MUST be supported by the default runtime:
  - Binary: `+`, `-`, `*`, `/`, `%`, `==`, `!=`, `<`, `>`, `<=`, `>=`, `and`, `or`, `in`, `contains`
  - Unary: `!`, `not`, `-`
- Operator semantics:
  - `==` and `is` use loose equality (JavaScript `==` semantics): `undefined == null` is `true`, type coercion applies.
  - `!=` uses loose inequality (JavaScript `!=` semantics): `undefined != null` is `false`, type coercion applies.
  - `and` and `or` evaluate with boolean truthiness.
  - `in` checks membership in an array or substring in a string.
  - `contains` checks membership where the left side is array or string.

## Nonconformance
There are no known nonconformances. All implementations conform to this specification.



