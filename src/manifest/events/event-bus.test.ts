/**
 * MemoryEventBus unit tests — the in-process EventBus transport.
 *
 * The bus is deliberately dumb: publish fans out to EVERY subscribed handler
 * (including the origin's own handler — self-filtering is the engine's job),
 * synchronously, on the same tick. These tests pin that contract plus the
 * subscribe/unsubscribe/close lifecycle. Engine-level behavior (originId
 * filtering, post-commit batching) lives in runtime-eventbus.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { MemoryEventBus, type EventBusMessage } from './event-bus';
import type { EmittedEvent } from '../runtime-engine';

function ev(name: string): EmittedEvent {
  return { name, channel: name, payload: {}, timestamp: 0 };
}

function msg(originId: string, ...names: string[]): EventBusMessage {
  return { originId, events: names.map(ev) };
}

describe('MemoryEventBus', () => {
  it('subscribe resolves immediately and publish delivers to the handler', async () => {
    const bus = new MemoryEventBus();
    const received: EventBusMessage[] = [];
    await bus.subscribe((m) => received.push(m));

    await bus.publish(msg('a', 'X'));

    expect(received).toHaveLength(1);
    expect(received[0].originId).toBe('a');
    expect(received[0].events.map((e) => e.name)).toEqual(['X']);
  });

  it('fans out to every subscribed handler', async () => {
    const bus = new MemoryEventBus();
    const a: string[] = [];
    const b: string[] = [];
    await bus.subscribe((m) => a.push(m.originId));
    await bus.subscribe((m) => b.push(m.originId));

    await bus.publish(msg('o', 'X'));

    expect(a).toEqual(['o']);
    expect(b).toEqual(['o']);
  });

  it('delivers to the origin handler too — self-filtering is the engine job', async () => {
    // The bus does not know or care about origin; it delivers to all handlers.
    const bus = new MemoryEventBus();
    const seen: EventBusMessage[] = [];
    await bus.subscribe((m) => seen.push(m));

    await bus.publish(msg('self', 'X'));

    expect(seen).toHaveLength(1);
    expect(seen[0].originId).toBe('self');
  });

  it('delivers synchronously (no scheduling) — handler runs before publish resolves', async () => {
    const bus = new MemoryEventBus();
    let delivered = false;
    await bus.subscribe(() => {
      delivered = true;
    });

    const p = bus.publish(msg('o', 'X'));
    // Already delivered on the same tick, before awaiting the returned promise.
    expect(delivered).toBe(true);
    await p;
  });

  it('unsubscribe stops further delivery', async () => {
    const bus = new MemoryEventBus();
    const seen: string[] = [];
    const unsubscribe = await bus.subscribe((m) => seen.push(m.originId));

    await bus.publish(msg('first'));
    await unsubscribe();
    await bus.publish(msg('second'));

    expect(seen).toEqual(['first']);
  });

  it('swallows a handler error so other handlers still receive the message', async () => {
    const bus = new MemoryEventBus();
    const good: string[] = [];
    await bus.subscribe(() => {
      throw new Error('bad handler');
    });
    await bus.subscribe((m) => good.push(m.originId));

    await expect(bus.publish(msg('o'))).resolves.toBeUndefined();
    expect(good).toEqual(['o']);
  });

  it('a handler that unsubscribes mid-delivery does not perturb the current fan-out', async () => {
    const bus = new MemoryEventBus();
    const order: string[] = [];
    const unsubs: Array<() => Promise<void>> = [];
    unsubs.push(
      await bus.subscribe(async () => {
        order.push('h1');
        if (unsubs[1]) await unsubs[1](); // remove h2 during delivery
      }),
    );
    unsubs.push(
      await bus.subscribe(() => {
        order.push('h2');
      }),
    );

    await bus.publish(msg('o'));

    // h2 was captured in the snapshot for this publish, so it still ran once.
    expect(order).toEqual(['h1', 'h2']);
    order.length = 0;
    await bus.publish(msg('o'));
    // On the next publish h2 is gone.
    expect(order).toEqual(['h1']);
  });

  it('close clears handlers and rejects further publish/subscribe', async () => {
    const bus = new MemoryEventBus();
    const seen: string[] = [];
    await bus.subscribe((m) => seen.push(m.originId));

    await bus.close();

    await bus.publish(msg('after-close')).then(
      () => {
        throw new Error('expected publish to reject');
      },
      (e: Error) => expect(e.message).toMatch(/publish after close/),
    );
    await bus
      .subscribe(() => {})
      .then(
        () => {
          throw new Error('expected subscribe to reject');
        },
        (e: Error) => expect(e.message).toMatch(/subscribe after close/),
      );
    expect(seen).toEqual([]);
  });
});
