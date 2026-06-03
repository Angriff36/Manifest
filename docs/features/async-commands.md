# Async Commands

## Summary

The `async` keyword prefix defers command action execution to a background worker queue. Policies, constraints, and guards are validated synchronously (fail-fast), then the command is enqueued for later execution.

## DSL Syntax

```manifest
entity Order {
  property required id: string
  property status: string = "pending"

  async command processOrder(amount: number) {
    guard amount > 0
    mutate status = "processing"
    emit OrderProcessing
  }
}
```

## IR Schema Changes

- `IRCommand.async`: boolean flag
- `IRCommand.completionEvent`: auto-synthesized `{commandName}Completed`
- `IRCommand.failureEvent`: auto-synthesized `{commandName}Failed`
- Compile-time collision detection if synthesized event matches user-declared event

## Runtime Behavior

1. Synchronous validation: policies → constraints → guards (fail-fast)
2. Enqueue `JobRecord` via `JobQueue` adapter
3. Returns `{ jobId, status: 'pending', enqueuedAt }` immediately
4. Worker re-entry: `context.source === 'job'` bypasses async branch during worker execution
5. Missing `jobQueue` configuration produces `MISSING_JOB_QUEUE` error result

### JobQueue Interface

```typescript
interface JobQueue {
  enqueue(record: JobRecord): Promise<string>;
  drainPending(): Promise<JobRecord[]>;
  updateStatus(jobId: string, status: string): Promise<void>;
}
```

### Deterministic Testing

`drainJobs()` public method drains pending jobs in FIFO order. `MemoryJobQueue` is the default implementation for testing.

## Conformance Fixtures

- `69-async-commands.manifest` — async command with completion/failure events

## Test Coverage

15 unit tests in `src/manifest/runtime-async.test.ts` covering IR compilation, async enqueue, guard fail-fast, drainJobs, and MemoryJobQueue operations.
