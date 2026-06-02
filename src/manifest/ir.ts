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
  /** Role hierarchy with permission inheritance. Only emitted when roles are declared. */
  roles?: IRRole[];
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
  roles?: string[];
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
  /** Behavior on timeout */
  onTimeout?: 'cancel' | 'escalate';
  /** Lifecycle events emitted */
  emits: string[];
}

export interface IREntity {
  name: string;
  module?: string;
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
  /** Optional allowed state transitions for validation */
  transitions?: IRTransition[];
  /** Approval workflow declarations gating command execution */
  approvals?: IRApproval[];
}

export interface IRProperty {
  name: string;
  type: IRType;
  defaultValue?: IRValue;
  modifiers: PropertyModifier[];
}

export type PropertyModifier = 'required' | 'unique' | 'indexed' | 'private' | 'readonly' | 'optional';

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

/** Built-in store target names. */
export type BuiltinStoreTarget = 'memory' | 'localStorage' | 'postgres' | 'supabase' | 'durable' | 'mongodb';

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
  resolve: IRExpression;
  params?: IRReactionParam[];
  module?: string;
  entity?: string;
}

export interface IRReactionParam {
  name: string;
  expression: IRExpression;
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
  actions: IRAction[];
  emits: string[];
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
}

export interface IRAction {
  kind: 'mutate' | 'emit' | 'compute' | 'effect' | 'publish' | 'persist';
  target?: string;
  expression: IRExpression;
}

export interface IRPolicy {
  name: string;
  module?: string;
  entity?: string;
  action: 'read' | 'write' | 'delete' | 'execute' | 'all' | 'override';
  expression: IRExpression;
  message?: string;
}

export interface IRRolePermission {
  action: 'read' | 'write' | 'delete' | 'execute' | 'all';
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
  | { kind: 'conditional'; condition: IRExpression; consequent: IRExpression; alternate: IRExpression }
  | { kind: 'array'; elements: IRExpression[] }
  | { kind: 'object'; properties: { key: string; value: IRExpression }[] }
  | { kind: 'lambda'; params: string[]; body: IRExpression };

export interface IRDiagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
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
  enqueue(job: JobRecord): Promise<void>;
  drainPending(): Promise<JobRecord[]>;
  updateStatus(jobId: string, status: JobRecord['status'], detail?: { result?: unknown; error?: string }): Promise<void>;
}

export interface CompileToIRResult {
  ir: IR | null;
  diagnostics: IRDiagnostic[];
}
