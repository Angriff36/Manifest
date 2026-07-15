# Runtime Middleware Pipeline

## Summary

The runtime middleware pipeline allows registering hooks at specific points in the command execution lifecycle. Middleware can inspect context, short-circuit execution, or patch the evaluation context before proceeding.

## Middleware Hooks

| Hook            | When it runs             |
| --------------- | ------------------------ |
| `before-policy` | Before policy evaluation |
| `before-guard`  | Before guard evaluation  |
| `before-action` | Before each action in the action loop |
| `after-emit`    | After event emission                  |

> **Correction (2026-07-15) @RYANSIGNED:** `before-action` runs **once per
> action** inside the action loop (`runtime-engine.ts`), not once per command.
> Constructor remains `(ir, context?, options?)` with
> `options.middleware` — verified against `package.json` **3.6.4**.

## Usage

Middleware is passed via `RuntimeOptions.middleware` (third constructor argument):

```typescript
import { RuntimeEngine } from '@angriff36/manifest';

const runtime = new RuntimeEngine(
  ir,
  { user: { id: 'user-1', role: 'admin' } },
  {
    middleware: [
      {
        hooks: ['before-policy'],
        handler: async (ctx) => {
          console.log(`[${ctx.entityName}] Checking policies for ${ctx.command.name}...`);
          return {};
        },
      },
      {
        hooks: ['before-action'],
        handler: async (ctx) => {
          if (ctx.command.name === 'delete' && ctx.runtimeContext.user?.role !== 'admin') {
            return {
              shortCircuit: true,
              result: { success: false, error: 'Admin required', emittedEvents: [] },
            };
          }
          return {};
        },
      },
      {
        hooks: ['after-emit'],
        handler: async (ctx) => {
          console.log(`Emitted ${ctx.emittedEvents.length} events`);
          return {};
        },
      },
    ],
  },
);
```

## MiddlewareContext

| Field            | Description                                              |
| ---------------- | -------------------------------------------------------- |
| `hook`           | Which lifecycle hook triggered this call                 |
| `command`        | The IR command being executed                            |
| `evalContext`    | Expression evaluation context (patch via `contextPatch`) |
| `runtimeContext` | Runtime context (`user`, `tenantId`, etc.)               |
| `entityName`     | Target entity name                                       |
| `instanceId`     | Target instance ID                                       |
| `input`          | Command input parameters                                 |
| `emittedEvents`  | Events emitted so far (`after-emit` hook)                |

## Ordering

Middleware runs in declaration order. If multiple middleware share a hook, they execute sequentially. Short-circuiting stops subsequent middleware and returns the provided `CommandResult`.

## Notes

- Middleware is a runtime feature — it does not affect the IR or compilation
- Short-circuit results appear as normal `CommandResult` to the caller
- Use `contextPatch` on the handler result to merge values into `evalContext` for downstream hooks
