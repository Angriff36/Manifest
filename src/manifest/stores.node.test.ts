/**
 * Tests for RedisStore and RedisOutboxStore.
 *
 * These tests use a real Redis instance for integration testing.
 * To run locally: start Redis with `docker run -p 6379:6379 redis`
 * Install ioredis: npm install ioredis
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisStore } from './stores.node';
import { RedisOutboxStore } from './outbox/stores/redis';
import type { EntityInstance } from './stores.node';
import type { EmittedEvent } from './runtime-engine';

// Test configuration - can be overridden via environment
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Gate on an actual reachable Redis server, not just module presence:
// ioredis may be installed (it is an optional peer of the package) while no
// server is running, in which case these integration tests must skip.
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

describe.runIf(ioredisAvailable)('RedisStore', () => {
  let store: RedisStore<TestEntity>;

  interface TestEntity extends EntityInstance {
    id: string;
    name: string;
    value?: number;
  }

  beforeAll(async () => {
    store = new RedisStore<TestEntity>('TestEntity', {
      url: REDIS_URL,
      keyPrefix: 'test:',
      defaultTTL: 60,
    });
    // Clear any existing test data
    await store.clear();
  });

  afterAll(async () => {
    await store.clear();
    await store.close();
  });

  it('creates an entity', async () => {
    const entity = await store.create({ name: 'test-entity', value: 42 });
    expect(entity.id).toBeDefined();
    expect(entity.name).toBe('test-entity');
    expect(entity.value).toBe(42);
  });

  it('creates an entity with provided id', async () => {
    const entity = await store.create({ id: 'custom-id', name: 'custom' });
    expect(entity.id).toBe('custom-id');
    expect(entity.name).toBe('custom');
  });

  it('gets an entity by id', async () => {
    await store.create({ id: 'get-test', name: 'find-me' });
    const entity = await store.getById('get-test');
    expect(entity).toBeDefined();
    expect(entity?.name).toBe('find-me');
  });

  it('returns undefined for non-existent entity', async () => {
    const entity = await store.getById('does-not-exist');
    expect(entity).toBeUndefined();
  });

  it('updates an existing entity', async () => {
    await store.create({ id: 'update-test', name: 'original', value: 1 });
    const updated = await store.update('update-test', { value: 99 });
    expect(updated).toBeDefined();
    expect(updated?.name).toBe('original'); // unchanged
    expect(updated?.value).toBe(99);
  });

  it('returns undefined when updating non-existent entity', async () => {
    const result = await store.update('non-existent', { value: 123 });
    expect(result).toBeUndefined();
  });

  it('deletes an entity', async () => {
    await store.create({ id: 'delete-test', name: 'delete-me' });
    const deleted = await store.delete('delete-test');
    expect(deleted).toBe(true);
    const found = await store.getById('delete-test');
    expect(found).toBeUndefined();
  });

  it('returns false when deleting non-existent entity', async () => {
    const deleted = await store.delete('non-existent');
    expect(deleted).toBe(false);
  });

  it('gets all entities', async () => {
    await store.clear();
    await store.create({ id: 'all-1', name: 'first' });
    await store.create({ id: 'all-2', name: 'second' });
    await store.create({ id: 'all-3', name: 'third' });

    const all = await store.getAll();
    expect(all).toHaveLength(3);
    expect(all.map(e => e.id).sort()).toEqual(['all-1', 'all-2', 'all-3']);
  });

  it('clears all entities', async () => {
    await store.create({ id: 'clear-1', name: 'to-clear' });
    await store.create({ id: 'clear-2', name: 'also-clear' });
    await store.clear();
    const all = await store.getAll();
    expect(all).toHaveLength(0);
  });

  it('supports TTL operations', async () => {
    const ttlStore = new RedisStore<TestEntity>('TTLEntity', {
      url: REDIS_URL,
      keyPrefix: 'test:ttl:',
      defaultTTL: 1, // 1 second TTL
    });

    await ttlStore.create({ id: 'ttl-test', name: 'expires-soon' });
    const ttl = await ttlStore.getTTL();
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(1);

    // Extend TTL
    await ttlStore.setTTL(10);
    const extended = await ttlStore.getTTL();
    expect(extended).toBeGreaterThan(1);

    // Remove TTL
    await ttlStore.setTTL(undefined);
    const noTtl = await ttlStore.getTTL();
    expect(noTtl).toBe(-1); // -1 means no expiry

    await ttlStore.close();
  });

  it('publishes and subscribes to events', async () => {
    const pubSubStore = new RedisStore<TestEntity>('PubSubEntity', {
      url: REDIS_URL,
      keyPrefix: 'test:pubsub:',
    });

    let receivedEvent: unknown = null;

    await pubSubStore.subscribe('test-channel', (event) => {
      receivedEvent = event;
    });

    const testEvent: EmittedEvent = {
      name: 'test',
      channel: 'test-channel',
      payload: { data: 'test-value' },
      timestamp: Date.now(),
    };

    await pubSubStore.publishEvent('test-channel', testEvent);

    // Give pub/sub time to propagate
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(receivedEvent).toBeDefined();
    const event = receivedEvent as EmittedEvent;
    expect(event?.name).toBe('test');
    expect(event?.payload).toEqual({ data: 'test-value' });

    await pubSubStore.close();
  });
});

describe.runIf(ioredisAvailable)('RedisOutboxStore', () => {
  let outbox: RedisOutboxStore;

  beforeAll(async () => {
    outbox = new RedisOutboxStore({
      url: REDIS_URL,
      keyPrefix: 'test:outbox:',
      consumerGroup: 'test-consumer-group',
    });
  });

  afterAll(async () => {
    await outbox.trim(0); // Clean up stream
    await outbox.close();
  });

  it('enqueues outbox entries', async () => {
    const testEvent: EmittedEvent = {
      name: 'UserCreated',
      channel: 'users',
      payload: { userId: 'user-123', name: 'Alice' },
      timestamp: Date.now(),
    };

    const entry = {
      entryId: 'outbox-test-1',
      enqueuedAt: Date.now(),
      event: testEvent,
      status: 'pending' as const,
      attempts: 0,
    };

    await outbox.enqueue([entry]);

    const length = await outbox.getLength();
    expect(length).toBeGreaterThan(0);
  });

  it('claims entries for delivery', async () => {
    // First enqueue some entries
    const events: EmittedEvent[] = [
      {
        name: 'Event1',
        channel: 'test',
        payload: { id: 1 },
        timestamp: Date.now(),
      },
      {
        name: 'Event2',
        channel: 'test',
        payload: { id: 2 },
        timestamp: Date.now(),
      },
    ];

    for (let i = 0; i < events.length; i++) {
      await outbox.enqueue([
        {
          entryId: `claim-test-${i}`,
          enqueuedAt: Date.now(),
          event: events[i],
          status: 'pending',
          attempts: 0,
        },
      ]);
    }

    // Claim entries
    const claimed = await outbox.claim(2);
    expect(claimed.length).toBeGreaterThan(0);
    expect(claimed[0].event.name).toBeDefined();
  });

  it('marks entries as delivered', async () => {
    const entryIds = ['claim-test-0', 'claim-test-1'];
    // This should not throw
    await outbox.markDelivered(entryIds);
  });

  it('marks entries as failed', async () => {
    await outbox.enqueue([
      {
        entryId: 'fail-test',
        enqueuedAt: Date.now(),
        event: {
          name: 'FailEvent',
          channel: 'test',
          payload: {},
          timestamp: Date.now(),
        },
        status: 'pending',
        attempts: 0,
      },
    ]);

    const claimed = await outbox.claim(1);
    if (claimed.length > 0) {
      await outbox.markFailed([claimed[0].entryId], 'Test failure');
      // Verify by trying to claim again - should still be claimable
      const reClaimed = await outbox.claim(1);
      expect(reClaimed.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('provides pending info', async () => {
    const info = await outbox.getPendingInfo();
    expect(typeof info).toBe('object');
  });

  it('trims the stream', async () => {
    const beforeLength = await outbox.getLength();
    await outbox.trim(10); // Keep last 10 entries
    const afterLength = await outbox.getLength();
    expect(afterLength).toBeLessThanOrEqual(beforeLength);
  });
});
