/**
 * Tests for schedule helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  getSchedulesFromIR,
  parseIntervalExpression,
  shouldRunInterval,
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
