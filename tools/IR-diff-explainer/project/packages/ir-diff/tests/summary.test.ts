import { describe, it, expect } from 'vitest';
import { computeDiff } from '../src/diff.js';
import { formatSummaryJson } from '../src/summary.js';
import type { DiffConfig, DiffSummary } from '../src/types.js';

const emptyConfig: DiffConfig = { labels: [], highRisk: [] };

describe('JSON summary output', () => {
  it('produces valid JSON', () => {
    const summary = computeDiff({ a: 1 }, { a: 2, b: 3 }, emptyConfig);
    const json = formatSummaryJson(summary);
    const parsed: DiffSummary = JSON.parse(json);

    expect(parsed.totalChanges).toBe(2);
    expect(parsed.added).toBe(1);
    expect(parsed.changed).toBe(1);
    expect(parsed.removed).toBe(0);
    expect(parsed.changes).toHaveLength(2);
  });

  it('includes all change properties', () => {
    const summary = computeDiff({ a: 1 }, { a: 2 }, emptyConfig);
    const parsed: DiffSummary = JSON.parse(formatSummaryJson(summary));
    const change = parsed.changes[0];

    expect(change).toHaveProperty('path');
    expect(change).toHaveProperty('changeType');
    expect(change).toHaveProperty('beforeHash');
    expect(change).toHaveProperty('afterHash');
    expect(change).toHaveProperty('label');
    expect(change).toHaveProperty('risk');
  });
});
