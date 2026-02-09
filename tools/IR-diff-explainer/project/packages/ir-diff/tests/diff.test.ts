import { describe, it, expect } from 'vitest';
import { computeDiff } from '../src/diff.js';
import type { DiffConfig } from '../src/types.js';

const emptyConfig: DiffConfig = { labels: [], highRisk: [] };

describe('computeDiff', () => {
  it('returns empty summary for identical objects', () => {
    const obj = { a: 1, b: { c: 'hello' } };
    const result = computeDiff(obj, obj, emptyConfig);

    expect(result.totalChanges).toBe(0);
    expect(result.changes).toEqual([]);
  });

  it('detects added paths', () => {
    const before = { a: 1 };
    const after = { a: 1, b: 2 };
    const result = computeDiff(before, after, emptyConfig);

    expect(result.added).toBe(1);
    expect(result.changes[0].path).toBe('b');
    expect(result.changes[0].changeType).toBe('added');
    expect(result.changes[0].beforeHash).toBeNull();
    expect(result.changes[0].afterHash).not.toBeNull();
  });

  it('detects removed paths', () => {
    const before = { a: 1, b: 2 };
    const after = { a: 1 };
    const result = computeDiff(before, after, emptyConfig);

    expect(result.removed).toBe(1);
    expect(result.changes[0].path).toBe('b');
    expect(result.changes[0].changeType).toBe('removed');
    expect(result.changes[0].beforeHash).not.toBeNull();
    expect(result.changes[0].afterHash).toBeNull();
  });

  it('detects changed values', () => {
    const before = { a: 1 };
    const after = { a: 2 };
    const result = computeDiff(before, after, emptyConfig);

    expect(result.changed).toBe(1);
    expect(result.changes[0].changeType).toBe('changed');
    expect(result.changes[0].beforeHash).not.toBe(result.changes[0].afterHash);
  });

  it('handles nested objects', () => {
    const before = { x: { y: { z: 'old' } } };
    const after = { x: { y: { z: 'new' } } };
    const result = computeDiff(before, after, emptyConfig);

    expect(result.totalChanges).toBe(1);
    expect(result.changes[0].path).toBe('x.y.z');
  });

  it('handles arrays with index paths', () => {
    const before = { items: ['a', 'b'] };
    const after = { items: ['a', 'c'] };
    const result = computeDiff(before, after, emptyConfig);

    expect(result.changed).toBe(1);
    expect(result.changes[0].path).toBe('items[1]');
  });

  it('produces stable sorted output', () => {
    const before = { z: 1, a: 2, m: 3 };
    const after = { z: 10, a: 20, m: 30 };
    const result = computeDiff(before, after, emptyConfig);

    const paths = result.changes.map((c) => c.path);
    expect(paths).toEqual(['a', 'm', 'z']);
  });
});

describe('computeDiff with config', () => {
  const config: DiffConfig = {
    labels: [
      { pathPrefix: 'guards', label: 'Guards' },
      { pathPrefix: 'entities', label: 'Entities' },
    ],
    highRisk: ['guards'],
  };

  it('applies labels from config', () => {
    const before = { guards: { isAuth: { expr: 'a' } } };
    const after = { guards: { isAuth: { expr: 'b' } } };
    const result = computeDiff(before, after, config);

    expect(result.changes[0].label).toBe('Guards');
  });

  it('marks high risk paths correctly', () => {
    const before = { guards: { x: 1 }, entities: { y: 1 } };
    const after = { guards: { x: 2 }, entities: { y: 2 } };
    const result = computeDiff(before, after, config);

    const guardsChange = result.changes.find((c) => c.path.startsWith('guards'));
    const entitiesChange = result.changes.find((c) => c.path.startsWith('entities'));

    expect(guardsChange?.risk).toBe('high');
    expect(entitiesChange?.risk).toBe('low');
  });

  it('sets null label for unconfigured paths', () => {
    const before = { other: 1 };
    const after = { other: 2 };
    const result = computeDiff(before, after, config);

    expect(result.changes[0].label).toBeNull();
  });

  it('counts high risk changes', () => {
    const before = { guards: { a: 1, b: 2 } };
    const after = { guards: { a: 10, b: 20 } };
    const result = computeDiff(before, after, config);

    expect(result.highRiskCount).toBe(2);
  });
});
