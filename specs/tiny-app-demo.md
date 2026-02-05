# Tiny App Demo Specification

## Job to Be Done

As a prospective user of the Manifest language, I want to see a working micro-application that demonstrates the full language capabilities end-to-end, so that I can understand what Manifest can do.

## Acceptance Criteria

1. **Domain Model** (Orders, Customers, or Tickets)
   - Entity with 3-4 properties (required and optional)
   - 2 computed properties (one depending on another)
   - 2-3 commands (create, update, complete/close)
   - 1 policy checking `user.role`
   - 1 guard checking command parameters
   - Store in memory
   - Events for key actions

2. **UI Panel** (`TinyAppPanel.tsx`)
   - **Entity List**: Display all instances (table or list)
   - **Entity Detail**: When selected, show all properties including computed
   - **Command Execution**: Form inputs, context editor, execute button
   - **Event Log**: Show events emitted

3. **Integration**
   - "Tiny App" tab in ArtifactsPanel
   - Load fixture IR, initialize runtime with memory store
   - Wire UI to runtime engine

4. **Verification**
   - Create entity instance, view computed properties
   - Execute command with valid user role -> succeeds
   - Execute command without required role -> policy denial
   - Events appear in log

## Technical Notes

- Builds on Event Log Viewer and Diagnostics features
- Use conformance fixture `17-tiny-app.manifest`

## Related Files

- `src/artifacts/TinyAppPanel.tsx` (new)
- `src/artifacts/ArtifactsPanel.tsx` - add tab
- `src/manifest/runtime-engine.ts` - runtime integration
