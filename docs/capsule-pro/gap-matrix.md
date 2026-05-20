# Capsule-Pro Constitution × Manifest Capability Matrix

Tracks which constitution clauses are mechanically enforceable today.

- ✅ enforceable: spec + runtime + (where applicable) CI gate exist
- ◐ partial: runtime exists, enforcement scaffolding missing
- ✗ missing: no Manifest-side support yet

Last updated: 2026-05-20

| Clause | Topic | Status | Manifest evidence | Plan phase |
|---|---|---|---|---|
| §1 | Normative authority lives in spec + IR + conformance | ✅ | `docs/spec/ir/ir-v1.schema.json`, `src/manifest/conformance/**` | — |
| §3 | Governed mutations go through `RuntimeEngine.runCommand` | ✅ | `src/manifest/runtime-engine.ts` (`runCommand`) | — |
| §3 | Tenant/actor/request context fields | ◐ | `RuntimeContext` is loose (`{ user?, [string]: unknown }`) | Phase 1 |
| §3 | Policies / guards / constraints with diagnostics | ✅ | runtime engine §1051,§1229,§791,§831 | — |
| §4 | Adapter / effect boundary | ✅ | `stores.node.ts` (Postgres/Supabase), `ManifestEffectBoundaryError` | — |
| §5 | Canonical write path (policies → guards → actions → emits → return) | ✅ | runtime engine `runCommand` | — |
| §6 | Canonical dispatcher `POST /api/manifest/{entity}/commands/{command}` | ✗ | Next.js projection emits per-command routes only | Phase 2 |
| §8 | Governed entity registry | ✗ | None | Phase 3 |
| §8 | Bypass registry | ✗ | None | Phase 4 |
| §9 | Direct write prohibition (CI gate) | ◐ | `audit-routes` flags `prisma.X.create/update/delete/*Many` | Phase 5 |
| §10 | Read path freedom + projection generators | ✅ | `nextjs.detail`, `ts.client`, `ts.types` | — |
| §11 | Semantic events only from runtime | ◐ | Runtime emits; no CI gate against fabrication | Phase 5 |
| §11 | Transactional event outbox | ✗ | In-memory `eventLog` only | Phase 6 (deferred) |
| §12 | Audit (who/what/tenant/result/diagnostics) | ✗ | No audit emitter | Phase 6 (deferred) |
| §13 | Conformance harness for governed commands | ◐ | Harness exists; no pluggable hook for downstream | Phase 5 (missing-tests detector) |
| §13 | CI gates the constitution lists | ◐ | Only direct-write check | Phase 5 |
| §14 | Change protocol (spec → tests → impl) | ✅ | Enforced by CLAUDE.md / AGENTS.md | — |
| §17 | Required repo artifacts (registries, route/event audits, conformance index) | ✗ | None emitted | Phases 3–5 |
| §18 | RLS wiring to runtime (Postgres role / JWT claim) | ✗ | `SupabaseStore` exists, no claim wiring | Phase 6 (deferred) |
| §19 | Clerk-to-Manifest context translation | ◐ | Projection emits `await auth()` stub | Phase 2 (dispatcher) |
| §20 | Plain-terms reads-flexible / writes-rigid principle | ✅ | Implicit in design | — |

## Status legend

When a phase lands, update the row to ✅ and add a short evidence pointer
(`src/manifest/…:line` or CLI command name). When a row moves from ◐ to ✅,
note in the commit message which clause was closed.
