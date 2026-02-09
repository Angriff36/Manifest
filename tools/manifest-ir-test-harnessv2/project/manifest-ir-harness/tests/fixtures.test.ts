import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { executeScript } from '../src/core/executor.js';
import { parseScript } from '../src/core/script-schema.js';
import { prepareForSnapshot } from '../src/core/snapshot-manager.js';
import type { IR } from '../src/adapters/manifest-core.js';

const FIXTURES_DIR = resolve(import.meta.dirname ?? '.', '..', 'fixtures');
const FIXED_TIME = '2025-01-01T00:00:00.000Z';

interface FixtureInfo {
  name: string;
  irPath: string;
  scriptPath: string;
}

function discoverFixtures(): FixtureInfo[] {
  if (!existsSync(FIXTURES_DIR)) return [];

  const entries = readdirSync(FIXTURES_DIR, { withFileTypes: true });
  const fixtures: FixtureInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const dirPath = join(FIXTURES_DIR, entry.name);
    const scriptPath = join(dirPath, 'script.json');
    const irPath = join(dirPath, 'test.ir.json');

    if (existsSync(scriptPath) && existsSync(irPath)) {
      fixtures.push({
        name: entry.name,
        irPath,
        scriptPath,
      });
    }
  }

  return fixtures.sort((a, b) => a.name.localeCompare(b.name));
}

async function runFixture(fixture: FixtureInfo) {
  const irRaw = readFileSync(fixture.irPath, 'utf-8');
  const ir = JSON.parse(irRaw) as IR;

  const scriptRaw = readFileSync(fixture.scriptPath, 'utf-8');
  const script = parseScript(JSON.parse(scriptRaw));

  const result = await executeScript({
    ir,
    script,
    sourcePath: fixture.irPath,
    sourceType: 'ir',
    scriptPath: fixture.scriptPath,
    executedAt: FIXED_TIME,
  });

  return prepareForSnapshot(result);
}

const fixtures = discoverFixtures();

describe('Fixture Tests', () => {
  if (fixtures.length === 0) {
    it('no fixtures found', () => {
      expect(true).toBe(true);
    });
    return;
  }

  for (const fixture of fixtures) {
    describe(`Fixture: ${fixture.name}`, () => {
      it('matches snapshot', async () => {
        const result = await runFixture(fixture);
        expect(result).toMatchSnapshot();
      });

      it('has no assertion failures', async () => {
        const result = await runFixture(fixture) as Record<string, unknown>;
        const summary = result['summary'] as Record<string, number>;
        expect(summary['assertionsFailed']).toBe(0);
      });
    });
  }
});
