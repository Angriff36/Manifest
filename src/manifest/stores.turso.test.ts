/**
 * Tests for TursoStore.
 *
 * These tests use a mock LibSQL client to verify the store's behavior
 * without requiring a real Turso/LibSQL instance.
 *
 * For live integration testing with an actual Turso database, set the
 * TURSO_URL and TURSO_AUTH_TOKEN environment variables and use the
 * `*.live.test.ts` pattern.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TursoStore, generateTursoSchema, type EntityInstance } from './stores.node';

// ---------------------------------------------------------------------------
// Mock @libsql/client
// ---------------------------------------------------------------------------

const { mockState, createClient } = vi.hoisted(() => {
  const mockData = new Map<string, string>();

  const execute = vi.fn(async (sqlOrOpts: string | { sql: string; args?: unknown[] }) => {
    const sql = typeof sqlOrOpts === 'string' ? sqlOrOpts : sqlOrOpts.sql;
    const args = typeof sqlOrOpts === 'string' ? [] : (sqlOrOpts.args ?? []);
    const upper = sql.toUpperCase().trim();

    if (upper.startsWith('CREATE TABLE') || upper.startsWith('CREATE INDEX')) {
      return { rows: [], rowsAffected: 0 };
    }

    if (upper.startsWith('SELECT') && upper.includes('ORDER BY')) {
      const rows: { data: string }[] = [];
      for (const value of mockData.values()) {
        rows.push({ data: value });
      }
      return { rows, rowsAffected: rows.length };
    }

    if (upper.startsWith('SELECT') && upper.includes('WHERE ID')) {
      const id = args[0] as string;
      const data = mockData.get(id);
      if (!data) return { rows: [], rowsAffected: 0 };
      return { rows: [{ data }], rowsAffected: 1 };
    }

    if (upper.startsWith('INSERT INTO')) {
      const id = args[0] as string;
      const data = args[1] as string;
      const existed = mockData.has(id);
      mockData.set(id, data);
      return { rows: [], rowsAffected: existed ? 2 : 1 };
    }

    if (upper.startsWith('UPDATE')) {
      const data = args[0] as string;
      const id = args[1] as string;
      if (!mockData.has(id)) {
        return { rows: [], rowsAffected: 0 };
      }
      mockData.set(id, data);
      return { rows: [], rowsAffected: 1 };
    }

    if (upper.startsWith('DELETE FROM') && upper.includes('WHERE ID')) {
      const id = args[0] as string;
      const deleted = mockData.delete(id);
      return { rows: [], rowsAffected: deleted ? 1 : 0 };
    }

    if (upper.startsWith('DELETE FROM')) {
      const count = mockData.size;
      mockData.clear();
      return { rows: [], rowsAffected: count };
    }

    return { rows: [], rowsAffected: 0 };
  });

  const transaction = vi.fn();
  const sync = vi.fn(async () => {});
  const close = vi.fn(async () => {});

  const mockState = { mockData, execute, transaction, sync, close };

  function createClient(_opts: unknown) {
    return mockState;
  }

  return { mockState, createClient };
});

vi.mock('@libsql/client', () => ({
  createClient,
}));

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

interface TestEntity extends EntityInstance {
  id: string;
  name: string;
  value?: number;
  tags?: string[];
}

let store: TursoStore<TestEntity>;

beforeEach(async () => {
  mockState.mockData.clear();
  mockState.execute.mockClear();
  mockState.transaction.mockReset();
  mockState.sync.mockClear();
  mockState.close.mockClear();
  store = new TursoStore<TestEntity>({
    url: 'file:./test.db',
    tableName: 'test_entities',
    client: createClient({ url: 'file:./test.db' }),
  });
});

afterEach(async () => {
  if (store) {
    await store.close();
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TursoStore', () => {
  describe('generateTursoSchema', () => {
    it('generates valid SQL DDL with default table name', () => {
      const sql = generateTursoSchema();
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS "entities"');
      expect(sql).toContain('id TEXT PRIMARY KEY');
      expect(sql).toContain('data TEXT NOT NULL');
      expect(sql).toContain('CREATE INDEX IF NOT EXISTS "idx_entities_data"');
    });

    it('generates SQL DDL with custom table name', () => {
      const sql = generateTursoSchema('my_table');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS "my_table"');
      expect(sql).toContain('CREATE INDEX IF NOT EXISTS "idx_my_table_data"');
    });

    it('uses SQLite-compatible timestamp functions', () => {
      const sql = generateTursoSchema();
      expect(sql).toContain("strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
    });
  });

  describe('initialization', () => {
    it('creates the entity table on first operation', async () => {
      await store.create({ name: 'test' });
      const createCalls = mockState.execute.mock.calls.filter((call) => {
        const arg = call[0];
        const sql = typeof arg === 'string' ? arg : (arg as { sql: string }).sql;
        return /CREATE\s+(TABLE|INDEX)/i.test(sql);
      });
      expect(createCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('does not re-create the table on subsequent operations', async () => {
      await store.create({ name: 'first' });
      await store.create({ name: 'second' });
      const createCalls = mockState.execute.mock.calls.filter((call) => {
        const arg = call[0];
        const sql = typeof arg === 'string' ? arg : (arg as { sql: string }).sql;
        return /CREATE\s+(TABLE|INDEX)/i.test(sql);
      });
      expect(createCalls.length).toBe(2);
    });
  });

  describe('create', () => {
    it('creates an entity with auto-generated id', async () => {
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

    it('upserts (creates or updates) on conflict', async () => {
      await store.create({ id: 'upsert-test', name: 'original' });
      const result = await store.create({ id: 'upsert-test', name: 'updated' });
      expect(result.name).toBe('updated');
    });
  });

  describe('getById', () => {
    it('retrieves an existing entity', async () => {
      await store.create({ id: 'get-test', name: 'find-me' });
      const entity = await store.getById('get-test');
      expect(entity).toBeDefined();
      expect(entity?.name).toBe('find-me');
    });

    it('returns undefined for non-existent entity', async () => {
      const entity = await store.getById('does-not-exist');
      expect(entity).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('returns all entities', async () => {
      await store.create({ id: 'all-1', name: 'first' });
      await store.create({ id: 'all-2', name: 'second' });
      await store.create({ id: 'all-3', name: 'third' });

      const all = await store.getAll();
      expect(all).toHaveLength(3);
    });

    it('returns empty array when no entities exist', async () => {
      const all = await store.getAll();
      expect(all).toEqual([]);
    });
  });

  describe('update', () => {
    it('updates an existing entity', async () => {
      await store.create({ id: 'update-test', name: 'original', value: 1 });
      const updated = await store.update('update-test', { value: 99 });
      expect(updated).toBeDefined();
      expect(updated?.name).toBe('original');
      expect(updated?.value).toBe(99);
    });

    it('returns undefined for non-existent entity', async () => {
      const result = await store.update('non-existent', { value: 123 });
      expect(result).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('deletes an existing entity', async () => {
      await store.create({ id: 'delete-test', name: 'delete-me' });
      const deleted = await store.delete('delete-test');
      expect(deleted).toBe(true);
      const found = await store.getById('delete-test');
      expect(found).toBeUndefined();
    });

    it('returns false for non-existent entity', async () => {
      const deleted = await store.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('clear', () => {
    it('removes all entities', async () => {
      await store.create({ id: 'clear-1', name: 'to-clear' });
      await store.create({ id: 'clear-2', name: 'also-clear' });
      await store.clear();
      const all = await store.getAll();
      expect(all).toHaveLength(0);
    });
  });

  describe('transaction', () => {
    it('commits on successful callback', async () => {
      const captureClient = {
        commit: vi.fn(async () => {}),
        rollback: vi.fn(async () => {}),
      };
      mockState.transaction.mockResolvedValue(captureClient);

      const result = await store.transaction(async (_tx) => {
        return 'success';
      });
      expect(result).toBe('success');
      expect(captureClient.commit).toHaveBeenCalled();
      expect(captureClient.rollback).not.toHaveBeenCalled();
    });

    it('rolls back on callback error', async () => {
      const captureClient = {
        commit: vi.fn(async () => {}),
        rollback: vi.fn(async () => {}),
      };
      mockState.transaction.mockResolvedValue(captureClient);

      await expect(
        store.transaction(async (_tx) => {
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');
      expect(captureClient.commit).not.toHaveBeenCalled();
      expect(captureClient.rollback).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('closes the client connection', async () => {
      await store.create({ name: 'test' });
      await store.close();
      expect(mockState.close).toHaveBeenCalled();
    });
  });
});
