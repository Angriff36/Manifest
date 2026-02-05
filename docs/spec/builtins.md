# Built-ins

This document defines built-in identifiers and functions available during expression evaluation.

## Core Identifiers (Required)
A conforming runtime MUST provide these identifiers in the evaluation context:
- `self`: the current entity instance, or `null` when no instance is bound
- `this`: alias of `self`
- `user`: the current user object, or `null` when unauthenticated
- `context`: the runtime context object (empty object if none)

These identifiers are not reserved keywords in IR; they are injected by the runtime evaluation context.
If a runtime does not provide required built-ins, it is non-conforming even if a particular manifest does not reference them.

## Core Literals (Required)
A conforming runtime MUST support these literal identifiers:
- `true`
- `false`
- `null`

## Standard Library (Required)
A conforming runtime MUST provide:
- `now(): number` - returns the current time (milliseconds since epoch).
- `uuid(): string` - returns a globally unique identifier.

### Nonconformance
- The IR runtime does not provide `now()` or `uuid()` built-ins.
