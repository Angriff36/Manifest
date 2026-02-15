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
  /** Caller-provided idempotency store for command deduplication */
  idempotencyStore?: IdempotencyStore;
  /**
   * If true, adapter actions (persist/publish/effect) throw ManifestEffectBoundaryError
   * instead of the default no-op behavior. Use for conformance testing and replay validation.
   * See docs/spec/adapters.md for the normative exception.
   */
  deterministicMode?: boolean;
  /** Optional complexity limits for expression evaluation */
  evaluationLimits?: EvaluationLimits;
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
  /** Caller-supplied correlation ID grouping related events across a workflow */
  correlationId?: string;
  /** Caller-supplied ID of the event/command that caused this command execution */
  causationId?: string;
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
  /** Caller-supplied correlation ID grouping related events across a workflow */
  correlationId?: string;
  /** Caller-supplied ID of the event/command that caused this emission */
  causationId?: string;
  /** Zero-based index of this event within the current runCommand invocation. Per-command only. */
  emitIndex?: number;
}

export interface Store<T extends EntityInstance = EntityInstance> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | undefined>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T | undefined>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<void>;
}

export interface IdempotencyStore {
  /** Check if a command with this key has already been executed */
  has(key: string): Promise<boolean>;
  /** Record a command result for an idempotency key */
  set(key: string, result: CommandResult): Promise<void>;
  /** Retrieve the cached result for an idempotency key */
  get(key: string): Promise<CommandResult | undefined>;
}

/**
 * Thrown when an adapter action (persist/publish/effect) is executed in deterministicMode.
 * This is a programming error, not a domain failure.
 * See docs/spec/adapters.md for the normative exception to default no-op behavior.
 */
export class ManifestEffectBoundaryError extends Error {
  readonly actionKind: string;
  constructor(actionKind: string) {
    super(
      `Action '${actionKind}' is not allowed in deterministicMode. ` +
      `Adapter actions (persist/publish/effect) must be handled externally. ` +
      `See docs/spec/adapters.md.`
    );
    this.name = 'ManifestEffectBoundaryError';
    this.actionKind = actionKind;
  }
}

/**
 * Thrown when expression evaluation exceeds configured depth or step limits.
 * This is a domain failure (caught and converted to CommandResult), not a programming error.
 * See docs/spec/manifest-vnext.md § "Diagnostic Payload Bounding".
 */
export class EvaluationBudgetExceededError extends Error {
  readonly limitType: 'depth' | 'steps';
  readonly limit: number;
  constructor(limitType: 'depth' | 'steps', limit: number) {
    super(`Evaluation budget exceeded: ${limitType} limit ${limit} reached`);
    this.name = 'EvaluationBudgetExceededError';
    this.limitType = limitType;
    this.limit = limit;
  }
}

/**
 * Optional complexity limits for expression evaluation.
 * Defaults are permissive — no existing programs should be affected.
 */
export interface EvaluationLimits {
  /** Maximum expression nesting depth. Default: 64 */
  maxExpressionDepth?: number;
  /** Maximum total evaluation steps per entry point. Default: 10_000 */
  maxEvaluationSteps?: number;
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

  /** Track whether version has been incremented for the current command execution */
  private versionIncrementedForCommand: boolean = false;

  /** Track instances that were just created (to prevent version increment on subsequent mutate actions) */
  private justCreatedInstanceIds: Set<string> = new Set();

  /** Last transition validation error (set by updateInstance, checked by _executeCommandInternal) */
  private lastTransitionError: string | null = null;

  /** Last concurrency conflict (set by updateInstance, checked by _executeCommandInternal) */
  private lastConcurrencyConflict: ConcurrencyConflict | null = null;

  /** Per-entry-point evaluation budget for bounded complexity enforcement */
  private evalBudget: { depth: number; steps: number; maxDepth: number; maxSteps: number } | null = null;

  /**
   * Initialize evaluation budget if not already active (re-entrant safe).
   * Returns true if this call initialized the budget (caller must clear it in finally).
   * Returns false if budget was already active (caller should NOT clear it).
   */
  private initEvalBudget(): boolean {
    if (this.evalBudget) return false; // Already active — re-entrant call
    this.evalBudget = {
      depth: 0,
      steps: 0,
      maxDepth: this.options.evaluationLimits?.maxExpressionDepth ?? 64,
      maxSteps: this.options.evaluationLimits?.maxEvaluationSteps ?? 10_000,
    };
    return true;
  }

  /** Clear evaluation budget (only call if initEvalBudget returned true) */
  private clearEvalBudget(): void {
    this.evalBudget = null;
  }

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
    // Provenance information is available via getProvenance() for programmatic access
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

      // Use deterministic JSON serialization with recursive key sorting (same as compiler).
      // A replacer function sorts object keys at every nesting level to ensure
      // the recomputed hash matches the compiler's hash for unmodified IR.
      const json = JSON.stringify(canonical, (_key: string, value: unknown) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const sorted: Record<string, unknown> = {};
          for (const k of Object.keys(value as Record<string, unknown>).sort()) {
            sorted[k] = (value as Record<string, unknown>)[k];
          }
          return sorted;
        }
        return value;
      });
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
  async checkConstraints(entityName: string, data: Record<string, unknown>): Promise<ConstraintOutcome[]> {
    const entity = this.getEntity(entityName);
    if (!entity) return [];
    const ownsEvalBudget = this.initEvalBudget();
    try {
      const outcomes = await this.validateConstraints(entity, data);
      // Return only failed constraints for backwards compatibility with test patterns
      // (Callers can still see all outcomes by using validateConstraints directly)
      return outcomes.filter(o => !o.passed);
    } finally {
      if (ownsEvalBudget) this.clearEvalBudget();
    }
  }

  async createInstance(entityName: string, data: Partial<EntityInstance>): Promise<EntityInstance | undefined> {
    const entity = this.getEntity(entityName);
    if (!entity) return undefined;

    const ownsEvalBudget = this.initEvalBudget();
    try {
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
      const constraintOutcomes = await this.validateConstraints(entity, mergedData);

      // Only block on severity='block' constraints that failed
      const blockingFailures = constraintOutcomes.filter(
        o => !o.passed && o.severity === 'block'
      );

      if (blockingFailures.length > 0) {
        // Log blocking constraint failures for diagnostics
        console.warn('[Manifest Runtime] Blocking constraint validation failed:', blockingFailures);
        return undefined;
      }

      // Log non-blocking outcomes (warn/ok) for diagnostics
      const nonBlockingOutcomes = constraintOutcomes.filter(o => !o.passed && o.severity !== 'block');
      if (nonBlockingOutcomes.length > 0) {
        console.info('[Manifest Runtime] Non-blocking constraint outcomes:', nonBlockingOutcomes);
      }

      const store = this.stores.get(entityName);
      if (!store) return undefined;

      const result = await store.create(mergedData);

      // Track newly created instance to prevent version increment on subsequent mutate actions
      if (result && result.id) {
        this.justCreatedInstanceIds.add(result.id);
      }

      return result;
    } finally {
      if (ownsEvalBudget) this.clearEvalBudget();
    }
  }

  async updateInstance(entityName: string, id: string, data: Partial<EntityInstance>): Promise<EntityInstance | undefined> {
    const entity = this.getEntity(entityName);
    const store = this.stores.get(entityName);
    if (!store || !entity) return undefined;

    const existing = await store.getById(id);
    if (!existing) return undefined;

    const ownsEvalBudget = this.initEvalBudget();
    try {
      // Optimistic concurrency control: check version if entity has versionProperty
      if (entity.versionProperty) {
        const existingVersion = existing[entity.versionProperty] as number | undefined;
        const providedVersion = data[entity.versionProperty] as number | undefined;

        if (existingVersion !== undefined && providedVersion !== undefined) {
          if (existingVersion !== providedVersion) {
            // Concurrency conflict - store structured details, emit event, and return undefined
            this.lastConcurrencyConflict = {
              entityType: entityName,
              entityId: id,
              expectedVersion: providedVersion,
              actualVersion: existingVersion,
              conflictCode: 'VERSION_MISMATCH',
            };
            await this.emitConcurrencyConflictEvent(entityName, id, providedVersion, existingVersion);
            return undefined;
          }
        }

        // Auto-increment version on successful update
        // Only increment once per command execution to handle commands with multiple mutate actions
        // If version is explicitly provided in data, use that (for optimistic concurrency checks)
        // Skip increment for instances that were just created in the same command (e.g., create command's mutate actions)
        const wasJustCreated = this.justCreatedInstanceIds.has(id);
        if (providedVersion === undefined && !this.versionIncrementedForCommand && !wasJustCreated) {
          data[entity.versionProperty] = (existingVersion || 0) + 1;
          this.versionIncrementedForCommand = true;
        }
      }

      // Update versionAt timestamp if present
      if (entity.versionAtProperty) {
        data[entity.versionAtProperty] = this.getNow();
      }

      const mergedData = { ...existing, ...data };

      // Validate state transitions if entity declares them
      if (entity.transitions && entity.transitions.length > 0) {
        for (const [prop, newValue] of Object.entries(data)) {
          const rules = entity.transitions.filter(t => t.property === prop);
          if (rules.length === 0) continue;
          const currentValue = existing[prop];
          if (currentValue === undefined) continue;
          const matchingRule = rules.find(t => t.from === String(currentValue));
          if (matchingRule && !matchingRule.to.includes(String(newValue))) {
            const allowed = matchingRule.to.map(v => `'${v}'`).join(', ');
            this.lastTransitionError = `Invalid state transition for '${prop}': '${currentValue}' -> '${newValue}' is not allowed. Allowed from '${currentValue}': [${allowed}]`;
            return undefined;
          }
        }
      }

      // Validate entity constraints
      const constraintOutcomes = await this.validateConstraints(entity, mergedData);

      // Only block on severity='block' constraints that failed
      const blockingFailures = constraintOutcomes.filter(
        o => !o.passed && o.severity === 'block'
      );

      if (blockingFailures.length > 0) {
        // Log blocking constraint failures for diagnostics
        console.warn('[Manifest Runtime] Blocking constraint validation failed:', blockingFailures);
        return undefined;
      }

      // Log non-blocking outcomes (warn/ok) for diagnostics
      const nonBlockingOutcomes = constraintOutcomes.filter(o => !o.passed && o.severity !== 'block');
      if (nonBlockingOutcomes.length > 0) {
        console.info('[Manifest Runtime] Non-blocking constraint outcomes:', nonBlockingOutcomes);
      }

      return await store.update(id, data);
    } finally {
      if (ownsEvalBudget) this.clearEvalBudget();
    }
  }

  async deleteInstance(entityName: string, id: string): Promise<boolean> {
    const store = this.stores.get(entityName);
    return store ? await store.delete(id) : false;
  }

  async runCommand(
    commandName: string,
    input: Record<string, unknown>,
    options: {
      entityName?: string;
      instanceId?: string;
      overrideRequests?: OverrideRequest[];
      /** Correlation ID for workflow event grouping */
      correlationId?: string;
      /** Causation ID linking this command to its trigger */
      causationId?: string;
      /** Caller-provided idempotency key for dedup. Required if idempotencyStore is configured. */
      idempotencyKey?: string;
    } = {}
  ): Promise<CommandResult> {
    // Idempotency short-circuit (before ANY evaluation)
    if (this.options.idempotencyStore) {
      if (options.idempotencyKey === undefined) {
        return {
          success: false,
          error: 'IdempotencyStore is configured but no idempotencyKey was provided',
          emittedEvents: [],
        };
      }
      const cached = await this.options.idempotencyStore.get(options.idempotencyKey);
      if (cached !== undefined) {
        return cached;
      }
    }

    // Full command execution
    const result = await this._executeCommandInternal(commandName, input, options);

    // Cache result (success OR failure)
    if (this.options.idempotencyStore && options.idempotencyKey !== undefined) {
      await this.options.idempotencyStore.set(options.idempotencyKey, result);
    }

    return result;
  }

  private async _executeCommandInternal(
    commandName: string,
    input: Record<string, unknown>,
    options: {
      entityName?: string;
      instanceId?: string;
      overrideRequests?: OverrideRequest[];
      correlationId?: string;
      causationId?: string;
      idempotencyKey?: string;
    }
  ): Promise<CommandResult> {
    // Clear relationship memoization cache at the start of each command execution
    // to ensure fresh data after any mutations
    this.clearMemoCache();

    // Reset version increment flag at the start of each command execution
    this.versionIncrementedForCommand = false;

    // Clear just-created instance tracking
    this.justCreatedInstanceIds.clear();

    // Clear transition error tracking
    this.lastTransitionError = null;

    // Clear concurrency conflict tracking
    this.lastConcurrencyConflict = null;

    // Initialize evaluation budget for bounded complexity enforcement
    const ownsEvalBudget = this.initEvalBudget();
    try {

    const command = this.getCommand(commandName, options.entityName);
    if (!command) {
      return {
        success: false,
        error: `Command '${commandName}' not found`,
        ...(options.correlationId !== undefined ? { correlationId: options.correlationId } : {}),
        ...(options.causationId !== undefined ? { causationId: options.causationId } : {}),
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
        ...(options.correlationId !== undefined ? { correlationId: options.correlationId } : {}),
        ...(options.causationId !== undefined ? { causationId: options.causationId } : {}),
        emittedEvents: [],
      };
    }

    // vNext: Evaluate command constraints (after policies, before guards)
    // Pass command context so OverrideApplied events include commandName/entityName/instanceId per spec
    const commandContext = { commandName, entityName: options.entityName, instanceId: options.instanceId };
    const constraintResult = await this.evaluateCommandConstraints(command, evalContext, options.overrideRequests, commandContext);
    if (!constraintResult.allowed) {
      // Find the blocking constraint for the error message
      const blocking = constraintResult.outcomes.find(o => !o.passed && !o.overridden && o.severity === 'block');
      return {
        success: false,
        error: blocking?.message || `Command blocked by constraint '${blocking?.constraintName}'`,
        constraintOutcomes: constraintResult.outcomes,
        overrideRequests: options.overrideRequests,
        ...(options.correlationId !== undefined ? { correlationId: options.correlationId } : {}),
        ...(options.causationId !== undefined ? { causationId: options.causationId } : {}),
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
          ...(options.correlationId !== undefined ? { correlationId: options.correlationId } : {}),
          ...(options.causationId !== undefined ? { causationId: options.causationId } : {}),
          emittedEvents: [],
        };
      }
    }

    // Include any OverrideApplied events from constraint evaluation
    // Per spec: OverrideApplied events are included in CommandResult.emittedEvents
    // alongside command-declared events (override events come first)
    const emittedEvents: EmittedEvent[] = [...constraintResult.overrideEvents];
    let result: unknown;
    const emitCounter = { value: emittedEvents.length };
    const workflowMeta = {
      correlationId: options.correlationId,
      causationId: options.causationId,
    };

    for (const action of command.actions) {
      const actionResult = await this.executeAction(action, evalContext, options, emitCounter, workflowMeta);

      // Check for transition validation errors after mutate/compute actions
      if (this.lastTransitionError) {
        return {
          success: false,
          error: this.lastTransitionError,
          ...(workflowMeta.correlationId !== undefined ? { correlationId: workflowMeta.correlationId } : {}),
          ...(workflowMeta.causationId !== undefined ? { causationId: workflowMeta.causationId } : {}),
          emittedEvents: [],
        };
      }

      // Check for concurrency conflict after mutate/compute actions
      // Per spec: "Commands receiving a ConcurrencyConflict MUST NOT apply mutations"
      if (this.lastConcurrencyConflict) {
        const conflict: ConcurrencyConflict = this.lastConcurrencyConflict;
        this.lastConcurrencyConflict = null;
        return {
          success: false,
          error: `Concurrency conflict on ${conflict.entityType}#${conflict.entityId}: expected version ${conflict.expectedVersion}, actual ${conflict.actualVersion}`,
          concurrencyConflict: conflict,
          ...(workflowMeta.correlationId !== undefined ? { correlationId: workflowMeta.correlationId } : {}),
          ...(workflowMeta.causationId !== undefined ? { causationId: workflowMeta.causationId } : {}),
          emittedEvents: [],
        };
      }

      if ((action.kind === 'mutate' || action.kind === 'compute') && options.instanceId && options.entityName) {
        const currentInstance = await this.getInstance(options.entityName, options.instanceId);
        // Enrich re-fetched instance with _entity for relationship resolution
        const enriched = currentInstance ? { ...currentInstance, _entity: options.entityName } : currentInstance;
        // Refresh both self/this bindings and spread instance properties into evalContext
        evalContext.self = enriched;
        evalContext.this = enriched;
        Object.assign(evalContext, enriched);
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
        ...(workflowMeta.correlationId !== undefined ? { correlationId: workflowMeta.correlationId } : {}),
        ...(workflowMeta.causationId !== undefined ? { causationId: workflowMeta.causationId } : {}),
        emitIndex: emitCounter.value++,
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
      ...(workflowMeta.correlationId !== undefined ? { correlationId: workflowMeta.correlationId } : {}),
      ...(workflowMeta.causationId !== undefined ? { causationId: workflowMeta.causationId } : {}),
      emittedEvents,
    };

    } catch (e) {
      if (e instanceof EvaluationBudgetExceededError) {
        return {
          success: false,
          error: e.message,
          ...(options.correlationId !== undefined ? { correlationId: options.correlationId } : {}),
          ...(options.causationId !== undefined ? { causationId: options.causationId } : {}),
          emittedEvents: [],
        };
      }
      throw e; // re-throw other errors (ManifestEffectBoundaryError, etc.)
    } finally {
      if (ownsEvalBudget) this.clearEvalBudget();
    }
  }

  private buildEvalContext(
    input: Record<string, unknown>,
    instance?: EntityInstance,
    entityName?: string
  ): Record<string, unknown> {
    // Enrich instance with _entity metadata so relationship resolution works
    // when the member expression handler reads _entity from self/this
    const enrichedInstance = (instance && entityName)
      ? { ...instance, _entity: entityName }
      : instance;
    const baseContext = {
      ...(enrichedInstance || {}),
      ...input,
      self: enrichedInstance ?? null,
      this: enrichedInstance ?? null,
      user: this.context.user ?? null,
      context: this.context ?? {},
    };

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
  ): Promise<ConstraintOutcome[]> {
    const outcomes: ConstraintOutcome[] = [];

    // Enrich instance with _entity metadata so relationship resolution works
    // when the member expression handler reads _entity from self/this
    const enrichedData = { ...instanceData, _entity: entity.name };
    const evalContext = {
      ...enrichedData,
      self: enrichedData,
      this: enrichedData,
      user: this.context.user ?? null,
      context: this.context ?? {},
    };

    // Use evaluateConstraint to build proper ConstraintOutcome objects
    for (const constraint of entity.constraints) {
      const outcome = await this.evaluateConstraint(constraint, evalContext);
      outcomes.push(outcome);
    }

    return outcomes;
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
    options: { entityName?: string; instanceId?: string },
    emitCounter: { value: number },
    workflowMeta: { correlationId?: string; causationId?: string }
  ): Promise<unknown> {
    // Effect boundary enforcement: in deterministicMode, adapter actions hard-error
    if (this.options.deterministicMode &&
        (action.kind === 'persist' || action.kind === 'publish' || action.kind === 'effect')) {
      throw new ManifestEffectBoundaryError(action.kind);
    }

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
          ...(workflowMeta.correlationId !== undefined ? { correlationId: workflowMeta.correlationId } : {}),
          ...(workflowMeta.causationId !== undefined ? { causationId: workflowMeta.causationId } : {}),
          emitIndex: emitCounter.value++,
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
    // Bounded complexity enforcement
    if (this.evalBudget) {
      this.evalBudget.steps++;
      if (this.evalBudget.steps > this.evalBudget.maxSteps) {
        throw new EvaluationBudgetExceededError('steps', this.evalBudget.maxSteps);
      }
      this.evalBudget.depth++;
      if (this.evalBudget.depth > this.evalBudget.maxDepth) {
        throw new EvaluationBudgetExceededError('depth', this.evalBudget.maxDepth);
      }
    }
    try {
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
    } finally {
      if (this.evalBudget) {
        this.evalBudget.depth--;
      }
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

    const ownsEvalBudget = this.initEvalBudget();
    try {
      return await this.evaluateComputedInternal(entity, instance, propertyName, new Set());
    } finally {
      if (ownsEvalBudget) this.clearEvalBudget();
    }
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

    // Enrich instance with _entity metadata so relationship resolution works
    // when the member expression handler reads _entity from self/this
    const enrichedInstance = { ...instance, _entity: entity.name };
    const context = {
      self: enrichedInstance,
      this: enrichedInstance,
      ...enrichedInstance,
      ...computedValues,
      user: this.context.user ?? null,
      context: this.context ?? {},
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
   * Returns allowed flag, all constraint outcomes, and any OverrideApplied events.
   * Per spec (manifest-vnext.md § OverrideApplied Event Shape):
   * OverrideApplied events MUST be included in CommandResult.emittedEvents.
   */
  private async evaluateCommandConstraints(
    command: IRCommand,
    evalContext: Record<string, unknown>,
    overrideRequests?: OverrideRequest[],
    commandContext?: { commandName: string; entityName?: string; instanceId?: string }
  ): Promise<{ allowed: boolean; outcomes: ConstraintOutcome[]; overrideEvents: EmittedEvent[] }> {
    const outcomes: ConstraintOutcome[] = [];
    const overrideEvents: EmittedEvent[] = [];

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
              const event = this.buildOverrideAppliedEvent(constraint, overrideReq, commandContext);
              overrideEvents.push(event);
              this.eventLog.push(event);
              this.notifyListeners(event);
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
        return { allowed: false, outcomes, overrideEvents };
      }
    }

    return { allowed: true, outcomes, overrideEvents };
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
   * vNext: Build OverrideApplied event for auditing.
   * Per spec (manifest-vnext.md § OverrideApplied Event Shape):
   * payload MUST contain: constraintCode, reason, authorizedBy, timestamp, commandName,
   * and optionally entityName, instanceId.
   * The event is a runtime-synthesized event included in CommandResult.emittedEvents.
   */
  private buildOverrideAppliedEvent(
    constraint: IRConstraint,
    overrideReq: OverrideRequest,
    commandContext?: { commandName: string; entityName?: string; instanceId?: string }
  ): EmittedEvent {
    const payload: Record<string, unknown> = {
      constraintCode: constraint.code,
      reason: overrideReq.reason,
      authorizedBy: overrideReq.authorizedBy,
      timestamp: this.getNow(),
      commandName: commandContext?.commandName || '',
    };
    if (commandContext?.entityName) {
      payload.entityName = commandContext.entityName;
    }
    if (commandContext?.instanceId) {
      payload.instanceId = commandContext.instanceId;
    }

    return {
      name: 'OverrideApplied',
      channel: 'system',
      payload,
      timestamp: this.getNow(),
      provenance: this.getProvenanceInfo(),
    };
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
