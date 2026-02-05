# Policy and Guard Diagnostics Specification

## Job to Be Done

As a developer debugging command execution failures, I want detailed diagnostics for policy denials and guard failures, so that I can understand exactly why a command failed without reading source code.

## Acceptance Criteria

1. **Policy Denial Display**
   - When `result.deniedBy` exists, show "Policy Denial" section
   - Display policy name
   - Display formatted policy expression
   - Show evaluation context keys (not values, for security)

2. **Guard Failure Display**
   - When `result.guardFailure` exists, show "Guard Failure" section
   - Display guard index: "Guard #N failed" (1-based)
   - Display formatted guard expression
   - Display resolved values in readable format

3. **UI Behavior**
   - Diagnostics sections are collapsible/expandable
   - Clear visual distinction between policy denial vs guard failure
   - Diagnostics do not alter execution behavior (display only)

## Technical Notes

- Guard failure already partially implemented - extend it
- Per `docs/spec/semantics.md`, guard diagnostics include:
  - Failing guard index
  - Guard expression
  - Resolved values when available
- Document diagnostics format in `docs/spec/semantics.md` if not present

## Related Files

- `src/artifacts/RuntimePanel.tsx` - UI component
- `src/manifest/runtime-engine.ts` - CommandResult structure
- `docs/spec/semantics.md` - diagnostics specification
