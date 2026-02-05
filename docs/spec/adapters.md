# Adapters

This document defines adapter hooks for storage targets and action kinds. Adapters are extensions, not core language features, unless stated otherwise.

## Storage Targets
A conforming runtime MUST support:
- `memory`

A conforming runtime MAY support:
- `localStorage`
- `postgres`
- `supabase`

### Default Behavior
- If a store target is not supported, the runtime MUST emit a diagnostic and MUST NOT silently fall back.
- A runtime MAY fall back to `memory` semantics only when explicitly configured (implementation-defined).

### Diagnostics
- A diagnostic MUST be observable to the caller (e.g., thrown error, returned error object, emitted event, or explicit log entry) and MUST identify the unsupported target and entity.

### Nonconformance
- ~~The IR runtime currently supports `memory` and `localStorage` only and falls back to `memory` for other targets without emitting diagnostics.~~
- **RESOLVED (2026-02-05)**: Runtime now throws clear errors for unsupported storage targets (`postgres`, `supabase` in browser) at runtime-engine.ts:248-264.

## Action Adapters
The following actions are adapter hooks:
- `persist`
- `publish`
- `effect`

### Default Behavior
- If no adapter is installed for an action kind, the runtime MUST treat the action as a no-op and return the evaluated expression value.

### Optional Adapter Contracts
Implementations MAY add adapters with the following contracts:
- `persist`: persist current instance state and return a persisted value or confirmation.
- `publish`: publish the evaluated value to an external event bus.
- `effect`: invoke external side effects (HTTP, storage, timers, custom).

Adapters MUST be deterministic with respect to a deterministic runtime configuration when used in conformance tests.

### Nonconformance
- ~~The IR runtime treats `persist`, `publish`, and `effect` as no-ops.~~
- **CORRECT BEHAVIOR (2026-02-05)**: Per spec, the default behavior when no adapter is installed IS to treat actions as no-ops and return the evaluated expression value. The runtime correctly implements this default behavior at runtime-engine.ts:881-894.
