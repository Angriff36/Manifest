/**
 * Unit tests for EventSourcedStore.
 */

import { describe, it, expect } from 'vitest';
import { EventSourcedStore, eventSourcedOptionsFromConfig } from './event-sourced';

describe('EventSourcedStore', () => {
  it('create/update/delete maintain projected state', async () => {
    const store = new EventSourcedStore({ generateId: () => 'fixed-id', now: () => 1 });
    const created = await store.create({ balance: 0 });
    expect(created.id).toBe('fixed-id');
    expect(await store.getById('fixed-id')).toEqual({ id: 'fixed-id', balance: 0 });

    await store.update('fixed-id', { balance: 10 });
    expect((await store.getById('fixed-id'))?.balance).toBe(10);

    expect(await store.delete('fixed-id')).toBe(true);
    expect(await store.getById('fixed-id')).toBeUndefined();
  });

  it('exposes event log when configured', async () => {
    const store = new EventSourcedStore({
      exposeEventLog: true,
      generateId: () => 'a1',
      now: () => 42,
    });
    await store.create({ balance: 0 });
    await store.update('a1', { balance: 5 });
    const log = store.getEventLog('a1');
    expect(log).toHaveLength(2);
    expect(log?.[0].kind).toBe('create');
    expect(log?.[1].kind).toBe('update');
    expect(log?.[1].payload).toEqual({ balance: 5 });
  });

  it('hides event log when exposeEventLog is false', async () => {
    const store = new EventSourcedStore({ generateId: () => 'a1' });
    await store.create({ id: 'a1' });
    expect(store.getEventLog('a1')).toBeUndefined();
  });

  it('takes snapshots on snapshotInterval', async () => {
    const store = new EventSourcedStore({
      snapshotInterval: 2,
      generateId: () => 'a1',
      now: () => 1,
    });
    await store.create({ n: 0 });
    expect(store.getSnapshot('a1')).toBeUndefined();
    await store.update('a1', { n: 1 });
    const snap = store.getSnapshot('a1');
    expect(snap?.sequence).toBe(2);
    expect(snap?.state).toEqual({ id: 'a1', n: 1 });
  });

  it('parses IR config values', () => {
    const opts = eventSourcedOptionsFromConfig({
      snapshotInterval: { kind: 'number', value: 10 },
      exposeEventLog: { kind: 'boolean', value: true },
    });
    expect(opts.snapshotInterval).toBe(10);
    expect(opts.exposeEventLog).toBe(true);
  });
});

describe('RuntimeEngine + eventSourced store', () => {
  it('persists command mutations through EventSourcedStore', async () => {
    const { IRCompiler } = await import('../ir-compiler');
    const { RuntimeEngine } = await import('../runtime-engine');
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(
      resolve(__dirname, '../conformance/fixtures/83-event-sourced.manifest'),
      'utf8',
    );
    const compiler = new IRCompiler();
    const compiled = await compiler.compileToIR(source);
    expect(compiled.ir).toBeTruthy();
    const rt = new RuntimeEngine(
      compiled.ir!,
      {},
      {
        generateId: () => 'acct-1',
        now: () => 1000,
      },
    );
    await rt.createInstance('BankAccount', { id: 'acct-1', balance: 0, owner: 'alice' });
    const result = await rt.runCommand(
      'deposit',
      { amount: 25 },
      { entityName: 'BankAccount', instanceId: 'acct-1' },
    );
    expect(result.success).toBe(true);
    const inst = await rt.getInstance('BankAccount', 'acct-1');
    expect(inst?.balance).toBe(25);
  });
});
