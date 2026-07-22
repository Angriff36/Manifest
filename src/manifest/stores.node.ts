/**
 * Node.js-only storage adapters for PostgreSQL and Supabase.
 *
 * DO NOT import this file in browser code. It requires Node.js modules (pg).
 * For browser environments, use MemoryStore or LocalStorageStore from runtime-engine.ts.
 *
 * Supabase adapter is optional. '@supabase/supabase-js' is a peer dependency.
 * It is loaded via dynamic import only when SupabaseStore is instantiated.
 * If the package is not installed, a clear error is thrown at construction time.
 */

import { Pool, PoolClient, PoolConfig } from 'pg';

export interface EntityInstance {
  id: string;
  [key: string]: unknown;
}

export interface Store<T extends EntityInstance = EntityInstance> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | undefined>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T | undefined>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<void>;
}

// PostgreSQL configuration interface
export interface PostgresConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  connectionString?: string;
  tableName?: string;
  /**
   * Optional pre-built `pg` Pool. When set, host/port/database/user/password/
   * connectionString are ignored. Used by unit tests and advanced host wiring.
   */
  pool?: Pool;
}

export class PostgresStore<T extends EntityInstance> implements Store<T> {
  private pool: Pool;
  private tableName: string;
  private generateId: () => string;
  private initialized: boolean = false;

  /**
   * Quotes a PostgreSQL identifier to prevent SQL injection.
   * Wraps the identifier in double quotes and escapes any existing quotes.
   */
  private quoteIdentifier(identifier: string): string {
    // Quote the identifier and escape any embedded quotes
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  constructor(config: PostgresConfig, generateId?: () => string) {
    this.generateId = generateId || (() => crypto.randomUUID());
    this.tableName = config.tableName || 'entities';

    if (config.pool) {
      this.pool = config.pool;
      return;
    }

    const poolConfig: PoolConfig = config.connectionString
      ? { connectionString: config.connectionString }
      : {
          host: config.host || 'localhost',
          port: config.port || 5432,
          database: config.database || 'manifest',
          user: config.user || 'postgres',
          password: config.password || '',
        };

    this.pool = new Pool(poolConfig);
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    const client = await this.pool.connect();
    try {
      const quotedTable = this.quoteIdentifier(this.tableName);
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${quotedTable} (
          id TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_${this.tableName}_data_gin ON ${quotedTable} USING gin(data);
      `);
      this.initialized = true;
    } finally {
      client.release();
    }
  }

  private async withConnection<R>(callback: (client: PoolClient) => Promise<R>): Promise<R> {
    await this.ensureInitialized();
    const client = await this.pool.connect();
    try {
      return await callback(client);
    } finally {
      client.release();
    }
  }

  /**
   * Run `callback` against a query runner. When `tx` is a PoolClient bound to
   * an open transaction, the queries participate in that transaction so the
   * write commits atomically with the caller's other work; otherwise a
   * dedicated pooled connection is acquired and released (matching
   * withConnection). Table DDL is ensured on a separate connection either way
   * — schema creation is intentionally not part of the caller's transaction.
   */
  private async withRunner<R>(
    tx: unknown,
    callback: (runner: Pool | PoolClient) => Promise<R>,
  ): Promise<R> {
    if (tx !== undefined && tx !== null) {
      await this.ensureInitialized();
      return callback(tx as PoolClient);
    }
    return this.withConnection(callback);
  }

  async getAll(): Promise<T[]> {
    return this.withConnection(async (client) => {
      const quotedTable = this.quoteIdentifier(this.tableName);
      const result = await client.query(`SELECT data FROM ${quotedTable} ORDER BY created_at`);
      return result.rows.map((row) => row.data as T);
    });
  }

  async getById(id: string, tx?: unknown): Promise<T | undefined> {
    return this.withRunner(tx, async (client) => {
      const quotedTable = this.quoteIdentifier(this.tableName);
      const result = await client.query(`SELECT data FROM ${quotedTable} WHERE id = $1`, [id]);
      return result.rows.length > 0 ? (result.rows[0].data as T) : undefined;
    });
  }

  async create(data: Partial<T>, tx?: unknown): Promise<T> {
    const id = data.id || this.generateId();
    const item = { ...data, id } as T;

    return this.withRunner(tx, async (client) => {
      const quotedTable = this.quoteIdentifier(this.tableName);
      await client.query(
        `INSERT INTO ${quotedTable} (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()`,
        [id, JSON.stringify(item)],
      );
      return item;
    });
  }

  async update(id: string, data: Partial<T>, tx?: unknown): Promise<T | undefined> {
    return this.withRunner(tx, async (client) => {
      const quotedTable = this.quoteIdentifier(this.tableName);
      const selectResult = await client.query(`SELECT data FROM ${quotedTable} WHERE id = $1`, [
        id,
      ]);
      if (selectResult.rows.length === 0) return undefined;

      const existing = selectResult.rows[0].data as T;
      const updated = { ...existing, ...data, id };

      await client.query(`UPDATE ${quotedTable} SET data = $1, updated_at = NOW() WHERE id = $2`, [
        JSON.stringify(updated),
        id,
      ]);
      return updated;
    });
  }

  async delete(id: string, tx?: unknown): Promise<boolean> {
    return this.withRunner(tx, async (client) => {
      const quotedTable = this.quoteIdentifier(this.tableName);
      const result = await client.query(`DELETE FROM ${quotedTable} WHERE id = $1`, [id]);
      return (result.rowCount ?? 0) > 0;
    });
  }

  async clear(): Promise<void> {
    return this.withConnection(async (client) => {
      const quotedTable = this.quoteIdentifier(this.tableName);
      await client.query(`DELETE FROM ${quotedTable}`);
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// Supabase configuration interface
export interface SupabaseConfig {
  url: string;
  key: string;
  tableName?: string;
}

/**
 * Supabase-backed store adapter.
 *
 * '@supabase/supabase-js' is an optional peer dependency. It is loaded via
 * dynamic import at construction time. If the package is not installed, a
 * clear error is thrown instructing the user to install it.
 */
export class SupabaseStore<T extends EntityInstance> implements Store<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client!: any;
  private tableName: string;
  private generateId: () => string;
  private ready: Promise<void> | undefined;
  private readonly initConfig: SupabaseConfig;

  constructor(config: SupabaseConfig, generateId?: () => string) {
    this.generateId = generateId || (() => crypto.randomUUID());
    this.tableName = config.tableName || 'entities';
    this.initConfig = config;
    // Defer async supabase load until first use (Sonar S7059).
  }

  private async init(config: SupabaseConfig): Promise<void> {
    let createClient: (url: string, key: string) => unknown;
    try {
      const mod = await import('@supabase/supabase-js');
      createClient = mod.createClient;
    } catch {
      throw new Error(
        `SupabaseStore requires '@supabase/supabase-js' to be installed.\n` +
          `Run: npm install @supabase/supabase-js`,
      );
    }
    this.client = createClient(config.url, config.key);
  }

  private ensureReady(): Promise<void> {
    if (!this.ready) {
      this.ready = this.init(this.initConfig);
    }
    return this.ready;
  }

  async getAll(): Promise<T[]> {
    await this.ensureReady();
    const { data, error } = await this.client.from(this.tableName).select('data');
    if (error) throw new Error(`Supabase getAll failed: ${error.message}`);
    return (data ?? []).map((row: { data: T }) => row.data);
  }

  async getById(id: string): Promise<T | undefined> {
    await this.ensureReady();
    const { data, error } = await this.client
      .from(this.tableName)
      .select('data')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return undefined;
      throw new Error(`Supabase getById failed: ${error.message}`);
    }
    return data?.data as T;
  }

  async create(data: Partial<T>): Promise<T> {
    await this.ensureReady();
    const id = data.id || this.generateId();
    const item = { ...data, id } as T;

    const { data: result, error } = await this.client
      .from(this.tableName)
      .upsert({ id, data: item as unknown }, { onConflict: 'id' })
      .select('data')
      .single();

    if (error) throw new Error(`Supabase create failed: ${error.message}`);
    return (result?.data as T) ?? item;
  }

  async update(id: string, data: Partial<T>): Promise<T | undefined> {
    await this.ensureReady();
    const { data: existing, error: fetchError } = await this.client
      .from(this.tableName)
      .select('data')
      .eq('id', id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') return undefined;
      throw new Error(`Supabase update fetch failed: ${fetchError.message}`);
    }

    const merged = { ...(existing?.data as T), ...data, id };

    const { data: result, error: updateError } = await this.client
      .from(this.tableName)
      .update({ data: merged as unknown })
      .eq('id', id)
      .select('data')
      .single();

    if (updateError) throw new Error(`Supabase update failed: ${updateError.message}`);
    return result?.data as T;
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureReady();
    const { error } = await this.client.from(this.tableName).delete().eq('id', id);
    if (error) throw new Error(`Supabase delete failed: ${error.message}`);
    return true;
  }

  async clear(): Promise<void> {
    await this.ensureReady();
    const { error } = await this.client.from(this.tableName).delete().neq('id', null);
    if (error) throw new Error(`Supabase clear failed: ${error.message}`);
  }
}

// MongoDB configuration interface
export interface MongoDBConfig {
  connectionString: string;
  databaseName?: string;
  collectionName?: string;
}

/**
 * MongoDB-backed store adapter.
 *
 * 'mongodb' is an optional peer dependency. It is loaded via dynamic import
 * at construction time. If the package is not installed, a clear error is
 * thrown instructing the user to install it.
 *
 * Entities are stored as native BSON documents with `_id` mapped from the
 * entity's `id` field. Properties map directly to document fields (not
 * wrapped in a JSONB `data` column like the PostgreSQL adapter).
 *
 * Optimistic locking: when a document has a `version` field, update
 * operations use it as a filter condition. If the stored version doesn't
 * match, the update returns null and the method returns `undefined`,
 * consistent with the runtime engine's concurrency control.
 */
export class MongoDBStore<T extends EntityInstance> implements Store<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client!: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private collection!: any;
  private collectionName: string;
  private databaseName: string;
  private generateId: () => string;
  private ready: Promise<void> | undefined;
  private readonly initConfig: MongoDBConfig;

  constructor(config: MongoDBConfig, generateId?: () => string) {
    this.generateId = generateId || (() => crypto.randomUUID());
    this.collectionName = config.collectionName || 'entities';
    this.databaseName = config.databaseName || 'manifest';
    this.initConfig = config;
    // Defer async mongodb load until first use (Sonar S7059).
  }

  private async init(config: MongoDBConfig): Promise<void> {
    let MongoClient: unknown;
    try {
      // 'mongodb' is an optional peer dependency, resolved at runtime via dynamic import; its absence is handled by the catch below.
      const mod = await import('mongodb');
      MongoClient = mod.MongoClient;
    } catch {
      throw new Error(
        `MongoDBStore requires 'mongodb' to be installed.\n` + `Run: npm install mongodb`,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.client = new (MongoClient as any)(config.connectionString);
    await this.client.connect();
    const db = this.client.db(this.databaseName);
    this.collection = db.collection(this.collectionName);

    // Ensure index on id field for fast lookups
    await this.collection.createIndex({ id: 1 }, { unique: true });
  }

  private ensureReady(): Promise<void> {
    if (!this.ready) {
      this.ready = this.init(this.initConfig);
    }
    return this.ready;
  }

  async getAll(): Promise<T[]> {
    await this.ensureReady();
    const docs = await this.collection.find({}).toArray();
    return docs.map((doc: Record<string, unknown>) => this.docToEntity(doc));
  }

  async getById(id: string): Promise<T | undefined> {
    await this.ensureReady();
    const doc = await this.collection.findOne({ id });
    return doc ? this.docToEntity(doc) : undefined;
  }

  async create(data: Partial<T>): Promise<T> {
    await this.ensureReady();
    const id = data.id || this.generateId();
    const item = { ...data, id } as T;

    // Store as document, using entity id as both `id` field and for lookups
    const doc = { ...item };
    await this.collection.updateOne({ id }, { $set: doc }, { upsert: true });
    return item;
  }

  async update(id: string, data: Partial<T>): Promise<T | undefined> {
    await this.ensureReady();
    const existing = await this.collection.findOne({ id });
    if (!existing) return undefined;

    const merged = { ...this.docToEntity(existing), ...data, id };

    // Optimistic locking: if a version field is present in the update data,
    // include it as a filter condition to detect concurrent modifications.
    const filter: Record<string, unknown> = { id };
    if (typeof data.version === 'number' && typeof existing.version === 'number') {
      // The runtime engine handles version checking, but we add a guard here
      // for direct store usage. The version in `data` is the new version;
      // we check the existing version matches what was read.
      filter.version = existing.version;
    }

    const result = await this.collection.findOneAndUpdate(
      filter,
      { $set: merged },
      { returnDocument: 'after' },
    );

    if (!result) return undefined;
    return this.docToEntity(result);
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureReady();
    const result = await this.collection.deleteOne({ id });
    return (result.deletedCount ?? 0) > 0;
  }

  async clear(): Promise<void> {
    await this.ensureReady();
    await this.collection.deleteMany({});
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }

  /**
   * Convert a MongoDB document to an entity instance.
   * Strips the MongoDB `_id` field and preserves the entity `id`.
   */
  private docToEntity(doc: Record<string, unknown>): T {
    const { _id, ...rest } = doc;
    return rest as T;
  }
}

// ─── DynamoDB Store ──────────────────────────────────────────────────

/**
 * Configuration for DynamoDBStore.
 */
export interface DynamoDBConfig {
  /** DynamoDB table name. Default: 'entities' */
  tableName?: string;
  /** Partition key attribute name. Default: 'pk' */
  partitionKey?: string;
  /** Sort key attribute name. Default: 'sk' */
  sortKey?: string;
  /** Entity prefix for partition key. Default: entity name uppercased */
  entityPrefix?: string;
  /** AWS region */
  region?: string;
  /** Pre-initialized DynamoDB DocumentClient */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client?: any;
}

/**
 * Build a DynamoDB key from an entity ID and configuration.
 */
export function buildDynamoDBKey(
  id: string,
  config: Partial<DynamoDBConfig>,
  entityName: string,
): Record<string, string> {
  const pkName = config.partitionKey ?? 'pk';
  const prefix = config.entityPrefix ?? entityName.toUpperCase();
  const key: Record<string, string> = { [pkName]: `${prefix}#${id}` };
  if (config.sortKey) {
    key[config.sortKey] = id;
  }
  return key;
}

/**
 * DynamoDB-backed store adapter using single-table design pattern.
 *
 * Requires `@aws-sdk/lib-dynamodb` at runtime. Items are stored with
 * composite keys (pk/sk) for single-table design. The client is injected
 * via config so tests can use mocks.
 */
export class DynamoDBStore<T extends EntityInstance = EntityInstance> implements Store<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private tableName: string;
  private partitionKey: string;
  private sortKey: string | undefined;
  private entityPrefix: string;
  private generateId: () => string;

  constructor(
    private entityName: string,
    config: DynamoDBConfig,
    generateId?: () => string,
  ) {
    this.client = config.client;
    this.tableName = config.tableName ?? 'entities';
    this.partitionKey = config.partitionKey ?? 'pk';
    this.sortKey = config.sortKey;
    this.entityPrefix = config.entityPrefix ?? entityName.toUpperCase();
    this.generateId = generateId || (() => crypto.randomUUID());
  }

  private buildKey(id: string): Record<string, string> {
    return buildDynamoDBKey(
      id,
      {
        partitionKey: this.partitionKey,
        sortKey: this.sortKey,
        entityPrefix: this.entityPrefix,
      },
      this.entityName,
    );
  }

  private entityToItem(entity: T): Record<string, unknown> {
    const key = this.buildKey(entity.id);
    return { ...key, ...entity };
  }

  private itemToEntity(item: Record<string, unknown>): T {
    const { pk: _pk, sk: _sk, ...rest } = item;
    return rest as T;
  }

  async getAll(): Promise<T[]> {
    const command = new this.client.ScanCommand({
      TableName: this.tableName,
    });
    const result = await this.client.send(command);
    return (result.Items ?? []).map((item: Record<string, unknown>) => this.itemToEntity(item));
  }

  async getById(id: string): Promise<T | undefined> {
    const key = this.buildKey(id);
    const command = new this.client.GetCommand({
      TableName: this.tableName,
      Key: key,
    });
    const result = await this.client.send(command);
    return result.Item ? this.itemToEntity(result.Item) : undefined;
  }

  async create(data: Partial<T>): Promise<T> {
    const id = (data.id as string) || this.generateId();
    const entity = { ...data, id } as T;
    const item = this.entityToItem(entity);

    const command = new this.client.PutCommand({
      TableName: this.tableName,
      Item: item,
      ConditionExpression: 'attribute_not_exists(#pk)',
      ExpressionAttributeNames: { '#pk': this.partitionKey },
    });
    await this.client.send(command);
    return entity;
  }

  async update(id: string, data: Partial<T>): Promise<T | undefined> {
    const existing = await this.getById(id);
    if (!existing) return undefined;

    const updated = { ...existing, ...data, id } as T;
    const item = this.entityToItem(updated);

    const command = new this.client.PutCommand({
      TableName: this.tableName,
      Item: item,
    });
    await this.client.send(command);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const key = this.buildKey(id);
    try {
      const command = new this.client.DeleteCommand({
        TableName: this.tableName,
        Key: key,
        ConditionExpression: 'attribute_exists(#pk)',
        ExpressionAttributeNames: { '#pk': this.partitionKey },
      });
      await this.client.send(command);
      return true;
    } catch (err: unknown) {
      const e = err as { name?: string };
      if (e?.name === 'ConditionalCheckFailedException') return false;
      throw err;
    }
  }

  async clear(): Promise<void> {
    const scanCommand = new this.client.ScanCommand({
      TableName: this.tableName,
    });
    const result = await this.client.send(scanCommand);
    const items = result.Items ?? [];

    if (items.length === 0) return;

    const deleteRequests = items.map((item: Record<string, unknown>) => ({
      DeleteRequest: {
        Key: {
          [this.partitionKey]: item[this.partitionKey],
          ...(this.sortKey ? { [this.sortKey]: item[this.sortKey] } : {}),
        },
      },
    }));

    // BatchWrite supports up to 25 items
    for (let i = 0; i < deleteRequests.length; i += 25) {
      const batch = deleteRequests.slice(i, i + 25);
      const command = new this.client.BatchWriteCommand({
        RequestItems: { [this.tableName]: batch },
      });
      await this.client.send(command);
    }
  }

  async close(): Promise<void> {
    // DynamoDB client lifecycle is managed externally
  }
}

// ─── Redis Store ──────────────────────────────────────────────────────

/**
 * Configuration for RedisStore.
 */
export interface RedisConfig {
  /** Redis connection URL */
  url?: string;
  /** Key prefix for all stored entities */
  keyPrefix?: string;
  /** Default TTL in seconds (optional) */
  defaultTTL?: number;
}

/**
 * Redis-backed store adapter.
 *
 * Requires `ioredis` at runtime. Entities are stored as JSON strings
 * under keys like `{keyPrefix}{entityName}:{id}`.
 */
export class RedisStore<T extends EntityInstance = EntityInstance> implements Store<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private keyPrefix: string;
  private defaultTTL: number | undefined;
  private generateId: () => string;

  constructor(entityName: string, config: RedisConfig = {}, generateId?: () => string) {
    this.keyPrefix = config.keyPrefix ?? `${entityName.toLowerCase()}:`;
    this.defaultTTL = config.defaultTTL;
    this.generateId = generateId || (() => crypto.randomUUID());
    // ioredis is loaded lazily; for tests, the client is injected differently
    // This constructor expects to work with or without ioredis installed
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy optional native dep; sync constructor cannot use dynamic import
      const Redis = require('ioredis');
      this.client = new Redis(config.url || 'redis://localhost:6379');
    } catch {
      // ioredis not available; tests inject mocks
    }
  }

  private entityKey(id: string): string {
    return `${this.keyPrefix}${id}`;
  }

  async getAll(): Promise<T[]> {
    const keys = await this.client.keys(`${this.keyPrefix}*`);
    if (keys.length === 0) return [];
    const values = await this.client.mget(...keys);
    return values.filter((v: string | null) => v !== null).map((v: string) => JSON.parse(v));
  }

  async getById(id: string): Promise<T | undefined> {
    const data = await this.client.get(this.entityKey(id));
    return data ? JSON.parse(data) : undefined;
  }

  async create(data: Partial<T>): Promise<T> {
    const id = (data.id as string) || this.generateId();
    const entity = { ...data, id } as T;
    const key = this.entityKey(id);
    await this.client.set(key, JSON.stringify(entity));
    if (this.defaultTTL) {
      await this.client.expire(key, this.defaultTTL);
    }
    return entity;
  }

  async update(id: string, data: Partial<T>): Promise<T | undefined> {
    const existing = await this.getById(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data, id } as T;
    await this.client.set(this.entityKey(id), JSON.stringify(updated));
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.client.del(this.entityKey(id));
    return result > 0;
  }

  async clear(): Promise<void> {
    const keys = await this.client.keys(`${this.keyPrefix}*`);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  async close(): Promise<void> {
    if (this.client && typeof this.client.quit === 'function') {
      await this.client.quit();
    }
  }

  // TTL management helpers (used in tests)
  async getTTL(): Promise<number> {
    const keys = await this.client.keys(`${this.keyPrefix}*`);
    if (keys.length === 0) return -1;
    return this.client.ttl(keys[0]);
  }

  async setTTL(ttl: number | undefined): Promise<void> {
    const keys = await this.client.keys(`${this.keyPrefix}*`);
    for (const key of keys) {
      if (ttl === undefined) {
        await this.client.persist(key);
      } else {
        await this.client.expire(key, ttl);
      }
    }
  }

  // Pub/sub helpers for event publishing.
  //
  // These were a silent in-process stub: `subscribe` pushed callbacks into a
  // Map that nothing ever read (delivery never happened) and `publishEvent`
  // wrote to a Redis channel no one listened on. A stub that pretends to work
  // is worse than no method at all, so both now throw and point at the real
  // primitive. Nothing in this repo called them except the (Redis-gated)
  // integration test; realtime fan-out lives in RedisEventBus, which owns the
  // dedicated subscriber connection the old stub admitted it lacked.

  /**
   * @deprecated Removed no-op. Use `RedisEventBus` from
   * `@angriff36/manifest/events/redis` for realtime event fan-out.
   */
  async publishEvent(_channel: string, _event: unknown): Promise<void> {
    throw new Error(
      'RedisStore.publishEvent is not implemented — it was a no-op stub. ' +
        "Use RedisEventBus from '@angriff36/manifest/events/redis'.",
    );
  }

  /**
   * @deprecated Removed no-op — the old implementation silently dropped
   * callbacks (they were never invoked). Use `RedisEventBus` from
   * `@angriff36/manifest/events/redis` for realtime event fan-out.
   */
  async subscribe(_channel: string, _callback: (event: unknown) => void): Promise<void> {
    throw new Error(
      'RedisStore.subscribe is not implemented — it silently dropped callbacks. ' +
        "Use RedisEventBus from '@angriff36/manifest/events/redis'.",
    );
  }
}

// ─── Turso (LibSQL) Store ─────────────────────────────────────────────

/**
 * Configuration for TursoStore.
 */
export interface TursoConfig {
  /** Turso/LibSQL connection URL */
  url: string;
  /** Auth token (optional for local SQLite) */
  authToken?: string;
  /** Table name. Default: 'entities' */
  tableName?: string;
  /** Pre-initialized LibSQL client (for testing or custom setups) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client?: any;
}

/**
 * Generate SQL DDL for the Turso/LibSQL entity table.
 */
export function generateTursoSchema(tableName: string = 'entities'): string {
  return `
    CREATE TABLE IF NOT EXISTS "${tableName}" (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS "idx_${tableName}_data" ON "${tableName}" (data);
  `.trim();
}

/**
 * Turso/LibSQL-backed store adapter.
 *
 * Requires `@libsql/client` at runtime. Entities are stored as JSON in a
 * `data` column, similar to the PostgreSQL adapter.
 */
export class TursoStore<T extends EntityInstance = EntityInstance> implements Store<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private tableName: string;
  private generateId: () => string;
  private initialized = false;

  constructor(config: TursoConfig, generateId?: () => string) {
    this.generateId = generateId || (() => crypto.randomUUID());
    this.tableName = config.tableName || 'entities';
    // Use injected client if provided (for testing)
    if (config.client) {
      this.client = config.client;
    } else {
      // Client is created via @libsql/client dynamically
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy optional native dep; sync constructor cannot use dynamic import
        const libsql = require('@libsql/client');
        this.client = libsql.createClient({
          url: config.url,
          authToken: config.authToken,
        });
      } catch {
        // @libsql/client not available; tests use mocks via vi.mock
      }
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    const sql = generateTursoSchema(this.tableName);
    // Execute each statement separately (LibSQL client doesn't support multi-statement)
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await this.client.execute(stmt);
    }
    this.initialized = true;
  }

  async getAll(): Promise<T[]> {
    await this.ensureInitialized();
    const result = await this.client.execute({
      sql: `SELECT data FROM "${this.tableName}" ORDER BY created_at`,
    });
    return result.rows.map((row: { data: string }) => JSON.parse(row.data));
  }

  async getById(id: string): Promise<T | undefined> {
    await this.ensureInitialized();
    const result = await this.client.execute({
      sql: `SELECT data FROM "${this.tableName}" WHERE id = ?`,
      args: [id],
    });
    return result.rows.length > 0 ? JSON.parse(result.rows[0].data) : undefined;
  }

  async create(data: Partial<T>): Promise<T> {
    await this.ensureInitialized();
    const id = (data.id as string) || this.generateId();
    const entity = { ...data, id } as T;
    await this.client.execute({
      sql: `INSERT INTO "${this.tableName}" (id, data) VALUES (?, ?)
            ON CONFLICT (id) DO UPDATE SET data = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      args: [id, JSON.stringify(entity), JSON.stringify(entity)],
    });
    return entity;
  }

  async update(id: string, data: Partial<T>): Promise<T | undefined> {
    await this.ensureInitialized();
    const existing = await this.getById(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data, id } as T;
    await this.client.execute({
      sql: `UPDATE "${this.tableName}" SET data = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      args: [JSON.stringify(updated), id],
    });
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureInitialized();
    const result = await this.client.execute({
      sql: `DELETE FROM "${this.tableName}" WHERE id = ?`,
      args: [id],
    });
    return (result.rowsAffected ?? 0) > 0;
  }

  async clear(): Promise<void> {
    await this.ensureInitialized();
    await this.client.execute(`DELETE FROM "${this.tableName}"`);
  }

  async transaction<R>(callback: (tx: unknown) => Promise<R>): Promise<R> {
    const tx = await this.client.transaction();
    try {
      const result = await callback(tx);
      await tx.commit();
      return result;
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  async close(): Promise<void> {
    if (this.client && typeof this.client.close === 'function') {
      await this.client.close();
    }
  }
}
