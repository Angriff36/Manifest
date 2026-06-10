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
