import { describe, it, expect } from 'vitest';
import {
  isValidDateString, isValidTimeString,
  dateOf, timeOf, datetimeOf,
} from './date-time';

describe('isValidDateString', () => {
  it('accepts valid calendar dates', () => {
    expect(isValidDateString('2026-06-09')).toBe(true);
    expect(isValidDateString('2024-02-29')).toBe(true); // leap year
    expect(isValidDateString('2026-12-31')).toBe(true);
  });
  it('rejects invalid calendar dates', () => {
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(isValidDateString('2026-02-29')).toBe(false); // not a leap year
    expect(isValidDateString('2026-13-01')).toBe(false);
    expect(isValidDateString('2026-00-10')).toBe(false);
    expect(isValidDateString('2026-04-31')).toBe(false);
  });
  it('rejects malformed strings', () => {
    expect(isValidDateString('')).toBe(false);
    expect(isValidDateString('2026-6-9')).toBe(false);
    expect(isValidDateString('20260609')).toBe(false);
    expect(isValidDateString('2026-06-09T00:00:00Z')).toBe(false);
  });
});

describe('isValidTimeString', () => {
  it('accepts valid times', () => {
    expect(isValidTimeString('00:00:00')).toBe(true);
    expect(isValidTimeString('23:59:59')).toBe(true);
    expect(isValidTimeString('12:30:45')).toBe(true);
  });
  it('rejects out-of-range and malformed times', () => {
    expect(isValidTimeString('24:00:00')).toBe(false);
    expect(isValidTimeString('23:60:00')).toBe(false);
    expect(isValidTimeString('23:59:60')).toBe(false); // no leap seconds
    expect(isValidTimeString('1:00:00')).toBe(false);
    expect(isValidTimeString('')).toBe(false);
  });
});

describe('dateOf / timeOf', () => {
  it('formats epoch ms as UTC date/time strings', () => {
    // 2001-09-09T01:46:40Z
    expect(dateOf(1000000000000)).toBe('2001-09-09');
    expect(timeOf(1000000000000)).toBe('01:46:40');
  });
  it('returns null for non-number input', () => {
    expect(dateOf('x' as unknown as number)).toBeNull();
    expect(timeOf(undefined as unknown as number)).toBeNull();
    expect(dateOf(NaN)).toBeNull();
  });
  it('returns null for finite timestamps outside the representable Date range', () => {
    expect(dateOf(1e16)).toBeNull();
    expect(timeOf(-1e16)).toBeNull();
    expect(dateOf(8.64e15 + 1)).toBeNull();
  });
  it('handles the maximum representable timestamp at the boundary', () => {
    // 8.64e15 ms is the max Date value: +275760-09-13T00:00:00Z
    expect(dateOf(8.64e15)).toBe('275760-09-13');
    expect(timeOf(8.64e15)).toBe('00:00:00');
  });
});

describe('datetimeOf', () => {
  it('combines date and time to epoch ms UTC', () => {
    expect(datetimeOf('2001-09-09', '01:46:40')).toBe(1000000000000);
    expect(datetimeOf('1970-01-01')).toBe(0); // missing time = midnight UTC
  });
  it('returns null on malformed or non-calendar input', () => {
    expect(datetimeOf('2026-02-30')).toBeNull();
    expect(datetimeOf('2026-06-09', '24:00:00')).toBeNull();
    expect(datetimeOf('junk')).toBeNull();
  });
});
