# Decimal and Money Types

The `decimal` and `money` primitive types represent high-precision numbers with optional precision and scale parameters, intended for monetary amounts and other values where binary floating point is unacceptable.

## Syntax

Both types accept an optional `(precision, scale)` parameter list and can otherwise be used like any scalar. From the conformance fixture `src/manifest/conformance/fixtures/56-decimal-type.manifest`:

```
entity Invoice {
  property required description: string
  property amount: decimal(10, 2) = 0
  property tax: money(12, 4) = 0
  property total: decimal = 0
  property optionalFee: money?
}

store Invoice in memory
```

`decimal(10, 2)` declares 10 total digits with 2 fractional digits. `money(12, 4)` is the same shape with higher precision. Both types are valid without parameters (`decimal`, `total`), in which case no precision or scale is recorded. The `?` suffix makes the property nullable (`money?`).

## Behavior

`decimal` and `money` are reserved keywords in `src/manifest/lexer.ts`. The parser's `parseType()` (`src/manifest/parser.ts`) special-cases a `(` immediately after the type name only when the name is `decimal` or `money`: it reads the precision token, requires a comma, reads the scale token, and stores them as `params: { precision, scale }` on the `TypeNode`. Any other type name followed by `(` is not treated as parameterized.

The IR compiler's `transformType()` (`src/manifest/ir-compiler.ts`) copies `params` onto the emitted `IRType` only when present, so unparameterized `decimal`/`money` types produce no `params` object. The IR schema (`docs/spec/ir/ir-v1.schema.json`) defines `params` with `precision` and `scale` fields on `IRType`.

These types do not introduce runtime arithmetic or validation of their own. The runtime engine treats their values as ordinary numbers; there is no decimal arithmetic library wired into the evaluator, and precision/scale are metadata carried for projection use rather than enforced at runtime.

## How it maps to projections

The summary states the intent for `decimal`/`money` to map to Postgres `NUMERIC` and to a decimal library such as `Decimal.js` or `big.js` in generated TypeScript, with compile-time precision/scale validation. What is verified in source is the IR-level representation — the `params` object carrying precision and scale — which is the input a projection would consume. The specific generator mappings and compile-time precision validation are described as intent in the summary and are not present in the type/parser/compiler code reviewed.

## Notes & limitations

The summary's claim that the type "validates against precision/scale constraints at compile time" is not borne out by the parser or IR compiler, which only record the values. The `optionalFee: money?` form shows nullable parameterless usage works. Runtime values are plain numbers, so any high-precision guarantee depends on a downstream projection rather than the reference runtime.
