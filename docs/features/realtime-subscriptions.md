# Real-Time Entity Subscriptions

## Summary

Real-time subscriptions enable live updates when entity state changes. Entities flagged with `realtime` inside the entity body generate SSE routes and React hooks via the Next.js projection.

## DSL Syntax

```manifest
entity Task {
  realtime
  property required id: string
  property title: string
  property status: string = "pending"

  command complete() {
    mutate status = "completed"
    emit TaskCompleted
  }
}
```

The `realtime` keyword is a line inside the entity block, not a prefix on `entity`.

## SSE Endpoints

The Next.js projection generates:

- `GET /api/{entitySegment}/subscribe` — streams runtime events for the entity

(`entitySegment` is the lowercased entity name, e.g. `task` for `Task`.)

## React Hooks

The projection generates `use{Entity}Subscription` hooks:

```typescript
import { useTaskSubscription } from "@/hooks/useTaskSubscription";

function TaskMonitor() {
  const { connected, lastEvent } = useTaskSubscription({
    onEvent: (event) => {
      console.log(event.name, event.payload);
    },
  });

  return <div>{connected ? "Live" : "Connecting…"}</div>;
}
```

## Features

- Auto-reconnect with exponential backoff (generated hook)
- Entity-level SSE filtering via runtime `subscribe(entityName, listener)`
- Typed event payloads per entity

## Notes

- Real-time is a projection feature — the core runtime emits events; SSE transport is generated code
- The `realtime` flag does not change runtime command semantics
- For high-throughput, consider WebSocket transport (custom projection)
