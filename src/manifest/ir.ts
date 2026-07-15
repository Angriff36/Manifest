import type { PropertyModifier } from './property-modifiers.js';

export type { PropertyModifier } from './property-modifiers.js';
export { PROPERTY_MODIFIERS } from './property-modifiers.js';

export interface IRTenant {
  /** Property name injected into tenant-scoped entities (e.g. "tenantId") */
  property: string;
  /** Type of the tenant discriminator */
  type: IRType;
  /** Context path to extract tenant value at runtime (e.g. "context.tenantId") */
  contextPath: string;
}

export interface IRProvenanceSource {
  /** Relative path from project root */
  path: string;
  /** Content hash of the source file (SHA-256) */
  contentHash: string;
}

export interface IRProvenance {
  /** Content hash of the source manifest (SHA-256). For merged IR: hash of sorted source hashes. */
  contentHash: string;
  /** Hash of the IR itself for runtime integrity verification (SHA-256) */
  irHash?: string;
  /** Compiler version that generated this IR */
  compilerVersion: string;
  /** IR schema version */
  schemaVersion: string;
  /** ISO timestamp of compilation */
  compiledAt: string;
  /** Source files contributing to this IR. Present only for multi-file compilation. */
  sources?: IRProvenanceSource[];
}

export interface IR {
  version: '1.0';
  /** Provenance metadata for traceability */
  provenance: IRProvenance;
  /** Multi-tenancy isolation configuration. When present, persistent entities are tenant-scoped. */
  tenant?: IRTenant;
  modules: IRModule[];
  /** Reusable composite value types (embedded, no separate table). Immutable by design. */
  values: IRValueObject[];
  entities: IREntity[];
  enums: IREnum[];
  stores: IRStore[];
  events: IREvent[];
  commands: IRCommand[];
  policies: IRPolicy[];
  /** Declarative event-reaction rules. Empty array when no reactions declared. */
  reactions?: IRReactionRule[];
  /** Saga orchestration definitions sequencing commands with compensation. */
  sagas?: IRSaga[];
  /** Role hierarchy with permission inheritance. Only emitted when roles are declared. */
  roles?: IRRole[];
  /** Scheduled command declarations with triggers and parameter bindings. */
  schedules?: IRSchedule[];
  /** Webhook declarations mapping inbound HTTP payloads to command invocations. */
  webhooks?: IRWebhook[];
}

export interface IRValueObject {
  name: string;
  /** Value object properties (immutable, embedded inline in entity properties) */
  properties: IRProperty[];
}

export interface IRModule {
  name: string;
  entities: string[];
  enums: string[];
  commands: string[];
  stores: string[];
  events: string[];
  policies: string[];
  reactions?: string[];
  sagas?: string[];
  roles?: string[];
  schedules?: string[];
  webhooks?: string[];
}

export interface IREnum {
  name: string;
  module?: string;
  values: IREnumValue[];
}

export interface IREnumValue {
  name: string;
  /** Display label for UI */
  label?: string;
  /** Optional ordinal value for sorting/database mapping */
  ordinal?: number;
}

export interface IRTransition {
  /** Property name that holds state */
  property: string;
  /** Value the property transitions FROM */
  from: string;
  /** Allowed values the property can transition TO */
  to: string[];
}

export interface IRApprovalStage {
  name: string;
  /** Compiled boolean expression authorizing an approver */
  policy: IRExpression;
  /** Required approvals to satisfy this stage */
  required: number;
  /** Optional condition gating whether the stage applies */
  when?: IRExpression;
}

export interface IRApproval {
  name: string;
  /** Command name this approval gates */
  command: string;
  stages: IRApprovalStage[];
  /** Timeout in hours (optional) */
  timeout?: number;
  /** Behavior on timeout. Only 'cancel' is supported; 'escalate' is rejected at compile time. */
  onTimeout?: 'cancel';
  /** Lifecycle events emitted */
  emits: string[];
}

export interface IREntity {
  name: string;
  module?: string;
  /** Parent entity name for inheritance (from `extends` keyword) */
  parent?: string;
  /** Mixin entity names for composition (from `mixin` keyword) */
  mixins?: string[];
  properties: IRProperty[];
  computedProperties: IRComputedProperty[];
  relationships: IRRelationship[];
  commands: string[];
  constraints: IRConstraint[];
  policies: string[];
  /** Policy names inherited by all commands unless overridden (vNext) */
  defaultPolicies?: string[];
  /** Composite primary key column names, e.g. ["tenantId", "id"] */
  key?: string[];
  /** Alternate unique constraints for non-PK FK reference targets, e.g. [["tenantId", "externalId"]] */
  alternateKeys?: string[][];
  /** Name of version field for optimistic concurrency control */
  versionProperty?: string;
  /** Name of timestamp field for version tracking */
  versionAtProperty?: string;
  /** When true, createdAt/updatedAt are auto-injected and populated at runtime */
  timestamps?: boolean;
  /** Projection hint: generate SSE subscription surfaces for this entity. No runtime execution semantics. */
  realtime?: boolean;
  /** When true, the entity is owned by another system/file (from `external entity`).
   * Persistence projections (Prisma, Drizzle, Kysely, Convex, prisma-store) skip it. */
  external?: boolean;
  /** Optional allowed state transitions for validation */
  transitions?: IRTransition[];
  /** Approval workflow declarations gating command execution */
  approvals?: IRApproval[];
}

export interface IRProperty {
  name: string;
  type: IRType;
  defaultValue?: IRValue;
  /**
   * Set when the property default is a current-time call (`= now()` / `= today()`).
   * The runtime stamps it with the current time on create; projections emit a
   * store-level default (e.g. Prisma `@default(now())`). Dynamic defaults cannot
   * be a static `defaultValue`, so they are lowered to this flag instead.
   */
  autoNow?: boolean;
  modifiers: PropertyModifier[];
  /**
   * Read-time masking strategy. Invariant: present ⇔ 'masked' ∈ modifiers.
   * Bare `masked` compiles to { type: 'redact' }.
   */
  maskStrategy?: IRMaskStrategy;
}

export type MaskStrategyType = 'redact' | 'partial' | 'email' | 'phone' | 'last4';

export interface IRMaskStrategy {
  type: MaskStrategyType;
  /** Strategy parameters; for `partial`: [keepStart, keepEnd] */
  params?: number[];
  /** When truthy at read time, the real value is returned; falsy/error ⇒ masked */
  unmaskWhen?: IRExpression;
}

export interface IRComputedPropertyCache {
  strategy: 'request' | 'session' | 'ttl';
  ttlSeconds?: number;
}

export interface IRComputedProperty {
  name: string;
  type: IRType;
  expression: IRExpression;
  dependencies: string[];
  cache?: IRComputedPropertyCache;
}

export type RefAction = 'cascade' | 'restrict' | 'setNull' | 'setDefault' | 'noAction';

export interface IRForeignKey {
  /** Local FK column names */
  fields: string[];
  /** Remote/referenced column names. Absent → projection defaults to ["id"] */
  references?: string[];
}

export interface IRRelationship {
  name: string;
  kind: 'hasMany' | 'hasOne' | 'belongsTo' | 'ref';
  target: string;
  /** Structured FK. Mutually exclusive with `through`. */
  foreignKey?: IRForeignKey;
  /** Join-table entity name for many-to-many. Mutually exclusive with `foreignKey`. */
  through?: string;
  onDelete?: RefAction;
  onUpdate?: RefAction;
}

export interface IRConstraint {
  name: string;
  /** Stable identifier for overrides/auditing (defaults to name) */
  code: string;
  expression: IRExpression;
  /** Constraint severity level (default: block) */
  severity?: 'ok' | 'warn' | 'block';
  /**
   * Expression polarity. When true, a truthy expression marks a VIOLATION
   * (passed = !expr). When false/absent, a falsy expression marks a violation
   * (passed = !!expr) — the default "required condition" polarity.
   */
  failWhen?: boolean;
  message?: string;
  /** Template for error messages with interpolation */
  messageTemplate?: string;
  /** Structured details for UI (key-value pairs with expression values) */
  detailsMapping?: Record<string, IRExpression>;
  /** Can this constraint be overridden? */
  overrideable?: boolean;
  /** Policy that authorizes overrides */
  overridePolicyRef?: string;
}

/** Retry configuration for resilient command execution */
export interface IRRetry {
  /** Maximum number of retry attempts (>= 1) */
  maxAttempts: number;
  /** Backoff strategy */
  backoff: 'fixed' | 'linear' | 'exponential';
  /** Base delay in milliseconds */
  delayMs: number;
  /** Whether to apply jitter to retry delays */
  jitter?: boolean;
  /** Error codes that trigger a retry (deduped, >= 1 when present) */
  retryOn?: string[];
}

/** Rate limit configuration for controlling command/policy execution */
export interface IRRateLimit {
  /** Maximum number of requests per window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Scope: 'user' | 'tenant' | 'global' */
  scope: 'user' | 'tenant' | 'global';
  /** Burst allowance: additive requests above maxRequests */
  burstAllowance?: number;
}

/** Individual parameter within a scheduled command invocation */
export interface IRScheduleParam {
  name: string;
  expression: IRExpression;
}

/** Trigger configuration for scheduled commands (cron or interval-based) */
export interface IRTrigger {
  kind: 'cron' | 'interval' | 'every';
  /** Cron expression (if kind === 'cron'), e.g. "0 9 * * MON" */
  cron?: string;
  /** Duration in milliseconds for interval-based triggers */
  durationMs?: number;
}

/** Scheduled command declaration with trigger and parameter binding */
export interface IRSchedule {
  name: string;
  module?: string;
  /** Entity on which the command is invoked (absent for global commands) */
  entityName?: string;
  /** Command name to invoke */
  commandName: string;
  /** Trigger configuration (cron, interval, or every) */
  trigger: IRTrigger;
  /** Parameters bound to the scheduled command */
  params?: IRScheduleParam[];
}

/** Built-in store target names. */
export type BuiltinStoreTarget =
  'memory' | 'localStorage' | 'postgres' | 'supabase' | 'durable' | 'mongodb';

export interface IRStore {
  entity: string;
  /** Built-in targets or custom adapter scheme registered via plugin API. */
  target: BuiltinStoreTarget | (string & {});
  config: Record<string, IRValue>;
}

export interface IREvent {
  name: string;
  channel: string;
  payload: IRType | IREventField[];
}

export interface IREventField {
  name: string;
  type: IRType;
  required: boolean;
}

export interface IRReactionRule {
  event: string;
  targetEntity: string;
  targetCommand: string;
  /** Single-target resolution (absent for `fanOut` reactions). */
  resolve?: IRExpression;
  params?: IRReactionParam[];
  /**
   * Fan-out match: dispatch `targetCommand` on every `targetEntity` row where
   * `row.<matchField> == matchSource` (evaluated against the event payload).
   * When present, `resolve` is unused — the collection match replaces it.
   */
  fanOut?: { matchField: string; matchSource: IRExpression };
  module?: string;
  entity?: string;
}

export interface IRReactionParam {
  name: string;
  expression: IRExpression;
}

export interface IRSagaStep {
  /** Step identifier (unique within saga) */
  name: string;
  /** Entity on which the forward command is invoked */
  commandEntity: string;
  /** Forward command name */
  command: string;
  /** Compensating entity (present only when compensate is declared) */
  compensateEntity?: string;
  /** Compensating command name (absent = no compensation for this step) */
  compensate?: string;
}

export interface IRSaga {
  name: string;
  module?: string;
  steps: IRSagaStep[];
  /** Failure strategy. Always present (compiler normalizes default 'compensate'). */
  onFailure: 'compensate' | 'abort';
  /** Lifecycle events emitted by the saga orchestrator */
  emits: string[];
}

export type IRSignatureAlgorithm = 'hmac-sha256' | 'hmac-sha512';

export interface IRWebhookSignature {
  algorithm: IRSignatureAlgorithm;
  /** HTTP header containing the signature (e.g. "X-Hub-Signature-256") */
  header: string;
  /** Context path to extract the shared secret at runtime (e.g. "context.webhookSecret") */
  secret: string;
}

export interface IRWebhookParam {
  name: string;
  /** Expression evaluated against the request body to produce the parameter value */
  expression: IRExpression;
}

export interface IRWebhook {
  name: string;
  module?: string;
  /** HTTP path pattern (e.g. "/webhooks/stripe") */
  path: string;
  /** HTTP method (e.g. "POST", "PUT"). Defaults to "POST" at runtime. */
  method?: string;
  /** Name of the command to invoke when the webhook fires */
  command: string;
  /** Optional entity context for entity-scoped commands */
  entity?: string;
  /** HMAC signature verification configuration */
  signature?: IRWebhookSignature;
  /** HTTP header name from which to extract the idempotency key */
  idempotencyHeader?: string;
  /** Payload transformation: maps command parameter names to payload expressions */
  transform?: IRWebhookParam[];
}

export interface IRCommand {
  name: string;
  module?: string;
  entity?: string;
  parameters: IRParameter[];
  guards: IRExpression[];
  /** Command-level constraints (pre-execution validation) */
  constraints?: IRConstraint[];
  /** Policy names for authorization (explicit or inherited from entity defaults) */
  policies?: string[];
  /** Retry policy for resilient execution */
  retry?: IRRetry;
  /** Rate limit policy for this command */
  rateLimit?: IRRateLimit;
  actions: IRAction[];
  emits: string[];
  /** Explicit event payload field expressions (from `emit Event { field: expr }`). */
  emitPayloads?: IREmitPayload[];
  returns?: IRType;
  /** When true, defers action execution to a background worker queue */
  async?: boolean;
  /** Auto-derived completion event name (set when async=true) */
  completionEvent?: string;
  /** Auto-derived failure event name (set when async=true) */
  failureEvent?: string;
}

export interface IRParameter {
  name: string;
  type: IRType;
  required: boolean;
  defaultValue?: IRValue;
  /**
   * Trusted (server-owned) input source. When present, the parameter MUST be
   * injected from authoritative runtime context (never from the browser body).
   * Value is a dotted path rooted at `context` (e.g. `context.actorId`).
   * Absent when the parameter is client-owned.
   */
  trustedSource?: string;
}

export interface IREmitPayload {
  /** Target event name (matches an entry in the command's `emits`). */
  eventName: string;
  fields: IREmitPayloadField[];
}

export interface IREmitPayloadField {
  name: string;
  expression: IRExpression;
}

export interface IRAction {
  kind: 'mutate' | 'emit' | 'compute' | 'effect' | 'publish' | 'persist';
  /**
   * Kind-dependent target:
   * - `mutate`: the entity property to assign the evaluated value to.
   * - `compute`: the local binding name introduced into command scope (no write).
   * - `emit`/`publish`: the NAMED IR event to deliver (must match a declared event).
   * - `effect`: optional name passed to the host effect handler.
   * - `persist`: unused.
   */
  target?: string;
  expression: IRExpression;
}

export interface IRPolicy {
  name: string;
  module?: string;
  entity?: string;
  action: 'read' | 'write' | 'delete' | 'execute' | 'all' | 'override';
  expression: IRExpression;
  /** Rate limit policy for this policy */
  rateLimit?: IRRateLimit;
  message?: string;
}

/**
 * IR role permission action. `all` is the wildcard and `read`/`write`/`delete`/
 * `execute` are the conventional actions with built-in semantics (command-
 * execution RBAC checks `execute`/`all`). Any other identifier is a custom,
 * capability-style permission token, opaque to the engine and matched exactly.
 */
export type IRRolePermissionAction =
  'read' | 'write' | 'delete' | 'execute' | 'all' | (string & {});

export interface IRRolePermission {
  action: IRRolePermissionAction;
  target?: string;
}

export interface IRRole {
  name: string;
  module?: string;
  parent?: string;
  allow: IRRolePermission[];
  deny: IRRolePermission[];
  /** Compiler-computed flattened permission set after inheritance + deny resolution.
   *  Deterministic, sorted. Runtime uses this for O(1) checks. */
  effectivePermissions: IRRolePermission[];
}

export interface IRType {
  name: string;
  generic?: IRType;
  nullable: boolean;
  params?: { precision?: number; scale?: number };
}

export type IRValue =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'null' }
  | { kind: 'array'; elements: IRValue[] }
  | { kind: 'object'; properties: Record<string, IRValue> };

export type IRExpression =
  | { kind: 'literal'; value: IRValue }
  | { kind: 'identifier'; name: string }
  | { kind: 'member'; object: IRExpression; property: string }
  | { kind: 'binary'; operator: string; left: IRExpression; right: IRExpression }
  | { kind: 'unary'; operator: string; operand: IRExpression }
  | { kind: 'call'; callee: IRExpression; args: IRExpression[] }
  | {
      kind: 'conditional';
      condition: IRExpression;
      consequent: IRExpression;
      alternate: IRExpression;
    }
  | { kind: 'array'; elements: IRExpression[] }
  | { kind: 'object'; properties: { key: string; value: IRExpression }[] }
  | { kind: 'lambda'; params: string[]; body: IRExpression }
  | {
      kind: 'aggregate';
      op: 'count';
      entity: string;
      predicates: { field: string; value: IRExpression }[];
    };

export interface IRDiagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  /** Machine-readable code for programmatic handling (optional; message remains canonical). */
  code?: string;
  line?: number;
  column?: number;
}

/**
 * Constraint evaluation outcome with severity and override info
 */
export interface ConstraintOutcome {
  /** Stable constraint identifier */
  code: string;
  /** Constraint name for reference */
  constraintName: string;
  /** Severity level of the constraint */
  severity: 'ok' | 'warn' | 'block';
  /** Formatted expression string */
  formatted: string;
  /** Optional message from constraint */
  message?: string;
  /** Structured details for UI (resolved values) */
  details?: Record<string, unknown>;
  /** Whether the constraint passed */
  passed: boolean;
  /** Whether the constraint was overridden */
  overridden?: boolean;
  /** User who authorized the override */
  overriddenBy?: string;
  /** Resolved expression values for debugging */
  resolved?: Array<{ expression: string; value: unknown }>;
}

/**
 * Override request payload for command execution
 */
export interface OverrideRequest {
  /** Constraint code to override */
  constraintCode: string;
  /** Reason for the override */
  reason: string;
  /** User authorizing the override */
  authorizedBy: string;
  /** Timestamp of override request */
  timestamp: number;
}

/**
 * Concurrency conflict details for optimistic locking
 */
export interface ConcurrencyConflict {
  /** Type of entity that conflicted */
  entityType: string;
  /** ID of the entity instance */
  entityId: string;
  /** Expected version number */
  expectedVersion: number;
  /** Actual version in storage */
  actualVersion: number;
  /** Conflict code for categorization */
  conflictCode: string;
}

/**
 * Record representing a deferred async command execution.
 * The runtime enqueues jobs when an `async` command is invoked and
 * drains them via `drainJobs()` for deterministic testing or a
 * background worker for production use.
 */
export interface JobRecord {
  jobId: string;
  commandName: string;
  entityName?: string;
  instanceId?: string;
  input: Record<string, unknown>;
  correlationId?: string;
  causationId?: string;
  enqueuedAt: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

/**
 * Adapter interface for async command job persistence.
 * Implementations must be deterministic in test contexts
 * (use runtime-provided generateId and now functions).
 */
export interface JobQueue {
  /**
   * Enqueue a job. The optional `tx` is an opaque transaction handle
   * (`TransactionHandle` in runtime-engine.ts): when the runtime is driving a
   * `TransactionProvider` it threads the active handle so the enqueue joins the
   * command's transaction; adapters that do not share the provider's database
   * ignore it.
   */
  enqueue(job: JobRecord, tx?: unknown): Promise<void>;
  drainPending(): Promise<JobRecord[]>;
  updateStatus(
    jobId: string,
    status: JobRecord['status'],
    detail?: { result?: unknown; error?: string },
  ): Promise<void>;
}

export interface CompileToIRResult {
  ir: IR | null;
  diagnostics: IRDiagnostic[];
}
