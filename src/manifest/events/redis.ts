/**
 * RedisEventBus — Redis Pub/Sub implementation of the EventBus contract.
 *
 * Publishes the runtime's emitted-event envelope to a single Redis channel and
 * fans it back out to every subscriber process. Redis requires a *dedicated*
 * connection in subscriber mode, so each `subscribe` call opens its own
 * connection via `client.duplicate()` — this is exactly what the old
 * RedisStore pub/sub stub admitted it was missing.
 *
 * 'ioredis' is an optional peer dependency. It is loaded via dynamic import at
 * construction time (only when the bus creates its own connection). If the
 * package is not installed, a clear error is thrown. When a `client` is
 * injected, no import happens — tests drive the bus with an in-memory fake.
 *
 * Connection ownership:
 * - A client the bus creates itself (from `url`/defaults) is owned by the bus:
 *   `close()` quits it.
 * - An injected `client` belongs to the caller: `close()` does NOT quit it.
 * - Subscriber connections are always created by the bus via `duplicate()`, so
 *   the bus owns them regardless of where the base client came from — `close()`
 *   (and each subscription's own unsubscribe) quits them.
 *
 * The bus is deterministic: no timers, no ret/backoff. Delivery is whatever
 * Redis Pub/Sub provides. Self-delivery is included — the bus is dumb; the
 * runtime engine is responsible for filtering messages by `originId`.
 */

import type { EventBus, EventBusHandler, EventBusMessage } from './event-bus';

/**
 * Minimal structural view of the Redis client the bus needs. Both the real
 * ioredis client and the in-test fake satisfy this shape. Subscriber-mode
 * connections come from `duplicate()`.
 */
export interface RedisEventBusClient {
  publish(channel: string, message: string): Promise<unknown> | unknown;
  duplicate(): RedisEventBusClient;
  subscribe(channel: string): Promise<unknown> | unknown;
  on(event: 'message', listener: (channel: string, message: string) => void): unknown;
  quit(): Promise<unknown> | unknown;
}

export interface RedisEventBusConfig {
  /** Redis connection URL (redis://... or rediss:// for TLS). Ignored when `client` is set. */
  url?: string;
  /** Pre-initialized Redis client. When provided, the bus does not load ioredis and does not own the connection. */
  client?: RedisEventBusClient;
  /** Channel to publish/subscribe on (default: 'manifest:events'). */
  channel?: string;
}

const DEFAULT_CHANNEL = 'manifest:events';
const DEFAULT_URL = 'redis://localhost:6379';

export class RedisEventBus implements EventBus {
  private channel: string;
  private publisher!: RedisEventBusClient;
  private ownsPublisher: boolean;
  private ready: Promise<void> | undefined;
  private readonly url: string | undefined;
  private subscribers = new Set<RedisEventBusClient>();
  private closed = false;

  constructor(config: RedisEventBusConfig = {}) {
    this.channel = config.channel ?? DEFAULT_CHANNEL;
    this.url = config.url;
    if (config.client) {
      this.publisher = config.client;
      this.ownsPublisher = false;
      this.ready = Promise.resolve();
    } else {
      this.ownsPublisher = true;
      // Defer async ioredis load until first use (Sonar S7059).
    }
  }

  private ensureReady(): Promise<void> {
    if (!this.ready) {
      this.ready = this.initPublisher(this.url);
    }
    return this.ready;
  }

  private async initPublisher(url?: string): Promise<void> {
    let Redis: unknown;
    try {
      // 'ioredis' is an optional peer dependency, resolved at runtime via dynamic import; its absence is handled by the catch below.
      const mod = await import('ioredis');
      Redis = mod.Redis;
    } catch {
      throw new Error(
        `RedisEventBus requires 'ioredis' to be installed.\n` + `Run: npm install ioredis`,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.publisher = new (Redis as any)(url ?? DEFAULT_URL);
  }

  async publish(message: EventBusMessage): Promise<void> {
    await this.ensureReady();
    await this.publisher.publish(this.channel, JSON.stringify(message));
  }

  async subscribe(handler: EventBusHandler): Promise<() => Promise<void>> {
    await this.ensureReady();

    // Redis requires a dedicated connection for subscriber mode.
    const sub = this.publisher.duplicate();

    sub.on('message', (channel: string, raw: string) => {
      if (channel !== this.channel) return;
      let message: EventBusMessage;
      try {
        message = JSON.parse(raw) as EventBusMessage;
      } catch {
        // Never throw back into the Redis callback — warn and drop.
        console.warn(`RedisEventBus: dropping malformed message on channel '${this.channel}'`);
        return;
      }
      // Swallow handler errors so one bad subscriber cannot break the Redis
      // message callback — matching MemoryEventBus and the in-process listener
      // policy in runtime-engine.dispatchToListeners.
      try {
        handler(message);
      } catch {
        // Ignore errors in bus handlers.
      }
    });

    await sub.subscribe(this.channel);
    this.subscribers.add(sub);

    let unsubscribed = false;
    return async () => {
      if (unsubscribed) return;
      unsubscribed = true;
      this.subscribers.delete(sub);
      await sub.quit();
    };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    // Swallow a failed init (e.g. ioredis missing) — there is nothing to tear down.
    if (this.ready) {
      await this.ready.catch(() => {});
    }

    // Subscriber connections are always bus-owned (created via duplicate()).
    const subs = [...this.subscribers];
    this.subscribers.clear();
    for (const sub of subs) {
      await sub.quit();
    }

    // The publisher is only ours to close when the bus created it.
    if (this.ownsPublisher && this.publisher && typeof this.publisher.quit === 'function') {
      await this.publisher.quit();
    }
  }
}
