/**
 * Generate AI tool definitions from IR in Anthropic, OpenAI, and Vercel AI SDK formats.
 */

import type { IR, IRCommand } from '../ir';
import type {
  AnthropicTool,
  OpenAITool,
  VercelAITools,
  ToolDefinitionOptions,
  BuiltinToolNames,
} from './types';
import { irParametersToJsonSchema } from './json-schema.js';

// ------------------------------------------------------------------------------------------------
// Tool name mangling
// ------------------------------------------------------------------------------------------------

/**
 * Convert a tool name to a safe identifier.
 * Snake strategy: "Order.placeOrder" → "order_place_order"
 * Dot strategy: "Order.placeOrder" → "Order.placeOrder" (no change)
 */
export function mangleToolName(
  entity: string | undefined,
  command: string,
  strategy: 'snake' | 'dot',
): string {
  if (strategy === 'dot') return `${entity ?? ''}${entity ? '.' : ''}${command}`;
  // snake: entity is lowercased, command is preserved as-is
  return `${entity ? entity.toLowerCase() + '_' : ''}${command}`;
}

/**
 * Parse a mangled tool name back into entity + command.
 * Only works reliably with snake strategy.
 */
export function parseToolName(name: string): { entity?: string; command: string } {
  const parts = name.split('_');
  if (parts.length === 1) return { command: name };
  // Last part is the command (preserves its original case from mangleToolName);
  // everything before is the entity name (all-lowercase from mangleToolName)
  const entity = parts.slice(0, -1).join('');
  const command = parts[parts.length - 1];
  return { entity, command };
}

// ------------------------------------------------------------------------------------------------
// Per-command tool converters
// ------------------------------------------------------------------------------------------------

function commandDescription(cmd: IRCommand, opts: ToolDefinitionOptions, _ir: IR): string {
  const parts: string[] = [];
  if (cmd.entity) parts.push(`Entity: ${cmd.entity}`);
  if (cmd.module) parts.push(`Module: ${cmd.module}`);
  parts.push(
    `Parameters: ${cmd.parameters.map((p) => `${p.name}: ${p.type.name}${p.required ? '' : '?'}`).join(', ') || 'none'}`,
  );
  if (opts.includeGuardHints && cmd.guards.length > 0) {
    parts.push(`Guards: ${cmd.guards.length}`);
  }
  if (opts.includePolicyHints && (cmd.policies?.length ?? 0) > 0) {
    parts.push(`Policies: ${cmd.policies!.join(', ')}`);
  }
  if (cmd.emits.length > 0) {
    parts.push(`Emits: ${cmd.emits.join(', ')}`);
  }
  return parts.join(' | ');
}

export function commandToAnthropicTool(
  cmd: IRCommand,
  opts: ToolDefinitionOptions,
  ir: IR,
): AnthropicTool {
  return {
    name: mangleToolName(cmd.entity, cmd.name, opts.toolNameStrategy ?? 'snake'),
    description: commandDescription(cmd, opts, ir),
    input_schema: irParametersToJsonSchema(cmd.parameters),
  };
}

export function commandToOpenAITool(
  cmd: IRCommand,
  opts: ToolDefinitionOptions,
  ir: IR,
): OpenAITool {
  return {
    type: 'function',
    function: {
      name: mangleToolName(cmd.entity, cmd.name, opts.toolNameStrategy ?? 'snake'),
      description: commandDescription(cmd, opts, ir),
      parameters: irParametersToJsonSchema(cmd.parameters),
    },
  };
}

export function commandToVercelTool(
  cmd: IRCommand,
  opts: ToolDefinitionOptions,
  ir: IR,
): { name: string; description: string; parameters: ReturnType<typeof irParametersToJsonSchema> } {
  const name = mangleToolName(cmd.entity, cmd.name, opts.toolNameStrategy ?? 'snake');
  return {
    name,
    description: commandDescription(cmd, opts, ir),
    parameters: irParametersToJsonSchema(cmd.parameters),
  };
}

// ------------------------------------------------------------------------------------------------
// Built-in introspection tools
// ------------------------------------------------------------------------------------------------

export function getBuiltinToolNames(prefix: string): BuiltinToolNames {
  return {
    LIST_ENTITIES: `${prefix}_list_entities`,
    DESCRIBE_ENTITY: `${prefix}_describe_entity`,
    LIST_COMMANDS: `${prefix}_list_commands`,
    DESCRIBE_COMMAND: `${prefix}_describe_command`,
    EXECUTE_COMMAND: `${prefix}_execute_command`,
    GET_INSTANCES: `${prefix}_get_instances`,
    CHECK_CONSTRAINTS: `${prefix}_check_constraints`,
  };
}

function builtinListEntitiesSchema(_prefix: string): AnthropicTool['input_schema'] {
  return {
    type: 'object',
    properties: {
      module: { type: 'string', description: 'Optional module name to filter entities by' },
    },
    additionalProperties: false,
  };
}

function builtinDescribeEntitySchema(): AnthropicTool['input_schema'] {
  return {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the entity to describe' },
      includeSchema: {
        type: 'boolean',
        description: 'Include property type schemas',
        default: false,
      },
    },
    required: ['name'],
    additionalProperties: false,
  };
}

function builtinListCommandsSchema(_prefix: string): AnthropicTool['input_schema'] {
  return {
    type: 'object',
    properties: {
      entity: { type: 'string', description: 'Optional entity name to filter commands by' },
      module: { type: 'string', description: 'Optional module name to filter commands by' },
    },
    additionalProperties: false,
  };
}

function builtinDescribeCommandSchema(): AnthropicTool['input_schema'] {
  return {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the command to describe' },
      includeExpressions: {
        type: 'boolean',
        description: 'Include guard/action expressions',
        default: false,
      },
    },
    required: ['name'],
    additionalProperties: false,
  };
}

function builtinExecuteCommandSchema(): AnthropicTool['input_schema'] {
  return {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Name of the command to execute' },
      entityId: {
        type: 'string',
        description: 'ID of the entity instance to act on (if entity-scoped)',
      },
      parameters: {
        type: 'object',
        description: 'Command parameters as key-value pairs',
        additionalProperties: true,
      },
      context: {
        type: 'object',
        description: 'Runtime context overrides',
        additionalProperties: true,
      },
    },
    required: ['command'],
    additionalProperties: false,
  };
}

function builtinGetInstancesSchema(): AnthropicTool['input_schema'] {
  return {
    type: 'object',
    properties: {
      entity: { type: 'string', description: 'Name of the entity' },
      limit: { type: 'number', description: 'Maximum number of instances to return', default: 20 },
    },
    required: ['entity'],
    additionalProperties: false,
  };
}

function builtinCheckConstraintsSchema(): AnthropicTool['input_schema'] {
  return {
    type: 'object',
    properties: {
      entity: { type: 'string', description: 'Name of the entity' },
      entityId: { type: 'string', description: 'ID of the entity instance to check' },
      constraintCodes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific constraint codes to check (if empty, checks all)',
      },
    },
    required: ['entity', 'entityId'],
    additionalProperties: false,
  };
}

function builtinCheckConstraintsVercelSchema(): AnthropicTool['input_schema'] {
  return {
    type: 'object',
    properties: {
      entity: { type: 'string', description: 'Name of the entity' },
      entityId: { type: 'string', description: 'ID of the entity instance to check' },
      constraintCodes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific constraint codes to check (if empty, checks all)',
      },
    },
    required: ['entity', 'entityId'],
    additionalProperties: false,
  };
}

function builtinListCommandsVercelSchema(_prefix: string): AnthropicTool['input_schema'] {
  return {
    type: 'object',
    properties: {
      entity: { type: 'string', description: 'Optional entity name to filter commands by' },
      module: { type: 'string', description: 'Optional module name to filter commands by' },
    },
    additionalProperties: false,
  };
}

function builtinGetInstancesVercelSchema(): AnthropicTool['input_schema'] {
  return {
    type: 'object',
    properties: {
      entity: { type: 'string', description: 'Name of the entity' },
      limit: { type: 'number', description: 'Maximum number of instances to return', default: 20 },
    },
    required: ['entity'],
    additionalProperties: false,
  };
}

function getBuiltinsAnthropic(prefix: string, _strategy: 'snake' | 'dot'): AnthropicTool[] {
  return [
    {
      name: `${prefix}_list_entities`,
      description: 'List all entities defined in the Manifest program',
      input_schema: builtinListEntitiesSchema(prefix),
    },
    {
      name: `${prefix}_describe_entity`,
      description: 'Get detailed information about a specific entity',
      input_schema: builtinDescribeEntitySchema(),
    },
    {
      name: `${prefix}_list_commands`,
      description: 'List all commands, optionally filtered by entity or module',
      input_schema: builtinListCommandsSchema(prefix),
    },
    {
      name: `${prefix}_describe_command`,
      description:
        'Get detailed information about a specific command including parameters and guards',
      input_schema: builtinDescribeCommandSchema(),
    },
    {
      name: `${prefix}_execute_command`,
      description: 'Execute a Manifest command on an entity instance',
      input_schema: builtinExecuteCommandSchema(),
    },
    {
      name: `${prefix}_get_instances`,
      description: 'Get entity instances from the runtime store',
      input_schema: builtinGetInstancesSchema(),
    },
    {
      name: `${prefix}_check_constraints`,
      description: 'Check constraint outcomes for a specific entity instance',
      input_schema: builtinCheckConstraintsSchema(),
    },
  ];
}

function getBuiltinsOpenAI(prefix: string): OpenAITool[] {
  return [
    {
      type: 'function',
      function: {
        name: `${prefix}_list_entities`,
        description: 'List all entities defined in the Manifest program',
        parameters: builtinListEntitiesSchema(prefix),
      },
    },
    {
      type: 'function',
      function: {
        name: `${prefix}_describe_entity`,
        description: 'Get detailed information about a specific entity',
        parameters: builtinDescribeEntitySchema(),
      },
    },
    {
      type: 'function',
      function: {
        name: `${prefix}_list_commands`,
        description: 'List all commands, optionally filtered by entity or module',
        parameters: builtinListCommandsSchema(prefix),
      },
    },
    {
      type: 'function',
      function: {
        name: `${prefix}_describe_command`,
        description:
          'Get detailed information about a specific command including parameters and guards',
        parameters: builtinDescribeCommandSchema(),
      },
    },
    {
      type: 'function',
      function: {
        name: `${prefix}_execute_command`,
        description: 'Execute a Manifest command on an entity instance',
        parameters: builtinExecuteCommandSchema(),
      },
    },
    {
      type: 'function',
      function: {
        name: `${prefix}_get_instances`,
        description: 'Get entity instances from the runtime store',
        parameters: builtinGetInstancesSchema(),
      },
    },
    {
      type: 'function',
      function: {
        name: `${prefix}_check_constraints`,
        description: 'Check constraint outcomes for a specific entity instance',
        parameters: builtinCheckConstraintsSchema(),
      },
    },
  ];
}

function getBuiltinsVercel(prefix: string): VercelAITools {
  return {
    [`${prefix}_list_entities`]: {
      description: 'List all entities defined in the Manifest program',
      parameters: builtinListEntitiesSchema(prefix),
    },
    [`${prefix}_describe_entity`]: {
      description: 'Get detailed information about a specific entity',
      parameters: builtinDescribeEntitySchema(),
    },
    [`${prefix}_list_commands`]: {
      description: 'List all commands, optionally filtered by entity or module',
      parameters: builtinListCommandsVercelSchema(prefix),
    },
    [`${prefix}_describe_command`]: {
      description:
        'Get detailed information about a specific command including parameters and guards',
      parameters: builtinDescribeCommandSchema(),
    },
    [`${prefix}_execute_command`]: {
      description: 'Execute a Manifest command on an entity instance',
      parameters: builtinExecuteCommandSchema(),
    },
    [`${prefix}_get_instances`]: {
      description: 'Get entity instances from the runtime store',
      parameters: builtinGetInstancesVercelSchema(),
    },
    [`${prefix}_check_constraints`]: {
      description: 'Check constraint outcomes for a specific entity instance',
      parameters: builtinCheckConstraintsVercelSchema(),
    },
  };
}

// ------------------------------------------------------------------------------------------------
// Top-level converters
// ------------------------------------------------------------------------------------------------

/**
 * Generate Anthropic tool_use format tools from IR.
 */
export function toAnthropicTools(ir: IR, opts: ToolDefinitionOptions = {}): AnthropicTool[] {
  const {
    toolNameStrategy = 'snake',
    builtinPrefix = 'manifest',
    includeBuiltins = true,
    commandFilter,
  } = opts;

  const tools: AnthropicTool[] = [];

  for (const cmd of ir.commands) {
    if (commandFilter && !commandFilter(cmd)) continue;
    tools.push(commandToAnthropicTool(cmd, opts, ir));
  }

  if (includeBuiltins) {
    tools.push(...getBuiltinsAnthropic(builtinPrefix, toolNameStrategy));
  }

  return tools;
}

/**
 * Generate OpenAI function-calling format tools from IR.
 */
export function toOpenAITools(ir: IR, opts: ToolDefinitionOptions = {}): OpenAITool[] {
  const { includeBuiltins = true, commandFilter } = opts;

  const tools: OpenAITool[] = [];

  for (const cmd of ir.commands) {
    if (commandFilter && !commandFilter(cmd)) continue;
    tools.push(commandToOpenAITool(cmd, opts, ir));
  }

  if (includeBuiltins) {
    tools.push(...getBuiltinsOpenAI(opts.builtinPrefix ?? 'manifest'));
  }

  return tools;
}

/**
 * Generate Vercel AI SDK tool format from IR.
 */
export function toVercelAITools(ir: IR, opts: ToolDefinitionOptions = {}): VercelAITools {
  const { includeBuiltins = true, commandFilter } = opts;

  const tools: VercelAITools = {};

  for (const cmd of ir.commands) {
    if (commandFilter && !commandFilter(cmd)) continue;
    const t = commandToVercelTool(cmd, opts, ir);
    tools[t.name] = { description: t.description, parameters: t.parameters };
  }

  if (includeBuiltins) {
    Object.assign(tools, getBuiltinsVercel(opts.builtinPrefix ?? 'manifest'));
  }

  return tools;
}
