import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeDiff } from '../src/diff.js';
import { formatMarkdownReport } from '../src/report.js';
import type { DiffConfig } from '../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, 'fixtures');

async function loadFixture(name: string): Promise<unknown> {
  const raw = await readFile(resolve(fixturesDir, name), 'utf-8');
  return JSON.parse(raw);
}

describe('markdown report', () => {
  it('produces a well-structured report with fixtures', async () => {
    const before = await loadFixture('before.json');
    const after = await loadFixture('after.json');
    const configRaw = await readFile(
      resolve(fixturesDir, 'ir-diff.config.json'),
      'utf-8'
    );
    const config: DiffConfig = JSON.parse(configRaw);

    const summary = computeDiff(before, after, config);
    const report = formatMarkdownReport(summary);

    expect(report).toContain('# IR Diff Report');
    expect(report).toContain('## Overview');
    expect(report).toContain('## All Changes');
    expect(report).toContain('### Entities');
    expect(report).toContain('### Guards');
    expect(report).toContain('### Actions');
    expect(report).toContain('### Policies');
    expect(report).toContain('**[HIGH RISK]**');
    expect(report).toContain('[low risk]');
  });

  it('produces stable output across runs', async () => {
    const before = await loadFixture('before.json');
    const after = await loadFixture('after.json');
    const config: DiffConfig = {
      labels: [{ pathPrefix: 'entities', label: 'Entities' }],
      highRisk: [],
    };

    const summary1 = computeDiff(before, after, config);
    const report1 = formatMarkdownReport(summary1);

    const summary2 = computeDiff(before, after, config);
    const report2 = formatMarkdownReport(summary2);

    expect(report1).toBe(report2);
  });

  it('omits high risk section when none exist', () => {
    const summary = computeDiff({ a: 1 }, { a: 2 }, { labels: [], highRisk: [] });
    const report = formatMarkdownReport(summary);

    expect(report).not.toContain('## High Risk Changes');
  });

  it('shows high risk section when high risk changes exist', () => {
    const config: DiffConfig = {
      labels: [],
      highRisk: ['x'],
    };
    const summary = computeDiff({ x: 1 }, { x: 2 }, config);
    const report = formatMarkdownReport(summary);

    expect(report).toContain('## High Risk Changes');
  });
});
