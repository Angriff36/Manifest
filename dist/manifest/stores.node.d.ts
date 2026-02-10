/**
 * Node.js-only storage adapters for PostgreSQL and Supabase.
 *
 * DO NOT import this file in browser code. It requires Node.js modules (pg).
 * For browser environments, use MemoryStore or LocalStorageStore from runtime-engine.ts.
 */
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
export interface PostgresConfig {
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    connectionString?: string;
    tableName?: string;
}
export declare class PostgresStore<T extends EntityInstance> implements Store<T> {
    private pool;
    private tableName;
    private generateId;
    private initialized;
    constructor(config: PostgresConfig, generateId?: () => string);
    private ensureInitialized;
    private withConnection;
    getAll(): Promise<T[]>;
    getById(id: string): Promise<T | undefined>;
    create(data: Partial<T>): Promise<T>;
    update(id: string, data: Partial<T>): Promise<T | undefined>;
    delete(id: string): Promise<boolean>;
    clear(): Promise<void>;
    close(): Promise<void>;
}
export interface SupabaseConfig {
    url: string;
    key: string;
    tableName?: string;
}
export declare class SupabaseStore<T extends EntityInstance> implements Store<T> {
    private client;
    private tableName;
    private generateId;
    constructor(config: SupabaseConfig, generateId?: () => string);
    getAll(): Promise<T[]>;
    getById(id: string): Promise<T | undefined>;
    create(data: Partial<T>): Promise<T>;
    update(id: string, data: Partial<T>): Promise<T | undefined>;
    delete(id: string): Promise<boolean>;
    clear(): Promise<void>;
}
//# sourceMappingURL=stores.node.d.ts.map