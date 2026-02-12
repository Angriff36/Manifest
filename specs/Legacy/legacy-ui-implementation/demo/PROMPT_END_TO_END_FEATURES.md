# End-to-End Feature Implementation Prompt

## Context

The Manifest language implementation can parse, compile, and pass conformance tests. Now it needs to **do something** that humans can interact with and understand. This prompt implements three end-to-end features that wire command execution → state change → event → UI/log.

## Constitutional Requirements

Follow the repo's workflow:
1. **Spec first**: Document behavior in `docs/spec/semantics.md` or `docs/spec/builtins.md` if needed
2. **Tests second**: Add conformance fixtures that prove the behavior
3. **Implementation third**: Wire runtime + UI
4. **Regenerate**: Use `npm run conformance:regen` to update expected outputs

## Option A: Event Log Viewer (Fastest Path)

**Goal**: Show a live event log in the Runtime UI that displays events emitted by commands.

**Requirements**:

1. **Fixture** (`src/manifest/conformance/fixtures/15-event-log.manifest`):
   - Entity with a command that emits an event
   - Event payload must include the last action result (per spec: "payload: an object containing command input and the last action result")
   - Example:
     ```manifest
     entity Order {
       property required id: string
       property total: number = 0
       
       command addItem(amount: number) {
         mutate total = self.total + amount
         emit OrderUpdated
       }
     }
     
     event OrderUpdated: "order.updated" {
       orderId: string
       total: number
     }
     ```

2. **Runtime Panel Enhancement** (`src/artifacts/RuntimePanel.tsx`):
   - Add an "Event Log" section below command results
   - Display events emitted during command execution
   - Show: event name, channel, payload (formatted JSON), timestamp
   - Events should persist across command executions (append to log)
   - Add a "Clear Log" button

3. **Verification**:
   - Execute a command that emits an event
   - Verify the event appears in the log with correct payload structure
   - Verify payload includes command input and last action result

**Expected Outcome**: When you run a command, you immediately see the event appear in the log with all details.

## Option B: Policy + Guard Diagnostics (Runtime Debugger)

**Goal**: Extend the Runtime UI to show detailed diagnostics for policy denials and guard failures.

**Requirements**:

1. **Spec Update** (`docs/spec/semantics.md`):
   - Document that `CommandResult.deniedBy` includes policy name
   - Document that `CommandResult.guardFailure` includes:
     - Guard index (1-based)
     - Formatted expression
     - Resolved values for sub-expressions

2. **Runtime Panel Enhancement** (`src/artifacts/RuntimePanel.tsx`):
   - When `result.deniedBy` exists:
     - Show "Policy Denial" section
     - Display policy name
     - Display formatted policy expression
     - Show evaluation context keys (not values, for security)
   - When `result.guardFailure` exists:
     - Show "Guard Failure" section (already partially implemented)
     - Display guard index: "Guard #2 failed"
     - Display formatted expression
     - Display resolved values in a readable format:
       ```
       Resolved values:
         self.status = "pending"
         "pending" = "pending"
       ```
   - Make diagnostics collapsible/expandable

3. **Fixture** (`src/manifest/conformance/fixtures/16-diagnostics-detail.manifest`):
   - Entity with multiple policies and guards
   - Test case: policy denial (user without required role)
   - Test case: guard failure (second guard fails, first passes)

4. **Verification**:
   - Execute command without required user role → see policy denial details
   - Execute command that fails on second guard → see guard failure details with resolved values

**Expected Outcome**: When a command fails, users can see exactly why without reading source code.

## Option C: Tiny App (First Real Product)

**Goal**: Build a minimal domain application (Orders/Customers/Tickets) that demonstrates the full language capabilities.

**Requirements**:

1. **Domain Model** (`src/manifest/conformance/fixtures/17-tiny-app.manifest`):
   - Choose one: Orders, Customers, or Tickets
   - Entity with:
     - 3-4 properties (including required and optional)
     - 2 computed properties (one that depends on another)
     - 2-3 commands (create, update, complete/close)
     - 1 policy that checks `user.role`
     - 1 guard that checks command parameters
   - Store in memory
   - Events for key actions

2. **UI Panel** (`src/artifacts/TinyAppPanel.tsx` - new component):
   - **Entity List**: Display all instances (table or list)
   - **Entity Detail**: When selected, show:
     - All properties (including computed)
     - Available commands
     - Command execution form (inputs for parameters)
   - **Command Execution**:
     - Form inputs for command parameters
     - Runtime context editor (user role)
     - Execute button
     - Show results (success/failure with diagnostics)
   - **Event Log**: Show events emitted by commands

3. **Integration**:
   - Add "Tiny App" tab to ArtifactsPanel
   - Load the fixture IR
   - Initialize runtime engine with memory store
   - Wire up UI to runtime engine methods

4. **Verification**:
   - Create an entity instance
   - View computed properties (verify they update)
   - Execute command with valid user role → succeeds
   - Execute command without required role → policy denial shown
   - Execute command with invalid parameters → guard failure shown
   - Verify events appear in log

**Expected Outcome**: A working micro-application that demonstrates the language's capabilities end-to-end.

## Implementation Order

1. **Option A** (fastest): Event log viewer
   - ~30 minutes
   - Immediate visual feedback
   - Validates event semantics

2. **Option B** (most useful): Diagnostics enhancement
   - ~45 minutes
   - Makes runtime debuggable
   - Extends existing guard failure display

3. **Option C** (most complete): Tiny app
   - ~90 minutes
   - Full end-to-end demonstration
   - Proves the language can build real apps

## Technical Notes

- **Runtime Engine**: Already has `getEventLog()` method - use it
- **Event Payload**: Per spec, payload includes command input + last action result
- **Context Security**: Show context keys, not values (to avoid leaking sensitive data)
- **Determinism**: Use deterministic timestamps in tests (already implemented)
- **Regeneration**: After adding fixtures, run `npm run conformance:regen`

## Success Criteria

- All three options work end-to-end
- UI is responsive and shows real data
- Diagnostics are clear and actionable
- Tests pass (`npm test`)
- No hand-edited IR files (use `npm run conformance:regen`)

## Files to Create/Modify

**New Files**:
- `src/manifest/conformance/fixtures/15-event-log.manifest`
- `src/manifest/conformance/fixtures/16-diagnostics-detail.manifest`
- `src/manifest/conformance/fixtures/17-tiny-app.manifest`
- `src/artifacts/TinyAppPanel.tsx` (for Option C)

**Modify Files**:
- `src/artifacts/RuntimePanel.tsx` (Options A & B)
- `src/artifacts/ArtifactsPanel.tsx` (add Tiny App tab for Option C)
- `docs/spec/semantics.md` (document diagnostics format for Option B)
- `src/manifest/conformance/expected/*.ir.json` (regenerated)
- `src/manifest/conformance/expected/*.results.json` (for runtime tests)

## Start Here

Begin with **Option A** - it's the fastest path to seeing the language "move" and provides immediate validation that events work correctly.
