# @manifest/stdlib

Curated standard library of reusable entity archetypes, property types, and
constraint definitions for the [Manifest DSL](../../).

Ship a curated set of common patterns so every Manifest project doesn't
re-invent the wheel for `Money`, `Address`, soft-delete, audit trails, and
state machines.

## What's in the box

| Kind      | Name            | Use case                                        |
| --------- | --------------- | ----------------------------------------------- |
| value     | `Money`         | Monetary amount with currency code              |
| value     | `Address`       | Postal address                                  |
| value     | `EmailAddress`  | Email with verification flag                    |
| value     | `PhoneNumber`   | Phone with country code + extension             |
| value     | `AuditTrail`    | Actor / action / timestamp / reason             |
| enum      | `Status`        | draft / active / published / archived / deleted |
| enum      | `Priority`      | low / medium / high / critical                  |
| enum      | `AuditAction`   | canonical audit action verbs                    |
| archetype | `Timestamped`   | `createdAt` + `updatedAt` auto-fields           |
| archetype | `SoftDeletable` | `deletedAt` + soft-delete / restore commands    |
| archetype | `Owned`         | `ownerId` + transfer-ownership command          |
| archetype | `Auditable`     | full actor + action + timestamp audit trail     |
| archetype | `StateMachine`  | status transition table enforced at runtime     |

## Install

```bash
pnpm add @manifest/stdlib
```

## Usage

In your own `.manifest` file, `use` the pieces you need:

```manifest
use "./node_modules/@manifest/stdlib/manifest/values/money.manifest"
use "./node_modules/@manifest/stdlib/manifest/enums/status.manifest"

entity Product {
  property required id: string
  property name: string
  property price: Money
  property status: Status = draft
  timestamps
  store Product in memory
}
```

### Mixing archetypes

The Manifest language does not support true mixin inheritance today. The
archetypes in this package are therefore delivered as **reference patterns** —
self-contained snippets in `.manifest` files that document the shape and
command structure you should replicate on your own entities. The header
comment in each archetype file shows the exact code to copy.

The value objects and enums (the parts that _are_ importable) can be
composed freely with your own entity properties.

## Programmatic API

```ts
import { moneySource, statusEnumSource, ARCHETYPES, VALUE_OBJECTS, ENUMS } from '@manifest/stdlib';

const src = moneySource(); // string: the .manifest source
const all = [...ARCHETYPES, ...VALUE_OBJECTS, ...ENUMS];
```

## License

Same as the parent Manifest project.
