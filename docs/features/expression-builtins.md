# Expression Built-ins

Manifest's expression language ships a library of deterministic, side-effect-free built-in functions: string and numeric helpers, UTC date components, and aggregate operations over collections. The aggregates accept optional mapper or predicate lambdas, letting computed properties summarize related entities declaratively.

## Syntax

### Scalar and string built-ins

From `src/manifest/conformance/fixtures/56-expression-builtins.manifest`:

```
command testStringOps(input: string) {
  guard input != ""
  compute cleaned = trim(input)
  compute partCount = count(split(input, ","))
  compute hasPrefix = startsWith(input, "hello")
  compute hasSuffix = endsWith(input, "world")
  compute swapped = replace(input, "old", "new")
  compute upper = toUpperCase(input)
  compute lower = toLowerCase(input)
  compute charCount = length(input)
  compute slice = substring(input, 0, 5)
  compute foundAt = indexOf(input, "world")
}
```

Numeric helpers `abs`, `round`, `floor`, `ceil`, `min`, `max` and array helper `sum` appear in the same fixture, and the date components `year/month/day/hours/minutes/seconds` operate on a millisecond timestamp.

### Aggregate built-ins with lambdas

From `src/manifest/conformance/fixtures/64-aggregate-computed-properties.manifest`:

```
entity Order {
  property required customerName: string
  property status: string = "pending"

  hasMany lineItems: LineItem

  computed totalAmount: number = sum(self.lineItems, (item) => item.price * item.quantity)
  computed itemCount: number = count_of(self.lineItems)
  computed averagePrice: number = avg(self.lineItems, (item) => item.price)
  computed cheapestItem: number = min_of(self.lineItems, (item) => item.price)
  computed mostExpensiveItem: number = max_of(self.lineItems, (item) => item.price)
  computed highValueCount: number = count_of(self.lineItems, (item) => item.price * item.quantity > 50)
}

entity LineItem {
  property required price: number
  property quantity: number = 1

  belongsTo order: Order

  computed lineTotal: number = price * quantity
}

store Order in memory
store LineItem in memory
```

Each aggregate takes a collection (typically a `hasMany` relationship via `self.`) and an optional lambda. For `sum`, `avg`, `min_of`, `max_of` the lambda maps each element to a number; for `count_of` the lambda is a predicate selecting which elements to count.

## Behavior

All built-ins live in the runtime engine's `getBuiltins()` (`src/manifest/runtime-engine.ts`).

The aggregates behave as follows when given a lambda: `sum` adds each mapped number; `avg` averages mapped numbers (0 for an empty collection); `min_of` / `max_of` return the smallest / largest mapped number (or `undefined` for an empty collection); `count_of` returns the total length without a predicate, or the count of elements for which the predicate is truthy. Without a lambda, `sum` and `avg` operate on the raw numeric elements and `count_of` returns the collection length. Each guards against a non-array first argument: `sum` returns its argument unchanged, `avg` returns 0, `count_of` returns 0, `min_of`/`max_of` return `undefined`, and `filter`/`map` return an empty array (or the array unchanged when no callback is supplied).

Because aggregating over a `hasMany` relationship requires resolving related instances asynchronously, the lambda-bearing branches return promises that the evaluator awaits. The element mapper is invoked once per element and its result awaited, keeping evaluation deterministic for a fixed runtime context.

Scalar helpers are straightforward: numeric helpers delegate to `Math`, `min`/`max` are variadic over numeric arguments, string helpers wrap the corresponding `String.prototype` methods (returning the input unchanged for non-strings), and the date components use UTC methods so results are timezone-independent.

## How it maps to projections

These functions are runtime expression semantics rather than schema. Computed properties built from them are carried in the IR as expressions; projections that evaluate or transpile expressions reproduce the same function set.

## Notes & limitations

Two distinct count helpers exist: `count(array)` (a plain length/count used in fixture 56) and `count_of(collection, predicate?)` (the aggregate in fixture 64). The aggregates are designed for collections — using one on a non-array yields the safe fallbacks listed above rather than an error. `min`/`max` are variadic over scalar arguments, which is different from `min_of`/`max_of` that reduce a collection. All functions are side-effect-free and deterministic given identical input and runtime context.
