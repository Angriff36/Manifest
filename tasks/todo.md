# Active Plan: Capsule-Pro Constitution Enforcement

Detailed plan: `docs/plans/2026-05-20-capsule-pro-constitution-enforcement.md`

Source goal (from session 2026-05-20):
1. Typed runtime context (tenantId, orgId, actorId, requestId, source, deterministic).
2. `nextjs.dispatcher` projection at `/api/manifest/[entity]/commands/[command]/route.ts`.
3. Machine-readable command + governed-entity registries from compiled IR.
4. Bypass registry schema + CLI validator.
5. Expand audit-routes into a constitution audit suite.
6. Durable runtime audit/outbox contracts (gated on 1–5).

## Phases

- [x] **Phase 0 — Spec alignment**
  - [x] 0.1 Mirror capsule-pro constitution into `docs/capsule-pro/`
  - [x] 0.2 Create `docs/capsule-pro/gap-matrix.md`

- [x] **Phase 1 — Typed RuntimeContext** (closed 2026-05-20; 768/768 green)
  - [x] 1.1 Spec: document typed context bindings
  - [x] 1.2 Add typed fields to `RuntimeContext` interface
  - [x] 1.3 Wire `context.deterministic` into runtime
  - [x] 1.4 `requireTenantContext` fail-closed
  - [x] 1.5 Closing verification (tests, lint of touched files, typecheck, gap-matrix)

- [x] **Phase 2 — nextjs.dispatcher projection** (closed 2026-05-20; 777/777 green)
  - [x] 2.1 Spec: canonical dispatcher section
  - [x] 2.2 Register `nextjs.dispatcher` surface in generator
  - [x] 2.3 Mark `nextjs.command` output as deprecated alias
  - [x] 2.4 Closing verification

- [ ] **Phase 3 — IR registries**
  - [ ] 3.1 Schemas at `docs/spec/registry/`
  - [ ] 3.2 `emitRegistries(ir)` function + tests
  - [ ] 3.3 Schema validation in emitter
  - [ ] 3.4 CLI: `manifest emit registries`
  - [ ] 3.5 Closing verification

- [ ] **Phase 4 — Bypass registry**
  - [ ] 4.1 Bypass schema
  - [ ] 4.2 `manifest audit bypasses` validator
  - [ ] 4.3 Closing verification

- [ ] **Phase 5 — Constitution audit suite**
  - [ ] 5.1 Umbrella `manifest audit constitution`
  - [ ] 5.2 Event fabrication detector
  - [ ] 5.3 Route drift detector
  - [ ] 5.4 Missing-tests detector
  - [ ] 5.5 Bypass violations detector
  - [ ] 5.6 End-to-end smoke fixture
  - [ ] 5.7 Closing verification

- [ ] **Phase 6 — Audit + outbox (DEFERRED, sketch only)**
  - See plan §"Phase 6" for contracts.

## Validation cadence

- After every task: `npm test` (must stay ≥630 green), `npm run typecheck`, `npm run lint`.
- After every phase: gap-matrix update + commit.
- House style: spec → tests → impl. No auto-repair. No emojis.
- Platform: Windows — never `2>&1`; forward slashes only.
