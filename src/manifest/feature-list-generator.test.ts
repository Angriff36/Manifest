import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { collectFeatureInventory, renderFeatureList } from '../../scripts/generate-feature-list.js';

const ROOT = path.resolve(import.meta.dirname, '../..');

describe('registry-generated feature inventory', () => {
  it('collects live language, projection, CLI, conformance, and export registries', async () => {
    const inventory = await collectFeatureInventory(ROOT);

    expect(inventory.language.topLevelConstructs).toContain('entity');
    expect(inventory.language.builtins.map((entry) => entry.name)).toContain('uuid');
    expect(inventory.projections.map((entry) => entry.name)).toContain('convex');
    expect(inventory.cliCommands).toContain('db init');
    expect(inventory.cliCommands).toContain('diff breaking');
    expect(inventory.cliCommands).toContain('versions verify');
    expect(inventory.conformance.some((entry) => entry.id === '01-entity-properties')).toBe(true);
    expect(inventory.packageExports).toContain('./runtime-engine');
    expect(
      inventory.openGaps.some((entry) => entry.feature.includes('Generic / parameterized')),
    ).toBe(true);
    // Health projection is FULLY_IMPLEMENTED as of 2026-07-22 — no longer an open gap
    expect(inventory.openGaps.some((entry) => entry.feature === 'health')).toBe(false);
  });

  it('renders an honest deterministic inventory instead of historical release claims', async () => {
    const inventory = await collectFeatureInventory(ROOT);
    const first = renderFeatureList(inventory);
    const second = renderFeatureList(inventory);

    expect(second).toBe(first);
    expect(first).toContain('# Manifest Feature Inventory');
    expect(first).toContain('Generated from live registries');
    expect(first).toContain('## Open Manifest-owned gaps');
    expect(first).not.toContain('Implemented but Unreleased');
    expect(first).not.toContain('Auto-generated from `.automaker/features');
    expect(first.endsWith('\n\n')).toBe(false);
  });

  it('is enforced by the repository documentation check', async () => {
    const packageJson = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['docs:feature-list']).toBe('tsx scripts/generate-feature-list.ts');
    expect(packageJson.scripts['docs:check:feature-list']).toBe(
      'tsx scripts/generate-feature-list.ts --check',
    );
    expect(packageJson.scripts['docs:check']).toContain('docs:check:feature-list');
  });
});
