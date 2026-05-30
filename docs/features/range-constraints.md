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

`between(value, low, high)` is inclusive on both ends. `length(value)` returns a string's length, which is then compared with ordinary operators (`>= 1`, `<= 255`). `min` and `max` are used here as boundary checks against a single bound.

## Behavior

The built-ins are implemented in the runtime engine's `getBuiltins()` (`src/manifest/runtime-engine.ts`):

- `between(value, low, high)` returns `true` only when all three are numbers and `value >= low && value <= high`; otherwise it returns `false`.
- `min(...args)` and `max(...args)` are variadic: they filter their arguments to numbers and return `Math.min` / `Math.max` of those, or `undefined` if none are numeric. Used as `min(self.quantity, 0)` they yield a number, so the constraint passing depends on how that result is interpreted by the constraint evaluator.
- `length(value)` returns the length of a string (it is the same `length` built-in used for strings generally).

Because these are plain boolean- or number-returning expressions, they slot into the existing constraint and guard evaluation paths unchanged. In a guard, a falsey result halts command execution in order, consistent with Manifest's strict guard semantics. In a constraint, the result drives the constraint's configured outcome.

There is also a static analysis module, `src/manifest/constraint-analysis.ts`, that extracts numeric range and length bounds from these constraint expressions and exposes converters for SQL `CHECK`, Zod chains, and OpenAPI bounds.

## How it maps to projections

The constraint-analysis converters feed projections: numeric ranges become SQL `CHECK` clauses and Zod `.min()/.max()` calls, and the OpenAPI projection (`src/manifest/projections/openapi/generator.ts`) emits `minimum`/`maximum`/`minLength`/`maxLength` on JSON Schema properties. The Prisma projection consumes the same analysis for `@@check` generation from `between`/`min`/`max` expressions.

## Notes & limitations

Note the difference in shape: `between` returns a boolean directly, while `min` and `max` return a number. The fixture uses `min(self.quantity, 0)` and `max(self.discount, 100)` as constraint expressions whose numeric result the constraint checker evaluates, whereas `length(...)` is paired with an explicit comparison operator. `between` returns `false` for any non-numeric operand, so a constraint over a null field registers as a failure rather than being skipped. The summary's mention of "compile-time constant folding" refers to the static bound extraction in `constraint-analysis.ts` used for projection, not to rewriting of the runtime expression.
