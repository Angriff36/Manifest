# Registry-Generated Feature Inventory Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and superpowers:verification-before-completion to implement this plan task-by-task.

**Goal:** Replace the stale Automaker roadmap in `docs/FEATURE-LIST.md` with a deterministic inventory generated from Manifest's live registries and evidence-bearing files.

**Architecture:** A TypeScript generator reads the language metadata API, projection descriptor registry, Commander command tree, conformance fixtures, package exports, and the binding compliance matrix. It renders one deterministic Markdown document and supports a check mode so CI detects drift. The compliance matrix remains the completion source of truth; the generated inventory reports existence and registration only.

**Tech Stack:** TypeScript, Vitest, Commander, pnpm, existing Manifest registries.

---

### Task 1: Expose the CLI command tree for read-only inventory

**Files:**

- Modify: `packages/cli/src/index.ts`
- Test: `scripts/generate-feature-list.test.ts`

1. Write a failing test asserting the inventory includes nested command paths such as `db init`, `diff breaking`, and `versions verify`.
2. Run the focused test and confirm it fails because no inventory generator exists.
3. Export a read-only accessor for the already-constructed Commander program.
4. Re-run the focused test.

### Task 2: Generate the verified inventory

**Files:**

- Create: `scripts/generate-feature-list.ts`
- Test: `scripts/generate-feature-list.test.ts`
- Replace generated output: `docs/FEATURE-LIST.md`

1. Add failing assertions for language metadata, all projection descriptors, conformance fixture evidence, package exports, and matrix status links.
2. Implement deterministic collectors and Markdown rendering.
3. Add write mode and `--check` drift detection.
4. Generate `docs/FEATURE-LIST.md` and verify a second generation is byte-identical.

### Task 3: Wire the drift gate and reconcile completion ledgers

**Files:**

- Modify: `package.json`
- Modify: `docs/internal/COMPLIANCE_MATRIX.md`
- Modify: `docs/TODO.md`
- Modify if necessary: `docs/CONFIRMED-FEATURES.md`

1. Add `docs:feature-list` and `docs:check:feature-list` scripts and include the check in `docs:check`.
2. Update the compliance matrix first with honest proof status; do not claim `FULLY_IMPLEMENTED` without a commit SHA.
3. Reconcile the TODO and confirmed-feature inventory without weakening either document's authority.
4. Run focused tests, generator check, docs checks, dependency hygiene, and the full verification ladder.
