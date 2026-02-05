# Event Log Viewer Specification

## Job to Be Done

As a developer using the Manifest runtime, I want to see a live event log in the Runtime UI that displays events emitted by commands, so that I can verify event emission behavior and debug event payloads.

## Status ✅ COMPLETED

**Implementation Date:** 2026-02-05 (Loop 3, Priority 4)

## Acceptance Criteria (All Met)

1. **Event Display** ✅
   - Runtime Panel shows "Event Log" section below command results
   - Events emitted during command execution appear in the log
   - Each event displays: event name, channel, payload (formatted JSON), timestamp
   - Events persist across command executions (append to log)
   - "Clear Log" button resets the event log

2. **Payload Structure** ✅
   - Event payload includes command input parameters
   - Event payload includes the last action result (per spec)
   - Payload is displayed as formatted, readable JSON

3. **Verification** ✅
   - Executing a command that emits an event shows the event in the log
   - Multiple command executions append events (not replace)
   - Clear Log button empties the log

## Technical Notes

**Implementation Location:** `src/artifacts/RuntimePanel.tsx` lines 845-895

- Event log sidebar showing all emitted events
- Each event displays: name, channel, formatted JSON payload, timestamp
- Events persist across command executions (append to log)
- "Clear Log" button (trash icon) to reset the event log
- Event count badge
- Reverse chronological display (newest first)

## Related Files

- `src/artifacts/RuntimePanel.tsx` - UI component (lines 845-895)
- `src/manifest/runtime-engine.ts` - getEventLog() method
- `docs/spec/semantics.md` - event payload specification
