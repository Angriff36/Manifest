/**
 * Tests for the DynamoDBStore using a mock DocumentClient.
 *
 * These tests verify the store contract (getAll, getById, create, update,
 * delete, clear) using a fully in-memory mock of the DynamoDB
 * DocumentClient. This means the tests run without DynamoDB Local or AWS
 * credentials, while still exercising the real command-shape logic
 * (key construction, ConditionExpression handling, scan + batch delete).
 *
 * The mock is a Map-backed implementation that supports the
 * DocumentClient commands used by the store:
 *   - GetCommand, PutCommand, UpdateCommand, DeleteCommand
 *   - ScanCommand, BatchWriteCommand
 *   - ConditionExpression: 'attribute_not_exists(#pk)', 'attribute_exists(#pk)'
 *     (basic support)
 *   - ReturnValues: 'ALL_NEW'
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DynamoDBStore,
  buildDynamoDBKey,
  type DynamoDBConfig,
} from './stores.node';
import type { EntityInstance } from './stores.node';

interface TestEntity extends EntityInstance {
  id: string;
  name: string;
  value?: number;
  version?: number;
}

// ---------------------------------------------------------------------------
// In-memory mock of DynamoDB DocumentClient
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Item = Record<string, any>;

class MockDynamoDB {
  private items: Map<string, Item> = new Map();

  // ----- Command classes (mimic DocumentClient API) -----
  // Exposed as instance properties so `new this.client.PutCommand(...)` works.
  GetCommand = class {
    constructor(public input: { TableName: string; Key: Item }) {}
  };
  PutCommand = class {
    constructor(public input: {
      TableName: string;
      Item: Item;
      ConditionExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
    }) {}
  };
  UpdateCommand = class {
    constructor(public input: {
      TableName: string;
      Key: Item;
      UpdateExpression: string;
      ConditionExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: Record<string, unknown>;
      ReturnValues?: string;
    }) {}
  };
  DeleteCommand = class {
    constructor(public input: {
      TableName: string;
      Key: Item;
      ConditionExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
    }) {}
  };
  ScanCommand = class {
    constructor(public input: {
      TableName: string;
      FilterExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: Record<string, unknown>;
      ProjectionExpression?: string;
      Limit?: number;
    }) {}
  };
  BatchWriteCommand = class {
    constructor(public input: {
      RequestItems: Record<string, Array<{ DeleteRequest: { Key: Item } }>>;
    }) {}
  };
  TransactWriteCommand = class {
    constructor(public input: { TransactItems: unknown[] }) {}
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async send(command: any): Promise<any> {
    const Ctor = command.constructor.name;
    switch (Ctor) {
      case 'GetCommand':
        return this.handleGet(command.input);
      case 'PutCommand':
        return this.handlePut(command.input);
      case 'UpdateCommand':
        return this.handleUpdate(command.input);
      case 'DeleteCommand':
        return this.handleDelete(command.input);
      case 'ScanCommand':
        return this.handleScan(command.input);
      case 'BatchWriteCommand':
        return this.handleBatchWrite(command.input);
      default:
        throw new Error(`MockDynamoDB: unhandled command ${Ctor}`);
    }
  }

  private keyString(tableName: string, key: Item): string {
    // Extract only key attributes (pk, sk) for the storage key
    // The DynamoDB client may pass extra properties when BatchWriteCommand
    // forwards a full scanned item as a DeleteRequest Key.
    const keyAttrs: Item = {};
    if ('pk' in key) keyAttrs.pk = key.pk;
    if ('sk' in key) keyAttrs.sk = key.sk;
    return `${tableName}::${JSON.stringify(keyAttrs)}`;
  }

  private handleGet(input: { TableName: string; Key: Item }): { Item?: Item } {
    const k = this.keyString(input.TableName, input.Key);
    const item = this.items.get(k);
    return item ? { Item: { ...item } } : {};
  }

  private handlePut(input: {
    TableName: string;
    Item: Item;
    ConditionExpression?: string;
  }): Record<string, never> {
    const k = this.keyString(input.TableName, {
      pk: input.Item.pk,
      sk: input.Item.sk,
    });
    if (input.ConditionExpression === 'attribute_not_exists(#pk)') {
      if (this.items.has(k)) {
        const err = new Error('Conditional check failed');
        err.name = 'ConditionalCheckFailedException';
        throw err;
      }
    }
    this.items.set(k, { ...input.Item });
    return {};
  }

  private handleUpdate(input: {
    TableName: string;
    Key: Item;
    UpdateExpression: string;
    ConditionExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
    ReturnValues?: string;
  }): { Attributes?: Item } {
    const k = this.keyString(input.TableName, input.Key);
    const existing = this.items.get(k);
    if (input.ConditionExpression?.includes('attribute_exists')) {
      if (!existing) {
        const err = new Error('Conditional check failed');
        err.name = 'ConditionalCheckFailedException';
        throw err;
      }
    }
    if (!existing) {
      // Create new item with the key attributes
      const base: Item = { ...input.Key };
      this.items.set(k, base);
    }
    const target = this.items.get(k)!;
    // Parse simple SET expressions: "SET #f0 = :v0, #f1 = :v1"
    const setMatch = input.UpdateExpression.match(/SET\s+(.+)/i);
    if (setMatch) {
      const assignments = setMatch[1].split(',').map((s) => s.trim());
      for (const assignment of assignments) {
        const m = assignment.match(/(#\w+)\s*=\s*(:\w+)/);
        if (m && input.ExpressionAttributeNames && input.ExpressionAttributeValues) {
          const fieldName = input.ExpressionAttributeNames[m[1]];
          const value = input.ExpressionAttributeValues[m[2]];
          target[fieldName] = value;
        }
      }
    }
    this.items.set(k, target);
    if (input.ReturnValues === 'ALL_NEW') {
      return { Attributes: { ...target } };
    }
    return {};
  }

  private handleDelete(input: {
    TableName: string;
    Key: Item;
    ConditionExpression?: string;
  }): Record<string, never> {
    const k = this.keyString(input.TableName, input.Key);
    if (input.ConditionExpression?.includes('attribute_exists')) {
      if (!this.items.has(k)) {
        const err = new Error('Conditional check failed');
        err.name = 'ConditionalCheckFailedException';
        throw err;
      }
    }
    this.items.delete(k);
    return {};
  }

  private handleScan(input: { TableName: string; Limit?: number }): { Items: Item[] } {
    const items: Item[] = [];
    for (const [k, v] of this.items) {
      if (k.startsWith(input.TableName + '::')) {
        items.push({ ...v });
        if (input.Limit && items.length >= input.Limit) break;
      }
    }
    return { Items: items };
  }

  private handleBatchWrite(input: {
    RequestItems: Record<string, Array<{ DeleteRequest: { Key: Item } }>>;
  }): Record<string, never> {
    for (const [tableName, ops] of Object.entries(input.RequestItems)) {
      for (const op of ops) {
        const k = this.keyString(tableName, op.DeleteRequest.Key);
        this.items.delete(k);
      }
    }
    return {};
  }
}

describe('buildDynamoDBKey', () => {
  it('builds a simple partition key', () => {
    const key = buildDynamoDBKey(
      'abc123',
      { partitionKey: 'pk', entityPrefix: 'PRODUCT' },
      'Product'
    );
    expect(key).toEqual({ pk: 'PRODUCT#abc123' });
  });

  it('uses default partition key name', () => {
    const key = buildDynamoDBKey('xyz', {}, 'Order');
    expect(key).toEqual({ pk: 'ORDER#xyz' });
  });

  it('uses default entity prefix from entity name (uppercase)', () => {
    const key = buildDynamoDBKey('1', {}, 'user');
    expect(key).toEqual({ pk: 'USER#1' });
  });

  it('adds a sort key when configured', () => {
    const key = buildDynamoDBKey(
      '42',
      { partitionKey: 'pk', sortKey: 'sk', entityPrefix: 'ORDER' },
      'Order'
    );
    expect(key).toEqual({ pk: 'ORDER#42', sk: '42' });
  });
});

describe('DynamoDBStore', () => {
  let mock: MockDynamoDB;
  let store: DynamoDBStore<TestEntity>;

  beforeEach(() => {
    mock = new MockDynamoDB();
    store = new DynamoDBStore<TestEntity>(
      'Product',
      {
        tableName: 'Products',
        client: mock,
      },
      () => `gen-${Math.random().toString(36).slice(2, 10)}`
    );
  });

  afterEach(async () => {
    await store.close();
  });

  it('creates an entity with generated id', async () => {
    const entity = await store.create({ name: 'Widget', value: 10 });
    expect(entity.id).toBeDefined();
    expect(entity.name).toBe('Widget');
    expect(entity.value).toBe(10);
  });

  it('creates an entity with provided id', async () => {
    const entity = await store.create({ id: 'p1', name: 'Gadget' });
    expect(entity.id).toBe('p1');
    expect(entity.name).toBe('Gadget');
  });

  it('rejects duplicate id on create', async () => {
    await store.create({ id: 'dup', name: 'first' });
    await expect(store.create({ id: 'dup', name: 'second' })).rejects.toThrow();
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

  it('gets all entities', async () => {
    await store.create({ id: 'a', name: 'A' });
    await store.create({ id: 'b', name: 'B' });
    await store.create({ id: 'c', name: 'C' });
    const all = await store.getAll();
    expect(all).toHaveLength(3);
    const names = all.map((e) => e.name).sort();
    expect(names).toEqual(['A', 'B', 'C']);
  });

  it('updates an existing entity', async () => {
    await store.create({ id: 'upd', name: 'orig', value: 1 });
    const updated = await store.update('upd', { value: 99 });
    expect(updated).toBeDefined();
    expect(updated?.value).toBe(99);
    expect(updated?.name).toBe('orig');
  });

  it('returns undefined when updating non-existent entity', async () => {
    const result = await store.update('nope', { value: 1 });
    expect(result).toBeUndefined();
  });

  it('deletes an entity', async () => {
    await store.create({ id: 'del', name: 'to-delete' });
    const result = await store.delete('del');
    expect(result).toBe(true);
    const after = await store.getById('del');
    expect(after).toBeUndefined();
  });

  it('returns false when deleting non-existent entity', async () => {
    const result = await store.delete('missing');
    expect(result).toBe(false);
  });

  it('clears all entities', async () => {
    await store.create({ id: 'a', name: 'A' });
    await store.create({ id: 'b', name: 'B' });
    await store.clear();
    const all = await store.getAll();
    expect(all).toEqual([]);
  });
});

describe('DynamoDBStore - single-table design', () => {
  let mock: MockDynamoDB;
  let store: DynamoDBStore<TestEntity>;

  beforeEach(() => {
    mock = new MockDynamoDB();
    store = new DynamoDBStore<TestEntity>(
      'User',
      {
        tableName: 'main-table',
        partitionKey: 'pk',
        sortKey: 'sk',
        entityPrefix: 'USER',
        client: mock,
      },
      () => 'gen-id'
    );
  });

  afterEach(async () => {
    await store.close();
  });

  it('uses composite key with entity prefix', async () => {
    const entity = await store.create({ id: 'u1', name: 'Alice' });
    expect(entity.id).toBe('u1');
    // Verify the item was stored with the composite key
    const key = buildDynamoDBKey(
      'u1',
      { partitionKey: 'pk', sortKey: 'sk', entityPrefix: 'USER' },
      'User'
    );
    const result = await mock.send(
      new mock.GetCommand({ TableName: 'main-table', Key: key })
    );
    expect(result.Item).toBeDefined();
    expect(result.Item.pk).toBe('USER#u1');
    expect(result.Item.sk).toBe('u1');
    expect(result.Item.name).toBe('Alice');
  });
});

describe('DynamoDBStore - configuration', () => {
  it('uses default config values when none provided', () => {
    const mock = new MockDynamoDB();
    const store = new DynamoDBStore<TestEntity>(
      'Foo',
      { client: mock },
      () => 'id'
    );
    // Should not throw on construction
    expect(store).toBeInstanceOf(DynamoDBStore);
  });

  it('exposes DynamoDBConfig interface', () => {
    const cfg: DynamoDBConfig = {
      tableName: 'mytable',
      partitionKey: 'pk',
      sortKey: 'sk',
      entityPrefix: 'ENTITY',
      region: 'us-west-2',
    };
    expect(cfg.tableName).toBe('mytable');
  });
});
