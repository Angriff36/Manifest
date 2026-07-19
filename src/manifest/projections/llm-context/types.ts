/**
 * Options and output types for the LLM Context projection.
 *
 * This projection generates a structured manifest-context.json
 * optimized for LLM context injection — enabling AI agents to
 * fully understand the domain model in a single context load.
 */

/** Configuration options for the LLM Context projection. */
export interface LlmContextProjectionOptions {
  /**
   * Include the full raw IR in the output.
   * Useful for agents that need complete IR detail.
   * @default true
   */
  includeRawIR?: boolean;

  /**
   * Include guard and action expressions in command details.
   * Set to false to reduce context size.
   * @default true
   */
  includeExpressions?: boolean;

  /**
   * Include enum definitions in the output.
   * @default true
   */
  includeEnums?: boolean;

  /**
   * Include event definitions in the output.
   * @default true
   */
  includeEvents?: boolean;

  /**
   * Include store configurations in the output.
   * @default true
   */
  includeStores?: boolean;

  /**
   * Emit a generation header comment with timestamp and version.
   * @default true
   */
  emitHeader?: boolean;
}

// ---------------------------------------------------------------------------
// Output shape — the manifest-context.json structure
// ---------------------------------------------------------------------------

/** Top-level manifest context document for LLM consumption. */
export interface ManifestContext {
  /** Schema identifier for version detection */
  $schema: 'manifest-context/v1';
  /** Generation metadata */
  meta: ManifestContextMeta;
  /** Domain model summary */
  domain: DomainSummary;
  /** Detailed entity definitions */
  entities: EntityContext[];
  /** Command signatures with full detail */
  commands: CommandContext[];
  /** Policy rules */
  policies: PolicyContext[];
  /** Constraint definitions across all entities */
  constraints: ConstraintContext[];
  /** Entity relationship graph */
  relationships: RelationshipEdge[];
  /** Enum type definitions (when includeEnums is true) */
  enums?: EnumContext[];
  /** Event definitions (when includeEvents is true) */
  events?: EventContext[];
  /** Store configurations (when includeStores is true) */
  stores?: StoreContext[];
  /** Raw IR (when includeRawIR is true) */
  ir?: unknown;
}

export interface ManifestContextMeta {
  compilerVersion: string;
  schemaVersion: string;
  contentHash: string;
  projection: 'llm-context';
}

export interface DomainSummary {
  entityCount: number;
  commandCount: number;
  policyCount: number;
  constraintCount: number;
  enumCount: number;
  eventCount: number;
  modules: string[];
  /** Whether multi-tenancy is configured */
  multiTenant: boolean;
}

export interface EntityContext {
  name: string;
  module?: string;
  properties: {
    name: string;
    type: string;
    required: boolean;
    modifiers: string[];
    defaultValue?: unknown;
  }[];
  computedProperties: {
    name: string;
    type: string;
    expression: string;
    dependencies: string[];
  }[];
  relationships: {
    name: string;
    kind: string;
    target: string;
    foreignKey?: { fields: string[]; references?: string[] };
    through?: string;
  }[];
  constraints: {
    name: string;
    code: string;
    severity: string;
    expression: string;
    message?: string;
    overrideable?: boolean;
  }[];
  commands: string[];
  policies: string[];
  key?: string[];
  transitions?: { property: string; from: string; to: string[] }[];
}

export interface CommandContext {
  name: string;
  module?: string;
  entity?: string;
  parameters: {
    name: string;
    type: string;
    required: boolean;
    defaultValue?: unknown;
  }[];
  guards: string[];
  constraints: {
    name: string;
    code: string;
    severity: string;
    expression: string;
    message?: string;
  }[];
  policies: string[];
  actions: {
    kind: string;
    target?: string;
    expression: string;
  }[];
  emits: string[];
  returns?: string;
}

export interface PolicyContext {
  name: string;
  module?: string;
  entity?: string;
  action: string;
  expression: string;
  message?: string;
}

export interface ConstraintContext {
  /** Entity this constraint belongs to */
  entity: string;
  name: string;
  code: string;
  severity: string;
  expression: string;
  message?: string;
  overrideable?: boolean;
}

export interface RelationshipEdge {
  source: string;
  target: string;
  kind: string;
  name: string;
  foreignKey?: { fields: string[]; references?: string[] };
  through?: string;
}

export interface EnumContext {
  name: string;
  module?: string;
  values: { name: string; label?: string; ordinal?: number }[];
}

export interface EventContext {
  name: string;
  channel: string;
  payload: string;
}

export interface StoreContext {
  entity: string;
  target: string;
}
