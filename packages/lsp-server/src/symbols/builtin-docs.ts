import { CompletionItemKind } from 'vscode-languageserver';

/**
 * Keyword → markdown documentation mapping.
 * Used by hover to show documentation for keywords.
 */
export const KEYWORD_DOCS: Record<string, string> = {
  // Top-level declarations
  entity: 'Declares a business entity with properties, commands, constraints, and policies.',
  enum: 'Declares an enumeration type with named values, optional labels, and ordinals.',
  command: 'Declares a business operation with parameters, guards, constraints, and actions.',
  module: 'Groups related entities, commands, and policies into a namespace.',
  policy: 'Defines authorization rules controlling read, write, delete, or execute access.',
  store: 'Configures persistence for an entity (memory, postgres, supabase, localStorage).',
  event: 'Declares an outbox event with a channel and typed payload.',
  saga: 'Orchestrates a sequence of commands with compensation on failure.',
  tenant: 'Configures multi-tenancy isolation with a discriminator property.',

  // Entity members
  property: 'Declares a data field on an entity with a type and optional modifiers.',
  computed: 'Declares a derived property calculated from an expression.',
  derived: 'Alias for `computed`. Declares a derived property.',
  constraint: 'Defines a data validation rule with severity (ok/warn/block).',
  behavior: 'Declares a trigger-action pair responding to events.',
  transition: 'Restricts allowed state transitions for a property.',
  approval: 'Defines an approval workflow gating a command with stages.',

  // Relationships
  hasMany: 'One-to-many relationship. The target entity has a foreign key back to this entity.',
  hasOne: 'One-to-one relationship. Exactly one related entity.',
  belongsTo: 'Many-to-one relationship. This entity holds the foreign key.',
  ref: 'Foreign key reference to another entity. Supports composite keys.',
  through: 'Specifies a join table for many-to-many relationships.',

  // Command internals
  guard: 'Boolean expression that must be true for the command to execute. Evaluated in order; first failure halts.',
  mutate: 'State mutation action. Modifies entity properties.',
  emit: 'Emits an event as a side effect of the command.',
  publish: 'Publishes a message to an event channel.',
  persist: 'Persists the entity state to the configured store.',
  returns: 'Specifies the return type of a command.',
  async: 'Marks a command for deferred execution via a background job queue.',

  // Types
  string: 'Text data type.',
  number: 'Numeric data type (integer or float).',
  boolean: 'Boolean data type (true/false).',
  list: 'Generic list/array type. Usage: `list<T>`.',
  map: 'Generic key-value map type. Usage: `map<string, T>`.',
  any: 'Dynamic type accepting any value.',
  void: 'No return value.',
  decimal: 'Exact decimal type with configurable precision and scale.',
  money: 'Monetary value type (decimal with 2 decimal places).',

  // Modifiers
  required: 'Property must have a value (non-nullable).',
  unique: 'Property value must be unique across all instances.',
  indexed: 'Creates a database index for faster queries.',
  private: 'Property is not exposed in API responses.',
  readonly: 'Property can only be set during creation.',
  optional: 'Property may be null/undefined.',
  overrideable: 'Constraint can be overridden by an authorized user.',
  timestamps: 'Auto-inject `createdAt` and `updatedAt` properties.',

  // Constraint severity
  ok: 'Constraint severity: informational, does not prevent execution.',
  warn: 'Constraint severity: warning, allows execution but flags the issue.',
  block: 'Constraint severity: blocks execution if the constraint fails.',

  // Policy actions
  read: 'Policy action: controls read/query access.',
  write: 'Policy action: controls create/update access.',
  delete: 'Policy action: controls deletion access.',
  execute: 'Policy action: controls command execution access.',
  all: 'Policy action: applies to read, write, delete, and execute.',
  override: 'Policy action: allows overriding constraint checks.',
  allow: 'Policy verdict: permits the action.',
  deny: 'Policy verdict: denies the action.',
  default: 'Marks a policy as the default for the entity.',

  // Referential actions
  cascade: 'Referential action: cascade deletes/updates to related entities.',
  restrict: 'Referential action: prevent if related entities exist.',
  setNull: 'Referential action: set foreign key to null.',
  setDefault: 'Referential action: reset foreign key to default value.',
  noAction: 'Referential action: no automatic action (may cause constraint violation).',

  // Context variables
  user: 'Runtime context: the authenticated user performing the action.',
  self: 'Runtime context: the entity instance being operated on.',
  context: 'Runtime context: additional request-scoped data.',

  // Store targets
  memory: 'In-memory store (non-persistent, for testing).',
  postgres: 'PostgreSQL database store.',
  supabase: 'Supabase-backed store with RLS.',
  localStorage: 'Browser localStorage store.',

  // Keywords
  on: 'Event trigger keyword. Usage: `on EventName`.',
  when: 'Conditional expression. Usage: `when <condition>`.',
  then: 'Action following a condition.',
  as: 'Alias keyword for renaming.',
  from: 'Source specification.',
  to: 'Target specification.',
  with: 'Association/configuration keyword.',
  where: 'Filter condition.',
  extends: 'Inheritance/extension keyword for roles.',
  use: 'Import another manifest module.',
};

/**
 * Completion item buckets for context-aware suggestions.
 */
export interface CompletionBucket {
  label: string;
  kind: CompletionItemKind;
  detail?: string;
  documentation?: string;
}

/** Top-level declaration keywords */
export const TOP_LEVEL_COMPLETIONS: CompletionBucket[] = [
  { label: 'entity', kind: CompletionItemKind.Keyword, detail: 'Entity declaration', documentation: KEYWORD_DOCS.entity },
  { label: 'enum', kind: CompletionItemKind.Keyword, detail: 'Enum declaration', documentation: KEYWORD_DOCS.enum },
  { label: 'command', kind: CompletionItemKind.Keyword, detail: 'Command declaration', documentation: KEYWORD_DOCS.command },
  { label: 'module', kind: CompletionItemKind.Keyword, detail: 'Module declaration', documentation: KEYWORD_DOCS.module },
  { label: 'policy', kind: CompletionItemKind.Keyword, detail: 'Policy declaration', documentation: KEYWORD_DOCS.policy },
  { label: 'store', kind: CompletionItemKind.Keyword, detail: 'Store declaration', documentation: KEYWORD_DOCS.store },
  { label: 'event', kind: CompletionItemKind.Keyword, detail: 'Event declaration', documentation: KEYWORD_DOCS.event },
  { label: 'saga', kind: CompletionItemKind.Keyword, detail: 'Saga declaration', documentation: KEYWORD_DOCS.saga },
  { label: 'tenant', kind: CompletionItemKind.Keyword, detail: 'Tenant declaration', documentation: KEYWORD_DOCS.tenant },
  { label: 'use', kind: CompletionItemKind.Keyword, detail: 'Import module', documentation: KEYWORD_DOCS.use },
];

/** Keywords valid inside an entity body */
export const ENTITY_BODY_COMPLETIONS: CompletionBucket[] = [
  { label: 'property', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.property },
  { label: 'computed', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.computed },
  { label: 'command', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.command },
  { label: 'constraint', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.constraint },
  { label: 'policy', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.policy },
  { label: 'hasMany', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.hasMany },
  { label: 'hasOne', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.hasOne },
  { label: 'belongsTo', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.belongsTo },
  { label: 'ref', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.ref },
  { label: 'behavior', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.behavior },
  { label: 'transition', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.transition },
  { label: 'approval', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.approval },
  { label: 'timestamps', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.timestamps },
  { label: 'versionProperty', kind: CompletionItemKind.Keyword },
  { label: 'versionAtProperty', kind: CompletionItemKind.Keyword },
  { label: 'key', kind: CompletionItemKind.Keyword },
];

/** Type keywords */
export const TYPE_COMPLETIONS: CompletionBucket[] = [
  { label: 'string', kind: CompletionItemKind.TypeParameter, documentation: KEYWORD_DOCS.string },
  { label: 'number', kind: CompletionItemKind.TypeParameter, documentation: KEYWORD_DOCS.number },
  { label: 'boolean', kind: CompletionItemKind.TypeParameter, documentation: KEYWORD_DOCS.boolean },
  { label: 'list', kind: CompletionItemKind.TypeParameter, documentation: KEYWORD_DOCS.list },
  { label: 'map', kind: CompletionItemKind.TypeParameter, documentation: KEYWORD_DOCS.map },
  { label: 'decimal', kind: CompletionItemKind.TypeParameter, documentation: KEYWORD_DOCS.decimal },
  { label: 'money', kind: CompletionItemKind.TypeParameter, documentation: KEYWORD_DOCS.money },
  { label: 'any', kind: CompletionItemKind.TypeParameter, documentation: KEYWORD_DOCS.any },
  { label: 'void', kind: CompletionItemKind.TypeParameter, documentation: KEYWORD_DOCS.void },
];

/** Property modifiers */
export const MODIFIER_COMPLETIONS: CompletionBucket[] = [
  { label: 'required', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.required },
  { label: 'unique', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.unique },
  { label: 'indexed', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.indexed },
  { label: 'private', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.private },
  { label: 'readonly', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.readonly },
  { label: 'optional', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.optional },
];

/** Policy action keywords */
export const POLICY_ACTION_COMPLETIONS: CompletionBucket[] = [
  { label: 'read', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.read },
  { label: 'write', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.write },
  { label: 'delete', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.delete },
  { label: 'execute', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.execute },
  { label: 'all', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.all },
  { label: 'override', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.override },
];

/** Constraint severity keywords */
export const SEVERITY_COMPLETIONS: CompletionBucket[] = [
  { label: 'ok', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.ok },
  { label: 'warn', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.warn },
  { label: 'block', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.block },
];

/** Referential action keywords */
export const REF_ACTION_COMPLETIONS: CompletionBucket[] = [
  { label: 'cascade', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.cascade },
  { label: 'restrict', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.restrict },
  { label: 'setNull', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.setNull },
  { label: 'setDefault', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.setDefault },
  { label: 'noAction', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.noAction },
];

/** Command body keywords */
export const COMMAND_BODY_COMPLETIONS: CompletionBucket[] = [
  { label: 'guard', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.guard },
  { label: 'constraint', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.constraint },
  { label: 'mutate', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.mutate },
  { label: 'emit', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.emit },
  { label: 'compute', kind: CompletionItemKind.Keyword },
  { label: 'publish', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.publish },
  { label: 'persist', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.persist },
  { label: 'returns', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.returns },
];

/** Store target keywords */
export const STORE_TARGET_COMPLETIONS: CompletionBucket[] = [
  { label: 'memory', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.memory },
  { label: 'postgres', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.postgres },
  { label: 'supabase', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.supabase },
  { label: 'localStorage', kind: CompletionItemKind.Keyword, documentation: KEYWORD_DOCS.localStorage },
];
