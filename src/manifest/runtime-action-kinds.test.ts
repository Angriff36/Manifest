/**
 * Action-kind contract tests (Wave 2, Item 3/3b/3c).
 *
 * Each `IRAction.kind` has distinct, real semantics:
 *   - `mutate`  — change entity state (buffered write).
 *   - `compute` — calculate WITHOUT mutation; bind a command-scoped local.
 *   - `emit`    — emit the NAMED IR event in-process (reactions/sagas/result).
 *   - `publish` — external delivery via outboxStore; fail-closed MISSING_OUTBOX_STORE.
 *   - `effect`  — invoke RuntimeOptions.effectHandler; fail-closed MISSING_EFFECT_HANDLER.
 *   - `persist` — explicit buffered flush; deterministic mode throws.
 *
 * Action-form emit/publish/effect are constructed via IR directly because a
 * command-body `emit X` is captured to `command.emits`, never reaching an action.
 */

import { describe, it, expect, vi } from 'vitest';
import { RuntimeEngine, ManifestEffectBoundaryError, type RuntimeOptions } from './runtime-engine';
import type { IR, IRAction, IREvent, IRProperty } from './ir';
import type { OutboxEntry, OutboxStore } from './outbox/outbox-store';
import { IRCompiler } from './ir-compiler';
import { COMPILER_VERSION } from './version';

async function compileSource(source: string) {
  const compiler = new IRCompiler();
  return compiler.compileToIR(source, { useCache: false });
}

function prop(name: string, type = 'number'): IRProperty {
  return { name, type: { name: type, nullable: false }, modifiers: [] } as IRProperty;
}

function num(value: number): IRAction['expression'] {
  return { kind: 'literal', value: { kind: 'number', value } } as IRAction['expression'];
}

function ident(name: string): IRAction['expression'] {
  return { kind: 'identifier', name } as IRAction['expression'];
}

function buildIR(opts: {
  entityName?: string;
  properties?: IRProperty[];
  commandName?: string;
  actions: IRAction[];
  events?: IREvent[];
  reactions?: IR['reactions'];
}): IR {
  const entityName = opts.entityName ?? 'Foo';
  const commandName = opts.commandName ?? 'run';
  return {
    version: '1.0',
    provenance: {
      contentHash: 'action-kinds-test',
      compilerVersion: COMPILER_VERSION,
      schemaVersion: '1.0',
      compiledAt: new Date().toISOString(),
    },
    modules: [],
    values: [],
    entities: [
      {
        name: entityName,
        properties: opts.properties ?? [],
        computedProperties: [],
        relationships: [],
        commands: [commandName],
        constraints: [],
        policies: [],
      },
    ],
    enums: [],
    stores: [],
    events: opts.events ?? [],
    commands: [
      {
        name: commandName,
        entity: entityName,
        parameters: [],
        guards: [],
        actions: opts.actions,
        emits: [],
      },
    ],
    policies: [],
    ...(opts.reactions ? { reactions: opts.reactions } : {}),
  } as IR;
}

class RecordingOutboxStore implements OutboxStore {
  entries: OutboxEntry[] = [];
  txSeen: unknown[] = [];
  async enqueue(entries: OutboxEntry[], tx?: unknown): Promise<void> {
    this.entries.push(...entries);
    this.txSeen.push(tx);
  }
  async claim(): Promise<OutboxEntry[]> { return []; }
  async markDelivered(): Promise<void> {}
  async markFailed(): Promise<void> {}
}

describe('compute action — calculates without mutation', () => {
  it('binds a command-scoped local usable by a later action, without persisting it', async () => {
    const ir = buildIR({
      properties: [prop('id', 'string'), prop('stored')],
      actions: [
        // compute doubled = 21; a non-property local binding
        { kind: 'compute', target: 'doubled', expression: num(21) },
        // mutate stored = doubled  → reads the compute binding
        { kind: 'mutate', target: 'stored', expression: ident('doubled') },
      ],
    });
    const rt = new RuntimeEngine(ir, {});
    await rt.createInstance('Foo', { id: 'a', stored: 0 });
    const res = await rt.runCommand('run', {}, { entityName: 'Foo', instanceId: 'a' });
    expect(res.success).toBe(true);
    const inst = await rt.getInstance('Foo', 'a');
    // stored persisted from the binding; `doubled` never became a field.
    expect(inst?.stored).toBe(21);
    expect(inst && 'doubled' in inst).toBe(false);
  });

  it('does NOT write a store field even when the binding name matches a property', async () => {
    const ir = buildIR({
      properties: [prop('id', 'string'), prop('count')],
      actions: [
        // compute count = 99 — must NOT persist (count stays its created value)
        { kind: 'compute', target: 'count', expression: num(99) },
      ],
    });
    const rt = new RuntimeEngine(ir, {});
    await rt.createInstance('Foo', { id: 'a', count: 5 });
    const res = await rt.runCommand('run', {}, { entityName: 'Foo', instanceId: 'a' });
    expect(res.success).toBe(true);
    expect(res.result).toBe(99); // returns the value
    const inst = await rt.getInstance('Foo', 'a');
    expect(inst?.count).toBe(5); // unchanged — compute never mutated
  });
});

describe('emit action — named in-process event', () => {
  it('emits the NAMED event into CommandResult.emittedEvents and the listener stream', async () => {
    const ir = buildIR({
      properties: [prop('id', 'string')],
      events: [{ name: 'Pinged', channel: 'pings', payload: [] }],
      actions: [{ kind: 'emit', target: 'Pinged', expression: num(7) }],
    });
    const rt = new RuntimeEngine(ir, {});
    const seen: string[] = [];
    rt.onEvent((e) => seen.push(e.name));
    await rt.createInstance('Foo', { id: 'a' });
    const res = await rt.runCommand('run', {}, { entityName: 'Foo', instanceId: 'a' });
    expect(res.success).toBe(true);
    expect(res.emittedEvents?.map(e => e.name)).toEqual(['Pinged']);
    expect(res.emittedEvents?.[0].channel).toBe('pings');
    // scalar payload is wrapped as { result }
    expect(res.emittedEvents?.[0].payload).toEqual({ result: 7 });
    expect(seen).toContain('Pinged');
  });

  it('triggers a reaction that matches the named action-emitted event', async () => {
    const ir = buildIR({
      properties: [prop('id', 'string'), prop('hits')],
      events: [{ name: 'Ticked', channel: 'ticks', payload: [] }],
      commandName: 'tick',
      actions: [{ kind: 'emit', target: 'Ticked', expression: num(1) }],
      reactions: [
        {
          name: 'onTicked',
          event: 'Ticked',
          targetEntity: 'Foo',
          targetCommand: 'bump',
          // resolve payload._subject.id → the emitting instance id ('a')
          resolve: {
            kind: 'member',
            object: { kind: 'member', object: { kind: 'identifier', name: 'payload' }, property: '_subject' },
            property: 'id',
          },
        } as unknown as NonNullable<IR['reactions']>[number],
      ],
    });
    // Add the reaction target command `bump` that mutates hits.
    ir.entities[0].commands.push('bump');
    ir.commands.push({
      name: 'bump',
      entity: 'Foo',
      parameters: [],
      guards: [],
      actions: [{ kind: 'mutate', target: 'hits', expression: num(100) }],
      emits: [],
    });
    const rt = new RuntimeEngine(ir, {});
    await rt.createInstance('Foo', { id: 'a', hits: 0 });
    const res = await rt.runCommand('tick', {}, { entityName: 'Foo', instanceId: 'a' });
    expect(res.success).toBe(true);
    const inst = await rt.getInstance('Foo', 'a');
    expect(inst?.hits).toBe(100); // reaction fired bump
  });
});

describe('publish action — external delivery, fail-closed', () => {
  it('enqueues an OutboxEntry wrapping the named event and delivers it in-process', async () => {
    const outbox = new RecordingOutboxStore();
    const ir = buildIR({
      properties: [prop('id', 'string')],
      events: [{ name: 'Shipped', channel: 'ship', payload: [] }],
      actions: [{ kind: 'publish', target: 'Shipped', expression: num(1) }],
    });
    const rt = new RuntimeEngine(ir, {}, { outboxStore: outbox });
    await rt.createInstance('Foo', { id: 'a' });
    const res = await rt.runCommand('run', {}, { entityName: 'Foo', instanceId: 'a' });
    expect(res.success).toBe(true);
    expect(outbox.entries).toHaveLength(1);
    expect(outbox.entries[0].event.name).toBe('Shipped');
    expect(outbox.entries[0].status).toBe('pending');
    // also delivered in-process so reactions and the outbound bridge observe it
    expect(res.emittedEvents?.map(e => e.name)).toEqual(['Shipped']);
  });

  it('fails closed with MISSING_OUTBOX_STORE when no outbox is configured', async () => {
    const ir = buildIR({
      properties: [prop('id', 'string')],
      events: [{ name: 'Shipped', channel: 'ship', payload: [] }],
      actions: [{ kind: 'publish', target: 'Shipped', expression: num(1) }],
    });
    const rt = new RuntimeEngine(ir, {});
    await rt.createInstance('Foo', { id: 'a' });
    const res = await rt.runCommand('run', {}, { entityName: 'Foo', instanceId: 'a' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('MISSING_OUTBOX_STORE');
    expect(res.emittedEvents).toEqual([]);
  });

  it('throws ManifestEffectBoundaryError in deterministic mode', async () => {
    const ir = buildIR({
      properties: [prop('id', 'string')],
      events: [{ name: 'Shipped', channel: 'ship', payload: [] }],
      actions: [{ kind: 'publish', target: 'Shipped', expression: num(1) }],
    });
    const rt = new RuntimeEngine(ir, {}, { deterministicMode: true });
    await rt.createInstance('Foo', { id: 'a' });
    await expect(
      rt.runCommand('run', {}, { entityName: 'Foo', instanceId: 'a' })
    ).rejects.toBeInstanceOf(ManifestEffectBoundaryError);
  });
});

describe('effect action — host side-effect hook, fail-closed', () => {
  it('invokes effectHandler with name/value/context and returns its result', async () => {
    type EffectInfo = { name?: string; value: unknown; commandName: string; entityName?: string; instanceId?: string; context: unknown };
    const handler = vi.fn((_info: EffectInfo): unknown => 'handled');
    const opts: RuntimeOptions = { effectHandler: handler };
    const ir = buildIR({
      properties: [prop('id', 'string')],
      // effect notify = 5  (named effect)
      actions: [{ kind: 'effect', target: 'notify', expression: num(5) }],
    });
    const rt = new RuntimeEngine(ir, { actorId: 'u1' }, opts);
    await rt.createInstance('Foo', { id: 'a' });
    const res = await rt.runCommand('run', {}, { entityName: 'Foo', instanceId: 'a' });
    expect(res.success).toBe(true);
    expect(res.result).toBe('handled');
    expect(handler).toHaveBeenCalledTimes(1);
    const info = handler.mock.calls[0][0];
    expect(info.name).toBe('notify');
    expect(info.value).toBe(5);
    expect(info.commandName).toBe('run');
    expect(info.entityName).toBe('Foo');
    expect(info.instanceId).toBe('a');
  });

  it('fails closed with MISSING_EFFECT_HANDLER when no handler is configured', async () => {
    const ir = buildIR({
      properties: [prop('id', 'string')],
      actions: [{ kind: 'effect', target: 'notify', expression: num(5) }],
    });
    const rt = new RuntimeEngine(ir, {});
    await rt.createInstance('Foo', { id: 'a' });
    const res = await rt.runCommand('run', {}, { entityName: 'Foo', instanceId: 'a' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('MISSING_EFFECT_HANDLER');
  });

  it('throws ManifestEffectBoundaryError in deterministic mode (handler never reached)', async () => {
    const handler = vi.fn(async () => 'handled');
    const ir = buildIR({
      properties: [prop('id', 'string')],
      actions: [{ kind: 'effect', target: 'notify', expression: num(5) }],
    });
    const rt = new RuntimeEngine(ir, {}, { deterministicMode: true, effectHandler: handler });
    await rt.createInstance('Foo', { id: 'a' });
    await expect(
      rt.runCommand('run', {}, { entityName: 'Foo', instanceId: 'a' })
    ).rejects.toBeInstanceOf(ManifestEffectBoundaryError);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('persist action — explicit buffered flush', () => {
  it('is a no-op-safe explicit flush; final state matches the mutations', async () => {
    const ir = buildIR({
      properties: [prop('id', 'string'), prop('total')],
      actions: [
        { kind: 'mutate', target: 'total', expression: num(42) },
        { kind: 'persist', expression: num(0) },
      ],
    });
    const rt = new RuntimeEngine(ir, {});
    await rt.createInstance('Foo', { id: 'a', total: 0 });
    const res = await rt.runCommand('run', {}, { entityName: 'Foo', instanceId: 'a' });
    expect(res.success).toBe(true);
    const inst = await rt.getInstance('Foo', 'a');
    expect(inst?.total).toBe(42);
  });

  it('flushes early: a persist mid-loop writes the accumulated patch through the store', async () => {
    // Spy on the store update to observe the early flush.
    const ir = buildIR({
      properties: [prop('id', 'string'), prop('total')],
      actions: [
        { kind: 'mutate', target: 'total', expression: num(10) },
        { kind: 'persist', expression: num(0) },
        { kind: 'mutate', target: 'total', expression: num(20) },
      ],
    });
    const rt = new RuntimeEngine(ir, {});
    await rt.createInstance('Foo', { id: 'a', total: 0 });
    // @ts-expect-error private access for test observation
    const store = rt.stores.get('Foo')!;
    const updateSpy = vi.spyOn(store, 'update');
    const res = await rt.runCommand('run', {}, { entityName: 'Foo', instanceId: 'a' });
    expect(res.success).toBe(true);
    // Two store writes: the explicit persist (total=10) and the end-of-loop flush (total=20).
    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(updateSpy.mock.calls[0][1]).toEqual({ total: 10 });
    expect(updateSpy.mock.calls[1][1]).toEqual({ total: 20 });
    const inst = await rt.getInstance('Foo', 'a');
    expect(inst?.total).toBe(20);
  });

  it('multiple persists each flush only the deltas since the previous flush', async () => {
    const ir = buildIR({
      properties: [prop('id', 'string'), prop('a'), prop('b')],
      actions: [
        { kind: 'mutate', target: 'a', expression: num(1) },
        { kind: 'persist', expression: num(0) },
        { kind: 'mutate', target: 'b', expression: num(2) },
        { kind: 'persist', expression: num(0) },
      ],
    });
    const rt = new RuntimeEngine(ir, {});
    await rt.createInstance('Foo', { id: 'x', a: 0, b: 0 });
    // @ts-expect-error private access for test observation
    const store = rt.stores.get('Foo')!;
    const updateSpy = vi.spyOn(store, 'update');
    const res = await rt.runCommand('run', {}, { entityName: 'Foo', instanceId: 'x' });
    expect(res.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(updateSpy.mock.calls[0][1]).toEqual({ a: 1 });
    expect(updateSpy.mock.calls[1][1]).toEqual({ b: 2 });
    const inst = await rt.getInstance('Foo', 'x');
    expect(inst?.a).toBe(1);
    expect(inst?.b).toBe(2);
  });

  it('throws ManifestEffectBoundaryError in deterministic mode', async () => {
    const ir = buildIR({
      properties: [prop('id', 'string'), prop('total')],
      actions: [
        { kind: 'mutate', target: 'total', expression: num(5) },
        { kind: 'persist', expression: num(0) },
      ],
    });
    const rt = new RuntimeEngine(ir, {}, { deterministicMode: true });
    await rt.createInstance('Foo', { id: 'a', total: 0 });
    await expect(
      rt.runCommand('run', {}, { entityName: 'Foo', instanceId: 'a' })
    ).rejects.toBeInstanceOf(ManifestEffectBoundaryError);
  });
});

describe('compiler diagnostics — action-kind contract', () => {
  it('EMIT_ACTION_UNKNOWN_EVENT: publish action targeting an undeclared event is an error', async () => {
    const source = `entity Order {
  property id: string
  command ship() {
    publish OrderShipped
  }
}
store Order in memory`;
    const { ir, diagnostics } = await compileSource(source);
    expect(ir).toBeNull();
    const errs = diagnostics.filter(d => d.severity === 'error');
    expect(errs.some(d => d.message.includes('EMIT_ACTION_UNKNOWN_EVENT'))).toBe(true);
    expect(errs.some(d => d.message.includes('OrderShipped'))).toBe(true);
  });

  it('EMIT_ACTION_UNKNOWN_EVENT: publish action with no event name is an error', async () => {
    const source = `entity Order {
  property id: string
  command ship() {
    publish
  }
}
store Order in memory`;
    const { ir, diagnostics } = await compileSource(source);
    expect(ir).toBeNull();
    expect(diagnostics.some(d => d.severity === 'error' && d.message.includes('EMIT_ACTION_UNKNOWN_EVENT'))).toBe(true);
  });

  it('publish action targeting a DECLARED event compiles cleanly', async () => {
    const source = `entity Order {
  property id: string
  property status: string = "new"
  command ship() {
    mutate status = "shipped"
    publish OrderShipped
  }
}
event OrderShipped: "order.shipped" {}
store Order in memory`;
    const { ir, diagnostics } = await compileSource(source);
    expect(ir).not.toBeNull();
    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  });

  it('COMPUTE_USED_AS_MUTATE: compute assigning to a declared property warns (compiles)', async () => {
    const source = `entity Counter {
  property id: string
  property count: number = 0
  command bump(amount: number) {
    compute count = count + amount
  }
}
store Counter in memory`;
    const { ir, diagnostics } = await compileSource(source);
    expect(ir).not.toBeNull();
    const warns = diagnostics.filter(d => d.severity === 'warning');
    expect(warns.some(d => d.message.includes('COMPUTE_USED_AS_MUTATE') && d.message.includes('count'))).toBe(true);
  });

  it('compute binding to a NON-property name does not warn', async () => {
    const source = `entity Counter {
  property id: string
  property count: number = 0
  command bump(amount: number) {
    compute scratch = count + amount
    mutate count = scratch
  }
}
store Counter in memory`;
    const { ir, diagnostics } = await compileSource(source);
    expect(ir).not.toBeNull();
    expect(diagnostics.some(d => d.message.includes('COMPUTE_USED_AS_MUTATE'))).toBe(false);
  });
});
