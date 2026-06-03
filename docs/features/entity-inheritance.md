# Entity Inheritance and Generics

Manifest supports three patterns for structuring entity types: single inheritance with `extends`, composition with `mixin`, and parameterized templates with generics. All three are compile-time features -- the IR and runtime see fully flattened entities with no inheritance metadata needed for execution.

## Entity Inheritance (`extends`)

Single inheritance lets one entity derive properties, commands, policies, and constraints from a parent entity.

```manifest
entity BaseEntity {
  property required id: string
  property active: boolean = true
  command Archive { mutate self.active = false }
}

entity Product extends BaseEntity {
  property required name: string
  property price: number = 0
}
```

**Behavior:**

- Child inherits all properties, computed properties, constraints, commands, and policies from the parent.
- Own declarations take precedence over inherited ones (override by name).
- Child declarations appear after inherited ones in the merged arrays.
- The `IREntity` stores a `parent?: string` field for traceability, but all members are resolved directly into the entity's flat arrays.

**Validation:**

- Unknown parent reference produces a compile error: `Entity 'X' references unknown entity 'Y' in inheritance`.
- Cycle detection is transitive: `A extends B`, `B extends C`, `C extends A` produces `Entity inheritance cycle detected: A -> B -> A`.
- Only single inheritance is supported (one parent per entity).

## Mixin Composition

Mixins apply reusable trait definitions to entities. Multiple mixins can be applied to a single entity.

```manifest
entity Timestampable {
  property createdAt: datetime
  property updatedAt: datetime
}

entity SoftDeletable {
  property deletedAt: datetime
  command SoftDelete { mutate self.deletedAt = now() }
}

entity Article mixin Timestampable, SoftDeletable {
  property required title: string
}
```

**Behavior:**

- Multiple mixins are listed comma-separated: `entity Foo mixin A, B, C { ... }`.
- The `IREntity` stores `mixins?: string[]` for traceability, but all members are resolved into flat arrays.
- Resolution order for a given member name: own declarations first, then mixins in declaration order, then inherited parent.

**Validation:**

- Unknown mixin reference produces a compile error.
- The `mixin` keyword is reserved and cannot be used as an entity, property, command, or parameter name.

## Combining `extends` and `mixin`

Both inheritance mechanisms can be combined on a single entity:

```manifest
entity Document extends BaseEntity mixin Timestampable, SoftDeletable {
  property required title: string
}
```

The resulting `IREntity` has both `parent: "BaseEntity"` and `mixins: ["Timestampable", "SoftDeletable"]`, with all members from all sources merged into the flat property, command, policy, and constraint arrays.

## Generic / Parameterized Entity Types

Generic entities define type parameters that are substituted during compilation, producing concrete entity instantiations.

```manifest
entity Paginated<T> {
  property required items: T[]
  property total: number = 0
  property page: number = 1
}

entity ProductList = Paginated<Product> {
  // Additional members specific to ProductList
}
```

**Behavior:**

- Generic templates are compile-time only. Only concrete instantiations appear in the IR. Template entities are omitted from the IR output.
- Type parameters are substituted wherever they appear in property types, computed property types, and relationship targets within the template body.
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

For generics, `resolveGenericInstantiations()`:

1. Identifies generic template entities (with `typeParameters`).
2. Finds instantiations referencing those templates.
3. Validates arity (type argument count matches parameter count).
4. Clones the template body and substitutes type parameter references.
5. Merges any extra body members from the instantiation.
6. Emits only concrete entities in the IR.

## Conformance Fixtures

- `77-entity-extends.manifest` -- Single `extends` inheritance
- `78-entity-mixin.manifest` -- `mixin` composition
- `79-entity-extends-and-mixin.manifest` -- Both combined
- `80-entity-extends-unknown-parent.manifest` -- Error: unknown parent reference
- `81-entity-extends-cycle.manifest` -- Error: circular inheritance detected
- `84-generic-entity.manifest` -- Generic template + instantiation with type substitution
- `85-generic-arity-mismatch.manifest` -- Error: wrong type argument count

## Notes

- The `mixin` keyword is now a reserved word. It cannot be used as an entity, property, command, or parameter name.
- Entity order in the IR output is preserved as declaration order (not sorted alphabetically).
- Override semantics: if a child entity declares a member with the same name as one from a parent or mixin, the child's declaration wins and appears after inherited members in the merged array.
- Module generics: `typeParameters` is stored on `IRModule` for traceability. The feature fully supports entity generics within modules; the existing template resolution mechanism works identically for module-scoped entities.
- All member types are flattened: `properties`, `commands`, `policies`, `defaultPolicies`, and `constraints` arrays contain all inherited and composed members directly.
