# Value Object Types

A `value` declaration defines a reusable composite type that embeds inline in entity properties rather than living in its own table. Value objects group related fields — money, addresses — into a single named shape that several entities can share.

## Syntax

Value objects are top-level declarations containing only property declarations. From the conformance fixture `src/manifest/conformance/fixtures/60-value-objects.manifest`:

```
value Money {
  property amount: decimal
  property currency: string
}

value Address {
  property street: string
  property city: string
  property country: string
}

entity Product {
  property required id: string
  property name: string
  property price: Money
  property billingAddress: Address
}

entity Order {
  property required id: string
  property total: Money
  property shippingAddress: Address
}

store Product in memory
store Order in memory
```

An entity references a value object by using its name as a property type (`price: Money`). The same value object can be embedded in multiple entities.

## Behavior

`value` is context-sensitive in `src/manifest/lexer.ts`: it is emitted as an identifier token, not a reserved keyword, so `property value: number` and `mutate value = 1` continue to parse without reserved-word errors. The parser recognizes the declaration form `value Name { ... }` via dispatch and `parseValueObject()` (`src/manifest/parser.ts`), which validates that the body contains only property declarations.

The IR compiler's `transformValueObject()` (`src/manifest/ir-compiler.ts`) produces an `IRValueObject`, and `transformProgram()` collects them into the top-level `values` array on the IR. The IR schema (`docs/spec/ir/ir-v1.schema.json`) declares `IRValueObject` and a required `values` field, so every compiled program carries a `values` array (empty when none are declared).

A property whose type name matches a declared value object is identified by checking that name against `ir.values`. The runtime engine does not impose value-object-specific behavior; embedded values are carried as ordinary property data.

## How it maps to projections

The code generator's `genValueObject()` (`src/manifest/generator.ts`) emits a TypeScript interface for each value object. The Prisma projection (`src/manifest/projections/prisma/generator.ts`) detects a property whose type matches a declared value object and emits it as a `Json` (JSONB) column rather than a foreign-key relationship or a separate table. The Drizzle projection behaves the same way (jsonb column).

Value-object embedding for persistence is only supported for SQL-persistence projections (Prisma, Drizzle, prisma-store), which emit value-object properties as `Json`/`jsonb` columns. Other projections handle them as follows:

- **Convex**: hard-errors (`CONVEX_UNKNOWN_TYPE`) and skips the property.
- **OpenAPI**: emits a proper `object` schema for the value object in `components/schemas` and references it via `$ref` in every property that uses it, preserving the full field structure.
- **Zod**: emits an inline `z.object({ ... })` expression with each field correctly typed, enabling field-level validation.

The reference runtime carries embedded value-object data as ordinary property data with no structural validation.

## Notes & limitations

The summary describes value objects as "immutable by design." That is a design statement, not a runtime-enforced property: the reference runtime does not freeze or reject mutation of embedded value data, and there is no immutability check in the compiler or engine. The summary also mentions "flattened columns" as an alternative projection; the Prisma generator reviewed emits JSONB only. Value object bodies are restricted to properties — relationships, commands, and other members are rejected by the parser.
