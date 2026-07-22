/**
 * Unit tests for OpenAPI command path shape helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  buildCommandPathEntries,
  commandOperationId,
  resolveCommandPathStyle,
} from './command-paths';

describe('openapi command-paths', () => {
  it('defaults commandPathStyle to both', () => {
    expect(resolveCommandPathStyle(undefined)).toBe('both');
  });

  it('builds dispatcher + legacy paths for both', () => {
    expect(buildCommandPathEntries('/api', 'preptask', 'claim', 'both')).toEqual([
      { path: '/api/manifest/preptask/commands/claim', kind: 'dispatcher' },
      { path: '/api/preptask/claim', kind: 'legacy' },
    ]);
  });

  it('builds only dispatcher when requested', () => {
    expect(buildCommandPathEntries('/api', 'recipe', 'publish', 'dispatcher')).toEqual([
      { path: '/api/manifest/recipe/commands/publish', kind: 'dispatcher' },
    ]);
  });

  it('builds only legacy when requested', () => {
    expect(buildCommandPathEntries('/api', 'recipe', 'publish', 'legacy')).toEqual([
      { path: '/api/recipe/publish', kind: 'legacy' },
    ]);
  });

  it('suffixes Legacy on alias operationIds', () => {
    expect(commandOperationId('prepTaskClaim', 'dispatcher')).toBe('prepTaskClaim');
    expect(commandOperationId('prepTaskClaim', 'legacy')).toBe('prepTaskClaimLegacy');
  });
});
