# Enum Types

First-class `enum` declarations define a closed, named set of values that properties can reference. Each member may carry an optional display label and an optional ordinal, giving entities a typed vocabulary for status fields, priorities, and other fixed value sets.

## Syntax

Enums are top-level declarations. The conformance fixture `src/manifest/conformance/fixtures/57-enum-type.manifest` exercises bare members, members with labels, and members with ordinals, plus enum-typed entity properties:

```
enum Status {
  draft
  published = "Published"
  archived(2)
}

entity Article {
  property required title: string
  property status: Status = draft
  property priority: Priority
}

enum Priority {
  low = "Low Priority"
  medium = "Medium Priority"
  high = "High Priority"
}

store Article in memory
```

A member written as `name` is a plain value; `name = "Label"` attaches a display label; `name(ordinal)` attaches a numeric ordinal. An enum may be referenced as a property type before or after its own declaration in the file. A property default such as `= draft` refers to a member by name.

## Behavior

`enum` is a reserved keyword in `src/manifest/lexer.ts`. The parser builds `EnumNode` / `EnumValueNode` AST nodes, and the IR compiler's `transformEnum()` (`src/manifest/ir-compiler.ts`) emits an `IREnum` with a `name`, optional `module`, and a `values` array. Each value carries its `name` and, only when present, a `label` and an `ordinal` — absent metadata is omitted rather than defaulted, so the IR stays minimal.

Enums collected from the top-level program and from inside modules are merged into the single top-level `enums` array on the IR. Module declarations additionally record their enum names.

Enum-typed properties are stored as a `TypeNode` whose `name` is the enum name. Type names in Manifest are open strings rather than a closed primitive set, so the enum reference is carried through the type system without a separate validation pass.

## How it maps to projections

The IR carries the full enum definition (names, labels, ordinals), which is the input downstream projections use to emit database enum columns and TypeScript union types. The summary notes describe this as future projection work; the verified, present behavior is the IR-level representation, not a specific generator output.

## Notes & limitations

The feature summary describes "transition constraints" on enum members and validation of enum member references inside guards and expressions. Neither is present in the source: the IR carries only `name`, `label`, and `ordinal` per value, and there is no enum-specific reference checker in the compiler. Treat those as aspirational.

Labels and ordinals are independent and optional per member; mixing labelled, ordinal, and bare members in one enum (as the fixture does) is valid. Because type names are not a closed set, referencing an undeclared enum name as a property type is not rejected at compile time by the enum machinery itself.
