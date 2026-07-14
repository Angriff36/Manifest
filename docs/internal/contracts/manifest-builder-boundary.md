# Manifest ↔ Builder Boundary (Canonical)

**Status:** Binding direction, agreed 2026-07-14. Companion of
`deployment-boundaries.md`. Current-state facts below verified against
Manifest v3.5.0 and the Builder repo (`C:\projects\builder`) on 2026-07-14.

## Definitions

**Manifest** is the language, compiler, IR, runtime semantics, projections,
analysis APIs, and the stable platform SDK that exposes them. Manifest answers:
*"What does this application mean?"*

**Builder** (Manifest Studio) is the official first-party Manifest control
plane and application factory. It loads, creates, generates, inspects,
verifies, and maintains complete Manifest-governed applications. Builder
answers: *"How do I use Manifest to create and maintain an application?"*

**Generated applications** consume Manifest contracts (generated artifacts +
regen pipeline); they never recreate Manifest semantics. (See the Capsule-V2
reference pattern in `docs/internal/plans/2026-07-14-full-manifest-adoption-roadmap.md`
Part 0.2.)

The analogy that governs disputes: Builder is to Manifest as VS Code is to
TypeScript. Deep integration through published APIs; separate ownership,
separate release cadence, separate repos.

## Ownership

| Layer | Owner | Notes |
|---|---|---|
| Lexer / parser / AST / language metadata | Manifest | incl. keyword lists, builtin catalogs, modifier sets |
| Compiler (source → IR), multi-module merge | Manifest | |
| IR schema + semantics (the meaning) | Manifest | `docs/spec/**` is law |
| Reference runtime engine | Manifest | |
| Projections (convex, prisma, zod, openapi, …) | Manifest | incl. per-projection capability matrices |
| Analysis (ir-diff, breaking-change, wiring inspection, validation) | Manifest | |
| Platform SDK (the export map) | Manifest | the ONLY door Builder may use |
| Visual editor, completions UI, panels | Builder | consuming language metadata from the SDK, never hardcoding it |
| Project management, templates/presets, assembly, export | Builder | |
| Projection selection UI, deployment workflow, dashboards | Builder | |
| Runtime playground / debugger UI | Builder | Manifest exposes the engine; Builder visualizes it |
| Agent interface / orchestration UX | Builder | on top of `agent-sdk` / MCP server |

**RuntimePanel disposition:** Manifest's in-repo UI (`src/App.tsx`,
`src/artifacts/*`) remains what CLAUDE.md already declares it to be — a
*diagnostic and observability surface* for developing Manifest itself. It is
not the product debugger. Product-grade runtime UX is Builder's; Manifest's
panels must never grow product features, and may eventually shrink as Builder
absorbs their audiences.

## The Platform API — current reality vs gaps (verified 2026-07-14)

Manifest already exposes a ~60-subpath export map (`package.json#exports`),
so "Manifest needs an SDK" is mostly false — what's missing is narrower:

| Proposed SDK call | Today | Status |
|---|---|---|
| `compile()` | `@angriff36/manifest/ir-compiler` (`IRCompiler.compileToIR`) | ✅ exists; Builder uses it (`src/lib/manifest.ts`) |
| `generate()` | `@angriff36/manifest/projections` registry (`getProjection`, `listProjections`) | ✅ exists; Builder uses it |
| `runRuntime()` | `@angriff36/manifest/runtime-engine` | ✅ exists |
| `analyzeImpact()` | `@angriff36/manifest/ir-diff` + `/breaking-change` | ✅ exists; Builder does NOT consume yet |
| `inspectWiring()` | `@angriff36/manifest/projections/wiring` | ✅ exists; Builder does NOT consume yet |
| `generateAgentTools()` | `@angriff36/manifest/agent-sdk` + `@manifest/mcp-server` | ✅ exists; Builder consumes agent-sdk |
| `getLanguageMetadata()` | `@angriff36/manifest/language-metadata` (`getLanguageMetadata`) | ✅ exists (2026-07-14). Keywords ← lexer `KEYWORDS`, modifiers ← `PROPERTY_MODIFIERS` / IR schema, builtins ← `RuntimeEngine.getBuiltins()`, date/time primitives ← `date-time.ts`. |
| `getProjectionCapabilities()` | `listProjections()` gives names/surfaces | 🟧 **PARTIAL.** Capability matrices are markdown (e.g. convex `CAPABILITIES.md`), not API. Expose structured per-projection capability data (supported / partial / unsupported per IR feature) so Builder can render honest coverage without parsing docs. |
| Stability guarantee | `docs/spec/sdk-stability.md` | ✅ declared (2026-07-14). Lists the stable-for-Builder subpaths; breaking a stable subpath requires a major version + a **Breaking** CHANGELOG entry. Unlisted exports are internal. |

## Builder-side requirement: the `manifest-project` control plane

All Builder features route through one internal layer (grow
`builder/src/lib/manifest.ts` into `src/lib/manifest-project/`):

```
compileProject() · inspectProject() · generateProject() · verifyProject() · analyzeChanges()
```

UI components never import `@angriff36/manifest/*` directly — only
`manifest-project`. That is the single choke point that keeps Builder from
re-implementing semantics. Enforce mechanically (lint rule / import boundary),
not by convention.

**Builder's defining promise:** change the Manifest source, and Builder shows
every affected application surface, regenerates the owned artifacts, detects
consumer drift, and proves the resulting application remains coherent.

## Repo & naming strategy

Separate repositories, one official ecosystem. Merging repos is rejected:
every Manifest release must not require rebuilding a web app. Package naming
stays `@angriff36/manifest` (+ workspace `@manifest/cli`, `@manifest/mcp-server`,
`@manifest/lsp-server`) for now; an npm-scope migration (`@manifest/*` public)
is a separate, later decision — do not couple it to this boundary work.

## Sequencing (spec-first — this document is the spec)

1. ~~Fix the Convex projection~~ — **DONE, shipped in v3.5.0 (2026-07-14).**
2. **Close the SDK gaps** (Manifest repo): `language-metadata` export,
   structured projection capabilities, stability declaration. Small, additive.
3. **Builder refactor**: establish `manifest-project`, route every existing
   feature through it, delete hardcoded language knowledge (acceptance:
   `grep -rn "'entity'" builder/src/lib/completions.ts` finds no keyword
   tables — the list arrives from the SDK).
4. **Application presets** (starting with the complete Convex app preset —
   the Capsule-V2 pattern productized: regen script, drift gate,
   authContextImport seam, ownership checks).

Rule that orders all of it: **make Builder unable to drift from Manifest
before making Builder bigger.**

## Drift tripwires

- Any keyword/type/builtin list found hardcoded in Builder → bug against this contract.
- Any Manifest semantic decision (guard order, policy meaning, IR shape) implemented in Builder → bug.
- Any product UI feature growing inside Manifest's diagnostic panels → bug.
- Builder importing Manifest internals not in the export map → bug.
