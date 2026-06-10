/**
 * Runtime subscribe() contract (docs/spec/semantics.md, "Realtime Entities").
 *
 * subscribe(entityName, listener) is a convenience over onEvent that delivers
 * only events whose subject.entity === entityName. Events WITHOUT a subject
 * entity are NOT delivered (onEvent remains the unfiltered firehose). The
 * return value is an unsubscribe function. subscribe exists regardless of any
 * entity's `realtime` flag — the flag is a projection hint with no runtime
 * execution semantics.
 */

import { describe, it, expect } from 'vitest';
import { compileToIR } from './ir-compiler';
import { RuntimeEngine, type EmittedEvent } from './runtime-engine';

const FIXED_NOW = 1000000000000;

// Note: neither entity declares `realtime` — subscribe works regardless.
const source = `
entity Counter {
  property value: number = 0

  command increment() {
    mutate value = value + 1
    emit CounterIncremented
  }
}

entity Gauge {
  property level: number = 0

  command bump() {
    mutate level = level + 1
    emit GaugeBumped
  }
}

store Counter in memory
store Gauge in memory

command ping() {
  emit Pinged
}

event CounterIncremented: "counter.incremented" {
  value: number
}

event GaugeBumped: "gauge.bumped" {
  level: number
}

event Pinged: "system.pinged" {
}
`;

async function setup() {
  const { ir, diagnostics } = await compileToIR(source);
  expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  expect(ir).not.toBeNull();

  let nextId = 0;
  const engine = new RuntimeEngine(ir!, {}, {
    now: () => FIXED_NOW,
    generateId: () => `test-id-${++nextId}`,
  });
  return engine;
}

describe('RuntimeEngine.subscribe', () => {
  it('delivers events whose subject.entity matches the subscribed entity', async () => {
    const engine = await setup();
    const counter = await engine.createInstance('Counter', { value: 0 });
    expect(counter).toBeDefined();

    const received: EmittedEvent[] = [];
    engine.subscribe('Counter', (e) => received.push(e));

    const result = await engine.runCommand('increment', {}, {
      entityName: 'Counter',
      instanceId: counter!.id as string,
    });
    expect(result.success).toBe(true);

    expect(received).toHaveLength(1);
    expect(received[0].name).toBe('CounterIncremented');
    expect(received[0].subject?.entity).toBe('Counter');
  });

  it('does not deliver events from other entities', async () => {
    const engine = await setup();
    const counter = await engine.createInstance('Counter', { value: 0 });
    const gauge = await engine.createInstance('Gauge', { level: 0 });

    const counterEvents: EmittedEvent[] = [];
    engine.subscribe('Counter', (e) => counterEvents.push(e));

    const result = await engine.runCommand('bump', {}, {
      entityName: 'Gauge',
      instanceId: gauge!.id as string,
    });
    expect(result.success).toBe(true);
    expect(counterEvents).toHaveLength(0);

    // Sanity: the matching entity still receives its own events.
    await engine.runCommand('increment', {}, {
      entityName: 'Counter',
      instanceId: counter!.id as string,
    });
    expect(counterEvents).toHaveLength(1);
  });

  it('does not deliver events without a subject entity (firehose stays on onEvent)', async () => {
    const engine = await setup();

    const subscribed: EmittedEvent[] = [];
    const firehose: EmittedEvent[] = [];
    engine.subscribe('Counter', (e) => subscribed.push(e));
    engine.onEvent((e) => firehose.push(e));

    // Root-level command: no entityName, so emitted events carry a subject
    // without an entity. subscribe drops them; onEvent still sees them.
    const result = await engine.runCommand('ping', {}, {});
    expect(result.success).toBe(true);
    expect(result.emittedEvents).toHaveLength(1);
    expect(result.emittedEvents[0].subject?.entity).toBeUndefined();

    expect(subscribed).toHaveLength(0);
    expect(firehose).toHaveLength(1);
  });

  it('returns an unsubscribe function that stops delivery', async () => {
    const engine = await setup();
    const counter = await engine.createInstance('Counter', { value: 0 });

    const received: EmittedEvent[] = [];
    const unsubscribe = engine.subscribe('Counter', (e) => received.push(e));

    await engine.runCommand('increment', {}, {
      entityName: 'Counter',
      instanceId: counter!.id as string,
    });
    expect(received).toHaveLength(1);

    unsubscribe();

    await engine.runCommand('increment', {}, {
      entityName: 'Counter',
      instanceId: counter!.id as string,
    });
    expect(received).toHaveLength(1);
  });

  it('supports multiple independent subscribers', async () => {
    const engine = await setup();
    const counter = await engine.createInstance('Counter', { value: 0 });
    const gauge = await engine.createInstance('Gauge', { level: 0 });

    const a: EmittedEvent[] = [];
    const b: EmittedEvent[] = [];
    const g: EmittedEvent[] = [];
    const unsubA = engine.subscribe('Counter', (e) => a.push(e));
    engine.subscribe('Counter', (e) => b.push(e));
    engine.subscribe('Gauge', (e) => g.push(e));

    await engine.runCommand('increment', {}, {
      entityName: 'Counter',
      instanceId: counter!.id as string,
    });
    await engine.runCommand('bump', {}, {
      entityName: 'Gauge',
      instanceId: gauge!.id as string,
    });

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(g).toHaveLength(1);

    // Unsubscribing one listener leaves the others attached.
    unsubA();
    await engine.runCommand('increment', {}, {
      entityName: 'Counter',
      instanceId: counter!.id as string,
    });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(2);
    expect(g).toHaveLength(1);
  });

  it('swallows listener errors without affecting execution or other listeners', async () => {
    const engine = await setup();
    const counter = await engine.createInstance('Counter', { value: 0 });

    const received: EmittedEvent[] = [];
    engine.subscribe('Counter', () => { throw new Error('listener boom'); });
    engine.subscribe('Counter', (e) => received.push(e));

    const result = await engine.runCommand('increment', {}, {
      entityName: 'Counter',
      instanceId: counter!.id as string,
    });
    expect(result.success).toBe(true);
    expect(received).toHaveLength(1);
  });
});
