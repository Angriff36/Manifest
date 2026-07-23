/**
 * Mock-based unit tests for SupabaseStore (entity JSON `data` column adapter).
 *
 * No live Supabase project required. Injects a chainable fake client via
 * `SupabaseConfig.client`. Missing `@supabase/supabase-js` path is covered
 * separately by construction without an injected client (optional peer).
 */

import { describe, expect, it, vi } from 'vitest';
import { SupabaseStore } from './stores.node';

type Call = { method: string; args: unknown[] };

/** Minimal thenable query builder matching the supabase-js chain used by SupabaseStore. */
function makeFakeClient(resolve: {
  data?: unknown;
  error?: { message: string; code?: string } | null;
}): { client: { from: (table: string) => unknown }; calls: Call[]; tables: string[] } {
  const calls: Call[] = [];
  const tables: string[] = [];

  const builder: Record<string, unknown> = {};
  const chain = (method: string) => {
    return (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  };

  builder.select = chain('select');
  builder.eq = chain('eq');
  builder.neq = chain('neq');
  builder.upsert = chain('upsert');
  builder.update = chain('update');
  builder.delete = chain('delete');
  builder.single = () => {
    calls.push({ method: 'single', args: [] });
    return Promise.resolve({ data: resolve.data ?? null, error: resolve.error ?? null });
  };

  // Terminal for chains that do not call `.single()` (getAll, delete, clear).
  builder.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve({ data: resolve.data ?? null, error: resolve.error ?? null }).then(
      onFulfilled,
      onRejected,
    );

  return {
    client: {
      from(table: string) {
        tables.push(table);
        calls.push({ method: 'from', args: [table] });
        return builder;
      },
    },
    calls,
    tables,
  };
}

describe('SupabaseStore — injected client', () => {
  it('getAll maps data column rows', async () => {
    const { client, tables } = makeFakeClient({
      data: [{ data: { id: 'a', name: 'one' } }, { data: { id: 'b', name: 'two' } }],
    });
    const store = new SupabaseStore(
      { url: 'https://example.supabase.co', key: 'k', tableName: 'widgets', client },
      () => 'x',
    );

    await expect(store.getAll()).resolves.toEqual([
      { id: 'a', name: 'one' },
      { id: 'b', name: 'two' },
    ]);
    expect(tables).toEqual(['widgets']);
  });

  it('getById returns row data; PGRST116 becomes undefined', async () => {
    const found = makeFakeClient({ data: { data: { id: 'w1', name: 'found' } } });
    const store = new SupabaseStore({ url: 'u', key: 'k', client: found.client }, () => 'x');
    await expect(store.getById('w1')).resolves.toEqual({ id: 'w1', name: 'found' });
    expect(
      found.calls.some((c) => c.method === 'eq' && c.args[0] === 'id' && c.args[1] === 'w1'),
    ).toBe(true);

    const missing = makeFakeClient({
      data: null,
      error: { message: 'not found', code: 'PGRST116' },
    });
    const emptyStore = new SupabaseStore({ url: 'u', key: 'k', client: missing.client }, () => 'x');
    await expect(emptyStore.getById('nope')).resolves.toBeUndefined();
  });

  it('create upserts with generateId when id omitted', async () => {
    const { client, calls } = makeFakeClient({
      data: { data: { id: 'gen-3', name: 'n' } },
    });
    const store = new SupabaseStore({ url: 'u', key: 'k', client }, () => 'gen-3');

    const row = await store.create({ name: 'n' });
    expect(row).toEqual({ id: 'gen-3', name: 'n' });
    const upsert = calls.find((c) => c.method === 'upsert');
    expect(upsert?.args[0]).toMatchObject({ id: 'gen-3' });
    expect(upsert?.args[1]).toEqual({ onConflict: 'id' });
  });

  it('update merges fields; missing id (PGRST116) returns undefined', async () => {
    let phase = 0;
    const calls: Call[] = [];
    const builder: Record<string, unknown> = {};
    const chain =
      (method: string) =>
      (...args: unknown[]) => {
        calls.push({ method, args });
        return builder;
      };
    builder.select = chain('select');
    builder.eq = chain('eq');
    builder.update = chain('update');
    builder.single = () => {
      calls.push({ method: 'single', args: [] });
      phase += 1;
      if (phase === 1) {
        return Promise.resolve({ data: { data: { id: 'w1', name: 'old', qty: 1 } }, error: null });
      }
      return Promise.resolve({
        data: { data: { id: 'w1', name: 'new', qty: 1 } },
        error: null,
      });
    };
    const client = {
      from() {
        return builder;
      },
    };
    const store = new SupabaseStore({ url: 'u', key: 'k', client }, () => 'x');
    await expect(store.update('w1', { name: 'new' })).resolves.toEqual({
      id: 'w1',
      name: 'new',
      qty: 1,
    });

    const missingBuilder: Record<string, unknown> = {};
    const mChain =
      (method: string) =>
      (...args: unknown[]) => {
        void method;
        void args;
        return missingBuilder;
      };
    missingBuilder.select = mChain('select');
    missingBuilder.eq = mChain('eq');
    missingBuilder.single = () =>
      Promise.resolve({ data: null, error: { message: 'gone', code: 'PGRST116' } });
    const missingStore = new SupabaseStore(
      { url: 'u', key: 'k', client: { from: () => missingBuilder } },
      () => 'x',
    );
    await expect(missingStore.update('nope', { name: 'x' })).resolves.toBeUndefined();
  });

  it('delete and clear call delete filters', async () => {
    const { client, calls } = makeFakeClient({ data: null, error: null });
    const store = new SupabaseStore(
      { url: 'u', key: 'k', tableName: 'widgets', client },
      () => 'x',
    );

    await expect(store.delete('w1')).resolves.toBe(true);
    expect(calls.some((c) => c.method === 'delete')).toBe(true);
    expect(calls.some((c) => c.method === 'eq' && c.args[1] === 'w1')).toBe(true);

    const clearClient = makeFakeClient({ data: null, error: null });
    const clearStore = new SupabaseStore(
      { url: 'u', key: 'k', tableName: 'widgets', client: clearClient.client },
      () => 'x',
    );
    await clearStore.clear();
    expect(clearClient.calls.some((c) => c.method === 'neq' && c.args[0] === 'id')).toBe(true);
  });

  it('throws a clear install hint when supabase-js is missing and no client injected', async () => {
    vi.resetModules();
    vi.doMock('@supabase/supabase-js', () => {
      throw new Error('Cannot find module');
    });

    // Dynamic import failure is caught inside init — re-import store class under mock.
    const { SupabaseStore: FreshStore } = await import('./stores.node');
    const store = new FreshStore({ url: 'https://example.supabase.co', key: 'k' }, () => 'x');
    await expect(store.getAll()).rejects.toThrow(/npm install @supabase\/supabase-js/);

    vi.doUnmock('@supabase/supabase-js');
    vi.resetModules();
  });
});
