# Runtime Middleware Pipeline

## Summary

The runtime middleware pipeline allows registering hooks at specific points in the command execution lifecycle. Middleware can inspect context, short-circuit execution, or patch the runtime context before proceeding.

## Middleware Hooks

| Hook | When it runs |
|------|-------------|
| `before-policy` | Before policy evaluation |
| `before-guard` | Before guard evaluation |
| `before-action` | Before action execution |
| `after-emit` | After event emission |

## Usage

```typescript
import { RuntimeEngine } from "@angriff36/manifest";

const runtime = new RuntimeEngine(ir, { /* options */ });

runtime.use({
  beforePolicy: async (ctx) => {
    console.log(`[${ctx.entityName}.${ctx.commandName}] Checking policies...`);
    return ctx;
  },
  beforeAction: async (ctx) => {
    if (ctx.commandName === "delete" && ctx.user?.role !== "admin") {
      return { shortCircuit: true, result: { success: false, error: "Admin required" } };
    }
    return ctx;
  },
  afterEmit: async (ctx) => {
    console.log(`Emitted ${ctx.emittedEvents.length} events`);
    return ctx;
  }
});
```

## MiddlewareContext

| Field | Description |
|-------|-------------|
| `entityName` | Target entity name |
| `commandName` | Command being executed |
| `instanceId` | Target instance ID |
| `input` | Command input parameters |
| `user` | Current user object |
| `context` | Runtime context |
| `emittedEvents` | Events emitted so far (afterEmit only) |

## Ordering

Middleware runs in registration order. If multiple middleware are registered on the same hook, they execute sequentially. Short-circuiting stops all subsequent middleware and the command execution.

## Notes

- Middleware is a runtime feature — it does not affect the IR or compilation
- Short-circuit results appear as normal CommandResult to the caller
- Context patching allows modifying the user or context object for downstream hooks
