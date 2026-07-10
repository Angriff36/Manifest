/**
 * Unit tests for stem-aware proven date source selection.
 */

import { describe, it, expect } from 'vitest';
import { findProvenDateSource } from './date-source.js';

describe('findProvenDateSource', () => {
  it('maps dueByTime to dueByDate.toISOString() for Date locals', () => {
    const content = `
      const eventDate = new Date(breakdown.eventDate);
      const startByDate = new Date(eventDate);
      const dueByDate = new Date(eventDate);
      dueByDate.setHours(dueByDate.getHours() - 6);
      body: { dueByTime: "" }
    `;
    const proven = findProvenDateSource(content, 'dueByTime', { preferIsoString: true });
    expect(proven).toEqual({
      expression: 'dueByDate.toISOString()',
      identifier: 'dueByDate',
    });
  });

  it('returns undefined when no Date local exists', () => {
    expect(
      findProvenDateSource('body: { dueByTime: "" }', 'dueByTime', {
        preferIsoString: true,
      }),
    ).toBeUndefined();
  });

  it('returns undefined when two stem-equal Date locals tie', () => {
    const realTie = `
      const alphaDate = new Date();
      const alphaTime = new Date();
      body: { alphaAt: "" }
    `;
    expect(
      findProvenDateSource(realTie, 'alphaAt', { preferIsoString: true }),
    ).toBeUndefined();
  });
});
