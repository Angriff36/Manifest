# Regex Constraints

> **Audited (2026-07-15) @RYANSIGNED:** Spot-check OK — compile-time literal
> `RegExp` check + runtime `matches` fail-closed on bad patterns; fixture
> `63-regex-constraints.manifest`. Package **3.6.41**.

The `matches(value, pattern)` built-in tests a string value against a regular expression, enabling declarative format validation — emails, phone numbers, postal codes — inside constraint expressions. Invalid patterns are caught at compile time; the match itself is enforced at runtime.

## Syntax

`matches` is used inside constraint expressions. From the conformance fixture `src/manifest/conformance/fixtures/63-regex-constraints.manifest`:

```
entity ContactInfo {
  property required id: string
  property email: string = ""
  property phone: string = ""
  property zipCode: string = ""

  constraint validEmail: matches(self.email, "^[^@]+@[^@]+\\.[^@]+$") "Must be a valid email format"
  constraint validPhone: matches(self.phone, "^\\d{3}-\\d{3}-\\d{4}$") "Phone must be in XXX-XXX-XXXX format"
  constraint validZip: matches(self.zipCode, "^\\d{5}$") "Zip code must be 5 digits"
}

store ContactInfo in memory
```

The first argument is the string to test (typically a property via `self.`), the second is the pattern as a string literal. Backslashes are escaped within the string literal (`\\d`, `\\.`). The trailing quoted string is the constraint's failure message.

## Behavior

Regex constraints are validated in two places.

At compile time, the IR compiler (`src/manifest/ir-compiler.ts`, around line 751) inspects every transformed call expression. When the callee is the identifier `matches`, there are at least two arguments, and the second argument is a string literal, it attempts `new RegExp(patternArg.value.value)`. If construction throws, the compiler emits an error diagnostic (`Invalid regex pattern in matches(): "..."`) at the call's source position. Patterns that are not literal strings (for example a pattern passed through a variable) are not validated at compile time because there is nothing constant to test.

At runtime, the `matches` built-in in the engine's `getBuiltins()` (`src/manifest/runtime-engine.ts`, around line 807) returns `false` unless both arguments are strings, then evaluates `new RegExp(pattern).test(s)`. If the pattern fails to compile at runtime, the `try/catch` returns `false` rather than throwing. Because `matches` returns a boolean, it composes with the constraint machinery the same way any other boolean constraint expression does: a `false` result triggers the constraint's configured outcome.

## How it maps to projections

A `matches` constraint with a literal pattern is the natural source for a Zod `.regex()` refinement and a database `CHECK` constraint in projections that consume the IR's constraint expressions. The verified behavior here is the IR representation (the `matches` call carried in the constraint expression) plus compile-time and runtime enforcement; the specific projection emit is downstream of that representation.

## Notes & limitations

Compile-time validation only fires for literal string patterns; dynamic patterns are validated (and fail safe to `false`) only at runtime. The runtime uses the JavaScript `RegExp` engine, so pattern syntax and semantics are exactly those of ECMAScript regular expressions, with no flags applied. A non-string value or non-string pattern makes `matches` return `false`, which means a constraint over a null or non-string field will register as a failed match rather than being skipped.
