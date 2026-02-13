# Manifest Documentation Governance

Last updated: 2026-02-12
Status: Active
Authority: Binding
Enforced by: npm run docs:check

## Purpose

This document defines how to classify, name, version, and edit documentation in this repository so humans and AI agents can reliably distinguish binding language law from advisory guidance.

## Front Door

Read these first:
- `docs/README.md` (human routing guide)
- `docs/contracts/README.md` (contracts signpost to canonical law)

## What Manifest Is

Manifest is a deterministic domain-specific language (DSL) with:
- a formal IR contract,
- defined runtime semantics,
- and executable conformance evidence.

## Authority Model

### Tier A: Binding language law (normative)

These files define language meaning and are authoritative:
- `docs/spec/ir/ir-v1.schema.json`
- `docs/spec/semantics.md`
- `docs/spec/builtins.md`
- `docs/spec/adapters.md`
- `docs/spec/conformance.md`
- `src/manifest/conformance/**` (fixtures and expected outputs as executable semantics evidence)

Rules:
- Meaning changes follow: spec -> conformance/tests -> implementation.
- If implementation differs, document **Nonconformance** in the relevant spec file until resolved.
- No ad-hoc reinterpretation in guides, projections, or UI docs.

### Tier B: Proposal and design docs (non-binding)

These are draft ideas, explorations, or planning notes and are advisory:
- `specs/**`
- planning folders such as `codex-plans/**`, `claude-code-plans/**`, and related backups

Rules:
- Proposal docs may suggest future behavior but do not override Tier A.
- Proposal docs must explicitly state when they differ from current normative behavior.

### Tier C: Guidance and integration docs (advisory)

These docs help users implement or adopt Manifest behavior:
- `docs/patterns/**`
- `docs/migration/**`
- `docs/tools/**`
- repository guardrails and operational docs under `docs/*.md`

Rules:
- Guidance must not contradict Tier A.
- If simplifications are used, they must call out assumptions.

## Test Governance

### Official mandatory gate tests

The following commands are required for completion and must be green:
- `npm test`
- `npm run typecheck`
- `npm run lint`

For language meaning changes, `npm test` (including conformance) is mandatory evidence.

### Temporary validation tests

Temporary tests/scripts created for debugging or AI-assisted verification are allowed, but:
- they must be clearly marked as temporary in filename or header comment,
- they must not be the sole proof for semantic behavior changes,
- and they must be either removed or promoted to permanent test assets before completion.

Promotion requirements:
- clear scope and ownership,
- deterministic behavior,
- alignment with spec/conformance expectations.

## Documentation Integrity Checks

The repository enforces deterministic documentation hygiene with:
- `npm run docs:check:metadata`
- `npm run docs:check:links`
- `npm run docs:check` (combined)

What they validate:
- Tier-A markdown files under `docs/spec/*.md` include required metadata headers.
- Markdown links in `docs/**` and `specs/**` resolve to existing local paths.
- Stale `../guides/` references do not remain in `docs/spec/**`.

## Naming and Metadata Rules

All high-impact docs (Tier A and major Tier C governance docs) should include these metadata fields near the top of the file:
- `Last updated` (YYYY-MM-DD)
- `Status` (`Active`, `Draft`, `Deprecated`, `Superseded`)
- `Authority` (`Binding` or `Advisory`)
- `Enforced by` (test path or `None`)

Recommended front-matter fields for future adoption:
- `doc_class`: `normative|conformance|proposal|guide|reference|migration`
- `version`: semantic or date-based
- `change_reason`: short rationale

## Editability Rules

- Tier A docs are editable, but only through spec-driven workflow and with conformance alignment.
- Tier B docs are freely editable and versioned as working material.
- Tier C docs are editable, but must remain consistent with Tier A.

If uncertain whether a doc is binding, treat it as binding until classification is confirmed in this file.

## Directory Clarity Policy

Current ambiguity:
- `docs/spec/` and `specs/` are easy to confuse.

Near-term policy:
- treat `docs/spec/` as normative law,
- treat `specs/` as proposal space.

Planned follow-up (requires explicit approval before path changes):
- rename `specs/` to `docs/proposals/`,
- update all internal links and agent instructions accordingly.

## Change Protocol

When changing documentation structure or authority boundaries:
1. Update this governance file first.
2. Update references in `docs/spec/README.md` and any contributor/agent instructions.
3. Validate docs links and run required tests.
4. Record rationale and date in `codex-plans/` notes during active work.
