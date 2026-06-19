/**
 * Compile-time + runtime coverage for the "guaranteed-null on create" class of bug
 * (the `createdAt must not be null` failure that previously only surfaced against a
 * real DB):
 *  - `= now()` / `= today()` property defaults lower to `autoNow` and are stamped on create
 *  - unsupported call-expression defaults surface a warning instead of silently dropping
 *  - negative numeric literal defaults (`= -1`) fold to a real static default
 *  - a `create` command that leaves a non-null, default-less, null-filling field unset
 *    surfaces a warning (it persists null → non-null store column rejects)
 */

import { describe, it, expect } from 'vitest';
import { compileToIR } from './ir-compiler';
import { RuntimeEngine } from './runtime-engine';

const FIXED_NOW = 1_700_000_000_000;

function propOf(ir: NonNullable<Awaited<ReturnType<typeof compileToIR>>['ir']>, entity: string, name: string) {
  return ir.entities.find(e => e.name === entity)!.properties.find(p => p.name === name)!;
}

describe('now()/autoNow property defaults', () => {
  it('lowers `= now()` to autoNow (not a dropped default)', async () => {
    const { ir, diagnostics } = await compileToIR(`entity N {
  property required id: string
  property createdAt: datetime = now()
  command create(id: string) { mutate id = id }
}
store N in memory`);
    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const p = propOf(ir!, 'N', 'createdAt');
    expect(p.autoNow).toBe(true);
    expect(p.defaultValue).toBeUndefined();
  });

  it('lowers `= today()` to autoNow', async () => {
    const { ir } = await compileToIR(`entity N {
  property required id: string
  property d: datetime = today()
}
store N in memory`);
    expect(propOf(ir!, 'N', 'd').autoNow).toBe(true);
  });

  it('the runtime stamps an autoNow field with the current time on create (not null)', async () => {
    const { ir } = await compileToIR(`entity N {
  property required id: string
  property createdAt: datetime = now()
  command create(id: string) { mutate id = id }
}
store N in memory`);
    const engine = new RuntimeEngine(ir!, {}, { now: () => FIXED_NOW, generateId: () => 'x' });
    const instance = await engine.createInstance('N', { id: 'n1' });
    expect(instance).toBeDefined();
    expect(instance!.createdAt).toBe(FIXED_NOW);
  });

  it('warns (does not silently drop) on an unsupported call-expression default', async () => {
    const { diagnostics } = await compileToIR(`entity N {
  property required id: string
  property token: string = uuid()
}
store N in memory`);
    const warn = diagnostics.find(d => d.severity === 'warning' && /not a supported default/.test(d.message));
    expect(warn).toBeDefined();
    expect(warn!.message).toContain('token');
  });

  it('folds a negative numeric literal default (`= -1`) into a real static default', async () => {
    const { ir, diagnostics } = await compileToIR(`entity N {
  property required id: string
  property idx: number = -1
}
store N in memory`);
    expect(diagnostics.filter(d => d.severity === 'warning')).toEqual([]);
    expect(propOf(ir!, 'N', 'idx').defaultValue).toEqual({ kind: 'number', value: -1 });
  });
});

describe('create command leaves a guaranteed-null field unset', () => {
  it('warns when a non-null datetime is never set and has no default', async () => {
    const { diagnostics } = await compileToIR(`entity Ticket {
  property required id: string
  property openedAt: datetime
  command create(id: string) { mutate id = id }
}
store Ticket in memory`);
    const warn = diagnostics.find(d => d.severity === 'warning' && /never sets non-null field 'openedAt'/.test(d.message));
    expect(warn).toBeDefined();
  });

  it('does NOT warn when the field carries an `= now()` default', async () => {
    const { diagnostics } = await compileToIR(`entity Ticket {
  property required id: string
  property openedAt: datetime = now()
  command create(id: string) { mutate id = id }
}
store Ticket in memory`);
    expect(diagnostics.filter(d => /openedAt/.test(d.message))).toEqual([]);
  });

  it('does NOT warn when the create command sets the field via mutate', async () => {
    const { diagnostics } = await compileToIR(`entity Ticket {
  property required id: string
  property openedAt: datetime
  command create(id: string, openedAt: datetime) { mutate id = id mutate openedAt = openedAt }
}
store Ticket in memory`);
    expect(diagnostics.filter(d => /openedAt/.test(d.message))).toEqual([]);
  });

  it('does NOT warn on string/number/boolean fields (runtime zero-fills them non-null)', async () => {
    const { diagnostics } = await compileToIR(`entity Ticket {
  property required id: string
  property title: string
  property count: number
  property done: boolean
  command create(id: string) { mutate id = id }
}
store Ticket in memory`);
    expect(diagnostics.filter(d => d.severity === 'warning')).toEqual([]);
  });
});
