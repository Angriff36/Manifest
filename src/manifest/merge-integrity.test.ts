/**
 * Unit tests for Config G3 mergeIntegrity policy resolution.
 */

import { describe, expect, it } from 'vitest';
import { dedupeLastByKey, resolveMergeIntegrity } from './merge-integrity.js';

describe('resolveMergeIntegrity', () => {
  it('defaults to strict error policies', () => {
    expect(resolveMergeIntegrity(undefined)).toEqual({
      onDuplicateEntity: 'error',
      onDuplicateCommand: 'error',
      moduleOrder: 'lexicographic',
      allowCrossModuleRefs: true,
      forbidCycles: true,
    });
  });

  it('honors lastWins for entity and command', () => {
    const resolved = resolveMergeIntegrity({
      onDuplicateEntity: 'lastWins',
      onDuplicateCommand: 'lastWins',
      allowCrossModuleRefs: false,
    });
    expect(resolved.onDuplicateEntity).toBe('lastWins');
    expect(resolved.onDuplicateCommand).toBe('lastWins');
    expect(resolved.allowCrossModuleRefs).toBe(false);
  });

  it('rejects forbidCycles: false', () => {
    expect(() => resolveMergeIntegrity({ forbidCycles: false })).toThrow(
      /MERGE_INTEGRITY_FORBID_CYCLES/,
    );
  });

  it('rejects unsupported moduleOrder', () => {
    expect(() => resolveMergeIntegrity({ moduleOrder: 'filesystem' as 'lexicographic' })).toThrow(
      /MERGE_INTEGRITY_MODULE_ORDER/,
    );
  });
});

describe('dedupeLastByKey', () => {
  it('keeps the last item per key', () => {
    const items = [
      { name: 'User', props: 1 },
      { name: 'Order', props: 1 },
      { name: 'User', props: 2 },
    ];
    expect(dedupeLastByKey(items, (i) => i.name)).toEqual([
      { name: 'User', props: 2 },
      { name: 'Order', props: 1 },
    ]);
  });
});
