import { describe, it, expect, vi } from 'vitest';
import { GenericPrismaStore } from './store.js';
import type { PrismaModelMetadata } from './types.js';

const metadata: PrismaModelMetadata = {
  Widget: {
    accessor: 'widget',
    dbName: null,
    pgSchema: null,
    pkFields: ['id'],
    whereAccessor: 'id',
    hasDeletedAt: false,
    fields: [
      {
        name: 'id',
        irName: 'id',
        type: 'String',
        isEnum: false,
        isList: false,
        optional: false,
        hasDefault: false,
        isUpdatedAt: false,
        isId: true,
      },
      {
        name: 'name',
        irName: 'name',
        type: 'String',
        isEnum: false,
        isList: false,
        optional: false,
        hasDefault: false,
        isUpdatedAt: false,
        isId: false,
      },
      {
        name: 'tenantId',
        irName: 'tenantId',
        type: 'String',
        isEnum: false,
        isList: false,
        optional: false,
        hasDefault: false,
        isUpdatedAt: false,
        isId: false,
      },
    ],
  },
};

function mockDelegate() {
  return {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data),
    update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
}

describe('GenericPrismaStore', () => {
  it('creates rows with tenantId injected and maps IR field names', async () => {
    const delegate = mockDelegate();
    const prisma = { widget: delegate };
    const store = new GenericPrismaStore(prisma, 'Widget', 'tenant-1', metadata);

    const created = await store.create({ name: 'Alpha' });
    expect(created.name).toBe('Alpha');
    expect(created.id).toBeTruthy();

    const createArgs = delegate.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(createArgs.data.tenantId).toBe('tenant-1');
    expect(createArgs.data.name).toBe('Alpha');
  });

  it('throws when metadata or delegate is missing', () => {
    expect(() => new GenericPrismaStore({}, 'Missing', 't1', metadata)).toThrow(/no Prisma metadata/);
    expect(() => new GenericPrismaStore({ widget: {} }, 'Widget', 't1', metadata)).toThrow(/no delegate/);
  });
});

describe('GenericPrismaStore tenant column resolution', () => {
  // Models where tenant is the SOLE FK-bearing relation expose `tenant` as a
  // relation in Prisma's checked create input and REJECT scalar tenantId
  // ("Unknown argument tenantId"). requiresTenantConnect flips create() to
  // relation-connect form; everything else keeps flat scalar writes.
  it('uses tenant connect (not scalar tenantId) when requiresTenantConnect is set', async () => {
    const meta: PrismaModelMetadata = {
      Widget: {
        ...metadata.Widget,
        requiresTenantConnect: true,
      },
    };
    const delegate = mockDelegate();
    const store = new GenericPrismaStore({ widget: delegate }, 'Widget', 'tenant-1', meta);

    await store.create({ name: 'Alpha' });

    const createArgs = delegate.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(createArgs.data.tenant).toEqual({ connect: { id: 'tenant-1' } });
    expect(createArgs.data.tenantId).toBeUndefined();
  });

  // Physical snake_case columns (tenant_id / deleted_at) previously got a
  // phantom camelCase `tenantId`/`deletedAt` key in writes and filters, which
  // Prisma rejects ("Unknown argument"). The store must resolve the actual
  // column name from field metadata instead of assuming camelCase.
  it('resolves snake_case tenant_id and deleted_at columns from field metadata', async () => {
    const meta: PrismaModelMetadata = {
      Widget: {
        accessor: 'widget',
        dbName: null,
        pgSchema: null,
        pkFields: ['id'],
        whereAccessor: 'id',
        hasDeletedAt: true,
        fields: [
          { name: 'id', irName: 'id', type: 'String', isEnum: false, isList: false, optional: false, hasDefault: false, isUpdatedAt: false, isId: true },
          { name: 'name', irName: 'name', type: 'String', isEnum: false, isList: false, optional: false, hasDefault: false, isUpdatedAt: false, isId: false },
          { name: 'tenant_id', irName: 'tenantId', type: 'String', isEnum: false, isList: false, optional: false, hasDefault: false, isUpdatedAt: false, isId: false },
          { name: 'deleted_at', irName: 'deletedAt', type: 'DateTime', isEnum: false, isList: false, optional: true, hasDefault: false, isUpdatedAt: false, isId: false },
        ],
      },
    };
    const delegate = mockDelegate();
    const store = new GenericPrismaStore({ widget: delegate }, 'Widget', 'tenant-1', meta);

    await store.create({ name: 'Alpha' });
    const createArgs = delegate.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(createArgs.data.tenant_id).toBe('tenant-1');
    expect(createArgs.data.tenantId).toBeUndefined();

    await store.getAll();
    const findArgs = delegate.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(findArgs.where.tenant_id).toBe('tenant-1');
    expect(findArgs.where.deleted_at).toBeNull();
    expect(findArgs.where.tenantId).toBeUndefined();
    expect(findArgs.where.deletedAt).toBeUndefined();

    await store.clear();
    const delArgs = delegate.deleteMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(delArgs.where.tenant_id).toBe('tenant-1');
  });

  // Soft-delete previously hardcoded `data: { deletedAt: new Date() }`, ignoring
  // the resolved physical column. With a remapped deleted_at column that wrote to
  // the wrong (nonexistent) field — a silent soft-delete failure. delete() must
  // resolve the column from field metadata, exactly like tenantFilter() does.
  it('soft-deletes using the resolved deleted_at column, not a hardcoded deletedAt', async () => {
    const meta: PrismaModelMetadata = {
      Widget: {
        accessor: 'widget',
        dbName: null,
        pgSchema: null,
        pkFields: ['id'],
        whereAccessor: 'id',
        hasDeletedAt: true,
        fields: [
          { name: 'id', irName: 'id', type: 'String', isEnum: false, isList: false, optional: false, hasDefault: false, isUpdatedAt: false, isId: true },
          { name: 'name', irName: 'name', type: 'String', isEnum: false, isList: false, optional: false, hasDefault: false, isUpdatedAt: false, isId: false },
          { name: 'deleted_at', irName: 'deletedAt', type: 'DateTime', isEnum: false, isList: false, optional: true, hasDefault: false, isUpdatedAt: false, isId: false },
        ],
      },
    };
    const delegate = mockDelegate();
    const store = new GenericPrismaStore({ widget: delegate }, 'Widget', 'tenant-1', meta);

    const ok = await store.delete('w1');
    expect(ok).toBe(true);

    const updateArgs = delegate.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(updateArgs.data.deleted_at).toBeInstanceOf(Date);
    expect(updateArgs.data.deletedAt).toBeUndefined();
  });

  // Status-based soft-delete (D27): some entities mark deletion by transitioning
  // a status column (e.g. status = 'deleted') rather than stamping a deletedAt
  // timestamp. With softDeleteStatus configured, delete() sets the status value
  // and reads exclude rows already at that status.
  describe('status-based soft-delete', () => {
    function statusMeta(): PrismaModelMetadata {
      return {
        Widget: {
          accessor: 'widget',
          dbName: null,
          pgSchema: null,
          pkFields: ['id'],
          whereAccessor: 'id',
          hasDeletedAt: false,
          softDeleteStatus: { column: 'status', deletedValue: 'deleted' },
          fields: [
            { name: 'id', irName: 'id', type: 'String', isEnum: false, isList: false, optional: false, hasDefault: false, isUpdatedAt: false, isId: true },
            { name: 'status', irName: 'status', type: 'String', isEnum: false, isList: false, optional: false, hasDefault: true, isUpdatedAt: false, isId: false },
            { name: 'tenantId', irName: 'tenantId', type: 'String', isEnum: false, isList: false, optional: false, hasDefault: false, isUpdatedAt: false, isId: false },
          ],
        },
      };
    }

    it('soft-deletes by setting the status column to the deleted value (no hard delete)', async () => {
      const delegate = mockDelegate();
      const store = new GenericPrismaStore({ widget: delegate }, 'Widget', 'tenant-1', statusMeta());

      const ok = await store.delete('w1');
      expect(ok).toBe(true);

      // Updates status, never calls deleteMany.
      const updateArgs = delegate.update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(updateArgs.data.status).toBe('deleted');
      expect(delegate.deleteMany).not.toHaveBeenCalled();
    });

    it('excludes status-deleted rows from getAll and getById reads', async () => {
      const delegate = mockDelegate();
      const store = new GenericPrismaStore({ widget: delegate }, 'Widget', 'tenant-1', statusMeta());

      await store.getAll();
      const findManyArgs = delegate.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(findManyArgs.where.status).toEqual({ not: 'deleted' });

      await store.getById('w1');
      const findFirstArgs = delegate.findFirst.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(findFirstArgs.where.status).toEqual({ not: 'deleted' });
    });
  });
});
