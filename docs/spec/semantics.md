# Manifest IR v1 Semantics

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

### Constraints
- Constraints are boolean expressions. A runtime MAY enforce them when mutating properties or creating instances.

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
- A policy with an `entity` applies only to commands bound to that entity.

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
  3) Evaluate guards in order; if any guard is falsey, execution MUST stop with a guard failure.
  4) Execute actions in order.
  5) Emit declared events in order.
  6) Return a CommandResult with success status, emitted events, and the last action result.

### Nonconformance (Generated Artifacts)
- Generated server code does not enforce policies; it checks guards only.
- Generated client code does not return the last action result for commands (returns void).

## Actions
- `mutate`: Evaluate expression and, if a current instance is bound, assign the result to the target field and return the value. If no instance is bound, the action has no storage effect and returns the value.
- `emit`: Evaluate expression; return the value. Runtimes MAY emit a generic action event.
- `publish`: Evaluate expression; return the value. Runtimes MAY emit a generic action event.
- `persist`: Evaluate expression; return the value. Runtimes MAY persist via adapters.
- `compute`: Evaluate expression; return the value.
- `effect`: Evaluate expression; return the value. Runtimes MAY invoke side effects via adapters.

## Events
- Commands declare `emits` as a list of event names.
- When a command emits an event, the runtime MUST log an EmittedEvent with:
  - `name`: the emitted event name
  - `channel`: the event channel if defined in IR, otherwise the event name
  - `payload`: an object containing command input and the last action result
  - `timestamp`: the runtime time source

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
The following implementation differences are known:

### Generated Artifacts
- Generated server code does not enforce policies; it checks guards only.
- Generated client code does not return the last action result for commands (returns void).

These MUST be reconciled by updating the spec and tests first, then implementation.
