/**
 * Mock-based unit tests for RedisOutboxStore.
 * Injects a fake ioredis client — no live Redis required.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RedisOutboxStore } from './redis';
import type { OutboxEntry } from '../outbox-store';
import type { EmittedEvent } from '../../runtime-engine';

function event(name: string): EmittedEvent {
  return { name, channel: name.toLowerCase(), payload: {}, timestamp: 0 };
}

function entry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    entryId: 'e1',
    enqueuedAt: 100,
    event: event('Default'),
    status: 'pending',
    attempts: 0,
    ...overrides,
  };
}

type Call = { method: string; args: unknown[] };

function makeFakeRedis() {
  const calls: Call[] = [];
  const state = new Map<string, Record<string, string>>();
  let claimPayload: [string, [string, string[]][]][] | null = null;

  const client = {
    async xgroup_create(...args: unknown[]) {
      calls.push({ method: 'xgroup_create', args });
    },
    async xadd(...args: unknown[]) {
      calls.push({ method: 'xadd', args });
      return '1-0';
    },
    async xreadgroup(...args: unknown[]) {
      calls.push({ method: 'xreadgroup', args });
      return claimPayload;
    },
    async hset(key: string, ...flat: string[]) {
      calls.push({ method: 'hset', args: [key, ...flat] });
      const row = state.get(key) ?? {};
      for (let i = 0; i + 1 < flat.length; i += 2) {
        row[flat[i]] = flat[i + 1];
      }
      state.set(key, row);
    },
    async hgetall(key: string) {
      calls.push({ method: 'hgetall', args: [key] });
      return state.get(key) ?? {};
    },
    async del(key: string) {
      calls.push({ method: 'del', args: [key] });
      state.delete(key);
    },
    async xack(...args: unknown[]) {
      calls.push({ method: 'xack', args });
      return 1;
    },
    async quit() {
      calls.push({ method: 'quit', args: [] });
    },
  };

  return {
    client,
    calls,
    setClaim(messages: [string, string[]][]) {
      claimPayload = [['manifest:outbox:entries', messages]];
    },
    clearClaim() {
      claimPayload = null;
    },
  };
}

describe('RedisOutboxStore — injected client', () => {
  let fake: ReturnType<typeof makeFakeRedis>;
  let store: RedisOutboxStore;

  beforeEach(() => {
    fake = makeFakeRedis();
    store = new RedisOutboxStore(
      { client: fake.client },
      { generateId: () => 'gen-1', now: () => 1000 },
    );
  });

  it('ensures the consumer group on first use', async () => {
    await store.enqueue([]);
    expect(fake.calls.some((c) => c.method === 'xgroup_create')).toBe(true);
  });

  it('enqueues with flattened XADD field pairs', async () => {
    await store.enqueue([entry({ entryId: 'a', event: event('Created') })]);
    const xadd = fake.calls.find((c) => c.method === 'xadd');
    expect(xadd?.args[0]).toBe('manifest:outbox:entries');
    expect(xadd?.args[1]).toBe('*');
    expect(xadd?.args).toContain('entryId');
    expect(xadd?.args).toContain('a');
    expect(xadd?.args).toContain(JSON.stringify(event('Created')));
  });

  it('claims via XREADGROUP and persists stream id for XACK', async () => {
    fake.setClaim([
      [
        '1526984818111-0',
        [
          'entryId',
          'a',
          'enqueuedAt',
          '100',
          'event',
          JSON.stringify(event('A')),
          'status',
          'pending',
          'attempts',
          '0',
        ],
      ],
    ]);

    const claimed = await store.claim(1);
    expect(claimed).toHaveLength(1);
    expect(claimed[0].entryId).toBe('a');
    expect(claimed[0].attempts).toBe(1);

    const hset = fake.calls.find((c) => c.method === 'hset');
    expect(hset?.args).toContain('_streamId');
    expect(hset?.args).toContain('1526984818111-0');

    await store.markDelivered(['a']);
    const xack = fake.calls.find((c) => c.method === 'xack');
    expect(xack?.args).toContain('1526984818111-0');
  });

  it('returns [] for non-positive batchSize', async () => {
    expect(await store.claim(0)).toEqual([]);
    expect(await store.claim(-1)).toEqual([]);
  });

  it('records failure status in the side hash', async () => {
    await store.markFailed(['a'], 'boom');
    const hset = fake.calls.find((c) => c.method === 'hset');
    expect(hset?.args).toContain('failed');
    expect(hset?.args).toContain('boom');
  });
});
