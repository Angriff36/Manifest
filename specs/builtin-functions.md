# Built-in Functions Specification

## Job to Be Done

As a developer writing Manifest programs, I want access to standard library functions like `now()` and `uuid()`, so that I can generate timestamps and unique identifiers in my commands.

## Current State (Nonconformance)

Per `docs/spec/builtins.md`:
- `now()`: NOT implemented
- `uuid()`: NOT implemented
- Built-in identifiers (self, this, user, context): Implemented

## Acceptance Criteria

1. **`now()` Function**
   - Returns current timestamp as ISO 8601 string
   - Usable in expressions: `mutate createdAt = now()`
   - Deterministic override for testing

2. **`uuid()` Function**
   - Returns UUID v4 string
   - Usable in expressions: `mutate id = uuid()`
   - Deterministic override for testing

3. **Expression Support**
   - Call expressions work in guards, actions, computed properties
   - Clear error messages for unknown functions

## Technical Notes

- Implement in runtime-engine.ts expression evaluator
- Consider function registry pattern for extensibility
- Conformance tests must use deterministic overrides

## Related Files

- `src/manifest/runtime-engine.ts` - expression evaluation
- `docs/spec/builtins.md` - function specification
