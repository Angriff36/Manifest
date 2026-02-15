<!-- Context: project-intelligence/notes | Priority: high | Version: 1.1 | Updated: 2026-02-14 -->

# Living Notes

> Active issues, technical debt, open questions, and insights that don't fit elsewhere. Keep this alive.

## Quick Reference

- **Purpose**: Capture current state, problems, and open questions
- **Update**: Weekly or when status changes
- **Archive**: Move resolved items to bottom with status

## Active Projects

| Project | Goal | Owner | Timeline |
|---------|------|-------|----------|
| Ergonomics RFC | Eliminate config trial-and-error | Agent | 2026-02 |

### Project: Configuration Ergonomics

**Goal**: If `manifest scan` passes, the code works.

**Status**: RFC drafted at `specs/ergonomics/manifest-config-ergonomics.md`

**Phases**:
1. Scanner CLI - detect missing policies, property mismatches, store issues
2. Config file - `manifest.config.ts` for store bindings, user context
3. Language changes - default policies, built-in store targets
4. DevTools UI - browser dashboard for real-time feedback

**Ultimate metric**: Developer can add entity → run scan → fix issues → generate → 200 OK on first try.

## Technical Debt

| Item | Impact | Priority | Mitigation |
|------|--------|----------|------------|
| Store config split | Confusing errors, 500s | High | Ergonomics RFC Phase 1 |
| Missing policies = 403 | Poor DX | High | Default policies syntax |
| Route user.role boilerplate | Repetitive, error-prone | Medium | Auto-injection via config |

## Known Issues

### Issue: Contract Mismatch Between Manifest and Host Code

**Severity**: High  
**Impact**: 500 errors that require debugging 8+ files across multiple packages  
**Root Cause**: Manifest, PrismaStore, and routes can drift independently  
**Fix Plan**: Scanner CLI to detect gaps before runtime  
**Status**: RFC in progress

### Issue: Missing Policy = Silent 403

**Severity**: Medium  
**Impact**: Commands fail with no guidance on what's missing  
**Root Cause**: No default policies, no enforcement  
**Fix Plan**: Default policy syntax + scanner check  
**Status**: RFC in progress

## Insights & Lessons Learned

### What Works Well
- IR-first architecture - single source of truth for semantics
- Conformance tests - executable semantics catch regressions
- Spec-first development - spec → tests → impl prevents drift

### What Could Be Better
- Store config requires coordination between manifest + code - easy to mismatch
- Policies are easy to forget when adding commands
- Route handlers need boilerplate to fetch user.role

### Lessons Learned (2026-02-14)

**Store Targets**: Manifest `store X in <target>` must use built-in targets (`memory`, `localStorage`, `prisma`, `supabase`). Custom store names like `PrismaInventoryItemStore` throw "Unsupported storage target" errors. The actual store implementation is provided via `storeProvider` in runtime config.

**Policy Requirements**: Every command needs at least one policy. Without it, all requests get 403. Add policies like: `policy ManagersCanCreate execute: user.role in ["manager", "admin"]`

**User Context**: Runtime needs `user.role` to evaluate policies. Routes must fetch role from database and pass to `createManifestRuntime({ user: { id, tenantId, role } })`.

**Property Alignment**: Manifest entity properties should match Prisma schema field names. If they differ, PrismaStore must map between them.

## Gotchas for Maintainers

- **Don't put RFCs in docs/spec/**: That folder is for language LAWS (semantics, conformance, builtins). Proposals go in `specs/` at root.
- **IR is cached**: Restart dev server after manifest changes, or the old IR is used
- **Store target ≠ Store implementation**: Manifest says `memory`, code provides `PrismaStore` via `storeProvider`

## Archive (Resolved Items)

### Resolved: Capsule-Pro Inventory Create 500 Error (2026-02-14)
- **Resolved**: 2026-02-14
- **Root Causes**:
  1. Store target `PrismaInventoryItemStore` invalid → changed to `memory`
  2. Missing `itemNumber` property in manifest → added property + command param
  3. No policy for `create` command → added `ManagersCanCreate` policy
  4. Route not passing `user.role` → added DB lookup for role
- **Files Touched**: 8 files across 3 packages
- **Lesson**: Configuration gaps compound; need upfront validation

## Onboarding Checklist

- [ ] Review known technical debt and understand impact
- [ ] Know what open questions exist and who's involved
- [ ] Understand current issues and workarounds
- [ ] Be aware of patterns and gotchas
- [ ] Know active projects and timelines
- [ ] Understand the team's priorities
- [ ] Read the ergonomics RFC if touching config/tooling

## Related Files

- `decisions-log.md` - Past decisions that inform current state
- `business-domain.md` - Business context for current priorities
- `technical-domain.md` - Technical context for current state
- `business-tech-bridge.md` - Context for current trade-offs
- `specs/ergonomics/manifest-config-ergonomics.md` - Active RFC for DX improvements
