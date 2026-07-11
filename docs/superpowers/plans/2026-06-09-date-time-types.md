# Date/Time Primitive Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `date`, `time`, `datetime`, `duration` as first-class primitive types: runtime write-time validation, 8 new builtins, projection type mappings, conformance fixture 92.

**Architecture:** No lexer/parser changes — `parseType` (parser.ts:815) already accepts any identifier as a type name, so `property due: datetime` already produces IR `{name:'datetime'}`. The work is: (1) runtime builtins, (2) write-time shape validation hooked into the existing constraint-outcome flow, (3) default-value handling, (4) type-map entries in 3 projections (which already map `date`/`datetime` — only `time`/`duration` are new), (5) conformance fixture, (6) spec docs.

**Tech Stack:** TypeScript, vitest (`pnpm test`), conformance fixtures (`pnpm run conformance:regen`).

**Spec:** `docs/superpowers/specs/2026-06-09-v2-3-0-feature-wave-design.md` (Feature 1). **Justified deviations from the spec's tables** (all follow the rule: never change an existing mapping consumers may rely on):

1. Prisma: `date → DateTime` already exists today _without_ `@db.Date`; `time` follows that precedent (plain `DateTime`). `duration → Float` as specced.
2. Zod: `date`/`datetime` already map to `z.coerce.date()` on main — left untouched (changing them breaks existing consumers). Only `time`/`duration` are added.
3. JSON Schema: `datetime` already maps to `{type:'string',format:'date-time'}` — left untouched, same reason. Only `time`/`duration` are added.
4. Write-time rejection of `"2026-02-30"`/`"24:00:00"` is covered by Task 4 runtime unit tests, not fixture 92 — the conformance `ConstraintTestCase` path runs `checkConstraints`/`validateConstraints` only and never reaches the create/update wiring.
5. No separate parser unit tests for "contextual type recognition": `parseType` is unchanged (it already accepts any identifier); fixture 92's expected IR locks the type names end-to-end.
6. **`getDefaultForType` NOT modified** (decided during execution): runtime defaults for unprovided date/time/datetime/duration properties stay `null`, matching the `decimal`/`money` precedent. Adding `""` defaults would have turned previously-succeeding creates into blocked ones (write-time validation rejects `""`). The `""` sentinel exists only in _generated TS code_ defaults, exactly as semantics.md documents.

(When the wave ships, amend the spec's projection table to match 1–3.)

**Representations (binding):** `datetime` = finite number epoch-ms UTC; `duration` = finite number ms (negative OK); `date` = `"YYYY-MM-DD"` valid calendar date; `time` = `"HH:MM:SS"` in `00:00:00`–`23:59:59`.

---

### Task 1: Spec docs first

**Files:**

- Modify: `docs/spec/builtins.md` (Date section, after line ~104)
- Modify: `docs/spec/semantics.md` (new section near type/constraint semantics)

- [ ] **Step 1: builtins.md** — extend the Date section:

```markdown
### Date (UTC, timestamp in ms)

- `year(ts)`, `month(ts)` (1–12), `day(ts)`, `hours(ts)`, `minutes(ts)`, `seconds(ts)`
- `dateOf(ts)` — `"YYYY-MM-DD"` (UTC) for epoch-ms `ts`; non-number input returns `null`
- `timeOf(ts)` — `"HH:MM:SS"` (UTC) for epoch-ms `ts`; non-number input returns `null`
- `datetimeOf(dateStr, timeStr?)` — epoch ms UTC from `"YYYY-MM-DD"` (+ optional `"HH:MM:SS"`, default midnight). Malformed or non-calendar input returns `null` (never NaN)
- `addDuration(ts, d)` — `ts + d` (both numbers, ms); non-number input returns `null`
- `durationBetween(a, b)` — `b - a` (ms); non-number input returns `null`
- `durationDays(n)`, `durationHours(n)`, `durationMinutes(n)`, `durationSeconds(n)` — ms constructors; non-number input returns `null`

All date builtins are pure and UTC-only. Purity: `pure`.
```

- [ ] **Step 2: semantics.md** — add a `## Date/Time Types` section:

```markdown
## Date/Time Types

Four primitive type names with fixed runtime representations:

| Type       | Representation                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------- |
| `datetime` | finite number, epoch milliseconds UTC                                                             |
| `duration` | finite number, milliseconds (may be negative)                                                     |
| `date`     | string `"YYYY-MM-DD"`, must be a valid calendar date (leap years honored; `"2026-02-30"` invalid) |
| `time`     | string `"HH:MM:SS"`, `00:00:00`–`23:59:59` (no `24:00:00`, no leap seconds)                       |

**Write-time validation.** On create and update mutations in the reference runtime, properties of these four types are validated after guards, alongside entity constraints. A malformed value produces a blocking constraint outcome with code `E_TYPE_DATE`, `E_TYPE_TIME`, `E_TYPE_DATETIME`, or `E_TYPE_DURATION`, carrying the property name and offending value. `null`/`undefined` on a nullable property passes. Validation applies only to these four type names — no behavior change for any existing program.

**Generated defaults are sentinels.** Code generators emit `""` as the default for non-nullable `date`/`time` properties; this is an intentionally invalid sentinel that write-time validation blocks — deterministic "today" defaults are impossible by design.
```

- [ ] **Step 3: Commit**

```bash
git add docs/spec/builtins.md docs/spec/semantics.md
git commit -m "[spec] define date/time primitive types and builtins (v2.3.0 wave)"
```

---

### Task 2: Date/time validation helpers (pure functions + tests)

**Files:**

- Create: `src/manifest/date-time.ts`
- Create: `src/manifest/date-time.test.ts`

- [ ] **Step 1: Write failing tests** in `src/manifest/date-time.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isValidDateString, isValidTimeString, dateOf, timeOf, datetimeOf } from './date-time';

describe('isValidDateString', () => {
  it('accepts valid calendar dates', () => {
    expect(isValidDateString('2026-06-09')).toBe(true);
    expect(isValidDateString('2024-02-29')).toBe(true); // leap year
    expect(isValidDateString('2026-12-31')).toBe(true);
  });
  it('rejects invalid calendar dates', () => {
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(isValidDateString('2026-02-29')).toBe(false); // not a leap year
    expect(isValidDateString('2026-13-01')).toBe(false);
    expect(isValidDateString('2026-00-10')).toBe(false);
    expect(isValidDateString('2026-04-31')).toBe(false);
  });
  it('rejects malformed strings', () => {
    expect(isValidDateString('')).toBe(false);
    expect(isValidDateString('2026-6-9')).toBe(false);
    expect(isValidDateString('20260609')).toBe(false);
    expect(isValidDateString('2026-06-09T00:00:00Z')).toBe(false);
  });
});

describe('isValidTimeString', () => {
  it('accepts valid times', () => {
    expect(isValidTimeString('00:00:00')).toBe(true);
    expect(isValidTimeString('23:59:59')).toBe(true);
    expect(isValidTimeString('12:30:45')).toBe(true);
  });
  it('rejects out-of-range and malformed times', () => {
    expect(isValidTimeString('24:00:00')).toBe(false);
    expect(isValidTimeString('23:60:00')).toBe(false);
    expect(isValidTimeString('23:59:60')).toBe(false); // no leap seconds
    expect(isValidTimeString('1:00:00')).toBe(false);
    expect(isValidTimeString('')).toBe(false);
  });
});

describe('dateOf / timeOf', () => {
  it('formats epoch ms as UTC date/time strings', () => {
    // 2001-09-09T01:46:40Z
    expect(dateOf(1000000000000)).toBe('2001-09-09');
    expect(timeOf(1000000000000)).toBe('01:46:40');
  });
  it('returns null for non-number input', () => {
    expect(dateOf('x' as unknown as number)).toBeNull();
    expect(timeOf(undefined as unknown as number)).toBeNull();
    expect(dateOf(NaN)).toBeNull();
  });
});

describe('datetimeOf', () => {
  it('combines date and time to epoch ms UTC', () => {
    expect(datetimeOf('2001-09-09', '01:46:40')).toBe(1000000000000);
    expect(datetimeOf('1970-01-01')).toBe(0); // missing time = midnight UTC
  });
  it('returns null on malformed or non-calendar input', () => {
    expect(datetimeOf('2026-02-30')).toBeNull();
    expect(datetimeOf('2026-06-09', '24:00:00')).toBeNull();
    expect(datetimeOf('junk')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run src/manifest/date-time.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** `src/manifest/date-time.ts`:

```ts
/**
 * Date/time primitive type helpers. Pure, UTC-only, deterministic.
 * Representations (docs/spec/semantics.md, Date/Time Types):
 *   datetime = finite epoch ms; duration = finite ms;
 *   date = "YYYY-MM-DD" (valid calendar); time = "HH:MM:SS" (00:00:00–23:59:59).
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2}):(\d{2})$/;

export function isValidDateString(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [, ys, ms, ds] = m;
  const year = Number(ys),
    month = Number(ms),
    day = Number(ds);
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

export function isValidTimeString(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const m = TIME_RE.exec(value);
  if (!m) return false;
  const [, hs, mins, ss] = m;
  const h = Number(hs),
    min = Number(mins),
    s = Number(ss);
  return h <= 23 && min <= 59 && s <= 59;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function dateOf(ts: unknown): string | null {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null;
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function timeOf(ts: unknown): string | null {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null;
  const d = new Date(ts);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export function datetimeOf(dateStr: unknown, timeStr?: unknown): number | null {
  if (!isValidDateString(dateStr)) return null;
  const t = timeStr === undefined ? '00:00:00' : timeStr;
  if (!isValidTimeString(t)) return null;
  return Date.parse(`${dateStr}T${t}.000Z`);
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run src/manifest/date-time.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/manifest/date-time.ts src/manifest/date-time.test.ts
git commit -m "[feat] date/time validation + conversion helpers (pure, UTC-only)"
```

---

### Task 3: Runtime builtins

**Files:**

- Modify: `src/manifest/runtime-engine.ts` (`getBuiltins()`, after the existing Date builtins block at ~line 1371)
- Modify: `src/manifest/plugin-api.ts:294` (reserved-name list)
- Create: `src/manifest/runtime-datetime-builtins.test.ts`

- [ ] **Step 1: Write failing tests** in `src/manifest/runtime-datetime-builtins.test.ts`. Follow the style of existing runtime tests (e.g. `runtime-builtin-properties.test.ts`): compile a small program with `compileToIR` from `./compiler`, build a `RuntimeEngine` with deterministic options, and exercise builtins via computed properties. Cover:
  - `dateOf(createdAt)` / `timeOf(createdAt)` computed properties on an entity with `timestamps` and `now: () => 1000000000000` → `"2001-09-09"` / `"01:46:40"`.
  - `addDuration(createdAt, durationDays(1))` → `1000000000000 + 86400000`.
  - `durationBetween(createdAt, createdAt)` → `0`.
  - `datetimeOf("2001-09-09", "01:46:40")` in a computed property → `1000000000000`.
  - `durationHours(2)` → `7200000`, `durationMinutes(2)` → `120000`, `durationSeconds(2)` → `2000`.

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run src/manifest/runtime-datetime-builtins.test.ts` → FAIL (builtins resolve as unknown identifiers).

- [ ] **Step 3: Implement.** In `getBuiltins()` (runtime-engine.ts, directly after the `seconds:` line), add — import `dateOf, timeOf, datetimeOf` from `./date-time` at top of file:

```ts
      // Date/time primitive builtins (v2.3.0; pure, UTC-only)
      dateOf: (ts: unknown) => dateOf(ts),
      timeOf: (ts: unknown) => timeOf(ts),
      datetimeOf: (d: unknown, t?: unknown) => datetimeOf(d, t),
      addDuration: (ts: unknown, d: unknown) =>
        typeof ts === 'number' && typeof d === 'number' ? ts + d : null,
      durationBetween: (a: unknown, b: unknown) =>
        typeof a === 'number' && typeof b === 'number' ? b - a : null,
      durationDays: (n: unknown) => typeof n === 'number' ? n * 86400000 : null,
      durationHours: (n: unknown) => typeof n === 'number' ? n * 3600000 : null,
      durationMinutes: (n: unknown) => typeof n === 'number' ? n * 60000 : null,
      durationSeconds: (n: unknown) => typeof n === 'number' ? n * 1000 : null,
```

In `plugin-api.ts:294`, add the 9 new names to the reserved list: `'dateOf', 'timeOf', 'datetimeOf', 'addDuration', 'durationBetween', 'durationDays', 'durationHours', 'durationMinutes', 'durationSeconds'`.

- [ ] **Step 4: Run to verify pass** — new test file PASS, then `pnpm vitest run src/manifest/plugin-api.test.ts` (reserved-name tests may enumerate the list — update if an exact-list assertion exists).

- [ ] **Step 5: Commit**

```bash
git add src/manifest/runtime-engine.ts src/manifest/plugin-api.ts src/manifest/runtime-datetime-builtins.test.ts
git commit -m "[feat] add date/time builtins (dateOf, timeOf, datetimeOf, durations)"
```

---

### Task 4: Write-time validation on create/update

**Files:**

- Modify: `src/manifest/runtime-engine.ts` (`persistPreparedCreate` ~line 1750, `updateInstance` ~line 1843)
- Create: `src/manifest/runtime-datetime-validation.test.ts`

- [ ] **Step 1: Write failing tests** — compile a program like:

```manifest
entity Event {
  property name: string
  property day: date
  property startsAt: time
  property due: datetime
  property runtime: duration
  property maybeDay: date?
}
```

Assert (using `createInstance` / `updateInstance` directly, deterministic options):

- valid values (`"2026-06-09"`, `"09:30:00"`, `1000000000000`, `86400000`) → instance created with those values.
- `day: "2026-02-30"` → `createInstance` returns `undefined` (blocked).
- `startsAt: "24:00:00"` → blocked.
- `due: Infinity` and `due: "soon"` → blocked.
- `runtime: NaN` → blocked.
- `maybeDay: null` → created (nullable null passes).
- update path: create valid, then `updateInstance(..., { day: "2026-13-01" })` → returns `undefined`, stored value unchanged.
- `createInstanceWithOutcomes` (if exported on engine) or constraint outcome inspection: blocked outcome carries code `E_TYPE_DATE` and the offending value. If outcomes aren't reachable from a public API for type failures, assert via the `WithOutcomes` variant used by commands — check how `25-command-constraints` results assert codes and mirror that.

- [ ] **Step 2: Run to verify failure** — invalid values currently create fine → assertions FAIL.

- [ ] **Step 3: Implement.** Add to `RuntimeEngine` (near `validateConstraints`); import `isValidDateString, isValidTimeString` from `./date-time`:

```ts
  /** Date/time primitive write-time validation (docs/spec/semantics.md, Date/Time Types). */
  private validateDateTimeTypes(
    entity: IREntity,
    data: Record<string, unknown>
  ): ConstraintOutcome[] {
    const outcomes: ConstraintOutcome[] = [];
    for (const prop of entity.properties) {
      const t = prop.type?.name;
      if (t !== 'date' && t !== 'time' && t !== 'datetime' && t !== 'duration') continue;
      if (!(prop.name in data)) continue;
      const value = data[prop.name];
      if (value === null || value === undefined) continue; // nullability handled elsewhere
      let ok = true;
      let code = '';
      if (t === 'date') { ok = isValidDateString(value); code = 'E_TYPE_DATE'; }
      else if (t === 'time') { ok = isValidTimeString(value); code = 'E_TYPE_TIME'; }
      else if (t === 'datetime') { ok = typeof value === 'number' && Number.isFinite(value); code = 'E_TYPE_DATETIME'; }
      else { ok = typeof value === 'number' && Number.isFinite(value); code = 'E_TYPE_DURATION'; }
      if (!ok) {
        // ConstraintOutcome (src/manifest/ir.ts:402) requires:
        // code, constraintName, severity, formatted, passed (message/details optional).
        outcomes.push({
          code,
          constraintName: prop.name,
          severity: 'block',
          passed: false,
          formatted: `Property "${prop.name}" expects ${t}; got ${JSON.stringify(value)}`,
          message: `Property "${prop.name}" expects ${t}; got ${JSON.stringify(value)}`,
        });
      }
    }
    return outcomes;
  }
```

Wire it in:

- `persistPreparedCreate`: `const constraintOutcomes = [...this.validateDateTimeTypes(entity, mergedData), ...await this.validateConstraints(entity, mergedData)];`
- `updateInstance`: prepend the same to its `constraintOutcomes` before the blocking filter. Validate against `data` (the patch), not `mergedData` — only newly-written values are checked, per spec ("write-time").

**Implementer note:** the snippet's fields match `ConstraintOutcome` (src/manifest/ir.ts:402) — verify once against the type before finalizing. The blocking filter only relies on `passed === false && severity === 'block'`.

- [ ] **Step 4: Run to verify pass** — new test PASS, then `pnpm vitest run src/manifest/runtime-engine.test.ts` and `src/manifest/conformance/conformance.test.ts` → all PASS (no existing fixture uses these type names except auto-`datetime` timestamps, which are engine-written finite numbers and pass).

- [ ] **Step 5: Commit**

```bash
git add src/manifest/runtime-engine.ts src/manifest/runtime-datetime-validation.test.ts
git commit -m "[feat] write-time validation for date/time/datetime/duration properties"
```

---

### Task 5: Generator defaults + projection type maps

**Files:**

- Modify: `src/manifest/generator.ts:785` (type map) and `:794` (default map)
- Modify: `src/manifest/standalone-generator.ts:540` (same)
- Modify: `src/manifest/runtime-engine.ts` (`getDefaultForType` — find it; add the four names)
- Modify: `src/manifest/projections/prisma/type-mapping.ts:28` (add `time`, `duration`)
- Modify: `src/manifest/projections/zod/generator.ts:46` (add `time`, `duration`)
- Modify: `src/manifest/projections/jsonschema/generator.ts:136` (add `time`, `duration`)
- Test: extend `src/manifest/projections/prisma/generator.test.ts`, `zod` and `jsonschema` test files with one case each

- [ ] **Step 1: Write failing projection tests** — one entity with `time` + `duration` properties per projection test file; assert Prisma emits `DateTime` and `Float`, Zod emits `z.string().regex(/^\d{2}:\d{2}:\d{2}$/)` and `z.number()`, JSON Schema emits `{type:'string',format:'time'}` and `{type:'number'}`. Follow each file's existing test idiom.

- [ ] **Step 2: Run to verify failure** — Prisma: unknown scalar diagnostic; Zod/JSON-Schema: fallthrough mapping.

- [ ] **Step 3: Implement the map entries:**

```ts
// prisma/type-mapping.ts DEFAULT_TYPE_MAPPING — after `datetime: 'DateTime',`
  time: 'DateTime',
  duration: 'Float',   // ms as double; Int overflows at ~24.8 days
```

```ts
// zod/generator.ts TYPE_MAP — after `datetime: ...`
  time: "z.string().regex(/^\\d{2}:\\d{2}:\\d{2}$/)",
  duration: 'z.number()',
```

```ts
// jsonschema/generator.ts SCALAR_MAP — after `datetime: ...`
  time:     { type: 'string', format: 'time' },
  duration: { type: 'number' },
```

In `generator.ts:785` map add `date: 'string', time: 'string', datetime: 'number', duration: 'number'`; in the `:794` default map add `date: '""', time: '""', datetime: '0', duration: '0'` (the `""` is the documented sentinel). Mirror in `standalone-generator.ts:540`. In `getDefaultForType` add the same four (strings `''`, numbers `0`).

- [ ] **Step 4: Run to verify pass** — the three projection test files + `pnpm vitest run src/manifest/projections/snapshot.test.ts` (snapshots unaffected unless example IRs use the names — if a snapshot legitimately changes, inspect the diff before accepting).

- [ ] **Step 5: Commit**

```bash
git add src/manifest/generator.ts src/manifest/standalone-generator.ts src/manifest/runtime-engine.ts src/manifest/projections/prisma/type-mapping.ts src/manifest/projections/zod/generator.ts src/manifest/projections/jsonschema/generator.ts src/manifest/projections/prisma/generator.test.ts src/manifest/projections/zod/*.test.ts src/manifest/projections/jsonschema/*.test.ts
git commit -m "[feat] date/time type mappings for TS generators, Prisma, Zod, JSON Schema"
```

---

### Task 6: Conformance fixture 92

**Files:**

- Create: `src/manifest/conformance/fixtures/92-date-time-types.manifest`
- Create: `src/manifest/conformance/expected/92-date-time-types.ir.json` (via regen)
- Create: `src/manifest/conformance/expected/92-date-time-types.results.json` (hand-written)

- [ ] **Step 1: Write the fixture:**

```manifest
// Conformance: date/time primitive types — representations, builtins, write-time validation.
// Regression: `date` and `time` remain valid property NAMES (not reserved words).
module Scheduling {
  entity Meeting {
    property required title: string
    property day: date
    property startsAt: time
    property due: datetime
    property length: duration
    property date: string
    property time: number
    computed dayLabel: string = dateOf(due)
    computed endsAt: number = addDuration(due, length)

    command schedule(newDue: number) {
      guard durationBetween(due, newDue) >= 0
      mutate due = newDue
      emit MeetingScheduled
    }
  }

  event MeetingScheduled: "scheduling.meeting.scheduled"
}
```

(The `event Name: "channel"` form is mandatory — `parseOutboxEvent` at parser.ts:792 unconditionally consumes the `:`. For `computed`/`command`/`guard`/`mutate` forms, copy the exact idioms from passing fixtures `03-computed-properties.manifest` and `64-aggregate-computed-properties.manifest`. The `guard` line exercises a date/time builtin in guard position, per spec. The command param is `newDue`, not `due`, to avoid shadowing the property.)

- [ ] **Step 2: Regenerate expected IR** — `pnpm run conformance:regen`, then inspect `expected/92-date-time-types.ir.json`: property types must read `{"name":"date",...}` etc.; the `date`/`time` _named_ properties must read `{"name":"string"}`/`{"name":"number"}`. UTF-8 without BOM, no random values.

- [ ] **Step 3: Write `92-date-time-types.results.json`** (deterministic timestamp = 1000000000000; mirror 62's structure):

```json
{
  "testCases": [
    {
      "name": "valid date/time values create successfully and computed builtins evaluate",
      "createInstance": {
        "entity": "Meeting",
        "data": {
          "id": "meeting-1",
          "title": "Standup",
          "day": "2026-06-09",
          "startsAt": "09:30:00",
          "due": 1000000000000,
          "length": 3600000,
          "date": "free-form name regression",
          "time": 42
        }
      },
      "expectedInstance": {
        "id": "meeting-1",
        "title": "Standup",
        "day": "2026-06-09",
        "startsAt": "09:30:00",
        "due": 1000000000000,
        "length": 3600000,
        "date": "free-form name regression",
        "time": 42,
        "dayLabel": "2001-09-09",
        "endsAt": 1000003600000
      }
    }
  ]
}
```

**Two definitive corrections to the JSON above (verified against conformance.test.ts):**

1. Computed properties are NOT materialized on `createInstance` results (`CreateTestCase` does strict `toEqual`). **Remove `dayLabel`/`endsAt` from `expectedInstance`** and add two `ComputedTestCase` entries instead — copy the exact shape from `03-computed-properties.results.json`.
2. Do NOT add a blocked-create case to this results file: `ConstraintTestCase` runs `engine.checkConstraints` → `validateConstraints` only, which never reaches the create/update wiring where date/time validation lives. Rejection behavior is locked by the Task 4 unit tests (declared deviation #4 in the header).

- [ ] **Step 4: Run** — `pnpm vitest run src/manifest/conformance/conformance.test.ts` → all PASS including fixture 92.

- [ ] **Step 5: Commit**

```bash
git add src/manifest/conformance/fixtures/92-date-time-types.manifest src/manifest/conformance/expected/92-date-time-types.ir.json src/manifest/conformance/expected/92-date-time-types.results.json
git commit -m "[conformance] fixture 92: date/time primitive types"
```

---

### Task 7: Full validation + truthful feature record

**Files:**

- Modify: `.automaker/features/date-time-types/feature.json`

- [ ] **Step 1: Full gates** — `pnpm test` (all green), `pnpm run typecheck`, `pnpm run lint` (no NEW errors; pre-existing lint debt in tools//.opencode//generated/ is documented out-of-scope).

- [ ] **Step 2: Replace the hallucinated summary** in `.automaker/features/date-time-types/feature.json`: set `summary` to a short truthful description of what was ACTUALLY built (files: date-time.ts, runtime builtins, write-time validation, 3 projection maps, fixture 92; representations; what was cut: no lexer keywords, no @db.Date/@db.Time). Keep `status: "verified"` only now that it is true.

- [ ] **Step 3: Commit**

```bash
git add .automaker/features/date-time-types/feature.json
git commit -m "[feat] date-time-types complete: truthful automaker record"
```
