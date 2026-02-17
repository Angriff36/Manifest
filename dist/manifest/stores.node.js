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
import { Pool } from 'pg';
export class PostgresStore {
    pool;
    tableName;
    generateId;
    initialized = false;
    /**
     * Quotes a PostgreSQL identifier to prevent SQL injection.
     * Wraps the identifier in double quotes and escapes any existing quotes.
     */
    quoteIdentifier(identifier) {
        // Quote the identifier and escape any embedded quotes
        return `"${identifier.replace(/"/g, '""')}"`;
    }
    constructor(config, generateId) {
        this.generateId = generateId || (() => crypto.randomUUID());
        this.tableName = config.tableName || 'entities';
        const poolConfig = config.connectionString
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
    async ensureInitialized() {
        if (this.initialized)
            return;
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
        }
        finally {
            client.release();
        }
    }
    async withConnection(callback) {
        await this.ensureInitialized();
        const client = await this.pool.connect();
        try {
            return await callback(client);
        }
        finally {
            client.release();
        }
    }
    async getAll() {
        return this.withConnection(async (client) => {
            const quotedTable = this.quoteIdentifier(this.tableName);
            const result = await client.query(`SELECT data FROM ${quotedTable} ORDER BY created_at`);
            return result.rows.map((row) => row.data);
        });
    }
    async getById(id) {
        return this.withConnection(async (client) => {
            const quotedTable = this.quoteIdentifier(this.tableName);
            const result = await client.query(`SELECT data FROM ${quotedTable} WHERE id = $1`, [id]);
            return result.rows.length > 0 ? result.rows[0].data : undefined;
        });
    }
    async create(data) {
        const id = data.id || this.generateId();
        const item = { ...data, id };
        return this.withConnection(async (client) => {
            const quotedTable = this.quoteIdentifier(this.tableName);
            await client.query(`INSERT INTO ${quotedTable} (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()`, [id, JSON.stringify(item)]);
            return item;
        });
    }
    async update(id, data) {
        return this.withConnection(async (client) => {
            const quotedTable = this.quoteIdentifier(this.tableName);
            const selectResult = await client.query(`SELECT data FROM ${quotedTable} WHERE id = $1`, [id]);
            if (selectResult.rows.length === 0)
                return undefined;
            const existing = selectResult.rows[0].data;
            const updated = { ...existing, ...data, id };
            await client.query(`UPDATE ${quotedTable} SET data = $1, updated_at = NOW() WHERE id = $2`, [JSON.stringify(updated), id]);
            return updated;
        });
    }
    async delete(id) {
        return this.withConnection(async (client) => {
            const quotedTable = this.quoteIdentifier(this.tableName);
            const result = await client.query(`DELETE FROM ${quotedTable} WHERE id = $1`, [id]);
            return (result.rowCount ?? 0) > 0;
        });
    }
    async clear() {
        return this.withConnection(async (client) => {
            const quotedTable = this.quoteIdentifier(this.tableName);
            await client.query(`DELETE FROM ${quotedTable}`);
        });
    }
    async close() {
        await this.pool.end();
    }
}
/**
 * Supabase-backed store adapter.
 *
 * '@supabase/supabase-js' is an optional peer dependency. It is loaded via
 * dynamic import at construction time. If the package is not installed, a
 * clear error is thrown instructing the user to install it.
 */
export class SupabaseStore {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client;
    tableName;
    generateId;
    ready;
    constructor(config, generateId) {
        this.generateId = generateId || (() => crypto.randomUUID());
        this.tableName = config.tableName || 'entities';
        this.ready = this.init(config);
    }
    async init(config) {
        let createClient;
        try {
            const mod = await import('@supabase/supabase-js');
            createClient = mod.createClient;
        }
        catch {
            throw new Error(`SupabaseStore requires '@supabase/supabase-js' to be installed.\n` +
                `Run: npm install @supabase/supabase-js`);
        }
        this.client = createClient(config.url, config.key);
    }
    async ensureReady() {
        await this.ready;
    }
    async getAll() {
        await this.ensureReady();
        const { data, error } = await this.client.from(this.tableName).select('data');
        if (error)
            throw new Error(`Supabase getAll failed: ${error.message}`);
        return (data ?? []).map((row) => row.data);
    }
    async getById(id) {
        await this.ensureReady();
        const { data, error } = await this.client
            .from(this.tableName)
            .select('data')
            .eq('id', id)
            .single();
        if (error) {
            if (error.code === 'PGRST116')
                return undefined;
            throw new Error(`Supabase getById failed: ${error.message}`);
        }
        return data?.data;
    }
    async create(data) {
        await this.ensureReady();
        const id = data.id || this.generateId();
        const item = { ...data, id };
        const { data: result, error } = await this.client
            .from(this.tableName)
            .upsert({ id, data: item }, { onConflict: 'id' })
            .select('data')
            .single();
        if (error)
            throw new Error(`Supabase create failed: ${error.message}`);
        return result?.data ?? item;
    }
    async update(id, data) {
        await this.ensureReady();
        const { data: existing, error: fetchError } = await this.client
            .from(this.tableName)
            .select('data')
            .eq('id', id)
            .single();
        if (fetchError) {
            if (fetchError.code === 'PGRST116')
                return undefined;
            throw new Error(`Supabase update fetch failed: ${fetchError.message}`);
        }
        const merged = { ...existing?.data, ...data, id };
        const { data: result, error: updateError } = await this.client
            .from(this.tableName)
            .update({ data: merged })
            .eq('id', id)
            .select('data')
            .single();
        if (updateError)
            throw new Error(`Supabase update failed: ${updateError.message}`);
        return result?.data;
    }
    async delete(id) {
        await this.ensureReady();
        const { error } = await this.client.from(this.tableName).delete().eq('id', id);
        if (error)
            throw new Error(`Supabase delete failed: ${error.message}`);
        return true;
    }
    async clear() {
        await this.ensureReady();
        const { error } = await this.client.from(this.tableName).delete().neq('id', null);
        if (error)
            throw new Error(`Supabase clear failed: ${error.message}`);
    }
}
//# sourceMappingURL=stores.node.js.map