# Range and Boundary Constraints

The `min`, `max`, `between`, and `length` built-ins express numeric range and string length validation declaratively inside constraints and command guards, without writing custom comparison logic.

## Syntax

These built-ins appear in constraint expressions and guards. From the conformance fixture `src/manifest/conformance/fixtures/57-range-constraint-builtins.manifest`:

```
entity Product {
  property required id: string
  property name: string = ""
  property price: number = 0
  property quantity: number = 0
  property discount: number = 0

  constraint priceRange: between(self.price, 0.01, 99999.99) "Price must be between 0.01 and 99999.99"
  constraint quantityMin: min(self.quantity, 0) "Quantity must be at least 0"
  constraint discountMax: max(self.discount, 100) "Discount cannot exceed 100%"
  constraint nameMinLength: length(self.name) >= 1 "Name must not be empty"
  constraint nameMaxLength: length(self.name) <= 255 "Name must be at most 255 characters"

  command setPrice(newPrice: number) {
    guard newPrice > 0
    mutate price = newPrice
    emit PriceChanged
  }

  command applyDiscount(pct: number) {
    guard between(pct, 0, 100)
    mutate discount = pct
    emit DiscountApplied
  }
}

event PriceChanged: "product.price.changed" {
}

event DiscountApplied: "product.discount.applied" {
}

store Product in memory
```

`between(value, low, high)` is inclusive on both ends. `length(value)` returns a string's length, which is then compared with ordinary operators (`>= 1`, `<= 255`).

> **Correction (2026-07-15) @RYANSIGNED:** Do **not** write
> `constraint x: min(self.n, 0)` / `max(self.n, 100)` expecting a lower/upper-bound
> check. `min`/`max` are variadic numeric reducers (`Math.min` / `Math.max`),
> **not** boolean boundary predicates. Constraint polarity is `!!result` (unless
> `failWhen`). `min(5, 0)` → `0` → **fails**; `min(-1, 0)` → `-1` → **passes**.
> Use comparisons (`self.quantity >= 0`) or `between(...)` for bounds. Fixture
> `57-range-constraint-builtins.manifest` still contains the old `min`/`max`
> forms — they exercise the reducer, not a dedicated bounds API.

## Behavior

The built-ins are implemented in the runtime engine's `getBuiltins()` (`src/manifest/runtime-engine.ts`):

- `between(value, low, high)` returns `true` only when all three are numbers and `value >= low && value <= high`; otherwise it returns `false`.
- `min(...args)` and `max(...args)` are variadic: they filter their arguments to numbers and return `Math.min` / `Math.max` of those, or `undefined` if none are numeric — **not** boolean boundary predicates (see correction above).
- `length(value)` returns the length of a string (it is the same `length` built-in used for strings generally).

Because these are plain boolean- or number-returning expressions, they slot into the existing constraint and guard evaluation paths unchanged. In a guard, a falsey result halts command execution in order, consistent with Manifest's strict guard semantics. In a constraint, the result drives the constraint's configured outcome.

There is also a static analysis module, `src/manifest/constraint-analysis.ts`, that extracts numeric range and length bounds from these constraint expressions and exposes converters for SQL `CHECK`, Zod chains, and OpenAPI bounds.

## How it maps to projections

The constraint-analysis converters feed projections: numeric ranges become SQL `CHECK` clauses and Zod `.min()/.max()` calls, and the OpenAPI projection (`src/manifest/projections/openapi/generator.ts`) emits `minimum`/`maximum`/`minLength`/`maxLength` on JSON Schema properties. The Prisma projection consumes the same analysis for `@@check` generation from `between`/`min`/`max` expressions.

## Notes & limitations

Note the difference in shape: `between` returns a boolean directly, while `min` and `max` return a number. At **runtime**, `!!min(...)` / `!!max(...)` polarity is not a bounds check (see correction above). Separately, `constraint-analysis.ts` **statically** interprets the call shapes `min(self.prop, N)` / `max(self.prop, N)` as lower/upper bounds for SQL/Zod/OpenAPI projection emit — that analysis path does not change runtime evaluation. Prefer `self.prop >= N` / `between(...)` in new code so runtime and projection agree. `between` returns `false` for any non-numeric operand, so a constraint over a null field registers as a failure rather than being skipped.
