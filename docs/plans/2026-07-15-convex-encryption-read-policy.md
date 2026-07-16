# Convex Encryption And Read-Policy Enforcement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make generated Convex reads enforce Manifest read policies and make generated Convex reads and writes transparently honor `encrypted` properties through an author-owned encryption seam.

**Architecture:** Add an optional `encryptionImport` Convex projection option alongside `authContextImport`. Generated mutations serialize encrypted values through the imported provider before persistence; generated queries decrypt stored envelopes before evaluating read policies and before returning visible rows. Read policies compile from IR and fail closed with the same no-existence-leak result shapes as the reference runtime.

**Tech Stack:** TypeScript, Convex generated functions, Manifest IR expressions, Vitest, pnpm.

---

### Task 1: Specify the contracts

**Files:**

- Modify: `docs/spec/semantics.md`
- Modify: `docs/spec/adapters.md`

1. Add the normative property-encryption envelope, ordering, failure, and compatibility rules.
2. Define the Convex `encryptionImport` provider surface and read-policy enforcement requirement.
3. Confirm that the IR schema does not change.

### Task 2: Establish failing projection tests

**Files:**

- Modify: `src/manifest/projections/convex/functions.test.ts`
- Modify: `src/manifest/projections/convex/semantics.test.ts`

1. Add a row-level read-policy test proving denied list rows are omitted and denied single reads return `null`.
2. Add a context-only read-policy test proving generated queries evaluate the policy through `getAuthContext`.
3. Add create, patch, list, and get encryption tests proving the envelope and decrypt transforms are generated.
4. Add fail-closed tests for missing `authContextImport` and missing `encryptionImport`.
5. Run only the focused tests and confirm the new assertions fail for missing behavior.

### Task 3: Implement read-policy query enforcement

**Files:**

- Modify: `src/manifest/projections/convex/read-policies.ts`
- Modify: `src/manifest/projections/convex/functions.ts`
- Modify: `src/manifest/projections/convex/capabilities.ts`

1. Select applicable global and entity-scoped read/all policies in IR order.
2. Render policy expressions against `self`/`this` and the author-owned auth context.
3. Apply context-only checks once per list query and row-level checks per row.
4. Return empty lists or `null` on denial and keep queries internal when no auth seam exists.
5. Replace the unsupported advisory with diagnostics only for genuinely unrenderable policy expressions.

### Task 4: Implement Convex encryption

**Files:**

- Modify: `src/manifest/projections/convex/options.ts`
- Modify: `src/manifest/projections/convex/descriptor-meta.ts`
- Modify: `src/manifest/projections/convex/privacy.ts`
- Modify: `src/manifest/projections/convex/functions.ts`
- Modify: `src/manifest/projections/convex/capabilities.ts`

1. Add and normalize `encryptionImport`.
2. Generate imports only for surfaces that contain encrypted persistent fields.
3. Encrypt non-null create/update values into the versioned runtime-compatible JSON envelope.
4. Decrypt valid envelopes after reads, leaving legacy plaintext unchanged.
5. Evaluate read policies and masking/private projection against decrypted values.
6. Emit `CONVEX_ENCRYPTION_IMPORT_REQUIRED` only when encrypted persistent fields exist without the seam.

### Task 5: Reconcile completion records

**Files:**

- Modify: `docs/internal/COMPLIANCE_MATRIX.md`
- Modify: `docs/TODO.md`
- Modify: `docs/CONFIRMED-FEATURES.md`
- Modify: `src/manifest/projections/convex/CAPABILITIES.md`
- Modify: `src/manifest/projections/convex/README.md`

1. Record the implementation as pending proof until a commit SHA exists.
2. Remove stale claims that Convex stores encrypted values as ordinary strings or cannot evaluate read policies.
3. Keep `authContextImport` and `encryptionImport` configuration requirements explicit.

### Task 6: Verify

1. Run the focused Convex projection tests.
2. Run `pnpm install`, `pnpm outdated`, and `pnpm audit`; resolve safe patch/minor hygiene or document concrete blockers.
3. Run `pnpm test`, `pnpm run typecheck`, and `pnpm run lint`.
4. Review `git diff` and separate these changes from the pre-existing dirty worktree changes.
