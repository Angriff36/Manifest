/**
 * Write-time validation for date/time/datetime/duration properties
 * (docs/spec/semantics.md, Date/Time Types).
 *
 * On create and update, malformed values for date/time/datetime/duration
 * typed properties produce a blocking constraint outcome (E_TYPE_DATE,
 * E_TYPE_TIME, E_TYPE_DATETIME, E_TYPE_DURATION), so createInstance /
 * updateInstance return undefined. null/undefined values pass (nullability
 * is handled elsewhere). Update validates only the patch.
 *
 * The blocked outcome shape (code + property name + offending value) is
 * asserted through the public `runCommand('create', ...)` auto-create path,
 * which surfaces persistPreparedCreate's outcomes on
 * CommandResult.constraintOutcomes (same idiom as runtime-create-command.test.ts).
 */

import { describe, it, expect } from 'vitest';
import { compileToIR } from './ir-compiler';
import { RuntimeEngine } from './runtime-engine';

const FIXED_NOW = 1000000000000;

const source = `
entity Event {
  property name: string
  property day: date
  property startsAt: time
  property due: datetime
  property runtime: duration
  property maybeDay: date?

  command create(name: string) {
    mutate name = name
  }
}

store Event in memory
`;

const validData = {
  name: 'launch',
  day: '2026-06-09',
  startsAt: '09:30:00',
  due: 1000000000000,
  runtime: 86400000,
};

async function setup() {
  const { ir, diagnostics } = await compileToIR(source);
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  expect(ir).not.toBeNull();

  let nextId = 0;
  const engine = new RuntimeEngine(
    ir!,
    {},
    {
      now: () => FIXED_NOW,
      generateId: () => `test-id-${++nextId}`,
    },
  );
  return engine;
}

describe('Date/time write-time validation', () => {
  it('creates an instance when all date/time values are valid', async () => {
    const engine = await setup();
    const instance = await engine.createInstance('Event', validData);
    expect(instance).toBeDefined();
    expect(instance!.day).toBe('2026-06-09');
    expect(instance!.startsAt).toBe('09:30:00');
    expect(instance!.due).toBe(1000000000000);
    expect(instance!.runtime).toBe(86400000);
  });

  it('blocks create on a calendar-invalid date (E_TYPE_DATE)', async () => {
    const engine = await setup();
    const instance = await engine.createInstance('Event', { ...validData, day: '2026-02-30' });
    expect(instance).toBeUndefined();
  });

  it('blocks create on an out-of-range time (E_TYPE_TIME)', async () => {
    const engine = await setup();
    const instance = await engine.createInstance('Event', { ...validData, startsAt: '24:00:00' });
    expect(instance).toBeUndefined();
  });

  it('blocks create on non-finite or non-numeric datetime (E_TYPE_DATETIME)', async () => {
    const engine = await setup();
    expect(await engine.createInstance('Event', { ...validData, due: Infinity })).toBeUndefined();
    expect(await engine.createInstance('Event', { ...validData, due: 'soon' })).toBeUndefined();
  });

  it('blocks create on a finite datetime outside the representable Date range', async () => {
    const engine = await setup();
    expect(await engine.createInstance('Event', { ...validData, due: 1e16 })).toBeUndefined();
  });

  it('blocks create on NaN duration (E_TYPE_DURATION)', async () => {
    const engine = await setup();
    const instance = await engine.createInstance('Event', { ...validData, runtime: NaN });
    expect(instance).toBeUndefined();
  });

  it('allows negative durations (spec: duration may be negative)', async () => {
    const engine = await setup();
    const instance = await engine.createInstance('Event', { ...validData, runtime: -5000 });
    expect(instance).toBeDefined();
    expect(instance!.runtime).toBe(-5000);
  });

  it('surfaces the blocked outcome shape (code, property, offending value) via runCommand', async () => {
    const engine = await setup();
    const result = await engine.runCommand(
      'create',
      { ...validData, day: '2026-02-30' },
      { entityName: 'Event' },
    );

    expect(result.success).toBe(false);
    const outcome = result.constraintOutcomes?.find((o) => o.code === 'E_TYPE_DATE');
    expect(outcome).toMatchObject({
      code: 'E_TYPE_DATE',
      constraintName: 'day',
      severity: 'block',
      passed: false,
      details: { property: 'day', expectedType: 'date', value: '2026-02-30' },
    });
    expect(outcome!.formatted).toContain('2026-02-30');
    expect(outcome!.message).toContain('2026-02-30');
    expect(await engine.getAllInstances('Event')).toEqual([]);
  });

  it('allows null for a nullable date property', async () => {
    const engine = await setup();
    const instance = await engine.createInstance('Event', { ...validData, maybeDay: null });
    expect(instance).toBeDefined();
    expect(instance!.maybeDay).toBeNull();
  });

  it('blocks update with an invalid date and preserves the stored value', async () => {
    const engine = await setup();
    const created = await engine.createInstance('Event', validData);
    expect(created).toBeDefined();

    const updated = await engine.updateInstance('Event', created!.id, { day: '2026-13-01' });
    expect(updated).toBeUndefined();

    const stored = await engine.getInstance('Event', created!.id);
    expect(stored).toBeDefined();
    expect(stored!.day).toBe('2026-06-09');
  });

  it('allows update with a valid date', async () => {
    const engine = await setup();
    const created = await engine.createInstance('Event', validData);
    expect(created).toBeDefined();

    const updated = await engine.updateInstance('Event', created!.id, { day: '2026-06-10' });
    expect(updated).toBeDefined();
    expect(updated!.day).toBe('2026-06-10');

    const stored = await engine.getInstance('Event', created!.id);
    expect(stored!.day).toBe('2026-06-10');
  });
});
