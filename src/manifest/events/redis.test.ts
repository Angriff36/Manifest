/**
 * Tests for RedisEventBus.
 *
 * Contract correctness is proven with an injected in-memory fake client pair
 * (a publisher plus subscriber connections created via `duplicate()`, all
 * sharing one in-memory channel hub) — no server required. The live suite
 * exercises a real Redis round-trip across two connections and skips cleanly
 * when no server is reachable (mirrors stores.node.test.ts's gate).
 *
 * To run the live suite locally: start Redis with `docker run -p 6379:6379 redis`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { RedisEventBus } from './redis';
import type { RedisEventBusClient } from './redis';
import type { EmittedEvent } from '../runtime-engine';

const CHANNEL = 'test:events';

// ─── In-memory fake Redis client pair ────────────────────────────────────
// A shared hub maps channel -> the set of connections subscribed to it. A
// publish walks the subscribers and invokes their 'message' listeners
// synchronously, so delivery is observable immediately after `publish`
// resolves (no timers). `duplicate()` yields a new connection on the same hub
// — exactly how the bus obtains its dedicated subscriber connections.

class FakeHub {
  readonly channels = new Map<string, Set<FakeRedis>>();
}

class FakeRedis implements RedisEventBusClient {
  readonly messageListeners: Array<(channel: string, message: string) => void> = [];
  readonly subscribedChannels = new Set<string>();
  quitCalls = 0;

  constructor(readonly hub: FakeHub = new FakeHub()) {}

  async publish(channel: string, message: string): Promise<number> {
    const subs = this.hub.channels.get(channel);
    if (!subs) return 0;
    let delivered = 0;
    for (const sub of subs) {
      for (const listener of sub.messageListeners) {
        listener(channel, message);
        delivered++;
      }
    }
    return delivered;
  }

  duplicate(): FakeRedis {
    return new FakeRedis(this.hub);
  }

  async subscribe(channel: string): Promise<number> {
    this.subscribedChannels.add(channel);
    let set = this.hub.channels.get(channel);
    if (!set) {
      set = new Set();
      this.hub.channels.set(channel, set);
    }
    set.add(this);
    return set.size;
  }

  on(event: 'message', listener: (channel: string, message: string) => void): this {
    if (event === 'message') this.messageListeners.push(listener);
    return this;
  }

  async quit(): Promise<'OK'> {
    this.quitCalls++;
    for (const set of this.hub.channels.values()) set.delete(this);
    return 'OK';
  }
}

function sampleEvent(name = 'created'): EmittedEvent {
  return { name, channel: 'Order', payload: { id: 'o1' }, timestamp: 1 };
}

describe('RedisEventBus (fake client)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('round-trips a published message to a subscriber, self-delivery included', async () => {
    const publisher = new FakeRedis();
    const bus = new RedisEventBus({ client: publisher, channel: CHANNEL });

    const received: unknown[] = [];
    await bus.subscribe((message) => received.push(message));

    const message = { originId: 'origin-1', events: [sampleEvent()] };
    await bus.publish(message);

    // The bus does not filter by originId — the engine does. A subscriber in
    // the same process receives its own process's message.
    expect(received).toEqual([message]);

    await bus.close();
  });

  it('stops delivery after unsubscribe', async () => {
    const publisher = new FakeRedis();
    const bus = new RedisEventBus({ client: publisher, channel: CHANNEL });

    const received: unknown[] = [];
    const unsubscribe = await bus.subscribe((message) => received.push(message));

    await bus.publish({ originId: 'a', events: [] });
    expect(received).toHaveLength(1);

    await unsubscribe();

    await bus.publish({ originId: 'b', events: [] });
    expect(received).toHaveLength(1); // no further delivery

    await bus.close();
  });

  it('drops malformed inbound JSON with a warning and never throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const publisher = new FakeRedis();
    const bus = new RedisEventBus({ client: publisher, channel: CHANNEL });

    const received: unknown[] = [];
    await bus.subscribe((message) => received.push(message));

    // A raw publish of non-JSON reaches the subscriber's message listener.
    await expect(publisher.publish(CHANNEL, 'not-json{')).resolves.toBeGreaterThan(0);

    expect(received).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);

    await bus.close();
  });

  it('close is idempotent and does not quit an injected (caller-owned) client', async () => {
    const publisher = new FakeRedis();
    const bus = new RedisEventBus({ client: publisher, channel: CHANNEL });

    await bus.subscribe(() => {});

    await bus.close();
    await expect(bus.close()).resolves.toBeUndefined(); // second call is a no-op, no throw

    // Injected publisher belongs to the caller — the bus must not close it.
    expect(publisher.quitCalls).toBe(0);
  });

  it('owns and closes the subscriber connections it created via duplicate()', async () => {
    const publisher = new FakeRedis();
    const bus = new RedisEventBus({ client: publisher, channel: CHANNEL });

    await bus.subscribe(() => {});
    await bus.subscribe(() => {});

    // Two subscriptions -> two dedicated subscriber connections on the hub.
    const subscriberConnections = [...(publisher.hub.channels.get(CHANNEL) ?? [])];
    expect(subscriberConnections).toHaveLength(2);

    await bus.close();

    for (const sub of subscriberConnections) {
      expect(sub.quitCalls).toBe(1);
    }
  });

  it('unsubscribe closes only its own subscriber connection', async () => {
    const publisher = new FakeRedis();
    const bus = new RedisEventBus({ client: publisher, channel: CHANNEL });

    const unsubscribe = await bus.subscribe(() => {});
    const [sub] = [...(publisher.hub.channels.get(CHANNEL) ?? [])];
    expect(sub).toBeDefined();

    await unsubscribe();
    expect(sub.quitCalls).toBe(1);

    // Idempotent unsubscribe.
    await expect(unsubscribe()).resolves.toBeUndefined();
    expect(sub.quitCalls).toBe(1);

    await bus.close();
  });
});

// ─── Live suite (real Redis, skips cleanly without a server) ──────────────
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const ioredisAvailable = await (async () => {
  try {
    const { default: Redis } = await import('ioredis');
    const probe = new Redis(REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 1000,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    await probe.connect();
    await probe.ping();
    probe.disconnect();
    return true;
  } catch {
    return false;
  }
})();

describe.runIf(ioredisAvailable)('RedisEventBus (live)', () => {
  it('round-trips a published message across two real connections', async () => {
    const channel = `test:events:${Math.random().toString(36).slice(2)}`;
    const bus = new RedisEventBus({ url: REDIS_URL, channel });

    const received: unknown[] = [];
    await bus.subscribe((message) => received.push(message));

    const message = { originId: 'live-origin', events: [sampleEvent('live')] };
    await bus.publish(message);

    // Real Redis pub/sub delivery is asynchronous over the socket.
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(received).toEqual([message]);

    await bus.close();
  });
});
