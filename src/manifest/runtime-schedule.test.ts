/**
 * Tests for schedule helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  getSchedulesFromIR,
  parseIntervalExpression,
  shouldRunInterval,
  isCronDue,
  isIntervalDue,
} from './runtime-schedule';
import type { IR } from './ir';

const baseProvenance = {
  contentHash: 'test',
  irHash: 'test',
  compilerVersion: '1.0.0',
  schemaVersion: '1.0',
  compiledAt: '2024-01-01T00:00:00.000Z',
};

describe('getSchedulesFromIR', () => {
  it('returns empty map when IR has no schedules', () => {
    const ir: IR = {
      version: '1.0',
      provenance: baseProvenance,
      modules: [],
      values: [],
      entities: [],
      enums: [],
      stores: [],
      events: [],
      commands: [],
      policies: [],
      roles: [],
    };

    const schedules = getSchedulesFromIR(ir);
    expect(schedules.size).toBe(0);
  });

  it('returns schedules map when IR has schedules', () => {
    const ir: IR = {
      version: '1.0',
      provenance: baseProvenance,
      modules: [],
      values: [],
      entities: [],
      enums: [],
      stores: [],
      events: [],
      commands: [],
      policies: [],
      roles: [],
      schedules: [
        {
          name: 'dailyBackup',
          entityName: 'System',
          commandName: 'backupData',
          trigger: { kind: 'cron', cron: '0 0 * * *' },
        },
        {
          name: 'frequentCleanup',
          entityName: 'System',
          commandName: 'cleanupOldData',
          trigger: { kind: 'interval', durationMs: 5 * 60 * 1000 },
        },
      ],
    };

    const schedules = getSchedulesFromIR(ir);
    expect(schedules.size).toBe(2);
    expect(schedules.get('dailyBackup')).toBeDefined();
    expect(schedules.get('frequentCleanup')).toBeDefined();
  });

  it('maps by schedule name', () => {
    const ir: IR = {
      version: '1.0',
      provenance: baseProvenance,
      modules: [],
      values: [],
      entities: [],
      enums: [],
      stores: [],
      events: [],
      commands: [],
      policies: [],
      roles: [],
      schedules: [
        {
          name: 'mySchedule',
          entityName: 'System',
          commandName: 'doSomething',
          trigger: { kind: 'interval', durationMs: 60 * 60 * 1000 },
        },
      ],
    };

    const schedules = getSchedulesFromIR(ir);
    const schedule = schedules.get('mySchedule');
    expect(schedule?.name).toBe('mySchedule');
    expect(schedule?.commandName).toBe('doSomething');
  });
});

describe('parseIntervalExpression', () => {
  it('parses minutes', () => {
    expect(parseIntervalExpression('5m')).toBe(5 * 60 * 1000);
    expect(parseIntervalExpression('10 mins')).toBe(10 * 60 * 1000);
    expect(parseIntervalExpression('1 minute')).toBe(1 * 60 * 1000);
  });

  it('parses hours', () => {
    expect(parseIntervalExpression('1h')).toBe(1 * 60 * 60 * 1000);
    expect(parseIntervalExpression('2 hrs')).toBe(2 * 60 * 60 * 1000);
    expect(parseIntervalExpression('1 hour')).toBe(1 * 60 * 60 * 1000);
  });

  it('parses days', () => {
    expect(parseIntervalExpression('1d')).toBe(1 * 24 * 60 * 60 * 1000);
    expect(parseIntervalExpression('3 days')).toBe(3 * 24 * 60 * 60 * 1000);
  });

  it('parses weeks', () => {
    expect(parseIntervalExpression('1w')).toBe(1 * 7 * 24 * 60 * 60 * 1000);
    expect(parseIntervalExpression('2 weeks')).toBe(2 * 7 * 24 * 60 * 60 * 1000);
  });

  it('returns -1 for unparseable expressions', () => {
    expect(parseIntervalExpression('invalid')).toBe(-1);
    expect(parseIntervalExpression('5x')).toBe(-1);
    expect(parseIntervalExpression('')).toBe(-1);
  });

  it('handles case-insensitive input', () => {
    expect(parseIntervalExpression('5M')).toBe(5 * 60 * 1000);
    expect(parseIntervalExpression('1H')).toBe(1 * 60 * 60 * 1000);
    expect(parseIntervalExpression('1 WEEKS')).toBe(1 * 7 * 24 * 60 * 60 * 1000);
  });

  it('handles whitespace', () => {
    expect(parseIntervalExpression('  5m  ')).toBe(5 * 60 * 1000);
    expect(parseIntervalExpression('1   hour')).toBeGreaterThan(0);
  });
});

describe('shouldRunInterval', () => {
  it('returns true when interval has elapsed', () => {
    const intervalMs = parseIntervalExpression('1h');
    const lastRunAt = 1000;
    const now = lastRunAt + intervalMs + 1;

    expect(shouldRunInterval('1h', now, lastRunAt)).toBe(true);
  });

  it('returns false when interval has not elapsed', () => {
    const intervalMs = parseIntervalExpression('1h');
    const lastRunAt = 1000;
    const now = lastRunAt + intervalMs - 1;

    expect(shouldRunInterval('1h', now, lastRunAt)).toBe(false);
  });

  it('returns true when never run (lastRunAt = 0) and interval elapsed', () => {
    const now = 1 * 60 * 60 * 1000 + 1;
    expect(shouldRunInterval('1h', now, 0)).toBe(true);
  });

  it('handles 5 minute intervals', () => {
    const lastRunAt = 10000;
    const now = lastRunAt + 5 * 60 * 1000 + 1;

    expect(shouldRunInterval('5m', now, lastRunAt)).toBe(true);
  });

  it('returns false for unparseable intervals', () => {
    expect(shouldRunInterval('invalid', 10000, 0)).toBe(false);
  });
});

describe('isCronDue', () => {
  const at = (iso: string): Date => new Date(iso);

  // [cron, UTC instant, expected]. Reference weekdays (UTC): 2025-01-01 Wed,
  // 01-05 Sun, 01-06 Mon, 01-07 Tue, 01-08 Wed, 01-15 Wed.
  const cases: Array<[string, string, boolean]> = [
    // Daily midnight — minute/hour must both match.
    ['0 0 * * *', '2025-01-01T00:00:00Z', true],
    ['0 0 * * *', '2025-01-01T00:01:00Z', false],
    ['0 0 * * *', '2025-01-01T01:00:00Z', false],
    // Step over the whole minute field.
    ['*/15 * * * *', '2025-01-01T10:00:00Z', true],
    ['*/15 * * * *', '2025-01-01T10:15:00Z', true],
    ['*/15 * * * *', '2025-01-01T10:45:00Z', true],
    ['*/15 * * * *', '2025-01-01T10:07:00Z', false],
    // Hour range.
    ['0 9-17 * * *', '2025-01-01T09:00:00Z', true],
    ['0 9-17 * * *', '2025-01-01T17:00:00Z', true],
    ['0 9-17 * * *', '2025-01-01T18:00:00Z', false],
    ['0 9-17 * * *', '2025-01-01T08:00:00Z', false],
    // Hour list.
    ['0 0,12 * * *', '2025-01-01T12:00:00Z', true],
    ['0 0,12 * * *', '2025-01-01T06:00:00Z', false],
    // Range with step → hours 0,3,6,9,12.
    ['0 0-12/3 * * *', '2025-01-01T09:00:00Z', true],
    ['0 0-12/3 * * *', '2025-01-01T10:00:00Z', false],
    // Day-of-week numeric + name + case-insensitive (Monday).
    ['0 9 * * 1', '2025-01-06T09:00:00Z', true],
    ['0 9 * * 1', '2025-01-07T09:00:00Z', false],
    ['0 9 * * MON', '2025-01-06T09:00:00Z', true],
    ['0 9 * * mon', '2025-01-06T09:00:00Z', true],
    // Sunday as 0 and as 7.
    ['0 0 * * 0', '2025-01-05T00:00:00Z', true],
    ['0 0 * * 7', '2025-01-05T00:00:00Z', true],
    ['0 0 * * 0', '2025-01-06T00:00:00Z', false],
    // Day-of-month only restricted → dow ignored (AND with dow=*).
    ['0 0 15 * *', '2025-01-15T00:00:00Z', true],
    ['0 0 15 * *', '2025-01-06T00:00:00Z', false],
    // Both dom AND dow restricted → OR semantics (1st, 15th, OR any Monday).
    ['0 0 1,15 * 1', '2025-01-01T00:00:00Z', true], // 1st (Wed)
    ['0 0 1,15 * 1', '2025-01-15T00:00:00Z', true], // 15th (Wed)
    ['0 0 1,15 * 1', '2025-01-06T00:00:00Z', true], // Monday (not 1/15)
    ['0 0 1,15 * 1', '2025-01-08T00:00:00Z', false], // Wed, not 1/15
    // Month by name and by number.
    ['0 0 1 JAN *', '2025-01-01T00:00:00Z', true],
    ['0 0 1 JAN *', '2025-02-01T00:00:00Z', false],
    ['0 0 1 2 *', '2025-02-01T00:00:00Z', true],
  ];

  it.each(cases)('%s @ %s → %s', (cron, iso, expected) => {
    expect(isCronDue(cron, at(iso))).toBe(expected);
  });

  it('is evaluated in UTC (independent of local Date fields)', () => {
    // 2025-06-01T00:30:00Z — assert against the UTC minute/hour regardless of TZ.
    expect(isCronDue('30 0 * * *', new Date('2025-06-01T00:30:00Z'))).toBe(true);
  });

  it('throws on the wrong field count', () => {
    expect(() => isCronDue('0 0 * *', new Date(0))).toThrow(/expected 5 fields/);
    expect(() => isCronDue('0 0 * * * *', new Date(0))).toThrow(/expected 5 fields/);
  });

  it('throws on out-of-range values', () => {
    expect(() => isCronDue('60 0 * * *', new Date(0))).toThrow(/out of range/);
    expect(() => isCronDue('0 24 * * *', new Date(0))).toThrow(/out of range/);
    expect(() => isCronDue('0 0 * * 8', new Date(0))).toThrow(/out of range/);
  });

  it('throws on an invalid step', () => {
    expect(() => isCronDue('*/0 * * * *', new Date(0))).toThrow(/invalid step/);
  });
});

describe('isIntervalDue', () => {
  it('is due once elapsed reaches the duration', () => {
    const fiveMin = 5 * 60 * 1000;
    expect(isIntervalDue(fiveMin, fiveMin, 0)).toBe(true);
    expect(isIntervalDue(fiveMin, fiveMin - 1, 0)).toBe(false);
    expect(isIntervalDue(fiveMin, 10_000 + fiveMin, 10_000)).toBe(true);
  });

  it('is never due for a non-positive or non-finite duration', () => {
    expect(isIntervalDue(0, 1000, 0)).toBe(false);
    expect(isIntervalDue(-1, 1000, 0)).toBe(false);
    expect(isIntervalDue(Number.NaN, 1000, 0)).toBe(false);
  });
});
