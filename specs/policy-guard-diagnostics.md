# Policy and Guard Diagnostics Specification

## Job to Be Done

As a developer debugging command execution failures, I want detailed diagnostics for policy denials and guard failures, so that I can understand exactly why a command failed without reading source code.

## Status ✅ COMPLETED

**Implementation Date:** 2026-02-05 (Loop 3, Priority 4)

## Acceptance Criteria (All Met)

1. **Policy Denial Display** ✅
   - When `result.deniedBy` exists, show "Policy Denial" section
   - Display policy name
   - Display formatted policy expression
   - Show evaluation context keys (not values, for security)

2. **Guard Failure Display** ✅
   - When `result.guardFailure` exists, show "Guard Failure" section
   - Display guard index: "Guard #N failed" (1-based)
   - Display formatted guard expression
   - Display resolved values in readable format

3. **UI Behavior** ✅
   - Diagnostics sections are collapsible/expandable
   - Clear visual distinction between policy denial vs guard failure
   - Diagnostics do not alter execution behavior (display only)

## Technical Notes

**Implementation Location:** `src/artifacts/RuntimePanel.tsx`

1. **Guard Failure Display** (`formatGuardFailure`, lines 362-415):
   - Collapsible section with expand/collapse toggle
   - Shows guard index as "Guard #N failed" (1-based)
   - Shows formatted guard expression
   - Shows resolved values in readable format
   - Red/rose color scheme for visual distinction

2. **Policy Denial Display** (`formatPolicyDenial`, lines 417-485):
   - Collapsible section with expand/collapse toggle
   - Shows policy name
   - Shows formatted policy expression
   - Shows evaluation context keys (not values, for security)
   - Shows resolved values from policy evaluation
   - Amber/yellow color scheme for visual distinction from guard failures

## Related Files

- `src/artifacts/RuntimePanel.tsx` - UI component (lines 362-485)
- `src/manifest/runtime-engine.ts` - CommandResult structure
- `docs/spec/semantics.md` - diagnostics specification
