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
  IRForeignKey,
  ConstraintOutcome,
  OverrideRequest,
  ConcurrencyConflict,
  IRApproval,
  IRRole,
  IRSaga,
  IRProperty,
  JobQueue,
  JobRecord,
} from './ir';
import { dateOf, timeOf, datetimeOf, isValidDateString, isValidTimeString } from './date-time.js';
import { applyMaskStrategy } from './masking.js';
import { constraintExpressionPasses } from './constraint-polarity.js';
import { RateLimiter, type RateLimitStore } from './runtime-rate-limit.js';
import {
  EventSourcedStore,
  eventSourcedOptionsFromConfig,
} from './stores/event-sourced.js';

import {
  checkRateLimitGate,
  executeWithRetry,
  policyHasRateLimit,
} from './runtime-command-extensions.js';
import { getSchedulesFromIR } from './runtime-schedule.js';
import type { IRSchedule } from './ir';
import { RuntimeProfilingBridge } from './runtime-profiling-bridge.js';
import type { EventBus, EventBusMessage } from './events/event-bus';
import {
  ReferentialActionApplier,
  ManifestReferentialRestrictError,
  ManifestReferentialSetNullError,
} from './runtime-referential-actions.js';

export { ManifestReferentialRestrictError, ManifestReferentialSetNullError };

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

/**
 * Spec-guaranteed runtime context bindings (see docs/spec/semantics.md
 * § "Runtime Context Schema" and docs/spec/builtins.md § "Context Member
 * Access"). Every typed field is optional at the type level; per spec,
 * tenant-scoped commands MUST fail closed with `MISSING_TENANT_CONTEXT`
 * when `tenantId` is absent and `requireTenantContext` is set on
 * RuntimeOptions.
 *
 * The index signature is preserved for backwards compatibility — existing
 * callers may attach ad-hoc keys without a type-level change.
 */
export interface RuntimeContext {
  /** Active tenant identifier. Required for tenant-scoped commands. */
  tenantId?: string;
  /** Active organization identifier (e.g. Clerk orgId). */
  orgId?: string;
  /** Acting user identifier. */
  actorId?: string;
  /** Caller-supplied request id; surfaces in diagnostics and emitted events. */
  requestId?: string;
  /** Origin surface: 'route' | 'job' | 'cli' | 'test' | 'ui' | 'workflow' (or other). */
  source?: string;
  /** If true, adapter actions throw ManifestEffectBoundaryError. options.deterministicMode wins if both set. */
  deterministic?: boolean;
  /** Legacy actor shorthand. Prefer `actorId` for new code. */
  user?: { id: string; role?: string; [key: string]: unknown };
  /** Open extension surface; legacy callers still rely on free keys. */
  [key: string]: unknown;
}

/**
 * Pluggable encryption provider for field-level encryption.
 * When supplied via RuntimeOptions.encryptionProvider, properties with the
 * `encrypted` modifier are transparently encrypted on write and decrypted
 * on read at the store boundary. The envelope format supports key rotation:
 * `{"v":1,"kid":"<keyId>","ct":"<ciphertext>"}`.
 */
export interface EncryptionProvider {
  encrypt(plaintext: string): Promise<{ ciphertext: string; keyId: string }>;
  decrypt(ciphertext: string, keyId: string): Promise<string>;
}

/**
 * Middleware hook types. Each corresponds to a lifecycle point in command
 * execution where middleware can observe, patch context, or short-circuit.
 */
export type MiddlewareHook = 'before-policy' | 'before-guard' | 'before-action' | 'after-emit';

/**
 * Context passed to middleware handlers at each lifecycle points.
 */
export interface MiddlewareContext {
  /** Which lifecycle hook triggered this middleware call */
  hook: MiddlewareHook;
  /** The IR command being executed */
  command: IRCommand;
  /** The current expression evaluation context (read/write via contextPatch) */
  evalContext: Record<string, unknown>;
  /** The original input to the command */
  input: Record<string, unknown>;
  /** The runtime context (user, tenantId, etc.) */
  runtimeContext: RuntimeContext;
  /** Entity name, if applicable */
  entityName?: string;
  /** Instance ID, if applicable */
  instanceId?: string;
  /** Events emitted so far (populated in after-emit hook) */
  emittedEvents: EmittedEvent[];
}

/**
 * Result returned by a middleware handler.
 * - Empty object `{}` means "continue normally".
 * - `contextPatch` merges additional values into the evalContext.
 * - `shortCircuit` immediately returns the provided CommandResult.
 */
export interface MiddlewareResult {
  contextPatch?: Record<string, unknown>;
  shortCircuit?: boolean;
  result?: CommandResult;
}

/**
 * A middleware instance: declares which hooks it participates in and
 * a handler function called at each matching lifecycle points.
 */
export interface Middleware {
  hooks: MiddlewareHook[];
  handler: (ctx: MiddlewareContext) => Promise<MiddlewareResult>;
}

export interface RuntimeOptions {
  generateId?: () => string;
  now?: () => number;
  /**
   * Optional middleware pipeline. Middleware are executed in declaration order
   * at each matching lifecycle hook during command execution.
   */
  middleware?: Middleware[];
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
  /**
   * If true, any `runCommand` invocation MUST fail closed with diagnostic
   * `MISSING_TENANT_CONTEXT` when `context.tenantId` is absent or empty.
   * Use to enforce tenant-scoped command semantics in multi-tenant apps.
   * Default: false (backwards compatible — legacy callers unaffected).
   */
  requireTenantContext?: boolean;
  /**
   * Optional custom builtin functions from plugins or project configuration.
   * These are merged with core builtins; core builtins always take precedence
   * on name collision. Populated by the plugin loader from BuiltinFunctionPlugin
   * registrations.
   *
   * @see plugin-api.ts BuiltinFunctionPlugin
   */
  customBuiltins?: Map<string, (...args: unknown[]) => unknown>;
  /**
   * Optional AuditSink for durable audit records.
   * When supplied, the runtime is contracted to call sink.emit() exactly
   * once per command invocation. Contract: src/manifest/audit/audit-sink.ts.
   * Wire-in is contract-only in this release; actual emission lands in
   * the audit/outbox implementation follow-on.
   */
  auditSink?: import('./audit/audit-sink').AuditSink;
  /**
   * Optional OutboxStore for transactional event persistence.
   * Contract: src/manifest/outbox/outbox-store.ts. Contract-only wire-in
   * in this release; transactional integration lands in the follow-on.
   */
  outboxStore?: import('./outbox/outbox-store').OutboxStore;
  /**
   * Optional durable ApprovalStore for multi-stage approval persistence.
   * When supplied, pending approval requests, stage grants, and denials are
   * read from and written to this store, so an approval created by one
   * engine instance is visible to a freshly-constructed engine (the normal
   * stateless-per-request pattern). When omitted, approval state lives in an
   * in-process Map (single-process / test use only).
   * Contract: src/manifest/approval/approval-store.ts. Memory + Postgres
   * adapters ship via "./approval/memory" and "./approval/postgres".
   */
  approvalStore?: import('./approval/approval-store').ApprovalStore;
  /**
   * Optional durable RateLimitStore for command/policy rate-limit buckets.
   * When omitted, an in-process {@link MemoryRateLimitStore} is used (limits
   * reset on process restart and do not span engine instances). When set,
   * sliding-window state is read/written through this store so multi-instance
   * deployments share the same counters.
   * Contract: `RateLimitStore` in `runtime-rate-limit.ts`. Memory + Postgres
   * adapters: `./rate-limit/memory`, `./rate-limit/postgres`.
   */
  rateLimitStore?: RateLimitStore;
  /**
   * Optional static feature-flag map. Checked by `flag(name)` when no
   * `flagProvider` is set (or as a fallback when the provider is absent).
   * Missing keys resolve to `false` (safe default — features off).
   * When both `flags` and `flagProvider` are set, `flagProvider` wins.
   */
  flags?: Record<string, unknown>;
  /**
   * Optional feature flag provider function.
   * Called with a flag name and returns the flag value (boolean, string, number, or object).
   * Enables the `flag(name)` built-in to resolve feature flags declaratively
   * from any provider (LaunchDarkly, Unleash, JSON file, etc.).
   *
   * When not provided, `flag(name)` returns `false` (safe default — features off)
   * unless a matching entry exists in {@link flags}.
   *
   * @example
   * ```typescript
   * const runtime = new RuntimeEngine(ir, context, {
   *   flagProvider: (name) => launchDarklyClient.variation(name, false),
   * });
   * ```
   */
  flagProvider?: (name: string) => unknown;
  /**
   * Optional JobQueue for async command execution.
   * When an async command is invoked, the runtime enqueues a job and returns
   * a JobId immediately. Use `drainJobs()` for deterministic testing.
   */
  jobQueue?: JobQueue;
  /**
   * Optional TransactionProvider that gives commands an atomic write boundary.
   * When supplied, the runtime opens one transaction per command attempt and
   * threads the handle into every store, outbox, idempotency, job, and approval
   * write, so a command's mutations + outbox entries + idempotency record commit
   * or roll back together. Reactions/sagas invoked during the command join the
   * same transaction. Without it, behavior is unchanged (outbox enqueue is
   * best-effort / fail-open). Contract + semantics: docs/spec/adapters.md
   * § "Transaction Provider" and § "Outbox Store — Transaction Boundary".
   */
  transactionProvider?: TransactionProvider;
  /**
   * Optional cross-instance EventBus. When supplied, the engine publishes one
   * message per committed command (the full parent + reaction event batch) to
   * the bus, and — after `connectEventBus()` — re-dispatches remote messages to
   * local onEvent/subscribe listeners. Enables realtime fan-out across
   * serverless / multi-instance deployments; without it the event stream stays
   * single-instance. Publish is post-commit and fail-open (a publish failure is
   * logged, never fails the command). Contract + semantics:
   * docs/spec/adapters.md § "Event Bus" and docs/spec/semantics.md
   * § "Cross-instance delivery".
   */
  eventBus?: EventBus;
  /**
   * Optional WASM expression evaluator for near-native execution speed.
   * When provided, the runtime will use the WASM module for expression
   * evaluation and constraint validation. Falls back to the TypeScript
   * evaluator transparently if the WASM module fails to load or evaluate.
   *
   * The WASM evaluator maintains identical semantics to the TypeScript
   * implementation, so swapping in/out is safe and observable only via
   * performance characteristics.
   *
   * @see src/manifest/wasm/wasm-evaluator.ts
   */
  wasmEvaluator?: import('./wasm/wasm-evaluator').WasmExpressionEvaluator;
  /**
   * Optional encryption provider for field-level encryption.
   * When supplied, properties with the `encrypted` modifier are transparently
   * encrypted before store writes and decrypted after store reads.
   * No-op when omitted (plaintext stored — safe for dev/test).
   */
  encryptionProvider?: EncryptionProvider;
  /**
   * Optional profiling configuration. When enabled, the runtime collects
   * per-phase timing data for each command execution. Profiles are
   * accessible via `engine.getProfiles()`.
   */
  profiling?: import('./profiling').ProfilingOptions;
  /** Optional per-action trace hook for @angriff36/manifest/debug CommandTraceRecorder */
  actionTraceHook?: (info: {
    index: number;
    kind: string;
    target?: string;
    entityName?: string;
    instanceId?: string;
  }) => void | Promise<void>;
  /** Injectable sleep for deterministic retry backoff in tests/adapters */
  sleep?: (ms: number) => Promise<void>;
  /** Deterministic jitter override for retry delays (used when retry.jitter is true) */
  retryJitter?: (delayMs: number) => number;
  /**
   * Host side-effect dispatcher for `effect` actions. Invoked (outside
   * deterministic mode) with the evaluated expression value and action/command
   * context; its resolved value becomes the action result. Absent handler ⇒
   * the effect action fails closed with MISSING_EFFECT_HANDLER.
   */
  effectHandler?: (info: {
    /** action.target when present (names the effect), else undefined */
    name?: string;
    /** evaluated action expression value */
    value: unknown;
    commandName: string;
    entityName?: string;
    instanceId?: string;
    context: RuntimeContext;
  }) => Promise<unknown> | unknown;
}

// Re-export adapter contract types at the package root so consumers can do
// `import type { AuditSink, OutboxStore } from '@angriff36/manifest'`
// without reaching into deep subpaths. Concrete implementations
// (MemoryAuditSink, PostgresAuditSink, MemoryOutboxStore,
// PostgresOutboxStore) ship via dedicated subpath exports — see
// package.json `exports` § "./audit/memory", "./audit/postgres",
// "./outbox/memory", "./outbox/postgres".
export type { AuditSink, AuditRecord, CommandOutcome } from './audit/audit-sink';
export type { OutboxStore, OutboxEntry, OutboxEntryStatus } from './outbox/outbox-store';
export type { ApprovalStore } from './approval/approval-store';
export type { JobQueue, JobRecord } from './ir';
export type { EventBus, EventBusMessage, EventBusHandler } from './events/event-bus';

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
  instance?: EntityInstance;
  error?: string;
  deniedBy?: string;
  guardFailure?: GuardFailure;
  policyDenial?: PolicyDenial;
  /** Missing required command parameter (fails before rate-limit/policy/guard). */
  parameterFailure?: ParameterFailure;
  /** All constraint evaluation outcomes (vNext) */
  constraintOutcomes?: ConstraintOutcome[];
  /** Pending override requests (vNext) */
  overrideRequests?: OverrideRequest[];
  /** Concurrency conflict details (vNext) */
  concurrencyConflict?: ConcurrencyConflict;
  /** Approval workflow required before command can execute */
  approvalRequired?: ApprovalRequiredInfo;
  /** Caller-supplied correlation ID grouping related events across a workflow */
  correlationId?: string;
  /** Caller-supplied ID of the event/command that caused this command execution */
  causationId?: string;
  emittedEvents: EmittedEvent[];
  /** Retry metadata when command declares a retry policy */
  retry?: {
    attempts: number;
    exhausted: boolean;
    lastErrorCode?: string;
    delaysMs: number[];
  };
  /** Rate limit denial when a command or policy rate limiter blocks execution */
  rateLimitDenial?: {
    scope: 'user' | 'tenant' | 'global';
    scopeKey: string;
    limit: number;
    windowMs: number;
    retryAfterMs: number;
  };
}

export interface GuardFailure {
  index: number;
  expression: IRExpression;
  formatted: string;
  resolved?: GuardResolvedValue[];
}

export interface ParameterFailure {
  /** Name of the missing required parameter. */
  parameter: string;
  /** Declared parameter type name, when available. */
  expectedType?: string;
  /**
   * Machine-readable failure code. Defaults to MISSING_REQUIRED_PARAMETER
   * when absent. Trusted-source injection failures use MISSING_TRUSTED_CONTEXT.
   */
  code?: 'MISSING_REQUIRED_PARAMETER' | 'MISSING_TRUSTED_CONTEXT';
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

// ─── Approval Workflow Types ─────────────────────────────────────────

export interface ApprovalGrant {
  stage: string;
  by: string;
  at: number;
}

export interface ApprovalRequestState {
  entity: string;
  instanceId: string;
  approvalName: string;
  command: string;
  status: 'pending' | 'granted' | 'denied' | 'expired';
  /** Stages whose `when` condition evaluated true (or had no `when`) */
  requiredStages: string[];
  grants: ApprovalGrant[];
  requestedAt: number;
  expiresAt?: number;
  deniedReason?: string;
  deniedBy?: string;
}

/**
 * Identity of a user approving a stage. A bare string is the legacy form
 * where the userId doubles as the role (kept for backward compatibility).
 * Prefer the object form to express real RBAC — `role`/`roles`/permissions
 * are made available to the stage policy as `user.*`, independent of `id`.
 */
export type ApprovalApprover =
  string | { id: string; role?: string; roles?: string[]; [key: string]: unknown };

export interface ApprovalRequiredInfo {
  approvalName: string;
  pendingStages: string[];
  requestKey: string;
}

/**
 * Canonical subject metadata identifying the originating entity, command,
 * and target instance for an emitted event. Populated by the runtime during
 * `runCommand` so downstream consumers can reliably route and correlate
 * events without inspecting payload internals.
 */
export interface EventSubject {
  /** The Manifest entity name associated with the command, when available. */
  entity?: string;
  /** The Manifest command name that emitted the event. */
  command: string;
  /** The canonical target instance id, resolved deterministically. */
  id?: string;
}

export interface EmittedEvent {
  name: string;
  channel: string;
  payload: unknown;
  timestamp: number;
  /** Canonical subject metadata for the originating entity/command/instance. */
  subject?: EventSubject;
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

// ─── Saga Orchestration Types ────────────────────────────────────────

export interface SagaStepResult {
  step: string;
  command: string;
  /**
   * - `completed`           — forward command succeeded
   * - `failed`              — forward command failed (the step that triggered compensation)
   * - `compensated`         — forward command was successfully reversed by its compensation
   * - `compensation_failed` — a compensation was attempted but failed its guard/policy or threw;
   *                           the step is NOT considered reversed (potential dangling state)
   * - `skipped`             — completed step had no compensation declared (nothing to reverse)
   */
  status: 'completed' | 'failed' | 'compensated' | 'compensation_failed' | 'skipped';
  result?: CommandResult;
  compensation?: CommandResult;
  error?: string;
}

export interface SagaResult {
  saga: string;
  success: boolean;
  status: 'completed' | 'compensated' | 'aborted';
  steps: SagaStepResult[];
  emittedEvents: EmittedEvent[];
  failedStep?: string;
  error?: string;
}

/**
 * Opaque handle for an open transaction. Adapters that share the provider's
 * underlying database understand it (e.g. a pg PoolClient); everyone else
 * ignores it.
 */
export type TransactionHandle = unknown;

export interface TransactionProvider {
  /** Run fn inside a single transaction: begin → fn(tx) → commit. Any throw
   * from fn rolls back and rethrows. The engine never nests calls. */
  withTransaction<T>(fn: (tx: TransactionHandle) => Promise<T>): Promise<T>;
}

export interface Store<T extends EntityInstance = EntityInstance> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | undefined>;
  create(data: Partial<T>, tx?: TransactionHandle): Promise<T>;
  update(id: string, data: Partial<T>, tx?: TransactionHandle): Promise<T | undefined>;
  delete(id: string, tx?: TransactionHandle): Promise<boolean>;
  clear(): Promise<void>;
}

export interface IdempotencyStore {
  /** Check if a command with this key has already been executed */
  has(key: string): Promise<boolean>;
  /** Record a command result for an idempotency key. When the runtime is driving
   * a TransactionProvider it threads the active handle so the record is written
   * inside the command's transaction. */
  set(key: string, result: CommandResult, tx?: TransactionHandle): Promise<void>;
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
        `See docs/spec/adapters.md.`,
    );
    this.name = 'ManifestEffectBoundaryError';
    this.actionKind = actionKind;
  }
}

/**
 * Thrown when reaction cascading exceeds the maximum depth (default: 10).
 * Indicates a potential infinite loop in reaction chains.
 * See docs/spec/semantics.md § "Reactions".
 */
export class ManifestReactionDepthError extends Error {
  readonly depth: number;
  readonly triggerEvent: string;
  readonly targetCommand: string;
  constructor(depth: number, triggerEvent: string, targetCommand: string) {
    super(
      `Reaction depth limit (${depth}) exceeded. ` +
        `Event '${triggerEvent}' → command '${targetCommand}' would exceed max depth. ` +
        `Check for circular reaction chains.`,
    );
    this.name = 'ManifestReactionDepthError';
    this.depth = depth;
    this.triggerEvent = triggerEvent;
    this.targetCommand = targetCommand;
  }
}

/**
 * Internal marker for an OutboxStore.enqueue failure that occurred inside a
 * command transaction (provider mode). It is thrown so the transaction rolls
 * back, then caught in runCommand and converted to an OUTBOX_ENQUEUE_FAILED
 * CommandResult. Not exported: outside provider mode the enqueue stays
 * fail-open and this is never constructed.
 */
class OutboxEnqueueError extends Error {
  readonly cause: unknown;
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'OutboxEnqueueError';
    this.cause = cause;
  }
}

/**
 * Internal marker thrown from inside a command transaction to force a rollback
 * when the command produced a clean (non-thrown) failure result. It carries the
 * result so runCommand can return it after the transaction has rolled back.
 * Never escapes runCommand.
 */
const TX_ROLLBACK = Symbol('manifest.tx.rollback');

/**
 * In-memory JobQueue implementation for async commands.
 * Suitable for testing and development. Production deployments should
 * provide a durable implementation (e.g. database-backed).
 */
export class MemoryJobQueue implements JobQueue {
  private jobs: JobRecord[] = [];

  async enqueue(job: JobRecord): Promise<void> {
    this.jobs.push({ ...job });
  }

  async drainPending(): Promise<JobRecord[]> {
    const pending = this.jobs.filter((j) => j.status === 'pending');
    for (const job of pending) {
      job.status = 'running';
    }
    return pending;
  }

  async updateStatus(
    jobId: string,
    status: JobRecord['status'],
    detail?: { result?: unknown; error?: string },
  ): Promise<void> {
    const job = this.jobs.find((j) => j.jobId === jobId);
    if (job) {
      job.status = status;
      if (detail) {
        (job as JobRecord & { result?: unknown; error?: string }).result = detail.result;
        (job as JobRecord & { result?: unknown; error?: string }).error = detail.error;
      }
    }
  }

  /** Test utility: get all jobs */
  getAll(): JobRecord[] {
    return [...this.jobs];
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
    return this.load().find((item) => item.id === id);
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
    const idx = items.findIndex((item) => item.id === id);
    if (idx === -1) return undefined;
    const updated = { ...items[idx], ...data, id };
    items[idx] = updated;
    this.save(items);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const items = this.load();
    const idx = items.findIndex((item) => item.id === id);
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
  /** Current reaction nesting depth to prevent infinite loops */
  private reactionDepth = 0;
  private static readonly MAX_REACTION_DEPTH = 10;
  /** Index of relationships for efficient lookup during expression evaluation */
  private relationshipIndex: Map<
    string,
    {
      entityName: string;
      relationshipName: string;
      kind: 'hasMany' | 'hasOne' | 'belongsTo' | 'ref';
      targetEntity: string;
      foreignKey?: string; // single-column FK field name for runtime lookup
      through?: string; // join entity for hasMany many-to-many
    }
  > = new Map();

  /** Memoization cache for resolved relationships to avoid repeated store queries */
  private relationshipMemoCache: Map<
    string,
    {
      result: EntityInstance | EntityInstance[] | null;
      timestamp: number;
    }
  > = new Map();

  /** Index of roles by name for O(1) permission checks */
  private roleIndex: Map<string, IRRole> = new Map();

  /** Track whether version has been incremented for the current command execution */
  private versionIncrementedForCommand: boolean = false;

  /** Track instances that were just created (to prevent version increment on subsequent mutate actions) */
  private justCreatedInstanceIds: Set<string> = new Set();

  /**
   * Command-scoped write buffer. While set, mutate/compute actions apply their
   * changes to an in-memory working copy (`instance`) and accumulate a single
   * store-form `patch` instead of issuing one store read + write per action.
   * The buffer is flushed in one `store.update` at the end of the action loop,
   * then cleared — so a command that mutates N fields performs one read and one
   * write rather than N. Scoped to the command's target instance only; nested
   * (reaction/fan-out) commands save and restore the outer buffer.
   */
  private commandBuffer: {
    entityName: string;
    id: string;
    /** Decrypted working copy; null until first loaded from the store. */
    instance: EntityInstance | null;
    /** Accumulated store-form (encrypted) field changes to flush once. */
    patch: Partial<EntityInstance>;
  } | null = null;

  /** Last transition validation error (set by updateInstance, checked by _executeCommandInternal) */
  private lastTransitionError: string | null = null;

  /**
   * Last fail-closed action error (set by executeAction for adapter actions that
   * cannot proceed — MISSING_OUTBOX_STORE / MISSING_EFFECT_HANDLER — checked by
   * _executeCommandInternal after each action so the command fails and persists
   * nothing, mirroring the MISSING_JOB_QUEUE / MISSING_TENANT_CONTEXT convention).
   */
  private lastActionError: string | null = null;

  /** Last concurrency conflict (set by updateInstance, checked by _executeCommandInternal) */
  private lastConcurrencyConflict: ConcurrencyConflict | null = null;

  /**
   * Last modifier write-rejection from updateInstance (readonly change or unique
   * collision). Set by updateInstance, surfaced by _executeCommandInternal after
   * a mutate/compute action so a command reports the rejection instead of silently
   * persisting nothing.
   */
  private lastWriteRejection: { code: string; message: string; property?: string } | null = null;

  /**
   * Nesting depth of in-flight command executions (>0 while inside runCommand).
   * The readonly-modifier exemption for a just-created instance applies only while
   * a command runs (its create + mutate actions are one operation); a direct
   * createInstance/updateInstance pair outside a command is two operations, so
   * readonly blocks there.
   */
  private commandExecutionDepth = 0;

  /**
   * The transaction handle for the command attempt currently in flight, or
   * null when no provider transaction is open. Set by runCommand's provider-mode
   * wrapper and threaded into every store/outbox/idempotency/job/approval write
   * so nested (reaction/saga) commands join the same transaction rather than
   * opening a new one. Always null in non-provider mode.
   */
  private activeTx: TransactionHandle | null = null;

  /**
   * While non-null, in-process event-listener notifications are buffered here
   * instead of dispatched immediately, so onEvent/subscribe listeners are only
   * notified after the command's transaction commits (provider mode). Null in
   * non-provider mode — notification stays synchronous.
   */
  private deferredNotifications: EmittedEvent[] | null = null;

  /**
   * Stable per-instance id used as the EventBus `originId` so subscribers can
   * skip an engine's own published events. Derived lazily (first bus use) from
   * the deterministic id source via `instanceId()` — deriving it eagerly in the
   * constructor would consume a `generateId` tick and shift every user-visible
   * instance id, so engines without a bus never touch it.
   */
  private _instanceId: string | undefined;

  /**
   * Outbound EventBus batch for the top-level command in flight, or null when
   * no bus is configured / no command owns a batch. The top-level runCommand
   * sets it to [] on entry and publishes it once on completion; nested
   * (reaction/saga) commands accumulate into the same array so one message
   * carries the full parent + reaction event set. Only allocated when
   * RuntimeOptions.eventBus is present — the no-bus path stays untouched.
   */
  private busBatch: EmittedEvent[] | null = null;

  /**
   * Active EventBus unsubscribe from connectEventBus, or undefined when not
   * connected. Present so a duplicate connectEventBus is idempotent (returns the
   * same disconnect) rather than opening a second subscription.
   */
  private busUnsubscribe: (() => Promise<void>) | undefined;

  /** Per-engine sliding-window rate limiter (memory by default; durable via rateLimitStore) */
  private rateLimiter: RateLimiter;

  private readonly profilingBridge: RuntimeProfilingBridge;
  private readonly referentialActions: ReferentialActionApplier;
  private actionTraceCounter = 0;

  /**
   * In-process approval request cache, keyed by
   * `${entity}:${instanceId}:${approvalName}`. Always maintained as a mirror
   * so the synchronous `getApprovalRequest`/`expireApprovals` accessors work.
   * When `options.approvalStore` is set, that store is the source of truth and
   * this Map is just a write-through mirror; otherwise this Map IS the store.
   */
  private approvalRequests = new Map<string, ApprovalRequestState>();

  /**
   * Load an approval request, preferring the durable store when configured.
   * Refreshes the in-process mirror so synchronous accessors stay coherent.
   */
  private async loadApprovalState(key: string): Promise<ApprovalRequestState | undefined> {
    const store = this.options.approvalStore;
    if (store) {
      const loaded = await store.load(key);
      if (loaded) this.approvalRequests.set(key, loaded);
      else this.approvalRequests.delete(key);
      return loaded;
    }
    return this.approvalRequests.get(key);
  }

  /**
   * Persist an approval request to the durable store (when configured) and
   * always mirror it in-process so a later synchronous read sees it.
   */
  private async saveApprovalState(key: string, state: ApprovalRequestState): Promise<void> {
    this.approvalRequests.set(key, state);
    const store = this.options.approvalStore;
    // Threads the active command transaction (provider mode) so an approval
    // grant/denial commits atomically with the command's other writes; the
    // in-memory mirror above is unconditional either way.
    if (store) await store.save(key, state, this.activeTx ?? undefined);
  }

  /** Per-entry-point evaluation budget for bounded complexity enforcement */
  private evalBudget: { depth: number; steps: number; maxDepth: number; maxSteps: number } | null =
    null;

  /** Cache for computed property values, keyed by "entityName:instanceId:propertyName" */
  private computedPropertyCache: Map<
    string,
    {
      value: unknown;
      computedAt: number;
      stale: boolean;
    }
  > = new Map();

  /** Request-scoped cache for computed properties (cleared per command) */
  private computedPropertyRequestCache: Map<
    string,
    {
      value: unknown;
      computedAt: number;
      stale: boolean;
    }
  > = new Map();

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

  // ── Field-level encryption helpers ──────────────────────────────────

  /**
   * Returns the set of property names marked `encrypted` for the given entity.
   * Cached per entity name since IR is immutable at runtime.
   */
  private encryptedPropertyNamesCache = new Map<string, Set<string>>();
  private encryptedPropertyNames(entityName: string): Set<string> {
    let cached = this.encryptedPropertyNamesCache.get(entityName);
    if (cached) return cached;
    const entity = this.getEntity(entityName);
    cached = new Set<string>();
    if (entity) {
      for (const prop of entity.properties) {
        if (prop.modifiers.includes('encrypted')) {
          cached.add(prop.name);
        }
      }
    }
    this.encryptedPropertyNamesCache.set(entityName, cached);
    return cached;
  }

  /**
   * Encrypt property values before a store write.
   * Returns a shallow copy with encrypted fields replaced by envelope JSON.
   * No-op when encryptionProvider is not configured or entity has no encrypted fields.
   */
  private async encryptProperties(
    entityName: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const provider = this.options.encryptionProvider;
    if (!provider) return data;
    const names = this.encryptedPropertyNames(entityName);
    if (names.size === 0) return data;

    const out = { ...data };
    for (const name of names) {
      if (!(name in out) || out[name] == null) continue;
      const plaintext = String(out[name]);
      const { ciphertext, keyId } = await provider.encrypt(plaintext);
      out[name] = JSON.stringify({ v: 1, kid: keyId, ct: ciphertext });
    }
    return out;
  }

  /**
   * Decrypt property values after a store read.
   * Returns a shallow copy with encrypted envelope JSON replaced by plaintext.
   * No-op when encryptionProvider is not configured or entity has no encrypted fields.
   */
  private async decryptProperties(
    entityName: string,
    instance: EntityInstance,
  ): Promise<EntityInstance> {
    const provider = this.options.encryptionProvider;
    if (!provider) return instance;
    const names = this.encryptedPropertyNames(entityName);
    if (names.size === 0) return instance;

    const out = { ...instance };
    for (const name of names) {
      const raw = out[name];
      if (typeof raw !== 'string') continue;
      try {
        const envelope = JSON.parse(raw) as { v: number; kid: string; ct: string };
        if (envelope && envelope.v === 1 && envelope.kid && envelope.ct) {
          out[name] = await provider.decrypt(envelope.ct, envelope.kid);
        }
      } catch {
        // Not an envelope — leave value as-is (e.g. plaintext from before encryption was enabled)
      }
    }
    return out;
  }

  /**
   * Resolve the active tenant value from runtime context using the IR tenant
   * config's contextPath. Returns undefined when no tenant declaration exists
   * in the IR or the context lacks the value.
   */
  private resolveTenantValue(): string | undefined {
    const tenantConfig = this.ir.tenant;
    if (!tenantConfig) return undefined;
    const parts = tenantConfig.contextPath.split('.');
    let current: unknown = undefined;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === 0) {
        if (part === 'context') current = this.context;
        else if (part === 'user') current = this.context.user;
        else current = (this.context as Record<string, unknown>)[part];
      } else {
        if (current && typeof current === 'object') {
          current = (current as Record<string, unknown>)[part];
        } else {
          return undefined;
        }
      }
    }
    return typeof current === 'string' ? current : undefined;
  }

  constructor(ir: IR, context: RuntimeContext = {}, options: RuntimeOptions = {}) {
    this.ir = ir;
    this.context = context;
    this.options = options;
    this.profilingBridge = new RuntimeProfilingBridge(options.profiling);
    this.rateLimiter = new RateLimiter(options.rateLimitStore);
    this.referentialActions = new ReferentialActionApplier({
      getEntity: (name) => this.getEntity(name),
      getAllEntities: () => this.ir.entities,
      getAllInstancesRaw: (name) => this.getAllInstancesRaw(name),
      getInstanceRaw: (name, id) => this.getInstanceRaw(name, id),
      deleteInstanceRaw: async (name, id) => {
        const store = this.stores.get(name);
        return store ? await store.delete(id, this.activeTx ?? undefined) : false;
      },
      updateInstanceRaw: async (name, id, data) => {
        const store = this.stores.get(name);
        if (!store) return undefined;
        const encrypted = await this.encryptProperties(name, data);
        const result = await store.update(id, encrypted, this.activeTx ?? undefined);
        return result ? await this.decryptProperties(name, result) : result;
      },
      defaultForProperty: (entityName, propertyName) => {
        const entity = this.getEntity(entityName);
        const prop = entity?.properties.find((p) => p.name === propertyName);
        if (prop?.defaultValue) return this.irValueToJs(prop.defaultValue);
        if (prop) return this.getDefaultForType(prop.type);
        return null;
      },
      compositeId: (entity, instance) => this.compositeId(entity, instance),
      fkColumnPairs: (fk, referenced) => this.fkColumnPairs(fk, referenced),
    });
    this.initializeStores();
    this.buildRelationshipIndex();
    this.buildRoleIndex();
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
      const storeConfig = this.ir.stores.find((s) => s.entity === entity.name);
      let store: Store;

      if (storeConfig) {
        switch (storeConfig.target) {
          case 'localStorage': {
            const key =
              storeConfig.config.key?.kind === 'string'
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
                `For server-side use, import PostgresStore from stores.node.ts.`,
            );
          case 'supabase':
            throw new Error(
              `Supabase storage for entity '${entity.name}' is not available in browser environments. ` +
                `Use 'memory' or 'localStorage' for browser, or provide a custom store via the storeProvider option. ` +
                `For server-side use, import SupabaseStore from stores.node.ts.`,
            );
          case 'mongodb':
            throw new Error(
              `MongoDB storage for entity '${entity.name}' is not available in browser environments. ` +
                `Use 'memory' or 'localStorage' for browser, or provide a custom store via the storeProvider option. ` +
                `For server-side use, import MongoDBStore from stores.node.ts.`,
            );
          case 'durable':
            // `'durable'` is a backend-neutral semantic signal — it intentionally does NOT
            // map to any built-in store. Consumers MUST supply a custom store adapter via
            // the storeProvider option (e.g. a Prisma-backed adapter). This is the deliberate
            // handoff point: core stays backend-neutral. (Matches v0.9.0 behavior.)
            throw new Error(
              `Entity '${entity.name}' declares 'store ... in durable' but no storeProvider is bound. ` +
                `'durable' is backend-neutral and requires a runtime store adapter supplied via the storeProvider option.`,
            );
          case 'eventSourced':
            store = new EventSourcedStore(
              eventSourcedOptionsFromConfig(storeConfig.config, this.options.generateId),
            );
            break;
          default:
            // Custom store adapter scheme — requires a storeProvider that handles this target.
            // Plugin-registered adapters (e.g. 'redis', 'dynamodb') are resolved through the
            // CompositeStoreProvider built by the plugin loader.
            throw new Error(
              `Entity '${entity.name}' declares store target '${storeConfig.target}' but no storeProvider ` +
                `returned a store for it. Custom store targets require a matching StoreAdapterPlugin registered ` +
                `via the plugin API, or a storeProvider that handles the '${storeConfig.target}' scheme.`,
            );
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
          // Only extract the FK field name for single-column FKs. Composite FKs
          // (fields.length > 1) are left undefined here; resolveRelationship
          // reads the raw IR and matches every mapped fields/references column
          // (see fkColumnPairs) instead of a single indexed field name.
          foreignKey:
            rel.foreignKey && rel.foreignKey.fields.length === 1
              ? rel.foreignKey.fields[0]
              : undefined,
          through: rel.through,
        });
      }
    }
  }

  private buildRoleIndex(): void {
    if (this.ir.roles) {
      for (const role of this.ir.roles) {
        this.roleIndex.set(role.name, role);
      }
    }
  }

  /**
   * Check if a role has a specific permission.
   * Uses precomputed effectivePermissions for O(1) lookup.
   * Unknown role → false (no permissive default, per house style).
   */
  private roleHasPermission(roleName: string, action: string, target?: string): boolean {
    const role = this.roleIndex.get(roleName);
    if (!role) return false;
    return role.effectivePermissions.some((p) => {
      const actionMatch = p.action === 'all' || p.action === action;
      const targetMatch = p.target === undefined || p.target === target;
      return actionMatch && targetMatch;
    });
  }

  /**
   * Clear the relationship memoization cache.
   * Called at the start of each command execution to ensure fresh data.
   */
  private clearMemoCache(): void {
    this.relationshipMemoCache.clear();
    this.computedPropertyRequestCache.clear();
  }

  /**
   * Two-hop hasMany via join entity: source → Join rows → target instances.
   */
  private async resolveHasManyThrough(
    sourceEntityName: string,
    sourceInstance: EntityInstance,
    sourceId: string,
    sourceEntity: IREntity | undefined,
    targetEntityName: string,
    throughName: string,
  ): Promise<EntityInstance[]> {
    const joinEntity = this.getEntity(throughName);
    if (!joinEntity) return [];

    const toSource = joinEntity.relationships.find(
      (r) =>
        (r.kind === 'belongsTo' || r.kind === 'ref') && r.target === sourceEntityName,
    );
    const toTarget = joinEntity.relationships.find(
      (r) => (r.kind === 'belongsTo' || r.kind === 'ref') && r.target === targetEntityName,
    );
    if (!toSource || !toTarget) return [];

    const allJoins = await this.getAllInstancesRaw(throughName);
    let matchingJoins: EntityInstance[];
    if (toSource.foreignKey && toSource.foreignKey.fields.length > 1) {
      const pairs = this.fkColumnPairs(toSource.foreignKey, sourceEntity);
      matchingJoins = allJoins.filter((j) =>
        pairs.every(([local, remote]) => j[local] === sourceInstance[remote]),
      );
    } else {
      const fkProperty = toSource.foreignKey?.fields[0] ?? `${toSource.name}Id`;
      matchingJoins = allJoins.filter((j) => j[fkProperty] === sourceId);
    }

    const seen = new Set<string>();
    const targets: EntityInstance[] = [];
    for (const join of matchingJoins) {
      let target: EntityInstance | null = null;
      if (toTarget.foreignKey && toTarget.foreignKey.fields.length > 1) {
        const targetEntity = this.getEntity(targetEntityName);
        const pairs = this.fkColumnPairs(toTarget.foreignKey, targetEntity);
        const unset = pairs.some(
          ([local]) => join[local] === undefined || join[local] === null,
        );
        if (!unset) {
          const allTargets = await this.getAllInstancesRaw(targetEntityName);
          target =
            allTargets.find((t) =>
              pairs.every(([local, remote]) => t[remote] === join[local]),
            ) ?? null;
        }
      } else {
        const fkProperty = toTarget.foreignKey?.fields[0] ?? `${toTarget.name}Id`;
        const targetId = join[fkProperty] as string | undefined;
        if (targetId) {
          target = (await this.getInstanceRaw(targetEntityName, targetId)) ?? null;
        }
      }
      if (!target) continue;
      const tid =
        typeof target.id === 'string'
          ? target.id
          : JSON.stringify(target.id ?? target);
      if (seen.has(tid)) continue;
      seen.add(tid);
      targets.push(target);
    }
    return targets;
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
    relationshipName: string,
  ): Promise<EntityInstance | EntityInstance[] | null> {
    const key = `${entityName}.${relationshipName}`;
    const rel = this.relationshipIndex.get(key);
    if (!rel) {
      return null;
    }

    // Source identity: composite tuple when the source entity declares `key`,
    // else the bare `id`. Used for single-column inverse matching and memo keys.
    const sourceEntity = this.getEntity(entityName);
    const sourceId =
      sourceEntity?.key && sourceEntity.key.length > 0
        ? this.compositeId(sourceEntity, instance)
        : instance.id;
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
        // For belongsTo/ref the foreign key lives on the source relationship.
        const rawRel = sourceEntity?.relationships.find((r) => r.name === relationshipName);
        if (rawRel?.foreignKey && rawRel.foreignKey.fields.length > 1) {
          // Composite FK: resolve the target by matching every FK column against
          // the target's referenced columns. Generalizes the single-column
          // `instance[fk] === target.id` lookup to N columns; picks the exact
          // row even when several targets share an `id`/first-column value.
          const targetEntity = this.getEntity(rel.targetEntity);
          const pairs = this.fkColumnPairs(rawRel.foreignKey, targetEntity);
          const unset = pairs.some(
            ([local]) => instance[local] === undefined || instance[local] === null,
          );
          if (unset) {
            result = null;
          } else {
            const allTargets = await this.getAllInstancesRaw(rel.targetEntity);
            result =
              allTargets.find((t) =>
                pairs.every(([local, remote]) => t[remote] === instance[local]),
              ) ?? null;
          }
          break;
        }
        // For belongsTo/ref: the foreign key on the source instance contains the target ID
        const fkProperty = rel.foreignKey || `${rel.relationshipName}Id`;
        const targetId = instance[fkProperty] as string | undefined;
        if (!targetId) {
          result = null;
        } else {
          result = (await this.getInstanceRaw(rel.targetEntity, targetId)) ?? null;
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
          (r) => (r.kind === 'belongsTo' || r.kind === 'ref') && r.target === entityName,
        );

        if (inverseRel) {
          if (inverseRel.foreignKey && inverseRel.foreignKey.fields.length > 1) {
            // Composite inverse: match target rows whose FK columns equal the
            // source's referenced key columns (target[local] === source[remote]).
            const pairs = this.fkColumnPairs(inverseRel.foreignKey, sourceEntity);
            const allTargets = await this.getAllInstancesRaw(rel.targetEntity);
            result =
              allTargets.find((t) =>
                pairs.every(([local, remote]) => t[local] === instance[remote]),
              ) ?? null;
            break;
          }
          // Use the inverse relationship's foreign key
          const fkProperty = inverseRel.foreignKey?.fields[0] ?? `${inverseRel.name}Id`;
          const allTargets = await this.getAllInstancesRaw(rel.targetEntity);
          result = allTargets.find((t) => t[fkProperty] === sourceId) ?? null;
        } else {
          // Fallback: assume the foreign key is named after the source entity
          const assumedFk = `${entityName.toLowerCase()}Id`;
          const allTargets = await this.getAllInstancesRaw(rel.targetEntity);
          result = allTargets.find((t) => t[assumedFk] === sourceId) ?? null;
        }
        break;
      }

      case 'hasMany': {
        const rawRel = sourceEntity?.relationships.find((r) => r.name === relationshipName);
        const throughName = rawRel?.through ?? (rel as { through?: string }).through;
        if (throughName) {
          result = await this.resolveHasManyThrough(
            entityName,
            instance,
            sourceId,
            sourceEntity,
            rel.targetEntity,
            throughName,
          );
          break;
        }
        // For hasMany: find all target instances where their belongsTo foreign key equals source ID
        const targetEntity = this.getEntity(rel.targetEntity);
        if (!targetEntity) {
          result = [];
          break;
        }

        // Find the inverse belongsTo relationship
        const inverseRel = targetEntity.relationships.find(
          (r) => (r.kind === 'belongsTo' || r.kind === 'ref') && r.target === entityName,
        );

        if (inverseRel) {
          if (inverseRel.foreignKey && inverseRel.foreignKey.fields.length > 1) {
            // Composite inverse: all target rows whose FK columns equal the
            // source's referenced key columns (target[local] === source[remote]).
            const pairs = this.fkColumnPairs(inverseRel.foreignKey, sourceEntity);
            const allTargets = await this.getAllInstancesRaw(rel.targetEntity);
            result = allTargets.filter((t) =>
              pairs.every(([local, remote]) => t[local] === instance[remote]),
            );
            break;
          }
          const fkProperty = inverseRel.foreignKey?.fields[0] ?? `${inverseRel.name}Id`;
          const allTargets = await this.getAllInstancesRaw(rel.targetEntity);
          result = allTargets.filter((t) => t[fkProperty] === sourceId);
        } else {
          // Fallback: assume the foreign key is named after the source entity
          const assumedFk = `${entityName.toLowerCase()}Id`;
          const allTargets = await this.getAllInstancesRaw(rel.targetEntity);
          result = allTargets.filter((t) => t[assumedFk] === sourceId);
        }
        break;
      }

      default:
        result = null;
    }

    // Enrich resolved instances with _entity metadata for chained traversal
    // (e.g., self.order.customer.name follows Order → Customer → name)
    if (result !== null) {
      if (Array.isArray(result)) {
        result = result.map((r) => ({ ...r, _entity: rel.targetEntity }));
      } else {
        result = { ...result, _entity: rel.targetEntity };
      }
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

  /**
   * Composite-key runtime identity (docs/spec/semantics.md, "Composite Keys").
   *
   * When an entity declares `key` (an ordered list of property names), its
   * canonical identity is the ordered tuple of those property values, encoded
   * into a single deterministic string. Components percent-encode `%` and the
   * `|` separator so joins are unambiguous (`"a|b"` vs `["a","b"]` never
   * collide). When `key` is absent the identity is the `id` property, byte-for-
   * byte identical to the pre-composite runtime. Pure and order-stable: no
   * clock/random, so identical IR + instance ⇒ identical key.
   */
  private compositeId(entity: IREntity | undefined, instance: Record<string, unknown>): string {
    if (entity?.key && entity.key.length > 0) {
      return entity.key.map((k) => this.encodeKeyComponent(String(instance[k]))).join('|');
    }
    return String(instance.id);
  }

  /** Percent-encode `%` then `|` so composite key components join unambiguously. */
  private encodeKeyComponent(raw: string): string {
    return raw.replace(/%/g, '%25').replace(/\|/g, '%7C');
  }

  /**
   * Pair each local foreign-key column with the target column it references.
   * `references` is used when present and length-matched; otherwise the target
   * entity's declared `key` columns are paired positionally; as a last resort
   * the local field names are assumed to match remote column names. Generalizes
   * the single-column `${relName}Id`/`fields[0]` convention to N columns.
   */
  private fkColumnPairs(fk: IRForeignKey, referencedEntity?: IREntity): Array<[string, string]> {
    const fields = fk.fields;
    const refs =
      fk.references && fk.references.length === fields.length
        ? fk.references
        : referencedEntity?.key && referencedEntity.key.length === fields.length
          ? referencedEntity.key
          : fields;
    return fields.map((f, i) => [f, refs[i]] as [string, string]);
  }

  /**
   * Generate a unique identifier for runtime-internal records (audit
   * records, outbox entry ids). Uses the caller-supplied generator from
   * RuntimeOptions when present; otherwise falls back to crypto.randomUUID.
   * Distinct from `getBuiltins().uuid` only by intent — keeping a named
   * helper avoids leaking the fallback chain across call sites.
   */
  private nextRuntimeId(): string {
    return this.options.generateId ? this.options.generateId() : crypto.randomUUID();
  }

  /**
   * Core (+ optional custom) builtin callables for this engine.
   * Core names always win collisions against plugins (docs/spec/builtins.md).
   * Public so language-metadata / Builder can introspect the live registry.
   */
  getBuiltins(): Record<string, (...args: unknown[]) => unknown> {
    // Custom builtins from plugins are spread first; core builtins override
    // any name collision so reserved names cannot be replaced.
    const custom = this.options.customBuiltins;
    return {
      ...(custom ? Object.fromEntries(custom) : undefined),
      // Core builtins
      now: () => this.getNow(),
      uuid: () => (this.options.generateId ? this.options.generateId() : crypto.randomUUID()),

      // String builtins
      trim: (s: unknown) => (typeof s === 'string' ? s.trim() : s),
      split: (s: unknown, sep: unknown) => (typeof s === 'string' ? s.split(sep as string) : s),
      count: (v: unknown) => (Array.isArray(v) ? v.length : v),
      startsWith: (s: unknown, prefix: unknown) =>
        typeof s === 'string' ? s.startsWith(prefix as string) : false,
      endsWith: (s: unknown, suffix: unknown) =>
        typeof s === 'string' ? s.endsWith(suffix as string) : false,
      replace: (s: unknown, search: unknown, replacement: unknown) =>
        typeof s === 'string'
          ? s.replace(
              new RegExp((search as string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
              () => replacement as string,
            )
          : s,
      toUpperCase: (s: unknown) => (typeof s === 'string' ? s.toUpperCase() : s),
      toLowerCase: (s: unknown) => (typeof s === 'string' ? s.toLowerCase() : s),
      length: (v: unknown) => {
        if (typeof v === 'string') return v.length;
        if (Array.isArray(v)) return v.length;
        return v;
      },
      substring: (s: unknown, start: unknown, end?: unknown) =>
        typeof s === 'string'
          ? end !== undefined
            ? s.substring(start as number, end as number)
            : s.substring(start as number)
          : s,
      indexOf: (s: unknown, search: unknown) =>
        typeof s === 'string' ? s.indexOf(search as string) : -1,
      matches: (s: unknown, pattern: unknown) => {
        if (typeof s !== 'string' || typeof pattern !== 'string') return false;
        try {
          return new RegExp(pattern).test(s);
        } catch {
          return false;
        }
      },
      search: (text: unknown, query: unknown) => {
        if (typeof text !== 'string' || typeof query !== 'string') return false;
        const tokenize = (s: string) =>
          s
            .toLowerCase()
            .split(/[^a-z0-9]+/i)
            .filter(Boolean);
        const haystack = new Set(tokenize(text));
        const needles = tokenize(query);
        if (needles.length === 0) return false;
        return needles.every((n) => haystack.has(n));
      },

      // Math builtins
      abs: (v: unknown) => (typeof v === 'number' ? Math.abs(v) : v),
      round: (v: unknown) => (typeof v === 'number' ? Math.round(v) : v),
      floor: (v: unknown) => (typeof v === 'number' ? Math.floor(v) : v),
      ceil: (v: unknown) => (typeof v === 'number' ? Math.ceil(v) : v),
      min: (...args: unknown[]) => {
        const nums = args.filter((a): a is number => typeof a === 'number');
        return nums.length > 0 ? Math.min(...nums) : undefined;
      },
      max: (...args: unknown[]) => {
        const nums = args.filter((a): a is number => typeof a === 'number');
        return nums.length > 0 ? Math.max(...nums) : undefined;
      },
      between: (value: unknown, low: unknown, high: unknown) =>
        typeof value === 'number' && typeof low === 'number' && typeof high === 'number'
          ? value >= low && value <= high
          : false,

      // Array / aggregate builtins
      sum: (arr: unknown, mapper?: unknown) => {
        if (Array.isArray(arr)) {
          if (typeof mapper === 'function') {
            return (async () => {
              let total = 0;
              for (const element of arr as unknown[]) {
                const v = await Promise.resolve((mapper as (...a: unknown[]) => unknown)(element));
                if (typeof v === 'number') total += v;
              }
              return total;
            })();
          }
          return (arr as unknown[]).reduce(
            (acc: number, v) => (typeof v === 'number' ? acc + v : acc),
            0,
          );
        }
        return arr;
      },
      avg: (arr: unknown, mapper?: unknown) => {
        if (Array.isArray(arr) && arr.length > 0) {
          if (typeof mapper === 'function') {
            return (async () => {
              let total = 0;
              let count = 0;
              for (const element of arr as unknown[]) {
                const v = await Promise.resolve((mapper as (...a: unknown[]) => unknown)(element));
                if (typeof v === 'number') {
                  total += v;
                  count++;
                }
              }
              return count > 0 ? total / count : 0;
            })();
          }
          const nums = (arr as unknown[]).filter((v): v is number => typeof v === 'number');
          return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
        }
        return 0;
      },
      min_of: (arr: unknown, mapper?: unknown) => {
        if (Array.isArray(arr) && arr.length > 0) {
          if (typeof mapper === 'function') {
            return (async () => {
              let result: number | undefined;
              for (const element of arr as unknown[]) {
                const v = await Promise.resolve((mapper as (...a: unknown[]) => unknown)(element));
                if (typeof v === 'number' && (result === undefined || v < result)) result = v;
              }
              return result;
            })();
          }
          const nums = (arr as unknown[]).filter((v): v is number => typeof v === 'number');
          return nums.length > 0 ? Math.min(...nums) : undefined;
        }
        return undefined;
      },
      max_of: (arr: unknown, mapper?: unknown) => {
        if (Array.isArray(arr) && arr.length > 0) {
          if (typeof mapper === 'function') {
            return (async () => {
              let result: number | undefined;
              for (const element of arr as unknown[]) {
                const v = await Promise.resolve((mapper as (...a: unknown[]) => unknown)(element));
                if (typeof v === 'number' && (result === undefined || v > result)) result = v;
              }
              return result;
            })();
          }
          const nums = (arr as unknown[]).filter((v): v is number => typeof v === 'number');
          return nums.length > 0 ? Math.max(...nums) : undefined;
        }
        return undefined;
      },
      count_of: (arr: unknown, predicate?: unknown) => {
        if (Array.isArray(arr)) {
          if (typeof predicate === 'function') {
            return (async () => {
              let count = 0;
              for (const element of arr as unknown[]) {
                const v = await Promise.resolve(
                  (predicate as (...a: unknown[]) => unknown)(element),
                );
                if (v) count++;
              }
              return count;
            })();
          }
          return arr.length;
        }
        return 0;
      },
      filter: (arr: unknown, predicate?: unknown) => {
        if (Array.isArray(arr) && typeof predicate === 'function') {
          return (async () => {
            const result: unknown[] = [];
            for (const element of arr as unknown[]) {
              const v = await Promise.resolve((predicate as (...a: unknown[]) => unknown)(element));
              if (v) result.push(element);
            }
            return result;
          })();
        }
        return Array.isArray(arr) ? arr : [];
      },
      map: (arr: unknown, mapper?: unknown) => {
        if (Array.isArray(arr) && typeof mapper === 'function') {
          return (async () => {
            const result: unknown[] = [];
            for (const element of arr as unknown[]) {
              result.push(await Promise.resolve((mapper as (...a: unknown[]) => unknown)(element)));
            }
            return result;
          })();
        }
        return Array.isArray(arr) ? arr : [];
      },

      // Date builtins (UTC components; ts is milliseconds since epoch)
      year: (ts: unknown) => (typeof ts === 'number' ? new Date(ts).getUTCFullYear() : ts),
      month: (ts: unknown) => (typeof ts === 'number' ? new Date(ts).getUTCMonth() + 1 : ts),
      day: (ts: unknown) => (typeof ts === 'number' ? new Date(ts).getUTCDate() : ts),
      hours: (ts: unknown) => (typeof ts === 'number' ? new Date(ts).getUTCHours() : ts),
      minutes: (ts: unknown) => (typeof ts === 'number' ? new Date(ts).getUTCMinutes() : ts),
      seconds: (ts: unknown) => (typeof ts === 'number' ? new Date(ts).getUTCSeconds() : ts),

      // Date/time primitive builtins (pure, UTC-only).
      // Convention note: the legacy `year`..`seconds` builtins above pass non-number
      // input through unchanged; these newer builtins return null on invalid input
      // (non-number, NaN, or Infinity).
      dateOf: (ts: unknown) => dateOf(ts),
      timeOf: (ts: unknown) => timeOf(ts),
      datetimeOf: (d: unknown, t?: unknown) => datetimeOf(d, t),
      addDuration: (ts: unknown, d: unknown) =>
        typeof ts === 'number' && Number.isFinite(ts) && typeof d === 'number' && Number.isFinite(d)
          ? ts + d
          : null,
      durationBetween: (a: unknown, b: unknown) =>
        typeof a === 'number' && Number.isFinite(a) && typeof b === 'number' && Number.isFinite(b)
          ? b - a
          : null,
      durationDays: (n: unknown) =>
        typeof n === 'number' && Number.isFinite(n) ? n * 86400000 : null,
      durationHours: (n: unknown) =>
        typeof n === 'number' && Number.isFinite(n) ? n * 3600000 : null,
      durationMinutes: (n: unknown) =>
        typeof n === 'number' && Number.isFinite(n) ? n * 60000 : null,
      durationSeconds: (n: unknown) =>
        typeof n === 'number' && Number.isFinite(n) ? n * 1000 : null,

      // Feature flag builtin
      flag: (name: unknown) => {
        if (typeof name !== 'string') return false;
        if (this.options.flagProvider) {
          return this.options.flagProvider(name);
        }
        if (this.options.flags && Object.prototype.hasOwnProperty.call(this.options.flags, name)) {
          return this.options.flags[name];
        }
        return false;
      },

      // Role hierarchy builtins
      hasPermission: (action: unknown, target?: unknown) => {
        if (typeof action !== 'string') return false;
        const roleName = this.context.user?.role;
        if (typeof roleName !== 'string') return false;
        return this.roleHasPermission(
          roleName,
          action,
          typeof target === 'string' ? target : undefined,
        );
      },
      roleAllows: (roleName: unknown, action: unknown, target?: unknown) => {
        if (typeof roleName !== 'string' || typeof action !== 'string') return false;
        return this.roleHasPermission(
          roleName,
          action,
          typeof target === 'string' ? target : undefined,
        );
      },
    };
  }

  getIR(): IR {
    return this.ir;
  }

  /**
   * Whether an IdempotencyStore is wired into this engine. Additive read-only
   * accessor (no semantics change): the webhook handler (src/manifest/webhooks)
   * must fail closed when a webhook declares an `idempotencyHeader` but the
   * runtime cannot honor the dedup contract, and the store lives in private
   * options. Runtime execution semantics are unchanged.
   */
  hasIdempotencyStore(): boolean {
    return this.options.idempotencyStore !== undefined;
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
      const computedHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

      const isValid = computedHash === targetHash;

      if (!isValid) {
        console.error(
          `[Manifest Runtime] IR hash verification failed!\n` +
            `  Expected: ${targetHash}\n` +
            `  Computed: ${computedHash}\n` +
            `  The IR may have been tampered with or modified since compilation.`,
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
            'This runtime requires valid provenance for execution.',
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
    return this.ir.entities.find((e) => e.name === name);
  }

  getCommands(): IRCommand[] {
    return this.ir.commands;
  }

  getCommand(name: string, entityName?: string): IRCommand | undefined {
    if (entityName) {
      const entity = this.getEntity(entityName);
      if (!entity || !entity.commands.includes(name)) return undefined;
      return this.ir.commands.find((c) => c.name === name && c.entity === entityName);
    }
    return this.ir.commands.find((c) => c.name === name);
  }

  getPolicies(): IRPolicy[] {
    return this.ir.policies;
  }

  /** Return all schedule declarations from the compiled IR. */
  getSchedules(): IRSchedule[] {
    return Array.from(getSchedulesFromIR(this.ir).values());
  }

  /**
   * Run a named schedule: evaluate bound params and dispatch the target command.
   * Sets context.source to 'schedule' and context.scheduleName for the invocation.
   */
  async runSchedule(
    scheduleName: string,
    options: { correlationId?: string; causationId?: string } = {},
  ): Promise<CommandResult> {
    const schedule = getSchedulesFromIR(this.ir).get(scheduleName);
    if (!schedule) {
      return {
        success: false,
        error: `Schedule '${scheduleName}' not found`,
        emittedEvents: [],
      };
    }

    const input: Record<string, unknown> = {};
    const now = this.getNow();
    const paramContext = {
      ...this.buildEvalContext({}, undefined, schedule.entityName),
      now,
    };

    if (schedule.params) {
      for (const param of schedule.params) {
        input[param.name] = await this.evaluateExpression(param.expression, paramContext);
      }
    }

    const prevSource = this.context.source;
    const prevScheduleName = this.context.scheduleName;
    this.context.source = 'schedule';
    this.context.scheduleName = scheduleName;

    try {
      return await this.runCommand(schedule.commandName, input, {
        ...(schedule.entityName ? { entityName: schedule.entityName } : {}),
        ...(options.correlationId !== undefined ? { correlationId: options.correlationId } : {}),
        ...(options.causationId !== undefined ? { causationId: options.causationId } : {}),
      });
    } finally {
      this.context.source = prevSource;
      if (prevScheduleName !== undefined) {
        this.context.scheduleName = prevScheduleName;
      } else {
        delete this.context.scheduleName;
      }
    }
  }

  getStore(entityName: string): Store | undefined {
    return this.stores.get(entityName);
  }

  /**
   * Get collected command profiles when profiling is enabled.
   * Returns an empty array when profiling is not configured.
   */
  getProfiles(): import('./profiling').CommandProfile[] {
    return [...this.profilingBridge.getProfiles()];
  }

  /**
   * Execute middleware registered for a given hook.
   * Returns a short-circuit result if any middleware short-circuits,
   * or undefined to continue normal execution.
   */
  private async runMiddleware(
    hook: MiddlewareHook,
    command: IRCommand,
    evalContext: Record<string, unknown>,
    input: Record<string, unknown>,
    options: { entityName?: string; instanceId?: string },
    emittedEvents: EmittedEvent[] = [],
  ): Promise<CommandResult | undefined> {
    const middlewares = this.options.middleware;
    if (!middlewares || middlewares.length === 0) return undefined;

    for (const mw of middlewares) {
      if (!mw.hooks.includes(hook)) continue;

      const ctx: MiddlewareContext = {
        hook,
        command,
        evalContext,
        input,
        runtimeContext: this.context,
        entityName: options.entityName,
        instanceId: options.instanceId,
        emittedEvents,
      };

      const result = await mw.handler(ctx);

      if (result.contextPatch) {
        Object.assign(evalContext, result.contextPatch);
      }

      if (result.shortCircuit && result.result) {
        return result.result;
      }
    }

    return undefined;
  }

  /**
   * Public read surface: tenant filter → decrypt → mask (read-projection only).
   * Execution paths (guards, actions, policies, computed properties, relationship
   * resolution) use getAllInstancesRaw and always see real values.
   */
  async getAllInstances(entityName: string): Promise<EntityInstance[]> {
    const all = await this.getAllInstancesRaw(entityName);
    const visible = await this.applyReadGateToRows(entityName, all);
    const masked: EntityInstance[] = [];
    for (const inst of visible) {
      masked.push(await this.applyMasking(entityName, inst));
    }
    return masked;
  }

  /** Internal read path: tenant filter + decryption, NO masking. */
  private async getAllInstancesRaw(entityName: string): Promise<EntityInstance[]> {
    const store = this.stores.get(entityName);
    if (!store) return [];
    let all = await store.getAll();
    if (this.ir.tenant) {
      const tv = this.resolveTenantValue();
      if (tv) {
        const prop = this.ir.tenant.property;
        all = all.filter((inst) => inst[prop] === tv);
      }
    }
    // Decrypt encrypted fields after store read
    const decrypted: EntityInstance[] = [];
    for (const inst of all) {
      decrypted.push(await this.decryptProperties(entityName, inst));
    }
    return decrypted;
  }

  /**
   * Public read surface: tenant filter → decrypt → mask (read-projection only).
   * Execution paths use getInstanceRaw and always see real values.
   */
  async getInstance(entityName: string, id: string): Promise<EntityInstance | undefined> {
    const inst = await this.getInstanceRaw(entityName, id);
    if (!inst) return inst;
    // Read gate: a denied read fails closed as undefined (no existence leak).
    if (!(await this.passesReadGate(entityName, inst))) return undefined;
    return await this.applyMasking(entityName, inst);
  }

  /** Internal read path: tenant filter + decryption, NO masking. */
  private async getInstanceRaw(
    entityName: string,
    id: string,
  ): Promise<EntityInstance | undefined> {
    // Command working copy: during command execution, reads of the target
    // instance return the in-memory copy carrying this command's mutations,
    // so guards/computes/refreshes see pending changes without a store read.
    const buf = this.commandBuffer;
    if (buf && buf.entityName === entityName && buf.id === id && buf.instance) {
      return buf.instance;
    }
    const store = this.stores.get(entityName);
    if (!store) return undefined;
    const inst = await store.getById(id);
    if (inst && this.ir.tenant) {
      const tv = this.resolveTenantValue();
      if (tv && inst[this.ir.tenant.property] !== tv) {
        return undefined;
      }
    }
    // Decrypt encrypted fields after store read
    return inst ? await this.decryptProperties(entityName, inst) : undefined;
  }

  // ── Property masking (docs/spec/semantics.md, "Property Masking") ───

  /** Cache of properties carrying maskStrategy, per entity (IR is immutable at runtime). */
  private maskedPropertiesCache = new Map<string, IRProperty[]>();
  private maskedProperties(entityName: string): IRProperty[] {
    let cached = this.maskedPropertiesCache.get(entityName);
    if (cached) return cached;
    const entity = this.getEntity(entityName);
    cached = entity ? entity.properties.filter((p) => p.maskStrategy !== undefined) : [];
    this.maskedPropertiesCache.set(entityName, cached);
    return cached;
  }

  /** Cache of `private`-modifier property names, per entity (IR is immutable at runtime). */
  private privatePropertiesCache = new Map<string, string[]>();
  private privateProperties(entityName: string): string[] {
    let cached = this.privatePropertiesCache.get(entityName);
    if (cached) return cached;
    const entity = this.getEntity(entityName);
    cached = entity
      ? entity.properties.filter((p) => p.modifiers.includes('private')).map((p) => p.name)
      : [];
    this.privatePropertiesCache.set(entityName, cached);
    return cached;
  }

  /**
   * Apply read-time masking to an instance (after decryption and tenant filtering).
   * - `private` wins over `masked`: the property is excluded entirely.
   * - `null`/`undefined` pass through unmasked.
   * - `unmaskWhen` falsy or throwing ⇒ value stays masked (secure by default).
   *   An evaluation error additionally surfaces a diagnostic; it never changes
   *   the masked outcome (diagnostics explain, never compensate).
   */
  private async applyMasking(
    entityName: string,
    instance: EntityInstance,
  ): Promise<EntityInstance> {
    const maskedProps = this.maskedProperties(entityName);
    const privateProps = this.privateProperties(entityName);
    if (maskedProps.length === 0 && privateProps.length === 0) return instance;

    const out = { ...instance };
    // `private` wins: strip every private property (with or without `masked`) from
    // the public read (docs/spec/semantics.md, "Property Masking"). Execution paths
    // use getInstanceRaw/getAllInstancesRaw and still observe the real value.
    for (const name of privateProps) {
      delete out[name];
    }
    for (const prop of maskedProps) {
      if (prop.modifiers.includes('private')) {
        delete out[prop.name];
        continue;
      }
      const value = out[prop.name];
      if (value === null || value === undefined) continue;

      const strategy = prop.maskStrategy!;
      if (strategy.unmaskWhen) {
        const ownsEvalBudget = this.initEvalBudget();
        try {
          // self.* binds the raw instance (real values); user.*/context.* from runtime context
          const evalContext = this.buildEvalContext({}, instance, entityName);
          const allowed = await this.evaluateExpression(strategy.unmaskWhen, evalContext);
          if (allowed) continue; // truthy ⇒ real value returned
        } catch (error) {
          // Secure by default: an error keeps the value masked. Surface a diagnostic
          // carrying the expression and resolved values; never alter the outcome.
          let resolved: unknown[] = [];
          try {
            const evalContext = this.buildEvalContext({}, instance, entityName);
            resolved = await this.resolveExpressionValues(strategy.unmaskWhen, evalContext);
          } catch {
            // resolution itself failed — report without resolved values
          }
          console.warn(
            `[Manifest Runtime] unmaskWhen evaluation error for '${entityName}.${prop.name}' (value stays masked):`,
            {
              expression: this.formatExpression(strategy.unmaskWhen),
              resolved,
              error: error instanceof Error ? error.message : String(error),
            },
          );
        } finally {
          if (ownsEvalBudget) this.clearEvalBudget();
        }
      }

      out[prop.name] = applyMaskStrategy(strategy, value);
    }
    return out;
  }

  // ── Read-policy gate (docs/spec/semantics.md, "Policies") ───────────
  //
  // Read policies (action `read`/`all`) are enforced at the public read surface
  // only (getInstance/getAllInstances), above masking. The internal `*Raw`
  // execution read path stays un-gated so command results are unchanged
  // (determinism preserved) — the gate is observational, not executional.

  /** Read policies applicable to an entity, in IR declaration order (cached, IR is immutable at runtime). */
  private readPoliciesCache = new Map<string, IRPolicy[]>();
  private selectReadPolicies(entityName: string): IRPolicy[] {
    let cached = this.readPoliciesCache.get(entityName);
    if (cached) return cached;
    cached = this.ir.policies.filter(
      (p) =>
        (p.action === 'read' || p.action === 'all') &&
        (p.entity === undefined || p.entity === entityName),
    );
    this.readPoliciesCache.set(entityName, cached);
    return cached;
  }

  /**
   * A read policy is context-only (instance-independent) when its expression
   * never references `self`/`this`. Such a policy is evaluated once per
   * getAllInstances call; a self-referencing policy is evaluated per row.
   */
  private isContextOnlyExpression(expr: IRExpression): boolean {
    const keys = this.extractContextKeys(expr);
    return !keys.some(
      (k) => k === 'self' || k === 'this' || k.startsWith('self.') || k.startsWith('this.'),
    );
  }

  /**
   * Evaluate a single read policy against an eval context. Fail-closed: a
   * rate-limit denial, a falsey expression, or a thrown expression all DENY.
   * A thrown expression additionally surfaces a diagnostic (never compensating,
   * mirroring the masking unmaskWhen contract).
   */
  private async evaluateReadPolicy(
    policy: IRPolicy,
    evalContext: Record<string, unknown>,
    entityName: string,
  ): Promise<boolean> {
    if (policyHasRateLimit(policy) && policy.rateLimit) {
      const tenantValue = this.ir.tenant ? this.resolveTenantValue() : this.context.tenantId;
      const rl = await checkRateLimitGate(
        this.rateLimiter,
        policy.rateLimit,
        evalContext,
        tenantValue,
        this.getNow(),
        `policy:${policy.name}`,
      );
      if (!rl.allowed) return false;
    }
    try {
      const result = await this.evaluateExpression(policy.expression, evalContext);
      return !!result;
    } catch (error) {
      let resolved: unknown[] = [];
      try {
        resolved = await this.resolveExpressionValues(policy.expression, evalContext);
      } catch {
        // resolution itself failed — report without resolved values
      }
      console.warn(
        `[Manifest Runtime] read policy '${policy.name}' evaluation error for '${entityName}' (read denied):`,
        {
          expression: this.formatExpression(policy.expression),
          resolved,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return false;
    }
  }

  /**
   * Read gate for a single instance (getInstance). Returns true only if every
   * applicable read policy allows; the row is bound as `self`/`this`.
   */
  private async passesReadGate(entityName: string, instance: EntityInstance): Promise<boolean> {
    const policies = this.selectReadPolicies(entityName);
    if (policies.length === 0) return true;
    const ownsEvalBudget = this.initEvalBudget();
    try {
      const evalContext = this.buildEvalContext({}, instance, entityName);
      for (const policy of policies) {
        if (!(await this.evaluateReadPolicy(policy, evalContext, entityName))) return false;
      }
      return true;
    } finally {
      if (ownsEvalBudget) this.clearEvalBudget();
    }
  }

  /**
   * Read gate for a row set (getAllInstances). Context-only policies are
   * evaluated once (deny ⇒ empty result, no row scan); self-referencing
   * policies are evaluated per row and denied rows are omitted (no existence
   * leak, mirroring the tenant filter).
   */
  private async applyReadGateToRows(
    entityName: string,
    rows: EntityInstance[],
  ): Promise<EntityInstance[]> {
    const policies = this.selectReadPolicies(entityName);
    if (policies.length === 0) return rows;

    const contextOnly: IRPolicy[] = [];
    const rowLevel: IRPolicy[] = [];
    for (const p of policies) {
      if (this.isContextOnlyExpression(p.expression)) contextOnly.push(p);
      else rowLevel.push(p);
    }

    const ownsEvalBudget = this.initEvalBudget();
    try {
      // Context-only policies are instance-independent: evaluate once.
      if (contextOnly.length > 0) {
        const ctx = this.buildEvalContext({}, undefined, entityName);
        for (const policy of contextOnly) {
          if (!(await this.evaluateReadPolicy(policy, ctx, entityName))) return [];
        }
      }

      if (rowLevel.length === 0) return rows;

      const visible: EntityInstance[] = [];
      for (const row of rows) {
        const ctx = this.buildEvalContext({}, row, entityName);
        let allowed = true;
        for (const policy of rowLevel) {
          if (!(await this.evaluateReadPolicy(policy, ctx, entityName))) {
            allowed = false;
            break;
          }
        }
        if (allowed) visible.push(row);
      }
      return visible;
    } finally {
      if (ownsEvalBudget) this.clearEvalBudget();
    }
  }

  /**
   * Check entity constraints against instance data
   * Returns array of constraint failures (empty if all pass)
   * Useful for diagnostic purposes without mutating state
   */
  async checkConstraints(
    entityName: string,
    data: Record<string, unknown>,
  ): Promise<ConstraintOutcome[]> {
    const entity = this.getEntity(entityName);
    if (!entity) return [];
    const ownsEvalBudget = this.initEvalBudget();
    try {
      const outcomes = await this.validateConstraints(entity, data);
      // Return only failed constraints for backwards compatibility with test patterns
      // (Callers can still see all outcomes by using validateConstraints directly)
      return outcomes.filter((o) => !o.passed);
    } finally {
      if (ownsEvalBudget) this.clearEvalBudget();
    }
  }

  /**
   * Evaluate all entity constraints against instance data, returning every outcome
   * (both passed and failed). Useful for diagnostic UIs that show full constraint status.
   */
  async evaluateAllConstraints(
    entityName: string,
    data: Record<string, unknown>,
  ): Promise<ConstraintOutcome[]> {
    const entity = this.getEntity(entityName);
    if (!entity) return [];
    const ownsEvalBudget = this.initEvalBudget();
    try {
      return await this.validateConstraints(entity, data);
    } finally {
      if (ownsEvalBudget) this.clearEvalBudget();
    }
  }

  async createInstance(
    entityName: string,
    data: Partial<EntityInstance>,
  ): Promise<EntityInstance | undefined> {
    const ownsEvalBudget = this.initEvalBudget();
    try {
      return (await this.createInstanceWithOutcomes(entityName, data)).instance;
    } finally {
      if (ownsEvalBudget) this.clearEvalBudget();
    }
  }

  private prepareCreateData(
    entity: IREntity,
    data: Partial<EntityInstance>,
  ): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};
    for (const prop of entity.properties) {
      if (prop.defaultValue) {
        defaults[prop.name] = this.irValueToJs(prop.defaultValue);
      } else if (prop.autoNow) {
        // `= now()` / `= today()` default: stamp current time on create.
        defaults[prop.name] = this.getNow();
      } else {
        defaults[prop.name] = this.getDefaultForType(prop.type);
      }
    }

    const mergedData = { ...defaults, ...data };

    if (this.ir.tenant) {
      const tv = this.resolveTenantValue();
      if (tv) {
        mergedData[this.ir.tenant.property] = tv;
      }
    }

    // Handle version properties for optimistic concurrency control
    if (entity.versionProperty) {
      mergedData[entity.versionProperty] = 1;
    }
    if (entity.versionAtProperty) {
      mergedData[entity.versionAtProperty] = this.getNow();
    }

    if (entity.timestamps) {
      const now = this.getNow();
      mergedData.createdAt = now;
      mergedData.updatedAt = now;
    }

    // Composite-key runtime identity. The runtime's canonical identity for a
    // `key`-declaring entity is the encoded key tuple (see `compositeId`), used
    // internally for equality, relation matching, caching, and locking. For an
    // entity that has NO real `id` column (e.g. `key [region, code]`) that tuple
    // is also its synthetic addressing handle, stored in `id` so it stays
    // reachable via getInstance/updateInstance/runCommand.
    //
    // But when `id` is itself a declared key component (the common
    // `key [tenantId, id]` shape), `id` is a REAL persisted column: it keeps its
    // actual value (a bare uuid) and must NOT be overwritten with the composite
    // "tenantId|id" string. The store persists the real field values and derives
    // the composite primary key itself from the tenant context; overwriting `id`
    // corrupts the uuid column and breaks every generic-store create for such an
    // entity (regression fixed in 3.3.1). `mergedData` already carries the real
    // bare `id` here (the auto-create path seeds it via `bodyId`).
    if (entity.key && entity.key.length > 0 && !entity.key.includes('id')) {
      mergedData.id = this.compositeId(entity, mergedData);
    }

    return mergedData;
  }

  private reportConstraintOutcomes(constraintOutcomes: ConstraintOutcome[]): boolean {
    const blockingFailures = constraintOutcomes.filter((o) => !o.passed && o.severity === 'block');

    if (blockingFailures.length > 0) {
      // Log blocking constraint failures for diagnostics
      console.warn('[Manifest Runtime] Blocking constraint validation failed:', blockingFailures);
      return false;
    }

    // Log non-blocking outcomes (warn/ok) for diagnostics
    const nonBlockingOutcomes = constraintOutcomes.filter(
      (o) => !o.passed && o.severity !== 'block',
    );
    if (nonBlockingOutcomes.length > 0) {
      console.info('[Manifest Runtime] Non-blocking constraint outcomes:', nonBlockingOutcomes);
    }

    return true;
  }

  private async createInstanceWithOutcomes(
    entityName: string,
    data: Partial<EntityInstance>,
  ): Promise<{ instance?: EntityInstance; constraintOutcomes?: ConstraintOutcome[] }> {
    const entity = this.getEntity(entityName);
    if (!entity) return {};

    const requiredOutcomes = this.requiredModifierOutcomes(entity, data);
    const mergedData = this.prepareCreateData(entity, data);
    return this.persistPreparedCreate(entityName, entity, mergedData, requiredOutcomes);
  }

  /** Date/time primitive write-time validation (docs/spec/semantics.md, Date/Time Types). */
  private validateDateTimeTypes(
    entity: IREntity,
    data: Record<string, unknown>,
  ): ConstraintOutcome[] {
    const outcomes: ConstraintOutcome[] = [];
    for (const prop of entity.properties) {
      const t = prop.type?.name;
      if (t !== 'date' && t !== 'time' && t !== 'datetime' && t !== 'duration') continue;
      if (!(prop.name in data)) continue;
      const value = data[prop.name];
      if (value === null || value === undefined) continue;
      let ok = true;
      let code = '';
      if (t === 'date') {
        ok = isValidDateString(value);
        code = 'E_TYPE_DATE';
      } else if (t === 'time') {
        ok = isValidTimeString(value);
        code = 'E_TYPE_TIME';
      } else if (t === 'datetime') {
        // Must be within the representable Date range (±8,640,000,000,000,000 ms).
        ok = typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 8.64e15;
        code = 'E_TYPE_DATETIME';
      } else {
        ok = typeof value === 'number' && Number.isFinite(value);
        code = 'E_TYPE_DURATION';
      }
      if (!ok) {
        const shown =
          typeof value === 'number' ? String(value) : (JSON.stringify(value) ?? String(value));
        const message = `Property "${prop.name}" expects ${t}; got ${shown}`;
        outcomes.push({
          code,
          constraintName: prop.name,
          severity: 'block',
          passed: false,
          formatted: message,
          message,
          details: { property: prop.name, expectedType: t, value },
        });
      }
    }
    return outcomes;
  }

  /**
   * Auto-managed field names the runtime supplies outside caller data. Mirrors the
   * create-null compile check so required-modifier enforcement does not flag fields
   * the engine fills itself (id, tenant, version, timestamps, composite key, FKs).
   */
  private autoManagedFieldNames(entity: IREntity): Set<string> {
    const auto = new Set<string>(['id']);
    if (this.ir.tenant?.property) auto.add(this.ir.tenant.property);
    if (entity.versionProperty) auto.add(entity.versionProperty);
    if (entity.versionAtProperty) auto.add(entity.versionAtProperty);
    if (entity.timestamps) {
      auto.add('createdAt');
      auto.add('updatedAt');
    }
    for (const k of entity.key ?? []) auto.add(k);
    for (const r of entity.relationships) {
      for (const fk of r.foreignKey?.fields ?? []) auto.add(fk);
    }
    return auto;
  }

  /**
   * `required` modifier enforcement (docs/spec/semantics.md, "Modifier enforcement").
   * A required property is satisfied only by a supplied value, a defaultValue,
   * autoNow, an auto-managed field, or a field the creating command writes — a
   * zero-filled type default does NOT satisfy it. Returns a blocking `E_REQUIRED`
   * outcome for each unsatisfied required property.
   */
  private requiredModifierOutcomes(
    entity: IREntity,
    provided: Record<string, unknown>,
    producedByCommand?: Set<string>,
  ): ConstraintOutcome[] {
    const outcomes: ConstraintOutcome[] = [];
    const auto = this.autoManagedFieldNames(entity);
    for (const prop of entity.properties) {
      if (!prop.modifiers.includes('required')) continue;
      const supplied = provided[prop.name] !== undefined && provided[prop.name] !== null;
      if (supplied) continue;
      if (prop.defaultValue !== undefined) continue;
      if (prop.autoNow) continue;
      if (auto.has(prop.name)) continue;
      if (producedByCommand?.has(prop.name)) continue;
      const message = `Property '${prop.name}' is required but was not provided`;
      outcomes.push({
        code: 'E_REQUIRED',
        constraintName: prop.name,
        severity: 'block',
        passed: false,
        formatted: message,
        message,
        details: { property: prop.name, modifier: 'required' },
      });
    }
    return outcomes;
  }

  /**
   * Fields a create command's actions write (mutate/compute/persist targets).
   * Used to exempt those fields from required-modifier enforcement, since they are
   * set immediately after the auto-create persist.
   */
  private commandProducedFields(command: IRCommand): Set<string> {
    const produced = new Set<string>();
    for (const a of command.actions) {
      if (a.target && (a.kind === 'mutate' || a.kind === 'compute' || a.kind === 'persist')) {
        produced.add(a.target);
      }
    }
    return produced;
  }

  /**
   * `unique` modifier enforcement (docs/spec/semantics.md, "Modifier enforcement").
   * Rejects a create/update that sets a unique property to a non-null value another
   * instance already holds, scanning instances in the active tenant scope.
   * // ponytail: O(n) scan per unique property; move to store-level uniqueness when
   * // the store adapter exposes a uniqueness constraint.
   */
  private async uniqueModifierOutcomes(
    entityName: string,
    entity: IREntity,
    candidate: Record<string, unknown>,
    excludeId?: string,
    onlyProps?: Set<string>,
  ): Promise<ConstraintOutcome[]> {
    const uniqueProps = entity.properties.filter(
      (p) => p.modifiers.includes('unique') && (!onlyProps || onlyProps.has(p.name)),
    );
    if (uniqueProps.length === 0) return [];
    const existing = await this.getAllInstancesRaw(entityName);
    const outcomes: ConstraintOutcome[] = [];
    for (const prop of uniqueProps) {
      const value = candidate[prop.name];
      if (value === undefined || value === null) continue;
      const collides = existing.some((row) => row.id !== excludeId && row[prop.name] === value);
      if (collides) {
        const message = `Property '${prop.name}' must be unique; value already exists`;
        outcomes.push({
          code: 'E_UNIQUE',
          constraintName: prop.name,
          severity: 'block',
          passed: false,
          formatted: message,
          message,
          details: { property: prop.name, modifier: 'unique', value },
        });
      }
    }
    return outcomes;
  }

  private async persistPreparedCreate(
    entityName: string,
    entity: IREntity,
    mergedData: Record<string, unknown>,
    requiredOutcomes: ConstraintOutcome[] = [],
  ): Promise<{ instance?: EntityInstance; constraintOutcomes?: ConstraintOutcome[] }> {
    const constraintOutcomes = [
      ...requiredOutcomes,
      ...this.validateDateTimeTypes(entity, mergedData),
      ...(await this.uniqueModifierOutcomes(entityName, entity, mergedData)),
      ...(await this.validateConstraints(entity, mergedData)),
    ];
    if (!this.reportConstraintOutcomes(constraintOutcomes)) {
      return { constraintOutcomes };
    }

    const store = this.stores.get(entityName);
    if (!store) return { constraintOutcomes };

    // Encrypt fields before store write (no-op without encryptionProvider)
    const dataToStore = await this.encryptProperties(entityName, mergedData);
    const result = await store.create(dataToStore, this.activeTx ?? undefined);

    // Track newly created instance to prevent version increment on subsequent mutate actions
    if (result && result.id) {
      this.justCreatedInstanceIds.add(result.id);
    }

    // Decrypt fields before returning to caller
    const decrypted = result ? await this.decryptProperties(entityName, result) : result;
    return { instance: decrypted, constraintOutcomes };
  }

  async updateInstance(
    entityName: string,
    id: string,
    data: Partial<EntityInstance>,
  ): Promise<EntityInstance | undefined> {
    const entity = this.getEntity(entityName);
    const store = this.stores.get(entityName);
    if (!store || !entity) return undefined;

    // During command execution the target instance is buffered: load it from
    // the store at most once, then mutate the in-memory working copy.
    const buf = this.commandBuffer;
    const buffering = !!buf && buf.entityName === entityName && buf.id === id;

    let existing: EntityInstance;
    if (buffering && buf!.instance) {
      existing = buf!.instance;
    } else {
      const rawExisting = await store.getById(id);
      if (!rawExisting) return undefined;
      // Decrypt existing instance so constraint/transition checks see plaintext
      existing = await this.decryptProperties(entityName, rawExisting);
      if (buffering) buf!.instance = existing;
    }

    const ownsEvalBudget = this.initEvalBudget();
    try {
      // ── readonly modifier (docs/spec/semantics.md, "Modifier enforcement") ──
      // Block a post-creation change to a readonly property. Writes issued while
      // the creating command runs are allowed (its id is just-created within the
      // same command); a same-value write is a no-op and passes.
      const createdWithinCommand =
        this.commandExecutionDepth > 0 && this.justCreatedInstanceIds.has(id);
      if (!createdWithinCommand) {
        for (const prop of entity.properties) {
          if (!prop.modifiers.includes('readonly')) continue;
          if (!(prop.name in data)) continue;
          if (data[prop.name] === existing[prop.name]) continue;
          this.lastWriteRejection = {
            code: 'E_READONLY',
            property: prop.name,
            message: `Property '${prop.name}' is readonly and cannot be modified after creation`,
          };
          return undefined;
        }
      }

      // ── unique modifier: reject an update colliding with another instance ──
      const uniqueOutcomes = await this.uniqueModifierOutcomes(
        entityName,
        entity,
        data,
        id,
        new Set(Object.keys(data)),
      );
      if (uniqueOutcomes.length > 0) {
        const first = uniqueOutcomes[0];
        this.lastWriteRejection = {
          code: first.code ?? 'E_UNIQUE',
          property: first.constraintName,
          message: first.message ?? first.formatted ?? 'unique constraint violation',
        };
        return undefined;
      }

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
            await this.emitConcurrencyConflictEvent(
              entityName,
              id,
              providedVersion,
              existingVersion,
            );
            return undefined;
          }
        }

        // Auto-increment version on successful update
        // Only increment once per command execution to handle commands with multiple mutate actions
        // If version is explicitly provided in data, use that (for optimistic concurrency checks)
        // Skip increment for instances that were just created in the same command (e.g., create command's mutate actions)
        const wasJustCreated = this.justCreatedInstanceIds.has(id);
        if (
          providedVersion === undefined &&
          !this.versionIncrementedForCommand &&
          !wasJustCreated
        ) {
          data[entity.versionProperty] = (existingVersion || 0) + 1;
          this.versionIncrementedForCommand = true;
        }
      }

      // Update versionAt timestamp if present
      if (entity.versionAtProperty) {
        data[entity.versionAtProperty] = this.getNow();
      }

      if (entity.timestamps) {
        data.updatedAt = this.getNow();
      }

      const mergedData = { ...existing, ...data };

      // Validate state transitions if entity declares them
      if (entity.transitions && entity.transitions.length > 0) {
        for (const [prop, newValue] of Object.entries(data)) {
          const rules = entity.transitions.filter((t) => t.property === prop);
          if (rules.length === 0) continue;
          const currentValue = existing[prop];
          if (currentValue === undefined) continue;
          const matchingRule = rules.find((t) => t.from === String(currentValue));
          if (matchingRule && !matchingRule.to.includes(String(newValue))) {
            const allowed = matchingRule.to.map((v) => `'${v}'`).join(', ');
            this.lastTransitionError = `Invalid state transition for '${prop}': '${currentValue}' -> '${newValue}' is not allowed. Allowed from '${currentValue}': [${allowed}]`;
            return undefined;
          }
        }
      }

      // Validate entity constraints.
      // Date/time type validation runs against the patch only, so previously
      // stored values are not re-validated on unrelated updates.
      const constraintOutcomes = [
        ...this.validateDateTimeTypes(entity, data),
        ...(await this.validateConstraints(entity, mergedData)),
      ];

      // Only block on severity='block' constraints that failed
      const blockingFailures = constraintOutcomes.filter(
        (o) => !o.passed && o.severity === 'block',
      );

      if (blockingFailures.length > 0) {
        // Log blocking constraint failures for diagnostics
        console.warn('[Manifest Runtime] Blocking constraint validation failed:', blockingFailures);
        return undefined;
      }

      // Log non-blocking outcomes (warn/ok) for diagnostics
      const nonBlockingOutcomes = constraintOutcomes.filter(
        (o) => !o.passed && o.severity !== 'block',
      );
      if (nonBlockingOutcomes.length > 0) {
        console.info('[Manifest Runtime] Non-blocking constraint outcomes:', nonBlockingOutcomes);
      }

      // Mark cached computed properties as stale when their dependencies change
      this.markComputedPropertiesStale(entityName, id, Object.keys(data));

      // Referential onUpdate: when referenced identity columns change, apply
      // child-side actions before persisting the parent (restrict may throw).
      await this.referentialActions.applyOnUpdate(entityName, id, existing, mergedData);

      // Encrypt fields before store write, decrypt result before returning
      const encryptedData = await this.encryptProperties(entityName, data);
      if (buffering) {
        // Batched path: advance the working copy and accumulate the patch. The
        // single store.update runs once when the command flushes the buffer, so
        // a command mutating N fields persists once rather than N times.
        buf!.instance = mergedData;
        Object.assign(buf!.patch, encryptedData);
        return mergedData;
      }
      const result = await store.update(id, encryptedData, this.activeTx ?? undefined);
      return result ? await this.decryptProperties(entityName, result) : result;
    } finally {
      if (ownsEvalBudget) this.clearEvalBudget();
    }
  }

  /**
   * Mark cached computed properties as stale when their dependencies are mutated.
   * Scans the entity's computed properties for any that depend on the changed properties,
   * and sets their cache entries' stale flag to true. Handles transitive staleness.
   */
  private markComputedPropertiesStale(
    entityName: string,
    instanceId: string,
    changedProperties: string[],
    visited: Set<string> = new Set(),
  ): void {
    const entity = this.getEntity(entityName);
    if (!entity) return;

    for (const cp of entity.computedProperties) {
      if (visited.has(cp.name)) continue;
      const dependsOnChanged = cp.dependencies.some((dep) => changedProperties.includes(dep));
      if (!dependsOnChanged) continue;

      visited.add(cp.name);
      const cacheKey = `${entityName}:${instanceId}:${cp.name}`;

      // Mark in session/TTL cache
      const cached = this.computedPropertyCache.get(cacheKey);
      if (cached) cached.stale = true;

      // Mark in request cache
      const reqCached = this.computedPropertyRequestCache.get(cacheKey);
      if (reqCached) reqCached.stale = true;

      // Also mark any computed properties that depend on this computed property (transitive staleness)
      this.markComputedPropertiesStale(entityName, instanceId, [cp.name], visited);
    }
  }

  async deleteInstance(entityName: string, id: string): Promise<boolean> {
    const store = this.stores.get(entityName);
    if (!store) return false;
    const existing = await store.getById(id);
    if (!existing) return false;
    // Enforce child-side onDelete (cascade / restrict / setNull / setDefault)
    // before removing the parent. See semantics.md § Referential Actions.
    await this.referentialActions.applyOnDelete(entityName, id);
    return await store.delete(id, this.activeTx ?? undefined);
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
    } = {},
  ): Promise<CommandResult> {
    // Per docs/spec/adapters.md § "Audit Sink": when an AuditSink is wired in,
    // runCommand emits exactly one AuditRecord per invocation regardless of
    // outcome. The recordId is generated once up front so callers can correlate
    // the same attempt across logs even if `result` is constructed late.
    const auditEnabled = !!this.options.auditSink;
    const auditRecordId = auditEnabled ? this.nextRuntimeId() : undefined;
    const auditOccurredAt = auditEnabled ? this.getNow() : 0;

    let result: CommandResult | undefined;
    let thrown: unknown;
    // Event bus: the top-level runCommand owns the outbound batch; nested
    // (reaction/saga) commands accumulate into it and do not publish. Only
    // allocated when a bus is configured so the common path stays untouched.
    const ownsBusBatch = this.options.eventBus !== undefined && this.busBatch === null;
    if (ownsBusBatch) this.busBatch = [];
    try {
      // Tenant context gate: fail closed before ANY work, including idempotency
      // cache reads/writes. Falsy values (undefined, '', null) all count as
      // missing — preventing accidental empty-string passes.
      // Gate activates when EITHER the explicit option is set OR the IR declares a tenant.
      const tenantRequired = this.options.requireTenantContext || !!this.ir.tenant;
      const tenantValue = this.ir.tenant ? this.resolveTenantValue() : this.context.tenantId;
      if (tenantRequired && !tenantValue) {
        result = {
          success: false,
          error: 'MISSING_TENANT_CONTEXT: tenant-scoped command invoked without context.tenantId',
          emittedEvents: [],
        };
        return result;
      }

      // Idempotency short-circuit (before ANY evaluation)
      if (this.options.idempotencyStore) {
        if (options.idempotencyKey === undefined) {
          result = {
            success: false,
            error: 'IdempotencyStore is configured but no idempotencyKey was provided',
            emittedEvents: [],
          };
          return result;
        }
        const cached = await this.options.idempotencyStore.get(options.idempotencyKey);
        if (cached !== undefined) {
          result = cached;
          return cached;
        }
      }

      // Async command branch: enqueue job instead of executing synchronously.
      // Re-entry from job worker (context.source === 'job') bypasses this branch
      // so the actual command body runs during drainJobs().
      const command = this.getCommand(commandName, options.entityName);
      if (command?.async && this.context.source !== 'job') {
        // Validate policies/constraints/guards synchronously (fail-fast)
        const validation = await this._validateAsyncCommand(commandName, input, options);
        if (!validation.success) {
          result = validation;
          return result;
        }

        if (!this.options.jobQueue) {
          result = {
            success: false,
            error:
              'MISSING_JOB_QUEUE: async command invoked but no jobQueue is configured in RuntimeOptions',
            emittedEvents: [],
          };
          return result;
        }

        const jobId = this.nextRuntimeId();
        const enqueuedAt = this.getNow();
        // Threads the active transaction when this async command is dispatched
        // from inside another command's transaction (e.g. a reaction target);
        // null at top level, where a single enqueue needs no transaction.
        await this.options.jobQueue.enqueue(
          {
            jobId,
            commandName,
            entityName: options.entityName,
            instanceId: options.instanceId,
            input,
            correlationId: options.correlationId,
            causationId: options.causationId,
            enqueuedAt,
            status: 'pending',
          },
          this.activeTx ?? undefined,
        );

        result = {
          success: true,
          result: { jobId, status: 'pending', enqueuedAt },
          emittedEvents: [],
        };
        return result;
      }

      // Full command execution (with optional retry wrapper)
      if (this.profilingBridge.isEnabled()) {
        this.profilingBridge.beginCommand(
          commandName,
          options.entityName,
          options.instanceId,
          this.getNow(),
        );
      }
      // Provider mode: wrap each attempt (execute + outbox enqueue + idempotency
      // set) in one transaction. Only opened at the top level — a nested command
      // (reaction/saga) runs with this.activeTx already set and JOINS it below
      // instead of opening a second transaction.
      if (this.options.transactionProvider && this.activeTx === null) {
        result = await this._runCommandInTransaction(
          this.options.transactionProvider,
          command,
          commandName,
          input,
          options,
        );
        return result;
      }

      const runOnce = () => this._executeCommandInternal(commandName, input, options);
      if (command?.retry) {
        result = await executeWithRetry(command.retry, runOnce, {
          sleep: this.options.sleep,
          retryJitter: this.options.retryJitter,
        });
      } else {
        result = await runOnce();
      }

      // Outbox enqueue + idempotency set for the non-transactional path. Skipped
      // when a transaction is already active (a nested command joining a provider
      // transaction): the top-level attempt owns the single outbox enqueue for
      // the full emitted-event set and the idempotency record. In pure
      // non-provider mode this.activeTx is always null, so this runs exactly as
      // before — the enqueue is NOT transactional w.r.t. mutation and stays
      // fail-open (see docs/spec/adapters.md § "Outbox Store — Transaction Boundary").
      if (this.activeTx === null) {
        if (this.options.outboxStore && result.success && result.emittedEvents.length > 0) {
          await this.enqueueOutbox(result.emittedEvents, commandName, options);
        }
        // Cache result (success OR failure)
        if (this.options.idempotencyStore && options.idempotencyKey !== undefined) {
          await this.options.idempotencyStore.set(options.idempotencyKey, result);
        }
      }

      return result;
    } catch (e) {
      thrown = e;
      throw e;
    } finally {
      if (this.profilingBridge.isEnabled() && result !== undefined) {
        this.profilingBridge.complete(result.success, this.ir.entities.length, this.stores.size);
      }
      if (auditEnabled) {
        await this.emitAudit({
          sink: this.options.auditSink!,
          recordId: auditRecordId!,
          occurredAt: auditOccurredAt,
          commandName,
          entityName: options.entityName,
          result,
          thrown,
        });
      }
      // Publish this command's collected events to the EventBus (post-commit,
      // once per top-level command). Fail-open: publishBatchToEventBus swallows
      // and logs errors so it never fails the command. Reset the batch first so
      // a publish that re-enters (should not, but defensively) starts clean.
      if (ownsBusBatch) {
        const batch = this.busBatch ?? [];
        this.busBatch = null;
        await this.publishBatchToEventBus(batch);
      }
    }
  }

  // ─── Saga Orchestration ──────────────────────────────────────────────

  /**
   * Execute a saga: run steps in declaration order, compensating completed
   * steps in reverse order on failure (when onFailure === 'compensate').
   * Each step dispatches via `runCommand` — all policies, guards, and
   * constraints of the step's command still apply.
   */
  async runSaga(
    sagaName: string,
    stepInputs: Record<string, { input?: Record<string, unknown>; instanceId?: string }> = {},
    options: { correlationId?: string } = {},
  ): Promise<SagaResult> {
    const saga = (this.ir.sagas || []).find((s) => s.name === sagaName);
    if (!saga) {
      return {
        saga: sagaName,
        success: false,
        status: 'aborted',
        steps: [],
        emittedEvents: [],
        error: `Unknown saga '${sagaName}'`,
      };
    }

    const correlationId = options.correlationId ?? this.nextRuntimeId();
    const emittedEvents: EmittedEvent[] = [];
    const stepResults: SagaStepResult[] = [];
    const completed: { step: IRSaga['steps'][number]; instanceId?: string }[] = [];

    // 1. Emit SagaStarted (only if declared in saga's emits)
    this.emitSagaLifecycle(
      saga,
      'SagaStarted',
      { sagaName: saga.name },
      correlationId,
      emittedEvents,
    );

    // 2. Execute steps in declaration order
    for (const step of saga.steps) {
      const cfg = stepInputs[step.name] ?? {};
      const res = await this.runCommand(step.command, cfg.input ?? {}, {
        entityName: step.commandEntity,
        instanceId: cfg.instanceId,
        correlationId,
        causationId: `${saga.name}:${step.name}`,
      });
      emittedEvents.push(...res.emittedEvents);

      if (!res.success) {
        // Step failed
        stepResults.push({
          step: step.name,
          command: `${step.commandEntity}.${step.command}`,
          status: 'failed',
          result: res,
          error: res.error,
        });

        if (saga.onFailure === 'compensate') {
          // Compensate completed steps in reverse order
          await this.compensateSagaSteps(
            saga,
            completed,
            stepInputs,
            correlationId,
            emittedEvents,
            stepResults,
          );
          this.emitSagaLifecycle(
            saga,
            'SagaFailed',
            { sagaName: saga.name, failedStep: step.name },
            correlationId,
            emittedEvents,
          );
          return {
            saga: saga.name,
            success: false,
            status: 'compensated',
            steps: stepResults,
            emittedEvents,
            failedStep: step.name,
            error: res.error,
          };
        } else {
          // Abort: no compensation
          this.emitSagaLifecycle(
            saga,
            'SagaFailed',
            { sagaName: saga.name, failedStep: step.name },
            correlationId,
            emittedEvents,
          );
          return {
            saga: saga.name,
            success: false,
            status: 'aborted',
            steps: stepResults,
            emittedEvents,
            failedStep: step.name,
            error: res.error,
          };
        }
      }

      // Step succeeded
      stepResults.push({
        step: step.name,
        command: `${step.commandEntity}.${step.command}`,
        status: 'completed',
        result: res,
      });
      completed.push({ step, instanceId: cfg.instanceId });
      this.emitSagaLifecycle(
        saga,
        'SagaStepCompleted',
        { sagaName: saga.name, step: step.name },
        correlationId,
        emittedEvents,
      );
    }

    // 3. All steps completed successfully
    this.emitSagaLifecycle(
      saga,
      'SagaCompleted',
      { sagaName: saga.name },
      correlationId,
      emittedEvents,
    );
    return {
      saga: saga.name,
      success: true,
      status: 'completed',
      steps: stepResults,
      emittedEvents,
    };
  }

  /**
   * Compensate completed saga steps in reverse order (best-effort).
   * Compensation failures are recorded but do not throw — all remaining
   * compensations still execute.
   */
  private async compensateSagaSteps(
    saga: IRSaga,
    completed: { step: IRSaga['steps'][number]; instanceId?: string }[],
    stepInputs: Record<string, { input?: Record<string, unknown>; instanceId?: string }>,
    correlationId: string,
    emittedEvents: EmittedEvent[],
    stepResults: SagaStepResult[],
  ): Promise<void> {
    // Iterate completed steps in reverse
    for (let i = completed.length - 1; i >= 0; i--) {
      const { step, instanceId } = completed[i];
      const matchingResult = stepResults.find((r) => r.step === step.name);

      if (!step.compensate || !step.compensateEntity) {
        // No compensation declared — mark as skipped
        if (matchingResult) matchingResult.status = 'skipped';
        continue;
      }

      // Hand the original forward-step input to the compensation. A refund
      // needs the charge's amount, a release needs the reserve's quantity, etc.
      // Without this, the compensation command's guards see nothing and the
      // reversal silently no-ops. See spec/semantics.md § Saga compensation.
      const compensationInput = stepInputs[step.name]?.input ?? {};

      try {
        const compResult = await this.runCommand(step.compensate, compensationInput, {
          entityName: step.compensateEntity,
          instanceId,
          correlationId,
          causationId: `${saga.name}:${step.name}:compensate`,
        });
        emittedEvents.push(...compResult.emittedEvents);

        if (matchingResult) {
          matchingResult.compensation = compResult;
          // A compensation that fails its guard/policy/constraint returns
          // success:false (no throw). Such a step was NOT reversed — surface
          // it as compensation_failed rather than mislabeling it 'compensated'.
          if (compResult.success) {
            matchingResult.status = 'compensated';
          } else {
            matchingResult.status = 'compensation_failed';
            matchingResult.error = compResult.error;
          }
        }
      } catch (e) {
        // A thrown compensation is also a failed reversal. Record the error and
        // keep compensating the remaining steps (best-effort), but do not claim
        // this step was reversed.
        if (matchingResult) {
          matchingResult.status = 'compensation_failed';
          matchingResult.error = e instanceof Error ? e.message : String(e);
        }
      }
    }
  }

  /**
   * Emit a saga lifecycle event (SagaStarted, SagaCompleted, SagaFailed,
   * SagaStepCompleted) only if declared in the saga's `emits` array.
   */
  private emitSagaLifecycle(
    saga: IRSaga,
    eventName: string,
    payload: Record<string, unknown>,
    correlationId: string,
    sink: EmittedEvent[],
  ): void {
    if (!saga.emits.includes(eventName)) return;

    const event = (this.ir.events || []).find((e) => e.name === eventName);
    const prov = this.ir.provenance;

    const emitted: EmittedEvent = {
      name: eventName,
      channel: event?.channel || eventName,
      payload,
      timestamp: this.getNow(),
      ...(prov
        ? {
            provenance: {
              contentHash: prov.contentHash,
              compilerVersion: prov.compilerVersion,
              schemaVersion: prov.schemaVersion,
            },
          }
        : {}),
      correlationId,
      causationId: `saga:${saga.name}`,
    };

    sink.push(emitted);
    this.eventLog.push(emitted);
    this.notifyListeners(emitted);
  }

  /**
   * Map a CommandResult and any thrown error into a CommandOutcome for the
   * AuditRecord. The mapping mirrors the exit paths inside runCommand and
   * _executeCommandInternal — keep them in lock-step when adding new
   * failure modes.
   */
  private classifyOutcome(
    result: CommandResult | undefined,
    thrown: unknown,
  ): import('./audit/audit-sink').CommandOutcome {
    if (thrown !== undefined) return 'error';
    if (!result) return 'error';
    if (result.success) return 'success';
    if (result.policyDenial) return 'policy_denied';
    if (result.guardFailure) return 'guard_denied';
    if (result.rateLimitDenial) return 'rate_limit_denied';
    if (result.concurrencyConflict) return 'concurrency_conflict';
    if (typeof result.error === 'string' && result.error.startsWith('MISSING_TENANT_CONTEXT')) {
      return 'missing_tenant_context';
    }
    // A blocking constraint failure is distinguishable by the presence of a
    // blocking outcome on result.constraintOutcomes (non-blocking warn/ok
    // outcomes ride along with success too, so we must check severity).
    if (
      result.constraintOutcomes?.some((o) => !o.passed && !o.overridden && o.severity === 'block')
    ) {
      return 'constraint_failed';
    }
    return 'error';
  }

  /**
   * Build and emit a single AuditRecord through the configured sink.
   * Sink errors are caught and logged — audit emission MUST NOT alter
   * command-execution behavior. This is the documented fail-open policy
   * (see docs/spec/adapters.md § "Audit Sink").
   */
  private async emitAudit(args: {
    sink: import('./audit/audit-sink').AuditSink;
    recordId: string;
    occurredAt: number;
    commandName: string;
    entityName?: string;
    result: CommandResult | undefined;
    thrown: unknown;
  }): Promise<void> {
    const { sink, recordId, occurredAt, commandName, entityName, result, thrown } = args;

    const outcome = this.classifyOutcome(result, thrown);
    const commandId = entityName ? `${entityName}.${commandName}` : commandName;

    // Diagnostics surface the structured failure for failed outcomes; for
    // success we carry along non-blocking constraint outcomes when present.
    let diagnostics: unknown = undefined;
    if (thrown !== undefined) {
      diagnostics = { error: thrown instanceof Error ? thrown.message : String(thrown) };
    } else if (result) {
      const parts: Record<string, unknown> = {};
      if (result.error !== undefined) parts.error = result.error;
      if (result.deniedBy !== undefined) parts.deniedBy = result.deniedBy;
      if (result.policyDenial) parts.policyDenial = result.policyDenial;
      if (result.guardFailure) parts.guardFailure = result.guardFailure;
      if (result.concurrencyConflict) parts.concurrencyConflict = result.concurrencyConflict;
      if (result.constraintOutcomes && result.constraintOutcomes.length > 0) {
        parts.constraintOutcomes = result.constraintOutcomes;
      }
      if (result.overrideRequests && result.overrideRequests.length > 0) {
        parts.overrideRequests = result.overrideRequests;
      }
      if (Object.keys(parts).length > 0) diagnostics = parts;
    }

    const emittedEventNames = result?.emittedEvents?.map((e) => e.name);

    const record: import('./audit/audit-sink').AuditRecord = {
      recordId,
      occurredAt,
      command: commandName,
      commandId,
      outcome,
      ...(entityName !== undefined ? { entity: entityName } : {}),
      ...(this.context.tenantId !== undefined ? { tenantId: this.context.tenantId } : {}),
      ...(this.context.orgId !== undefined ? { orgId: this.context.orgId } : {}),
      ...(this.context.actorId !== undefined ? { actorId: this.context.actorId } : {}),
      ...(this.context.requestId !== undefined ? { requestId: this.context.requestId } : {}),
      ...(this.context.source !== undefined ? { source: this.context.source } : {}),
      ...(this.ir.provenance?.contentHash ? { irHash: this.ir.provenance.contentHash } : {}),
      ...(diagnostics !== undefined ? { diagnostics } : {}),
      ...(emittedEventNames && emittedEventNames.length > 0 ? { emittedEventNames } : {}),
    };

    try {
      await sink.emit(record);
    } catch (sinkError) {
      // Fail-open: audit sink errors MUST NOT alter command execution.
      // Surface the failure on stderr so operators can wire alerts off it.
      console.warn(
        '[Manifest Runtime] AuditSink.emit failed; record dropped:',
        sinkError instanceof Error ? sinkError.message : sinkError,
      );
    }
  }

  /**
   * Enqueue emitted events into the configured OutboxStore as a batch.
   * Behavior depends on whether a command transaction is active:
   *
   * - Provider mode (this.activeTx set): the enqueue joins the command's
   *   transaction (threading this.activeTx) and a failure is RETHROWN as an
   *   OutboxEnqueueError so the transaction rolls back — the command then fails
   *   with OUTBOX_ENQUEUE_FAILED rather than silently dropping a durable event.
   * - Non-provider mode (this.activeTx null): the enqueue is best-effort and
   *   fail-open — a failure is logged to stderr and MUST NOT alter the
   *   CommandResult the caller already received.
   */
  private async enqueueOutbox(
    events: EmittedEvent[],
    _commandName: string,
    _runOptions: { entityName?: string; instanceId?: string },
  ): Promise<void> {
    const store = this.options.outboxStore;
    if (!store) return;

    const enqueuedAt = this.getNow();
    const entries: import('./outbox/outbox-store').OutboxEntry[] = events.map((event) => ({
      entryId: this.nextRuntimeId(),
      enqueuedAt,
      event,
      status: 'pending',
      attempts: 0,
    }));

    try {
      await store.enqueue(entries, this.activeTx ?? undefined);
    } catch (storeError) {
      // Inside a command transaction, a dropped durable event must fail the
      // command (roll back), not be swallowed.
      if (this.activeTx !== null) {
        throw new OutboxEnqueueError(storeError);
      }
      console.warn(
        '[Manifest Runtime] OutboxStore.enqueue failed; events not durably persisted:',
        storeError instanceof Error ? storeError.message : storeError,
      );
    }
  }

  /**
   * Provider-mode command execution. Wraps EACH attempt — command body + its
   * outbox enqueue + its idempotency record — in one `withTransaction` call, so
   * those writes commit or roll back together. A failed attempt (thrown store
   * error, thrown outbox failure, or a clean non-success result) rolls back
   * before the next attempt begins; only a committing attempt's writes survive.
   * In-process listener notifications are held until the transaction commits.
   *
   * Nested commands (reactions/sagas) never reach here: they run with
   * this.activeTx already set and take the non-transactional branch in
   * runCommand, joining this transaction rather than opening another.
   *
   * See docs/spec/adapters.md § "Outbox Store — Transaction Boundary".
   */
  private async _runCommandInTransaction(
    provider: TransactionProvider,
    command: IRCommand | undefined,
    commandName: string,
    input: Record<string, unknown>,
    options: {
      entityName?: string;
      instanceId?: string;
      overrideRequests?: OverrideRequest[];
      correlationId?: string;
      causationId?: string;
      idempotencyKey?: string;
    },
  ): Promise<CommandResult> {
    const attempt = async (): Promise<CommandResult> => {
      // Carried across the throw-to-rollback boundary within a single attempt.
      let cleanFailure: CommandResult | undefined;
      let committedNotifications: EmittedEvent[] = [];
      try {
        const committed = await provider.withTransaction(async (tx) => {
          const prevTx = this.activeTx;
          const prevDeferred = this.deferredNotifications;
          this.activeTx = tx;
          this.deferredNotifications = [];
          try {
            const r = await this._executeCommandInternal(commandName, input, options);
            if (r.success) {
              // Outbox enqueue throws OutboxEnqueueError on failure so a
              // dropped durable event rolls the whole attempt back.
              if (this.options.outboxStore && r.emittedEvents.length > 0) {
                await this.enqueueOutbox(r.emittedEvents, commandName, options);
              }
              if (this.options.idempotencyStore && options.idempotencyKey !== undefined) {
                await this.options.idempotencyStore.set(options.idempotencyKey, r, tx);
              }
              committedNotifications = this.deferredNotifications ?? [];
              return r; // commit
            }
            // Clean failure: roll back so no partial write (e.g. an eager
            // auto-create) survives, then surface the result after rollback.
            cleanFailure = r;
            throw TX_ROLLBACK;
          } finally {
            this.activeTx = prevTx;
            this.deferredNotifications = prevDeferred;
          }
        });
        // Transaction committed — safe to notify external listeners now.
        for (const ev of committedNotifications) this.dispatchToListeners(ev);
        // Collect the committed set for the outbound EventBus batch (post-commit):
        // the full parent + reaction event set becomes one published message. A
        // rolled-back attempt returns via TX_ROLLBACK above and never reaches here.
        if (this.busBatch !== null) this.busBatch.push(...committedNotifications);
        return committed;
      } catch (e) {
        if (e === TX_ROLLBACK && cleanFailure !== undefined) {
          return cleanFailure; // rolled back; buffered notifications discarded
        }
        throw e;
      }
    };

    try {
      if (command?.retry) {
        return await executeWithRetry(command.retry, attempt, {
          sleep: this.options.sleep,
          retryJitter: this.options.retryJitter,
        });
      }
      return await attempt();
    } catch (e) {
      // A durable outbox write that failed inside the transaction becomes a
      // command failure rather than a thrown error escaping runCommand.
      if (e instanceof OutboxEnqueueError) {
        return {
          success: false,
          error: `OUTBOX_ENQUEUE_FAILED: ${e.message}`,
          emittedEvents: [],
        };
      }
      throw e;
    }
  }

  /**
   * Command parameter processing (docs/spec/semantics.md, "Commands").
   * 1) Trusted-source params: strip any client-supplied value, inject from
   *    RuntimeContext at `trustedSource` (fail closed with MISSING_TRUSTED_CONTEXT
   *    when required and unresolved).
   * 2) Apply declared `defaultValue` for omitted args.
   * 3) Reject omitted required params with no default (MISSING_REQUIRED_PARAMETER).
   * An explicit `undefined` is treated as absent; `null` counts as supplied
   * for non-trusted params. Returns the augmented input on success.
   */
  private processCommandParameters(
    command: IRCommand,
    input: Record<string, unknown>,
  ): { ok: true; input: Record<string, unknown> } | { ok: false; failure: ParameterFailure } {
    const params = command.parameters;
    if (!params || params.length === 0) return { ok: true, input };
    let next: Record<string, unknown> | undefined;

    for (const p of params) {
      if (!p.trustedSource) continue;
      next = next ?? { ...input };
      // Always strip spoofed client values for trusted params.
      delete next[p.name];
      const injected = this.resolveTrustedSource(p.trustedSource);
      if (injected !== undefined && injected !== null) {
        next[p.name] = injected;
        continue;
      }
      if (p.defaultValue !== undefined) {
        next[p.name] = this.irValueToJs(p.defaultValue);
        continue;
      }
      if (p.required) {
        return {
          ok: false,
          failure: {
            parameter: p.name,
            expectedType: p.type?.name,
            code: 'MISSING_TRUSTED_CONTEXT',
          },
        };
      }
    }

    const working = next ?? input;
    let withDefaults: Record<string, unknown> | undefined;
    for (const p of params) {
      if (p.trustedSource) continue; // already handled
      if (working[p.name] !== undefined) continue;
      if (p.defaultValue !== undefined) {
        withDefaults = withDefaults ?? { ...working };
        withDefaults[p.name] = this.irValueToJs(p.defaultValue);
        continue;
      }
      if (p.required) {
        return { ok: false, failure: { parameter: p.name, expectedType: p.type?.name } };
      }
    }
    return { ok: true, input: withDefaults ?? working };
  }

  /**
   * Resolve a trustedSource path like `context.actorId` against the active
   * RuntimeContext. Only `context.*` paths are supported (language grammar).
   */
  private resolveTrustedSource(trustedSource: string): unknown {
    if (!trustedSource.startsWith('context.')) return undefined;
    const path = trustedSource.slice('context.'.length);
    if (!path) return undefined;
    let cur: unknown = this.context;
    for (const segment of path.split('.')) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[segment];
    }
    return cur;
  }

  /**
   * Validate an async command synchronously (policies, constraints, guards)
   * without executing actions. Used for fail-fast before enqueuing a job.
   */
  private async _validateAsyncCommand(
    commandName: string,
    input: Record<string, unknown>,
    options: {
      entityName?: string;
      instanceId?: string;
      overrideRequests?: OverrideRequest[];
      correlationId?: string;
      causationId?: string;
    },
  ): Promise<CommandResult> {
    const command = this.getCommand(commandName, options.entityName);
    if (!command) {
      return {
        success: false,
        error: `Command '${commandName}' not found`,
        emittedEvents: [],
      };
    }

    // Parameter processing mirrors the synchronous path so an async command
    // fails fast (before enqueue) on a missing required parameter.
    const paramResult = this.processCommandParameters(command, input);
    if (!paramResult.ok) {
      const code = paramResult.failure.code ?? 'MISSING_REQUIRED_PARAMETER';
      return {
        success: false,
        error: `${code}: command '${commandName}' requires parameter '${paramResult.failure.parameter}'`,
        parameterFailure: paramResult.failure,
        emittedEvents: [],
      };
    }
    input = paramResult.input;

    const instance =
      options.instanceId && options.entityName
        ? await this.getInstanceRaw(options.entityName, options.instanceId)
        : undefined;

    const evalContext = this.buildEvalContext(input, instance, options.entityName);

    // Check policies
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

    // Evaluate constraints
    const commandContext = {
      commandName,
      entityName: options.entityName,
      instanceId: options.instanceId,
    };
    const constraintResult = await this.evaluateCommandConstraints(
      command,
      evalContext,
      options.overrideRequests,
      commandContext,
    );
    if (!constraintResult.allowed) {
      const blocking = constraintResult.outcomes.find(
        (o) => !o.passed && !o.overridden && o.severity === 'block',
      );
      return {
        success: false,
        error: blocking?.message || `Command blocked by constraint '${blocking?.constraintName}'`,
        constraintOutcomes: constraintResult.outcomes,
        emittedEvents: [],
      };
    }

    // Evaluate guards
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
          constraintOutcomes:
            constraintResult.outcomes.length > 0 ? constraintResult.outcomes : undefined,
          emittedEvents: [],
        };
      }
    }

    // All validation passed
    return { success: true, emittedEvents: [] };
  }

  /**
   * Drain all pending jobs from the job queue and execute them.
   * Returns an array of CommandResults, one per drained job.
   * For deterministic testing: executes jobs synchronously in FIFO order.
   *
   * For each job:
   * - Sets context.source = 'job' to bypass the async enqueue branch
   * - Executes the full command body (actions + emits)
   * - Emits completion or failure event on the synthesized channel
   * - Updates job status in the queue
   */
  async drainJobs(): Promise<CommandResult[]> {
    if (!this.options.jobQueue) {
      return [];
    }

    const pending = await this.options.jobQueue.drainPending();
    const results: CommandResult[] = [];

    const originalSource = this.context.source;

    for (const job of pending) {
      // Set context.source = 'job' so the async branch is bypassed
      this.context.source = 'job';

      try {
        const result = await this._executeCommandInternal(job.commandName, job.input, {
          entityName: job.entityName,
          instanceId: job.instanceId,
          correlationId: job.correlationId,
          causationId: job.causationId,
        });

        if (result.success) {
          await this.options.jobQueue.updateStatus(job.jobId, 'completed', {
            result: result.result,
          });

          // Emit synthesized completion event
          const command = this.getCommand(job.commandName, job.entityName);
          if (command?.completionEvent) {
            const completionEvent: EmittedEvent = {
              name: command.completionEvent,
              channel: `jobs.${job.commandName}`,
              payload: { jobId: job.jobId, result: result.result, completedAt: this.getNow() },
              timestamp: this.getNow(),
              correlationId: job.correlationId,
              causationId: job.causationId,
            };
            result.emittedEvents.push(completionEvent);
          }
        } else {
          await this.options.jobQueue.updateStatus(job.jobId, 'failed', { error: result.error });

          // Emit synthesized failure event
          const command = this.getCommand(job.commandName, job.entityName);
          if (command?.failureEvent) {
            const failureEvent: EmittedEvent = {
              name: command.failureEvent,
              channel: `jobs.${job.commandName}`,
              payload: {
                jobId: job.jobId,
                error: result.error || 'Unknown error',
                failedAt: this.getNow(),
              },
              timestamp: this.getNow(),
              correlationId: job.correlationId,
              causationId: job.causationId,
            };
            result.emittedEvents.push(failureEvent);
          }
        }

        results.push(result);
      } catch (e) {
        await this.options.jobQueue.updateStatus(job.jobId, 'failed', {
          error: e instanceof Error ? e.message : String(e),
        });

        // Emit synthesized failure event
        const command = this.getCommand(job.commandName, job.entityName);
        if (command?.failureEvent) {
          const failureEvent: EmittedEvent = {
            name: command.failureEvent,
            channel: `jobs.${job.commandName}`,
            payload: {
              jobId: job.jobId,
              error: e instanceof Error ? e.message : String(e),
              failedAt: this.getNow(),
            },
            timestamp: this.getNow(),
            correlationId: job.correlationId,
            causationId: job.causationId,
          };
          results.push({
            success: false,
            error: e instanceof Error ? e.message : String(e),
            emittedEvents: [failureEvent],
          });
        } else {
          results.push({
            success: false,
            error: e instanceof Error ? e.message : String(e),
            emittedEvents: [],
          });
        }
      }
    }

    // Restore original source
    this.context.source = originalSource;

    return results;
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
    },
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

    // Clear modifier write-rejection tracking (readonly/unique on update)
    this.lastWriteRejection = null;

    this.actionTraceCounter = 0;

    // Initialize evaluation budget for bounded complexity enforcement
    const ownsEvalBudget = this.initEvalBudget();
    this.commandExecutionDepth += 1;
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

      // Command parameter processing (spec: Commands): trusted-source inject,
      // apply defaults, then fail closed on a missing required parameter before
      // any gate (rate-limit/policy/constraint/guard) runs.
      const paramResult = this.processCommandParameters(command, input);
      if (!paramResult.ok) {
        const code = paramResult.failure.code ?? 'MISSING_REQUIRED_PARAMETER';
        return {
          success: false,
          error: `${code}: command '${commandName}' requires parameter '${paramResult.failure.parameter}'`,
          parameterFailure: paramResult.failure,
          ...(options.correlationId !== undefined ? { correlationId: options.correlationId } : {}),
          ...(options.causationId !== undefined ? { causationId: options.causationId } : {}),
          emittedEvents: [],
        };
      }
      input = paramResult.input;

      const shouldAutoCreateInstance =
        commandName === 'create' && !!options.entityName && !options.instanceId;
      let autoCreateEntity: IREntity | undefined;
      let autoCreatePreparedData: Record<string, unknown> | undefined;
      let autoCreateEvalInput: Record<string, unknown> | undefined;

      if (shouldAutoCreateInstance && options.entityName) {
        autoCreateEntity = this.getEntity(options.entityName);
        if (autoCreateEntity) {
          const bodyId =
            typeof input.id === 'string' && input.id !== '' ? input.id : this.nextRuntimeId();
          autoCreatePreparedData = this.prepareCreateData(autoCreateEntity, {
            ...input,
            id: bodyId,
          });
          autoCreateEvalInput = { ...input, id: autoCreatePreparedData.id };
        }
      }

      const instance =
        options.instanceId && options.entityName
          ? await this.getInstanceRaw(options.entityName, options.instanceId)
          : (autoCreatePreparedData as EntityInstance | undefined);

      const evalContext = this.buildEvalContext(
        autoCreateEvalInput ?? input,
        instance,
        options.entityName,
      );

      if (command.rateLimit) {
        const tenantValue = this.ir.tenant ? this.resolveTenantValue() : this.context.tenantId;
        const rl = await checkRateLimitGate(
          this.rateLimiter,
          command.rateLimit,
          evalContext,
          tenantValue,
          this.getNow(),
        );
        if (!rl.allowed) {
          return {
            success: false,
            error: `Rate limit exceeded for scope ${rl.denial.scopeKey}`,
            rateLimitDenial: rl.denial,
            ...(options.correlationId !== undefined
              ? { correlationId: options.correlationId }
              : {}),
            ...(options.causationId !== undefined ? { causationId: options.causationId } : {}),
            emittedEvents: [],
          };
        }
      }

      // Middleware: before-policy hook
      const beforePolicyResult = await this.runMiddleware(
        'before-policy',
        command,
        evalContext,
        input,
        options,
      );
      if (beforePolicyResult) return beforePolicyResult;

      const policyResult = await this.profilingBridge.trackPhase('policyEvaluation', () =>
        this.checkPolicies(command, evalContext),
      );
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
      const commandContext = {
        commandName,
        entityName: options.entityName,
        instanceId: options.instanceId,
      };
      const constraintResult = await this.profilingBridge.trackPhase('constraintValidation', () =>
        this.evaluateCommandConstraints(
          command,
          evalContext,
          options.overrideRequests,
          commandContext,
        ),
      );
      if (!constraintResult.allowed) {
        // Find the blocking constraint for the error message
        const blocking = constraintResult.outcomes.find(
          (o) => !o.passed && !o.overridden && o.severity === 'block',
        );
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

      // Middleware: before-guard hook
      const beforeGuardResult = await this.runMiddleware(
        'before-guard',
        command,
        evalContext,
        input,
        options,
      );
      if (beforeGuardResult) return beforeGuardResult;

      this.profilingBridge.startPhase('guardEvaluation');
      for (let i = 0; i < command.guards.length; i += 1) {
        const guard = command.guards[i];
        const result = await this.evaluateExpression(guard, evalContext);
        if (!result) {
          this.profilingBridge.endPhase('guardEvaluation');
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
            constraintOutcomes:
              constraintResult.outcomes.length > 0 ? constraintResult.outcomes : undefined,
            ...(options.correlationId !== undefined
              ? { correlationId: options.correlationId }
              : {}),
            ...(options.causationId !== undefined ? { causationId: options.causationId } : {}),
            emittedEvents: [],
          };
        }
      }
      this.profilingBridge.endPhase('guardEvaluation');

      // ── Approval gate: block command if pending approval required ──
      this.profilingBridge.startPhase('approvalGate');
      if (options.entityName) {
        const approvalResult = await this.checkApprovalGate(
          commandName,
          options.entityName,
          options.instanceId,
          evalContext,
          options,
        );
        if (approvalResult) {
          this.profilingBridge.endPhase('approvalGate');
          return approvalResult;
        }
      }
      this.profilingBridge.endPhase('approvalGate');

      let autoCreatedInstance: EntityInstance | undefined;
      let createConstraintOutcomes: ConstraintOutcome[] | undefined;

      if (
        shouldAutoCreateInstance &&
        options.entityName &&
        autoCreateEntity &&
        autoCreatePreparedData
      ) {
        this.profilingBridge.startPhase('autoCreate');
        const createResult = await this.persistPreparedCreate(
          options.entityName,
          autoCreateEntity,
          autoCreatePreparedData,
          this.requiredModifierOutcomes(
            autoCreateEntity,
            input,
            this.commandProducedFields(command),
          ),
        );
        this.profilingBridge.endPhase('autoCreate');
        createConstraintOutcomes = createResult.constraintOutcomes;

        if (!createResult.instance) {
          const blocking = createConstraintOutcomes?.find(
            (o) => !o.passed && !o.overridden && o.severity === 'block',
          );
          return {
            success: false,
            error:
              blocking?.message || `Command blocked by constraint '${blocking?.constraintName}'`,
            constraintOutcomes: createConstraintOutcomes,
            overrideRequests: options.overrideRequests,
            ...(options.correlationId !== undefined
              ? { correlationId: options.correlationId }
              : {}),
            ...(options.causationId !== undefined ? { causationId: options.causationId } : {}),
            emittedEvents: [],
          };
        }

        autoCreatedInstance = createResult.instance;
        options.instanceId = createResult.instance.id;
        const createdEvalContext = this.buildEvalContext(
          autoCreateEvalInput ?? input,
          createResult.instance,
          options.entityName,
        );
        Object.assign(evalContext, createdEvalContext);
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

      // Pre-compute base subject for action-emitted events (entity + command + instanceId).
      // Full subject.id resolution (created-id / payload.id fallbacks) happens after the
      // action loop for command-declared events.
      const baseSubject: EventSubject = { command: commandName };
      if (options.entityName) {
        baseSubject.entity = options.entityName;
      }
      if (options.instanceId) {
        baseSubject.id = options.instanceId;
      }

      // Middleware: before-action hook (before each action in the loop)
      const beforeActionResult = await this.runMiddleware(
        'before-action',
        command,
        evalContext,
        input,
        options,
      );
      if (beforeActionResult) return beforeActionResult;

      // Open a command-scoped write buffer so mutate/compute actions batch into a
      // single store.update (flushed once below) instead of one read+write each.
      // Seeded with the already-loaded instance so no extra read is incurred.
      // Nested (reaction) commands save and restore the outer buffer.
      const prevBuffer = this.commandBuffer;
      if (options.entityName && options.instanceId) {
        this.commandBuffer = {
          entityName: options.entityName,
          id: options.instanceId,
          instance: autoCreatedInstance ?? instance ?? null,
          patch: {},
        };
      }
      try {
        this.profilingBridge.startPhase('actionExecution');
        for (const action of command.actions) {
          const actionResult = await this.executeAction(
            action,
            evalContext,
            options,
            emitCounter,
            workflowMeta,
            baseSubject,
            emittedEvents,
            commandName,
          );

          // Fail closed on an adapter-action configuration fault (MISSING_OUTBOX_STORE
          // / MISSING_EFFECT_HANDLER). Returning here skips the flush below: a failed
          // command persists nothing.
          if (this.lastActionError) {
            const actionError = this.lastActionError;
            this.lastActionError = null;
            return {
              success: false,
              error: actionError,
              ...(workflowMeta.correlationId !== undefined
                ? { correlationId: workflowMeta.correlationId }
                : {}),
              ...(workflowMeta.causationId !== undefined
                ? { causationId: workflowMeta.causationId }
                : {}),
              emittedEvents: [],
            };
          }

          // Check for transition validation errors after mutate/compute actions.
          // Returning here skips the flush below: a failed command persists nothing.
          if (this.lastTransitionError) {
            return {
              success: false,
              error: this.lastTransitionError,
              ...(workflowMeta.correlationId !== undefined
                ? { correlationId: workflowMeta.correlationId }
                : {}),
              ...(workflowMeta.causationId !== undefined
                ? { causationId: workflowMeta.causationId }
                : {}),
              emittedEvents: [],
            };
          }

          // Check for a modifier write-rejection (readonly change / unique collision)
          // after mutate/compute actions. A rejected write persists nothing.
          if (this.lastWriteRejection) {
            const rej: { code: string; message: string; property?: string } =
              this.lastWriteRejection;
            this.lastWriteRejection = null;
            return {
              success: false,
              error: `${rej.code}: ${rej.message}`,
              constraintOutcomes: [
                {
                  code: rej.code,
                  constraintName: rej.property ?? rej.code,
                  severity: 'block',
                  passed: false,
                  formatted: rej.message,
                  message: rej.message,
                  ...(rej.property ? { details: { property: rej.property } } : {}),
                },
              ],
              ...(workflowMeta.correlationId !== undefined
                ? { correlationId: workflowMeta.correlationId }
                : {}),
              ...(workflowMeta.causationId !== undefined
                ? { causationId: workflowMeta.causationId }
                : {}),
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
              ...(workflowMeta.correlationId !== undefined
                ? { correlationId: workflowMeta.correlationId }
                : {}),
              ...(workflowMeta.causationId !== undefined
                ? { causationId: workflowMeta.causationId }
                : {}),
              emittedEvents: [],
            };
          }

          // Only `mutate` changes the instance now (compute is a non-persisting
          // local binding, set directly into evalContext by executeAction), so the
          // post-action instance refresh runs for mutate alone — refreshing after a
          // compute would clobber the fresh binding with re-fetched instance fields.
          if (action.kind === 'mutate' && options.instanceId && options.entityName) {
            const currentInstance = await this.getInstanceRaw(
              options.entityName,
              options.instanceId,
            );
            // Enrich re-fetched instance with _entity for relationship resolution
            const enriched = currentInstance
              ? { ...currentInstance, _entity: options.entityName }
              : currentInstance;
            // Refresh both self/this bindings and spread instance properties into evalContext
            evalContext.self = enriched;
            evalContext.this = enriched;
            Object.assign(evalContext, enriched);
            Object.assign(evalContext, input);
          }
          result = actionResult;
        }
        this.profilingBridge.endPhase('actionExecution');

        if (autoCreatedInstance && options.entityName) {
          const currentInstance = await this.getInstanceRaw(
            options.entityName,
            autoCreatedInstance.id,
          );
          autoCreatedInstance = currentInstance ?? autoCreatedInstance;
          result = autoCreatedInstance;
        }

        // Flush the accumulated field changes in a single store write. Runs before
        // event emission and reaction dispatch so emitted events and any reactions
        // observe the final committed command state. An explicit `persist` action
        // may already have flushed and cleared the patch; this flushes the remainder.
        await this.flushCommandBuffer();
      } finally {
        this.commandBuffer = prevBuffer;
      }

      this.profilingBridge.startPhase('eventEmission');
      // Finalize canonical subject metadata for command-declared events.
      // Resolution order for subject.id:
      //   1. instanceId passed to runCommand (already set on baseSubject)
      //   2. A single deterministically created record id (justCreatedInstanceIds)
      //   3. Top-level payload.id from the emitted event payload (checked per-event below)
      //   4. Unset
      const subject: EventSubject = { ...baseSubject };
      if (!subject.id && this.justCreatedInstanceIds.size === 1) {
        const [createdId] = this.justCreatedInstanceIds;
        subject.id = createdId;
      }

      for (const eventName of command.emits) {
        const event = this.ir.events.find((e) => e.name === eventName);
        const prov = this.ir.provenance;
        const eventPayload: Record<string, unknown> = { ...input, result };

        // G7: populate explicitly-declared payload fields (`emit Event { field: expr }`).
        // Evaluated against the post-action evalContext (self = current instance,
        // command input, user, context) so reactions can read declared event fields
        // instead of finding them undefined.
        const payloadSpec = command.emitPayloads?.find((ep) => ep.eventName === eventName);
        if (payloadSpec) {
          for (const field of payloadSpec.fields) {
            eventPayload[field.name] = await this.evaluateExpression(field.expression, evalContext);
          }
        }

        // Fallback: resolve subject.id from payload.id if not yet set
        const eventSubject: EventSubject = subject.id
          ? { ...subject }
          : {
              ...subject,
              ...(typeof (eventPayload as Record<string, unknown>).id === 'string' &&
              (eventPayload as Record<string, unknown>).id !== ''
                ? { id: (eventPayload as Record<string, unknown>).id as string }
                : {}),
            };

        const emitted: EmittedEvent = {
          name: eventName,
          channel: event?.channel || eventName,
          payload: eventPayload,
          subject: eventSubject,
          timestamp: this.getNow(),
          ...(prov
            ? {
                provenance: {
                  contentHash: prov.contentHash,
                  compilerVersion: prov.compilerVersion,
                  schemaVersion: prov.schemaVersion,
                },
              }
            : {}),
          ...(workflowMeta.correlationId !== undefined
            ? { correlationId: workflowMeta.correlationId }
            : {}),
          ...(workflowMeta.causationId !== undefined
            ? { causationId: workflowMeta.causationId }
            : {}),
          emitIndex: emitCounter.value++,
        };
        emittedEvents.push(emitted);
        this.eventLog.push(emitted);
        this.notifyListeners(emitted);
      }

      // Execute matching reaction rules for emitted events (declaration order)
      const reactions = this.ir.reactions || [];
      if (reactions.length > 0 && emittedEvents.length > 0) {
        // Use index-based iteration since cascading reactions may append to emittedEvents
        const initialLength = emittedEvents.length;
        for (let ei = 0; ei < initialLength; ei++) {
          const emitted = emittedEvents[ei];
          const matchingReactions = reactions.filter((r) => r.event === emitted.name);
          for (const reaction of matchingReactions) {
            if (this.reactionDepth >= RuntimeEngine.MAX_REACTION_DEPTH) {
              throw new ManifestReactionDepthError(
                this.reactionDepth,
                reaction.event,
                `${reaction.targetEntity}.${reaction.targetCommand}`,
              );
            }
            // Evaluate resolve and params expressions against event context.
            // Available bindings:
            //   payload  — event payload fields merged with subject metadata
            //   self     — alias for payload (convenient for member access)
            const eventPayloadBase =
              typeof emitted.payload === 'object' && emitted.payload !== null
                ? (emitted.payload as Record<string, unknown>)
                : {};
            const enrichedPayload = {
              ...eventPayloadBase,
              // Alias the event source id to top-level `id` so reaction expressions
              // like `self.id` / `payload.id` resolve (the Convex projection's
              // reaction payload does the same). Only when the payload has no id.
              ...(eventPayloadBase.id === undefined && emitted.subject?.id !== undefined
                ? { id: emitted.subject.id }
                : {}),
              _subject: emitted.subject,
              _eventName: emitted.name,
              _channel: emitted.channel,
            };
            const reactionContext: Record<string, unknown> = {
              payload: enrichedPayload,
              self: enrichedPayload,
            };
            // Fan-out reaction: dispatch the command on EVERY target row where
            // row.<matchField> == matchSource (evaluated against the event payload),
            // instead of one resolved target. The collection match replaces resolve.
            if (reaction.fanOut) {
              const matchValue = await this.evaluateExpression(
                reaction.fanOut.matchSource,
                reactionContext,
              );
              const fanInput: Record<string, unknown> = {};
              if (reaction.params) {
                for (const p of reaction.params) {
                  fanInput[p.name] = await this.evaluateExpression(p.expression, reactionContext);
                }
              }
              const matchField = reaction.fanOut.matchField;
              const matches = (await this.getAllInstancesRaw(reaction.targetEntity)).filter(
                (inst) => (inst as Record<string, unknown>)[matchField] === matchValue,
              );
              for (const m of matches) {
                if (this.reactionDepth >= RuntimeEngine.MAX_REACTION_DEPTH) {
                  throw new ManifestReactionDepthError(
                    this.reactionDepth,
                    reaction.event,
                    `${reaction.targetEntity}.${reaction.targetCommand}`,
                  );
                }
                this.reactionDepth++;
                try {
                  const fanResult = await this.runCommand(reaction.targetCommand, fanInput, {
                    entityName: reaction.targetEntity,
                    instanceId: String((m as Record<string, unknown>).id ?? ''),
                    correlationId: workflowMeta.correlationId,
                    causationId: emitted.name,
                  });
                  if (fanResult.emittedEvents) emittedEvents.push(...fanResult.emittedEvents);
                } finally {
                  this.reactionDepth--;
                }
              }
              continue;
            }
            // Single-target reaction: fanOut reactions have no resolve and continue above.
            if (!reaction.resolve) continue;
            const resolvedId = await this.evaluateExpression(reaction.resolve, reactionContext);
            // Evaluate param mappings
            const reactionInput: Record<string, unknown> = {};
            if (reaction.params) {
              for (const param of reaction.params) {
                reactionInput[param.name] = await this.evaluateExpression(
                  param.expression,
                  reactionContext,
                );
              }
            }
            // A reaction whose target command is `create` must flow through the
            // auto-create path (runCommand only auto-creates when instanceId is
            // ABSENT). Forcing instanceId here made create-target reactions run
            // mutate actions against a non-existent instance and persist nothing.
            // For create targets the resolved value identifies the NEW instance's
            // id, so thread it through as input.id (unless params set one).
            const isCreateTarget = reaction.targetCommand === 'create';
            let reactionInstanceId: string | undefined = String(resolvedId);
            if (isCreateTarget) {
              reactionInstanceId = undefined;
              if (
                reactionInput.id === undefined &&
                resolvedId !== undefined &&
                resolvedId !== null
              ) {
                reactionInput.id = String(resolvedId);
              }
            }
            // Dispatch the reaction command
            this.reactionDepth++;
            try {
              const reactionResult = await this.runCommand(reaction.targetCommand, reactionInput, {
                entityName: reaction.targetEntity,
                instanceId: reactionInstanceId,
                correlationId: workflowMeta.correlationId,
                causationId: emitted.name,
              });
              // Collect events from reaction-triggered commands
              if (reactionResult.emittedEvents) {
                emittedEvents.push(...reactionResult.emittedEvents);
              }
            } finally {
              this.reactionDepth--;
            }
          }
        }
      }

      this.profilingBridge.endPhase('eventEmission');

      const commandResult: CommandResult = {
        success: true,
        result,
        ...(autoCreatedInstance ? { instance: autoCreatedInstance } : {}),
        // Include constraint outcomes in successful result
        constraintOutcomes:
          [...constraintResult.outcomes, ...(createConstraintOutcomes ?? [])].length > 0
            ? [...constraintResult.outcomes, ...(createConstraintOutcomes ?? [])]
            : undefined,
        ...(workflowMeta.correlationId !== undefined
          ? { correlationId: workflowMeta.correlationId }
          : {}),
        ...(workflowMeta.causationId !== undefined
          ? { causationId: workflowMeta.causationId }
          : {}),
        emittedEvents,
      };

      // Middleware: after-emit hook
      const afterEmitResult = await this.runMiddleware(
        'after-emit',
        command,
        evalContext,
        input,
        options,
        emittedEvents,
      );
      if (afterEmitResult) return afterEmitResult;

      return commandResult;
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
      this.commandExecutionDepth -= 1;
      if (ownsEvalBudget) this.clearEvalBudget();
    }
  }

  private buildEvalContext(
    input: Record<string, unknown>,
    instance?: EntityInstance,
    entityName?: string,
  ): Record<string, unknown> {
    // Enrich instance with _entity metadata so relationship resolution works
    // when the member expression handler reads _entity from self/this
    const enrichedInstance =
      instance && entityName ? { ...instance, _entity: entityName } : instance;
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
    evalContext: Record<string, unknown>,
  ): Promise<{ allowed: boolean; denial?: PolicyDenial }> {
    // If command has explicit policies (expanded from entity defaults or declared),
    // evaluate only those policies by name
    let relevantPolicies: IRPolicy[];
    if (command.policies && command.policies.length > 0) {
      // Filter by policy names specified on the command
      const policyNames = new Set(command.policies);
      relevantPolicies = this.ir.policies.filter((p) => policyNames.has(p.name));
    } else {
      // Fallback: filter by entity match and action type (legacy behavior)
      relevantPolicies = this.ir.policies.filter((p) => {
        if (p.entity && command.entity && p.entity !== command.entity) return false;
        if (p.action !== 'all' && p.action !== 'execute') return false;
        return true;
      });
    }

    const tenantValue = this.ir.tenant ? this.resolveTenantValue() : this.context.tenantId;

    for (const policy of relevantPolicies) {
      if (policyHasRateLimit(policy) && policy.rateLimit) {
        const rl = await checkRateLimitGate(
          this.rateLimiter,
          policy.rateLimit,
          evalContext,
          tenantValue,
          this.getNow(),
          `policy:${policy.name}`,
        );
        if (!rl.allowed) {
          return {
            allowed: false,
            denial: {
              policyName: policy.name,
              expression: policy.expression,
              formatted: this.formatExpression(policy.expression),
              message: policy.message || `Rate limit exceeded for policy '${policy.name}'`,
              contextKeys: this.extractContextKeys(policy.expression),
            },
          };
        }
      }

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
    instanceData: Record<string, unknown>,
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
          if (
            node.name === 'self' ||
            node.name === 'this' ||
            node.name === 'user' ||
            node.name === 'context'
          ) {
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
          node.properties.forEach((p) => walk(p.value));
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
        return `${this.formatExpression(expr.callee)}(${expr.args.map((arg) => this.formatExpression(arg)).join(', ')})`;
      case 'conditional':
        return `${this.formatExpression(expr.condition)} ? ${this.formatExpression(expr.consequent)} : ${this.formatExpression(expr.alternate)}`;
      case 'array':
        return `[${expr.elements.map((el) => this.formatExpression(el)).join(', ')}]`;
      case 'object':
        return `{ ${expr.properties.map((p) => `${p.key}: ${this.formatExpression(p.value)}`).join(', ')} }`;
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
        return `[${value.elements.map((el) => this.formatValue(el)).join(', ')}]`;
      case 'object':
        return `{ ${Object.entries(value.properties)
          .map(([k, v]) => `${k}: ${this.formatValue(v)}`)
          .join(', ')} }`;
      default:
        return 'null';
    }
  }

  private async resolveExpressionValues(
    expr: IRExpression,
    evalContext: Record<string, unknown>,
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

  private async notifyActionTrace(
    index: number,
    kind: string,
    target: string | undefined,
    options: { entityName?: string; instanceId?: string },
  ): Promise<void> {
    const hook = this.options.actionTraceHook;
    if (!hook) return;
    await hook({
      index,
      kind,
      target,
      entityName: options.entityName,
      instanceId: options.instanceId,
    });
  }

  private async executeAction(
    action: IRAction,
    evalContext: Record<string, unknown>,
    options: { entityName?: string; instanceId?: string },
    emitCounter: { value: number },
    workflowMeta: { correlationId?: string; causationId?: string },
    subject: EventSubject | undefined,
    emittedEvents: EmittedEvent[],
    commandName: string,
  ): Promise<unknown> {
    // Effect boundary enforcement: in deterministic mode, adapter actions hard-error.
    // Sources, in precedence order: options.deterministicMode (explicit caller intent),
    // then context.deterministic (ambient context). See docs/spec/semantics.md
    // § "Runtime Context Schema".
    const deterministic = this.options.deterministicMode ?? this.context.deterministic ?? false;
    if (
      deterministic &&
      (action.kind === 'persist' || action.kind === 'publish' || action.kind === 'effect')
    ) {
      throw new ManifestEffectBoundaryError(action.kind);
    }

    const value = await this.evaluateExpression(action.expression, evalContext);
    const traceIndex = ++this.actionTraceCounter;

    switch (action.kind) {
      case 'mutate':
        if (action.target && options.instanceId && options.entityName) {
          await this.updateInstance(options.entityName, options.instanceId, {
            [action.target]: value,
          });
        }
        await this.notifyActionTrace(traceIndex, action.kind, action.target, options);
        return value;

      case 'emit': {
        // Named, in-process event: same shape as command.emits. Consumable by
        // reactions/sagas (it lands in emittedEvents, iterated by the reaction pass)
        // and by the outbound event-bus bridge (via CommandResult.emittedEvents).
        const event = this.buildActionEvent(action, value, subject, workflowMeta, emitCounter);
        emittedEvents.push(event);
        this.eventLog.push(event);
        this.notifyListeners(event);
        await this.notifyActionTrace(traceIndex, action.kind, action.target, options);
        return value;
      }

      case 'publish': {
        // External delivery: fail closed when no outbox is configured — publishing
        // to nowhere is a configuration fault, not a silent no-op. When an outbox
        // IS configured, the event is delivered in-process (reactions/bus bridge)
        // AND durably enqueued to the outbox by the command's post-success
        // enqueueOutbox pass, which threads the active transaction so the durable
        // write joins the command commit. This is what distinguishes publish from
        // emit: publish REQUIRES the durable outbox path (and is deterministic-
        // forbidden above); emit is in-process and always available.
        if (!this.options.outboxStore) {
          this.lastActionError = `MISSING_OUTBOX_STORE: publish action in command '${commandName}' requires RuntimeOptions.outboxStore, but none is configured`;
          return value;
        }
        const event = this.buildActionEvent(action, value, subject, workflowMeta, emitCounter);
        emittedEvents.push(event);
        this.eventLog.push(event);
        this.notifyListeners(event);
        await this.notifyActionTrace(traceIndex, action.kind, action.target, options);
        return value;
      }

      case 'persist':
        // Explicit flush of the pending working-copy patch. Threads the active
        // transaction under a provider (durable at command commit); immediate and
        // non-reversible without one. Clears the patch so the end-of-loop flush
        // does not re-write the same fields. See docs/spec/semantics.md § "persist action".
        await this.flushCommandBuffer();
        await this.notifyActionTrace(traceIndex, action.kind, undefined, options);
        return value;

      case 'compute':
        // Calculate WITHOUT mutation: bind the value into command scope for
        // subsequent actions and event payloads. Never touches the working copy,
        // never persists, never appears in reads.
        if (action.target) {
          evalContext[action.target] = value;
        }
        await this.notifyActionTrace(traceIndex, action.kind, action.target, options);
        return value;

      case 'effect':
      default: {
        // Host side-effect hook. Fail closed when no handler is configured.
        if (!this.options.effectHandler) {
          this.lastActionError = `MISSING_EFFECT_HANDLER: effect action in command '${commandName}' requires RuntimeOptions.effectHandler, but none is configured`;
          return value;
        }
        const result = await this.options.effectHandler({
          ...(action.target ? { name: action.target } : {}),
          value,
          commandName,
          ...(options.entityName ? { entityName: options.entityName } : {}),
          ...(options.instanceId ? { instanceId: options.instanceId } : {}),
          context: this.context,
        });
        await this.notifyActionTrace(traceIndex, action.kind, action.target, options);
        return result;
      }
    }
  }

  /**
   * Build a NAMED EmittedEvent for an `emit`/`publish` action, mirroring the
   * shape of a `command.emits` event (channel from the declared IR event,
   * provenance, correlation/causation, and a monotonic per-command emitIndex).
   * Payload is the evaluated expression value: a plain object is used directly,
   * a scalar is wrapped as `{ result: value }`, and null/undefined becomes `{}`.
   */
  private buildActionEvent(
    action: IRAction,
    value: unknown,
    subject: EventSubject | undefined,
    workflowMeta: { correlationId?: string; causationId?: string },
    emitCounter: { value: number },
  ): EmittedEvent {
    const eventName = action.target ?? 'action_event';
    const irEvent = this.ir.events.find((e) => e.name === eventName);
    const prov = this.ir.provenance;
    const payload: unknown =
      value == null
        ? {}
        : typeof value === 'object' && !Array.isArray(value)
          ? value
          : { result: value };
    return {
      name: eventName,
      channel: irEvent?.channel || eventName,
      payload,
      ...(subject ? { subject } : {}),
      timestamp: this.getNow(),
      ...(prov
        ? {
            provenance: {
              contentHash: prov.contentHash,
              compilerVersion: prov.compilerVersion,
              schemaVersion: prov.schemaVersion,
            },
          }
        : {}),
      ...(workflowMeta.correlationId !== undefined
        ? { correlationId: workflowMeta.correlationId }
        : {}),
      ...(workflowMeta.causationId !== undefined ? { causationId: workflowMeta.causationId } : {}),
      emitIndex: emitCounter.value++,
    };
  }

  /**
   * Flush the current command buffer's accumulated patch to the store, threading
   * the active transaction. Clears the patch afterward (retaining the working
   * copy) so a later end-of-loop flush or a subsequent explicit `persist` does
   * not re-write the same fields. No-op when no buffer/patch is present. Used by
   * both the `persist` action and the end-of-command-loop flush.
   */
  private async flushCommandBuffer(): Promise<void> {
    const cb = this.commandBuffer;
    if (!cb || Object.keys(cb.patch).length === 0) return;
    const cbStore = this.stores.get(cb.entityName);
    if (cbStore) await cbStore.update(cb.id, cb.patch, this.activeTx ?? undefined);
    cb.patch = {};
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
      // WASM fast path: if a WASM evaluator is configured and ready, and the
      // expression is a pure computational expression (no relationship resolution
      // needed), use the WASM module for near-native execution speed.
      // Falls back transparently to TypeScript on any error.
      if (this.options.wasmEvaluator?.isReady() && this.isWasmCompatible(expr)) {
        try {
          const result = await this.options.wasmEvaluator.evaluate(expr, context);
          return result;
        } catch {
          // Fall through to TypeScript evaluation on WASM error
        }
      }
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
            // Check if this is an entity instance that may have relationships
            // Works for direct self/this access AND chained traversal (self.order.customer)
            // because resolveRelationship enriches results with _entity metadata
            if ('id' in obj && typeof obj.id === 'string') {
              const entityName = (obj as Record<string, unknown>)._entity as string | undefined;
              if (entityName) {
                const relKey = `${entityName}.${expr.property}`;
                if (this.relationshipIndex.has(relKey)) {
                  return await this.resolveRelationship(
                    entityName,
                    obj as EntityInstance,
                    expr.property,
                  );
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
              const args = await Promise.all(
                expr.args.map((a) => this.evaluateExpression(a, context)),
              );
              return builtins[calleeExpr.name](...args);
            }
          }

          // Array method calls: arr.contains(x), arr.all(pred), arr.any(pred)
          if (calleeExpr.kind === 'member') {
            const property = calleeExpr.property;
            const arr = await this.evaluateExpression(calleeExpr.object, context);
            if (Array.isArray(arr)) {
              if (property === 'contains') {
                const needle = await this.evaluateExpression(expr.args[0], context);
                return arr.includes(needle);
              }
              if (property === 'all' || property === 'any') {
                const predicate = await this.evaluateExpression(expr.args[0], context);
                if (typeof predicate === 'function') {
                  if (property === 'all') {
                    for (const element of arr) {
                      const result = await Promise.resolve(predicate(element));
                      if (!result) return false;
                    }
                    return true;
                  }
                  for (const element of arr) {
                    const result = await Promise.resolve(predicate(element));
                    if (result) return true;
                  }
                  return false;
                }
              }
            }
          }

          // Default: evaluate callee and call as function
          const callee = await this.evaluateExpression(expr.callee, context);
          const args = await Promise.all(expr.args.map((a) => this.evaluateExpression(a, context)));
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
          return await Promise.all(expr.elements.map((e) => this.evaluateExpression(e, context)));

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

        case 'aggregate': {
          // count(Entity where field == value, ...) — count rows of `entity`
          // matching every ANDed equality predicate. Predicate values resolve in
          // the surrounding context (reaction params: the event payload). Count
          // is order-independent, so this is deterministic for a given store
          // snapshot regardless of row ordering.
          if (expr.op !== 'count') return undefined;
          // Resolve predicate values once (they do not depend on the counted row).
          const resolved = await Promise.all(
            expr.predicates.map(async (p) => ({
              field: p.field,
              value: await this.evaluateExpression(p.value, context),
            })),
          );
          const rows = await this.getAllInstancesRaw(expr.entity);
          let count = 0;
          for (const row of rows) {
            const r = row as Record<string, unknown>;
            let match = true;
            for (const pred of resolved) {
              if (r[pred.field] !== pred.value) {
                match = false;
                break;
              }
            }
            if (match) count++;
          }
          return count;
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

  /**
   * Check whether an expression can be safely evaluated by the WASM module.
   * Pure computational expressions (no entity relationships, no async effects)
   * are compatible. The check is conservative — when in doubt, return false
   * to ensure the TypeScript evaluator is used.
   */
  private isWasmCompatible(expr: IRExpression): boolean {
    // Walk the expression tree checking for features that need TypeScript runtime
    const walk = (node: IRExpression): boolean => {
      switch (node.kind) {
        case 'literal':
        case 'identifier':
          return true;
        case 'member': {
          // Member access on identifiers (e.g., self.foo) needs runtime context.
          // Only allow member access on plain property reads of simple identifiers.
          if (node.object.kind === 'identifier') {
            return walk(node.object);
          }
          return false;
        }
        case 'binary':
          return walk(node.left) && walk(node.right);
        case 'unary':
          return walk(node.operand);
        case 'call': {
          // Only allow calls to builtins (identifier callees), not function values
          if (node.callee.kind === 'identifier') {
            return node.args.every(walk);
          }
          return false;
        }
        case 'conditional':
          return walk(node.condition) && walk(node.consequent) && walk(node.alternate);
        case 'array':
          return node.elements.every(walk);
        case 'object':
          return node.properties.every((p) => walk(p.value));
        case 'lambda':
          // Lambdas are not yet supported in WASM core
          return false;
        default:
          return false;
      }
    };
    return walk(expr);
  }

  private evaluateBinaryOp(op: string, left: unknown, right: unknown): unknown {
    switch (op) {
      case '+':
        if (typeof left === 'string' || typeof right === 'string') {
          return String(left) + String(right);
        }
        return (left as number) + (right as number);
      case '-':
        return (left as number) - (right as number);
      case '*':
        return (left as number) * (right as number);
      case '/':
        return (left as number) / (right as number);
      case '%':
        return (left as number) % (right as number);
      case '==':
      case 'is':
        return left == right; // Loose equality: undefined == null is true
      case '!=':
        return left != right; // Loose inequality: undefined != null is false
      case '<':
        return (left as number) < (right as number);
      case '>':
        return (left as number) > (right as number);
      case '<=':
        return (left as number) <= (right as number);
      case '>=':
        return (left as number) >= (right as number);
      case '&&':
      case 'and':
        return Boolean(left) && Boolean(right);
      case '||':
      case 'or':
        return Boolean(left) || Boolean(right);
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
      case 'not':
        return !operand;
      case '-':
        return -(operand as number);
      default:
        return operand;
    }
  }

  private irValueToJs(value: IRValue): unknown {
    switch (value.kind) {
      case 'string':
        return value.value;
      case 'number':
        return value.value;
      case 'boolean':
        return value.value;
      case 'null':
        return null;
      case 'array':
        return value.elements.map((e) => this.irValueToJs(e));
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
      case 'string':
        return '';
      case 'number':
        return 0;
      case 'boolean':
        return false;
      case 'list':
        return [];
      case 'array':
        return [];
      case 'map':
        return {};
      default:
        return null;
    }
  }

  async evaluateComputed(
    entityName: string,
    instanceId: string,
    propertyName: string,
  ): Promise<unknown> {
    const meta = await this.evaluateComputedWithMeta(entityName, instanceId, propertyName);
    return meta?.value;
  }

  /**
   * Evaluate a computed property and return metadata including cache status and staleness.
   * Returns { value, stale, cached } or undefined if the entity/property/instance doesn't exist.
   */
  async evaluateComputedWithMeta(
    entityName: string,
    instanceId: string,
    propertyName: string,
  ): Promise<{ value: unknown; stale: boolean; cached: boolean } | undefined> {
    const entity = this.getEntity(entityName);
    if (!entity) return undefined;

    const computed = entity.computedProperties.find((c) => c.name === propertyName);
    if (!computed) return undefined;

    const instance = await this.getInstanceRaw(entityName, instanceId);
    if (!instance) return undefined;

    const cacheKey = `${entityName}:${instanceId}:${propertyName}`;

    // Check cache based on strategy
    if (computed.cache) {
      const cached = this.getCachedComputedValue(computed.cache, cacheKey);
      if (cached !== undefined) {
        return { value: cached.value, stale: cached.stale, cached: true };
      }
    }

    const ownsEvalBudget = this.initEvalBudget();
    try {
      const value = await this.evaluateComputedInternal(entity, instance, propertyName, new Set());

      // Store in cache if strategy is configured
      if (computed.cache) {
        this.setCachedComputedValue(computed.cache, cacheKey, value);
      }

      return { value, stale: false, cached: false };
    } finally {
      if (ownsEvalBudget) this.clearEvalBudget();
    }
  }

  /**
   * Look up a cached computed property value based on the configured cache strategy.
   * Returns the cache entry if valid, or undefined if cache miss or expired.
   */
  private getCachedComputedValue(
    cacheConfig: { strategy: string; ttlSeconds?: number },
    cacheKey: string,
  ): { value: unknown; stale: boolean } | undefined {
    switch (cacheConfig.strategy) {
      case 'request': {
        const entry = this.computedPropertyRequestCache.get(cacheKey);
        if (entry) return { value: entry.value, stale: entry.stale };
        return undefined;
      }
      case 'session': {
        const entry = this.computedPropertyCache.get(cacheKey);
        if (entry) return { value: entry.value, stale: entry.stale };
        return undefined;
      }
      case 'ttl': {
        const entry = this.computedPropertyCache.get(cacheKey);
        if (entry) {
          const now = this.getNow();
          const ttlMs = (cacheConfig.ttlSeconds ?? 0) * 1000;
          if (now - entry.computedAt < ttlMs) {
            return { value: entry.value, stale: entry.stale };
          }
          // TTL expired — remove stale entry
          this.computedPropertyCache.delete(cacheKey);
        }
        return undefined;
      }
      default:
        return undefined;
    }
  }

  /**
   * Store a computed property value in the appropriate cache based on strategy.
   */
  private setCachedComputedValue(
    cacheConfig: { strategy: string; ttlSeconds?: number },
    cacheKey: string,
    value: unknown,
  ): void {
    const entry = { value, computedAt: this.getNow(), stale: false };
    switch (cacheConfig.strategy) {
      case 'request':
        this.computedPropertyRequestCache.set(cacheKey, entry);
        break;
      case 'session':
      case 'ttl':
        this.computedPropertyCache.set(cacheKey, entry);
        break;
    }
  }

  private async evaluateComputedInternal(
    entity: IREntity,
    instance: EntityInstance,
    propertyName: string,
    visited: Set<string>,
  ): Promise<unknown> {
    if (visited.has(propertyName)) return undefined;
    visited.add(propertyName);

    const computed = entity.computedProperties.find((c) => c.name === propertyName);
    if (!computed) return undefined;

    const computedValues: Record<string, unknown> = {};
    if (computed.dependencies) {
      for (const dep of computed.dependencies) {
        const depComputed = entity.computedProperties.find((c) => c.name === dep);
        if (depComputed && !visited.has(dep)) {
          computedValues[dep] = await this.evaluateComputedInternal(
            entity,
            instance,
            dep,
            new Set(visited),
          );
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
    resolved?: Array<{ expression: string; value: unknown }>,
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
    evalContext: Record<string, unknown>,
  ): Promise<ConstraintOutcome> {
    const result = await this.evaluateExpression(constraint.expression, evalContext);

    // Polarity + severity: shared with WASM evaluator (semantics.md § Constraint Polarity).
    // Runtimes MUST read only failWhen — never constraint names.
    const passed = constraintExpressionPasses(result, {
      failWhen: constraint.failWhen,
      severity: constraint.severity,
    });

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
      message = this.interpolateTemplate(
        constraint.messageTemplate,
        evalContext,
        details,
        resolved.map((r) => ({ expression: r.expression, value: r.value })),
      );
    }

    return {
      code: constraint.code,
      constraintName: constraint.name,
      severity: constraint.severity || 'block',
      formatted: this.formatExpression(constraint.expression),
      message,
      details,
      passed,
      resolved: resolved.map((r) => ({ expression: r.expression, value: r.value })),
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
    commandContext?: { commandName: string; entityName?: string; instanceId?: string },
  ): Promise<{ allowed: boolean; outcomes: ConstraintOutcome[]; overrideEvents: EmittedEvent[] }> {
    const outcomes: ConstraintOutcome[] = [];
    const overrideEvents: EmittedEvent[] = [];

    for (const constraint of command.constraints || []) {
      const outcome = await this.evaluateConstraint(constraint, evalContext);

      // Check for override if constraint failed and is overrideable
      if (!outcome.passed && constraint.overrideable) {
        // First check for explicit override request
        if (overrideRequests) {
          const overrideReq = overrideRequests.find((o) => o.constraintCode === constraint.code);
          if (overrideReq) {
            const authorized = await this.validateOverrideAuthorization(
              constraint,
              overrideReq,
              evalContext,
            );
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
          const policy = this.ir.policies.find((p) => p.name === constraint.overridePolicyRef);
          if (policy && policy.action === 'override') {
            const policyResult = await this.evaluateExpression(policy.expression, evalContext);
            const authorized = Boolean(policyResult);
            if (authorized) {
              outcome.overridden = true;
              outcome.overriddenBy = 'policy:' + policy.name;
              // Emit the same OverrideApplied audit event the explicit-override
              // path emits, so an auto-policy override is not silently unaudited.
              // authorizedBy is derived from the acting user in context; the
              // reason records the authorizing policy.
              const actingUser = (evalContext.user as { id?: string } | null | undefined)?.id;
              const syntheticReq: OverrideRequest = {
                constraintCode: constraint.code,
                reason: `Auto-authorized by policy '${policy.name}'`,
                authorizedBy: actingUser ?? 'policy:' + policy.name,
                timestamp: this.getNow(),
              };
              const event = this.buildOverrideAppliedEvent(
                constraint,
                syntheticReq,
                commandContext,
              );
              overrideEvents.push(event);
              this.eventLog.push(event);
              this.notifyListeners(event);
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
    evalContext: Record<string, unknown>,
  ): Promise<boolean> {
    // If constraint has overridePolicyRef, check that policy
    if (constraint.overridePolicyRef) {
      const policy = this.ir.policies.find((p) => p.name === constraint.overridePolicyRef);
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
    commandContext?: { commandName: string; entityName?: string; instanceId?: string },
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
    actualVersion: number,
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
  private getProvenanceInfo():
    { contentHash: string; compilerVersion: string; schemaVersion: string } | undefined {
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

  /**
   * Subscribe to events for a single entity (docs/spec/semantics.md,
   * "Realtime Entities"). Convenience over onEvent: the listener receives
   * only events whose `subject.entity === entityName`. Events WITHOUT a
   * subject entity are NOT delivered — use onEvent for the unfiltered
   * firehose. Returns an unsubscribe function. Exists regardless of any
   * entity's `realtime` flag (the flag is a projection hint only).
   */
  subscribe(entityName: string, listener: EventListener): () => void {
    return this.onEvent((event) => {
      if (event.subject?.entity === entityName) {
        listener(event);
      }
    });
  }

  // ─── Event Bus (cross-instance realtime) ─────────────────────────────
  // Bridges the in-process event stream to a configured RuntimeOptions.eventBus.
  // Contract + semantics: docs/spec/adapters.md § "Event Bus" and
  // docs/spec/semantics.md § "Cross-instance delivery".

  /** Whether a cross-instance EventBus is wired into RuntimeOptions.eventBus. */
  hasEventBus(): boolean {
    return this.options.eventBus !== undefined;
  }

  /**
   * This engine's stable EventBus `originId`, derived on first bus use (never in
   * the constructor — see `_instanceId`) and memoized so every publish and the
   * self-echo filter agree on one value for the engine's lifetime.
   */
  private instanceId(): string {
    return (this._instanceId ??= this.nextRuntimeId());
  }

  /**
   * Subscribe this engine to the configured EventBus and re-dispatch REMOTE
   * events to local onEvent/subscribe listeners, so an SSE surface backed by
   * one engine observes events emitted by a command on another. Messages
   * published by this same engine (originId === this.instanceId) are skipped so
   * a local listener is never double-notified. Resolves once the subscription
   * is active; the returned function unsubscribes.
   *
   * Idempotent: calling it again while already connected returns the existing
   * unsubscribe without opening a second subscription. The constructor stays
   * synchronous — subscription is deferred to this awaited call.
   */
  async connectEventBus(): Promise<() => Promise<void>> {
    const bus = this.options.eventBus;
    if (!bus) {
      throw new Error('connectEventBus called but RuntimeOptions.eventBus is not configured');
    }
    if (this.busUnsubscribe) return this.busUnsubscribe;
    const rawUnsubscribe = await bus.subscribe((message: EventBusMessage) => {
      if (message.originId === this.instanceId()) return; // skip self-echo
      // dispatchToListeners (not notifyListeners) so remote events are delivered
      // to local listeners WITHOUT being collected into an outbound batch — a
      // remote event must never be re-published.
      for (const ev of message.events) this.dispatchToListeners(ev);
    });
    const disconnect = async (): Promise<void> => {
      if (this.busUnsubscribe === disconnect) this.busUnsubscribe = undefined;
      await rawUnsubscribe();
    };
    this.busUnsubscribe = disconnect;
    return disconnect;
  }

  /**
   * Publish one command's collected event batch to the EventBus. Post-commit
   * and best-effort: a publish failure is logged and never fails the command
   * (the events are already durable / already delivered locally). No-op without
   * a bus or with an empty batch. Mirrors the outbox non-provider fail-open
   * policy (docs/spec/adapters.md § "Event Bus — Failure Policy").
   */
  private async publishBatchToEventBus(events: EmittedEvent[]): Promise<void> {
    const bus = this.options.eventBus;
    if (!bus || events.length === 0) return;
    try {
      await bus.publish({ originId: this.instanceId(), events });
    } catch (err) {
      console.warn(
        '[Manifest Runtime] EventBus.publish failed; remote subscribers will not receive this batch:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  private notifyListeners(event: EmittedEvent): void {
    // Provider mode: hold notifications until the command's transaction commits
    // so listeners never observe an event from a command that later rolled back.
    // (Provider mode collects the outbound EventBus batch post-commit instead —
    // see _runCommandInTransaction.)
    if (this.deferredNotifications !== null) {
      this.deferredNotifications.push(event);
      return;
    }
    // Non-provider mode: the event is final on emission. Collect it into the
    // top-level command's outbound EventBus batch (published once on command
    // completion) before delivering to in-process listeners synchronously.
    if (this.busBatch !== null) this.busBatch.push(event);
    this.dispatchToListeners(event);
  }

  /** Deliver one event to every registered listener (errors swallowed). */
  private dispatchToListeners(event: EmittedEvent): void {
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

  async serialize(): Promise<{
    ir: IR;
    context: RuntimeContext;
    stores: Record<string, EntityInstance[]>;
  }> {
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
  // ─── Approval Workflow Methods ─────────────────────────────────────

  /**
   * Build an approval-request key for the Map.
   */
  private approvalKey(entity: string, instanceId: string, approvalName: string): string {
    return `${entity}:${instanceId}:${approvalName}`;
  }

  /**
   * Find approval declarations on an entity that gate a given command name.
   */
  private findApprovalsForCommand(entityName: string, commandName: string): IRApproval[] {
    const entity = this.getEntity(entityName);
    if (!entity?.approvals) return [];
    return entity.approvals.filter((a) => a.command === commandName);
  }

  /**
   * Check the approval gate for a command. Returns a CommandResult (blocked)
   * if the command requires approval that hasn't been granted yet, or
   * undefined if the command may proceed.
   */
  private async checkApprovalGate(
    commandName: string,
    entityName: string,
    instanceId: string | undefined,
    evalContext: Record<string, unknown>,
    options: { correlationId?: string; causationId?: string },
  ): Promise<CommandResult | undefined> {
    const approvals = this.findApprovalsForCommand(entityName, commandName);
    if (approvals.length === 0) return undefined;

    // Use the first matching approval (typically one-to-one command→approval)
    const approval = approvals[0];
    const resolvedInstanceId = instanceId ?? 'unknown';
    const key = this.approvalKey(entityName, resolvedInstanceId, approval.name);

    // Determine which stages are required (evaluate `when` conditions)
    const requiredStages: string[] = [];
    for (const stage of approval.stages) {
      if (stage.when) {
        const whenResult = await this.evaluateExpression(stage.when, evalContext);
        if (whenResult) requiredStages.push(stage.name);
      } else {
        requiredStages.push(stage.name);
      }
    }

    // If no stages are required (all `when` conditions false), proceed
    if (requiredStages.length === 0) return undefined;

    // Check existing approval request (durable store wins when configured)
    const existing = await this.loadApprovalState(key);
    if (existing && existing.status === 'granted') {
      // All stages were granted — consume the approval and proceed
      return undefined;
    }

    // Create or refresh a pending request
    let request = existing;
    if (!request || request.status === 'expired' || request.status === 'denied') {
      const now = this.getNow();
      request = {
        entity: entityName,
        instanceId: resolvedInstanceId,
        approvalName: approval.name,
        command: commandName,
        status: 'pending',
        requiredStages,
        grants: [],
        requestedAt: now,
        expiresAt: approval.timeout ? now + approval.timeout * 3600000 : undefined,
      };
      await this.saveApprovalState(key, request);
    }

    // Determine which stages are still pending
    const pendingStages = this.getPendingStages(request, approval);

    return {
      success: false,
      error: `Command '${commandName}' requires approval '${approval.name}'`,
      approvalRequired: {
        approvalName: approval.name,
        pendingStages,
        requestKey: key,
      },
      ...(options.correlationId !== undefined ? { correlationId: options.correlationId } : {}),
      ...(options.causationId !== undefined ? { causationId: options.causationId } : {}),
      emittedEvents: [],
    };
  }

  /**
   * Get the list of stages that still need approvals.
   */
  private getPendingStages(request: ApprovalRequestState, approval: IRApproval): string[] {
    const pending: string[] = [];
    for (const stageName of request.requiredStages) {
      const stageSpec = approval.stages.find((s) => s.name === stageName);
      if (!stageSpec) continue;
      const grantCount = request.grants.filter((g) => g.stage === stageName).length;
      if (grantCount < stageSpec.required) {
        pending.push(stageName);
      }
    }
    return pending;
  }

  /**
   * Request approval for a command on an entity instance.
   * Creates or returns the existing approval request state.
   */
  async requestApproval(
    entityName: string,
    instanceId: string,
    approvalName: string,
  ): Promise<ApprovalRequestState> {
    const key = this.approvalKey(entityName, instanceId, approvalName);
    const existing = await this.loadApprovalState(key);
    if (existing) return existing;

    const entity = this.getEntity(entityName);
    const approval = entity?.approvals?.find((a) => a.name === approvalName);
    if (!approval) {
      throw new Error(`Approval '${approvalName}' not found on entity '${entityName}'`);
    }

    // Evaluate which stages are required using a minimal context
    const instance = await this.getInstanceRaw(entityName, instanceId);
    const evalContext = this.buildEvalContext({}, instance, entityName);

    const requiredStages: string[] = [];
    for (const stage of approval.stages) {
      if (stage.when) {
        const whenResult = await this.evaluateExpression(stage.when, evalContext);
        if (whenResult) requiredStages.push(stage.name);
      } else {
        requiredStages.push(stage.name);
      }
    }

    const now = this.getNow();
    const state: ApprovalRequestState = {
      entity: entityName,
      instanceId,
      approvalName,
      command: approval.command,
      status: 'pending',
      requiredStages,
      grants: [],
      requestedAt: now,
      expiresAt: approval.timeout ? now + approval.timeout * 3600000 : undefined,
    };
    await this.saveApprovalState(key, state);
    return state;
  }

  /**
   * Grant approval for a specific stage. Evaluates the stage policy to verify
   * the approver is authorized. When all required stages are satisfied, marks
   * the approval as 'granted'.
   */
  async approveStage(
    entityName: string,
    instanceId: string,
    approvalName: string,
    stageName: string,
    approver: ApprovalApprover,
  ): Promise<ApprovalRequestState> {
    const key = this.approvalKey(entityName, instanceId, approvalName);
    const request = await this.loadApprovalState(key);
    if (!request) {
      throw new Error(`No pending approval request for key '${key}'`);
    }
    if (request.status !== 'pending') {
      throw new Error(`Approval '${approvalName}' is not pending (status: ${request.status})`);
    }

    const entity = this.getEntity(entityName);
    const approval = entity?.approvals?.find((a) => a.name === approvalName);
    if (!approval) {
      throw new Error(`Approval '${approvalName}' not found on entity '${entityName}'`);
    }

    const stageSpec = approval.stages.find((s) => s.name === stageName);
    if (!stageSpec) {
      throw new Error(`Stage '${stageName}' not found in approval '${approvalName}'`);
    }

    // Verify this stage is required
    if (!request.requiredStages.includes(stageName)) {
      throw new Error(`Stage '${stageName}' is not required for this approval request`);
    }

    // Build the approver's user context for the stage policy. A bare string
    // is the legacy form (userId doubles as role); an object carries a real
    // role/roles/permissions so RBAC policies like `user.role == "manager"`
    // evaluate against the actual role rather than the user id.
    const approverId = typeof approver === 'string' ? approver : approver.id;
    const userContext: Record<string, unknown> =
      typeof approver === 'string' ? { id: approver, role: approver } : { ...approver };

    const instance = await this.getInstanceRaw(entityName, instanceId);
    const evalContext = this.buildEvalContext({}, instance, entityName);
    Object.assign(evalContext, { user: userContext });

    const policyResult = await this.evaluateExpression(stageSpec.policy, evalContext);
    if (!policyResult) {
      throw new Error(`User '${approverId}' is not authorized to approve stage '${stageName}'`);
    }

    // Record the grant
    request.grants.push({
      stage: stageName,
      by: approverId,
      at: this.getNow(),
    });

    // Check if all required stages are now satisfied
    const pendingStages = this.getPendingStages(request, approval);
    if (pendingStages.length === 0) {
      request.status = 'granted';
    }

    await this.saveApprovalState(key, request);
    return request;
  }

  /**
   * Deny an approval request.
   */
  async denyApproval(
    entityName: string,
    instanceId: string,
    approvalName: string,
    deniedBy: string,
    reason?: string,
  ): Promise<ApprovalRequestState> {
    const key = this.approvalKey(entityName, instanceId, approvalName);
    const request = await this.loadApprovalState(key);
    if (!request) {
      throw new Error(`No pending approval request for key '${key}'`);
    }
    if (request.status !== 'pending') {
      throw new Error(`Approval '${approvalName}' is not pending (status: ${request.status})`);
    }

    request.status = 'denied';
    request.deniedBy = deniedBy;
    request.deniedReason = reason;
    await this.saveApprovalState(key, request);
    return request;
  }

  /**
   * Expire any pending approvals that have exceeded their timeout.
   * Approvals with `onTimeout: 'cancel'` are set to 'expired'.
   * Approvals with `onTimeout: 'escalate'` are flagged but kept pending (future).
   *
   * Operates on the in-process request set. In durable mode
   * (`options.approvalStore` configured), run set-based expiry across all
   * stored requests via `approvalStore.expire(now)` from a cron/worker; this
   * synchronous accessor only sees requests this engine has touched.
   */
  expireApprovals(now?: number): ApprovalRequestState[] {
    const currentTime = now ?? this.getNow();
    const expired: ApprovalRequestState[] = [];

    for (const request of this.approvalRequests.values()) {
      if (request.status !== 'pending' || !request.expiresAt) continue;
      if (currentTime >= request.expiresAt) {
        request.status = 'expired';
        expired.push(request);
      }
    }

    return expired;
  }

  /**
   * Get the current approval request state for an entity instance.
   */
  getApprovalRequest(
    entityName: string,
    instanceId: string,
    approvalName: string,
  ): ApprovalRequestState | undefined {
    return this.approvalRequests.get(this.approvalKey(entityName, instanceId, approvalName));
  }

  static async create(
    ir: IR,
    context: RuntimeContext = {},
    options: RuntimeOptions = {},
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
