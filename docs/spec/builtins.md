# Built-ins

Last updated: 2026-07-14 (reserved-names count corrected; Roles builtins documented)
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
- `matches(s, pattern)` — regex test; returns `true` if `s` matches the regex `pattern`, `false` if `s` is non-string, `pattern` is non-string, or `pattern` is an invalid regex. Compile-time validation emits an error diagnostic when `pattern` is a literal with invalid regex syntax.
- `search(text, query)` — full-text match. Returns `true` iff every whitespace-delimited word token in `query` appears as a whole word (case-insensitive) in `text`. Returns `false` if either argument is non-string or query is empty. Deterministic and pure. Evidence: conformance fixture `89-full-text-search.manifest`.

### Property Modifier: `searchable`

The `searchable` modifier may be applied to `string` properties to declare them as full-text search targets. The compiler emits an error diagnostic if `searchable` is applied to a non-string property. In projection generators, `searchable` properties generate:

- **Prisma**: `@@fulltext([field1, field2])` model attribute
- **Drizzle (PostgreSQL)**: GIN index on `to_tsvector('english', ...)` expression

### Math

- `abs`, `round`, `floor`, `ceil`
- `min(...)`, `max(...)` — numeric arguments only; empty → `undefined`
- `between(value, low, high)` — inclusive range test on numbers

### Array / Aggregate

- `sum(arr)` — sum of numeric elements; non-arrays pass through
- `sum(arr, mapper)` — apply `mapper` to each element, sum the numeric results. `mapper` is a lambda: `(item) => item.price * item.quantity`
- `avg(arr)` — arithmetic mean of numeric elements; returns `0` for empty arrays
- `avg(arr, mapper)` — apply `mapper` to each element, compute mean of numeric results
- `min_of(arr)` — minimum numeric value; returns `undefined` for empty arrays
- `min_of(arr, mapper)` — apply `mapper` to each element, return minimum numeric result
- `max_of(arr)` — maximum numeric value; returns `undefined` for empty arrays
- `max_of(arr, mapper)` — apply `mapper` to each element, return maximum numeric result
- `count_of(arr)` — array length (equivalent to `length(arr)` for arrays)
- `count_of(arr, predicate)` — count elements where `predicate` returns truthy
- `filter(arr, predicate)` — return elements where `predicate` returns truthy
- `map(arr, mapper)` — apply `mapper` to each element, return new array

Aggregate functions are designed for computed properties over `hasMany` relationships:

```manifest
entity Order {
  hasMany lineItems: LineItem
  computed totalAmount: number = sum(self.lineItems, (item) => item.price * item.quantity)
  computed itemCount: number = count_of(self.lineItems)
  computed avgPrice: number = avg(self.lineItems, (item) => item.price)
}
```

Evidence: conformance fixture `64-aggregate-computed-properties.manifest`.

### Date (UTC, timestamp in ms)

- `year(ts)`, `month(ts)` (1–12), `day(ts)`, `hours(ts)`, `minutes(ts)`, `seconds(ts)`
- `dateOf(ts)` — `"YYYY-MM-DD"` (UTC) for epoch-ms `ts`; non-finite input or a timestamp outside the representable Date range (±8,640,000,000,000,000 ms) returns `null`
- `timeOf(ts)` — `"HH:MM:SS"` (UTC) for epoch-ms `ts`; non-finite input or a timestamp outside the representable Date range returns `null`
- `datetimeOf(dateStr, timeStr?)` — epoch ms UTC from `"YYYY-MM-DD"` (+ optional `"HH:MM:SS"`, default midnight). Malformed or non-calendar input returns `null` (never NaN)
- `addDuration(ts, d)` — `ts + d` (both numbers, ms); non-finite input (non-number, NaN, or Infinity) returns `null`
- `durationBetween(a, b)` — `b - a` (ms); non-finite input returns `null`
- `durationDays(n)`, `durationHours(n)`, `durationMinutes(n)`, `durationSeconds(n)` — ms constructors; non-finite input returns `null`

All date builtins are pure and UTC-only.

### Feature Flags

- `flag(name)` — resolves a feature flag value from the configured provider. Returns the provider's value (boolean, string, number, or object) when a `flagProvider` is configured via `RuntimeOptions.flagProvider`. Returns `false` when no provider is configured (safe default — features off). Returns `false` when `name` is not a string. Purity: `time-dependent` (flag values may change based on external state).

Feature flags enable commands and policies to reference feature flags declaratively:

```manifest
entity Feature {
  property status: string = "off"

  command activate() {
    guard flag("new-activation-flow")
    mutate status = "active"
  }
}
```

Provider configuration:

```typescript
const runtime = new RuntimeEngine(ir, context, {
  flagProvider: (name) => launchDarklyClient.variation(name, false),
});
```

Evidence: conformance fixture `66-feature-flags.manifest`.

### Roles

_Added 2026-07-14 — these builtins were implemented but previously undocumented here._

- `hasPermission(action, target?)` — `true` when the current user's role
  (`context.user.role`) grants `action` (optionally scoped to `target`) under the
  program's role hierarchy (including inherited permissions and deny rules).
  Returns `false` when `action` is not a string or no user role is bound.
- `roleAllows(roleName, action, target?)` — same check for an explicit role name
  instead of the current user. Returns `false` when `roleName` or `action` is not
  a string.

Role-name matching is **case-sensitive**: `roleAllows("Admin", ...)` and
`roleAllows("admin", ...)` refer to different roles.

Evidence: conformance fixture `71-role-hierarchy.manifest`; implementation
`RuntimeEngine.getBuiltins()` in runtime-engine.ts.

## Custom Expression Functions (Plugin API)

Plugin authors and project configurations can register custom deterministic expression
functions via `RuntimeOptions.customBuiltins`. Functions are available in guard,
constraint, policy, and computed property expressions.

### Registration

Custom builtins are declared via the `BuiltinFunctionPlugin` interface in `plugin-api.ts`:

```typescript
interface BuiltinFunctionPlugin {
  name: string; // Function identifier
  purity: 'pure' | 'time-dependent' | 'random'; // Determinism guarantee
  arity: number; // Required arguments (-1 for variadic)
  fn: (...args: unknown[]) => unknown; // Evaluation implementation
}
```

The plugin loader collects registered builtins into a `Map<string, Function>` which is
passed to `RuntimeEngine` via `RuntimeOptions.customBuiltins`. Core builtins always take
precedence on name collision — reserved names cannot be overridden.

### Reserved Names

~~The following 36 names are reserved and cannot be used by plugins:
`now`, `uuid`, `trim`, `split`, `count`, `startsWith`, `endsWith`, `replace`,
`toUpperCase`, `toLowerCase`, `length`, `substring`, `indexOf`, `matches`, `search`,
`abs`, `round`, `floor`, `ceil`, `min`, `max`, `between`,
`sum`, `avg`, `min_of`, `max_of`, `count_of`, `filter`, `map`,
`year`, `month`, `day`, `hours`, `minutes`, `seconds`,
`flag`.~~

> **Correction (2026-07-14):** the list above undercounted. Every core builtin in
> `RuntimeEngine.getBuiltins()` (runtime-engine.ts) wins name collisions against
> plugin builtins, so all **47** implemented names are reserved:
> `now`, `uuid`, `trim`, `split`, `count`, `startsWith`, `endsWith`, `replace`,
> `toUpperCase`, `toLowerCase`, `length`, `substring`, `indexOf`, `matches`, `search`,
> `abs`, `round`, `floor`, `ceil`, `min`, `max`, `between`,
> `sum`, `avg`, `min_of`, `max_of`, `count_of`, `filter`, `map`,
> `year`, `month`, `day`, `hours`, `minutes`, `seconds`,
> `dateOf`, `timeOf`, `datetimeOf`, `addDuration`, `durationBetween`,
> `durationDays`, `durationHours`, `durationMinutes`, `durationSeconds`,
> `flag`, `hasPermission`, `roleAllows`.

### Example

```typescript
import { definePlugin } from '@angriff36/manifest/plugin-api';

export default definePlugin({
  manifest: {
    name: '@acme/custom-functions',
    version: '1.0.0',
    pluginApiVersion: '1',
    manifestVersion: '>=1.0.0',
  },
  builtins: [
    {
      name: 'isEven',
      purity: 'pure',
      arity: 1,
      fn: (x) => typeof x === 'number' && x % 2 === 0,
    },
  ],
});
```

Once registered, `isEven` is callable in manifest expressions:

```manifest
entity Counter {
  property value: number = 0
  command increment(amount: number) {
    guard isEven(amount)
    mutate value = self.value + amount
  }
}
```

Evidence: runtime-engine.test.ts § "Custom Builtins (plugin injection)".

### Nonconformance

- ~~The IR runtime does not provide `now()` or `uuid()` built-ins.~~
- **RESOLVED (2026-02-05)**: Both functions are implemented in runtime-engine.ts:279-284. `now()` uses `Date.now()` (or custom override), `uuid()` uses `crypto.randomUUID()` (or custom override).
