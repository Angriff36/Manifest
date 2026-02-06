# Tiny App Demo Specification

## Job to Be Done

As a prospective user of the Manifest language, I want to see a working micro-application that demonstrates the full language capabilities end-to-end, so that I can understand what Manifest can do.

## Status ✅ SUPERSEDED BY PRIORITY 0 (Unify Runtime UI)

**Resolution Date:** 2026-02-05 (Loop 3, Priority 0)

The unified Runtime UI provides interactive demo capabilities for ANY manifest.

## Implementation Details

Instead of a hardcoded `TinyAppPanel`, the unified `RuntimePanel` provides:

1. **Entity selector dropdown** - populated from compiled IR entities
2. **Instance list** - clickable, shows key properties
3. **"Create Instance" button** - creates with default values
4. **Instance detail view** - shows all properties + computed properties
5. **Command dropdown** - populated from entity's commands
6. **Parameter hints** - based on command signature
7. **Event log sidebar** - with clear functionality
8. **Inline MemoryStore** - for browser demo (allows Supabase/Postgres manifests to work)

This unified approach works for ANY manifest, including:
- `17-tiny-app.manifest` fixture
- `20-blog-app.manifest` fixture
- Any custom manifest

## Technical Notes

**Implementation Location:** `src/artifacts/RuntimePanel.tsx`

- TinyAppPanel.tsx was removed (no longer needed)
- Runtime UI now provides universal demo capabilities
- Fixed IRValue extraction bug (was using IRValue object instead of actual value)

## Testing Completed (2026-02-05)

- Created PrepTask instance with correct defaults (status="pending", priority=1)
- Executed `claim` command successfully
- Verified properties updated (assignedTo="u1", status="in_progress")
- Verified event log shows taskClaimed event with correct payload
- Verified computed property isUrgent updates correctly (priority < 3 = false)

## Related Files

- `src/artifacts/RuntimePanel.tsx` - unified UI component (replaces TinyAppPanel)
- `src/manifest/runtime-engine.ts` - runtime integration
- `src/manifest/conformance/fixtures/17-tiny-app.manifest` - test fixture
