# IR Sample Seed Pack Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship Manifest seed-pack authoring (template / fill / validate) and runtime apply/clear via `SampleDataRow`, so apps can commit a pack and load/clear full-domain sample data with one button.

**Architecture:** New `src/manifest/seed-pack/` library (types, template, validate, fill, apply, clear, SampleDataRow store contract). CLI `manifest seed` gains subcommands. Apply uses two-phase direct store writes + seedKey→id map; clear deletes only recorded rows. Design: `docs/plans/2026-07-09-ir-sample-seed-pack-design.md`.

**Tech Stack:** TypeScript, existing IR types, mulberry32/PRNG patterns from `packages/cli/src/commands/seed.ts`, Ollama HTTP for fill, vitest, MemoryStore for unit tests.

---

### Task 1: Seed pack types + SampleDataRow contract

**Files:**

- Create: `src/manifest/seed-pack/types.ts`
- Create: `src/manifest/seed-pack/sample-data-row.ts`
- Create: `src/manifest/seed-pack/index.ts`
- Test: `src/manifest/seed-pack/types.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { isBlankCell, SAMPLE_DATA_ROW_ENTITY } from './types.js';

describe('seed-pack types', () => {
  it('treats empty and {{fill}} as blank', () => {
    expect(isBlankCell('')).toBe(true);
    expect(isBlankCell('{{fill}}')).toBe(true);
    expect(isBlankCell('Acme')).toBe(false);
  });
  it('exports SampleDataRow entity name', () => {
    expect(SAMPLE_DATA_ROW_ENTITY).toBe('SampleDataRow');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/manifest/seed-pack/types.test.ts`
Expected: FAIL (module not found)

**Step 3: Write minimal implementation**

`types.ts`: `SeedPackMeta`, `SeedPack`, `SeedEntityTable`, `SeedRow`, `isBlankCell`, `SAMPLE_DATA_ROW_ENTITY`, `SampleDataRowRecord`.

`sample-data-row.ts`: helpers to build/parse row records (`tenantId`, `packId`, `version`, `entity`, `seedKey`, `instanceId`).

`index.ts`: re-export.

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/manifest/seed-pack/types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/manifest/seed-pack
git commit -m "[seed-pack] add types and SampleDataRow contract"
```

---

### Task 2: Pack IO (read/write CSV + meta)

**Files:**

- Create: `src/manifest/seed-pack/pack-io.ts`
- Test: `src/manifest/seed-pack/pack-io.test.ts`

**Step 1: Write the failing test**

Round-trip: write a tiny pack to a temp dir (`manifest.seed.json` + `entities/Vendor.csv` with `seedKey,name`), read it back, assert rows and meta.

**Step 2: Run test — expect FAIL**

**Step 3: Implement** `writeSeedPack` / `readSeedPack` (CSV parse/serialize; first column `seedKey`).

**Step 4: Run test — expect PASS**

**Step 5: Commit** `[seed-pack] add pack CSV/JSON IO`

---

### Task 3: Template generator from IR

**Files:**

- Create: `src/manifest/seed-pack/template.ts`
- Test: `src/manifest/seed-pack/template.test.ts`

**Step 1: Failing test**

Compile a tiny IR (or hand-build `IR` with Vendor + Requisition `belongsTo` Vendor). `buildSeedTemplate(ir, { packId, version, count: 2 })` yields:

- meta with both entities
- Vendor rows with `seedKey` like `vendor-1`, blank name cells / `{{fill}}`
- Requisition FK column holding empty/`{{fill}}` (not real ids)
- No `id` column required

Skip `external` entities and optionally skip `SampleData` / `SampleDataRow`.

**Step 2: Run — FAIL**

**Step 3: Implement** using IR properties + relationships; reuse naming from CLI seed where useful but **seedKey not store id**.

**Step 4: Run — PASS**

**Step 5: Commit** `[seed-pack] generate blank template from IR`

---

### Task 4: Pack validator (soft IR drift)

**Files:**

- Create: `src/manifest/seed-pack/validate.ts`
- Test: `src/manifest/seed-pack/validate.test.ts`

**Step 1: Failing tests**

1. Pack entity missing from IR → error.
2. Pack column for unknown property/rel → error.
3. Unrelated IR entity added that pack does not use → **no** error.
4. FK `seedKey` referencing missing row → error.
5. Duplicate `seedKey` in entity → error.
6. Required property still blank after fill → error (validate mode `strict` / post-fill).

**Step 2–4:** Implement `validateSeedPack(ir, pack): SeedPackValidation` with `errors` / `warnings`.

**Step 5: Commit** `[seed-pack] validate pack against IR with soft drift`

---

### Task 5: Fill blanks (provider + blank-only)

**Files:**

- Create: `src/manifest/seed-pack/fill.ts`
- Create: `src/manifest/seed-pack/fill-providers.ts`
- Test: `src/manifest/seed-pack/fill.test.ts`

**Step 1: Failing tests**

1. With a **mock provider** that returns fixed values: blanks become filled; pre-filled `"Acme"` unchanged without overwrite.
2. With `overwrite: true`, `"Acme"` is replaced.
3. After fill, validator passes for required fields (mock returns valid enums/strings).

**Step 2–3:** Implement `fillSeedPack(ir, pack, { provider, overwrite })`. Default provider interface:

```ts
interface SeedFillProvider {
  fillEntity(input: {
    entityName: string;
    columns: string[];
    rows: Array<Record<string, string>>;
    allowedSeedKeys: Record<string, string[]>; // target entity -> seedKeys
  }): Promise<Array<Record<string, string>>>;
}
```

Include `createOllamaFillProvider` (HTTP) and `createHeuristicFillProvider` (deterministic, no network — used in tests and as offline fallback).

**Step 4: PASS**

**Step 5: Commit** `[seed-pack] fill blanks via provider (heuristic + ollama)`

---

### Task 6: Two-phase apply + clear + idempotency

**Files:**

- Create: `src/manifest/seed-pack/apply.ts`
- Create: `src/manifest/seed-pack/clear.ts`
- Test: `src/manifest/seed-pack/apply.test.ts`

**Step 1: Failing tests** (MemoryStore / in-memory map store)

1. Apply creates Vendor + Requisition; phase 2 sets FK to real instance id; `SampleDataRow` count matches.
2. Second apply same `packId+version+tenantId` creates **zero** new entity rows.
3. Clear removes only recorded instances + SampleDataRow rows; unrelated MemoryStore rows remain.

**Step 2–3:** Implement `applySeedPack({ ir, pack, tenantId, stores })` and `clearSeedPack({ tenantId, packId?, version?, stores })`.

Store access: accept `getStore(entityName): Store` (same shape as runtime `Store` — `create` / `update` / `delete` / `getById` / `getAll`).

**Step 4: PASS**

**Step 5: Commit** `[seed-pack] two-phase apply, clear, idempotency`

---

### Task 7: Wire CLI subcommands

**Files:**

- Modify: `packages/cli/src/commands/seed.ts` (or split `seed-pack-cli.ts`)
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/src/commands/seed-pack.test.ts`

**Step 1: Failing CLI tests** for:

- `seed template <source> -o <dir>`
- `seed validate <dir>`
- `seed fill <dir> --provider heuristic`
- `seed apply` / `seed clear` against memory (or skip apply in CLI if store wiring is runtime-only — then CLI documents apply as library API and only ships template/fill/validate)

**Decision for this task:** CLI ships `template`, `fill`, `validate`. `apply`/`clear` are library exports used by runtime/middleware; optional CLI `apply --dry-run` that prints plan without store.

**Step 2–4:** Implement + PASS

**Step 5: Commit** `[seed-pack] CLI template/fill/validate`

---

### Task 8: Package export + FEATURE-LIST note

**Files:**

- Modify: `package.json` exports → `./seed-pack`
- Modify: `docs/FEATURE-LIST.md` (short entry for `ir-sample-seed-pack`)
- Modify: `CHANGELOG.md` under Unreleased / next version stub

**Step 1:** Add export path pointing at `dist/manifest/seed-pack/index.js` (match existing export patterns).

**Step 2:** Run `pnpm run typecheck` and `pnpm exec vitest run src/manifest/seed-pack packages/cli/src/commands/seed-pack.test.ts`

**Step 3: Commit** `[seed-pack] export package surface and document feature`

---

### Task 9: Full verification

**Step 1:** `pnpm test` (or scoped if full suite too long mid-flight — full suite before done)

**Step 2:** `pnpm run typecheck`

**Step 3:** Fix any fallout

**Step 4:** Final commit if needed

---

## Capsule follow-up (out of Manifest PR scope; note only)

- Point `sample-data-seed-middleware` at committed pack + `applySeedPack` / `clearSeedPack` instead of `seedSampleData`.
- Generate/fill a capsule pack covering procurement, vehicles, etc.
- Ensure Prisma schema includes `SampleDataRow` (infra or Manifest entity).

## Reference

- Design: `docs/plans/2026-07-09-ir-sample-seed-pack-design.md`
- Existing generator: `packages/cli/src/commands/seed.ts`
- Capsule CTA: `SampleData.seed` + `sample-data-seed-middleware.ts`
