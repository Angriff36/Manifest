/**
 * Node.js-only storage adapters for PostgreSQL and Supabase.
 * 
 * DO NOT import this file in browser code. It requires Node.js modules (pg).
 * For browser environments, use MemoryStore or LocalStorageStore from runtime-engine.ts.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
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

  private async withConnection<R>(
    callback: (client: PoolClient) => Promise<R>
  ): Promise<R> {
    await this.ensureInitialized();
    const client = await this.pool.connect();
    try {
      return await callback(client);
    } finally {
      client.release();
    }
  }

  async getAll(): Promise<T[]> {
    return this.withConnection(async (client) => {
      const quotedTable = this.quoteIdentifier(this.tableName);
      const result = await client.query(`SELECT data FROM ${quotedTable} ORDER BY created_at`);
      return result.rows.map((row) => row.data as T);
    });
  }

  async getById(id: string): Promise<T | undefined> {
    return this.withConnection(async (client) => {
      const quotedTable = this.quoteIdentifier(this.tableName);
      const result = await client.query(`SELECT data FROM ${quotedTable} WHERE id = $1`, [id]);
      return result.rows.length > 0 ? (result.rows[0].data as T) : undefined;
    });
  }

  async create(data: Partial<T>): Promise<T> {
    const id = data.id || this.generateId();
    const item = { ...data, id } as T;

    return this.withConnection(async (client) => {
      const quotedTable = this.quoteIdentifier(this.tableName);
      await client.query(
        `INSERT INTO ${quotedTable} (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()`,
        [id, JSON.stringify(item)]
      );
      return item;
    });
  }

  async update(id: string, data: Partial<T>): Promise<T | undefined> {
    return this.withConnection(async (client) => {
      const quotedTable = this.quoteIdentifier(this.tableName);
      const selectResult = await client.query(`SELECT data FROM ${quotedTable} WHERE id = $1`, [id]);
      if (selectResult.rows.length === 0) return undefined;

      const existing = selectResult.rows[0].data as T;
      const updated = { ...existing, ...data, id };

      await client.query(
        `UPDATE ${quotedTable} SET data = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(updated), id]
      );
      return updated;
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.withConnection(async (client) => {
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

export class SupabaseStore<T extends EntityInstance> implements Store<T> {
  private client: SupabaseClient;
  private tableName: string;
  private generateId: () => string;

  constructor(config: SupabaseConfig, generateId?: () => string) {
    this.generateId = generateId || (() => crypto.randomUUID());
    this.tableName = config.tableName || 'entities';
    this.client = createClient(config.url, config.key);
  }

  async getAll(): Promise<T[]> {
    const { data, error } = await this.client.from(this.tableName).select('data');
    if (error) throw new Error(`Supabase getAll failed: ${error.message}`);
    return (data ?? []).map((row: { data: T }) => row.data);
  }

  async getById(id: string): Promise<T | undefined> {
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
    const { error } = await this.client.from(this.tableName).delete().eq('id', id);
    if (error) throw new Error(`Supabase delete failed: ${error.message}`);
    return true;
  }

  async clear(): Promise<void> {
    const { error } = await this.client.from(this.tableName).delete().neq('id', null);
    if (error) throw new Error(`Supabase clear failed: ${error.message}`);
  }
}
