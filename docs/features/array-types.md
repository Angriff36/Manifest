# Array Types

> **Audited (2026-07-15) @RYANSIGNED:** Spot-check OK — `string[]` /
> `array<T>` normalize to IR `array` + `generic`; fixture
> `40-array-properties.manifest`. Package **3.6.4**.

Array properties hold multiple scalar values in a single field, distinct from relationships (which model collections of entities). They are declared with either postfix `[]` sugar or explicit `array<T>` generic syntax.

## Syntax

Both forms appear in the conformance fixture `src/manifest/conformance/fixtures/40-array-properties.manifest`, along with array-aware constraint expressions:

```
entity TaggedDocument {
  property required id: string
  property tags: string[] = []
  property scores: array<number> = []

  constraint noEmptyTags: self.tags.length > 0
  constraint hasTags: self.tags.contains("published")
}

store TaggedDocument in memory
```

`string[]` and `array<string>` are equivalent. An empty array literal `[]` is a valid default. Constraints can reach into array values with member access such as `self.tags.length` and method-style calls like `self.tags.contains("published")`.

## Behavior

The parser's `parseType()` (`src/manifest/parser.ts`) treats postfix `[]` as sugar: after reading a type name (and any nullability `?`), it looks ahead for a `[` immediately followed by `]` and, when found, rewrites the type to `{ name: 'array', generic: <inner type> }`. The explicit `array<number>` form is parsed by the same generic-type path (`<` ... `>`). Both therefore normalize to an `array` type carrying a `generic` element type in the AST and IR.

Array element types may themselves carry parameters: because the inner type goes through `parseType()`, the generic element preserves details like decimal precision where applicable.

The array-aware constraint operators (`length`, `contains`) are evaluated by the runtime expression evaluator as the constraints are checked. The fixture's two constraints (`noEmptyTags`, `hasTags`) are both enforced; the feature summaries note that an array fixture's runtime results once reported two constraint failures where one was expected, reflecting that both constraints are independently evaluated rather than short-circuited.

## How it maps to projections

The description for this feature states the intent that array types map to PostgreSQL array or JSONB columns in database projections and to Zod array schemas in validation projections, distinct from relationship modeling. The verified, present behavior is the normalized `array` IR type with a `generic` element type, which is the structural input those projections consume.

## Notes & limitations

No standalone summary was recorded for `array-type` in `completed-feature-summaries.md`; the syntax here is taken directly from the conformance fixture. The constraint helpers shown (`.length`, `.contains(...)`) are expression-level operations rather than dedicated array constraint primitives, and the feature description also mentions `all` and `any` forms which are not exercised by the fixture. Array properties are scalar-valued collections and are deliberately separate from `hasMany` relationships, which model entity collections.
