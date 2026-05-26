# Built-ins

Last updated: 2026-02-12
Status: Active
Authority: Binding
Enforced by: src/manifest/conformance/**, npm test

This document defines built-in identifiers and functions available during expression evaluation.

## Core Identifiers (Required)
A conforming runtime MUST provide these identifiers in the evaluation context:
- `self`: the current entity instance, or `null` when no instance is bound
- `this`: alias of `self`
- `user`: the current user object, or `null` when unauthenticated
- `context`: the runtime context object (empty object if none)

These identifiers are not reserved keywords in IR; they are injected by the runtime evaluation context.
If a runtime does not provide required built-ins, it is non-conforming even if a particular manifest does not reference them.

### Context Member Access
The following `context.*` bindings are spec-guaranteed when the host runtime
populates them (see `semantics.md` § "Runtime Context Schema"):
- `context.tenantId: string | undefined`
- `context.orgId: string | undefined`
- `context.actorId: string | undefined`
- `context.requestId: string | undefined`
- `context.source: string | undefined`
- `context.deterministic: boolean | undefined`

Guard, policy, and constraint expressions MAY reference any of the above.
Referencing an unset field MUST evaluate to `undefined` (no exception).
The runtime MUST NOT auto-populate these fields; they are caller-supplied.

## Core Literals (Required)
A conforming runtime MUST support these literal identifiers:
- `true`
- `false`
- `null`

## Standard Library (Required)
A conforming runtime MUST provide:
- `now(): number` - returns the current time (milliseconds since epoch).
- `uuid(): string` - returns a globally unique identifier.

## Expression Library (Required)

A conforming runtime MUST provide these callables in guard, policy, constraint, and compute expressions.
Evidence: conformance fixture `56-expression-builtins.manifest`.

### String

- `trim(s)` — string trim; non-strings pass through
- `split(s, sep)` — `String.split`
- `count(v)` — array length when `v` is an array; otherwise returns `v`
- `startsWith(s, prefix)`, `endsWith(s, suffix)`
- `replace(s, search, replacement)` — global literal replace (search is escaped for regex)
- `toUpperCase(s)`, `toLowerCase(s)`
- `length(v)` — string or array length
- `substring(s, start, end?)`, `indexOf(s, search)`

### Math

- `abs`, `round`, `floor`, `ceil`
- `min(...)`, `max(...)` — numeric arguments only; empty → `undefined`
- `between(value, low, high)` — inclusive range test on numbers

### Array

- `sum(arr)` — sum of numeric elements; non-arrays pass through

### Date (UTC, timestamp in ms)

- `year(ts)`, `month(ts)` (1–12), `day(ts)`, `hours(ts)`, `minutes(ts)`, `seconds(ts)`

### Nonconformance
- ~~The IR runtime does not provide `now()` or `uuid()` built-ins.~~
- **RESOLVED (2026-02-05)**: Both functions are implemented in runtime-engine.ts:279-284. `now()` uses `Date.now()` (or custom override), `uuid()` uses `crypto.randomUUID()` (or custom override).



