# Manifest Documentation Governance

Last updated: 2026-07-17
Status: Active
Authority: Binding
Enforced by: pnpm run docs:check, pnpm run docs:check:spec-integrity; feature-completion claims enforced by agent rules + `docs/internal/COMPLIANCE_MATRIX.md`

## Purpose

This document defines how to classify, name, version, structure, and edit
documentation in this repository so humans and AI agents can reliably distinguish
binding language law from advisory guidance from generated derivative output —
and write user-facing pages that stay accurate to shipped Manifest capabilities.

It also defines **where feature-completion status lives** and what proof is
required before any doc may claim a feature is fully implemented.

## Front Door

Read these first:

- ~~`docs/START_HERE.md`~~ → `docs/internal/START_HERE.md` — one-page orientation
  (IR / runtime / conformance, folder routing). Path corrected 2026-07-15.
- `docs/README.md` — product documentation front door and reading order
- ~~`docs/contracts/README.md`~~ → `docs/internal/contracts/README.md` —
  contracts signpost. Path corrected 2026-07-15.
- **`docs/internal/COMPLIANCE_MATRIX.md`** — **source of truth for feature
  completion** (done vs open). See Feature completion governance below.

Style and information-architecture rules for user pages live in
**User documentation style & information architecture** below.

## Feature completion governance

@RYAN_APPROVED 2026-07-15

**Binding source of truth:** `docs/internal/COMPLIANCE_MATRIX.md`

~~Earlier 2026-07-15 matrix drafts were gap-focused (~40 rows) and were **not** a full feature inventory.~~  
**Update (2026-07-15):** The matrix enumerates **Manifest-owned** language, builtins, runtime, stores, **each** registered projection, CLI/SDK/packaging, and Manifest gaps. Builder-owned surfaces are `OUT_OF_SCOPE` here. Ownership law: `docs/internal/contracts/manifest-builder-boundary.md`. Builder consumption: `C:\projects\builder\docs\CAPABILITY_CONSUMPTION_MATRIX.md`. Integration states: `MANIFEST_COMPLETE` / `BUILDER_CONSUMED` / `END_TO_END_VERIFIED` (see matrix). `FULLY_IMPLEMENTED` still requires filename + line range + commit SHA.

| Document                                                    | Role                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `docs/internal/COMPLIANCE_MATRIX.md`                        | **Completion SoT** — whether a **Manifest-owned** feature is done, partial, diagnostic-only, rejected, or not implemented |
| `docs/internal/contracts/manifest-builder-boundary.md`      | **Ownership boundary** — Manifest vs Builder; resolves which matrix owns a gap                                            |
| `C:\projects\builder\docs\CAPABILITY_CONSUMPTION_MATRIX.md` | **Builder consumption SoT** — Manifest API consumed, pin, Builder location, focused test                                  |
| `docs/CONFIRMED-FEATURES.md`                                | **Existence inventory** — what verifiably exists; must reconcile to the matrix; loses completion disputes                 |
| `docs/TODO.md`                                              | Working checklist of open items; closing an item requires updating the matrix first                                       |
| `docs/FEATURE-LIST.md`                                      | Historical roadmap names only — use to find missing matrix rows; never as completion proof                                |
| Tier A `docs/spec/**` + conformance                         | **Semantics SoT** — what behavior means when it exists                                                                    |

### Proof protocol (mandatory for “fully implemented”)

A matrix row (and any doc that claims completion) may use status
`FULLY_IMPLEMENTED` **only** when all three are present:

1. **Filename** — repo-relative path to the implementing code or fixture
2. **Line range** — inclusive lines in the current tree
3. **Git commit** — full SHA that introduced or last verified the behavior

Without all three, use `CLAIMED_NEEDS_PROOF`, `PARTIAL`, `DIAGNOSTIC_ONLY`,
`REJECTED_LOUD`, `NOT_IMPLEMENTED`, or `OUT_OF_SCOPE` — never invent
“complete.”

Agents MUST:

- Enter every feature and gap into the compliance matrix using its table format.
- Update the matrix **before** marking `docs/TODO.md` items done or promoting
  claims in `docs/CONFIRMED-FEATURES.md` / Mintlify / guides.
- Prefer matrix status over roadmaps, `docs/FEATURE-LIST.md`, or chat memory.

This block is human-authored (`RYAN_APPROVED`) and must not be deleted or
weakened without a new dated owner mark.

@RYAN_APPROVED

## What Manifest Is

Manifest is a deterministic domain-specific language (DSL) with:

- a formal IR contract (`docs/spec/ir/ir-v1.schema.json`),
- defined runtime semantics (`docs/spec/semantics.md`),
- and executable conformance evidence (`src/manifest/conformance/**`).

**Projections** (for example Prisma, Next.js, Convex, Zod) are **tooling**: they
read IR and emit derived artifacts. They do not define semantics. Prefer naming
real registered projections when writing examples; do not invent projection
targets in docs.

## Authority Model

### Tier A: Binding language law (normative)

These files define language meaning and are authoritative:

- `docs/spec/ir/ir-v1.schema.json`
- `docs/spec/semantics.md`
- `docs/spec/builtins.md`
- `docs/spec/adapters.md`
- `docs/spec/conformance.md`
- `docs/spec/manifest-vnext.md`
- `docs/spec/registry/` — registry schemas (commands, governed entities, bypasses)
- `docs/spec/config/` — config schemas and normative config prose where marked Binding
- `src/manifest/conformance/**` — fixtures and expected outputs as executable semantics

Rules:

- Meaning changes follow: spec → conformance/tests → implementation.
- If implementation differs from spec, document **Nonconformance** in the
  relevant spec file until resolved.
- No ad-hoc reinterpretation in guides, projections, or UI docs.

### Tier A′: Binding feature-completion law

- `docs/internal/COMPLIANCE_MATRIX.md` — binding for **completion status** only
  (not semantics). Semantics remain Tier A. See Feature completion governance.

### Tier B: Proposals and design docs (non-binding)

Advisory drafts, explorations, or planning notes:

- ~~`docs/proposals/**`~~ → `docs/internal/proposals/**` (corrected 2026-07-15)
- Planning folders: `docs/plans/`, `docs/internal/plans/`,
  ~~`docs/notes/`~~ → `docs/internal/notes/`,
  ~~`docs/context/`~~ → `docs/internal/context/`,
  `docs/superpowers/**` (agent plans/specs; non-binding)

Rules:

- Proposal docs may suggest future behavior but do not override Tier A.
- Proposal docs must explicitly state when they differ from current normative behavior.
- `docs/internal/proposals/storage-projection/README.md` documents already-shipped
  Prisma projection behavior as a reference — advisory, not normative.
- ~~Planning folders are always non-binding.~~
  > **Correction (2026-07-17):** Folder default remains Tier B advisory, but an
  > individual plan may declare `Status: Binding` for a **scoped ownership /
  > integration** rule (example:
  > `docs/internal/plans/2026-07-16-dx-proof-kit-boundary.md`). That status
  > binds only for the stated scope; it never overrides Tier A language law.
  > Prefer graduating durable Binding plans into `docs/internal/contracts/`.
  > Agents must scan `docs/internal/plans/` for Binding status before changing
  > proof-kit, command-API/webhook surfaces, or Capsule↔Manifest integration
  > surfaces (see `AGENTS.md`; example Binding plans:
  > `2026-07-16-dx-proof-kit-boundary.md`,
  > `2026-07-17-command-api-surface-boundary.md`,
  > `2026-07-19-domain-gating-restraint.md`).

### Tier C: Guidance and integration docs (advisory)

Help users implement or adopt Manifest behavior:

- `docs/getting-started/**` — tutorials / first-run journeys
- `docs/features/**` — language and runtime capability guides (must follow the
  page template below)
- `docs/guides/**` — integration patterns and concepts
  (migration lives at `docs/guides/migration/**`;
  ~~`docs/migration/**`~~ is not a root tree — corrected 2026-07-15)
- `docs/projections/**` — generated-output / projection usage docs
- `docs/reference/**` — exact CLI / API / compiler / runtime reference
- ~~`docs/tools/**`~~ → `docs/internal/tools/**` (corrected 2026-07-15)
- ~~`docs/contracts/**`~~ → `docs/internal/contracts/**` (corrected 2026-07-15)
- Repository guardrails and operational docs under `docs/*.md` and
  `docs/internal/*.md` when advisory

Rules:

- Guidance must not contradict Tier A.
- If simplifications are used, they must call out assumptions.
- Capability claims must map to shipped behavior (schemas, conformance, tests,
  or package exports) or be labeled **Documentation gap** / **SOURCE REQUIRED**.

### Tier D: Generated and derivative output (not authoritative)

Derived from IR or code — never treated as language law:

- ~~`docs/codedocs/**`~~ → `docs/internal/codedocs/**` — auto-generated API
  reference snapshots (corrected 2026-07-15)
- `mintlify/**` — public docs site (hand-curated **user** docs; **advisory** on
  tooling and explanation; must not contradict Tier A). Classification note
  (2026-07-15): Mintlify is curated prose, not machine-generated; it remains
  Tier D for authority (not binding) while remaining editable like Tier C for
  content workflow.
- Any `schema.prisma`, route handlers, or TypeScript types generated by projections

Rules:

- Tier D files document IR-derived or product-facing behavior; they do not define language meaning.
- If a Tier D file contradicts Tier A, Tier A wins.
- `docs/internal/codedocs/` files carry an `AUTO-GENERATED REFERENCE` banner.
- Mintlify pages covering projection usage are advisory on tooling, not language semantics.
- New or rewritten Mintlify language/feature pages SHOULD follow the same page
  template as `docs/features/**`.

## User documentation style & information architecture

**Status:** Binding for **new and rewritten** user-facing pages under
`docs/getting-started/`, `docs/features/`, `docs/guides/`, `docs/projections/`,
`docs/reference/`, and `mintlify/**` (language/feature/projection pages).
Existing pages are **not** required to be mass-rewritten in one pass; bring them
into compliance when meaningfully edited.

**Reference models (structure only — not Manifest feature claims):**

| Model    | Borrow for                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------- |
| Prisma   | Page structure, progressive explanation, schema-language tone, generated outputs, CLI workflows |
| TypeSpec | Completeness across language + compiler + libraries + diagnostics + emitters/projections        |
| Encore   | High-level application model: one semantic definition powers tooling and generated outputs      |
| Convex   | Plain-language definitions, capability comparisons, small examples, when-to-use guidance        |
| Stripe   | Reference pages that open with real-world meaning before operations and fields                  |

### Information architecture (separate doc kinds)

Keep these roles in **separate trees** (do not collapse them into one page type):

| Kind              | Home                                                                           | Purpose                                       |
| ----------------- | ------------------------------------------------------------------------------ | --------------------------------------------- |
| Tutorials         | `docs/getting-started/**` (+ Mintlify quickstart/install)                      | Goal-oriented first success                   |
| Concepts          | `docs/guides/**` (+ positioning pages)                                         | Mental models and integration shapes          |
| Language guides   | `docs/features/**` (+ `mintlify/language/**`)                                  | How to use a language/runtime capability      |
| Generated outputs | `docs/projections/**` (+ `mintlify/projections/**`, `mintlify/integration/**`) | What projections emit and how to consume them |
| Exact reference   | `docs/reference/**`, Tier A `docs/spec/**`, config/registry schemas            | Normative or exhaustive API/CLI/IR detail     |

Tier A `docs/spec/**` remains binding law. User guides explain; they do not replace
`semantics.md` or `ir-v1.schema.json`.

### Required page skeleton (user-facing)

Every new or rewritten tutorial, language-guide, projection, or concept page MUST
include these sections **in this order** (omit a layer only when marked N/A with
a one-line reason):

1. **Purpose (plain English)** — What this construct or workflow is for, in
   product terms, before any jargon.
2. **Smallest valid example** — The shortest compiling (or runnable) example
   before advanced syntax. Prefer conformance fixtures or verified package samples.
3. **Observable application effect** — What a human or system notices when this
   is used (data written, command denied, artifact emitted, event published).
4. **Behavior by layer** (where applicable):
   - **Compile-time** — parser/compiler diagnostics, IR shape, rejected source
   - **Runtime** — `RuntimeEngine` / adapter effects, evaluation order, outcomes
   - **Projection** — which registered projection(s) consume it and what they emit
   - **Generated SDK / package surface** — public exports (for example
     `@angriff36/manifest/projections`, `language-metadata`, CLI) when relevant
5. **Use this when** / **Do not use this when** — decision guidance; do not invent
   alternatives Manifest does not ship.
6. **Related constructs** and **Next steps** — links to sibling guides, projections,
   and the exact reference/spec pages.
7. **Complete syntax or API reference** — exhaustive fields/options/flags **after**
   the explanation, never as the opening section.
8. **Diagnostics and failure behavior** — error codes, guard/policy/constraint
   failures, validate/compile failures, and what does *not* fail (silent cases)
   when known.

### Terminology rule

Do **not** use unexplained **compiler**, **AST**, **IR**, **semantic model**, or
**projection** terminology on user-facing pages.

- On first use, define the term in one short sentence, **or** link to
  `docs/getting-started/architecture-and-positioning.md` / `docs/internal/START_HERE.md`.
- Prefer product wording (“the compiled program”, “generated Prisma schema”) once
  defined.
- Tier A and internal agent docs may remain IR-first; user trees must not assume
  prior IR literacy.

### Capability honesty

- Every recommendation and example MUST map to an existing Manifest capability
  evidenced by Tier A, conformance fixtures, tests, CLI, or published package
  exports — or must be explicitly labeled:

  `Documentation gap — not verified against shipped Manifest`

  or

  `SOURCE REQUIRED — UNABLE TO FIND DOCUMENTED METHODS`
- **Completion claims** (“fully implemented”, “shipped”, “done”) MUST match
  `docs/internal/COMPLIANCE_MATRIX.md`. Do not claim `FULLY_IMPLEMENTED` in
  guides, Mintlify, CONFIRMED-FEATURES, or TODO without the matrix’s hard proof
  (filename + line range + commit SHA). Prefer linking to the matrix row.
- Do not invent syntax, CLI flags, projection names, store targets, or SDK
  exports to make a page look complete.
- When a layer does not apply (for example a pure type has no projection
  emission), write `N/A — <reason>` under that layer heading.

### Relationship to informal feature-page habit

`docs/features/README.md` previously described intro → usage → behavior →
reference → caveats. That habit is **superseded** by the skeleton above for new
and rewritten pages (corrected 2026-07-15). Bring older feature pages into
compliance when they are next substantially edited.

## Test Governance

### Official mandatory gate tests

Required for completion and must be green:

- `pnpm test` (preferred; `npm test` remains equivalent where used)
- `pnpm run typecheck`
- `pnpm run lint`

For language meaning changes, `pnpm test` (including conformance) is mandatory evidence.

For **feature-completion** claims, green gates are necessary but not sufficient:
also record hard proof on the matching row in `docs/internal/COMPLIANCE_MATRIX.md`
(filename + line range + commit SHA) before marking `FULLY_IMPLEMENTED`.

### Temporary validation tests

Temporary tests/scripts created for debugging or AI-assisted verification are allowed, but:

- they must be clearly marked as temporary in filename or header comment,
- they must not be the sole proof for semantic behavior changes,
- and they must be either removed or promoted to permanent test assets before completion.

Promotion requirements: clear scope and ownership, deterministic behavior,
alignment with spec/conformance expectations.

## Documentation Integrity Checks

The repository enforces deterministic documentation hygiene with:

- `pnpm run docs:check:metadata` — Tier D banner and frontmatter checks
- `pnpm run docs:check:links` — internal link resolution across docs/ and mintlify/
- `pnpm run docs:check:spec-integrity` — Tier A header presence check
- `pnpm run docs:check:snippets` — snippet checks where configured
- `pnpm run docs:check` — all of the above

What they validate today:

- Tier D markdown under `docs/internal/codedocs/*.md` includes the AUTO-GENERATED REFERENCE banner.
- Mintlify `.mdx` files include a `title` frontmatter field.
- Markdown links in `docs/**` and `mintlify/**` resolve to existing local paths.
- Tier A docs under `docs/spec/*.md` include `Authority:`, `Status:`, and `Last updated:` headers.

**Documentation gap (2026-07-15):** `docs:check` does **not** yet enforce the
user page skeleton (purpose / smallest example / Use when / diagnostics order).
Enforcement remains editorial + review until a checker exists.

## Naming and Metadata Rules

All Tier A and major Tier C governance docs must include these plaintext fields near the
top of the file:

- `Last updated` (YYYY-MM-DD)
- `Status` (`Active`, `Draft`, `Deprecated`, `Superseded`)
- `Authority` (`Binding` or `Advisory`)
- `Enforced by` (test path or `None`)

User-facing pages SHOULD also open with a plain-English purpose statement (see
page skeleton) even when they omit full governance frontmatter.

## Editability Rules

- Tier A docs: editable only through the spec-driven workflow (spec → conformance → implementation).
- Tier B docs: freely editable as working material.
- Tier C docs: editable, but must remain consistent with Tier A and this style/IA section.
- Tier D codedocs: regenerated from source; do not edit directly.
- Mintlify (Tier D authority, curated): editable; must not contradict Tier A; new/rewritten pages follow the page skeleton.

If uncertain whether a doc is binding, treat it as binding until classification is
confirmed in this file.

## Directory Map

| Directory                                                                                                    | Tier                       | Contents                                                                                                     |
| ------------------------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `docs/spec/`                                                                                                 | A — Binding                | Language law: IR schema, semantics, builtins, adapters, conformance, vNext, config, registry, project layout |
| `src/manifest/conformance/`                                                                                  | A — Binding                | Fixture-based executable semantics evidence                                                                  |
| `docs/getting-started/`                                                                                      | C — Tutorials              | First-run journeys and positioning                                                                           |
| `docs/features/`                                                                                             | C — Language guides        | Per-capability guides (page skeleton required for new/rewrites)                                              |
| `docs/guides/`                                                                                               | C — Concepts / integration | Patterns; includes `guides/migration/`                                                                       |
| `docs/projections/`                                                                                          | C — Generated outputs      | Projection usage and emitted artifacts                                                                       |
| `docs/reference/`                                                                                            | C — Exact reference        | CLI, API, compiler, runtime packaging reference                                                              |
| `docs/internal/COMPLIANCE_MATRIX.md`                                                                         | A′ — Binding (completion)  | Feature-completion SoT; hard-proof protocol for FULLY_IMPLEMENTED                                            |
| `docs/CONFIRMED-FEATURES.md`                                                                                 | C — Existence inventory    | What exists; loses completion disputes to the matrix                                                         |
| `docs/TODO.md`                                                                                               | C — Working checklist      | Open items; update matrix first when closing                                                                 |
| `docs/internal/proposals/`                                                                                   | B — Non-binding            | Design proposals, deferred work, drafts                                                                      |
| `docs/plans/`, `docs/internal/plans/`, `docs/internal/notes/`, `docs/internal/context/`, `docs/superpowers/` | B — Non-binding (default)  | Plans/WIP; individual plans may opt in to scoped Binding via `Status: Binding` (never overrides Tier A)      |
| `docs/internal/tools/`                                                                                       | C — Advisory               | CLI/API usage guides (internal)                                                                              |
| `docs/internal/contracts/`                                                                                   | C — Advisory               | Signpost + scope boundary docs                                                                               |
| `docs/internal/codedocs/`                                                                                    | D — Derivative             | Auto-generated API reference for tooling ingestion                                                           |
| `mintlify/`                                                                                                  | D — Advisory (curated)     | Public docs site; follow page skeleton on new/rewrites                                                       |
| `docs/internal/archive/`                                                                                     | Historical                 | Pre-IR design history; context only                                                                          |
| `docs/internal/integrations/`                                                                                | Historical / consumer      | Downstream consumer examples; non-authoritative                                                              |

~~Obsolete root paths (`docs/proposals/`, `docs/tools/`, `docs/contracts/`,
`docs/codedocs/`, `docs/migration/`, `docs/archive/`, `docs/integrations/` as
top-level homes)~~ — corrected 2026-07-15 to the `docs/internal/**` (or
`docs/guides/migration/**`) locations above.

## Change Protocol

When changing documentation structure, authority boundaries, or this style/IA standard:

1. Update this governance file first.
2. Update references in `docs/spec/README.md` and `docs/README.md`.
3. Update ~~`docs/START_HERE.md`~~ `docs/internal/START_HERE.md` if folder routing changes.
4. Validate: `pnpm run docs:check`.
5. Record rationale and date in this file (or `docs/internal/plans/` for large moves).

When changing **feature completion** status:

1. Update `docs/internal/COMPLIANCE_MATRIX.md` first (with hard proof for
   `FULLY_IMPLEMENTED`).
2. Reconcile `docs/TODO.md` and `docs/CONFIRMED-FEATURES.md`.
3. Correct any user/Mintlify pages that claimed the old status (strikethrough +
   dated correction per CLAUDE.md documentation law).

## Rationale (2026-07-15)

Structural documentation-standard change only: path corrections for relocated
`docs/internal/**` trees; tier assignment for previously unmapped user trees
(`getting-started`, `features`, `projections`, `reference`); and a required
pedagogical page skeleton inspired by Prisma / TypeSpec / Encore / Convex /
Stripe documentation systems. No Manifest language redesign; no mass rewrite of
existing pages; capability honesty and an explicit docs:check enforcement gap
are recorded so agents do not invent behavior to fill template slots.

**Addendum (2026-07-15) — feature completion SoT:** Promoted
`docs/internal/COMPLIANCE_MATRIX.md` to binding Tier A′ for completion status,
with a mandatory hard-proof protocol (filename + line range + git commit) for
`FULLY_IMPLEMENTED`. Recorded in this file, `AGENTS.md`, and `CLAUDE.md` under
`@RYAN_APPROVED 2026-07-15` so agents cannot treat roadmaps or unverified
inventory prose as “done.”

**Addendum (2026-07-17) — Binding plans opt-in:** Clarified that
`docs/internal/plans/` defaults to Tier B, but a plan may declare
`Status: Binding` for scoped ownership/integration (proof-kit boundary).
Wired into `AGENTS.md` / `CLAUDE.md` so proof-kit and Capsule integration work
cannot miss that plan. Does not change Tier A language law.

**Addendum (2026-07-19) — Domain gating restraint:** Binding plan
`2026-07-19-domain-gating-restraint.md` — agents must not overgate consumer
domain policies/guards (freeze mid-ops, specialty read caps). Pointers in
`AGENTS.md` / `CLAUDE.md`. Capsule twin:
`C:/Projects/capsule/docs/architecture/domain-gating-restraint.md`.
