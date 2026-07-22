# Entity Inheritance and Generics

Manifest supports three patterns for structuring entity types: single inheritance with `extends`, composition with `mixin`, and parameterized templates with generics.

**Status:** `extends`, `mixin`, and generic entity templates are **implemented** — the parser, IR compiler, and composition/generics expanders handle them (conformance fixtures `77`–`81`, `84`–`85`). Generic templates are compile-time only; only concrete instantiations appear in the IR.

`extends` and `mixin` are compile-time features — the IR and runtime see fully flattened entities.

## Entity Inheritance (`extends`)

Single inheritance lets one entity derive properties, commands, policies, and constraints from a parent entity.

```text
entity BaseEntity {
  property required id: string = ""
  property active: boolean = true

  command Archive() {
    guard self.active == true
    mutate active = false
    emit EntityArchived
  }
}

entity Product extends BaseEntity {
  property required name: string = ""
  property price: number = 0
}
```

**Behavior:**

- Child inherits all properties, computed properties, constraints, commands, and policies from the parent.
- Own declarations take precedence over inherited ones (override by name).
- Child declarations appear after inherited ones in the merged arrays.
- The `IREntity` stores a `parent?: string` field for traceability only — all members are pre-flattened by the IR compiler before IR is produced; no projection reads the `parent` field for member resolution.

**Validation:**

- Unknown parent reference produces a compile error: `Entity 'X' references unknown entity 'Y' in inheritance`.
- Cycle detection is transitive: `A extends B`, `B extends C`, `C extends A` produces `Entity inheritance cycle detected: A -> B -> A`.
- Only single inheritance is supported (one parent per entity).

## Mixin Composition

Mixins apply reusable trait definitions to entities. Multiple mixins can be applied to a single entity.

```text
entity Timestampable {
  property createdAt: string = ""
  property updatedAt: string = ""
}

entity SoftDeletable {
  property deletedAt: string = ""

  command SoftDelete() {
    mutate deletedAt = "2024-01-01"
    emit EntitySoftDeleted
  }
}

entity Article mixin Timestampable, SoftDeletable {
  property required title: string = ""
}
```

**Behavior:**

- Multiple mixins are listed comma-separated: `entity Foo mixin A, B, C { ... }`.
- The `IREntity` stores `mixins?: string[]` for traceability only — all members are pre-flattened by the IR compiler; no projection reads the `mixins` field for member resolution. Mixin source entities remain as standalone entries in `ir.entities`.
- ~~Resolution order for a given member name: own declarations first, then mixins in declaration order, then inherited parent.~~
>
> **Correction (2026-07-15) @RYANSIGNED:** Composition merge order is **parent → mixins → own**; **own wins** on name conflict (`src/manifest/entity-composition.ts`). Mixin–mixin name clashes are not a dedicated compile error — prefer disjoint mixin surfaces.

**Validation:**

- Unknown mixin reference produces a compile error.
- The `mixin` keyword is reserved and cannot be used as an entity, property, command, or parameter name.

## Combining `extends` and `mixin`

Both inheritance mechanisms can be combined on a single entity:

```text
entity Document extends BaseEntity mixin Timestampable, SoftDeletable {
  property required title: string
}
```

The resulting `IREntity` has both `parent: "BaseEntity"` and `mixins: ["Timestampable", "SoftDeletable"]`, with all members from all sources merged into the flat property, command, policy, and constraint arrays.

## Generic / Parameterized Entity Types

> **Status: Implemented (2026-07-22).** Parse + expand via `entity-generics.ts`. Fixture `84` proves successful IR emission; fixture `85` proves arity-mismatch diagnostics.

Generic entities define type parameters that are substituted during compilation, producing concrete entity instantiations.

**Behavior:**

- Generic templates are compile-time only. Only concrete instantiations appear in the IR. Template entities are omitted from the IR output.
- Type parameters are substituted wherever they appear in property types, computed property types, relationship targets, and command parameter/return types within the template body.
- Instantiation bodies can add extra properties, relationships, commands, constraints, and policies. Members with the same name as template members take precedence (override).

**Validation:**

- Instantiation must reference a known generic entity. Referencing a non-generic or unknown entity produces a compile error.
- Type argument count must match the template's type parameter count (arity validation). Mismatches produce a compile error.

**Syntax:**

```
entity Name<T, U> { ... }              // Template declaration
entity Alias = Name<ConcreteType> { ... }  // Instantiation
```

## IR Representation

All three features are resolved at compile time into flattened `IREntity` objects. The IR retains traceability fields but requires no runtime resolution:

- `parent?: string` -- The entity this entity extends (for traceability).
- `mixins?: string[]` -- Mixins applied to this entity (for traceability).
- `typeParameters?: string[]` -- Generic type parameters (for traceability on templates).

Generic templates are omitted from the IR entirely. Only concrete instantiations are emitted. No inheritance, mixin, or generic resolution happens at runtime.

## Resolution Algorithm

The IR compiler's `resolveEntityInheritance()` method:

1. Validates all `extends` and `mixin` references against known entities.
2. Detects cycles in the inheritance graph using a visited-set traversal.
3. For each entity with a parent and/or mixins, collects inherited members.
4. Merges inherited members with own declarations, with own declarations taking precedence.
5. Produces flat entity nodes with all members directly in their arrays.

For generics, `expandEntityGenerics()` (called from the IR compiler before composition):

1. Identifies generic template entities (with `typeParams`).
2. Finds instantiations referencing those templates (`genericAlias`).
3. Validates arity (type argument count matches parameter count).
4. Clones the template body and substitutes type parameter references.
5. Merges any extra body members from the instantiation (own wins on name).
6. Removes templates so only concrete entities are emitted in the IR.

## Conformance Fixtures

- `77-entity-extends.manifest` -- Single `extends` inheritance
- `78-entity-mixin.manifest` -- `mixin` composition
- `79-entity-extends-and-mixin.manifest` -- Both combined
- `80-entity-extends-unknown-parent.manifest` -- Error: unknown parent reference
- `81-entity-extends-cycle.manifest` -- Error: circular inheritance detected
- `84-generic-entity.manifest` -- Happy path: `Paginated<T>` template + `ItemList = Paginated<Item>` instantiation
- `85-generic-arity-mismatch.manifest` -- Error: wrong number of type arguments

## Notes

- The `mixin` keyword is now a reserved word. It cannot be used as an entity, property, command, or parameter name.
- Entity order in the IR output is preserved as declaration order (not sorted alphabetically).
- Override semantics: if a child entity declares a member with the same name as one from a parent or mixin, the child's declaration wins and appears after inherited members in the merged array.
- All member types are flattened: `properties`, `commands`, `policies`, `defaultPolicies`, and `constraints` arrays contain all inherited, composed, and instantiated members directly.
