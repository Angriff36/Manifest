# RFC: Manifest Configuration Ergonomics

**Status**: Draft
**Type**: RFC (Request for Comments)
**Version**: 0.1
**Created**: 2026-02-14
**Target**: Language + Tooling Layer

---

## Ultimate Goal

> **If `manifest scan` passes, the code works.**

Zero trial-and-error debugging of configuration issues. Every contract mismatch, missing policy, property typo, and context gap is caught before a single request is made.

**Measurable outcomes**:

| Metric | Target |
|--------|--------|
| 500 errors from config issues | **0** (scanner catches all) |
| 403 errors from missing policies | **0** (defaults + scanner) |
| Time from "add entity" to "working API" | **< 5 minutes** |
| Files touched to add a new command | **1** (the manifest file) |

**The test**: A developer who has never used Manifest can:
1. Read one 2-minute README
2. Define an entity in a `.manifest` file
3. Run `manifest scan` → see what's missing
4. Fix issues → scan passes
5. Run `manifest generate` → get working routes
6. Make a request → **200 OK on first try**

No reading source code. No digging through error messages. No 8-file debugging sessions.

---

## Executive Summary

Manifest requires too much manual coordination between multiple files. This RFC proposes:

1. **Language changes** (require spec updates):
   - Default policy syntax
   - Built-in store targets (`prisma`, `supabase`)

2. **Tooling/integration** (this document):
   - `manifest.config.ts` for explicit bindings
   - User context auto-injection
   - Scanner CLI for gap detection
   - DevTools UI dashboard

---

## Problem Statement

### The Incident (2026-02-14)

A simple request to create an inventory item resulted in a 500 error that required fixing **8 files across 3 packages**:

| Issue | Error | Root Cause |
|-------|-------|------------|
| Store target | "Unsupported storage target 'PrismaInventoryItemStore'" | Manifest said `PrismaInventoryItemStore`, but runtime doesn't recognize it |
| Missing property | 500 | Manifest `create` command missing `itemNumber` param that Prisma requires |
| Missing policy | 403 | `create` command had no policy defined |
| Missing context | 403 | Route didn't pass `user.role` to runtime |

Each issue was discovered through trial-and-error, not upfront validation.

### The Deeper Problem

1. **Store configuration is split**: Manifest says `store X in memory`, but actual storage comes from `storeProvider` in code. They can drift.

2. **Policies are easy to forget**: Adding a new command requires manually adding a policy. No enforcement.

3. **User context boilerplate**: Every route handler must fetch `user.role` from database. Repetitive and error-prone.

4. **No visibility into gaps**: No tooling detects misconfigurations until runtime.

---

## Proposed Solution

### Layer 1: Language Changes (Requires Spec Update)

These changes modify the Manifest language and would be added to `docs/spec/semantics.md`:

#### 1.1 Default Policy Blocks

```manifest
// Entity-level defaults
entity InventoryItem {
  default policy execute: user.role in ["kitchen_staff", "kitchen_lead", "manager", "admin"]
  
  command consume(...) { ... }  // Inherits default
  
  command adjust(...) {
    // Override: managers only
    policy execute: user.role in ["kitchen_lead", "manager", "admin"]
    ...
  }
}
```

#### 1.2 Built-in Store Targets

```manifest
entity InventoryItem {
  store InventoryItem in prisma  // Built-in target, config provides implementation
}
```

Valid targets: `memory`, `localStorage`, `prisma`, `supabase`

**Spec change**: Update `docs/spec/semantics.md` with store target semantics.

---

### Layer 2: Integration/Tooling (This Document)

#### 2.1 Configuration File

`manifest.config.ts` at project root:

```typescript
import { InventoryItemPrismaStore } from './stores'

export default {
  // Map entities to store implementations
  stores: {
    InventoryItem: {
      implementation: InventoryItemPrismaStore,
      prismaModel: 'InventoryItem',  // For scanner validation
    },
  },
  
  // Auto-resolve user context
  resolveUser: async (auth: { authUserId: string; orgId: string }) => {
    const tenantId = await getTenantIdForOrg(auth.orgId)
    const user = await db.user.findFirst({
      where: { authUserId: auth.authUserId, tenantId }
    })
    return { id: user.id, role: user.role, tenantId }
  }
}
```

#### 2.2 Scanner CLI

```bash
$ npx manifest scan

❌ ERRORS:

  inventory-rules.manifest:246
    Command 'create' has no policy defined
    → Add: policy create execute: user.role in [...]

  inventory-rules.manifest:7
    Property 'itemNumber' not found in Prisma model 'InventoryItem'
    → Prisma has: id, item_number, name, category, ...
    → Did you mean: item_number?

⚠️  WARNINGS:

  3 routes not passing user.role to runtime
    apps/api/app/api/kitchen/inventory/commands/create/route.ts
    ...
```

**Scanner checks**:
- Policy coverage (every command has policy)
- Property alignment (manifest vs Prisma schema)
- Store consistency (target vs implementation)
- Route context (all required fields passed)

#### 2.3 DevTools UI Dashboard

Browser-based dev tool:

```
┌─────────────────────────────────────────────────────────────────┐
│ Manifest DevTools                                               │
├─────────────────────────────────────────────────────────────────┤
│  ENTITIES              POLICIES              ISSUES              │
│  InventoryItem ✓       ManagersCanCreate ✓   ❌ Station.create  │
│  Station       ⚠️      ManagersCanAdjust ✓      missing policy  │
│  PrepTask      ✓       ──────────────────   ⚠️ 3 routes missing │
│                                                user.role        │
├─────────────────────────────────────────────────────────────────┤
│  RECENT: POST /api/kitchen/inventory/commands/create            │
│  ✓ Success (200) • 234ms • Policy: ManagersCanCreate            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Separation of Concerns

| Layer | Location | Purpose |
|-------|----------|---------|
| **Language Semantics** | `docs/spec/semantics.md` | What Manifest *is*: execution order, IR guarantees, policy model |
| **Conformance Tests** | `docs/spec/conformance.md` | Executable evidence that implementation matches spec |
| **Integration Patterns** | `specs/ergonomics/` (this doc) | How host apps integrate safely with Manifest |
| **Tooling** | `specs/ergonomics/` | Scanner, DevTools, config helpers |

**Key principle**: Don't put integration/tooling in `docs/spec/`. That folder is constitutional.

---

## Implementation Phases

### Phase 1: Scanner CLI
- `packages/cli/src/commands/scan.ts`
- Policy coverage scanner
- Prisma alignment scanner
- Clear error messages with suggested fixes

### Phase 2: Config File
- `manifest.config.ts` schema
- Store binding configuration
- `resolveUser` auto-injection

### Phase 3: Language Changes
- Default policy syntax in parser
- Update `docs/spec/semantics.md`
- Add conformance fixtures

### Phase 4: DevTools UI
- Browser dashboard
- Real-time issue detection
- Execution viewer

---

## Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| Config errors caught at runtime | 100% | <5% |
| Missing policy errors | Common | Zero (defaults + scanner) |
| Route boilerplate lines | ~15 per route | ~3 per route |
| Issues detected before deploy | ~20% | >90% |

---

## Open Questions

1. **Config file location**: Root of project, or per-package in monorepos?
2. **Prisma schema discovery**: Auto-detect or explicit path?
3. **Multi-tenant context**: How to handle tenant-specific user resolution?
4. **Migration path**: How to upgrade existing projects?

---

## Acceptance Criteria

This RFC is accepted when:

1. **Language changes** are extracted to `docs/spec/semantics.md` and `docs/spec/conformance.md`
2. **Scanner** catches the 4 issues from the incident (store, property, policy, context)
3. **Config file** eliminates route boilerplate for user context
4. **DevTools** shows real-time status of entities, policies, and issues

---

## Appendix: Error Messages Before/After

### Store Target Error

**Before**:
```
Error: Unsupported storage target 'PrismaInventoryItemStore' for entity 'InventoryItem'
```

**After**:
```
manifest scan:

  inventory-rules.manifest:273
    Store target 'PrismaInventoryItemStore' is not recognized.
    Built-in targets: memory, localStorage, prisma, supabase
    
    If using a custom store, bind it in manifest.config.ts:
      stores: { InventoryItem: { implementation: PrismaInventoryItemStore } }
```

### Missing Policy Error

**Before**:
```
POST /api/kitchen/inventory/commands/create 403 (Forbidden)
```

**After**:
```
manifest scan:

  inventory-rules.manifest:246
    Command 'InventoryItem.create' has no policy.
    
    Add a policy:
      policy ManagersCanCreate execute: user.role in ["manager", "admin"]
    
    Or set entity defaults:
      default policy execute: user.authenticated
```

### Property Mismatch Error

**Before**:
```
Error: InventoryItemPrismaStore.create: missing itemNumber
```

**After**:
```
manifest scan:

  inventory-rules.manifest:7
    Property 'itemNumber' not found in Prisma model 'InventoryItem'.
    
    Prisma properties: id, item_number, name, category, unitCost, ...
    
    Did you mean 'item_number'? Consider:
      1. Rename manifest property to match Prisma: 'item_number'
      2. Or add mapping in manifest.config.ts:
         properties: { itemNumber: { prismaField: 'item_number' } }
```
