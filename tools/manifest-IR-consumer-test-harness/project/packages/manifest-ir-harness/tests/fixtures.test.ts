import { describe, it, expect } from 'vitest';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { runScript } from '../src/index.js';
import { normalizeForSnapshot } from '../src/core/output-formatter.js';
import type { IR, TestScript } from '../src/types/index.js';

const FIXTURES_DIR = join(import.meta.dirname, '..', 'fixtures');

interface Fixture {
  name: string;
  irPath: string;
  scriptPath: string;
}

async function discoverFixtures(): Promise<Fixture[]> {
  const fixtures: Fixture[] = [];
  const entries = await readdir(FIXTURES_DIR);

  for (const entry of entries.sort()) {
    const entryPath = join(FIXTURES_DIR, entry);
    const entryStat = await stat(entryPath);
    if (!entryStat.isDirectory()) continue;

    const scriptPath = join(entryPath, 'script.json');
    const irPath = join(entryPath, 'test.ir.json');

    try {
      await stat(scriptPath);
      await stat(irPath);
      fixtures.push({ name: entry, irPath, scriptPath });
    } catch {
      continue;
    }
  }

  return fixtures;
}

describe('Fixture snapshots', () => {
  it('runs all discovered fixtures and snapshots output', async () => {
    const fixtures = await discoverFixtures();
    expect(fixtures.length).toBeGreaterThan(0);

    for (const fixture of fixtures) {
      const irContent = await readFile(fixture.irPath, 'utf-8');
      const scriptContent = await readFile(fixture.scriptPath, 'utf-8');

      const ir = JSON.parse(irContent) as IR;
      const script = JSON.parse(scriptContent) as TestScript;

      const result = await runScript({
        irSource: ir,
        script,
        sourcePath: fixture.irPath,
        scriptPath: fixture.scriptPath,
        timestamp: '2026-01-01T00:00:00.000Z',
      });

      const normalized = normalizeForSnapshot(result);
      expect(normalized).toMatchSnapshot(`fixture: ${fixture.name}`);
    }
  });
});

describe('Fixture: 01-simple-command', () => {
  it('produces correct passing output', async () => {
    const ir = JSON.parse(
      await readFile(join(FIXTURES_DIR, '01-simple-command/test.ir.json'), 'utf-8')
    ) as IR;
    const script = JSON.parse(
      await readFile(join(FIXTURES_DIR, '01-simple-command/script.json'), 'utf-8')
    ) as TestScript;

    const result = await runScript({
      irSource: ir,
      script,
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    expect(result.summary.passed).toBe(1);
    expect(result.summary.failed).toBe(0);
    expect(result.execution.steps[0]?.result.emittedEvents).toEqual([
      { name: 'orderSubmitted', data: {} },
    ]);
  });
});

describe('Fixture: 02-guard-denial', () => {
  it('produces guard failure diagnostics', async () => {
    const ir = JSON.parse(
      await readFile(join(FIXTURES_DIR, '02-guard-denial/test.ir.json'), 'utf-8')
    ) as IR;
    const script = JSON.parse(
      await readFile(join(FIXTURES_DIR, '02-guard-denial/script.json'), 'utf-8')
    ) as TestScript;

    const result = await runScript({
      irSource: ir,
      script,
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    expect(result.summary.assertionsFailed).toBe(0);

    const step = result.execution.steps[0];
    expect(step?.result.success).toBe(false);
    expect(step?.result.guardFailures).toBeDefined();
    expect(step?.result.guardFailures).toHaveLength(1);

    const failure = step?.result.guardFailures?.[0];
    expect(failure?.expression).toBe('self.items.length > 0');
    expect(failure?.resolvedValues['self.items.length']).toBe(0);
    expect(failure?.evaluatedTo).toBe(false);
  });
});

describe('Fixture: 03-events-ordering', () => {
  it('preserves event order across sequential commands', async () => {
    const ir = JSON.parse(
      await readFile(join(FIXTURES_DIR, '03-events-ordering/test.ir.json'), 'utf-8')
    ) as IR;
    const script = JSON.parse(
      await readFile(join(FIXTURES_DIR, '03-events-ordering/script.json'), 'utf-8')
    ) as TestScript;

    const result = await runScript({
      irSource: ir,
      script,
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    expect(result.summary.totalSteps).toBe(2);
    expect(result.summary.passed).toBe(2);
    expect(result.summary.failed).toBe(0);

    const step1 = result.execution.steps[0];
    const step2 = result.execution.steps[1];

    expect(step1?.result.emittedEvents.map((e) => e.name)).toEqual(['orderSubmitted']);
    expect(step2?.result.emittedEvents.map((e) => e.name)).toEqual([
      'orderConfirmed',
      'notificationSent',
    ]);

    expect(step1?.result.entityStateAfter?.status).toBe('submitted');
    expect(step2?.result.entityStateAfter?.status).toBe('confirmed');
  });
});
