# Date and Time Types

> **Audited (2026-07-15) @RYANSIGNED:** Spot-check OK against builtins /
> `autoNow` / fixture `92-date-time-types.manifest` on package **3.6.4**. No
> phantom `timestamp` language type (Zod may alias `timestamp` → datetime).

Manifest provides primitive types `date`, `time`, `datetime`, and `duration`, plus built-ins for date extraction and duration arithmetic. See conformance fixture `92-date-time-types.manifest`.

## Syntax

```manifest
module Scheduling {
  entity Meeting {
    property required title: string
    property day: date
    property startsAt: time
    property due: datetime
    property length: duration

    computed dayLabel: string = dateOf(due)
    computed endsAt: number = addDuration(due, length)

    command schedule(newDue: number) {
      guard durationBetween(self.due, newDue) >= 0
      mutate due = newDue
      emit MeetingScheduled
    }
  }

  store Meeting in memory

  event MeetingScheduled: "scheduling.meeting.scheduled"
}
```

The `timestamps` entity modifier (fixture `62-timestamp-auto-fields.manifest`) injects `createdAt` and `updatedAt` as `datetime` properties.

**Note:** `date` and `time` are valid property _names_ as well as types — the fixture uses `property date: string` and `property time: number` to regression-test that names are not reserved.

## Built-ins

From `docs/spec/builtins.md` and the runtime:

| Built-in                                  | Purpose                                    |
| ----------------------------------------- | ------------------------------------------ |
| `now()`                                   | Current time (milliseconds since epoch)    |
| `year(ts)`, `month(ts)`, `day(ts)`        | UTC date components from numeric timestamp |
| `hours(ts)`, `minutes(ts)`, `seconds(ts)` | UTC time components                        |
| `dateOf(ts)`                              | Date portion of a datetime                 |
| `addDuration(ts, duration)`               | Add a duration to a timestamp              |
| `durationBetween(a, b)`                   | Difference between two timestamps          |

## Property defaults: `now()` / `today()` (autoNow)

A property may use `now()` or `today()` as its default to be stamped with the current time on create:

```manifest
entity Article {
  property required id: string
  property required title: string
  property createdAt: datetime = now()
}

store Article in memory
```

These are call-expression defaults, so they cannot be represented as a static IR value. The IR compiler lowers them to an `IRProperty.autoNow` flag (recognized functions: `now()` and `today()`, called with no arguments). Effects of the flag:

- The runtime engine stamps the field with `getNow()` on create when the caller does not supply a value (`prepareCreateData`).
- The Prisma projection emits a store-level `@default(now())` for the column.

Negative (and unary `+`) numeric literal defaults such as `property retries: number = -1` are folded to a real static default rather than being dropped.

An unsupported call-expression default — for example `= uuid()` — would otherwise be silently dropped, so the compiler emits a **warning** instead, listing the supported call defaults (`now()`, `today()`).

Both checks above are **warnings** (surfaced in `manifest compile` and the LSP), not hard errors.

### Guaranteed-null persistence warning

A `create` command that leaves a **non-null, default-less** property unset is flagged with a compile-time warning when the runtime would null-fill that field — i.e. for types the runtime fills with `null` rather than a zero value (`datetime`, `date`, `time`, `enum`, and custom/value-object types). A non-null store column rejects that `null` write (the `createdAt must not be null` class of failure), so `checkRequiredFieldsSetOnCreate` surfaces it at compile time.

Not flagged:

- Types the runtime zero-fills (`string` → `""`, `number` → `0`, `boolean` → `false`, `list`/`array`, `map`) — these persist fine when unset.
- Nullable properties (a `null` write is legal).
- Properties with a literal default or `autoNow`.
- Runtime/store-managed fields: `id`, composite-key columns, relationship foreign keys, the tenant property, optimistic-concurrency version fields, and the auto `createdAt`/`updatedAt` from `timestamps`.

This is a **warning**, not an error, because the runtime merges arbitrary caller-supplied input on create — the compiler cannot prove the field is unset. Resolve it by adding a `mutate <field> = …`, giving the property a default (e.g. `= now()`), or making it optional (`<field>: <type>?`).

## Behavior

- `datetime` values are numeric millisecond timestamps at runtime unless your store/projection maps them differently.
- Date component built-ins use UTC methods for determinism.
- Write-time validation applies to `date`, `time`, `datetime`, and `duration` property assignments (see `runtime-engine.ts` `validateDateTimeTypes`).
- `now()` / `today()` property defaults lower to `IRProperty.autoNow`; the runtime stamps the current time on create and the Prisma projection emits `@default(now())`.

## Projections

The Prisma projection maps `datetime` to native timestamp columns. `date`, `time`, and `duration` map according to each projection's type table.

## Conformance Fixture

- `src/manifest/conformance/fixtures/92-date-time-types.manifest`
- `src/manifest/conformance/fixtures/62-timestamp-auto-fields.manifest`
- `src/manifest/conformance/fixtures/56-expression-builtins.manifest`
