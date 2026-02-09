import { describe, it, expect } from 'vitest';
import { AllowlistMatcher } from '../src/allowlist.js';

describe('AllowlistMatcher', () => {
  it('matches exact paths', () => {
    const matcher = new AllowlistMatcher(['entities.name', 'metadata.version']);

    expect(matcher.isAllowed('entities.name')).toBe(true);
    expect(matcher.isAllowed('metadata.version')).toBe(true);
    expect(matcher.isAllowed('entities.age')).toBe(false);
  });

  it('matches wildcard segments', () => {
    const matcher = new AllowlistMatcher(['entities.*.name']);

    expect(matcher.isAllowed('entities.0.name')).toBe(true);
    expect(matcher.isAllowed('entities.1.name')).toBe(true);
    expect(matcher.isAllowed('entities.foo.name')).toBe(true);
    expect(matcher.isAllowed('entities.0.age')).toBe(false);
  });

  it('matches multiple wildcards', () => {
    const matcher = new AllowlistMatcher(['entities.*.properties.*.type']);

    expect(matcher.isAllowed('entities.0.properties.0.type')).toBe(true);
    expect(matcher.isAllowed('entities.1.properties.2.type')).toBe(true);
    expect(matcher.isAllowed('entities.0.properties.0.name')).toBe(false);
  });

  it('does not match paths with wrong length', () => {
    const matcher = new AllowlistMatcher(['entities.*.name']);

    expect(matcher.isAllowed('entities')).toBe(false);
    expect(matcher.isAllowed('entities.0')).toBe(false);
    expect(matcher.isAllowed('entities.0.name.extra')).toBe(false);
  });

  it('filters forbidden paths from a list', () => {
    const matcher = new AllowlistMatcher([
      'entities.*.name',
      'entities.*.properties.*.type',
    ]);

    const paths = [
      'entities',
      'entities.0',
      'entities.0.name',
      'entities.0.properties',
      'entities.0.properties.0',
      'entities.0.properties.0.type',
      'metadata',
      'metadata.version',
    ];

    const forbidden = matcher.filterForbidden(paths);
    expect(forbidden).toEqual([
      'entities',
      'entities.0',
      'entities.0.properties',
      'entities.0.properties.0',
      'metadata',
      'metadata.version',
    ]);
  });

  it('handles policies.* pattern', () => {
    const matcher = new AllowlistMatcher(['policies.*']);

    expect(matcher.isAllowed('policies.read')).toBe(true);
    expect(matcher.isAllowed('policies.write')).toBe(true);
    expect(matcher.isAllowed('policies')).toBe(false);
    expect(matcher.isAllowed('policies.read.allow')).toBe(false);
  });
});
