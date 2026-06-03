# Real-Time Entity Subscriptions

## Summary

Real-time subscriptions enable live updates when entity state changes. Entities marked with the `realtime` modifier automatically generate SSE endpoints and React hooks.

## DSL Syntax

```manifest
realtime entity Task {
  property required id: string
  property title: string
  property status: string = "pending"

  command complete() {
    mutate status = "completed"
    emit TaskCompleted
  }
}
```

## SSE Endpoints

- `GET /api/manifest/{entity}/subscribe` — All changes
- `GET /api/manifest/{entity}/subscribe?id=X` — Specific instance

## React Hooks

```typescript
import { useTaskRealtime } from "@/lib/manifest-realtime";

function TaskList() {
  const { tasks, loading } = useTaskRealtime();
  // tasks updates automatically on entity changes
}
```

## Features

- Auto-reconnect with exponential backoff (1s → 30s max)
- Entity-level filtering by ID or property conditions
- Typed React hooks per entity

## Notes

- Real-time is a projection feature — the core runtime emits events; SSE transport is generated code
- The `realtime` modifier does not change runtime behavior
- For high-throughput, consider WebSocket transport (custom projection)
