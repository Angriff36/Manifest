Last updated: 2026-05-26
Status: Active
Authority: Advisory
Enforced by: None
Applies to: Capsule-Pro repository at `C:\Projects\capsule-pro` vs [`docs/spec/project-layout.md`](../../spec/project-layout.md)

# Capsule-Pro Layout Conformance Report

This report diffs the Capsule-Pro monorepo against the normative consumer layout
in [`docs/spec/project-layout.md`](../../spec/project-layout.md). Capsule-Pro's
binding layout law remains **`constitution.md` §4a** in the Capsule-Pro repo;
when this report and the constitution disagree, **constitution wins** for
Capsule-Pro.

## Executive summary

| Verdict | Detail |
|---------|--------|
| **Profile** | **G (Governed production)** — exceeds the Manifest reference fixture |
| **Structural alignment** | Strong — dedicated `manifest/` tree matches Profile G intent |
| **Normative path renames** | `manifest-registry/` → `manifest/governance/` (documented ADR) |
| **Extensions** | `@repo/manifest-runtime` workspace, 86 source files, route projection at scale |
| **Gaps / debt** | No `manifest.config.yaml`; package version lag; duplicate route trees; stale internal docs |

## Tree map (Manifest-related only)

```text
C:\Projects\capsule-pro\
├── manifest/                          # Capsule-owned Manifest workspace (§4a)
│   ├── source/                        # 86 × *.manifest  [Layer 1]
│   ├── ir/
│   │   ├── kitchen.ir.json            # Merged IR       [Layer 2]
│   │   ├── kitchen.commands.json
│   │   ├── kitchen.merge-report.json
│   │   └── kitchen.provenance.json
│   ├── runtime/                       # @repo/manifest-runtime workspace
│   │   ├── commands.registry.json
│   │   ├── routes.ts                  # Generated route helpers (~5k lines)
│   │   └── src/                       # Prisma stores, factory, engines
│   ├── governance/                    # Profile G registries
│   │   ├── commands.json
│   │   ├── entities.json
│   │   ├── bypasses.json
│   │   ├── audit-routes-exemptions.json
│   │   └── baselines/
│   ├── scripts/                       # compile, generate, emit-registries, audits
│   └── reports/                       # Audit output (often gitignored)
├── apps/
│   ├── api/
│   │   ├── app/api/
│   │   │   ├── manifest/[entity]/commands/[command]/route.ts  # Dispatcher
│   │   │   └── {kitchen,events,inventory,crm,...}/**/route.ts # ~176 generated
│   │   └── lib/
│   │       ├── manifest-runtime.ts
│   │       ├── manifest-response.ts
│   │       ├── manifest-command-handler.ts
│   │       └── manifest/
│   │           ├── execute-command.ts   # Canonical executor (constitution §7)
│   │           ├── command-resolver.ts
│   │           ├── outbox.ts
│   │           └── telemetry.ts
│   └── app/lib/manifest-runtime.ts
├── packages/
│   ├── database/prisma/schema.prisma
│   └── mcp-server/                      # Uses @angriff36/manifest + @repo/manifest-runtime
├── .github/workflows/manifest-ci.yml
└── constitution.md                      # Binding layout (§4a)
```

## Normative ↔ Capsule-Pro path table

| Normative ([`project-layout.md`](../../spec/project-layout.md)) | Capsule-Pro path | Status |
|------------------------------------------------------------------|------------------|--------|
| Layer 1: `**/*.manifest` or `manifest/**/*.manifest` | `manifest/source/*.manifest` (86 files) | ✅ Conforms (explicit glob via scripts) |
| `manifest.config.yaml` | *None* — `manifest/scripts/*.mjs` | ⚠️ Equivalent config required; not YAML |
| Layer 2: `ir/` | `manifest/ir/kitchen.ir.json` (+ sidecars) | ✅ Conforms (merged IR) |
| `manifest-registry/commands.json` | `manifest/governance/commands.json` | ✅ Renamed; update CI flags only |
| `manifest-registry/entities.json` | `manifest/governance/entities.json` | ✅ Renamed |
| `bypasses.json` | `manifest/governance/bypasses.json` | ✅ Renamed (currently empty bypass list) |
| Dispatcher: `{appDir}/manifest/.../route.ts` | `apps/api/app/api/manifest/[entity]/commands/[command]/route.ts` | ✅ Conforms |
| `runtimeImportPath` glue | `apps/api/lib/manifest-runtime.ts` → `@repo/manifest-runtime` | ✅ Extended (workspace package) |
| `responseImportPath` glue | `apps/api/lib/manifest-response.ts` | ✅ Conforms |
| `manifest-executor` / external executor | `apps/api/lib/manifest/execute-command.ts` | ✅ Conforms (different filename) |
| Prisma: `prisma/schema.prisma` | `packages/database/prisma/schema.prisma` | ✅ Monorepo convention |
| Next.js `appDir` default | `apps/api/app/api` | ✅ Matches projection default |
| Generated routes under projection output | `apps/api/app/api/{domain}/**` | ✅ Conforms + **legacy duplicates** |
| Language repo `src/manifest/` | *N/A* | ✅ Correctly absent |

## Config equivalence (scripts vs `manifest.config`)

Capsule-Pro encodes paths in scripts instead of `manifest.config.yaml`:

| Concern | Capsule-Pro location | Effective value |
|---------|----------------------|-----------------|
| Source | `manifest/scripts/compile.mjs` | `manifest/source/` (programmatic merge; avoids CLI glob last-wins) |
| IR output | `compile.mjs` | `manifest/ir/kitchen.ir.json` |
| Codegen | `manifest/scripts/generate.mjs` | IR → `apps/api/app/api` via `nextjs` + `ENTITY_DOMAIN_MAP` |
| Registries | `manifest/scripts/emit-registries.mjs` | → `manifest/governance/` |

**Recommendation:** Add `manifest.config.yaml` at repo root that mirrors script paths so
`manifest config inspect` and upstream docs apply without tribal knowledge.

## Package and version alignment

| Package | Capsule-Pro | Manifest language repo (reference) |
|---------|-------------|--------------------------------------|
| `@angriff36/manifest` | **1.0.5** (root, api, app, runtime, mcp-server) | **1.0.15** (current publish) |

Capsule-Pro is **10 minor releases behind** the Manifest package used for language
development. New features (value objects, tenant IR, timestamps, ir-diff, etc.)
are not available until Capsule bumps the dependency and recompiles IR.

Governance JSON may still cite older `compilerVersion` strings (e.g. `0.3.8`) —
track separately from npm package version.

## CI vs reference fixture

| Reference (`fixtures/sample-app/Verify.md`) | Capsule-Pro |
|---------------------------------------------|-------------|
| Single `manifest/library.manifest` | 86 domain rule files merged to `kitchen.ir.json` |
| `manifest audit-governance` with sample registries | `.github/workflows/manifest-ci.yml` — 10+ jobs |
| No codegen drift check | `manifest-codegen-check` job (generate + git diff) |
| No TypeScript gate | `manifest-typescript-check` (turbo) |

Capsule-Pro CI is a **strict superset** of the sample-app proof.

## Extensions beyond normative minimum

These are **allowed** when documented in constitution §4a; they are not layout violations.

| Extension | Purpose |
|-----------|---------|
| `manifest/runtime/` (`@repo/manifest-runtime`) | Prisma-backed stores, factory, route helpers, rules engines |
| `manifest/runtime/commands.registry.json` | Runtime dispatcher registry (separate from governance export) |
| `manifest/governance/baselines/`, exemptions | Audit baselines and route exemptions |
| `manifest/reports/` | Human-readable audit artifacts |
| `packages/mcp-server/` | MCP tools over Manifest runtime |
| Domain-mapped generated routes (`kitchen/`, `events/`, …) | `ENTITY_DOMAIN_MAP` in `generate.mjs` |
| `apps/api/lib/manifest-command-handler.ts` | REST adapters delegating to runtime |

## Gaps and technical debt

| Issue | Severity | Notes |
|-------|----------|-------|
| No `manifest.config.yaml` | Medium | Scripts work; agents and upstream docs assume YAML |
| `@angriff36/manifest@1.0.5` lag | High | Missing 1.0.6–1.0.15 language features and fixes |
| Duplicate route trees | Medium | e.g. `kitchen/preplist/` vs `kitchen/prep-lists/` — legacy projection output |
| Stale docs | Low | `manifest/ir/README.md` references retired `packages/manifest-ir/`; `.github/MANIFEST_CI.md` may reference old paths |
| `packages/manifest-ir/` shell | Low | Legacy package stub; IR lives under `manifest/ir/` |
| Empty `bypasses.json` | Info | Valid; sample-app has a demo bypass for detector exercise |
| `kitchen.*` naming | Low | IR filename is historical; content is full merged program |

## Profile classification

| Profile | Capsule-Pro |
|---------|-------------|
| M Minimal | — |
| N Next.js | — (partial; has routes + dispatcher but not minimal) |
| **G Governed** | **Yes** — registries, bypass schema, full audit CI, constitution |

## Recommended actions (ordered)

1. Bump `@angriff36/manifest` to latest published (≥ 1.0.15), re-run `manifest:compile` + `manifest:generate`, fix breaking IR/registry drift.
2. Add root `manifest.config.yaml` aligned with `manifest/scripts/*` (or generate scripts from config).
3. Delete or quarantine legacy duplicate routes under `apps/api/app/api/`.
4. Refresh internal docs (`manifest/ir/README.md`, `MANIFEST_CI.md`) to §4a paths only.
5. Optionally rename `kitchen.ir.json` → `merged.ir.json` in a dedicated migration (cosmetic).

## Verification commands

From Manifest repo (paths adjusted for Capsule-Pro):

```bash
cd C:/Projects/capsule-pro

pnpm manifest:compile
pnpm manifest:registries

pnpm exec manifest audit-governance \
  --root . \
  --commands-registry manifest/governance/commands.json \
  --bypass-registry manifest/governance/bypasses.json \
  --strict
```

## Authority

- **Normative layout:** [`docs/spec/project-layout.md`](../../spec/project-layout.md)
- **Capsule-Pro binding:** `C:\Projects\capsule-pro\constitution.md` §4a, §17
- **Reference fixture:** [`fixtures/sample-app/`](../../../fixtures/sample-app/)
