/**
 * @manifest/agent-sdk — Unit Tests
 *
 * Tests the SDK's introspection, tool definitions, intent mapping, and
 * AgentRuntime wrapper against IR compiled from valid fixture source strings.
 */

import { describe, it, expect } from 'vitest';
import { IRCompiler } from '../ir-compiler';
import type { IR } from '../ir';
import {
  irTypeToJsonSchema,
  irParametersToJsonSchema,
  irValueToJson,
  listEntities,
  describeEntity,
  listCommands,
  describeCommand,
  getEntityRelationships,
  formatExpression,
  formatIRType,
  toAnthropicTools,
  toOpenAITools,
  toVercelAITools,
  mangleToolName,
  parseToolName,
  findMatchingCommands,
  tokenize,
  AgentRuntime,
} from './index';
import { RuntimeEngine, type RuntimeContext } from '../runtime-engine';

// ------------------------------------------------------------------------------------------------
// Helper — compile .manifest source to IR
// ------------------------------------------------------------------------------------------------

const compiler = new IRCompiler();

async function compile(code: string): Promise<IR> {
  const result = await compiler.compileToIR(code);
  if (!result.ir) throw new Error(`Compilation failed: ${JSON.stringify(result.diagnostics)}`);
  return result.ir;
}

// ------------------------------------------------------------------------------------------------
// Fixture sources (correct Manifest .manifest syntax)
// Manifest uses `command Name() { ... }` and `property name: type` syntax
// ------------------------------------------------------------------------------------------------

async function getEntityPropertiesIR(): Promise<IR> {
  return compile('entity User { property id: ID property name: String property email: Email }');
}

async function getCommandsIR(): Promise<IR> {
  return compile(
    'entity Counter { property value: number = 0 command increment() { mutate value = value + 1 } command reset() { mutate value = 0 } command setValue(newValue: number) { mutate value = newValue } } store Counter in memory'
  );
}

async function getOrderWithCommandsIR(): Promise<IR> {
  return compile(
    'entity Order { property id: ID property status: String command placeOrder() { mutate status = "placed" } command cancelOrder() { mutate status = "cancelled" } } store Order in memory'
  );
}

async function getRelationshipsIR(): Promise<IR> {
  return compile(
    'entity User { property id: ID hasMany posts: Post } entity Post { property id: ID belongsTo author: User }'
  );
}

// ------------------------------------------------------------------------------------------------
// Inline minimal IR for targeted tests (no compilation needed)
// ------------------------------------------------------------------------------------------------

function makeMinimalIR(overrides?: Partial<IR>): IR {
  return {
    version: '1.0',
    provenance: { contentHash: 'test-hash', compilerVersion: '1.0.0', schemaVersion: '1.0', compiledAt: '2024-01-01T00:00:00.000Z' },
    modules: [],
    entities: [],
    enums: [],
    stores: [],
    events: [],
    commands: [],
    policies: [],
    ...overrides,
  };
}

// ------------------------------------------------------------------------------------------------
// JSON Schema
// ------------------------------------------------------------------------------------------------

describe('irTypeToJsonSchema', () => {
  it('maps String to { type: string }', () => {
    expect(irTypeToJsonSchema({ name: 'String', nullable: false })).toEqual({ type: 'string' });
  });

  it('maps Number to { type: number }', () => {
    expect(irTypeToJsonSchema({ name: 'Number', nullable: false })).toEqual({ type: 'number' });
  });

  it('maps Boolean to { type: boolean }', () => {
    expect(irTypeToJsonSchema({ name: 'Boolean', nullable: false })).toEqual({ type: 'boolean' });
  });

  it('maps ID and UUID to { type: string }', () => {
    const idResult = irTypeToJsonSchema({ name: 'ID', nullable: false });
    const uuidResult = irTypeToJsonSchema({ name: 'UUID', nullable: false });
    expect(idResult.type).toBe('string');
    expect(uuidResult.type).toBe('string');
  });

  it('maps Date/DateTime to { type: string, format: date-time }', () => {
    const dateResult = irTypeToJsonSchema({ name: 'Date', nullable: false });
    const dateTimeResult = irTypeToJsonSchema({ name: 'DateTime', nullable: false });
    expect(dateResult.type).toBe('string');
    expect(dateResult.format).toBe('date-time');
    expect(dateTimeResult.type).toBe('string');
    expect(dateTimeResult.format).toBe('date-time');
  });

  it('maps Email to { type: string, format: email }', () => {
    const emailResult = irTypeToJsonSchema({ name: 'Email', nullable: false });
    expect(emailResult.type).toBe('string');
    expect(emailResult.format).toBe('email');
  });

  it('maps nullable scalar types to oneOf with null', () => {
    const schema = irTypeToJsonSchema({ name: 'String', nullable: true });
    expect(schema.oneOf).toBeDefined();
    expect(schema.oneOf).toContainEqual({ type: 'null' });
    expect(schema.oneOf).toContainEqual({ type: 'string' });
  });

  it('maps Array<T> to { type: array, items: schema }', () => {
    const schema = irTypeToJsonSchema({ name: 'Array', generic: { name: 'String', nullable: false }, nullable: false });
    expect(schema).toEqual({ type: 'array', items: { type: 'string' } });
  });

  it('maps unknown type names to { type: string }', () => {
    const result = irTypeToJsonSchema({ name: 'FooBar', nullable: false });
    expect(result.type).toBe('string');
  });
});

describe('irValueToJson', () => {
  it('converts primitive values', () => {
    expect(irValueToJson({ kind: 'string', value: 'hello' })).toBe('hello');
    expect(irValueToJson({ kind: 'number', value: 42 })).toBe(42);
    expect(irValueToJson({ kind: 'boolean', value: true })).toBe(true);
    expect(irValueToJson({ kind: 'null' })).toBe(null);
  });

  it('converts arrays', () => {
    expect(irValueToJson({ kind: 'array', elements: [{ kind: 'string', value: 'a' }, { kind: 'string', value: 'b' }] })).toEqual(['a', 'b']);
  });

  it('converts objects', () => {
    expect(irValueToJson({ kind: 'object', properties: { x: { kind: 'number', value: 1 }, y: { kind: 'number', value: 2 } } })).toEqual({ x: 1, y: 2 });
  });
});

describe('irParametersToJsonSchema', () => {
  it('creates object schema with properties and required', () => {
    const schema = irParametersToJsonSchema([
      { name: 'id', type: { name: 'ID', nullable: false }, required: true },
      { name: 'name', type: { name: 'String', nullable: false }, required: false },
    ]);
    expect(schema.type).toBe('object');
    expect(schema.properties).toHaveProperty('id');
    expect(schema.properties).toHaveProperty('name');
    expect(schema.required).toContain('id');
  });
});

// ------------------------------------------------------------------------------------------------
// formatExpression
// ------------------------------------------------------------------------------------------------

describe('formatExpression', () => {
  it('formats string literals with quotes', () => {
    expect(formatExpression({ kind: 'literal', value: { kind: 'string', value: 'foo' } })).toBe('"foo"');
  });

  it('formats numeric literals without quotes', () => {
    expect(formatExpression({ kind: 'literal', value: { kind: 'number', value: 42 } })).toBe('42');
  });

  it('formats boolean literals', () => {
    expect(formatExpression({ kind: 'literal', value: { kind: 'boolean', value: true } })).toBe('true');
    expect(formatExpression({ kind: 'literal', value: { kind: 'null' } })).toBe('null');
  });

  it('formats identifiers', () => {
    expect(formatExpression({ kind: 'identifier', name: 'self.price' })).toBe('self.price');
  });

  it('formats binary expressions', () => {
    expect(formatExpression({
      kind: 'binary',
      operator: '+',
      left: { kind: 'identifier', name: 'a' },
      right: { kind: 'identifier', name: 'b' },
    })).toBe('a + b');
  });

  it('formats call expressions', () => {
    expect(formatExpression({
      kind: 'call',
      callee: { kind: 'identifier', name: 'round' },
      args: [{ kind: 'identifier', name: 'x' }],
    })).toBe('round(x)');
  });

  it('formats conditional expressions', () => {
    expect(formatExpression({
      kind: 'conditional',
      condition: { kind: 'identifier', name: 'x' },
      consequent: { kind: 'literal', value: { kind: 'number', value: 1 } },
      alternate: { kind: 'literal', value: { kind: 'number', value: 0 } },
    })).toBe('x ? 1 : 0');
  });

  it('formats array expressions', () => {
    expect(formatExpression({
      kind: 'array',
      elements: [
        { kind: 'literal', value: { kind: 'number', value: 1 } },
        { kind: 'literal', value: { kind: 'number', value: 2 } },
      ],
    })).toBe('[1, 2]');
  });

  it('formats object expressions', () => {
    expect(formatExpression({
      kind: 'object',
      properties: [
        { key: 'x', value: { kind: 'literal', value: { kind: 'number', value: 1 } } },
      ],
    })).toBe('{x: 1}');
  });

  it('formats lambda expressions', () => {
    expect(formatExpression({
      kind: 'lambda',
      params: ['x'],
      body: { kind: 'binary', operator: '+', left: { kind: 'identifier', name: 'x' }, right: { kind: 'literal', value: { kind: 'number', value: 1 } } },
    })).toBe('(x) => x + 1');
  });
});

describe('formatIRType', () => {
  it('formats non-nullable types', () => {
    expect(formatIRType({ name: 'String', nullable: false })).toBe('String');
    expect(formatIRType({ name: 'Number', nullable: false })).toBe('Number');
  });

  it('appends | null for nullable types', () => {
    expect(formatIRType({ name: 'String', nullable: true })).toBe('String | null');
  });

  it('formats generic types with inner type', () => {
    expect(formatIRType({ name: 'Array', generic: { name: 'String', nullable: false }, nullable: false })).toBe('Array<String>');
  });
});

// ------------------------------------------------------------------------------------------------
// Introspection (compiled IR)
// ------------------------------------------------------------------------------------------------

describe('listEntities', () => {
  it('returns entity summaries', async () => {
    const ir = await getEntityPropertiesIR();
    const entities = listEntities(ir);
    expect(entities.length).toBeGreaterThan(0);
    expect(entities[0]).toHaveProperty('name');
    expect(entities[0]).toHaveProperty('propertyCount');
  });

  it('returns empty for empty IR', () => {
    const ir = makeMinimalIR();
    expect(listEntities(ir)).toEqual([]);
  });
});

describe('describeEntity', () => {
  it('returns full entity detail', async () => {
    const ir = await getEntityPropertiesIR();
    const details = describeEntity(ir, 'User');
    expect(details).not.toBeNull();
    expect(details!.summary.name).toBe('User');
    expect(details!.properties.length).toBeGreaterThan(0);
  });

  it('returns null for unknown entity', () => {
    const ir = makeMinimalIR();
    expect(describeEntity(ir, 'DoesNotExist')).toBeNull();
  });
});

describe('describeCommand', () => {
  it('returns full command detail', async () => {
    const ir = await getCommandsIR();
    const details = describeCommand(ir, 'increment');
    expect(details).not.toBeNull();
    expect(details!.summary.name).toBe('increment');
  });

  it('returns null for unknown command', () => {
    const ir = makeMinimalIR();
    expect(describeCommand(ir, 'doesNotExist')).toBeNull();
  });
});

describe('listCommands', () => {
  it('returns command summaries', async () => {
    const ir = await getCommandsIR();
    const commands = listCommands(ir);
    expect(commands.length).toBeGreaterThan(0);
    expect(commands[0]).toHaveProperty('name');
  });
});

describe('getEntityRelationships', () => {
  it('includes outgoing relationships', async () => {
    const ir = await getRelationshipsIR();
    const graph = getEntityRelationships(ir, 'User');
    expect(graph.entity).toBe('User');
    expect(graph.relationships.some((r) => r.direction === 'outgoing' && r.target === 'Post')).toBe(true);
  });

  it('includes incoming relationships', async () => {
    const ir = await getRelationshipsIR();
    const graph = getEntityRelationships(ir, 'Post');
    expect(graph.relationships.some((r) => r.direction === 'incoming' && r.target === 'User')).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------
// Tool Definition Helpers
// ------------------------------------------------------------------------------------------------

describe('mangleToolName', () => {
  it('snake strategy: entity + command (entity lowercased, command case-preserved)', () => {
    expect(mangleToolName('Order', 'placeOrder', 'snake')).toBe('order_placeOrder');
  });

  it('snake strategy: no entity just lowercased command', () => {
    expect(mangleToolName(undefined, 'placeOrder', 'snake')).toBe('placeOrder');
  });

  it('dot strategy: entity.command', () => {
    expect(mangleToolName('Order', 'placeOrder', 'dot')).toBe('Order.placeOrder');
  });
});

describe('parseToolName', () => {
  it('round-trips snake mangled names', () => {
    const parsed = parseToolName('order_placeOrder');
    expect(parsed.entity).toBe('order');
    expect(parsed.command).toBe('placeOrder');
  });

  it('handles single-word names', () => {
    const parsed = parseToolName('placeorder');
    expect(parsed.command).toBe('placeorder');
    expect(parsed.entity).toBeUndefined();
  });
});

// ------------------------------------------------------------------------------------------------
// Tool Definitions (compiled IR)
// ------------------------------------------------------------------------------------------------

describe('toAnthropicTools', () => {
  it('generates tools from compiled IR', async () => {
    const ir = await getCommandsIR();
    const tools = toAnthropicTools(ir, { includeBuiltins: false });
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      expect(t).toHaveProperty('name');
      expect(t).toHaveProperty('description');
      expect(t.input_schema).toHaveProperty('type', 'object');
    }
  });

  it('filters commands with commandFilter', async () => {
    const ir = await getCommandsIR();
    const tools = toAnthropicTools(ir, {
      commandFilter: (c) => c.name === 'increment',
      includeBuiltins: false,
    });
    const names = tools.map((t) => t.name);
    expect(names).toContain('counter_increment');
    expect(names).not.toContain('counter_reset');
  });

  it('includes built-in tools by default', async () => {
    const ir = await getCommandsIR();
    const tools = toAnthropicTools(ir);
    const builtinNames = tools.map((t) => t.name).filter((n) => n.startsWith('manifest_'));
    expect(builtinNames.length).toBeGreaterThan(0);
  });
});

describe('toOpenAITools', () => {
  it('generates OpenAI function-calling format', async () => {
    const ir = await getCommandsIR();
    const tools = toOpenAITools(ir, { includeBuiltins: false });
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      expect(t.type).toBe('function');
      expect(t.function).toHaveProperty('name');
      expect(t.function).toHaveProperty('parameters');
    }
  });
});

describe('toVercelAITools', () => {
  it('generates Vercel AI SDK format as Record', async () => {
    const ir = await getCommandsIR();
    const tools = toVercelAITools(ir, { includeBuiltins: false });
    const names = Object.keys(tools);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(tools[name]).toHaveProperty('description');
      expect(tools[name]).toHaveProperty('parameters');
    }
  });
});

// ------------------------------------------------------------------------------------------------
// Intent mapping
// ------------------------------------------------------------------------------------------------

describe('tokenize', () => {
  it('splits text and removes stopwords', () => {
    const tokens = tokenize('Create a new order for the customer');
    expect(tokens).toContain('create');
    expect(tokens).toContain('order');
    expect(tokens).toContain('customer');
    expect(tokens).not.toContain('a');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('for');
  });

  it('returns empty array for stopword-only input', () => {
    const tokens = tokenize('the a an for and or but in on');
    expect(tokens).toEqual([]);
  });
});

describe('findMatchingCommands', () => {
  it('ranks command name tokens highest', async () => {
    const ir = await getOrderWithCommandsIR();
    const matches = findMatchingCommands(ir, 'place an order');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].command).toBe('placeOrder');
  });

  it('returns empty when minScore is high', async () => {
    const ir = await getOrderWithCommandsIR();
    const matches = findMatchingCommands(ir, 'zzz nonexistent stuff', { minScore: 10 });
    expect(matches.length).toBe(0);
  });

  it('produces deterministic (sorted) results', async () => {
    const ir = await getOrderWithCommandsIR();
    const first = findMatchingCommands(ir, 'order');
    const second = findMatchingCommands(ir, 'order');
    expect(first).toEqual(second);
  });
});

// ------------------------------------------------------------------------------------------------
// AgentRuntime
// ------------------------------------------------------------------------------------------------

const EMPTY_CONTEXT: RuntimeContext = { user: { id: 'test-user' } };

describe('AgentRuntime', () => {
  it('instantiates from RuntimeEngine', async () => {
    const ir = await getCommandsIR();
    const engine = new RuntimeEngine(ir, EMPTY_CONTEXT);
    const agent = new AgentRuntime(engine);
    expect(agent.ir).toBeDefined();
    expect(agent.builtinToolNames).toBeDefined();
    expect(agent.builtinToolNames).toHaveProperty('LIST_ENTITIES');
  });

  it('listEntities returns summaries', async () => {
    const ir = await getEntityPropertiesIR();
    const engine = new RuntimeEngine(ir, EMPTY_CONTEXT);
    const agent = new AgentRuntime(engine);
    const entities = agent.listEntities();
    expect(entities.length).toBe(1);
    expect(entities[0].name).toBe('User');
  });

  it('listEntities with module filter works', async () => {
    const ir = makeMinimalIR({
      modules: [{ name: 'core', entities: ['User'] }],
      entities: [{ name: 'User', module: 'core', properties: [], computedProperties: [], relationships: [], commands: [], constraints: [], policies: [] }],
    });
    const engine = new RuntimeEngine(ir, EMPTY_CONTEXT);
    const agent = new AgentRuntime(engine);
    const entities = agent.listEntities({ module: 'core' });
    expect(entities.length).toBe(1);
  });

  it('findCommands matches intent to commands', async () => {
    const ir = await getOrderWithCommandsIR();
    const engine = new RuntimeEngine(ir, EMPTY_CONTEXT);
    const agent = new AgentRuntime(engine);
    const matches = agent.findCommands('place');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].command).toBe('placeOrder');
  });

  it('describeCommand returns command details', async () => {
    const ir = await getCommandsIR();
    const engine = new RuntimeEngine(ir, EMPTY_CONTEXT);
    const agent = new AgentRuntime(engine);
    const details = agent.describeCommand('increment');
    expect(details).not.toBeNull();
    expect(details!.summary.name).toBe('increment');
  });

  it('getToolDefinitions returns anthropic format', async () => {
    const ir = await getCommandsIR();
    const engine = new RuntimeEngine(ir, EMPTY_CONTEXT);
    const agent = new AgentRuntime(engine);
    const tools = agent.getToolDefinitions('anthropic');
    expect(tools.length).toBeGreaterThan(0);
    expect(tools[0]).toHaveProperty('name');
    expect(tools[0]).toHaveProperty('input_schema');
  });

  it('getToolDefinitions returns openai format', async () => {
    const ir = await getCommandsIR();
    const engine = new RuntimeEngine(ir, EMPTY_CONTEXT);
    const agent = new AgentRuntime(engine);
    const tools = agent.getToolDefinitions('openai');
    expect(tools.length).toBeGreaterThan(0);
    expect(tools[0]).toHaveProperty('type', 'function');
  });

  it('getToolDefinitions returns vercel format', async () => {
    const ir = await getCommandsIR();
    const engine = new RuntimeEngine(ir, EMPTY_CONTEXT);
    const agent = new AgentRuntime(engine);
    const tools = agent.getToolDefinitions('vercel');
    expect(Object.keys(tools).length).toBeGreaterThan(0);
  });

  it('executeToolCall returns UNKNOWN_TOOL for unknown tools', async () => {
    const ir = await getCommandsIR();
    const engine = new RuntimeEngine(ir, EMPTY_CONTEXT);
    const agent = new AgentRuntime(engine);
    const result = await agent.executeToolCall({ name: 'completely_unknown_tool', arguments: {} });
    expect(result.success).toBe(false);
    expect(result.code).toBe('UNKNOWN_TOOL');
  });

  it('builtin tool names are prefixed with manifest_', async () => {
    const ir = await getCommandsIR();
    const engine = new RuntimeEngine(ir, EMPTY_CONTEXT);
    const agent = new AgentRuntime(engine);
    expect(agent.builtinToolNames.LIST_ENTITIES).toBe('manifest_list_entities');
    expect(agent.builtinToolNames.DESCRIBE_ENTITY).toBe('manifest_describe_entity');
    expect(agent.builtinToolNames.EXECUTE_COMMAND).toBe('manifest_execute_command');
    expect(agent.builtinToolNames.GET_INSTANCES).toBe('manifest_get_instances');
  });
});
