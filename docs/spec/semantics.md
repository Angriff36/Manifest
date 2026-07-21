# Manifest IR v1 Semantics

Last updated: 2026-07-15
Status: Active
Authority: Binding
Enforced by: src/manifest/conformance/**, npm test
Applies to: `@angriff36/manifest@0.5.0+`

This document defines the runtime meaning of IR v1. The IR schema is authoritative; this document defines how conforming runtimes MUST interpret it.

## Governance Primitive Surface

Manifest exposes the following primitives for downstream governance
integrations to consume:

- runtime command execution
- typed runtime context (tenantId, orgId, actorId, requestId, source, deterministic)
- IR-derived command and governed-entity registries
- canonical Next.js dispatcher projection
- deterministic mode (effect-boundary enforcement)
- governance audit CLI surfaces (`manifest emit registries`,
  `manifest audit-bypasses`, `manifest audit-governance`)
- adapter contracts: `AuditSink`, `OutboxStore`, store adapters (runtime-integrated — see `adapters.md` § "Audit Sink" and § "Outbox Store" for emission/enqueue semantics)

A downstream application's governance policy (which entities are governed,
which commands require tenant context, which bypasses are allowed) is
expressed in the registries, the bypass file, and runtime options the
consumer passes — never inside Manifest itself.

Any Manifest behavior change that touches one of these primitives
(runtime context shape, dispatcher route shape, registry shape, audit
finding codes, deterministic mode, semantic event emission, adapter
boundary) MUST update this spec and SHOULD bump `compilerVersion` so
downstream `irHash` checks surface the change.

Downstream integration examples live under `docs/integrations/` and are
not authoritative for Manifest semantics.

## Runtime Model

- A runtime hosts an IR program plus execution state (stores, context, event log).
- A runtime evaluates IRExpressions against an evaluation context, producing a value or undefined.
- A runtime MAY expose a context object containing `user` and arbitrary fields.

## Runtime Context Schema

- The runtime context object MAY carry the following typed fields. None are required by the IR itself; downstream consumers MAY require subsets via runtime options:
  - `tenantId: string` — active tenant identifier
  - `orgId: string` — active organization identifier (e.g. Clerk `orgId`)
  - `actorId: string` — acting user identifier
  - `requestId: string` — caller-supplied request id, surfaced in diagnostics and on emitted events
  - `source: string` — origin surface (`route` | `job` | `cli` | `test` | `ui` | `workflow` | other)
  - `deterministic: boolean` — when true, adapter actions (persist/publish/effect) MUST throw `ManifestEffectBoundaryError`
- All typed fields are surfaced inside expression evaluation under the existing `context.*` binding. Adding these fields does NOT change IR shape.
- A runtime MAY accept the option `requireTenantContext: true`. When set, `runCommand` MUST fail closed with diagnostic `MISSING_TENANT_CONTEXT` when `context.tenantId` is absent.
- If both `options.deterministicMode` and `context.deterministic` are set, `options.deterministicMode` takes precedence (explicit caller intent overrides ambient context).
- The runtime context object remains open (additional ad-hoc keys MAY be present). The typed fields are a minimum contract, not an exhaustive shape.

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
- Entity `behavior` blocks (including bare `on Event { ... }` inside an
  entity) have no IR representation and no defined semantics. A conforming
  compiler MUST reject a program that declares them with an error diagnostic
  (see conformance fixture 110) — it MUST NOT silently drop them. Use
  top-level reactions (`on Event run Entity.command`) or command actions
  instead.

### Properties

- Each property has a type, optional defaultValue, and modifiers.
- Modifiers are declarative. The runtime enforces the subset listed under "Modifier enforcement" below; the remaining modifiers (`indexed`, `optional`, `searchable`) are projection hints with no independent runtime behavior.
- Map types: `map<V>` is a string-keyed dictionary of values of type `V`. The two-parameter form `map<string, V>` is sugar for `map<V>` and MUST lower to the same IR (`type.name: "map"`, single `generic` = value type). A two-parameter form whose first type argument is not plain `string` is a compile error. Non-string key types are not supported.
- When creating an instance, if a property is omitted from the provided data, the runtime MUST apply the property's defaultValue if present, or the type's default value if no defaultValue is specified.
- If a property is explicitly provided (even with an empty string `""`), that value is used and defaults do not apply.

#### Modifier enforcement (runtime)

- `required`: creating an instance MUST fail closed when a property carrying the `required` modifier has no value from any source — it is absent from the provided data, has no `defaultValue`, is not `autoNow`, is not an auto-managed field (`id`, the tenant property, `versionProperty`/`versionAtProperty`, `createdAt`/`updatedAt` when `timestamps` is set, composite-key columns, relationship foreign keys), and is not written by the creating command's actions. The failure is a blocking constraint outcome with code `E_REQUIRED`. A zero-filled type default (e.g. `""`, `0`, `false`) does NOT satisfy an explicit `required` modifier.
- `readonly`: once an instance exists, an update that changes a `readonly` property to a different value MUST be rejected (the update returns no instance; through a command it fails with `E_READONLY`). Writing a `readonly` property while the creating command runs is allowed, as is an update that writes the property's current value (a no-op).
- `unique`: on create and on update, if a property carrying the `unique` modifier is set to a non-null value already held by another instance, the write MUST be rejected (blocking outcome / rejection with code `E_UNIQUE`). Uniqueness is evaluated by scanning existing instances within the active tenant scope — a full scan; a runtime MAY delegate to a store-level uniqueness constraint where the adapter supports it. Null/undefined values are not uniqueness-checked.
- `private`: excluded entirely from public reads — see Property Masking.

### Property Default Type Compatibility

A property literal default MUST be compatible with its declared type. The compiler MUST reject incompatible pairs (for example, `property metadata: string? = {}`) instead of emitting IR that downstream projections cannot type safely. `null` is valid only for nullable types; object and array literals are valid only for compatible composite, JSON, or `any` types.

- `encrypted` and `masked` are enforced as described in their own sections.

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
- For `hasMany` **without** `through`: The inverse `belongsTo` relationship on the target entity is used. The runtime MUST query all target instances where the foreign key equals the current instance's ID.
- For `hasMany` **with** `through <Join>` (many-to-many via join entity): The runtime MUST resolve in two hops:
  1. Find all `Join` instances whose `belongsTo`/`ref` back to the source entity matches the current instance (same FK rules as inverse `hasMany`).
  2. For each join row, resolve the join's `belongsTo`/`ref` to the declared target entity and collect those target instances (dedupe by target identity). Empty join set → `[]`.
- Composite foreign keys (`foreignKey.fields` with more than one column) ARE resolved by the reference runtime. The runtime MUST pair each local FK column with the target column it references (via `foreignKey.references`; absent/mismatched, the target entity's declared `key` columns are paired positionally, else the local field names are assumed to match) and select the target row where every paired column is equal. This picks the exact row even when several targets share a first-column value. When any local FK column is unset, the relationship resolves to `null`/`[]`.

#### Many-to-many via `through` (join entity)

A relationship MAY declare `through <JoinEntity>` instead of `foreignKey` (they remain mutually exclusive — see below). Semantics:

- Only `hasMany` MAY use `through` in this version. Other kinds with `through` MUST fail compilation with `RELATION_THROUGH_KIND_UNSUPPORTED`.
- The join entity MUST exist in the program. It MUST declare a `belongsTo` or `ref` to the source entity and a `belongsTo` or `ref` to the relationship target. Otherwise the compiler MUST emit `RELATION_THROUGH_JOIN_INVALID` and fail compilation.
- Expression traversal of the relationship name (e.g. `self.tags` for `hasMany tags: Tag through PostTag`) MUST return the target instances per the two-hop rule above — not the join rows.
- Projections that emit relational schemas (Prisma, Drizzle) MUST wire the **join entity** as a first-class table with two FK-owning sides, and MUST expose a collection from each end to the join rows (so the database schema is valid). They MUST NOT invent an implicit join table that drops the join entity.
- Conformance fixture `102-through-join.manifest` is the canonical happy path; `101-foreignkey-through-conflict.manifest` remains the exclusivity failure case.

~~### Unsupported: join-table relationships (`through`) (error)

Many-to-many relationships declared via `through` are **not supported** in this version — not at runtime, and not in the Prisma or Drizzle projections. The compiler MUST reject any relationship that sets `through` with an **error**-severity diagnostic `RELATION_THROUGH_UNSUPPORTED`, naming the entity and relationship and directing the author to model the join entity explicitly with two `belongsTo` relationships. Compilation MUST fail (`ir` is null). Setting both `foreignKey` and `through` on one relationship is additionally rejected as `RELATION_FK_THROUGH_EXCLUSIVE` (the mutual-exclusivity previously documented only in JSDoc is now a compile error enforced by the checks above). Conformance fixture `102-through-unsupported.manifest` is the canonical test case.

Migration: model the join table as a first-class entity with two `belongsTo` sides, one back to each end of the relationship.~~

**Update (2026-07-15):** `through` is supported as specified in § Many-to-many via `through` above. The former `RELATION_THROUGH_UNSUPPORTED` hard reject is removed.

#### Relationship Constraints

- Relationship resolution is synchronous within the current store context.
- Circular relationships MUST be handled gracefully; runtime MAY prevent infinite recursion.
- Accessing a relationship on a non-existent instance returns `null` for `hasOne`/`belongsTo`/`ref` or `[]` for `hasMany`.
- If the target entity or instance does not exist, the relationship returns `null` or `[]`.

#### Referential Actions (runtime)

`belongsTo` / `ref` relationships MAY declare `onDelete` and/or `onUpdate` with one of:
`cascade`, `restrict`, `setNull`, `setDefault`, `noAction`.

~~Previously these were projection-only (Prisma/Drizzle FK attributes); the reference
runtime ignored them on `deleteInstance` / `updateInstance`.~~

**Update (2026-07-15):** The reference runtime **MUST** enforce these actions for
every store (including `memory` / `localStorage`), so IR meaning holds without a
database FK engine:

- Actions are declared on the **child** relationship that owns the foreign key.
- **Absent** action (or explicit `noAction`): do nothing to children (orphans may remain).
- **`onDelete`** runs inside `deleteInstance` **before** the parent row is removed:
  - `restrict` — if any child FK matches the parent, throw `ManifestReferentialRestrictError` and leave all rows unchanged.
  - `cascade` — recursively apply `onDelete` for each matching child, then delete that child (depth-first; cycle-safe via a visit set).
  - `setNull` — set each local FK column to `null`. If a declared property has `nullable: false`, throw `ManifestReferentialSetNullError`.
  - `setDefault` — set each local FK column to the property's IR `defaultValue`, else the type default.
- **`onUpdate`** runs inside `updateInstance` when any **referenced** parent column changes (the remote side of `foreignKey.fields`/`references`, or `id` for the `${rel}Id` convention), **before** the parent write:
  - `restrict` — throw `ManifestReferentialRestrictError` if dependents exist.
  - `cascade` — rewrite matching child FK columns to the new parent values.
  - `setNull` / `setDefault` — same as onDelete.
- Projections (Prisma/Drizzle) continue to emit native FK attributes; runtime enforcement is the portable contract for non-SQL stores.
- Conformance / unit evidence: `runtime-referential-actions.test.ts`.

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

#### Composite Keys (vNext)

- An entity MAY declare `key`: an ordered list of property names forming its primary identity (e.g. `key [region, code]`). When present, the runtime's identity for an instance is the ordered tuple of those property values, encoded deterministically into a single canonical key string (each component percent-encodes `%` and the `|` separator, then components are joined with `|`). All identity-bearing operations — create, get, update, delete, relationship resolution, and the command working copy — key off this composite identity. When `key` is absent the identity is the `id` property, unchanged.
- On create, the runtime persists the instance under its composite identity string (assigned to `id`), so a composite-key entity is addressable by that string via `getInstance`/`updateInstance`/`deleteInstance` and `runCommand`'s `instanceId`. A composite-key entity is not required to declare a separate `id` property.
- Two instances differing in any key component are distinct, even if they share another column's value; this makes per-tenant/region reuse of a code safe when the discriminator is part of `key`.
- A `belongsTo`/`ref` relationship whose foreign key spans multiple columns resolves the target by matching every mapped `foreignKey.fields`/`references` column (see Relationship Resolution Rules).
- ~~`alternateKeys` remain projection-level unique constraints; the runtime does not enforce alternate-key uniqueness in this version.~~
- **Update (2026-07-15):** each `alternateKeys` group is a multi-column uniqueness
  constraint. On create and update, if every column in a group has a non-null
  value and another instance (excluding self) matches all those columns, the
  write MUST fail closed with a blocking constraint outcome (`E_ALTERNATE_KEY`).
  A group with any null/undefined column is not uniqueness-checked (same rule as
  single-column `unique`). Lookup by alternate key is not required; identity
  addressing remains `id` / composite `key`.

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
- **Update (2026-07-15):** On create and update, entity-level constraints that are
  `overrideable` honor the same [Override Mechanism](#override-mechanism-vnext) as
  command constraints (explicit `OverrideRequest` and auto-policy via
  `overridePolicyRef`), including `OverrideApplied` audit events. Blocking failures
  that are successfully overridden MUST NOT halt the mutation.

#### Constraint Severity (vNext)

- Each constraint has a `severity` field: `ok`, `warn`, or `block` (default: `block`).
- `ok` constraints are informational only; their outcome is always `passed` regardless of expression result.
- `warn` constraints produce a `ConstraintOutcome` with `passed` based on expression evaluation but do not halt execution.
- `block` constraints produce a `ConstraintOutcome` with `passed` based on expression evaluation and halt execution on failure.

#### Constraint Polarity: `failWhen` (vNext)

- The optional `failWhen` field on `IRConstraint` controls expression polarity.
- `failWhen: false` (default — positive polarity): a **falsy** expression result is a violation (`passed = !!expr`).
- `failWhen: true` (negative polarity): a **truthy** expression result is a violation (`passed = !expr`). Write expressions as "condition that signals a problem."
- The compiler collapses the legacy `name.startsWith('severity')` name-prefix heuristic into `failWhen: true` at compile time and emits a `CONSTRAINT_POLARITY_NAME_HEURISTIC` deprecation warning. Rename the constraint and add `failWhen: true` explicitly to suppress the warning.
- Runtimes MUST read only the `failWhen` field; they MUST NOT inspect constraint names for polarity.

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
  - `passed`: Boolean. For `ok` severity, always `true`. For `warn`/`block`, derived from expression result and `failWhen` polarity.
  - `overridden`: Boolean indicating if constraint was overridden
  - `overriddenBy`: User ID who authorized the override (if applicable)
  - `resolved`: Array of `{expression, value}` pairs for debugging

## Date/Time Types

Four primitive type names with fixed runtime representations, plus one
source-level alias:

| Type        | Representation                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------------- |
| `datetime`  | finite number, epoch milliseconds UTC, within ±8,640,000,000,000,000 (the representable Date range) |
| `timestamp` | **alias of `datetime`** — same representation and write-time validation (`E_TYPE_DATETIME`)         |
| `duration`  | finite number, milliseconds (may be negative)                                                       |
| `date`      | string `"YYYY-MM-DD"`, must be a valid calendar date (leap years honored; `"2026-02-30"` invalid)   |
| `time`      | string `"HH:MM:SS"`, `00:00:00`–`23:59:59` (no `24:00:00`, no leap seconds)                         |

IR MAY preserve the author spelling `timestamp` on `type.name` (same pattern as
`bool` vs `boolean`). Projections and the reference runtime MUST treat
`timestamp` identically to `datetime`. Prefer `datetime` in new docs and
examples; `timestamp` exists for ergonomics and projection parity (e.g. Zod).

**Write-time validation.** On create and update mutations in the reference runtime, properties of these types are validated after guards, alongside entity constraints. A malformed value produces a blocking constraint outcome with code `E_TYPE_DATE`, `E_TYPE_TIME`, `E_TYPE_DATETIME`, or `E_TYPE_DURATION`, carrying the property name and offending value. `null`/`undefined` always passes this validation (nullability is enforced separately). Validation applies only to these type names — no behavior change for any existing program that does not use them.

**Generated defaults.** Code generators emit `""` as the default for non-nullable `date`/`time` properties — an intentionally invalid sentinel; the reference runtime's write-time validation blocks it (generated standalone code performs no date/time validation itself). Generated defaults for `datetime`/`timestamp`/`duration` are `0` — a _valid_ value (epoch / zero duration), not a sentinel. Deterministic "today" defaults are impossible by design.

## Property Encryption

Properties carrying the `encrypted` modifier are encrypted at the persistence
boundary and are plaintext everywhere inside Manifest evaluation. Encryption is
an adapter concern: the IR records the modifier, while a runtime or projection
receives key-management behavior through an author-owned provider.

### Provider contract and envelope

- A provider encrypt operation receives `String(value)` plus adapter metadata
  identifying the entity and property. It MUST return `{ ciphertext, keyId }`.
- A provider decrypt operation receives `ciphertext`, `keyId`, and the same
  adapter metadata. It MUST return the plaintext string.
- Stored encrypted values use the deterministic envelope JSON shape
  `{"v":1,"kid":"<keyId>","ct":"<ciphertext>"}`. Providers own cryptography
  and key selection; Manifest owns this envelope and its version.
- `null`, `undefined`, and absent properties pass through without invoking the
  provider.
- A version-1 envelope is decrypted on read. A non-envelope string is treated
  as legacy plaintext and returned unchanged so applications can migrate
  existing data incrementally. An envelope with an unsupported version or an
  encryption/decryption provider failure MUST fail the read or write; it MUST
  NOT silently return ciphertext, drop the field, or write plaintext.

### Evaluation order

- On create and update, guards, policies, constraints, actions, emitted-event
  payloads, reactions, and command results operate on plaintext. Encryption is
  the final transform immediately before the store write.
- On external reads, decryption happens immediately after the store read and
  before read policies, computed values, `private` removal, or `masked`
  transformation. Read policies therefore evaluate the same plaintext values
  as the reference runtime.
- Internal execution reads are decrypted before command evaluation. No command
  may observe an encryption envelope as a domain value.
- Identical IR, runtime context, stored envelopes, and provider behavior MUST
  produce identical domain results. Ciphertext itself MAY be nondeterministic;
  that variability belongs to the injected provider boundary.

### Missing-provider behavior

The reference runtime preserves backward compatibility when no
`encryptionProvider` is configured, but adapters and generated projections that
claim encrypted-field support MUST fail generation or startup loudly when an
encrypted persistent property exists without their required provider seam.
They MUST NOT claim support while persisting new plaintext values.

## Property Masking

Properties MAY carry the `masked` modifier, which transforms sensitive values **at read time**. The strategy is explicit in source; modifiers precede the property name:

```manifest
entity Patient {
  property masked(partial, 0, 4) ssn: string
  property masked(email) contact: string unmask when user.role == "admin"
  property masked notes: string
}
```

### Strategies

The masked output is always a string; the input value is converted with `String(value)` before masking. `null`/`undefined` values pass through unmasked (nothing to leak).

| Strategy                             | Transform                                                                                                                                                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `redact` (default for bare `masked`) | `"***"`                                                                                                                                                                                                                      |
| `partial(keepStart, keepEnd)`        | keep first `keepStart` and last `keepEnd` characters; every middle character replaced by `*`. If `keepStart + keepEnd >= length`, the entire string is replaced by `*` per character. Written flat: `masked(partial, 0, 4)`. |
| `email`                              | first character of the local part + `***@` + everything after the first `@`. If the string contains no `@` or the `@` is the first character, the value is fully redacted to `"***"`.                                        |
| `phone`                              | `***-***-` + last 4 digits of the digit-only form. If the value contains fewer than 4 digits, it is fully redacted to `"***"`.                                                                                               |
| `last4`                              | `****` + last 4 characters. If the string has 4 or fewer characters, the result is `"****"`.                                                                                                                                 |

Examples: `partial(0, 4)` on `"123-45-6789"` → `"*******6789"`; `email` on `"alice@example.com"` → `"a***@example.com"`; `phone` on `"555-867-5309"` → `"***-***-5309"`; `last4` on `"4111111111111111"` → `"****1111"`.

### Compile-time rules

- `masked` is a contextual identifier, NOT a reserved word: `property masked: string` remains a valid plain property declaration (one-token lookahead — if the token after `masked` is `:`, it is the property name).
- Unknown strategy or wrong parameter arity is a compile error. `partial` requires exactly two non-negative integer parameters; `redact`, `email`, `phone`, and `last4` take none.
- An `unmask when <expr>` clause MAY appear at the end of the property declaration; it is a compile error without the `masked` modifier.
- **IR invariant**: `'masked' ∈ modifiers` ⇔ `maskStrategy` present on the IRProperty. Bare `masked` compiles to `maskStrategy: { type: "redact" }`.

### Runtime semantics

- Masking is applied in `getInstance` / `getAllInstances`, **after** `encrypted` decryption (masking operates on plaintext) and after tenant filtering, before returning data.
- A `private` property is excluded entirely from `getInstance` / `getAllInstances` results, whether or not it also carries `masked` (`private` wins over `masked`). Execution paths (guards, constraints, computed properties, relationship resolution, command actions) use the internal raw read path and still observe the real value.
- `unmaskWhen` bindings are the spec-guaranteed bindings only: `self.*` / `this.*` (the instance being read, real values) and `user.*` / `context.*` from the engine's runtime context. With no user in context, `user.*` resolves undefined → falsy → masked.
- **Secure by default; diagnostics explain, never compensate**: if `unmaskWhen` evaluates falsy, the value stays masked. If `unmaskWhen` _throws_, the value stays masked AND the runtime surfaces a diagnostic carrying the expression and resolved values — the diagnostic never changes the masked outcome.
- Masking is a read-projection transform only: guards, constraints, computed properties, relationship resolution in expressions, and command actions always see real values. Identical IR + identical runtime context still produce identical execution results.

### Scope boundaries (v2.3.0 limitations, not guarantees)

1. Generated Next.js read routes query the store directly and bypass the engine — they are NOT masked in this release (follow-up feature).
2. Computed properties derived from masked properties return computed-from-real values unmasked (`emailCopy: email` bypasses masking). Mark the computed property's source data appropriately; do not assume derivation preserves masking.
3. Event payloads contain whatever commands explicitly emit — author's responsibility.
4. Write-back hazard: the runtime does not detect a masked placeholder (e.g. `"***"`) being round-tripped into an update. Clients must not write masked reads back.

## Stores

- Stores define persistence targets for entities.
- A runtime MUST support at least `memory` stores.
- Other targets (`localStorage`, `postgres`, `supabase`) are adapters (see `adapters.md`).
- When creating an instance via a store, omitted properties receive their default values as specified in the Properties section.

## Policies

- Policies are boolean expressions with an action scope.
- The default runtime behavior is:
  - Policies with action `execute` or `all` MUST be checked for command execution.
  - Policies with action `read` (or `all`) ARE enforced at the runtime read gate: a single central boundary in `getInstance` / `getAllInstances`, above masking. Denied reads fail closed — `getInstance` returns `undefined` (indistinguishable from not-found, no existence leak) and `getAllInstances` omits denied rows. Read policies are evaluated in IR declaration order, with the row bound as `self` / `this` and `user` / `context` from the runtime context; a policy that references `self.*` is evaluated per row, a context-only policy (no `self` / `this`) once per `getAllInstances` call (deny ⇒ empty result without scanning rows). Policy-level `rateLimit` and thrown-expression fail-closed semantics match the command policy gate. An entity-scoped read policy (declared with an `entity`) gates that entity; an unscoped `read`/`all` policy is a global read gate.
  - Policies with action `write` or `delete` are enforced only at command execution (via `command.policies`); there is no separate write/delete data-mutation gate on the store.
  - The internal execution read path (guards, actions, computed properties, relationship resolution) uses the raw, un-gated read and always sees all rows — the read gate is a projection of the _external_ read surface only, so it never changes command execution results (determinism preserved).
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

From conformance fixture `55-default-policies.manifest`:

```manifest
entity Task {
  default policy RequireAuth execute: user.id != null "Authentication required"

  property required title: string
  property status: string = "pending"
  property assigneeId: string

  command complete() {
    guard self.assigneeId == user.id or user.role == "admin"
    mutate status = "completed"
  }

  command reassign(newAssigneeId: string) {
    guard user.role == "admin" or user.role == "manager"
    mutate assigneeId = newAssigneeId
  }
}
```

In this example:

- `complete` inherits the default policy (`RequireAuth`)
- `reassign` also inherits `RequireAuth` and adds its own guard for role checks
- The IR for `complete` will include the inherited default policy name in its `policies` array
- The IR for `reassign` will include the same inherited default policy name in its `policies` array

## Identifier canonicalization (house spelling)

~~Manifest owns final generated names. Agents MAY write casing and separator
variants; the compiler MUST fold them to one house form before IR emission so
every projection sees the same spelling.~~

**2026-07-15:** Identifier normalization is **opt-in** via `naming.normalization`
in `manifest.config.yaml` / `build.naming` (default **`false`** — verbatim IR
spelling, backward compatible). When enabled, agents MAY write casing and
separator variants; the compiler folds them per configured rules so every
projection sees one spelling. Source files are never rewritten.

- Master switch: `naming.normalization` (`false` by default).
- Per-category `mismatch`: `off` | `warn` | `error` | `fix` (fix normalizes
  generated output only).
- Identity key: lowercase alphanumeric only (`eventdate` ≡ `EventDate` ≡
  `event_date`).
- When multiple spellings share a key, the spelling with the clearest word
  boundaries wins (`EventDate` beats `EVENTDATE`). Flat spellings with no
  proven split follow `naming.ambiguousWordBoundaries` (default `warn`).
- Semantic aliases (`writer` → `author`) are config-only; never guessed.
- Projection-only legacy storage remaps live under `naming.projections.<name>`
  and do not change Manifest canonical names.
- Full key reference: `docs/spec/config/manifest.config.md` § naming.

Applies across all loaded `.manifest` source files in a compile unit when
normalization is enabled.

---

## Commands

- The IR root `commands` array is the authoritative command definition list.
- `IREntity.commands` is a list of command names that reference definitions in the root `commands` array.
- A command referenced by an entity MUST have its `entity` field equal to that entity's name.
- ~~Command name matching is case-sensitive.~~
- Command name matching uses Manifest house spelling after identifier
  canonicalization (casing and separator variants of the same name are one
  command). Exact matching applies to the canonical form.
- Command names in the root `commands` array MUST be unique.
- During compilation, the compiler MUST reject duplicate command intent within the same entity before IR emission. This includes:
  - exact duplicate `entity.command` names across all loaded manifest source files;
  - canonical duplicates for the same entity after conservative normalization: lowercase command names, strip separators, strip the entity name as a prefix or suffix, and normalize the verbs `create`/`add`/`new`, `update`/`edit`/`modify`, and `delete`/`remove`/`deactivate`/`archive` to one canonical intent.
- Duplicate command-intent diagnostics MUST name the duplicate command, the existing command, both source paths when available, and instruct the author to use or extend the existing command.
- Different entities MAY define the same normal command names, such as `create`, `update`, or `delete`; canonical duplicate checks are scoped to the same entity or resolved entity alias.
- If an entity references a command name that does not exist in the root command list, compilation MUST fail.
- Commands take parameters, optional guards, actions, emits, and optional return type.
- **`command.returns` is projection-only metadata (2026-07-15 clarification).**
  The optional `returns` type on a command feeds TypeScript/OpenAPI/Zod/Dart/etc.
  projections. The reference runtime does **not** validate or coerce
  `CommandResult` (or the last action result) against `returns`. Runtime return-type
  enforcement would be a separate language change and is not implied by declaring
  `returns`.
- A parameter MAY declare a trusted source with `from context.<path>` (same grammar as the `tenant` declaration). When present, the compiler records `IRParameter.trustedSource` (e.g. `context.actorId`). Trusted parameters are **server-owned**:
  - Generated client input types and browser-facing bindings MUST omit them.
  - Before `runCommand`, the host/generated server binding MUST strip any client-supplied value for that parameter name and inject the value resolved from `RuntimeContext` at the declared path.
  - The runtime itself, when it sees `trustedSource` on a parameter, MUST also strip a client-supplied value and inject from the active `RuntimeContext` (fail closed with `MISSING_TRUSTED_CONTEXT` when the resolved value is `undefined`/`null` and the parameter is `required` with no `defaultValue`). This is defense-in-depth; projections MUST still strip/inject at the transport boundary.
  - Naming heuristics (e.g. "ends with `UserId`") MUST NOT be used to infer trusted ownership. Only an explicit `from context.*` declaration (or an equivalent IR `trustedSource`) marks a parameter as server-owned.
- Before building the evaluation context, the runtime MUST process the declared `parameters` against the command input:
  - Trusted-source injection/strip (above) runs first.
  - A parameter absent from the input that declares a `defaultValue` MUST have that default applied to the input.
  - A parameter absent from the input that declares no `defaultValue` and is `required` MUST fail closed with a `parameterFailure` on the CommandResult (code `MISSING_REQUIRED_PARAMETER`) before rate-limit, policy, constraint, or guard evaluation.
  - A parameter present in the input (including `null`) is used as-is; an explicit `undefined` is treated as absent.
- On execution, a runtime MUST:
  1. Build an evaluation context containing `self`, `this`, input parameters (with parameter defaults already applied), and runtime context.
  2. If the command declares `rateLimit`, evaluate the rate-limit gate for the configured scope (`user`, `tenant`, or `global`). If denied, execution MUST stop with a `rateLimitDenial` on the CommandResult.
  3. Evaluate applicable policies (see Policies). Policy-level `rateLimit` gates run before each policy expression. If any policy fails (expression or rate limit), execution MUST stop with a denial.
  4. Evaluate command-level constraints (see Command Constraints). If any `block` constraint fails without an authorized override, execution MUST stop.
  5. Evaluate guards in order; if any guard is falsey, execution MUST stop with a guard failure.
  6. Execute actions in order.
  7. Emit declared events in order.
  8. Return a CommandResult with success status, emitted events, and the last action result.

### Initialization Commands (atomic document construction)

- When a command carries `IRCommand.initialization` (an `IRInitializationPlan`) and
  is invoked without an `instanceId`, it is an **allocating** (initialization)
  command. The compiler attaches this plan; projections and the reference runtime
  MUST consume it and MUST NOT invent separate creation heuristics.
- ~~Initialization used to persist a partially initialized document, then run
  ordinary command mutations against that row (persist-before-mutate).~~
  > **Correction (2026-07-16) @RYANSIGNED:** Initialization is atomic document
  > construction. Runtimes and projections MUST follow this order and persist
  > nothing when any step fails:
  > 1. Validate command input (parameters, trusted injection, defaults).
  > 2. Create a virtual pre-persistence **draft** from authenticated ownership,
  >    declared defaults, initial lifecycle state, and permitted initialization
  >    inputs. Command-owned fields that are not also initialization inputs are
  >    absent from the draft until mutations run.
  > 3. Evaluate authorization (policies) and genuine state-dependent business
  >    invariants (dynamic guards / command constraints) against the draft.
  > 4. Apply command mutations to the in-memory draft.
  > 5. Validate the complete resulting document against the entity schema
  >    (required fields, types, uniqueness, entity constraints).
  > 6. Persist exactly one final valid document.
  > 7. Emit events and run reactions against the persisted result.
- Field validation belongs to the generated schema validator (scalars, enums,
  arrays, optionality/nullability, references/value objects, simple ranges,
  input-only cross-field rules). Authorization belongs to policies. Lifecycle
  legality belongs to declared transitions (transition edges apply to subsequent
  instance commands; the allocating write constructs the first legal document).
  Defaults and initial values belong to field/entity initialization metadata.
  Guards are reserved for dynamic business invariants that need the current
  document, related data, authenticated user, or current time.
- Authors MUST NOT be required to write guards that only restate facts already
  known from field schemas, initialization-command identity, lifecycle
  declarations, command mutation ownership, defaults, or generated authorization.
  Such guards may still appear (classified on the plan as `redundantGuardIndexes`)
  but are not required by the language.
- A required final field MAY be populated solely by an initialization command
  mutation without a placeholder property default. Compilers MUST NOT treat that
  shape as a contradictory definition.
- Generated public APIs MUST NOT accept values the generated entity schema rejects
  (same field contract for Zod and platform validators).
- Commands may declare a `retry` policy. When present, the runtime wraps execution and retries a failed attempt whose error code appears in the command's `retryOn` list. The runtime derives that code from the failed `CommandResult`: a concurrency conflict yields `CONCURRENCY_CONFLICT`; a structured (`CODE: message`) error surfaces its leading `CODE` verbatim (so a command that fails with `SUPPLIER_UNAVAILABLE: …` is retryable when `retryOn` lists `SUPPLIER_UNAVAILABLE`); an unstructured error mentioning `TIMEOUT` falls back to `TIMEOUT`. Policy denials, guard failures, and blocking constraint outcomes MUST NOT be retried.
- `schedule` declarations compile to IR `schedules`. Runtimes expose `getSchedules()` and `runSchedule(name)`. The `RuntimeEngine` itself has no timer, so adapters decide when to invoke schedules; the reference package ships an optional worker (`startScheduleWorker` / `runSchedulesOnce` from `@angriff36/manifest/schedule-worker`) that evaluates cron and interval/every triggers on a tick loop and, when the IR declares approvals, sweeps approval expiry. Cron is matched in UTC to the minute (day-of-month and day-of-week follow the standard OR rule when both are restricted).
- Entity `extends` and `mixin` composition is resolved at compile time. Precedence on name collision: own > later mixin > earlier mixin > parent. Cycles and unknown parents are compile errors.

### Rate Limiting

- Command- and policy-level `rateLimit` use a sliding window: effective limit =
  `maxRequests + (burstAllowance ?? 0)` within `windowMs`.
- Scope keys:
  - `user` — derived from the acting user in evaluation context;
  - `tenant` — from the IR tenant resolver / runtime tenant id;
  - `global` — a single shared key (optionally prefixed for policy gates).
- Default backing store is in-process memory (`MemoryRateLimitStore`). Limits
  reset on process restart and do not span engine instances unless a shared
  store is injected.
- Hosts MAY inject a durable `RateLimitStore` via `RuntimeOptions.rateLimitStore`
  (first-party: `@angriff36/manifest/rate-limit/postgres` + schema from
  `manifest db init --only rate-limit`). When set, sliding-window state is
  read/written through that store. Adapters that implement atomic `mutate`
  (Postgres does) MUST serialize concurrent consumers of the same scope key.
- A denied gate MUST surface `rateLimitDenial` on the `CommandResult` (command
  gate) or fail the policy/read gate (policy gate). Diagnostics MUST NOT
  compensate by auto-raising limits.
- Projections are not required to emit transport-level rate-limit middleware;
  enforcement is a runtime gate over IR `rateLimit` declarations.

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
- Two override paths exist and BOTH MUST emit an `OverrideApplied` audit event:
  1. **Explicit request**: the caller supplies an `OverrideRequest`; `authorizedBy` is the request's authorizer.
  2. **Auto-policy**: no `OverrideRequest` is supplied but the constraint's `overridePolicyRef` policy passes for the acting context. In this path `authorizedBy` is derived from the acting user in context (`context.user.id`, falling back to `policy:<name>` when no user is present) and the event `reason` records the authorizing policy.
- Constraints NOT marked `overrideable` MAY NOT be overridden; override attempts MUST be rejected.
- **Update (2026-07-15):** The mechanism applies to **entity-level** constraints on
  create/update as well as command constraints. Evidence:
  `runtime-entity-constraint-overrides.test.ts`.

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
- `docs/guides/usage-patterns.md`: "Projections are tooling, not language semantics."

See also:

- `../patterns/usage-patterns.md`
- `../patterns/embedded-runtime-pattern.md`
- `adapters.md`

## Actions

Actions execute in declaration order. Kinds:

- `mutate`: evaluate the expression and, if the command is bound to an instance, assign the result to `target` on the working copy (batched; see § "Batched Persistence"). Returns the value. With no bound instance, no storage effect. The only kind that writes entity state.
- `compute`: evaluate the expression and, if the action names a binding (`compute <name> = <expr>`), bind `<name>` into the command's evaluation scope for subsequent actions, emits, and event payloads. `compute` MUST NOT mutate entity state. Returns the value. A `compute` binding is command-scoped: it is available to later actions and to event payload expressions within the same command execution, and is discarded when the command returns. It is never persisted and never appears in `getInstance`/`getAllInstances`.
- `emit`: emit the **named** IR event `target` into the in-process event log and local listeners (consumable by reactions/sagas), with the same event shape as `command.emits`. The optional expression supplies the payload. The compiler MUST reject an `emit` action whose `target` is missing or does not match a declared event (`EMIT_ACTION_UNKNOWN_EVENT`).
- `publish`: **external delivery** of the named event `target` through the configured outward publisher (outbox, bridged to the event bus post-commit), distinct from `emit`. An adapter action: forbidden in deterministic mode; fails closed (`MISSING_OUTBOX_STORE`) when no outbox is configured. The compiler applies the same `EMIT_ACTION_UNKNOWN_EVENT` target check as `emit`.
- `effect`: invoke the host `effectHandler` (`RuntimeOptions.effectHandler`) with the evaluated value and action/command context; its resolved value is the action result. An adapter action: forbidden in deterministic mode; fails closed (`MISSING_EFFECT_HANDLER`) when no handler is configured. An optional `effect <name> = <expr>` form names the effect (`name` is passed to the handler).
- `persist`: explicitly flush the command's pending working-copy state to the store (see § "`persist` action" below). An adapter action: forbidden in deterministic mode.

Adapter actions (`publish`, `effect`, `persist`) enforce the effect boundary: in deterministic mode each throws `ManifestEffectBoundaryError` and performs no side effect.

Action-emitted events (`emit`/`publish` actions) interleave with `command.emits` (which fire after the action loop) in a single per-command emit sequence: `emitIndex` is a shared, monotonic per-command counter, so ordering is deterministic across both sources. Action-emitted events participate in `CommandResult.emittedEvents`, reaction dispatch, and the outbound event-bus bridge exactly like command-declared events.

### `persist` action

A `persist` action explicitly flushes the command's pending working-copy changes to the store at its point in the action sequence, then clears the pending change set (the working copy is retained). `persist` does not open, commit, or close a transaction and does not finalize the command.

- Under a `TransactionProvider`, the flush threads the active transaction handle: the write joins the command's transaction and is durably committed only when that transaction commits. A subsequent failing action rolls the whole transaction back, undoing the `persist` (atomic-on-failure preserved).
- Without a provider (e.g. memory/localStorage), the flush is an immediate, non-transactional store write. A later failing action does NOT undo it; there is no rollback. Authors requiring atomicity across an explicit `persist` MUST configure a `TransactionProvider`.
- Multiple `persist` actions are permitted; each flushes only the deltas accumulated since the previous flush.
- `persist` is an adapter action: in deterministic mode it throws `ManifestEffectBoundaryError` and performs no write.

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

### Realtime Entities

Entities MAY declare a bare `realtime` flag inside the entity block:

```manifest
entity Order {
  property id: string
  realtime
}
```

- `realtime` is a contextual identifier, NOT a reserved word: `property realtime: boolean` remains a valid plain property declaration.
- The flag compiles to `IREntity.realtime: true`.
- **`realtime` has no runtime execution semantics.** It is a projection hint only: the Next.js projection uses it to emit an SSE subscription surface for the flagged entity (it is the only projection that emits SSE today — Express does not). Identical IR with and without the flag produces identical command execution results, identical events, and identical state.

#### Runtime `subscribe()` contract

The reference runtime exposes `subscribe(entityName, listener): () => void` — a convenience over `onEvent` that exists regardless of any entity's `realtime` flag:

- The listener receives only events whose `subject.entity === entityName`.
- Events **without** a `subject.entity` are NOT delivered to `subscribe` listeners (use `onEvent` for the unfiltered firehose).
- The return value is an unsubscribe function; after it is called the listener receives no further events.
- Multiple subscribers (same or different entity names) are independent; listener errors are swallowed exactly as for `onEvent` listeners and never affect execution.
- **Transaction ordering (provider mode).** When a `TransactionProvider` is wired in (see `adapters.md` § "Transaction Boundary"), in-process notification of `onEvent`/`subscribe` listeners is **deferred until after the command's transaction commits**, so listeners never observe an event from a command that later rolled back. Reaction dispatch is unaffected — reactions run inside the transaction (their writes join it) and only the external listener notification is deferred. Without a provider, listeners are notified synchronously during event emission (unchanged). Note that `getEventLog()` is an in-process diagnostic buffer, not a transactional participant: it records emitted events as they occur in both modes and is not rewound on rollback.

#### Deployment constraint (generated SSE surfaces)

The in-process event stream is per-engine-instance and in-memory. Generated SSE code (only the Next.js projection emits an SSE surface today) uses a module-scoped singleton engine (a generated `getSharedRuntime()` accessor shared by SSE routes and command routes). By itself this requires a long-lived Node server process and a **single-instance deployment**: a command executed on one instance notifies only the listeners registered on that same instance, so a second instance — or a fresh serverless invocation — never observes it.

#### Cross-instance delivery — the `EventBus` adapter (optional)

To fan events out across instances, wire an `EventBus` into `RuntimeOptions.eventBus` (contract + in-process `MemoryEventBus`: `src/manifest/events/event-bus.ts`, exported as `@angriff36/manifest/events`; see `adapters.md` § "Event Bus"). The engine then bridges its in-process stream to the bus in two directions:

- **Outbound (automatic).** After a command completes, the engine publishes **one** `EventBusMessage` carrying `{ originId, events }`, where `events` is the full batch of events that command delivered to local listeners and `originId` is the publishing engine's stable per-instance id. A command that emits N events — including any events its reactions emit (see § "Reactions") — produces exactly **one** message containing all N, never one message per event.
  - **Post-commit, once per committed attempt.** In provider mode (see `adapters.md` § "Outbox Store — Transaction Boundary") the publish happens **after the transaction commits**, so a command that rolls back publishes **nothing** and a retried command publishes only its committing attempt's events. In non-provider mode the batch is published when the top-level `runCommand` completes.
  - **Idempotency.** A duplicate `idempotencyKey` short-circuits to the cached result before any evaluation and therefore publishes **nothing** — no events were re-emitted.
  - **At-least-once, non-blocking.** Publishing occurs after the command's effects are final; a publish failure is logged (`[Manifest Runtime] EventBus.publish failed`) and does **not** fail the command. Subscribers MUST be idempotent.
- **Inbound (explicit).** `connectEventBus(): Promise<() => Promise<void>>` subscribes the engine to the bus and re-dispatches every **remote** message's events to this engine's local `onEvent`/`subscribe` listeners, so an SSE surface backed by engine B observes events emitted by a command on engine A. Messages whose `originId` equals this engine's own id are **skipped** — an engine never re-delivers its own outbound events, so a local listener is notified exactly once. The subscription is not active until `connectEventBus` is awaited; the returned function unsubscribes. Calling `connectEventBus` again while already connected returns the existing unsubscribe without opening a second subscription. `hasEventBus()` reports whether a bus is configured.

The bus carries only command-emitted events (the in-process stream described above). Saga _lifecycle_ events (`SagaStarted`/`SagaCompleted`/`SagaAborted`) are emitted by the orchestrator outside any `runCommand` batch and are **not** published to the bus; the per-step command events they bracket are.

### Idempotency (vNext)

- A conforming runtime MAY support an `IdempotencyStore` for command deduplication.
- When configured, the runtime MUST require a caller-provided `idempotencyKey` in command options. If no key is provided, the runtime MUST return an error.
- If the key exists in the store, the runtime MUST return the cached `CommandResult` without re-executing the command.
- Without a `TransactionProvider`, both successful and failed results MUST be cached.
- With a `TransactionProvider` (see `adapters.md` § "Transaction Boundary"), the idempotency record is written inside the command's transaction. A committing (successful) command therefore caches its result atomically with its mutations; a failed command rolls its transaction back and caches **nothing**, so a later call with the same key re-executes rather than replaying a cached failure. This is the intended consequence of atomic rollback — "the failed attempt never happened" — and is the one place provider mode narrows the "failed results MUST be cached" rule above.
- The idempotency check (`get`) occurs BEFORE any command evaluation (before building evaluation context, policy checks, constraints, guards, actions, or event emission) and, in provider mode, BEFORE any transaction is opened — a duplicate key short-circuits to the cached result without a transaction.

## Reactions

Reactions declare event-driven command dispatch within the Manifest governance boundary.

### Syntax

```
on <EventName> run <EntityType>.<commandName>
  resolve <expression>
  params { <paramName>: <expression>, ... }
```

### Compilation

- Each reaction declaration compiles to an `IRReactionRule` node in the IR `reactions` array.
- `event`: The triggering event name (MUST reference a declared event).
- `targetEntity`: Entity type to invoke the command on.
- `targetCommand`: Command name on the target entity.
- `resolve`: Expression evaluated against the event payload to produce the target instance ID.
- `params`: Optional array of `{name, expression}` mappings from event payload to command input.

### Runtime Semantics

- After a command emits events (step 6 in command execution), the runtime MUST evaluate all reaction rules whose `event` matches each emitted event name.
- Matching reactions are evaluated in **declaration order** (order in the IR `reactions` array).
- For each matching **single-target** reaction (`resolve`):
  1. Evaluate `resolve` expression with the event payload as context → produces `instanceId`.
  2. Evaluate each `params[].expression` with the event payload as context → produces command input.
  3. Invoke `runCommand(targetEntity.targetCommand, input, {instanceId, correlationId, causationId})`.
- For each matching **fan-out** reaction (`fanOut`):
  1. Evaluate `matchSource` with the event payload as context → produces the match value.
  2. Let `matchEntity` be `fanOut.matchEntity` if present, otherwise `targetEntity`.
     Select every **matchEntity** instance where `instance[matchField] == matchValue`.
  3. For **each** matched instance, evaluate each `params[].expression` with
     context `{ payload: <event payload>, self: <matched instance>, target: <matched instance> }`
     → produces that row's command input (so per-row quantities can use
     `self.requiredQuantity` with `payload.newHeadcount` / `payload.previousHeadcount`).
  4. Invoke `runCommand(targetEntity.targetCommand, input, options)` once per match:
     - **Same-entity** (`matchEntity` absent or equal to `targetEntity`): pass
       `instanceId` of the matched row (legacy cascade: cancel/deactivate children).
     - **Cross-entity** (`matchEntity` present and ≠ `targetEntity`): do **not** pass
       the matched row's id as `instanceId`. When `targetCommand` is `create`, this
       is the foreach-create path (allocate one new `targetEntity` per matched source
       row). Non-`create` cross-entity fan-out is reserved; conforming runtimes MUST
       still omit the source row's `instanceId` so the command is not bound to the
       wrong entity type.
- Reaction-triggered commands are full command executions (policies, guards, actions, emits apply).
- Events emitted by reaction-triggered commands MAY trigger further reactions (cascading).
- A conforming runtime MUST enforce a maximum reaction depth (default: 10) to prevent infinite loops. When exceeded, the runtime MUST throw a `ManifestReactionDepthError`.
- Reaction execution is **synchronous within the same turn** (in-process). The triggering command's result includes all events from cascaded reactions.
- The `correlationId` from the triggering command MUST propagate to all reaction-triggered commands. Each reaction-triggered command receives the triggering event's name as its `causationId`.

### Determinism

- Given identical IR + identical runtime context + identical input, reactions MUST produce identical results in identical order.
- Reaction evaluation order is fixed by IR declaration order. No priority or weighting.

## Webhooks (Inbound HTTP Triggers)

Webhooks declare inbound HTTP endpoints that dispatch a command when an external system sends a request. The reference runtime materializes them via `handleWebhookRequest(runtime, request, options?)` (`src/manifest/webhooks`) — the executable contract every projected webhook route binds to. All processing is **fail-closed**: an unauthenticated, malformed, or under-configured request is rejected, never coerced into a command execution.

### Syntax

```
webhook <name> "<path>" run [Entity.]<command>
  [method: "POST"]
  [signature { algorithm: "hmac-sha256"|"hmac-sha512", header: "<Header>", secret: "<context-path>" }]
  [idempotencyHeader: "<Header>"]
  [transform: { <param>: <expr>, ... }]
```

### Compilation

- Each webhook declaration compiles to an `IRWebhook` node in the IR `webhooks` array (top level or module scope; NOT inside an entity body).
- `path`: matched verbatim against the request path.
- `method`: optional; when absent the runtime treats the method as POST.
- `command` / `entity`: the command to dispatch and its optional entity scope.
- `signature`: optional HMAC verification config. `secret` is a **context path string** (e.g. `context.stripeWebhookSecret`) resolved at runtime — never an inlined secret.
- `idempotencyHeader`: optional request header carrying the dedup key.
- `transform`: optional `{name, expression}` mappings; each expression is evaluated against the parsed request body.

### Request handling (normative)

A conforming runtime MUST process an inbound request in this order, returning at the first failing step:

1. **Match.** Select the webhook whose `path` equals the request path and whose method (default POST) equals the request method (compared case-insensitively). If no webhook has that path, the runtime MUST respond `404`. If the path exists only under other methods, the runtime MUST respond `405`.
2. **Signature.** When `signature` is declared:
   - An `algorithm` outside `{hmac-sha256, hmac-sha512}` is a configuration fault → respond `500`. The runtime MUST NOT silently accept.
   - Resolve the shared secret: the caller's explicit override (`options.resolveSecret`) when it yields a non-empty value, otherwise the `secret` context path resolved against the runtime context. An unresolved secret is a configuration fault → respond `500` naming the path. The runtime MUST NOT fall back to accepting the request.
   - Read the configured `header`. Missing or empty → respond `401`.
   - Compute the HMAC over the **exact received bytes** (`rawBody`) and compare it to the provided value timing-safely. The provided value MAY be bare hex or hex prefixed with `sha256=`/`sha512=` (GitHub convention); comparison is case-insensitive on the hex. Any mismatch → respond `401`.
   - When `signature` is **absent** the endpoint is unauthenticated by design: the runtime accepts without verification. This is a deliberate, spec-guaranteed property — declare a signature to require authentication.
3. **Idempotency.** When `idempotencyHeader` is declared:
   - If the runtime has no `IdempotencyStore` configured, the declared dedup contract cannot be honored → respond `500`. The runtime MUST NOT silently degrade to at-least-once delivery.
   - Read the header. Missing or empty → respond `400`.
   - The value is passed as the command's `idempotencyKey`, so a duplicate delivery returns the cached result and the command body executes exactly once (§ Idempotency).
4. **Body & transform.** Parse `rawBody` as JSON; invalid JSON → respond `400`. When `transform` is declared, evaluate each param expression against the parsed body (bound as `payload`, aliased `self`); an expression that throws → respond `400` (the runtime MUST NOT partially execute). Missing payload fields evaluate to `undefined` and are not errors. When `transform` is absent, the parsed JSON object is the command input as-is.
5. **Dispatch.** Derive `instanceId` from the command input (`input.instanceId`, then `input.id`, else undefined — mirroring the generated dispatcher), then invoke `runCommand(command, input, {entityName, instanceId, idempotencyKey})`. A successful result responds `200` with `{ data, events, diagnostics }`. A failed result responds `{ error, diagnostics }` at a status derived from the failure: policy denial `403`, guard failure `422`, blocking constraint `422`, concurrency conflict `409`, approval required `409`, otherwise `400`.

### Determinism

Given identical IR + identical runtime context + identical request bytes, webhook handling MUST produce an identical response. The handler reads no wall clock; signature verification, JSON parsing, and comparison are pure functions of the request.

## User-Facing Boundary

Manifest is not a form builder that exposes plumbing. Downstream products use it so
**people never paste internal ids or platform fields** — they do normal work; the
runtime supplies tenant scope, auth, parent links, audit metadata, and timestamps.

**End users MUST NOT be required to provide:**

- Tenant or organization scope (`tenantId`, `orgId`, …) — comes from login/session
- Who is acting (`userId`, `createdById`, `updatedById`, `actorId`) — comes from auth
- Parent record links (`{parent}Id`) — comes from "add child on this page" or automation
- Fields copied from the parent record (e.g. venue on an event when creating a child board)
- Timestamps and version fields the engine auto-fills
- Request/tracing ids (`requestId`, `correlationId`, `causationId`)

**Allowed user inputs** are business data: names, amounts, dates they pick, choices
among real options (status, category, assignee when assignment is the feature).

RBAC stays in policies and guards (`user.role`, `user.id`) — not in create forms.

The compiler MUST reject create commands that violate this boundary. See § Domain Completeness.

## Domain Completeness (Compile-Time Product Wiring)

The compiler MUST enforce domain wiring so half-wired models fail at compile time, not in generated APIs with no product path. These rules implement the product-quality bar from Capsule-Pro `manifest/scripts/script-index.md` Part 1: no unwired entities, no required fields the runtime auto-provides, no child creates that demand parent IDs or parent-owned context with no supply path, and no reactions that silently no-op.

### Unwired foreign keys (error)

When entity `Child` declares a property or required command parameter `{parent}Id` that resolves to an existing entity `Parent` (camelCase stem match, e.g. `disciplinaryActionId` → `DisciplinaryAction`), the compiler MUST emit an **error** unless `Child` declares `belongsTo` or `ref` targeting `Parent` for that FK field.

Cross-cutting ids (`tenantId`, `userId`, `ownerId`, etc.) are excluded.

When this diagnostic fires, compilation MUST fail (`ir` is null), same as other error-severity diagnostics.

### foreignKey/through mutual exclusivity (error)

`IRRelationship.foreignKey` and `IRRelationship.through` are mutually exclusive. A relationship MUST NOT set both. When a relationship declaration supplies both a `fields [...]` / `with <col>` clause (which populates `foreignKey`) and a `through <Entity>` clause, the compiler MUST emit an **error** diagnostic:

> Relationship '\<name\>' on entity '\<entity\>' cannot set both 'foreignKey' and 'through' — they are mutually exclusive.

Compilation MUST fail (`ir` is null) when this diagnostic is emitted. Conformance fixture `101-foreignkey-through-conflict.manifest` is the canonical test case.

~~### Unsupported: join-table relationships (`through`) (error)

Many-to-many relationships declared via `through` are **not supported** in this version — not at runtime, and not in the Prisma or Drizzle projections. The compiler MUST reject any relationship that sets `through` with an **error**-severity diagnostic `RELATION_THROUGH_UNSUPPORTED`, naming the entity and relationship and directing the author to model the join entity explicitly with two `belongsTo` relationships. Compilation MUST fail (`ir` is null). Setting both `foreignKey` and `through` on one relationship is additionally rejected as `RELATION_FK_THROUGH_EXCLUSIVE` (the mutual-exclusivity previously documented only in JSDoc is now a compile error enforced by the checks above). Conformance fixture `102-through-unsupported.manifest` is the canonical test case.

Migration: model the join table as a first-class entity with two `belongsTo` sides, one back to each end of the relationship.~~

**Update (2026-07-15):** Replaced by § Relationships → Many-to-many via `through`. See also resolution rules for two-hop runtime navigation.

### One-sided relationships (warning)

When `Child` belongsTo `Parent` but `Parent` has no `hasMany`/`hasOne` back to `Child`, the compiler MUST emit a **warning**. Minimal relationship fixtures (e.g. conformance Author/Book) may omit the inverse side; product manifests SHOULD declare both sides.

### Manual parent id on create (error)

When `Child.create` requires a `{parent}Id` parameter and `Parent` has no nested command that creates `Child` with an implicit FK, and no event reaction supplies that parameter, the compiler MUST emit an **error**. Compilation MUST fail (`ir` is null).

Exempt when an `on Event run Child.create` reaction includes the parent FK field in `params` (reaction-wired create path).

### Auto-provided create parameters (error)

When `Entity.create` requires a parameter the runtime or compiler auto-provides, the compiler MUST emit an **error**:

- Tenant discriminator property when `tenant` is declared
- `tenantId`, `orgId`, `organizationId` — scope from session/context (even when `tenant` block is absent)
- `userId`, `createdById`, `updatedById`, `actorId` — acting user from auth/context
- `requestId`, `correlationId`, `causationId` — tracing metadata, never end-user input
- `createdAt` / `updatedAt` when entity `timestamps` is enabled
- `versionProperty` / `versionAtProperty` when declared on the entity

Business assignment fields (e.g. `ownerId`, `assigneeId`) MAY remain on create when
choosing another user/record is the feature; they MUST NOT be used as a stand-in for
"current user" or parent linkage.

Callers must not be forced to supply values they cannot access or that the engine fills automatically.

### Parent-context inferable fields (error)

When `Child.create` requires a parameter whose name and scalar type match a property on a `belongsTo` parent (excluding identity, tenant, lifecycle, and generic child-specific fields such as `name`, `title`, `notes`), the compiler MUST emit an **error**. Such fields MUST be populated via parent-context propagation (create from the parent command), not re-entered by the user.

### Unreachable persisted entities (error or warning)

A persisted entity (has store) with no entity-scoped commands and not referenced as a relationship target MUST produce:

- **error** when the entity has domain wiring signals (`belongsTo`/`ref`, or a `{entity}Id` FK that resolves to another declared entity) and no constraint-only fixture role
- **warning** for property-only persisted fixtures used in language tests (no domain FK wiring)
- **warning** when the entity exists only to test constraints (has constraint declarations, no commands)

An entity with no store, no commands, and no relationship references SHOULD produce a **declared but unused** warning.

### Reaction wiring (error)

For each `on Event run Entity.command` reaction:

- **Orphan event**: ERROR when no command emits that event.
- **Invalid payload reference**: ERROR when `payload.X` references a field not present on the emitting command's parameters, the event's declared payload schema, enriched fields (`_subject`, `_eventName`, `_channel`), or (for create emitters) valid `payload.result.Y` entity properties.
- **Non-create `payload.result.*` member access**: ERROR — non-create commands set `result` to the last action value, not the instance; use `payload._subject.id` or an input param instead.

### Approval timeout actions

`on_timeout` selects what happens when a pending approval exceeds its `timeout`.

#### `on_timeout: cancel`

The request status becomes `expired`. No escalation metadata is recorded.

#### `on_timeout: escalate { … }` (open author-defined routing)

Escalation is an **open author-defined routing capability**. The `.manifest` author
decides what the target expression means in their domain (person, team,
department, stage name, queue id, or any other value). Manifest MUST NOT invent
a closed enum of target kinds unless an existing language limitation forces it.

Required block fields (all MUST be present or compilation fails):

| Field     | Meaning                                                                                                                                                                                                                                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `to`      | Any expression (same expression language as stage `policy` / `when`). Evaluated at timeout against the instance evaluation context (`self`/`this`, runtime context). The resulting value is stored on the request as opaque routing metadata (`escalatedTo`) — the runtime does not interpret its domain meaning. |
| `status`  | Approval status entered after escalation: `pending`, `granted`, `denied`, or `expired`.                                                                                                                                                                                                                           |
| `timeout` | Post-escalation deadline: a number (hours from the escalation instant), `none` (clear `expiresAt`), or `reset` (re-apply the approval's original `timeout` hours from now).                                                                                                                                       |

`reset` MUST fail compilation when the approval has no numeric `timeout` hours
(`APPROVAL_ESCALATE_RESET_WITHOUT_TIMEOUT`).

Bare `on_timeout: "escalate"` / `on_timeout: escalate` without a complete block
MUST fail compilation with `APPROVAL_ONTIMEOUT_ESCALATE_INCOMPLETE` (fixture
`103-approval-escalate-unsupported.manifest`). Incomplete blocks (missing `to`,
`status`, or `timeout`) MUST fail with precise diagnostics naming the approval
and the missing field.

When escalation runs successfully, the runtime MUST set `escalatedAt` to the
sweep time, store `escalatedTo` from evaluating `to`, apply `status`, and update
`expiresAt` per `timeout`. Conformance fixture `111-approval-escalate.manifest`
is the canonical success case.

`expireApprovals` is asynchronous (expression evaluation of `to` may be async).

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

## Async Commands

Commands may be declared with the `async` modifier to defer action execution to a background worker queue.

### Syntax

```manifest
async command processOrder(amount: number) {
  guard self.status == "pending"
  mutate status = "processing"
  mutate total = amount
  emit OrderProcessed
}
```

### IR Representation

When a command has `async: true`, the IR compiler adds:

- `async: true` on the `IRCommand`
- `completionEvent: "{commandName}Completed"` — auto-derived name
- `failureEvent: "{commandName}Failed"` — auto-derived name

Two synthesized `IREvent` entries are appended to `ir.events`:

- `{commandName}Completed` on channel `jobs.{commandName}` with payload: `jobId: string`, `result: any`, `completedAt: number`
- `{commandName}Failed` on channel `jobs.{commandName}` with payload: `jobId: string`, `error: string`, `failedAt: number`

If a user-declared event collides with a synthesized event name, the compiler MUST emit a diagnostic error.

### Execution Semantics

When an async command is invoked (and `context.source !== 'job'`):

1. **Fail-fast validation**: Policies, constraints, and guards are evaluated synchronously. If any fail, the command returns a failure result immediately — no job is enqueued.
2. **Enqueue**: If validation passes, a `JobRecord` is enqueued via the `JobQueue` adapter. The command returns immediately with `{ jobId, status: 'pending', enqueuedAt }`.
3. **No actions executed**: Mutations and emits are deferred to the background worker.
4. **No emitted events**: The immediate return has an empty `emittedEvents` array.

When `context.source === 'job'` (re-entry from the job worker):

- The async branch is bypassed; the full command body executes (policies → guards → actions → emits → return).

### Job Lifecycle

- `pending` → enqueued, awaiting worker pickup
- `running` → worker is executing the command body
- `completed` → actions succeeded; `{commandName}Completed` event emitted
- `failed` → actions failed; `{commandName}Failed` event emitted

### Missing JobQueue

If `RuntimeOptions.jobQueue` is not configured and an async command is invoked, the runtime returns `{ success: false, error: 'MISSING_JOB_QUEUE: ...' }`.

### Deterministic Testing

The `drainJobs()` method on `RuntimeEngine` drains all pending jobs synchronously in FIFO order, executing each via `_executeCommandInternal` with `context.source = 'job'`. This enables deterministic conformance testing without real worker infrastructure.

### Determinism

- Job IDs are generated via `RuntimeOptions.generateId()` (deterministic in tests)
- Timestamps use `RuntimeOptions.now()` (deterministic in tests)
- Jobs drain in FIFO enqueue order

## Nonconformance

There are no known nonconformances. All implementations conform to this specification.
