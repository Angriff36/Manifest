# IR Sample Seed Pack — Design

**Date:** 2026-07-09  
**Status:** Locked  
**Scope:** Manifest language tooling + runtime apply/clear. Capsule-pro CTA rewiring is a consumer follow-up.

## Problem

Apps like capsule-pro need one **Load sample data** / **Clear** action that fills every capability surface (procurement, vehicles, kitchen, …). Today:

- `manifest seed` only emits synthetic files; it does not apply or clear.
- Capsule `SampleData.seed` flips a flag and runs a hand-written Prisma blob that covers a fraction of the domain and uses business fields (`tags` / `source`) as markers.

Manifest already owns the IR. Sample data should be IR-derived, authorable, AI-fillable at pack-authoring time, and applied/cleared safely at runtime with no LLM on the button path.

## Product shape

**Dev / CI (authoring):**

1. `manifest seed template` — blank pack from IR (`seedKey`s, columns, FK slots).
2. `manifest seed fill` — cheap/free model fills blanks only (default Ollama).
3. `manifest seed validate` — pack vs current IR; fail only on used-entity/field incompatibility.
4. Commit the filled pack with the app.

**Runtime (button):**

1. `SampleData.seed` (or `manifest seed apply`) loads the committed pack for `tenantId`.
2. Idempotent on `packId + version + tenantId` (double-click does not duplicate).
3. Two-phase apply: create all rows, then wire relationships.
4. Every created row recorded in `SampleDataRow` (sole clear authority).
5. Clear deletes only recorded rows for that tenant/run.

## Locked decisions

| Decision       | Choice                                                           |
| -------------- | ---------------------------------------------------------------- |
| Definition     | Authorable pack (CSV/JSON), not pure random IR invent            |
| Fill           | Built-in `--fill` (Ollama default; optional cloud providers)     |
| Apply path     | Direct store writes (not create commands)                        |
| Markers        | **`SampleDataRow` only** — never `tags` / `source`               |
| Identity       | Pack-local **`seedKey`** → store id map on apply                 |
| Ordering       | **Two-phase** (create, then relate) — topo alone is insufficient |
| Fill overwrite | Blanks/placeholders only; explicit `--overwrite` to regenerate   |
| IR drift       | Soft: fail only when pack-used entities/fields are incompatible  |
| Idempotency    | `packId + version + tenantId`                                    |

## Pack format

```text
seed-pack/
  manifest.seed.json          # packId, version, profile, entity list
  entities/
    Vendor.csv                # seedKey, property columns, FK as seedKey refs
    Requisition.csv
    …
```

`manifest.seed.json` (sketch):

```json
{
  "packId": "capsule-demo",
  "version": "1.0.0",
  "profile": "demo",
  "entities": ["Vendor", "Requisition", "Vehicle"]
}
```

CSV columns:

- `seedKey` (required, pack-local stable id, e.g. `vendor-acme`)
- seedable scalar properties (no real DB `id` column required)
- relationship columns hold **target `seedKey`** values (resolved in phase 2)

Placeholders for fill: empty cells or `{{fill}}`.

## Apply / clear

**Phase 1 — create:** For each entity (any stable order), create rows with scalars only; omit FK fields that point at other pack rows. Record `SampleDataRow { tenantId, packId, version, entity, seedKey, instanceId }`. Build `seedKey → instanceId` map.

**Phase 2 — relate:** For each relationship column, `store.update` with resolved instance ids.

**Idempotency:** If `SampleDataRow` already has rows for `(packId, version, tenantId)`, apply is a no-op success.

**Clear:** Load `SampleDataRow` for tenant (and optional pack/version); delete entity instances in reverse dependency-safe order (children / FK dependents first, or delete by recorded instance ids with FK-nulling pass); delete `SampleDataRow` records.

## Fill provider

- Default: Ollama `http://localhost:11434`, small model.
- Override: `--provider ollama|openai|anthropic`, `--model`, API keys via env.
- Batched per entity with allowed parent `seedKey`s in context.
- Post-fill validation + retry; never trust model output blindly.
- Default: fill blanks only; `--overwrite` regenerates existing values.

## Non-goals (this design)

- Runtime LLM on the Load button.
- Using business `tags`/`source` as sample markers.
- Replacing capsule-pro’s UI button (consumer wires pack path into existing middleware).
- Seeding via create-command semantics (explicitly rejected; direct store writes).

## Success criteria

- Template covers durable non-external entities from IR.
- Filled pack validates; unrelated IR changes do not break apply.
- Apply is idempotent; clear removes only `SampleDataRow`-tracked rows.
- No mutation of real-user rows that lack a `SampleDataRow` entry.
- Conformance/unit tests green in Manifest repo.
