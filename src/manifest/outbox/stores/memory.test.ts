import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryOutboxStore } from './memory';
import type { OutboxEntry } from '../outbox-store';
import type { EmittedEvent } from '../../runtime-engine';

function event(name: string, payload: Record<string, unknown> = {}): EmittedEvent {
  return {
    name,
    channel: name.toLowerCase(),
    payload,
    timestamp: 0,
  };
}

function entry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    entryId: 'e-default',
    enqueuedAt: 0,
    event: event('Default'),
    status: 'pending',
    attempts: 0,
    ...overrides,
  };
}

describe('MemoryOutboxStore', () => {
  let store: MemoryOutboxStore;

  beforeEach(() => {
    let n = 0;
    store = new MemoryOutboxStore({ generateId: () => `gen-${++n}`, now: () => 100 });
  });

  describe('enqueue', () => {
    it('appends entries in order', async () => {
      await store.enqueue([
        entry({ entryId: 'a' }),
        entry({ entryId: 'b' }),
      ]);
      const all = store.list();
      expect(all.map(e => e.entryId)).toEqual(['a', 'b']);
    });

    it('drops duplicate entryIds (idempotency)', async () => {
      await store.enqueue([entry({ entryId: 'a' })]);
      await store.enqueue([entry({ entryId: 'a', event: event('Different') })]);
      expect(store.size()).toBe(1);
      // First write wins.
      expect(store.list()[0].event.name).toBe('Default');
    });

    it('generates entryIds when missing', async () => {
      await store.enqueue([
        { entryId: undefined as unknown as string, enqueuedAt: 0, event: event('X'), status: 'pending', attempts: 0 },
      ]);
      const all = store.list();
      expect(all[0].entryId).toBe('gen-1');
    });

    it('ignores the tx argument silently (in-memory has no shared transaction)', async () => {
      await store.enqueue([entry({ entryId: 'a' })], { fakeTx: true });
      expect(store.size()).toBe(1);
    });
  });

  describe('claim', () => {
    beforeEach(async () => {
      await store.enqueue([
        entry({ entryId: 'a', event: event('A') }),
        entry({ entryId: 'b', event: event('B') }),
        entry({ entryId: 'c', event: event('C') }),
      ]);
    });

    it('returns pending entries in FIFO order up to batchSize', async () => {
      const claimed = await store.claim(2);
      expect(claimed.map(e => e.entryId)).toEqual(['a', 'b']);
    });

    it('never returns an entry already claimed by a concurrent caller', async () => {
      const first = await store.claim(2);
      const second = await store.claim(10);
      const overlap = first.filter(a => second.some(b => b.entryId === a.entryId));
      expect(overlap).toEqual([]);
      // Only the unclaimed remainder appears.
      expect(second.map(e => e.entryId)).toEqual(['c']);
    });

    it('increments attempts on claim', async () => {
      const claimed = await store.claim(1);
      expect(claimed[0].attempts).toBe(1);
      const internal = store.list().find(e => e.entryId === claimed[0].entryId);
      expect(internal?.attempts).toBe(1);
    });

    it('returns [] when batchSize is 0 or negative', async () => {
      expect(await store.claim(0)).toEqual([]);
      expect(await store.claim(-3)).toEqual([]);
    });

    it('does not return delivered entries', async () => {
      await store.markDelivered(['a']);
      const claimed = await store.claim(10);
      expect(claimed.map(e => e.entryId)).toEqual(['b', 'c']);
    });

    it('does not return failed entries', async () => {
      await store.markFailed(['a'], 'boom');
      const claimed = await store.claim(10);
      expect(claimed.map(e => e.entryId)).toEqual(['b', 'c']);
    });
  });

  describe('markDelivered', () => {
    it('sets status=delivered and releases the claim', async () => {
      await store.enqueue([entry({ entryId: 'a' })]);
      await store.claim(1);
      await store.markDelivered(['a']);
      const all = store.list();
      expect(all[0].status).toBe('delivered');
      // After delivery, a re-claim does not pick it up.
      expect(await store.claim(10)).toEqual([]);
    });

    it('is a no-op for unknown entryIds', async () => {
      await store.markDelivered(['missing']);
      expect(store.size()).toBe(0);
    });
  });

  describe('markFailed', () => {
    it('sets status=failed, records lastError, releases claim', async () => {
      await store.enqueue([entry({ entryId: 'a' })]);
      await store.claim(1);
      await store.markFailed(['a'], 'network timeout');
      const all = store.list();
      expect(all[0].status).toBe('failed');
      expect(all[0].lastError).toBe('network timeout');
    });

    it('allows a released failure to be re-claimed only if status flips back to pending (not auto)', async () => {
      await store.enqueue([entry({ entryId: 'a' })]);
      await store.claim(1);
      await store.markFailed(['a'], 'boom');
      // The contract does not require automatic retry of failed entries; caller decides.
      expect(await store.claim(10)).toEqual([]);
    });
  });

  describe('releaseClaim (test helper)', () => {
    it('allows a re-claim of a previously claimed but undelivered entry', async () => {
      await store.enqueue([entry({ entryId: 'a' })]);
      const first = await store.claim(1);
      expect(first.map(e => e.entryId)).toEqual(['a']);
      store.releaseClaim(['a']);
      const second = await store.claim(1);
      expect(second.map(e => e.entryId)).toEqual(['a']);
      // attempts increment on every claim
      expect(second[0].attempts).toBe(2);
    });
  });

  describe('clear', () => {
    it('drops all entries and resets idempotency tracking', async () => {
      await store.enqueue([entry({ entryId: 'a' })]);
      store.clear();
      expect(store.size()).toBe(0);
      // Previously-seen entryId is accepted again post-clear.
      await store.enqueue([entry({ entryId: 'a' })]);
      expect(store.size()).toBe(1);
    });
  });
});
