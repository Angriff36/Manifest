import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryApprovalStore } from './memory';
import type { ApprovalRequestState } from '../../runtime-engine';

function state(overrides: Partial<ApprovalRequestState> = {}): ApprovalRequestState {
  return {
    entity: 'PurchaseOrder',
    instanceId: 'po-1',
    approvalName: 'submitApproval',
    command: 'submit',
    status: 'pending',
    requiredStages: ['manager'],
    grants: [],
    requestedAt: 1000,
    ...overrides,
  };
}

describe('MemoryApprovalStore', () => {
  let store: MemoryApprovalStore;

  beforeEach(() => {
    store = new MemoryApprovalStore();
  });

  it('returns undefined for an unknown key', async () => {
    expect(await store.load('missing')).toBeUndefined();
  });

  it('round-trips a saved request', async () => {
    await store.save('k1', state());
    const loaded = await store.load('k1');
    expect(loaded).toBeDefined();
    expect(loaded!.instanceId).toBe('po-1');
    expect(loaded!.status).toBe('pending');
  });

  it('save replaces an existing request under the same key', async () => {
    await store.save('k1', state({ status: 'pending' }));
    await store.save('k1', state({ status: 'granted' }));
    expect((await store.load('k1'))!.status).toBe('granted');
    expect(store.size()).toBe(1);
  });

  it('load returns a defensive copy — mutating it does not change stored state', async () => {
    await store.save('k1', state());
    const loaded = (await store.load('k1'))!;
    loaded.status = 'denied';
    loaded.grants.push({ stage: 'manager', by: 'x', at: 1 });
    const again = (await store.load('k1'))!;
    expect(again.status).toBe('pending');
    expect(again.grants).toHaveLength(0);
  });

  it('save stores a defensive copy — later mutation of the input does not leak', async () => {
    const input = state();
    await store.save('k1', input);
    input.status = 'granted';
    expect((await store.load('k1'))!.status).toBe('pending');
  });

  it('list returns every stored request', async () => {
    await store.save('k1', state({ instanceId: 'po-1' }));
    await store.save('k2', state({ instanceId: 'po-2' }));
    const all = await store.list();
    expect(all.map((s) => s.instanceId).sort()).toEqual(['po-1', 'po-2']);
  });

  describe('expire', () => {
    it('expires only pending requests past their expiresAt', async () => {
      await store.save('past', state({ instanceId: 'a', expiresAt: 500 }));
      await store.save('future', state({ instanceId: 'b', expiresAt: 5000 }));
      await store.save('none', state({ instanceId: 'c' })); // no expiresAt

      const expired = await store.expire(1000);
      expect(expired.map((s) => s.instanceId)).toEqual(['a']);
      expect((await store.load('past'))!.status).toBe('expired');
      expect((await store.load('future'))!.status).toBe('pending');
      expect((await store.load('none'))!.status).toBe('pending');
    });

    it('does not re-expire non-pending requests', async () => {
      await store.save('g', state({ status: 'granted', expiresAt: 1 }));
      const expired = await store.expire(1000);
      expect(expired).toHaveLength(0);
    });
  });

  it('clear drops all requests', async () => {
    await store.save('k1', state());
    store.clear();
    expect(store.size()).toBe(0);
    expect(await store.load('k1')).toBeUndefined();
  });
});
