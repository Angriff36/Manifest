# Automatic Timestamp Fields

> **Audited (2026-07-15) @RYANSIGNED:** Spot-check OK — fixture is
> `62-timestamp-auto-fields.manifest` (not historical `59-…`); runtime
> `getNow()` create/update + Prisma `@default(now())` / `@updatedAt`. Package
> **3.6.41**.

The `timestamps` entity modifier auto-injects `createdAt` and `updatedAt` properties (marked with the `readonly` modifier for projection type-safety) and populates them at runtime, removing the boilerplate of declaring and maintaining audit timestamps by hand.

## Usage / Syntax

The modifier is a bare keyword placed inside an entity body. From the conformance fixture `src/manifest/conformance/fixtures/62-timestamp-auto-fields.manifest`:

```
entity Article {
  property required id: string
  property required title: string
  property body: string = ""
  timestamps
}

store Article in memory
```

No property declarations for `createdAt` or `updatedAt` are needed. `timestamps` is a reserved keyword registered in `src/manifest/lexer.ts`.

## Behavior / What it does

When an entity declares `timestamps`, the IR compiler sets `IREntity.timestamps: true` and injects two properties — `createdAt` and `updatedAt`, both of type `datetime` with the `readonly` modifier — unless the entity already declares a property of that name (the injection is idempotent and skips names that are already present).

The runtime engine (`src/manifest/runtime-engine.ts`) acts on the flag:

- On instance creation, when `entity.timestamps` is set, both `createdAt` and `updatedAt` are assigned the value of `getNow()`.
- On instance update, when `entity.timestamps` is set, `updatedAt` is reassigned to `getNow()` while `createdAt` is left untouched.

`getNow()` honors the deterministic clock supplied through `RuntimeOptions.now`, so tests can pin timestamps to a fixed value.

The Prisma projection (`src/manifest/projections/prisma/generator.ts`) translates the flag into native column attributes: `@default(now())` on `createdAt` and `@updatedAt` on `updatedAt`.

## Reference

- Source keyword: `timestamps` (lexer keyword list).
- IR field: `IREntity.timestamps?: boolean`; declared in `docs/spec/ir/ir-v1.schema.json`.
- Injected properties: `createdAt`, `updatedAt`, type `datetime`, modifier `readonly`.
- Runtime population: `getNow()` on create (both fields) and update (`updatedAt` only).
- Prisma attributes: `@default(now())`, `@updatedAt`.

## Related: manual `= now()` / `= today()` defaults

The `timestamps` modifier is the zero-boilerplate path. For a single timestamp field outside the `createdAt`/`updatedAt` pair, declare it explicitly with a `now()` (or `today()`) default:

```
property createdAt: datetime = now()
```

This call-expression default lowers to the `IRProperty.autoNow` flag (`now()`/`today()`, no arguments): the runtime stamps the current time on create when the caller does not supply a value, and the Prisma projection emits `@default(now())`. Before this lowering existed, such a default compiled to no default and was null-filled at runtime, breaking non-null store columns. See `docs/features/date-time-types.md` for the full `autoNow` behavior, the negative-literal default fold (`= -1`), the unsupported-call-default warning (e.g. `= uuid()`), and the guaranteed-null persistence warning on `create` commands.

## Notes & limitations

The injected fields carry the `readonly` modifier as a signal to projections (e.g., generated TypeScript types mark them read-only); the reference runtime does not block a `mutate` action from overwriting them at runtime. If a program manually declares `createdAt` or `updatedAt`, the auto-injection defers entirely to the manual declaration and does not add or override anything for that name. Population is driven by the runtime engine's create/update paths; stores or code paths that write instances without going through `createInstance`/`updateInstance` will not receive automatic timestamps.

Note on provenance: the consolidated feature summary references this fixture as `59-timestamp-auto-fields`, but the committed fixture in the repository is `62-timestamp-auto-fields.manifest`. The behavior described above is verified against the current source.
