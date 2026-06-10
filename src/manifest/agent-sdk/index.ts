/**
 * @manifest/agent-sdk — LLM-friendly interfaces for the Manifest runtime engine.
 *
 * Exports:
 * - AgentRuntime         — stateful wrapper with tool call routing
 * - Tool formats         — Anthropic / OpenAI / Vercel tool definition generators
 * - Introspection        — entity & command listing and description
 * - Intent mapping       — keyword-based natural-language command matching
 * - JSON Schema helpers  — IR type → JSON Schema conversion
 */

// Types
export type * from './types';

// JSON Schema converter
export { irTypeToJsonSchema, irParametersToJsonSchema, irValueToJson } from './json-schema.js';

// Introspection
export {
  listEntities,
  describeEntity,
  listCommands,
  describeCommand,
  getEntityRelationships,
  getActionableEntities,
  formatExpression,
  formatIRType,
} from './introspect.js';

// Tool definitions
export {
  toAnthropicTools,
  toOpenAITools,
  toVercelAITools,
  commandToAnthropicTool,
  commandToOpenAITool,
  commandToVercelTool,
  mangleToolName,
  parseToolName,
  getBuiltinToolNames,
} from './tool-definitions.js';

// Intent mapping
export { findMatchingCommands, tokenize } from './intent-mapper.js';

// AgentRuntime
export { AgentRuntime } from './agent-runtime.js';
