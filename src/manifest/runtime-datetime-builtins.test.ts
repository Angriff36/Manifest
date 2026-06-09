/**
 * Unit tests for date/time primitive builtins (dateOf, timeOf, datetimeOf,
 * addDuration, durationBetween, durationDays/Hours/Minutes/Seconds).
 *
 * Exercises the builtins through computed properties on an entity with
 * `timestamps`, using a deterministic clock. 1000000000000 ms is
 * 2001-09-09T01:46:40.000Z.
 */

import { describe, it, expect } from 'vitest';
import { compileToIR } from './ir-compiler';
import { RuntimeEngine } from './runtime-engine';

const FIXED_NOW = 1000000000000;

const source = `
entity Record {
  property required name: string
  property bad: number
  timestamps

  computed nanAdd: number = addDuration(self.createdAt, self.bad)
  computed nanDays: number = durationDays(self.bad)
  computed nanSpan: number = durationBetween(self.createdAt, self.bad)
  computed createdDate: string = dateOf(self.createdAt)
  computed createdTime: string = timeOf(self.createdAt)
  computed plusOneDay: number = addDuration(self.createdAt, durationDays(1))
  computed zeroSpan: number = durationBetween(self.createdAt, self.createdAt)
  computed negSpan: number = durationBetween(addDuration(self.createdAt, durationHours(1)), self.createdAt)
  computed roundTrip: number = datetimeOf("2001-09-09", "01:46:40")
  computed twoHours: number = durationHours(2)
  computed twoMinutes: number = durationMinutes(2)
  computed twoSeconds: number = durationSeconds(2)
}

store Record in memory
`;

async function setup() {
  const { ir, diagnostics } = await compileToIR(source);
  expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  expect(ir).not.toBeNull();

  const engine = new RuntimeEngine(ir!, {}, {
    now: () => FIXED_NOW,
    generateId: () => 'test-id-1',
  });
  const instance = await engine.createInstance('Record', { name: 'r1' });
  expect(instance).toBeDefined();
  expect(instance!.createdAt).toBe(FIXED_NOW);
  return { engine, instanceId: instance!.id };
}

describe('Date/time primitive builtins', () => {
  it('dateOf extracts the UTC date string from a timestamp', async () => {
    const { engine, instanceId } = await setup();
    const value = await engine.evaluateComputed('Record', instanceId, 'createdDate');
    expect(value).toBe('2001-09-09');
  });

  it('timeOf extracts the UTC time string from a timestamp', async () => {
    const { engine, instanceId } = await setup();
    const value = await engine.evaluateComputed('Record', instanceId, 'createdTime');
    expect(value).toBe('01:46:40');
  });

  it('addDuration adds durationDays(1) to a timestamp', async () => {
    const { engine, instanceId } = await setup();
    const value = await engine.evaluateComputed('Record', instanceId, 'plusOneDay');
    expect(value).toBe(1000086400000);
  });

  it('durationBetween of identical timestamps is 0', async () => {
    const { engine, instanceId } = await setup();
    const value = await engine.evaluateComputed('Record', instanceId, 'zeroSpan');
    expect(value).toBe(0);
  });

  it('durationBetween yields a negative duration when the end precedes the start', async () => {
    const { engine, instanceId } = await setup();
    const value = await engine.evaluateComputed('Record', instanceId, 'negSpan');
    expect(value).toBe(-3600000);
  });

  it('datetimeOf composes date and time strings into epoch ms', async () => {
    const { engine, instanceId } = await setup();
    const value = await engine.evaluateComputed('Record', instanceId, 'roundTrip');
    expect(value).toBe(FIXED_NOW);
  });

  it('durationHours/durationMinutes/durationSeconds convert to milliseconds', async () => {
    const { engine, instanceId } = await setup();
    expect(await engine.evaluateComputed('Record', instanceId, 'twoHours')).toBe(7200000);
    expect(await engine.evaluateComputed('Record', instanceId, 'twoMinutes')).toBe(120000);
    expect(await engine.evaluateComputed('Record', instanceId, 'twoSeconds')).toBe(2000);
  });

  it('returns null when a NaN argument reaches a duration builtin', async () => {
    const { engine, instanceId } = await setup();
    // A plain number property can carry NaN (write-time validation covers only
    // the four date/time type names), so this exercises the builtins' guards.
    expect(await engine.updateInstance('Record', instanceId, { bad: NaN })).toBeDefined();
    expect(await engine.evaluateComputed('Record', instanceId, 'nanAdd')).toBeNull();
    expect(await engine.evaluateComputed('Record', instanceId, 'nanDays')).toBeNull();
    expect(await engine.evaluateComputed('Record', instanceId, 'nanSpan')).toBeNull();
  });

  it('returns null when an Infinity argument reaches a duration builtin', async () => {
    const { engine, instanceId } = await setup();
    expect(await engine.updateInstance('Record', instanceId, { bad: Infinity })).toBeDefined();
    expect(await engine.evaluateComputed('Record', instanceId, 'nanAdd')).toBeNull();
    expect(await engine.evaluateComputed('Record', instanceId, 'nanDays')).toBeNull();
  });
});
