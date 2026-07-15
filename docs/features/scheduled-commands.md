# Scheduled / Cron Command Triggers

> **Status: Implemented.** The `schedule` DSL compiles through the lexer, parser, and IR schema (`IRSchedule` in `ir-v1.schema.json`), and the conformance fixture `76-scheduled-commands.manifest` pins the semantics. The reference runtime exposes `getSchedules()` and `runSchedule(name)`, and the package ships an optional worker (`startScheduleWorker` from `@angriff36/manifest/schedule-worker`) plus generated Vercel cron routes so schedules actually fire.

Scheduled commands trigger entity commands on time-based schedules using cron expressions, fixed intervals, or periodic timers. Schedules are declarative metadata compiled into the IR and consumed by projection targets and the runtime worker. The `RuntimeEngine` class has no built-in timer; execution is driven either by the shipped worker (`startScheduleWorker`, for long-running hosts) or by the generated Vercel cron routes.

## DSL Syntax

Three trigger types are supported:

```manifest
// Cron expression (5-field standard)
schedule dailyBackup cron "0 0 * * *" run backupData

// Fixed interval (duration strings)
schedule frequentCleanup interval "5m" run cleanupOldData

// Human-readable period
schedule weeklyReport every 1 weeks run generateReport
```

The general forms:

```
schedule <name> cron "<expression>" run [Entity.]<commandName>([args])
schedule <name> interval "<duration>" run [Entity.]<commandName>([args])
schedule <name> every <count> <unit> run [Entity.]<commandName>([args])
```

## Trigger Types

| Type       | Syntax             | Description                                                      |
| ---------- | ------------------ | ---------------------------------------------------------------- |
| `cron`     | `cron "0 0 * * *"` | Standard 5-field cron expression (minute hour day month weekday) |
| `interval` | `interval "5m"`    | Duration string: `5m` (minutes), `1h` (hours), `1d` (days)       |
| `every`    | `every 1 weeks`    | Count + unit: `1 weeks`, `30 minutes`, `6 hours`                 |

## Entity-Bound vs Global Schedules

Schedules can target module-level commands (global) or entity-level commands (entity-bound):

```manifest
// Global command
schedule morningDigest cron "0 9 * * *" run sendDigest(date: now())

// Entity-bound command (Entity.command syntax)
schedule archiveOldOrders cron "0 2 * * *" run Order.archive
```

When targeting an entity command, use `Entity.commandName` format. The runtime context should include `context.source: 'schedule'` and `context.scheduleName: <name>` when a scheduled command is invoked.

## Inline Parameters

The parser supports `run commandName(arg1: expr1, arg2: expr2)` syntax for passing arguments to scheduled commands. These are compiled to `IRScheduleParam[]` with compiled IR expressions:

```manifest
schedule morningDigest cron "0 9 * * *" run sendDigest(date: now())
```

The `now()` expression is evaluated when the schedule fires, not at compile time.

## Schedule Resolution

Schedules are resolved at compile time and emitted to the IR as `IRSchedule` objects. The `schedules` field is optional -- programs without schedules emit IR without a `schedules` key, maintaining backward compatibility.

Projection targets consume schedule metadata:

- **Next.js projection** (`nextjs.schedule` surface): Generates cron routes only for schedules whose `trigger.kind === 'cron'`. `interval` and `every` schedules are filtered out by the projection and produce no Vercel cron route; they require the `startScheduleWorker()` package for execution.
- ~~**Express/Hono**: Route handlers for external scheduler invocation.~~
- ~~**Terraform projection**: CloudWatch Event rules or similar scheduled resources.~~
>
> **Correction (2026-07-15) @RYANSIGNED:** Express and Hono projections do **not** emit schedule/cron route handlers (grep-verified in `src/manifest/projections/express` and `hono`). The Terraform projection emits store/entity/event HCL (AWS/GCP/Supabase) and has **no** schedule → CloudWatch/EventBridge mapping. Non-Next hosts: call `runtime.runSchedule(name)` from your own scheduler, or run `startScheduleWorker()` from `@angriff36/manifest/schedule-worker`.

## IR Representation

Schedules compile to `IRSchedule` objects (defined in `ir-v1.schema.json`):

```typescript
interface IRSchedule {
  name: string;
  trigger: IRTrigger;
  commandName: string;
  entityName?: string;
  params?: IRScheduleParam[];
  module?: string;
}
```

## Conformance Fixture

Conformance fixture `src/manifest/conformance/fixtures/76-scheduled-commands.manifest` exercises all three trigger types:

- `dailyBackup cron "0 0 * * *"` run `backupData`
- `frequentCleanup interval "5m"` run `cleanupOldData`
- `weeklyReport every 1 weeks` run `generateReport`
- `morningDigest cron "0 9 * * *"` run `sendDigest(date: now())`
- `archiveOldOrders cron "0 2 * * *"` run `Order.archive`

## Notes

- On Vercel, **cron-kind schedules only**: the generated cron routes plus the emitted `vercel.json` fire them with no extra setup. `interval` and `every` schedules are not emitted to Vercel routes; run `startScheduleWorker(runtime)` from `@angriff36/manifest/schedule-worker` (a tick loop that also sweeps approval expiry) to execute those, or invoke `runSchedule(name)` from your own scheduler. Cron triggers are matched in UTC to the minute.
- The `schedule`, `cron`, `interval`, and `every` keywords are added to the lexer's KEYWORDS set.
- Schedules are entity-bound by default when using `Entity.command` syntax, but can also be declared globally at the program or module level.
- An Inngest projection is not yet implemented. The `IRSchedule` shape supports both cron and interval triggers, making a future Inngest projection straightforward (map to `inngest.createFunction` with cron triggers).
