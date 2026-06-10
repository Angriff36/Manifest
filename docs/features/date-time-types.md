# Date and Time Types

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

**Note:** `date` and `time` are valid property *names* as well as types — the fixture uses `property date: string` and `property time: number` to regression-test that names are not reserved.

## Built-ins

From `docs/spec/builtins.md` and the runtime:

| Built-in | Purpose |
|----------|---------|
| `now()` | Current time (milliseconds since epoch) |
| `year(ts)`, `month(ts)`, `day(ts)` | UTC date components from numeric timestamp |
| `hours(ts)`, `minutes(ts)`, `seconds(ts)` | UTC time components |
| `dateOf(ts)` | Date portion of a datetime |
| `addDuration(ts, duration)` | Add a duration to a timestamp |
| `durationBetween(a, b)` | Difference between two timestamps |

## Behavior

- `datetime` values are numeric millisecond timestamps at runtime unless your store/projection maps them differently.
- Date component built-ins use UTC methods for determinism.
- Write-time validation applies to `date`, `time`, `datetime`, and `duration` property assignments (see `runtime-engine.ts` `validateDateTimeTypes`).

## Projections

The Prisma projection maps `datetime` to native timestamp columns. `date`, `time`, and `duration` map according to each projection's type table.

## Conformance Fixture

- `src/manifest/conformance/fixtures/92-date-time-types.manifest`
- `src/manifest/conformance/fixtures/62-timestamp-auto-fields.manifest`
- `src/manifest/conformance/fixtures/56-expression-builtins.manifest`
