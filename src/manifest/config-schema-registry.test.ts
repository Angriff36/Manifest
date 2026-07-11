/**
 * Drift guard: docs/spec/config/manifest.config.schema.json's
 * `properties.projections.properties` must stay in sync with the real
 * projection registry.
 *
 * The 2026-07-01 reconciliation audit found the config schema hard-coded a
 * closed set of four projections, so configuring any of the other ~23
 * registered projections failed `manifest config validate` even though
 * `manifest generate --all` consumes them. `scripts/generate-config-schema.mjs`
 * now derives the allowed names from the registry; this test fails CI if the
 * committed schema falls out of sync (e.g. a projection was added without
 * rerunning the generator).
 *
 * It reuses the SAME builder the generator uses (imported from the .mjs), so a
 * change to the generic-entry shape without regenerating is also caught.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { getProjectionNames } from './projections/registry';
import { buildProjectionsProperties, SCHEMA_PATH } from '../../scripts/generate-config-schema.mjs';

function loadCommittedSchema(): {
  properties: {
    projections: { additionalProperties: unknown; properties: Record<string, unknown> };
  };
} {
  return JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
}

describe('config schema ↔ projection registry drift', () => {
  it('projections.properties equals the registry-derived set (run node scripts/generate-config-schema.mjs)', () => {
    const schema = loadCommittedSchema();
    const names = getProjectionNames();
    const expected = buildProjectionsProperties(schema, names);
    expect(schema.properties.projections.properties).toEqual(expected);
  });

  it('every registered projection has a schema entry', () => {
    const committed = Object.keys(loadCommittedSchema().properties.projections.properties).sort();
    const registered = [...getProjectionNames()].sort();
    const missing = registered.filter((n) => !committed.includes(n));
    expect(missing, `missing from schema — run node scripts/generate-config-schema.mjs`).toEqual(
      [],
    );
  });

  it('keeps projections a closed set (additionalProperties:false catches unknown names)', () => {
    expect(loadCommittedSchema().properties.projections.additionalProperties).toBe(false);
  });
});
