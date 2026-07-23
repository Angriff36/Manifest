/**
 * Mock-based unit tests for MongoDBOutboxStore.
 * Injects a fake collection — no live MongoDB required.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MongoDBOutboxStore } from './mongodb';
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

function makeFakeCollection() {
  const calls: Call[] = [];
  const pending: Record<string, unknown>[] = [];

  const collection = {
    async insertMany(docs: Record<string, unknown>[], options?: unknown) {
      calls.push({ method: 'insertMany', args: [docs, options] });
      pending.push(...docs);
    },
    async findOneAndUpdate(
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
      options?: unknown,
    ) {
      calls.push({ method: 'findOneAndUpdate', args: [filter, update, options] });
      const idx = pending.findIndex((d) => d.status === 'pending' && d.claimed === false);
      if (idx < 0) return null;
      const doc = pending[idx];
      const set = (update.$set ?? {}) as Record<string, unknown>;
      const inc = (update.$inc ?? {}) as Record<string, number>;
      Object.assign(doc, set);
      for (const [k, v] of Object.entries(inc)) {
        doc[k] = Number(doc[k] ?? 0) + v;
      }
      return { ...doc };
    },
    async updateMany(filter: Record<string, unknown>, update: Record<string, unknown>) {
      calls.push({ method: 'updateMany', args: [filter, update] });
      const ids = (filter.entryId as { $in: string[] }).$in;
      const set = (update.$set ?? {}) as Record<string, unknown>;
      for (const doc of pending) {
        if (ids.includes(String(doc.entryId))) Object.assign(doc, set);
      }
    },
  };

  return { collection, calls, pending };
}

describe('MongoDBOutboxStore — injected collection', () => {
  let fake: ReturnType<typeof makeFakeCollection>;
  let store: MongoDBOutboxStore;

  beforeEach(() => {
    fake = makeFakeCollection();
    store = new MongoDBOutboxStore(
      { collection: fake.collection },
      { generateId: () => 'gen-1', now: () => 1000 },
    );
  });

  it('insertMany with generated defaults', async () => {
    await store.enqueue([entry({ entryId: 'a', event: event('Created') })]);
    expect(fake.calls[0].method).toBe('insertMany');
    const docs = fake.calls[0].args[0] as Record<string, unknown>[];
    expect(docs[0]).toMatchObject({
      entryId: 'a',
      status: 'pending',
      claimed: false,
      attempts: 0,
      enqueuedAt: 100,
    });
  });

  it('swallows duplicate-key errors (idempotent enqueue)', async () => {
    fake.collection.insertMany = async () => {
      const err = new Error('dup') as Error & { code: number };
      err.code = 11000;
      throw err;
    };
    await expect(store.enqueue([entry({ entryId: 'a' })])).resolves.toBeUndefined();
  });

  it('claims atomically via findOneAndUpdate', async () => {
    await store.enqueue([entry({ entryId: 'a' }), entry({ entryId: 'b' })]);
    const claimed = await store.claim(1);
    expect(claimed).toHaveLength(1);
    expect(claimed[0].entryId).toBe('a');
    expect(claimed[0].attempts).toBe(1);
    expect(fake.calls.some((c) => c.method === 'findOneAndUpdate')).toBe(true);
  });

  it('markDelivered / markFailed updateMany by entryId', async () => {
    await store.enqueue([entry({ entryId: 'a' })]);
    await store.markDelivered(['a']);
    await store.markFailed(['a'], 'timeout');
    const updates = fake.calls.filter((c) => c.method === 'updateMany');
    expect(updates).toHaveLength(2);
    expect((updates[0].args[1] as { $set: { status: string } }).$set.status).toBe('delivered');
    expect((updates[1].args[1] as { $set: { lastError: string } }).$set.lastError).toBe('timeout');
  });
});
