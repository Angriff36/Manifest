# Date and Time Types

Manifest represents points in time with the `datetime` type and offers UTC-based date component built-ins for extracting parts of a timestamp. This page documents what the language and runtime actually provide for date and time handling.

## Syntax

There is no dedicated conformance fixture introducing `date`, `time`, `duration`, or `interval` as primitive types — those keywords are not present in the lexer. The date type that the runtime and projections work with is `datetime`, used like any scalar property type:

```
entity Article {
  property required title: string
  timestamps
}
```

The `timestamps` modifier (fixture `src/manifest/conformance/fixtures/62-timestamp-auto-fields.manifest`) injects `createdAt` and `updatedAt` properties typed as `datetime`. Type names in Manifest are open strings, so a property may also be declared `property scheduledFor: datetime` and will compile, but no date-specific parsing or validation is attached to such a declaration.

Date components are read at runtime through expression built-ins operating on a numeric millisecond timestamp. From `src/manifest/conformance/fixtures/56-expression-builtins.manifest`:

```
entity DateUtils {
  property required id: string
  property baseTs: number = 0

  computed extractedYear: number = year(self.baseTs)
  computed extractedMonth: number = month(self.baseTs)
  computed extractedDay: number = day(self.baseTs)
  computed extractedHours: number = hours(self.baseTs)
  computed extractedMinutes: number = minutes(self.baseTs)
  computed extractedSeconds: number = seconds(self.baseTs)
}
```

## Behavior

The `datetime` type name flows through the type system as an open string; it is the type the IR compiler injects for `timestamps`-generated properties (`src/manifest/ir-compiler.ts`) and the value the runtime populates from `getNow()` on create and update.

The date built-ins in the runtime engine's `getBuiltins()` (`src/manifest/runtime-engine.ts`) all operate on a number interpreted as milliseconds since the epoch and return a UTC component:

- `year(ts)` returns `getUTCFullYear()`.
- `month(ts)` returns `getUTCMonth() + 1` (so January is 1, not 0).
- `day(ts)` returns `getUTCDate()`.
- `hours(ts)`, `minutes(ts)`, `seconds(ts)` return the corresponding UTC components.

Each returns the input unchanged when it is not a number. UTC methods are used deliberately so results are timezone-independent and deterministic.

## How it maps to projections

The `timestamps`-injected `datetime` properties map to native Prisma column attributes (`@default(now())` and `@updatedAt`) in the Prisma projection. There is no separate projection mapping for `date`, `time`, `duration`, or `interval` types because those types do not exist in the implementation.

## Notes & limitations

This is the most significant source/summary discrepancy in this set. The feature summary for `date-time-types` claims dedicated `Date`, `Time`, `Duration`, and `Interval` primitive types with database column mappings and date arithmetic. None of that is in the source: the lexer registers no such keywords, no conformance fixture introduces them, and the feature's own agent output records that the session actually implemented `decimal`, `money`, and `enum` instead. What genuinely exists is the `datetime` type (notably via `timestamps`) and the six UTC date-component built-ins documented above. There are no date arithmetic, comparison, or formatting built-ins beyond component extraction.
