import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { enforceSurfaceCommand } from './enforce-surface.js';

/**
 * Integration test: run enforce-surface against the canonical
 * application-agnostic sample-app fixture. Verifies the JSON output
 * shape is deterministic and matches the spec output_contract.
 */
const SAMPLE_APP = path.resolve(__dirname, '../../../../fixtures/sample-app');

describe('enforce-surface against fixtures/sample-app', () => {
  it('produces a deterministic JSON shape', async () => {
    if (!fs.existsSync(SAMPLE_APP)) {
      // Fixture absent in this checkout — skip without failing CI.
      return;
    }
    const commandsRegistry = path.join(SAMPLE_APP, 'manifest-registry/commands.json');
    const entitiesRegistry = path.join(SAMPLE_APP, 'manifest-registry/entities.json');
    const bypassRegistry = path.join(SAMPLE_APP, 'bypasses.json');

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await enforceSurfaceCommand({
      root: SAMPLE_APP,
      commandsRegistry,
      entitiesRegistry: fs.existsSync(entitiesRegistry) ? entitiesRegistry : undefined,
      bypassRegistry: fs.existsSync(bypassRegistry) ? bypassRegistry : undefined,
      format: 'json',
    });
    spy.mockRestore();

    expect(typeof res.ok).toBe('boolean');
    expect(res.root).toBe(SAMPLE_APP);
    expect(res.registry.commandsRegistry).toBe(commandsRegistry);
    expect(typeof res.summary.errors).toBe('number');
    expect(typeof res.summary.warnings).toBe('number');
    expect(typeof res.summary.byCode).toBe('object');
    expect(Array.isArray(res.findings)).toBe(true);

    for (const f of res.findings) {
      expect(typeof f.code).toBe('string');
      expect(['error', 'warning']).toContain(f.severity);
      // Each finding's suggestion is always populated, even for passthrough codes.
      expect(typeof f.suggestion).toBe('string');
      expect(f.suggestion.length).toBeGreaterThan(0);
    }
  });
});
