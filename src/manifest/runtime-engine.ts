import {
  IR,
  IRProvenance,
  IREntity,
  IRCommand,
  IRPolicy,
  IRExpression,
  IRValue,
  IRAction,
  IRType,
  IRConstraint,
  ConstraintOutcome,
  OverrideRequest,
  ConcurrencyConflict,
} from './ir';

// Note: PostgresStore and SupabaseStore are in stores.node.ts for server-side use only.
// This file is browser-safe and only includes MemoryStore and LocalStorageStore.

/**
 * Detect if running in production mode.
 * Checks NODE_ENV environment variable (server-side) or global location (browser).
 * In browsers, defaults to development since there's no standard production detection.
 */
function isProductionMode(): boolean {
  // Server-side: check process.env.NODE_ENV
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
    return true;
  }
  // Browser: no standard production detection, default to development
  // for safety. Users can explicitly set requireValidProvenance in browser apps.
  return false;
}

export interface RuntimeContext {
  user?: { id: string; role?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface RuntimeOptions {
  generateId?: () => string;
  now?: () => number;
  /**
   * If true, runtime will verify IR integrity hash before execution.
   * When an IR hash doesn't match, the runtime will throw an error.
   * Set to false for development/debugging mode.
   *
   * @default
   * - `true` in production (NODE_ENV=production)
   * - `false` in development
   *
   * Explicit dev override: Set to `false` to disable verification in production for debugging.
   */
  requireValidProvenance?: boolean;
  /**
   * Optional: expected IR hash for verification. If provided and requireValidProvenance is true,
   * the runtime will verify the IR's hash matches this value.
   * If not provided, the runtime will verify the IR's self-reported hash.
   */
  expectedIRHash?: string;
  /**
   * Optional function to provide custom store implementations for entities.
   * Called with the entity name and should return a Store instance or undefined.
   * If undefined is returned, the runtime will use its default store initialization.
   *
   * This allows using server-side stores like PostgresStore and SupabaseStore from stores.node.ts.
   *
   * @example
   * ```typescript
   * import { PostgresStore } from './stores.node.js';
   *
   * const runtime = new RuntimeEngine(ir, context, {
   *   storeProvider: (entityName) => {
   *     if (entityName === 'User' || entityName === 'Post') {
   *       return new PostgresStore({
   *         connectionString: process.env.DATABASE_URL,
   *         tableName: entityName.toLowerCase()
   *       });
   *     }
   *     return undefined; // Use default store
   *   }
   * });
   * ```
   */
  storeProvider?: (entityName: string) => Store | undefined;
}

export interface EntityInstance {
  id: string;
  /** For optimistic concurrency control (optional) */
  version?: number;
  /** Timestamp of last version change (optional) */
  versionAt?: number;
  [key: string]: unknown;
}

export interface CommandResult {
  success: boolean;
  result?: unknown;
  error?: string;
  deniedBy?: string;
  guardFailure?: GuardFailure;
  policyDenial?: PolicyDenial;
  /** All constraint evaluation outcomes (vNext) */
  constraintOutcomes?: ConstraintOutcome[];
  /** Pending override requests (vNext) */
  overrideRequests?: OverrideRequest[];
  /** Concurrency conflict details (vNext) */
  concurrencyConflict?: ConcurrencyConflict;
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
  /** Resolved values from the policy expression evaluation */
  resolved?: GuardResolvedValue[];
}

export interface GuardResolvedValue {
  expression: string;
  value: unknown;
}

export interface ConstraintFailure {
  constraintName: string;
  expression: IRExpression;
  formatted: string;
  message?: string;
  resolved?: GuardResolvedValue[];
}

export interface EmittedEvent {
  name: string;
  channel: string;
  payload: unknown;
  timestamp: number;
  /** Provenance information from the IR at the time of event emission */
  provenance?: {
    contentHash: string;
    compilerVersion: string;
    schemaVersion: string;
  };
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

type EventListener = (event: EmittedEvent) => void;

export interface ProvenanceVerificationResult {
  valid: boolean;
  expectedHash?: string;
  computedHash?: string;
  error?: string;
}

export class RuntimeEngine {
  private ir: IR;
  private context: RuntimeContext;
  private options: RuntimeOptions;
  private stores: Map<string, Store> = new Map();
  private eventListeners: EventListener[] = [];
  private eventLog: EmittedEvent[] = [];
  /** Index of relationships for efficient lookup during expression evaluation */
  private relationshipIndex: Map<string, {
    entityName: string;
    relationshipName: string;
    kind: 'hasMany' | 'hasOne' | 'belongsTo' | 'ref';
    targetEntity: string;
    foreignKey?: string;
  }> = new Map();

  /** Memoization cache for resolved relationships to avoid repeated store queries */
  private relationshipMemoCache: Map<string, {
    result: EntityInstance | EntityInstance[] | null;
    timestamp: number;
  }> = new Map();

  constructor(ir: IR, context: RuntimeContext = {}, options: RuntimeOptions = {}) {
    this.ir = ir;
    this.context = context;
    this.options = options;
    this.initializeStores();
    this.buildRelationshipIndex();
  }

  private initializeStores(): void {
    for (const entity of this.ir.entities) {
      // First check if a storeProvider is configured and use it
      if (this.options.storeProvider) {
        const customStore = this.options.storeProvider(entity.name);
        if (customStore) {
          this.stores.set(entity.name, customStore);
          continue;
        }
      }

      // Fall back to default store initialization
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
          case 'postgres':
            throw new Error(
              `PostgreSQL storage for entity '${entity.name}' is not available in browser environments. ` +
              `Use 'memory' or 'localStorage' for browser, or provide a custom store via the storeProvider option. ` +
              `For server-side use, import PostgresStore from stores.node.ts.`
            );
          case 'supabase':
            throw new Error(
              `Supabase storage for entity '${entity.name}' is not available in browser environments. ` +
              `Use 'memory' or 'localStorage' for browser, or provide a custom store via the storeProvider option. ` +
              `For server-side use, import SupabaseStore from stores.node.ts.`
            );
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

  /**
   * Build an index of all relationships for efficient lookup during expression evaluation.
   * Maps "EntityName.relationshipName" to relationship metadata.
   */
  private buildRelationshipIndex(): void {
    for (const entity of this.ir.entities) {
      for (const rel of entity.relationships) {
        const key = `${entity.name}.${rel.name}`;
        this.relationshipIndex.set(key, {
          entityName: entity.name,
          relationshipName: rel.name,
          kind: rel.kind,
          targetEntity: rel.target,
          foreignKey: rel.foreignKey,
        });
      }
    }
  }

  /**
   * Clear the relationship memoization cache.
   * Called at the start of each command execution to ensure fresh data.
   */
  private clearMemoCache(): void {
    this.relationshipMemoCache.clear();
  }

  /**
   * Resolve a relationship for a given instance.
   * Uses memoization cache to avoid repeated store queries within a single command execution.
   * @param entityName - The source entity name
   * @param instance - The source instance (must have an id)
   * @param relationshipName - The relationship name to resolve
   * @returns For hasMany: array of related instances; for hasOne/belongsTo/ref: single instance or null
   */
  private async resolveRelationship(
    entityName: string,
    instance: EntityInstance,
    relationshipName: string
  ): Promise<EntityInstance | EntityInstance[] | null> {
    const key = `${entityName}.${relationshipName}`;
    const rel = this.relationshipIndex.get(key);
    if (!rel) {
      return null;
    }

    const sourceId = instance.id;
    if (!sourceId) {
      return null;
    }

    // Build cache key including instance ID for accurate memoization
    const cacheKey = `${entityName}.${sourceId}.${relationshipName}`;

    // Check cache first
    const cached = this.relationshipMemoCache.get(cacheKey);
    if (cached) {
      return cached.result;
    }

    let result: EntityInstance | EntityInstance[] | null = null;

    switch (rel.kind) {
      case 'belongsTo':
      case 'ref': {
        // For belongsTo/ref: the foreign key on the source instance contains the target ID
        const fkProperty = rel.foreignKey || `${rel.relationshipName}Id`;
        const targetId = instance[fkProperty] as string | undefined;
        if (!targetId) {
          result = null;
        } else {
          result = await this.getInstance(rel.targetEntity, targetId) ?? null;
        }
        break;
      }

      case 'hasOne': {
        // For hasOne: find the target instance where its belongsTo foreign key equals source ID
        // We need to find the inverse relationship on the target entity
        const targetEntity = this.getEntity(rel.targetEntity);
        if (!targetEntity) {
          result = null;
          break;
        }

        // Find the inverse belongsTo relationship
        const inverseRel = targetEntity.relationships.find(
          r => (r.kind === 'belongsTo' || r.kind === 'ref') &&
               r.target === entityName
        );

        if (inverseRel) {
          // Use the inverse relationship's foreign key
          const fkProperty = inverseRel.foreignKey || `${inverseRel.name}Id`;
          const allTargets = await this.getAllInstances(rel.targetEntity);
          result = allTargets.find(t => t[fkProperty] === sourceId) ?? null;
        } else {
          // Fallback: assume the foreign key is named after the source entity
          const assumedFk = `${entityName.toLowerCase()}Id`;
          const allTargets = await this.getAllInstances(rel.targetEntity);
          result = allTargets.find(t => t[assumedFk] === sourceId) ?? null;
        }
        break;
      }

      case 'hasMany': {
        // For hasMany: find all target instances where their belongsTo foreign key equals source ID
        const targetEntity = this.getEntity(rel.targetEntity);
        if (!targetEntity) {
          result = [];
          break;
        }

        // Find the inverse belongsTo relationship
        const inverseRel = targetEntity.relationships.find(
          r => (r.kind === 'belongsTo' || r.kind === 'ref') &&
               r.target === entityName
        );

        if (inverseRel) {
          const fkProperty = inverseRel.foreignKey || `${inverseRel.name}Id`;
          const allTargets = await this.getAllInstances(rel.targetEntity);
          result = allTargets.filter(t => t[fkProperty] === sourceId);
        } else {
          // Fallback: assume the foreign key is named after the source entity
          const assumedFk = `${entityName.toLowerCase()}Id`;
          const allTargets = await this.getAllInstances(rel.targetEntity);
          result = allTargets.filter(t => t[assumedFk] === sourceId);
        }
        break;
      }

      default:
        result = null;
    }

    // Cache the result
    this.relationshipMemoCache.set(cacheKey, {
      result,
      timestamp: this.getNow(),
    });

    return result;
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

  /**
   * Get the provenance metadata from the IR
   */
  getProvenance(): IRProvenance | undefined {
    return this.ir.provenance;
  }

  /**
   * Log provenance information at startup
   * This can be called by UI code to display provenance
   */
  logProvenance(): void {
    const prov = this.getProvenance();
    if (!prov) {
      console.warn('[Manifest Runtime] No provenance information found in IR.');
      return;
    }
    console.group('[Manifest Runtime] Provenance Information');
    console.log(`Content Hash: ${prov.contentHash}`);
    console.log(`IR Hash: ${prov.irHash || 'not set'}`);
    console.log(`Compiler Version: ${prov.compilerVersion}`);
    console.log(`Schema Version: ${prov.schemaVersion}`);
    console.log(`Compiled At: ${prov.compiledAt}`);
    console.groupEnd();
  }

  /**
   * Verify the IR integrity by checking that the computed hash matches the expected hash.
   * Returns true if verification passes, false otherwise.
   *
   * @param expectedHash - Optional expected hash. If not provided, uses the IR's self-reported irHash
   * @returns true if hash matches or if no hash is available to verify
   */
  async verifyIRHash(expectedHash?: string): Promise<boolean> {
    const prov = this.ir.provenance;
    if (!prov) {
      console.warn('[Manifest Runtime] No provenance information found, cannot verify IR hash.');
      return false;
    }

    const targetHash = expectedHash || prov.irHash;
    if (!targetHash) {
      console.warn('[Manifest Runtime] No IR hash available for verification.');
      return false;
    }

    try {
      // Compute hash of the current IR (excluding the irHash field itself)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { irHash: _irHash, ...provenanceWithoutIrHash } = prov;
      const canonical = {
        ...this.ir,
        provenance: provenanceWithoutIrHash,
      };

      // Use deterministic JSON serialization (same as compiler)
      const json = JSON.stringify(canonical, Object.keys(canonical).sort());
      const encoder = new TextEncoder();
      const data = encoder.encode(json);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      const isValid = computedHash === targetHash;

      if (!isValid) {
        console.error(
          `[Manifest Runtime] IR hash verification failed!\n` +
          `  Expected: ${targetHash}\n` +
          `  Computed: ${computedHash}\n` +
          `  The IR may have been tampered with or modified since compilation.`
        );
      }

      return isValid;
    } catch (error) {
      console.error('[Manifest Runtime] Error during IR hash verification:', error);
      return false;
    }
  }

  /**
   * Verify IR and throw if invalid. Use this when requireValidProvenance is true.
   * @throws Error if IR hash verification fails
   */
  async assertValidProvenance(): Promise<void> {
    if (this.options.requireValidProvenance) {
      const isValid = await this.verifyIRHash(this.options.expectedIRHash);
      if (!isValid) {
        throw new Error(
          'IR provenance verification failed. The IR may have been modified since compilation. ' +
          'This runtime requires valid provenance for execution.'
        );
      }
      console.log('[Manifest Runtime] IR provenance verified successfully.');
    } else {
      console.log(
        '[Manifest Runtime] IR provenance verification is disabled. ' +
        'Enable requireValidProvenance in production for security.'
      );
    }
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

  /**
   * Check entity constraints against instance data
   * Returns array of constraint failures (empty if all pass)
   * Useful for diagnostic purposes without mutating state
   */
  async checkConstraints(entityName: string, data: Record<string, unknown>): Promise<ConstraintFailure[]> {
    const entity = this.getEntity(entityName);
    if (!entity) return [];
    return await this.validateConstraints(entity, data);
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

    const mergedData = { ...defaults, ...data };

    // Handle version properties for optimistic concurrency control
    if (entity.versionProperty) {
      mergedData[entity.versionProperty] = 1;
    }
    if (entity.versionAtProperty) {
      mergedData[entity.versionAtProperty] = this.getNow();
    }

    // Validate entity constraints
    const constraintFailures = await this.validateConstraints(entity, mergedData);
    if (constraintFailures.length > 0) {
      // Log constraint failures for diagnostics
      console.warn('[Manifest Runtime] Constraint validation failed:', constraintFailures);
      return undefined;
    }

    const store = this.stores.get(entityName);
    if (!store) return undefined;

    return await store.create(mergedData);
  }

  async updateInstance(entityName: string, id: string, data: Partial<EntityInstance>): Promise<EntityInstance | undefined> {
    const entity = this.getEntity(entityName);
    const store = this.stores.get(entityName);
    if (!store || !entity) return undefined;

    const existing = await store.getById(id);
    if (!existing) return undefined;

    // Optimistic concurrency control: check version if entity has versionProperty
    if (entity.versionProperty) {
      const existingVersion = existing[entity.versionProperty] as number | undefined;
      const providedVersion = data[entity.versionProperty] as number | undefined;

      if (existingVersion !== undefined && providedVersion !== undefined) {
        if (existingVersion !== providedVersion) {
          // Concurrency conflict - emit event and return undefined to indicate failure
          await this.emitConcurrencyConflictEvent(entityName, id, providedVersion, existingVersion);
          return undefined;
        }
      }

      // Auto-increment version on successful update
      data[entity.versionProperty] = (existingVersion || 0) + 1;
    }

    // Update versionAt timestamp if present
    if (entity.versionAtProperty) {
      data[entity.versionAtProperty] = this.getNow();
    }

    const mergedData = { ...existing, ...data };

    // Validate entity constraints
    const constraintFailures = await this.validateConstraints(entity, mergedData);
    if (constraintFailures.length > 0) {
      // Log constraint failures for diagnostics
      console.warn('[Manifest Runtime] Constraint validation failed:', constraintFailures);
      return undefined;
    }

    return await store.update(id, data);
  }

  async deleteInstance(entityName: string, id: string): Promise<boolean> {
    const store = this.stores.get(entityName);
    return store ? await store.delete(id) : false;
  }

  async runCommand(
    commandName: string,
    input: Record<string, unknown>,
    options: { entityName?: string; instanceId?: string; overrideRequests?: OverrideRequest[] } = {}
  ): Promise<CommandResult> {
    // Clear relationship memoization cache at the start of each command execution
    // to ensure fresh data after any mutations
    this.clearMemoCache();

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

    const evalContext = this.buildEvalContext(input, instance, options.entityName);

    const policyResult = await this.checkPolicies(command, evalContext);
    if (!policyResult.allowed) {
      return {
        success: false,
        error: policyResult.denial?.message,
        deniedBy: policyResult.denial?.policyName,
        policyDenial: policyResult.denial,
        emittedEvents: [],
      };
    }

    // vNext: Evaluate command constraints (after policies, before guards)
    const constraintResult = await this.evaluateCommandConstraints(command, evalContext, options.overrideRequests);
    if (!constraintResult.allowed) {
      // Find the blocking constraint for the error message
      const blocking = constraintResult.outcomes.find(o => !o.passed && !o.overridden && o.severity === 'block');
      return {
        success: false,
        error: blocking?.message || `Command blocked by constraint '${blocking?.constraintName}'`,
        constraintOutcomes: constraintResult.outcomes,
        overrideRequests: options.overrideRequests,
        emittedEvents: [],
      };
    }

    for (let i = 0; i < command.guards.length; i += 1) {
      const guard = command.guards[i];
      const result = await this.evaluateExpression(guard, evalContext);
      if (!result) {
        return {
          success: false,
          error: `Guard condition failed for command '${commandName}'`,
          guardFailure: {
            index: i + 1,
            expression: guard,
            formatted: this.formatExpression(guard),
            resolved: await this.resolveExpressionValues(guard, evalContext),
          },
          // Include constraint outcomes even if guards fail
          constraintOutcomes: constraintResult.outcomes.length > 0 ? constraintResult.outcomes : undefined,
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
      const prov = this.ir.provenance;
      const emitted: EmittedEvent = {
        name: eventName,
        channel: event?.channel || eventName,
        payload: { ...input, result },
        timestamp: this.getNow(),
        ...(prov ? {
          provenance: {
            contentHash: prov.contentHash,
            compilerVersion: prov.compilerVersion,
            schemaVersion: prov.schemaVersion,
          },
        } : {}),
      };
      emittedEvents.push(emitted);
      this.eventLog.push(emitted);
      this.notifyListeners(emitted);
    }

    return {
      success: true,
      result,
      // Include constraint outcomes in successful result
      constraintOutcomes: constraintResult.outcomes.length > 0 ? constraintResult.outcomes : undefined,
      emittedEvents,
    };
  }

  private buildEvalContext(
    input: Record<string, unknown>,
    instance?: EntityInstance,
    entityName?: string
  ): Record<string, unknown> {
    const baseContext = {
      ...(instance || {}),
      ...input,
      self: instance ?? null,
      this: instance ?? null,
      user: this.context.user ?? null,
      context: this.context ?? {},
    };

    // Add entity name metadata for relationship resolution
    if (instance && entityName) {
      (baseContext as Record<string, unknown>)._entity = entityName;
    }

    return baseContext;
  }

  private async checkPolicies(
    command: IRCommand,
    evalContext: Record<string, unknown>
  ): Promise<{ allowed: boolean; denial?: PolicyDenial }> {
    const relevantPolicies = this.ir.policies.filter(p => {
      if (p.entity && command.entity && p.entity !== command.entity) return false;
      if (p.action !== 'all' && p.action !== 'execute') return false;
      return true;
    });

    for (const policy of relevantPolicies) {
      const result = await this.evaluateExpression(policy.expression, evalContext);
      if (!result) {
        // Extract context keys (not values for security)
        const contextKeys = this.extractContextKeys(policy.expression);
        // Resolve expression values for diagnostics
        const resolved = await this.resolveExpressionValues(policy.expression, evalContext);
        return {
          allowed: false,
          denial: {
            policyName: policy.name,
            expression: policy.expression,
            formatted: this.formatExpression(policy.expression),
            message: policy.message || `Denied by policy '${policy.name}'`,
            contextKeys,
            resolved,
          },
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Validate entity constraints against instance data
   * Returns array of constraint failures (empty if all pass)
   *
   * Constraint semantics:
   * - Expression evaluates to TRUE → condition is met → constraint PASSES
   * - Expression evaluates to FALSE → condition is not met → constraint FAILS
   *
   * Severity affects what gets reported as failures:
   * - severity='block': Failed constraints are returned as failures (block execution)
   * - severity='warn': Failed constraints are NOT returned as failures (informational only)
   * - severity='ok': Failed constraints are NOT returned as failures (informational only)
   *
   * CONSTRAINT SEMANTICS (vNext hybrid support):
   * - Positive constraints (default): Expression describes what MUST be true for validity
   *   - When FALSE → constraint FAILS (e.g., "amount >= 0" fails when amount = -1)
   *   - When TRUE → constraint PASSES
   * - Negative constraints (detected by "severity" prefix): Expression describes BAD state
   *   - When TRUE → constraint FIRES (e.g., "status == 'cancelled'" fires when cancelled)
   *   - When FALSE → constraint PASSES (no bad state present)
   */
  private async validateConstraints(
    entity: IREntity,
    instanceData: Record<string, unknown>
  ): Promise<ConstraintFailure[]> {
    const failures: ConstraintFailure[] = [];

    // Build evaluation context with self/this pointing to the instance
    const evalContext = {
      ...instanceData,
      self: instanceData,
      this: instanceData,
      user: this.context.user ?? null,
      context: this.context ?? {},
      _entity: entity.name,
    };

    for (const constraint of entity.constraints) {
      const result = await this.evaluateExpression(constraint.expression, evalContext);

      // Detect constraint type: "severity*" prefix indicates negative-type constraint
      // Negative constraints fire when expression is TRUE (bad state detected)
      // Positive constraints fail when expression is FALSE (required condition not met)
      const isNegativeType = constraint.name.startsWith('severity');
      const shouldFire = isNegativeType ? !!result : !result;

      // All firing constraints are returned as failures for diagnostic purposes
      // (The severity field determines whether they block execution, but all are reported)
      if (shouldFire) {
        failures.push({
          constraintName: constraint.name,
          expression: constraint.expression,
          formatted: this.formatExpression(constraint.expression),
          message: constraint.message || `Constraint '${constraint.name}' failed`,
          resolved: await this.resolveExpressionValues(constraint.expression, evalContext),
        });
      }
    }

    return failures;
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

  private async resolveExpressionValues(
    expr: IRExpression,
    evalContext: Record<string, unknown>
  ): Promise<GuardResolvedValue[]> {
    const entries: GuardResolvedValue[] = [];
    const seen = new Set<string>();

    const addEntry = async (node: IRExpression) => {
      const formatted = this.formatExpression(node);
      if (seen.has(formatted)) return;
      seen.add(formatted);
      let value: unknown;
      try {
        value = await this.evaluateExpression(node, evalContext);
      } catch {
        value = undefined;
      }
      entries.push({ expression: formatted, value });
    };

    const walk = async (node: IRExpression): Promise<void> => {
      switch (node.kind) {
        case 'literal':
        case 'identifier':
        case 'member':
          await addEntry(node);
          return;
        case 'binary':
          await walk(node.left);
          await walk(node.right);
          return;
        case 'unary':
          await walk(node.operand);
          return;
        case 'call':
          for (const arg of node.args) {
            await walk(arg);
          }
          return;
        case 'conditional':
          await walk(node.condition);
          await walk(node.consequent);
          await walk(node.alternate);
          return;
        case 'array':
          for (const el of node.elements) {
            await walk(el);
          }
          return;
        case 'object':
          for (const prop of node.properties) {
            await walk(prop.value);
          }
          return;
        case 'lambda':
          await walk(node.body);
          return;
        default:
          return;
      }
    };

    await walk(expr);
    return entries;
  }

  private async executeAction(
    action: IRAction,
    evalContext: Record<string, unknown>,
    options: { entityName?: string; instanceId?: string }
  ): Promise<unknown> {
    const value = await this.evaluateExpression(action.expression, evalContext);

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
        const prov = this.ir.provenance;
        const event: EmittedEvent = {
          name: 'action_event',
          channel: 'default',
          payload: value,
          timestamp: this.getNow(),
          ...(prov ? {
            provenance: {
              contentHash: prov.contentHash,
              compilerVersion: prov.compilerVersion,
              schemaVersion: prov.schemaVersion,
            },
          } : {}),
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

  async evaluateExpression(expr: IRExpression, context: Record<string, unknown>): Promise<unknown> {
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
        const obj = await this.evaluateExpression(expr.object, context);
        if (obj && typeof obj === 'object') {
          // Check if this is a relationship traversal on self/this
          if (
            expr.object.kind === 'identifier' &&
            (expr.object.name === 'self' || expr.object.name === 'this') &&
            'id' in obj &&
            typeof obj.id === 'string'
          ) {
            // Check if the property is a relationship
            const entityName = (obj as Record<string, unknown>)._entity as string | undefined;
            if (entityName) {
              const relKey = `${entityName}.${expr.property}`;
              if (this.relationshipIndex.has(relKey)) {
                // Resolve the relationship
                return await this.resolveRelationship(entityName, obj as EntityInstance, expr.property);
              }
            }
          }

          // Use hasOwnProperty check to prevent prototype pollution
          return Object.prototype.hasOwnProperty.call(obj, expr.property)
            ? (obj as Record<string, unknown>)[expr.property]
            : undefined;
        }
        return undefined;
      }

      case 'binary': {
        const left = await this.evaluateExpression(expr.left, context);
        const right = await this.evaluateExpression(expr.right, context);
        return this.evaluateBinaryOp(expr.operator, left, right);
      }

      case 'unary': {
        const operand = await this.evaluateExpression(expr.operand, context);
        return this.evaluateUnaryOp(expr.operator, operand);
      }

      case 'call': {
        // Check if callee is a built-in function identifier
        const calleeExpr = expr.callee;
        if (calleeExpr.kind === 'identifier') {
          const builtins = this.getBuiltins();
          if (calleeExpr.name in builtins) {
            const args = await Promise.all(expr.args.map(a => this.evaluateExpression(a, context)));
            return builtins[calleeExpr.name](...args);
          }
        }

        // Default: evaluate callee and call as function
        const callee = await this.evaluateExpression(expr.callee, context);
        const args = await Promise.all(expr.args.map(a => this.evaluateExpression(a, context)));
        if (typeof callee === 'function') {
          return callee(...args);
        }
        return undefined;
      }

      case 'conditional': {
        const condition = await this.evaluateExpression(expr.condition, context);
        return condition
          ? await this.evaluateExpression(expr.consequent, context)
          : await this.evaluateExpression(expr.alternate, context);
      }

      case 'array':
        return await Promise.all(expr.elements.map(e => this.evaluateExpression(e, context)));

      case 'object': {
        const result: Record<string, unknown> = {};
        for (const prop of expr.properties) {
          result[prop.key] = await this.evaluateExpression(prop.value, context);
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

    return await this.evaluateComputedInternal(entity, instance, propertyName, new Set());
  }

  private async evaluateComputedInternal(
    entity: IREntity,
    instance: EntityInstance,
    propertyName: string,
    visited: Set<string>
  ): Promise<unknown> {
    if (visited.has(propertyName)) return undefined;
    visited.add(propertyName);

    const computed = entity.computedProperties.find(c => c.name === propertyName);
    if (!computed) return undefined;

    const computedValues: Record<string, unknown> = {};
    if (computed.dependencies) {
      for (const dep of computed.dependencies) {
        const depComputed = entity.computedProperties.find(c => c.name === dep);
        if (depComputed && !visited.has(dep)) {
          computedValues[dep] = await this.evaluateComputedInternal(entity, instance, dep, new Set(visited));
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
      _entity: entity.name,
    };

    return await this.evaluateExpression(computed.expression, context);
  }

  /**
   * vNext: Interpolate template placeholders with values from context
   * Supports {placeholder} syntax where placeholders are resolved from:
   * 1. details mapping (if present)
   * 2. resolved expression values (by expression string)
   * 3. evaluation context (direct property access)
   */
  private interpolateTemplate(
    template: string,
    evalContext: Record<string, unknown>,
    details?: Record<string, unknown>,
    resolved?: Array<{ expression: string; value: unknown }>
  ): string {
    // Create a lookup map for resolved values by expression
    const resolvedMap = new Map<string, unknown>();
    if (resolved) {
      for (const r of resolved) {
        // Use the expression string as the key
        resolvedMap.set(r.expression, r.value);
      }
    }

    return template.replace(/\{([^}]+)\}/g, (_match, placeholder) => {
      // First check details mapping
      if (details && placeholder in details) {
        return String(details[placeholder]);
      }
      // Then check resolved expressions
      if (resolvedMap.has(placeholder)) {
        const value = resolvedMap.get(placeholder);
        return value === undefined ? placeholder : String(value);
      }
      // Finally check evaluation context
      if (placeholder in evalContext) {
        const value = (evalContext as Record<string, unknown>)[placeholder];
        return value === undefined ? placeholder : String(value);
      }
      // Placeholder not found, return original
      return _match;
    });
  }

  /**
   * vNext: Evaluate a single constraint and return detailed outcome
   */
  private async evaluateConstraint(
    constraint: IRConstraint,
    evalContext: Record<string, unknown>
  ): Promise<ConstraintOutcome> {
    const result = await this.evaluateExpression(constraint.expression, evalContext);

    // Hybrid constraint semantics:
    // - Negative-type constraints (name starts with "severity"): fire when TRUE (bad state detected)
    // - Positive-type constraints: fail when FALSE (required condition not met)
    const isNegativeType = constraint.name.startsWith('severity');
    const passed = isNegativeType ? !result : !!result;

    // Build details mapping if specified
    let details: Record<string, unknown> | undefined = undefined;
    if (constraint.detailsMapping) {
      details = {};
      for (const [key, expr] of Object.entries(constraint.detailsMapping)) {
        details[key] = await this.evaluateExpression(expr as IRExpression, evalContext);
      }
    }

    // Resolve expression values for debugging
    const resolved = await this.resolveExpressionValues(constraint.expression, evalContext);

    // Build message with template interpolation if messageTemplate is used
    let message: string | undefined = constraint.message;
    if (constraint.messageTemplate && !message) {
      message = this.interpolateTemplate(constraint.messageTemplate, evalContext, details, resolved.map(r => ({ expression: r.expression, value: r.value })));
    }

    return {
      code: constraint.code,
      constraintName: constraint.name,
      severity: constraint.severity || 'block',
      formatted: this.formatExpression(constraint.expression),
      message,
      details,
      passed,
      resolved: resolved.map(r => ({ expression: r.expression, value: r.value })),
    };
  }

  /**
   * vNext: Evaluate command constraints with override support
   * Returns allowed flag and all constraint outcomes
   */
  private async evaluateCommandConstraints(
    command: IRCommand,
    evalContext: Record<string, unknown>,
    overrideRequests?: OverrideRequest[]
  ): Promise<{ allowed: boolean; outcomes: ConstraintOutcome[] }> {
    const outcomes: ConstraintOutcome[] = [];

    for (const constraint of command.constraints || []) {
      const outcome = await this.evaluateConstraint(constraint, evalContext);

      // Check for override if constraint failed and is overrideable
      if (!outcome.passed && constraint.overrideable) {
        // First check for explicit override request
        if (overrideRequests) {
          const overrideReq = overrideRequests.find(o => o.constraintCode === constraint.code);
          if (overrideReq) {
            const authorized = await this.validateOverrideAuthorization(constraint, overrideReq, evalContext);
            if (authorized) {
              outcome.overridden = true;
              outcome.overriddenBy = overrideReq.authorizedBy;
              await this.emitOverrideAppliedEvent(constraint, overrideReq, outcome);
            }
          }
        }

        // If still not overridden and has overridePolicyRef, automatically check policy
        if (!outcome.overridden && constraint.overridePolicyRef) {
          const policy = this.ir.policies.find(p => p.name === constraint.overridePolicyRef);
          if (policy && policy.action === 'override') {
            const policyResult = await this.evaluateExpression(policy.expression, evalContext);
            const authorized = Boolean(policyResult);
            if (authorized) {
              outcome.overridden = true;
              outcome.overriddenBy = 'policy:' + policy.name;
            }
          }
        }
      }

      outcomes.push(outcome);

      // Block execution if non-passing constraint is not overridden
      if (!outcome.passed && !outcome.overridden && outcome.severity === 'block') {
        return { allowed: false, outcomes };
      }
    }

    return { allowed: true, outcomes };
  }

  /**
   * vNext: Validate override authorization via policy or default admin check
   */
  private async validateOverrideAuthorization(
    constraint: IRConstraint,
    overrideReq: OverrideRequest,
    evalContext: Record<string, unknown>
  ): Promise<boolean> {
    // If constraint has overridePolicyRef, check that policy
    if (constraint.overridePolicyRef) {
      const policy = this.ir.policies.find(p => p.name === constraint.overridePolicyRef);
      if (policy) {
        const overrideContext = {
          ...evalContext,
          _override: {
            constraintCode: constraint.code,
            constraintName: constraint.name,
            reason: overrideReq.reason,
            authorizedBy: overrideReq.authorizedBy,
          },
        };

        const result = await this.evaluateExpression(policy.expression, overrideContext);
        return Boolean(result);
      }
    }

    // Default: check if user has admin-like role
    const user = this.context.user as { role?: string } | undefined;
    return user?.role === 'admin' || false;
  }

  /**
   * vNext: Emit OverrideApplied event for auditing
   */
  private async emitOverrideAppliedEvent(
    constraint: IRConstraint,
    overrideReq: OverrideRequest,
    outcome: ConstraintOutcome
  ): Promise<void> {
    const event: EmittedEvent = {
      name: 'OverrideApplied',
      channel: 'system',
      payload: {
        constraintCode: constraint.code,
        constraintName: constraint.name,
        originalSeverity: outcome.severity,
        reason: overrideReq.reason,
        authorizedBy: overrideReq.authorizedBy,
        timestamp: this.getNow(),
      },
      timestamp: this.getNow(),
      provenance: this.getProvenanceInfo(),
    };

    this.eventLog.push(event);
    this.notifyListeners(event);
  }

  /**
   * vNext: Emit ConcurrencyConflict event
   */
  private async emitConcurrencyConflictEvent(
    entityName: string,
    entityId: string,
    expectedVersion: number,
    actualVersion: number
  ): Promise<void> {
    const event: EmittedEvent = {
      name: 'ConcurrencyConflict',
      channel: 'system',
      payload: {
        entityType: entityName,
        entityId,
        expectedVersion,
        actualVersion,
        conflictCode: 'VERSION_MISMATCH',
        timestamp: this.getNow(),
      },
      timestamp: this.getNow(),
      provenance: this.getProvenanceInfo(),
    };

    this.eventLog.push(event);
    this.notifyListeners(event);
  }

  /**
   * vNext: Get provenance info for events
   */
  private getProvenanceInfo(): { contentHash: string; compilerVersion: string; schemaVersion: string } | undefined {
    const prov = this.ir.provenance;
    if (!prov) return undefined;
    return {
      contentHash: prov.contentHash,
      compilerVersion: prov.compilerVersion,
      schemaVersion: prov.schemaVersion,
    };
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

  /**
   * Static factory method to create a RuntimeEngine with optional provenance verification.
   * This is useful when you want to verify IR integrity before execution.
   *
   * In production mode (NODE_ENV=production), provenance verification is enabled by default.
   * Set `requireValidProvenance: false` to explicitly disable.
   *
   * @param ir - The IR to execute
   * @param context - Runtime context (user, etc.)
   * @param options - Runtime options including requireValidProvenance
   * @returns A tuple of [runtime, verificationResult]
   *
   * @example
   * ```ts
   * // Production: verification enabled by default
   * const [runtime, result] = await RuntimeEngine.create(ir, context);
   * if (!result.valid) {
   *   throw new Error(`Invalid IR: ${result.error}`);
   * }
   *
   * // Development: explicitly disable verification
   * const [runtime] = await RuntimeEngine.create(ir, context, { requireValidProvenance: false });
   * ```
   */
  static async create(
    ir: IR,
    context: RuntimeContext = {},
    options: RuntimeOptions = {}
  ): Promise<[RuntimeEngine, ProvenanceVerificationResult]> {
    const runtime = new RuntimeEngine(ir, context, options);
    let result: ProvenanceVerificationResult = { valid: true };

    // Default to true in production mode, or if explicitly set
    const shouldVerify = options.requireValidProvenance ?? isProductionMode();

    if (shouldVerify) {
      const isValid = await runtime.verifyIRHash(options.expectedIRHash);
      result = {
        valid: isValid,
        expectedHash: options.expectedIRHash || ir.provenance?.irHash,
      };

      if (!isValid) {
        result.error = 'IR hash verification failed';
      }
    }

    return [runtime, result];
  }
}
