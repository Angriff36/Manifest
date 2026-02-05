import {
  IR,
  IREntity,
  IRCommand,
  IRPolicy,
  IRExpression,
  IRValue,
  IRAction,
  IRType,
} from './ir';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Pool, PoolClient, PoolConfig } from 'pg';

export interface RuntimeContext {
  user?: { id: string; role?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface RuntimeOptions {
  generateId?: () => string;
  now?: () => number;
}

export interface EntityInstance {
  id: string;
  [key: string]: unknown;
}

export interface CommandResult {
  success: boolean;
  result?: unknown;
  error?: string;
  deniedBy?: string;
  guardFailure?: GuardFailure;
  policyDenial?: PolicyDenial;
  emittedEvents: EmittedEvent[];
}

export interface GuardFailure {
  index: number;
  expression: IRExpression;
  formatted: string;
  resolved?: GuardResolvedValue[];
}

export interface PolicyDenial {
  policyName: string;
  expression: IRExpression;
  formatted: string;
  message?: string;
  contextKeys: string[];
}

export interface GuardResolvedValue {
  expression: string;
  value: unknown;
}

export interface EmittedEvent {
  name: string;
  channel: string;
  payload: unknown;
  timestamp: number;
}

export interface Store<T extends EntityInstance = EntityInstance> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | undefined>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T | undefined>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<void>;
}

class MemoryStore<T extends EntityInstance> implements Store<T> {
  private items: Map<string, T> = new Map();
  private generateId: () => string;

  constructor(generateId?: () => string) {
    this.generateId = generateId || (() => crypto.randomUUID());
  }

  async getAll(): Promise<T[]> {
    return Array.from(this.items.values());
  }

  async getById(id: string): Promise<T | undefined> {
    return this.items.get(id);
  }

  async create(data: Partial<T>): Promise<T> {
    const id = data.id || this.generateId();
    const item = { ...data, id } as T;
    this.items.set(id, item);
    return item;
  }

  async update(id: string, data: Partial<T>): Promise<T | undefined> {
    const existing = this.items.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data, id };
    this.items.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.items.delete(id);
  }

  async clear(): Promise<void> {
    this.items.clear();
  }
}

class LocalStorageStore<T extends EntityInstance> implements Store<T> {
  private key: string;

  constructor(key: string) {
    this.key = key;
  }

  private load(): T[] {
    try {
      const data = localStorage.getItem(this.key);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private save(items: T[]): void {
    localStorage.setItem(this.key, JSON.stringify(items));
  }

  async getAll(): Promise<T[]> {
    return this.load();
  }

  async getById(id: string): Promise<T | undefined> {
    return this.load().find(item => item.id === id);
  }

  async create(data: Partial<T>): Promise<T> {
    const items = this.load();
    const id = data.id || crypto.randomUUID();
    const item = { ...data, id } as T;
    items.push(item);
    this.save(items);
    return item;
  }

  async update(id: string, data: Partial<T>): Promise<T | undefined> {
    const items = this.load();
    const idx = items.findIndex(item => item.id === id);
    if (idx === -1) return undefined;
    const updated = { ...items[idx], ...data, id };
    items[idx] = updated;
    this.save(items);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const items = this.load();
    const idx = items.findIndex(item => item.id === id);
    if (idx === -1) return false;
    items.splice(idx, 1);
    this.save(items);
    return true;
  }

  async clear(): Promise<void> {
    localStorage.removeItem(this.key);
  }
}

// PostgreSQL configuration interface
interface PostgresConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  connectionString?: string;
  tableName?: string;
}

class PostgresStore<T extends EntityInstance> implements Store<T> {
  private pool: Pool;
  private tableName: string;
  private generateId: () => string;
  private initialized: boolean = false;

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
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          id TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_${this.tableName}_data_gin ON ${this.tableName} USING gin(data);
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
      const result = await client.query(`SELECT data FROM ${this.tableName} ORDER BY created_at`);
      return result.rows.map((row) => row.data as T);
    });
  }

  async getById(id: string): Promise<T | undefined> {
    return this.withConnection(async (client) => {
      const result = await client.query(`SELECT data FROM ${this.tableName} WHERE id = $1`, [id]);
      return result.rows.length > 0 ? (result.rows[0].data as T) : undefined;
    });
  }

  async create(data: Partial<T>): Promise<T> {
    const id = data.id || this.generateId();
    const item = { ...data, id } as T;

    return this.withConnection(async (client) => {
      await client.query(
        `INSERT INTO ${this.tableName} (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()`,
        [id, JSON.stringify(item)]
      );
      return item;
    });
  }

  async update(id: string, data: Partial<T>): Promise<T | undefined> {
    return this.withConnection(async (client) => {
      const selectResult = await client.query(`SELECT data FROM ${this.tableName} WHERE id = $1`, [id]);
      if (selectResult.rows.length === 0) return undefined;

      const existing = selectResult.rows[0].data as T;
      const updated = { ...existing, ...data, id };

      await client.query(
        `UPDATE ${this.tableName} SET data = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(updated), id]
      );
      return updated;
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.withConnection(async (client) => {
      const result = await client.query(`DELETE FROM ${this.tableName} WHERE id = $1`, [id]);
      return (result.rowCount ?? 0) > 0;
    });
  }

  async clear(): Promise<void> {
    return this.withConnection(async (client) => {
      await client.query(`DELETE FROM ${this.tableName}`);
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// Supabase configuration interface
interface SupabaseConfig {
  url: string;
  key: string;
  tableName?: string;
}

class SupabaseStore<T extends EntityInstance> implements Store<T> {
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
      if (error.code === 'PGRST116') return undefined; // Not found
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
    // First fetch the existing record
    const { data: existing, error: fetchError } = await this.client
      .from(this.tableName)
      .select('data')
      .eq('id', id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') return undefined; // Not found
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

    if (error) {
      throw new Error(`Supabase delete failed: ${error.message}`);
    }
    return true; // Supabase doesn't return affected count for delete
  }

  async clear(): Promise<void> {
    const { error } = await this.client.from(this.tableName).delete().neq('id', null);

    if (error) {
      throw new Error(`Supabase clear failed: ${error.message}`);
    }
  }
}

type EventListener = (event: EmittedEvent) => void;

export class RuntimeEngine {
  private ir: IR;
  private context: RuntimeContext;
  private options: RuntimeOptions;
  private stores: Map<string, Store> = new Map();
  private eventListeners: EventListener[] = [];
  private eventLog: EmittedEvent[] = [];

  constructor(ir: IR, context: RuntimeContext = {}, options: RuntimeOptions = {}) {
    this.ir = ir;
    this.context = context;
    this.options = options;
    this.initializeStores();
  }

  private initializeStores(): void {
    for (const entity of this.ir.entities) {
      const storeConfig = this.ir.stores.find(s => s.entity === entity.name);
      let store: Store;

      if (storeConfig) {
        switch (storeConfig.target) {
          case 'localStorage': {
            const key = storeConfig.config.key?.kind === 'string'
              ? storeConfig.config.key.value
              : `${entity.name.toLowerCase()}s`;
            store = new LocalStorageStore(key);
            break;
          }
          case 'memory':
            store = new MemoryStore(this.options.generateId);
            break;
          case 'postgres': {
            const config: PostgresConfig = {};
            if (storeConfig.config.host?.kind === 'string') config.host = storeConfig.config.host.value;
            if (storeConfig.config.port?.kind === 'number') config.port = storeConfig.config.port.value;
            if (storeConfig.config.database?.kind === 'string') config.database = storeConfig.config.database.value;
            if (storeConfig.config.user?.kind === 'string') config.user = storeConfig.config.user.value;
            if (storeConfig.config.password?.kind === 'string') config.password = storeConfig.config.password.value;
            if (storeConfig.config.connectionString?.kind === 'string') config.connectionString = storeConfig.config.connectionString.value;
            if (storeConfig.config.tableName?.kind === 'string') config.tableName = storeConfig.config.tableName.value;
            store = new PostgresStore(config, this.options.generateId);
            break;
          }
          case 'supabase': {
            const url = storeConfig.config.url?.kind === 'string' ? storeConfig.config.url.value : '';
            const key = storeConfig.config.key?.kind === 'string' ? storeConfig.config.key.value : '';
            const tableName = storeConfig.config.tableName?.kind === 'string' ? storeConfig.config.tableName.value : undefined;
            if (!url || !key) {
              throw new Error(`Supabase storage requires 'url' and 'key' configuration for entity '${entity.name}'`);
            }
            store = new SupabaseStore({ url, key, tableName }, this.options.generateId);
            break;
          }
          default: {
            // Exhaustive check for valid IR store targets
            const _unsupportedTarget: never = storeConfig.target;
            throw new Error(
              `Unsupported storage target '${_unsupportedTarget}' for entity '${entity.name}'. ` +
              `Valid targets are: 'memory', 'localStorage', 'postgres', 'supabase'.`
            );
          }
        }
      } else {
        store = new MemoryStore(this.options.generateId);
      }

      this.stores.set(entity.name, store);
    }
  }

  private getNow(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  private getBuiltins(): Record<string, (...args: unknown[]) => unknown> {
    return {
      now: () => this.getNow(),
      uuid: () => this.options.generateId ? this.options.generateId() : crypto.randomUUID(),
    };
  }

  getIR(): IR {
    return this.ir;
  }

  getContext(): RuntimeContext {
    return this.context;
  }

  setContext(ctx: Partial<RuntimeContext>): void {
    this.context = { ...this.context, ...ctx };
  }

  replaceContext(ctx: RuntimeContext): void {
    this.context = { ...ctx };
  }

  getEntities(): IREntity[] {
    return this.ir.entities;
  }

  getEntity(name: string): IREntity | undefined {
    return this.ir.entities.find(e => e.name === name);
  }

  getCommands(): IRCommand[] {
    return this.ir.commands;
  }

  getCommand(name: string, entityName?: string): IRCommand | undefined {
    if (entityName) {
      const entity = this.getEntity(entityName);
      if (!entity || !entity.commands.includes(name)) return undefined;
      return this.ir.commands.find(c => c.name === name && c.entity === entityName);
    }
    return this.ir.commands.find(c => c.name === name);
  }

  getPolicies(): IRPolicy[] {
    return this.ir.policies;
  }

  getStore(entityName: string): Store | undefined {
    return this.stores.get(entityName);
  }

  async getAllInstances(entityName: string): Promise<EntityInstance[]> {
    const store = this.stores.get(entityName);
    return store ? await store.getAll() : [];
  }

  async getInstance(entityName: string, id: string): Promise<EntityInstance | undefined> {
    const store = this.stores.get(entityName);
    return store ? await store.getById(id) : undefined;
  }

  async createInstance(entityName: string, data: Partial<EntityInstance>): Promise<EntityInstance | undefined> {
    const entity = this.getEntity(entityName);
    if (!entity) return undefined;

    const defaults: Record<string, unknown> = {};
    for (const prop of entity.properties) {
      if (prop.defaultValue) {
        defaults[prop.name] = this.irValueToJs(prop.defaultValue);
      } else {
        defaults[prop.name] = this.getDefaultForType(prop.type);
      }
    }

    const store = this.stores.get(entityName);
    if (!store) return undefined;

    return await store.create({ ...defaults, ...data });
  }

  async updateInstance(entityName: string, id: string, data: Partial<EntityInstance>): Promise<EntityInstance | undefined> {
    const store = this.stores.get(entityName);
    return store ? await store.update(id, data) : undefined;
  }

  async deleteInstance(entityName: string, id: string): Promise<boolean> {
    const store = this.stores.get(entityName);
    return store ? await store.delete(id) : false;
  }

  async runCommand(
    commandName: string,
    input: Record<string, unknown>,
    options: { entityName?: string; instanceId?: string } = {}
  ): Promise<CommandResult> {
    const command = this.getCommand(commandName, options.entityName);
    if (!command) {
      return {
        success: false,
        error: `Command '${commandName}' not found`,
        emittedEvents: [],
      };
    }

    const instance = options.instanceId && options.entityName
      ? await this.getInstance(options.entityName, options.instanceId)
      : undefined;

    const evalContext = this.buildEvalContext(input, instance);

    const policyResult = this.checkPolicies(command, evalContext);
    if (!policyResult.allowed) {
      return {
        success: false,
        error: policyResult.denial?.message,
        deniedBy: policyResult.denial?.policyName,
        policyDenial: policyResult.denial,
        emittedEvents: [],
      };
    }

    for (let i = 0; i < command.guards.length; i += 1) {
      const guard = command.guards[i];
      const result = this.evaluateExpression(guard, evalContext);
      if (!result) {
        return {
          success: false,
          error: `Guard condition failed for command '${commandName}'`,
          guardFailure: {
            index: i + 1,
            expression: guard,
            formatted: this.formatExpression(guard),
            resolved: this.resolveExpressionValues(guard, evalContext),
          },
          emittedEvents: [],
        };
      }
    }

    const emittedEvents: EmittedEvent[] = [];
    let result: unknown;

    for (const action of command.actions) {
      const actionResult = await this.executeAction(action, evalContext, options);
      if ((action.kind === 'mutate' || action.kind === 'compute') && options.instanceId && options.entityName) {
        const currentInstance = await this.getInstance(options.entityName, options.instanceId);
        // Refresh both self/this bindings and spread instance properties into evalContext
        evalContext.self = currentInstance;
        evalContext.this = currentInstance;
        Object.assign(evalContext, currentInstance);
      }
      result = actionResult;
    }

    for (const eventName of command.emits) {
      const event = this.ir.events.find(e => e.name === eventName);
      const emitted: EmittedEvent = {
        name: eventName,
        channel: event?.channel || eventName,
        payload: { ...input, result },
        timestamp: this.getNow(),
      };
      emittedEvents.push(emitted);
      this.eventLog.push(emitted);
      this.notifyListeners(emitted);
    }

    return {
      success: true,
      result,
      emittedEvents,
    };
  }

  private buildEvalContext(
    input: Record<string, unknown>,
    instance?: EntityInstance
  ): Record<string, unknown> {
    return {
      ...(instance || {}),
      ...input,
      self: instance ?? null,
      this: instance ?? null,
      user: this.context.user ?? null,
      context: this.context ?? {},
    };
  }

  private checkPolicies(
    command: IRCommand,
    evalContext: Record<string, unknown>
  ): { allowed: boolean; denial?: PolicyDenial } {
    const relevantPolicies = this.ir.policies.filter(p => {
      if (p.entity && command.entity && p.entity !== command.entity) return false;
      if (p.action !== 'all' && p.action !== 'execute') return false;
      return true;
    });

    for (const policy of relevantPolicies) {
      const result = this.evaluateExpression(policy.expression, evalContext);
      if (!result) {
        // Extract context keys (not values for security)
        const contextKeys = this.extractContextKeys(policy.expression);
        return {
          allowed: false,
          denial: {
            policyName: policy.name,
            expression: policy.expression,
            formatted: this.formatExpression(policy.expression),
            message: policy.message || `Denied by policy '${policy.name}'`,
            contextKeys,
          },
        };
      }
    }

    return { allowed: true };
  }

  private extractContextKeys(expr: IRExpression): string[] {
    const keys = new Set<string>();

    const walk = (node: IRExpression): void => {
      switch (node.kind) {
        case 'identifier':
          // Add built-in identifiers and any user-defined identifiers
          if (node.name === 'self' || node.name === 'this' || node.name === 'user' || node.name === 'context') {
            keys.add(node.name);
          }
          return;
        case 'member': {
          // Add the base identifier (e.g., 'user' from 'user.role')
          walk(node.object);
          // Also add the full path as a key
          const base = this.formatExpression(node.object);
          keys.add(`${base}.${node.property}`);
          return;
        }
        case 'binary':
          walk(node.left);
          walk(node.right);
          return;
        case 'unary':
          walk(node.operand);
          return;
        case 'call':
          node.args.forEach(walk);
          return;
        case 'conditional':
          walk(node.condition);
          walk(node.consequent);
          walk(node.alternate);
          return;
        case 'array':
          node.elements.forEach(walk);
          return;
        case 'object':
          node.properties.forEach(p => walk(p.value));
          return;
        case 'lambda':
          walk(node.body);
          return;
        default:
          return;
      }
    };

    walk(expr);
    return Array.from(keys).sort();
  }

  private formatExpression(expr: IRExpression): string {
    switch (expr.kind) {
      case 'literal':
        return this.formatValue(expr.value);
      case 'identifier':
        return expr.name;
      case 'member':
        return `${this.formatExpression(expr.object)}.${expr.property}`;
      case 'binary':
        return `${this.formatExpression(expr.left)} ${expr.operator} ${this.formatExpression(expr.right)}`;
      case 'unary':
        return expr.operator === 'not'
          ? `not ${this.formatExpression(expr.operand)}`
          : `${expr.operator}${this.formatExpression(expr.operand)}`;
      case 'call':
        return `${this.formatExpression(expr.callee)}(${expr.args.map(arg => this.formatExpression(arg)).join(', ')})`;
      case 'conditional':
        return `${this.formatExpression(expr.condition)} ? ${this.formatExpression(expr.consequent)} : ${this.formatExpression(expr.alternate)}`;
      case 'array':
        return `[${expr.elements.map(el => this.formatExpression(el)).join(', ')}]`;
      case 'object':
        return `{ ${expr.properties.map(p => `${p.key}: ${this.formatExpression(p.value)}`).join(', ')} }`;
      case 'lambda':
        return `(${expr.params.join(', ')}) => ${this.formatExpression(expr.body)}`;
      default:
        return '<expr>';
    }
  }

  private formatValue(value: IRValue): string {
    switch (value.kind) {
      case 'string':
        return JSON.stringify(value.value);
      case 'number':
        return String(value.value);
      case 'boolean':
        return String(value.value);
      case 'null':
        return 'null';
      case 'array':
        return `[${value.elements.map(el => this.formatValue(el)).join(', ')}]`;
      case 'object':
        return `{ ${Object.entries(value.properties).map(([k, v]) => `${k}: ${this.formatValue(v)}`).join(', ')} }`;
      default:
        return 'null';
    }
  }

  private resolveExpressionValues(
    expr: IRExpression,
    evalContext: Record<string, unknown>
  ): GuardResolvedValue[] {
    const entries: GuardResolvedValue[] = [];
    const seen = new Set<string>();

    const addEntry = (node: IRExpression) => {
      const formatted = this.formatExpression(node);
      if (seen.has(formatted)) return;
      seen.add(formatted);
      let value: unknown;
      try {
        value = this.evaluateExpression(node, evalContext);
      } catch {
        value = undefined;
      }
      entries.push({ expression: formatted, value });
    };

    const walk = (node: IRExpression): void => {
      switch (node.kind) {
        case 'literal':
        case 'identifier':
        case 'member':
          addEntry(node);
          return;
        case 'binary':
          walk(node.left);
          walk(node.right);
          return;
        case 'unary':
          walk(node.operand);
          return;
        case 'call':
          node.args.forEach(walk);
          return;
        case 'conditional':
          walk(node.condition);
          walk(node.consequent);
          walk(node.alternate);
          return;
        case 'array':
          node.elements.forEach(walk);
          return;
        case 'object':
          node.properties.forEach(p => walk(p.value));
          return;
        case 'lambda':
          walk(node.body);
          return;
        default:
          return;
      }
    };

    walk(expr);
    return entries;
  }

  private async executeAction(
    action: IRAction,
    evalContext: Record<string, unknown>,
    options: { entityName?: string; instanceId?: string }
  ): Promise<unknown> {
    const value = this.evaluateExpression(action.expression, evalContext);

    switch (action.kind) {
      case 'mutate':
        if (action.target && options.instanceId && options.entityName) {
          await this.updateInstance(options.entityName, options.instanceId, {
            [action.target]: value,
          });
        }
        return value;

      case 'emit':
      case 'publish': {
        const event: EmittedEvent = {
          name: 'action_event',
          channel: 'default',
          payload: value,
          timestamp: this.getNow(),
        };
        this.eventLog.push(event);
        this.notifyListeners(event);
        return value;
      }

      case 'persist':
        return value;

      case 'compute':
        if (action.target && options.instanceId && options.entityName) {
          await this.updateInstance(options.entityName, options.instanceId, {
            [action.target]: value,
          });
        }
        return value;

      case 'effect':
      default:
        return value;
    }
  }

  evaluateExpression(expr: IRExpression, context: Record<string, unknown>): unknown {
    switch (expr.kind) {
      case 'literal':
        return this.irValueToJs(expr.value);

      case 'identifier': {
        const name = expr.name;
        if (name in context) return context[name];
        if (name === 'true') return true;
        if (name === 'false') return false;
        if (name === 'null') return null;
        return undefined;
      }

      case 'member': {
        const obj = this.evaluateExpression(expr.object, context);
        if (obj && typeof obj === 'object') {
          // Use hasOwnProperty check to prevent prototype pollution
          return Object.prototype.hasOwnProperty.call(obj, expr.property)
            ? (obj as Record<string, unknown>)[expr.property]
            : undefined;
        }
        return undefined;
      }

      case 'binary': {
        const left = this.evaluateExpression(expr.left, context);
        const right = this.evaluateExpression(expr.right, context);
        return this.evaluateBinaryOp(expr.operator, left, right);
      }

      case 'unary': {
        const operand = this.evaluateExpression(expr.operand, context);
        return this.evaluateUnaryOp(expr.operator, operand);
      }

      case 'call': {
        // Check if callee is a built-in function identifier
        const calleeExpr = expr.callee;
        if (calleeExpr.kind === 'identifier') {
          const builtins = this.getBuiltins();
          if (calleeExpr.name in builtins) {
            const args = expr.args.map(a => this.evaluateExpression(a, context));
            return builtins[calleeExpr.name](...args);
          }
        }

        // Default: evaluate callee and call as function
        const callee = this.evaluateExpression(expr.callee, context);
        const args = expr.args.map(a => this.evaluateExpression(a, context));
        if (typeof callee === 'function') {
          return callee(...args);
        }
        return undefined;
      }

      case 'conditional': {
        const condition = this.evaluateExpression(expr.condition, context);
        return condition
          ? this.evaluateExpression(expr.consequent, context)
          : this.evaluateExpression(expr.alternate, context);
      }

      case 'array':
        return expr.elements.map(e => this.evaluateExpression(e, context));

      case 'object': {
        const result: Record<string, unknown> = {};
        for (const prop of expr.properties) {
          result[prop.key] = this.evaluateExpression(prop.value, context);
        }
        return result;
      }

      case 'lambda': {
        return (...args: unknown[]) => {
          const localContext = { ...context };
          expr.params.forEach((p, i) => {
            localContext[p] = args[i];
          });
          return this.evaluateExpression(expr.body, localContext);
        };
      }

      default:
        return undefined;
    }
  }

  private evaluateBinaryOp(op: string, left: unknown, right: unknown): unknown {
    switch (op) {
      case '+':
        if (typeof left === 'string' || typeof right === 'string') {
          return String(left) + String(right);
        }
        return (left as number) + (right as number);
      case '-': return (left as number) - (right as number);
      case '*': return (left as number) * (right as number);
      case '/': return (left as number) / (right as number);
      case '%': return (left as number) % (right as number);
      case '==':
      case 'is': return left == right; // Loose equality: undefined == null is true
      case '!=': return left != right; // Loose inequality: undefined != null is false
      case '<': return (left as number) < (right as number);
      case '>': return (left as number) > (right as number);
      case '<=': return (left as number) <= (right as number);
      case '>=': return (left as number) >= (right as number);
      case '&&':
      case 'and': return Boolean(left) && Boolean(right);
      case '||':
      case 'or': return Boolean(left) || Boolean(right);
      case 'in':
        if (Array.isArray(right)) return right.includes(left);
        if (typeof right === 'string') return (right as string).includes(String(left));
        return false;
      case 'contains':
        if (Array.isArray(left)) return left.includes(right);
        if (typeof left === 'string') return left.includes(String(right));
        return false;
      default:
        return undefined;
    }
  }

  private evaluateUnaryOp(op: string, operand: unknown): unknown {
    switch (op) {
      case '!':
      case 'not': return !operand;
      case '-': return -(operand as number);
      default: return operand;
    }
  }

  private irValueToJs(value: IRValue): unknown {
    switch (value.kind) {
      case 'string': return value.value;
      case 'number': return value.value;
      case 'boolean': return value.value;
      case 'null': return null;
      case 'array': return value.elements.map(e => this.irValueToJs(e));
      case 'object': {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value.properties)) {
          result[k] = this.irValueToJs(v);
        }
        return result;
      }
    }
  }

  private getDefaultForType(type: IRType): unknown {
    if (type.nullable) return null;
    switch (type.name) {
      case 'string': return '';
      case 'number': return 0;
      case 'boolean': return false;
      case 'list': return [];
      case 'map': return {};
      default: return null;
    }
  }

  async evaluateComputed(entityName: string, instanceId: string, propertyName: string): Promise<unknown> {
    const entity = this.getEntity(entityName);
    if (!entity) return undefined;

    const computed = entity.computedProperties.find(c => c.name === propertyName);
    if (!computed) return undefined;

    const instance = await this.getInstance(entityName, instanceId);
    if (!instance) return undefined;

    return this.evaluateComputedInternal(entity, instance, propertyName, new Set());
  }

  private evaluateComputedInternal(
    entity: IREntity,
    instance: EntityInstance,
    propertyName: string,
    visited: Set<string>
  ): unknown {
    if (visited.has(propertyName)) return undefined;
    visited.add(propertyName);

    const computed = entity.computedProperties.find(c => c.name === propertyName);
    if (!computed) return undefined;

    const computedValues: Record<string, unknown> = {};
    if (computed.dependencies) {
      for (const dep of computed.dependencies) {
        const depComputed = entity.computedProperties.find(c => c.name === dep);
        if (depComputed && !visited.has(dep)) {
          computedValues[dep] = this.evaluateComputedInternal(entity, instance, dep, new Set(visited));
        }
      }
    }

    const context = {
      self: instance,
      this: instance,
      ...instance,
      ...computedValues,
      user: this.context.user ?? null,
      context: this.context ?? {},
    };

    return this.evaluateExpression(computed.expression, context);
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.push(listener);
    return () => {
      const idx = this.eventListeners.indexOf(listener);
      if (idx !== -1) this.eventListeners.splice(idx, 1);
    };
  }

  private notifyListeners(event: EmittedEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Ignore errors in event listeners
      }
    }
  }

  getEventLog(): EmittedEvent[] {
    return [...this.eventLog];
  }

  clearEventLog(): void {
    this.eventLog = [];
  }

  async serialize(): Promise<{ ir: IR; context: RuntimeContext; stores: Record<string, EntityInstance[]> }> {
    const storeData: Record<string, EntityInstance[]> = {};
    for (const [name, store] of this.stores) {
      storeData[name] = await store.getAll();
    }
    return {
      ir: this.ir,
      context: this.context,
      stores: storeData,
    };
  }

  async restore(data: { stores: Record<string, EntityInstance[]> }): Promise<void> {
    for (const [name, instances] of Object.entries(data.stores)) {
      const store = this.stores.get(name);
      if (store) {
        await store.clear();
        for (const instance of instances) {
          await store.create(instance);
        }
      }
    }
  }
}
