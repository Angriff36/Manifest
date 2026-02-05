# Event Log Viewer Specification

## Job to Be Done

As a developer using the Manifest runtime, I want to see a live event log in the Runtime UI that displays events emitted by commands, so that I can verify event emission behavior and debug event payloads.

## Acceptance Criteria

1. **Event Display**
   - Runtime Panel shows "Event Log" section below command results
   - Events emitted during command execution appear in the log
   - Each event displays: event name, channel, payload (formatted JSON), timestamp
   - Events persist across command executions (append to log)
   - "Clear Log" button resets the event log

2. **Payload Structure**
   - Event payload includes command input parameters
   - Event payload includes the last action result (per spec)
   - Payload is displayed as formatted, readable JSON

3. **Verification**
   - Executing a command that emits an event shows the event in the log
   - Multiple command executions append events (not replace)
   - Clear Log button empties the log

## Technical Notes

- Runtime Engine already has `getEventLog()` method - use it
- Per spec in `docs/spec/semantics.md`, payload includes command input + last action result
- Use deterministic timestamps in conformance tests
- Add conformance fixture `15-event-log.manifest` if not present

## Related Files

- `src/artifacts/RuntimePanel.tsx` - UI component
- `src/manifest/runtime-engine.ts` - getEventLog() method
- `docs/spec/semantics.md` - event payload specification
