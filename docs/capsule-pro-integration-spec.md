# Capsule-Pro Integration Spec

## Status: manifest repo work complete — ready for Capsule-Pro sync

The projection API has been extended with `tenantProvider` support, Clerk auth now conditionally destructures `orgId`, and the CLI exposes all required flags including `--command`. Copy `src/manifest/projections/` and `bin/generate-projection.ts` into `packages/manifest/` to begin.

---

## Corrections to Prior Assumptions

| Assumption | Reality |
|---|---|
| `@/lib/database` | `@repo/database` (workspace package) |
| `@/lib/auth` | `@repo/auth/server` (Clerk wrapper) |
| `userTenantMapping.findUnique({ where: { userId } })` | `getTenantIdForOrg(orgId)` — uses Clerk orgId, not userId |
| `@/lib/manifest-runtime` doesn't exist | Correct, but pattern is `@repo/manifest` + `@repo/kitchen-ops` factories |
| `@/lib/manifest-response` doesn't exist | Correct, but it's `packages/kitchen-ops/src/api-response.ts` |
| Manifest not yet integrated | Wrong — `packages/manifest/` (v0.3.0) is already a workspace dep; kitchen-ops uses it extensively |
| CLI doesn't exist | Wrong — `packages/manifest/bin/capsule-pro-generate.ts` exists |
| No .manifest files | Wrong — 6 exist in `packages/kitchen-ops/manifests/` |
| Runtime method is `runCommand` | Capsule-Pro calls `engine.executeCommand(...)` — needs verification against v0.3.0 vs v0.3.8 |

---

## Actual Blockers (in order)

1. **Version sync** — `packages/manifest/` at v0.3.0 needs the projection system from v0.3.8 *(resolved in manifest repo; sync pending in Capsule-Pro)*
2. ~~**`tenantProvider` missing from projection API**~~ — ✓ done: `tenantProvider` option added to `NextJsProjectionOptions`
3. ~~**Auth template incomplete**~~ — ✓ done: Clerk auth conditionally destructures `orgId` when `tenantProvider.lookupKey === 'orgId'`
4. **`executeCommand` vs `runCommand`** — all usages in Capsule-Pro must match whatever v0.3.8 exposes; update callers if renamed
5. ~~**Import path defaults not configurable**~~ — ✓ done: CLI exposes `--auth-import`, `--db-import`, `--runtime-import`, `--response-import`, `--tenant-import`

---

## Phase A — Sync into Capsule-Pro

**manifest repo work is complete. The following is Capsule-Pro work.**

The projection API now supports `tenantProvider`, Clerk auth conditionally includes `orgId`, and the CLI has full flag support. Generated output for Capsule-Pro:

```ts
import { getTenantIdForOrg } from '@repo/database';
import { auth } from '@repo/auth/server';
// ...
const { orgId, userId } = await auth();
const tenantId = await getTenantIdForOrg(orgId);
```

- [ ] Copy `src/manifest/projections/` into `packages/manifest/src/manifest/projections/`
- [ ] Copy `bin/generate-projection.ts` into `packages/manifest/bin/`
- [ ] Export projection API from `packages/manifest/package.json` (add entry points for `@repo/manifest/projections`)
- [ ] Check method name: if v0.3.8 renamed `runCommand` → `executeCommand` or vice versa, update all kitchen-ops callers to match
- [ ] Run Capsule-Pro tests to confirm nothing broke

---

## Phase B — Configure projection for Capsule-Pro import paths

The projection CLI must be invoked with options matching Capsule-Pro's workspace:

```bash
manifest-generate nextjs nextjs.command \
  packages/kitchen-ops/manifests/prep-task-rules.manifest PrepTask claim \
  --output apps/api/app/api/kitchen/prep-tasks/commands/claim/route.ts \
  --auth-import @repo/auth/server \
  --db-import @repo/database \
  --tenant-provider getTenantIdForOrg \
  --tenant-lookup-key orgId
```

- [ ] Confirm CLI flags exist for auth-import, db-import, tenant-provider, tenant-lookup-key (add if missing)
- [ ] Document the Capsule-Pro invocation pattern for reuse across all commands

---

## Phase C — Create createManifestRuntime factory

Capsule-Pro needs a runtime factory per domain. Follows existing `createRecipeRuntime()` pattern in kitchen-ops.

```ts
// packages/kitchen-ops/src/manifest-runtime.ts
import { RuntimeEngine } from '@repo/manifest';
import { prepTaskIR } from './compiled-ir/prep-task';

export function createPrepTaskRuntime(ctx: { user: { id: string; tenantId: string } }) {
  return new RuntimeEngine(prepTaskIR, ctx);
}
```

One factory per domain (not one combined IR) to keep compilation units small and match the existing per-domain kitchen-ops pattern.

- [ ] Create `packages/kitchen-ops/src/manifest-runtime.ts` with one factory per `.manifest` file
- [ ] Export from kitchen-ops package index

---

## Phase D — Generate and verify first command handler

Start with `prep-task-rules.manifest` → `claim` command. It is the most mature and has the clearest existing manual route to compare against.

- [ ] Generate handler using the configured CLI invocation from Phase B
- [ ] Confirm it compiles
- [ ] Confirm auth (orgId + userId), tenant scoping (getTenantIdForOrg), and response shape match the existing manual route exactly

---

## Phase E — Replace manual command routes

Once Phase D is verified, replace remaining commands one at a time.

- [ ] Audit each manual POST handler for behavior not captured in `.manifest` guards/policies — extract any missing guards into the `.manifest` source before generating
- [ ] Generate replacement handler for each command
- [ ] Verify response shape matches existing client expectations (or update client)
- [ ] Remove old manual handler

---

## Full Integration Scope (beyond Phase A-E)

Phase A-E migrates one domain's command surface. Full integration requires:

### 1. Manifest source coverage per domain

CRM, Events, Inventory, Staff, Admin have no `.manifest` files. For each:
- Extract guards/constraints currently inline in manual route handlers
- Write `.manifest` source
- Verify IR compiles and semantics match existing behavior

### 2. Read routes

Projection generates a basic GET with tenant + soft-delete filter. Capsule-Pro's manual GETs have pagination, search, filtering, and joins. **Keep manual GET handlers. Use projection for command surfaces only.** Extend projection read support when the manual GET complexity is understood well enough to model generically.

### 3. Response shape alignment

Generated handlers return `{ result, events }`. Capsule-Pro's existing routes return `{ data, pagination }` or domain-specific shapes. Align the generated shape to match the existing contract, or migrate client code command-by-command.

### 4. Runtime context completeness

Guards and policies may reference `context.role`, `user.stationId`, etc. Audit all `.manifest` files for context field references and ensure the factory passes them through.

### 5. Event handling

Commands emit events. The generated handler returns `{ events: result.emittedEvents }` but does not wire to Capsule-Pro's realtime system. Re-connect each command's emitted events to the existing notification/WebSocket infrastructure after the handler is in place.

### 6. Constraint override flows

`packages/kitchen-ops/src/api-response.ts` has constraint outcome utilities. The generated handler must return `constraintOutcomes` on constraint failure (not just 400) so the UI can present override prompts. Align the generated error response shape with the existing `api-response.ts` contract.

### 7. CI regeneration gates

Add CI step: regenerate projections from `.manifest` sources, confirm no diff. Drift becomes a build failure.

---

## Progress Milestones

| Milestone | What it gives you |
|---|---|
| Phase A complete | Projection system usable in Capsule-Pro; generated code compiles |
| + Phase B-D | One generated command handler running in production |
| + Phase E | All kitchen-ops PrepTask commands enforced through runtime |
| + Other kitchen-ops domains migrated | Full kitchen-ops command surface on runtime |
| + Other domains' .manifest sources written | Semantic coverage across the app |
| + Response/event/constraint wiring | Full behavioral equivalence with manual routes |
| + CI regeneration gates | Drift becomes a build failure |

Phases A-E ≈ 20% of the work. The domain migration is the other 80%.
