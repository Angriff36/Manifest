import { describe, it, expect } from 'vitest';
import { runGuard } from '../src/runner.js';
import { AllowlistMatcher } from '../src/allowlist.js';

const fixtureInput = {
  entities: [
    {
      name: 'User',
      properties: [
        { type: 'string', name: 'email' },
        { type: 'number', name: 'age' },
      ],
    },
    {
      name: 'Post',
      properties: [
        { type: 'string', name: 'title' },
        { type: 'text', name: 'body' },
      ],
    },
  ],
  metadata: {
    version: '1.0.0',
    author: 'test',
  },
};

const generatorPath = new URL('./fixtures/generator.ts', import.meta.url).pathname;

describe('runGuard', () => {
  it('detects all field accesses from the example generator', async () => {
    const report = await runGuard({
      input: fixtureInput,
      generatorPath,
    });

    expect(report.observedPaths).toContain('entities');
    expect(report.observedPaths).toContain('entities.0.name');
    expect(report.observedPaths).toContain('entities.1.name');
    expect(report.observedPaths).toContain('entities.0.properties');
    expect(report.observedPaths).toContain('entities.0.properties.0.type');
    expect(report.observedPaths).toContain('metadata');
    expect(report.observedPaths).toContain('metadata.version');
    expect(report.forbiddenPaths).toEqual([]);
    expect(report.summary.totalForbidden).toBe(0);
  });

  it('reports forbidden paths when allowlist is restrictive', async () => {
    const matcher = new AllowlistMatcher([
      'entities.*.name',
      'entities.*.properties.*.type',
    ]);

    const report = await runGuard({
      input: fixtureInput,
      generatorPath,
      allowlist: matcher,
    });

    expect(report.forbiddenPaths.length).toBeGreaterThan(0);
    expect(report.forbiddenPaths).toContain('metadata');
    expect(report.forbiddenPaths).toContain('metadata.version');
    expect(report.summary.totalForbidden).toBeGreaterThan(0);
  });

  it('passes when allowlist covers all observed paths', async () => {
    const matcher = new AllowlistMatcher([
      'entities',
      'entities.*',
      'entities.*.name',
      'entities.*.properties',
      'entities.*.properties.*',
      'entities.*.properties.*.type',
      'metadata',
      'metadata.version',
    ]);

    const report = await runGuard({
      input: fixtureInput,
      generatorPath,
      allowlist: matcher,
    });

    expect(report.forbiddenPaths).toEqual([]);
    expect(report.summary.totalForbidden).toBe(0);
    expect(report.summary.totalAllowed).toBe(report.summary.totalObserved);
  });

  it('report includes correct summary counts', async () => {
    const matcher = new AllowlistMatcher(['entities.*.name']);

    const report = await runGuard({
      input: fixtureInput,
      generatorPath,
      allowlist: matcher,
    });

    expect(report.summary.totalObserved).toBe(report.observedPaths.length);
    expect(report.summary.totalForbidden).toBe(report.forbiddenPaths.length);
    expect(report.summary.totalAllowed).toBe(
      report.summary.totalObserved - report.summary.totalForbidden,
    );
  });
});
