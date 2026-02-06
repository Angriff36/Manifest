# Built-in Functions Specification

## Job to Be Done

As a developer writing Manifest programs, I want access to standard library functions like `now()` and `uuid()`, so that I can generate timestamps and unique identifiers in my commands.

## Status ✅ COMPLETED

**Implementation Date:** 2026-02-05 (Loop 1)

Per `docs/spec/builtins.md`:
- `now()`: ✅ Implemented (returns milliseconds since epoch)
- `uuid()`: ✅ Implemented (returns UUID v4 string)
- Built-in identifiers (self, this, user, context): ✅ Implemented

## Acceptance Criteria (All Met)

1. **`now()` Function** ✅
   - Returns current timestamp as number (milliseconds since epoch)
   - Usable in expressions: `mutate createdAt = now()`
   - Deterministic override for testing via `RuntimeOptions.now`

2. **`uuid()` Function** ✅
   - Returns UUID v4 string
   - Usable in expressions: `mutate id = uuid()`
   - Deterministic override for testing via `RuntimeOptions.uuid`

3. **Expression Support** ✅
   - Call expressions work in guards, actions, computed properties
   - Clear error messages for unknown functions

## Technical Notes

**Implementation Location:** `src/manifest/runtime-engine.ts` lines 279-284

- `now()`: Uses `Date.now()` or custom override from `options.now`
- `uuid()`: Uses `crypto.randomUUID()` or custom override from `options.uuid`
- Both are available in the evaluation context for expression evaluation
- Conformance tests use deterministic overrides via `RuntimeOptions`

## Related Files

- `src/manifest/runtime-engine.ts` - expression evaluation (lines 279-284)
- `docs/spec/builtins.md` - function specification
