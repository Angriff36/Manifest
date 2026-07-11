/**
 * SDK types for @manifest/agent-sdk
 * All types here are SDK-specific and don't duplicate ir.ts types.
 */

import type { IR, IREntity, IRCommand, IRParameter, IRExpression, IRType, IRValue } from '../ir';

// ------------------------------------------------------------------------------------------------
// Tool Definition Formats
// ------------------------------------------------------------------------------------------------

/**
 * Minimal JSON Schema Draft-07 subset sufficient for tool definitions.
 * Used as input_schema in Anthropic tools and parameters in OpenAI/Vercel tools.
 */
export interface JsonSchema {
  type?: string;
  format?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  const?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: JsonSchema;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  /** Schema list for compound types (used internally for unions) */
  schemas?: JsonSchema[];
  /** Human-readable type label (sdk extension) */
  'x-manifest-type'?: string;
}

/** Tool format selector */
export type ToolFormat = 'anthropic' | 'openai' | 'vercel';

/** Anthropic tool_use object */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: JsonSchema;
}

/** OpenAI function calling format */
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
  };
}

/** Vercel AI SDK tool format (keyed by tool name) */
export type VercelAITools = Record<string, VercelAITool>;

export interface VercelAITool {
  description: string;
  parameters: JsonSchema;
}

// ------------------------------------------------------------------------------------------------
// Tool Definition Options
// ------------------------------------------------------------------------------------------------

export interface ToolDefinitionOptions {
  /**
   * Strategy for sanitizing tool names (removing invalid chars).
   * - 'snake': Order.placeOrder → order_place_order
   * - 'dot': Order.placeOrder → Order.placeOrder (no change; assume chars already valid)
   * @default 'snake'
   */
  toolNameStrategy?: 'snake' | 'dot';
  /**
   * Prefix for built-in introspection tools.
   * @default 'manifest'
   */
  builtinPrefix?: string;
  /**
   * Optional command name filter: only include commands matching this predicate.
   */
  commandFilter?: (cmd: IRCommand) => boolean;
  /**
   * Optional entity filter: only include commands for these entities.
   */
  entityFilter?: (entity: IREntity) => boolean;
  /**
   * Include built-in introspection tools (list_entities, describe_entity, etc.).
   * @default true
   */
  includeBuiltins?: boolean;
  /**
   * Include guard expressions in command descriptions.
   * @default true
   */
  includeGuardHints?: boolean;
  /**
   * Include policy names in command descriptions.
   * @default true
   */
  includePolicyHints?: boolean;
}

// ------------------------------------------------------------------------------------------------
// Introspection Types
// ------------------------------------------------------------------------------------------------

export interface PropertyDescriptor {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: unknown;
  modifiers: string[];
}

export interface ComputedPropertyDescriptor {
  name: string;
  type: string;
  dependencies: string[];
  expression: string;
}

export interface RelationshipDescriptor {
  name: string;
  kind: string;
  target: string;
  foreignKey?: { fields: string[]; references?: string[] };
  through?: string;
}

export interface ConstraintDescriptor {
  name: string;
  code: string;
  severity: string;
  message?: string;
  expression: string;
  overrideable?: boolean;
}

export interface PolicyDescriptor {
  name: string;
  action: string;
  expression: string;
  message?: string;
}

export interface EntitySummary {
  name: string;
  module?: string;
  propertyCount: number;
  computedPropertyCount: number;
  relationshipCount: number;
  commandCount: number;
  constraintCount: number;
}

export interface EntityDetails {
  summary: EntitySummary;
  properties: PropertyDescriptor[];
  computedProperties: ComputedPropertyDescriptor[];
  relationships: RelationshipDescriptor[];
  constraints: ConstraintDescriptor[];
  policies: PolicyDescriptor[];
  key?: string[];
  alternateKeys?: string[][];
  versionProperty?: string;
  transitions?: { property: string; from: string; to: string[] }[];
}

export interface CommandSummary {
  name: string;
  module?: string;
  entity?: string;
  parameterCount: number;
  guardCount: number;
  constraintCount: number;
  policyCount: number;
  emitsCount: number;
}

export interface CommandDetails {
  summary: CommandSummary;
  parameters: ParameterDescriptor[];
  guards: GuardDescriptor[];
  constraints: ConstraintDescriptor[];
  policies: PolicyDescriptor[];
  emits: string[];
  returns?: string;
  actions: { kind: string; target?: string; expression: string }[];
}

export interface ParameterDescriptor {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: unknown;
}

export interface GuardDescriptor {
  index: number;
  expression: string;
}

export interface RelationshipGraph {
  entity: string;
  relationships: {
    name: string;
    kind: string;
    target: string;
    direction: 'incoming' | 'outgoing';
    foreignKey?: { fields: string[]; references?: string[] };
    through?: string;
  }[];
}

// ------------------------------------------------------------------------------------------------
// Intent Mapping
// ------------------------------------------------------------------------------------------------

export interface IntentMatch {
  command: string;
  entity?: string;
  score: number;
  matchedTokens: string[];
  reason: string;
}

export interface IntentMapperOptions {
  /**
   * Minimum score threshold for a match to be included.
   * @default 0.1
   */
  minScore?: number;
  /**
   * Optional entity filter.
   */
  entityFilter?: (entity: IREntity) => boolean;
}

// ------------------------------------------------------------------------------------------------
// Agent Runtime Types
// ------------------------------------------------------------------------------------------------

/** Built-in tool names as constants (with configurable prefix) */
export interface BuiltinToolNames {
  LIST_ENTITIES: string;
  DESCRIBE_ENTITY: string;
  LIST_COMMANDS: string;
  DESCRIBE_COMMAND: string;
  EXECUTE_COMMAND: string;
  GET_INSTANCES: string;
  CHECK_CONSTRAINTS: string;
}

/** Agent tool call as received from an LLM */
export interface AgentToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Tool result formatted for LLM consumption.
 * Distinguishes success from user-facing error types (not technical stack traces).
 */
export interface AgentToolResult {
  success: boolean;
  /** Stable error code or 'SUCCESS' */
  code: string;
  /** Human-readable summary */
  message: string;
  /** Structured data payload (absent on error) */
  data?: unknown;
  /** Guard that failed */
  guardFailure?: {
    index: number;
    expression: string;
    resolved: Array<{ expression: string; value: unknown }>;
  };
  /** Policy that denied */
  policyDenial?: {
    policy: string;
    expression: string;
  };
  /** Constraint outcomes */
  constraintOutcomes?: Array<{
    code: string;
    constraintName: string;
    severity: string;
    passed: boolean;
    overridden?: boolean;
  }>;
  /** Concurrency conflict details */
  concurrencyConflict?: {
    entityType: string;
    entityId: string;
    expectedVersion: number;
    actualVersion: number;
  };
  /** Emitted events during command execution */
  emittedEvents?: string[];
}

export interface AgentRuntimeOptions {
  /**
   * Prefix for built-in introspection tools.
   * @default 'manifest'
   */
  builtinPrefix?: string;
  /**
   * Tool name sanitization strategy.
   * @default 'snake'
   */
  toolNameStrategy?: 'snake' | 'dot';
}

// ------------------------------------------------------------------------------------------------
// Re-exports from ir.ts for convenience
// ------------------------------------------------------------------------------------------------

export type { IR, IREntity, IRCommand, IRParameter, IRExpression, IRType, IRValue };
