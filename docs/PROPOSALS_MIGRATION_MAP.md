# Proposals Directory Migration Map

Last updated: 2026-02-11
Status: Draft (approved for planning)
Authority: Advisory
Enforced by: None

## Objective

Remove ambiguity between:
- `docs/spec/` (binding language law)
- `specs/` (non-binding proposal/design material)

by renaming proposal space from `specs/` to `docs/proposals/`.

## Scope

In scope:
- Path-by-path move plan for existing `specs/**` files.
- Reference update checklist.

Out of scope:
- Changing semantics in `docs/spec/**`.
- Editing conformance fixtures.
- Rewriting proposal content beyond path references/headers.

## Canonical Target

- Source root: `specs/`
- Target root: `docs/proposals/`

## Path Mapping (Exact)

| Current path | Target path |
|---|---|
| `specs/capsule-pro/README.md` | `docs/proposals/integrations/capsule-pro/README.md` |
| `specs/capsule-pro/capsule-pro-integration-spec.md` | `docs/proposals/integrations/capsule-pro/capsule-pro-integration-spec.md` |
| `specs/demo/PROMPT_build.md` | `docs/proposals/demos/PROMPT_build.md` |
| `specs/demo/PROMPT_END_TO_END_FEATURES.md` | `docs/proposals/demos/PROMPT_END_TO_END_FEATURES.md` |
| `specs/demo/PROMPT_plan.md` | `docs/proposals/demos/PROMPT_plan.md` |
| `specs/functions/builtin-functions.md` | `docs/proposals/language/functions/builtin-functions.md` |
| `specs/guards/policy-guard-diagnostics.md` | `docs/proposals/language/guards/policy-guard-diagnostics.md` |
| `specs/manifest-as-an-app/event-log-viewer.md` | `docs/proposals/demos/manifest-as-an-app/event-log-viewer.md` |
| `specs/manifest-as-an-app/IMPLEMENTATION_PLAN_RUNTIME_AND_UI.md` | `docs/proposals/demos/manifest-as-an-app/IMPLEMENTATION_PLAN_RUNTIME_AND_UI.md` |
| `specs/manifest-as-an-app/tiny-app-demo.md` | `docs/proposals/demos/manifest-as-an-app/tiny-app-demo.md` |
| `specs/ralph/AGENTS.md.template` | `docs/proposals/agent-assets/ralph/AGENTS.md.template` |
| `specs/ralph/IMPLEMENTATION_PLAN.md.backup` | `docs/proposals/agent-assets/ralph/IMPLEMENTATION_PLAN.md.backup` |
| `specs/ralph/IMPLEMENTATION_PLAN.md.bakk` | `docs/proposals/agent-assets/ralph/IMPLEMENTATION_PLAN.md.bakk` |
| `specs/ralph/IMPLEMENTATION_PLAN.md.template` | `docs/proposals/agent-assets/ralph/IMPLEMENTATION_PLAN.md.template` |
| `specs/ralph/loop.sh.template` | `docs/proposals/agent-assets/ralph/loop.sh.template` |
| `specs/ralph/PROMPT_build.md` | `docs/proposals/agent-assets/ralph/PROMPT_build.md` |
| `specs/ralph/PROMPT_plan.md` | `docs/proposals/agent-assets/ralph/PROMPT_plan.md` |
| `specs/storage-adapters/storage-adapters.md` | `docs/proposals/language/storage-adapters/storage-adapters.md` |
| `specs/vnext/IMPLEMENTATION_PLAN_VNEXT.md` | `docs/proposals/roadmap/vnext/IMPLEMENTATION_PLAN_VNEXT.md` |
| `specs/vnext/IMPLEMENTATION_PLAN_VNEXT_FULL.md` | `docs/proposals/roadmap/vnext/IMPLEMENTATION_PLAN_VNEXT_FULL.md` |
| `specs/vnext/PROMPT_build.md` | `docs/proposals/roadmap/vnext/PROMPT_build.md` |
| `specs/vnext/PROMPT_plan.md` | `docs/proposals/roadmap/vnext/PROMPT_plan.md` |
| `specs/workflow/Manifest-Workflow-Orchestration-and-Effect-Boundaries.md` | `docs/proposals/language/workflow/Manifest-Workflow-Orchestration-and-Effect-Boundaries.md` |

## Required Follow-up Reference Updates

1. Search and replace path references:
- `specs/` -> `docs/proposals/` for all markdown references.
2. Update any agent/contributor docs that mention `specs/` as a location.
3. Add an index file:
- `docs/proposals/README.md` with clear "Advisory, non-binding" marker.
4. Add optional top-level compatibility note:
- `specs/README.md` (temporary) pointing to `docs/proposals/` before eventual removal.

## Known Adjacent Cleanup (Not part of this rename)

These broken links were introduced in separate moves and should be fixed in the same PR if possible:
- `docs/spec/adapters.md` references `../guides/...` but docs now live under `docs/patterns/...`.

## Safe Execution Sequence

1. Create target directories.
2. Move files with `git mv` using the mapping table.
3. Update markdown references with a single scripted pass.
4. Add `docs/proposals/README.md`.
5. Run verification:
- `npm test`
- `npm run typecheck`
- `npm run lint`
6. Review for unresolved links:
- `rg -n "specs/|docs/guides/" docs specs AGENTS.md README*`

## Rollback Plan

If link churn is too high, revert only the move commit and keep:
- `docs/DOCUMENTATION_GOVERNANCE.md`
- this migration map document

Then re-attempt in smaller batches by subdirectory.
