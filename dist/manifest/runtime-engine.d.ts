import { IR, IRProvenance, IREntity, IRCommand, IRPolicy, IRExpression, ConstraintOutcome, OverrideRequest, ConcurrencyConflict } from './ir';
export interface RuntimeContext {
    user?: {
        id: string;
        role?: string;
        [key: string]: unknown;
    };
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
type EventListener = (event: EmittedEvent) => void;
export interface ProvenanceVerificationResult {
    valid: boolean;
    expectedHash?: string;
    computedHash?: string;
    error?: string;
}
export declare class RuntimeEngine {
    private ir;
    private context;
    private options;
    private stores;
    private eventListeners;
    private eventLog;
    /** Index of relationships for efficient lookup during expression evaluation */
    private relationshipIndex;
    /** Memoization cache for resolved relationships to avoid repeated store queries */
    private relationshipMemoCache;
    /** Track whether version has been incremented for the current command execution */
    private versionIncrementedForCommand;
    /** Track instances that were just created (to prevent version increment on subsequent mutate actions) */
    private justCreatedInstanceIds;
    constructor(ir: IR, context?: RuntimeContext, options?: RuntimeOptions);
    private initializeStores;
    /**
     * Build an index of all relationships for efficient lookup during expression evaluation.
     * Maps "EntityName.relationshipName" to relationship metadata.
     */
    private buildRelationshipIndex;
    /**
     * Clear the relationship memoization cache.
     * Called at the start of each command execution to ensure fresh data.
     */
    private clearMemoCache;
    /**
     * Resolve a relationship for a given instance.
     * Uses memoization cache to avoid repeated store queries within a single command execution.
     * @param entityName - The source entity name
     * @param instance - The source instance (must have an id)
     * @param relationshipName - The relationship name to resolve
     * @returns For hasMany: array of related instances; for hasOne/belongsTo/ref: single instance or null
     */
    private resolveRelationship;
    private getNow;
    private getBuiltins;
    getIR(): IR;
    /**
     * Get the provenance metadata from the IR
     */
    getProvenance(): IRProvenance | undefined;
    /**
     * Log provenance information at startup
     * This can be called by UI code to display provenance
     */
    logProvenance(): void;
    /**
     * Verify the IR integrity by checking that the computed hash matches the expected hash.
     * Returns true if verification passes, false otherwise.
     *
     * @param expectedHash - Optional expected hash. If not provided, uses the IR's self-reported irHash
     * @returns true if hash matches or if no hash is available to verify
     */
    verifyIRHash(expectedHash?: string): Promise<boolean>;
    /**
     * Verify IR and throw if invalid. Use this when requireValidProvenance is true.
     * @throws Error if IR hash verification fails
     */
    assertValidProvenance(): Promise<void>;
    getContext(): RuntimeContext;
    setContext(ctx: Partial<RuntimeContext>): void;
    replaceContext(ctx: RuntimeContext): void;
    getEntities(): IREntity[];
    getEntity(name: string): IREntity | undefined;
    getCommands(): IRCommand[];
    getCommand(name: string, entityName?: string): IRCommand | undefined;
    getPolicies(): IRPolicy[];
    getStore(entityName: string): Store | undefined;
    getAllInstances(entityName: string): Promise<EntityInstance[]>;
    getInstance(entityName: string, id: string): Promise<EntityInstance | undefined>;
    /**
     * Check entity constraints against instance data
     * Returns array of constraint failures (empty if all pass)
     * Useful for diagnostic purposes without mutating state
     */
    checkConstraints(entityName: string, data: Record<string, unknown>): Promise<ConstraintOutcome[]>;
    createInstance(entityName: string, data: Partial<EntityInstance>): Promise<EntityInstance | undefined>;
    updateInstance(entityName: string, id: string, data: Partial<EntityInstance>): Promise<EntityInstance | undefined>;
    deleteInstance(entityName: string, id: string): Promise<boolean>;
    runCommand(commandName: string, input: Record<string, unknown>, options?: {
        entityName?: string;
        instanceId?: string;
        overrideRequests?: OverrideRequest[];
    }): Promise<CommandResult>;
    private buildEvalContext;
    private checkPolicies;
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
    private validateConstraints;
    private extractContextKeys;
    private formatExpression;
    private formatValue;
    private resolveExpressionValues;
    private executeAction;
    evaluateExpression(expr: IRExpression, context: Record<string, unknown>): Promise<unknown>;
    private evaluateBinaryOp;
    private evaluateUnaryOp;
    private irValueToJs;
    private getDefaultForType;
    evaluateComputed(entityName: string, instanceId: string, propertyName: string): Promise<unknown>;
    private evaluateComputedInternal;
    /**
     * vNext: Interpolate template placeholders with values from context
     * Supports {placeholder} syntax where placeholders are resolved from:
     * 1. details mapping (if present)
     * 2. resolved expression values (by expression string)
     * 3. evaluation context (direct property access)
     */
    private interpolateTemplate;
    /**
     * vNext: Evaluate a single constraint and return detailed outcome
     */
    private evaluateConstraint;
    /**
     * vNext: Evaluate command constraints with override support
     * Returns allowed flag and all constraint outcomes
     */
    private evaluateCommandConstraints;
    /**
     * vNext: Validate override authorization via policy or default admin check
     */
    private validateOverrideAuthorization;
    /**
     * vNext: Emit OverrideApplied event for auditing
     */
    private emitOverrideAppliedEvent;
    /**
     * vNext: Emit ConcurrencyConflict event
     */
    private emitConcurrencyConflictEvent;
    /**
     * vNext: Get provenance info for events
     */
    private getProvenanceInfo;
    onEvent(listener: EventListener): () => void;
    private notifyListeners;
    getEventLog(): EmittedEvent[];
    clearEventLog(): void;
    serialize(): Promise<{
        ir: IR;
        context: RuntimeContext;
        stores: Record<string, EntityInstance[]>;
    }>;
    restore(data: {
        stores: Record<string, EntityInstance[]>;
    }): Promise<void>;
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
    static create(ir: IR, context?: RuntimeContext, options?: RuntimeOptions): Promise<[RuntimeEngine, ProvenanceVerificationResult]>;
}
export {};
//# sourceMappingURL=runtime-engine.d.ts.map