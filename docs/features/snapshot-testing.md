# Snapshot Testing for Projections

Snapshot tests compile a representative Manifest program to IR, run every built-in projection against it, and snapshot the generated artifacts. Any change to generated code surfaces as a snapshot diff in review. Verified against `src/manifest/projections/snapshot.test.ts` and `src/manifest/projections/__snapshots__/snapshot.test.ts.snap`.

## Usage / Syntax

The tests run as part of the normal vitest suite. To update snapshots after an intentional change to a generator:

```bash
npx vitest -u src/manifest/projections/snapshot.test.ts
```

## Behavior / What it does

The test file builds a fixed IR fixture in `snapshotIR()` — a small but representative program with two entities (`Task`, `User`), a computed property, relationships (`belongsTo`/`hasMany`), commands with guards and actions, events with channels, a policy, constraints, and a `durable` store for both entities so the ORM projections (Prisma, Drizzle) emit output. The IR provenance is hardcoded (`contentHash: 'snapshot-fixture-hash'`, fixed `compiledAt`) so the input is deterministic.

The suite enumerates projections via `listBuiltinProjections()` and asserts there are exactly ~~20~~ **29** built-in projections.

> **Correction (2026-07-15) @RYANSIGNED:** `snapshot.test.ts` uses
> ~~`expect(projections.length).toBe(29)`~~ **Correction (2026-07-22):**
> `expect(projections.length).toBe(30)` (mongoose registered). Updating the set
> still requires a conscious snapshot refresh. Package pin SoT:
> `package.json` = **3.6.41**.

For each projection it generates every surface with `generateAllSurfaces`, which runs the projection once per surface and then again per entity, de-duplicating artifacts by `id` and diagnostics by message/entity.

Non-deterministic content is stabilized before snapshotting: a `stabilize()` helper replaces any ISO-8601 timestamp matching `\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z` with the fixed value `2025-01-01T00:00:00.000Z`.

Each projection has two assertions: the stabilized map of artifact id → code must match the stored snapshot (and produce at least one artifact), and two independent generation runs must produce identical stabilized output (determinism check).

Snapshots are stored in `src/manifest/projections/__snapshots__/snapshot.test.ts.snap`.

## Reference

- Test file: `src/manifest/projections/snapshot.test.ts`.
- Snapshot file: `src/manifest/projections/__snapshots__/snapshot.test.ts.snap`.
- Update command: `npx vitest -u src/manifest/projections/snapshot.test.ts`.
- Coverage guard: `expect(projections.length).toBe(30)` — adding or removing a built-in projection requires updating this count.
- Stabilization: ISO timestamps normalized to `2025-01-01T00:00:00.000Z`.

## Notes & limitations

The fixture is a single representative IR, not exhaustive coverage of every language construct, so snapshot diffs reflect changes against that one program rather than the full feature surface. The hardcoded projection count (~~20~~ **29**) is a deliberate tripwire: it fails when the built-in projection set changes, forcing a conscious snapshot update. Only ISO-millisecond timestamps are stabilized; any other non-deterministic output in a generator would make snapshots flaky and must be handled in the generator itself, since the runtime determinism assertion would also catch it.
