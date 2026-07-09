export interface Position {
  line: number;
  column: number;
}

export interface Token {
  type: 'KEYWORD' | 'IDENTIFIER' | 'STRING' | 'NUMBER' | 'OPERATOR' | 'PUNCTUATION' | 'NEWLINE' | 'EOF';
  value: string;
  position: Position;
}

export interface ASTNode {
  type: string;
  position?: Position;
}

export interface ModuleNode extends ASTNode {
  type: 'Module';
  name: string;
  entities: EntityNode[];
  enums: EnumNode[];
  commands: CommandNode[];
  policies: PolicyNode[];
  stores: StoreNode[];
  events: OutboxEventNode[];
  reactions: ReactionNode[];
  sagas: SagaNode[];
  roles: RoleNode[];
  webhooks: WebhookNode[];
  schedules?: ScheduleNode[];
}

export interface TransitionNode extends ASTNode {
  type: 'Transition';
  property: string;
  from: string;
  to: string[];
}

export interface ApprovalStageNode extends ASTNode {
  type: 'ApprovalStage';
  name: string;
  /** Boolean expression authorizing an approver for this stage */
  policy: ExpressionNode;
  /** Number of approvals required to satisfy this stage (default 1) */
  required: number;
  /** Optional condition gating whether this stage applies */
  when?: ExpressionNode;
}

export interface ApprovalNode extends ASTNode {
  type: 'Approval';
  name: string;
  /** Name of the command this approval gates */
  command: string;
  stages: ApprovalStageNode[];
  /** Timeout in hours for pending approval (optional) */
  timeout?: number;
  /** Action on timeout: "cancel" | "escalate" */
  onTimeout?: 'cancel' | 'escalate';
  /** Events to emit across the approval lifecycle */
  emits: string[];
}

export interface EnumValueNode extends ASTNode {
  type: 'EnumValue';
  name: string;
  /** Optional display label for UI */
  label?: string;
  /** Optional ordinal value for sorting/database mapping */
  ordinal?: number;
}

export interface EnumNode extends ASTNode {
  type: 'Enum';
  name: string;
  values: EnumValueNode[];
}

export interface EntityNode extends ASTNode {
  type: 'Entity';
  name: string;
  /** When true, the entity is a reference to one owned by another system/file
   * (from the `external entity` modifier). Persistence projections skip it. */
  external?: boolean;
  /** Parent entity name for inheritance (from `extends` keyword) */
  parent?: string;
  /** Mixin entity names for composition (from `mixin A, B` keywords) */
  mixins?: string[];
  /** Policy names to be merged into this entity's policies (from `policies { ... }` block) */
  policyRefs?: string[];
  /** Command names inherited from parent/mixins (set by composition expander) */
  inheritedCommandNames?: string[];
  properties: PropertyNode[];
  computedProperties: ComputedPropertyNode[];
  relationships: RelationshipNode[];
  behaviors: BehaviorNode[];
  commands: CommandNode[];
  constraints: ConstraintNode[];
  policies: PolicyNode[];
  transitions: TransitionNode[];
  approvals: ApprovalNode[];
  reactions: ReactionNode[];
  store?: string;
  /** Composite primary key column names, e.g. ["tenantId", "id"] */
  key?: string[];
  /** Alternate unique constraints for non-PK FK references targets */
  alternateKeys?: string[][];
  /** Optimistic concurrency: property name for version number */
  versionProperty?: string;
  /** Optimistic concurrency: property name for version timestamp */
  versionAtProperty?: string;
  /** Auto-inject createdAt/updatedAt properties and runtime population */
  timestamps?: boolean;
  /** Projection hint: generate SSE subscription surfaces for this entity (no runtime execution semantics) */
  realtime?: boolean;
}

export interface PropertyNode extends ASTNode {
  type: 'Property';
  name: string;
  dataType: TypeNode;
  defaultValue?: ExpressionNode;
  modifiers: string[];
  /** Masking strategy from `masked(strategy, ...params)`; absent for bare `masked` (defaults to redact at IR level) */
  maskStrategy?: PropertyMaskStrategyNode;
  /** Expression from the `unmask when <expr>` clause */
  unmaskWhen?: ExpressionNode;
}

export interface PropertyMaskStrategyNode {
  /** Strategy name as written in source; validated by the IR compiler */
  type: string;
  params?: number[];
}

export interface ComputedPropertyCache {
  strategy: 'request' | 'session' | 'ttl';
  ttlSeconds?: number;
}

export interface ComputedPropertyNode extends ASTNode {
  type: 'ComputedProperty';
  name: string;
  dataType: TypeNode;
  expression: ExpressionNode;
  dependencies: string[];
  cache?: ComputedPropertyCache;
}

export type RefAction = 'cascade' | 'restrict' | 'setNull' | 'setDefault' | 'noAction';

export interface RelationshipNode extends ASTNode {
  type: 'Relationship';
  kind: 'hasMany' | 'hasOne' | 'belongsTo' | 'ref';
  name: string;
  target: string;
  /** Local FK column names. Single-element for `with <col>` shorthand; multi-element for composite FK. */
  fields?: string[];
  /** Remote/referenced column names. Absent means projection defaults to ["id"]. */
  references?: string[];
  through?: string;
  onDelete?: RefAction;
  onUpdate?: RefAction;
}

export interface CommandNode extends ASTNode {
  type: 'Command';
  name: string;
  parameters: ParameterNode[];
  guards?: ExpressionNode[];
  /** Command-level constraints (pre-execution validation) */
  constraints?: ConstraintNode[];
  /** Retry policy for this command */
  retry?: RetryPolicyNode;
  /** Rate limit policy for this command */
  rateLimit?: RateLimitNode;
  actions: ActionNode[];
  emits?: string[];
  /** Explicit event payload field expressions: `emit Event { field: expr }`. */
  emitPayloads?: { eventName: string; payload: ObjectNode }[];
  returns?: TypeNode;
  /** When true, defers action execution to a background worker queue */
  async?: boolean;
}

export interface ParameterNode extends ASTNode {
  type: 'Parameter';
  name: string;
  dataType: TypeNode;
  required: boolean;
  defaultValue?: ExpressionNode;
  /**
   * When set, the parameter is server-owned: the client MUST NOT supply it.
   * Value is a dotted context path (e.g. `context.actorId`) resolved from
   * RuntimeContext by the runtime / generated server binding.
   */
  trustedSource?: string;
}

export interface PolicyNode extends ASTNode {
  type: 'Policy';
  name: string;
  action: 'read' | 'write' | 'delete' | 'execute' | 'all' | 'override';
  expression: ExpressionNode;
  /** Rate limit policy for this policy */
  rateLimit?: RateLimitNode;
  message?: string;
  isDefault?: boolean; // True if this is an entity-level default policy (vNext)
}

export interface StoreNode extends ASTNode {
  type: 'Store';
  entity: string;
  /** Built-in targets: 'memory' | 'localStorage' | 'postgres' | 'supabase' | 'durable'.
   *  Custom adapter schemes (e.g. 'redis', 'dynamodb') are also valid when a
   *  matching StoreAdapterPlugin is registered via the plugin API. */
  target: string;
  config?: Record<string, ExpressionNode>;
}

export interface OutboxEventNode extends ASTNode {
  type: 'OutboxEvent';
  name: string;
  channel: string;
  payload: TypeNode | { fields: ParameterNode[] };
}

export interface TypeNode extends ASTNode {
  type: 'Type';
  name: string;
  generic?: TypeNode;
  nullable: boolean;
  params?: TypeParams;
}

export interface TypeParams {
  precision?: number;
  scale?: number;
}

export interface BehaviorNode extends ASTNode {
  type: 'Behavior';
  name: string;
  trigger: TriggerNode;
  actions: ActionNode[];
  guards?: ExpressionNode[];
}

export interface TriggerNode extends ASTNode {
  type: 'Trigger';
  event: string;
  parameters?: string[];
}

export interface ReactionParamMapping {
  name: string;
  expression: ExpressionNode;
}

export interface ReactionNode extends ASTNode {
  type: 'Reaction';
  event: string;
  targetEntity: string;
  targetCommand: string;
  /** Single-target resolution (absent for `fanOut` reactions). */
  resolve?: ExpressionNode;
  params?: ReactionParamMapping[];
  /**
   * Fan-out: dispatch `targetCommand` on EVERY `targetEntity` row where
   * `row.<matchField> == matchSource` (evaluated against the event payload),
   * instead of one resolved target. The collection match replaces `resolve`.
   */
  fanOut?: { matchField: string; matchSource: ExpressionNode };
}

export interface SagaStepNode extends ASTNode {
  type: 'SagaStep';
  name: string;
  /** Target entity for the forward command */
  commandEntity: string;
  /** Forward command name */
  command: string;
  /** Optional compensating entity */
  compensateEntity?: string;
  /** Optional compensating command name */
  compensate?: string;
}

export interface SagaNode extends ASTNode {
  type: 'Saga';
  name: string;
  steps: SagaStepNode[];
  /** Failure strategy; defaults to 'compensate' */
  onFailure: 'compensate' | 'abort';
  /** Lifecycle events to emit */
  emits: string[];
}

export interface ActionNode extends ASTNode {
  type: 'Action';
  kind: 'mutate' | 'emit' | 'compute' | 'effect' | 'publish' | 'persist';
  target?: string;
  expression: ExpressionNode;
}

export interface ValueObjectNode extends ASTNode {
  type: 'ValueObject';
  name: string;
  properties: PropertyNode[];
}

export interface TenantNode extends ASTNode {
  type: 'Tenant';
  /** Property name injected into tenant-scoped entities (e.g. "tenantId") */
  property: string;
  /** Type of the tenant discriminator */
  dataType: TypeNode;
  /** Context path to extract tenant value from (e.g. "context.tenantId") */
  contextPath: string;
}

/**
 * A role permission action. `all` is the wildcard and `read`/`write`/`delete`/
 * `execute` are the conventional actions with built-in semantics; any other
 * identifier is a custom, capability-style permission token (e.g. `salesAccess`)
 * matched exactly by the engine. The string union preserves autocomplete for the
 * well-known values while permitting custom tokens.
 */
export type RolePermissionAction =
  | 'read' | 'write' | 'delete' | 'execute' | 'all'
  | (string & {});

export interface RolePermissionNode {
  kind: 'allow' | 'deny';
  action: RolePermissionAction;
  target?: string;
}

export interface RoleNode extends ASTNode {
  type: 'Role';
  name: string;
  parent?: string;
  permissions: RolePermissionNode[];
}

export interface ConstraintNode extends ASTNode {
  type: 'Constraint';
  name: string;
  /** Stable identifier for overrides/auditing (defaults to name) */
  code?: string;
  expression: ExpressionNode;
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
  /** Structured details for UI (key-value pairs with expressions) */
  detailsMapping?: Record<string, ExpressionNode>;
  /** Can this constraint be overridden? */
  overrideable?: boolean;
  /** Policy that authorizes overrides */
  overridePolicyRef?: string;
}

export interface FlowNode extends ASTNode {
  type: 'Flow';
  name: string;
  input: TypeNode;
  output: TypeNode;
  steps: FlowStepNode[];
}

export interface FlowStepNode extends ASTNode {
  type: 'FlowStep';
  operation: string;
  expression: ExpressionNode;
  condition?: ExpressionNode;
}

export interface EffectNode extends ASTNode {
  type: 'Effect';
  name: string;
  kind: 'http' | 'storage' | 'timer' | 'event' | 'custom';
  config: Record<string, ExpressionNode>;
}

export interface ExposeNode extends ASTNode {
  type: 'Expose';
  name: string;
  protocol: 'rest' | 'graphql' | 'websocket' | 'function';
  entity: string;
  operations: string[];
  generateServer: boolean;
  middleware?: string[];
}

export interface CompositionNode extends ASTNode {
  type: 'Composition';
  name: string;
  components: ComponentRefNode[];
  connections: ConnectionNode[];
}

export interface ComponentRefNode extends ASTNode {
  type: 'ComponentRef';
  entity: string;
  alias?: string;
  config?: Record<string, ExpressionNode>;
}

export interface ConnectionNode extends ASTNode {
  type: 'Connection';
  from: { component: string; output: string };
  to: { component: string; input: string };
  transform?: ExpressionNode;
}

export type ExpressionNode =
  | LiteralNode
  | IdentifierNode
  | BinaryOpNode
  | UnaryOpNode
  | CallNode
  | MemberAccessNode
  | ConditionalNode
  | ArrayNode
  | ObjectNode
  | LambdaNode
  | AggregateCountNode;

export interface LiteralNode extends ASTNode {
  type: 'Literal';
  value: string | number | boolean | null;
  dataType: 'string' | 'number' | 'boolean' | 'null';
}

export interface IdentifierNode extends ASTNode {
  type: 'Identifier';
  name: string;
}

export interface BinaryOpNode extends ASTNode {
  type: 'BinaryOp';
  operator: string;
  left: ExpressionNode;
  right: ExpressionNode;
}

export interface UnaryOpNode extends ASTNode {
  type: 'UnaryOp';
  operator: string;
  operand: ExpressionNode;
}

export interface CallNode extends ASTNode {
  type: 'Call';
  callee: ExpressionNode;
  arguments: ExpressionNode[];
}

export interface MemberAccessNode extends ASTNode {
  type: 'MemberAccess';
  object: ExpressionNode;
  property: string;
}

export interface RetryPolicyNode extends ASTNode {
  type: 'RetryPolicy';
  /** Maximum number of retry attempts (default 3) */
  maxAttempts?: number;
  /** Backoff strategy: 'fixed' | 'linear' | 'exponential' (default 'fixed') */
  backoff?: 'fixed' | 'linear' | 'exponential';
  /** Initial delay in milliseconds (default 0) */
  delay?: number;
  /** Alternative field name for delay */
  delayMs?: number;
  /** Whether to apply jitter to backoff delays */
  jitter?: boolean | number;
  /** Error conditions to retry on (repeated field, e.g. ["CONCURRENCY_CONFLICT", "TIMEOUT"]) */
  retryOn?: string[];
}

export interface RateLimitNode extends ASTNode {
  type: 'RateLimit';
  /** Maximum number of requests per window */
  maxRequests?: number;
  /** Time window in milliseconds (default 60000) */
  windowMs?: number;
  /** Scope: 'user' | 'tenant' | 'global' (default 'global') */
  scope?: 'user' | 'tenant' | 'global';
  /** Burst allowance: number of requests allowed above maxRequests in short bursts (default 0) */
  burstAllowance?: number;
}

export interface ScheduleNode extends ASTNode {
  type: 'Schedule';
  name: string;
  /** Schedule type: 'cron' | 'interval' | 'every' */
  scheduleType: 'cron' | 'interval' | 'every';
  /** Cron expression (if scheduleType === 'cron') */
  cronExpression?: string;
  /** Interval or every value (numeric value for interval/every) */
  value?: number;
  /** Quoted duration for interval triggers, e.g. "5m" */
  intervalDuration?: string;
  /** Unit for interval/every: 'ms' | 's' | 'm' | 'h' | 'd' | 'weeks' */
  unit?: string;
  /** Target entity name (optional, for entity.command syntax) */
  targetEntity?: string;
  /** Target command name */
  targetCommand: string;
  /** Command parameters (object literal) */
  parameters?: Record<string, ExpressionNode>;
}

export interface ConditionalNode extends ASTNode {
  type: 'Conditional';
  condition: ExpressionNode;
  consequent: ExpressionNode;
  alternate: ExpressionNode;
}

export interface ArrayNode extends ASTNode {
  type: 'Array';
  elements: ExpressionNode[];
}

export interface ObjectNode extends ASTNode {
  type: 'Object';
  properties: { key: string; value: ExpressionNode }[];
}

export interface LambdaNode extends ASTNode {
  type: 'Lambda';
  parameters: string[];
  body: ExpressionNode;
}

/**
 * Aggregate count expression: `count(Entity where field == value, ...)`.
 *
 * Counts the rows of `entity` matching every (ANDed) equality predicate. Each
 * predicate is a pure equality — `<field>` is a property on the counted entity,
 * `<value>` is an arbitrary expression evaluated in the surrounding context
 * (reaction params: the event payload, same as `self.*`). Count only; no
 * group-by, joins, or arbitrary SQL. Deterministic: count is order-independent.
 */
export interface AggregateCountNode extends ASTNode {
  type: 'AggregateCount';
  /** Entity whose rows are counted. */
  entity: string;
  /** ANDed equality predicates (field on the counted entity == value). */
  predicates: { field: string; value: ExpressionNode }[];
}

export interface UseNode extends ASTNode {
  type: 'Use';
  /** Relative path to the referenced .manifest file */
  path: string;
}

export interface WebhookParamMapping {
  name: string;
  expression: ExpressionNode;
}

export interface WebhookSignatureNode extends ASTNode {
  type: 'WebhookSignature';
  /** Signature algorithm: 'hmac-sha256' or 'hmac-sha512' */
  algorithm: 'hmac-sha256' | 'hmac-sha512';
  /** HTTP header containing the signature (e.g. "X-Hub-Signature-256") */
  header: string;
  /** Context path to the shared secret (e.g. "context.webhookSecret") */
  secret: string;
}

export interface WebhookNode extends ASTNode {
  type: 'Webhook';
  name: string;
  /** HTTP path pattern for this webhook route (e.g. "/webhooks/stripe") */
  path: string;
  /** HTTP method to match (default: POST) */
  method?: string;
  /** Name of the command to invoke when the webhook fires */
  command: string;
  /** Optional entity context for the command (e.g. for entity-scoped commands) */
  entity?: string;
  /** HMAC signature verification configuration */
  signature?: WebhookSignatureNode;
  /** Header name to extract idempotency key from */
  idempotencyHeader?: string;
  /** Payload transformation expressions: maps command parameter names to payload field expressions */
  transform?: WebhookParamMapping[];
}

export interface ManifestProgram {
  uses: UseNode[];
  modules: ModuleNode[];
  entities: EntityNode[];
  enums: EnumNode[];
  values: ValueObjectNode[];
  commands: CommandNode[];
  flows: FlowNode[];
  effects: EffectNode[];
  exposures: ExposeNode[];
  compositions: CompositionNode[];
  policies: PolicyNode[];
  stores: StoreNode[];
  events: OutboxEventNode[];
  reactions: ReactionNode[];
  sagas: SagaNode[];
  roles: RoleNode[];
  webhooks: WebhookNode[];
  schedules?: ScheduleNode[];
  tenant?: TenantNode;
}

export interface CompilationResult {
  success: boolean;
  code?: string;
  serverCode?: string;
  testCode?: string;
  errors?: CompilationError[];
  ast?: ManifestProgram;
}

export interface CompilationError {
  message: string;
  position?: Position;
  severity: 'error' | 'warning';
}
