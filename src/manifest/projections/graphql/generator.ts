/**
 * GraphQL SDL projection for Manifest IR.
 *
 * Generates GraphQL schema definitions and resolver stubs from IR entities,
 * commands, policies, and events.
 *
 * Features:
 * - Entity types with typed fields
 * - Query type with list and detail resolvers per entity
 * - Mutation type with mutations mapped to commands
 * - Subscription type mapped to IR events
 * - Input types for command parameters
 * - @auth directives derived from entity/command policies
 * - Resolver stubs with runtime.runCommand for writes, direct DB for reads
 * - Enum type definitions from IR enums
 * - Custom scalar detection (DateTime, UUID, etc.)
 *
 * Surfaces:
 *   - graphql.schema → schema.graphql (complete SDL)
 *   - graphql.resolvers → resolvers.ts (TypeScript resolver stubs)
 *
 * Projections are TOOLING, not runtime semantics.
 * Reads MAY bypass runtime. Writes MUST use runtime.runCommand().
 */

import type {
  IR,
  IREntity,
  IRCommand,
  IRType,
  IRPolicy,
  IREvent,
  IREventField,
  IREnum,
  IRExpression,
  IRValue,
} from '../../ir';
import type {
  ProjectionTarget,
  ProjectionRequest,
  ProjectionResult,
  ProjectionDiagnostic,
  ProjectionArtifact,
} from '../interface';
import type { GraphQLProjectionOptions } from './types';
import { GRAPHQL_DESCRIPTOR_META } from './descriptor-meta.js';


// ============================================================================
// Surface identifiers
// ============================================================================

const SURFACE_SCHEMA = 'graphql.schema' as const;
const SURFACE_RESOLVERS = 'graphql.resolvers' as const;
const SURFACES = [SURFACE_SCHEMA, SURFACE_RESOLVERS] as const;

// ============================================================================
// Type mapping: IR type → GraphQL scalar/type
// ============================================================================

/** Set of scalars that require custom scalar declarations */
const CUSTOM_SCALAR_TYPES = new Set(['DateTime', 'UUID', 'JSON', 'Date', 'Email', 'URL']);

/**
 * Map a Manifest IR type name to a GraphQL type string.
 */
function irTypeToGraphQL(irType: IRType): string {
  // Handle generic types first
  if (irType.name === 'array' && irType.generic) {
    return `[${irTypeToGraphQL(irType.generic)}${irType.generic.nullable ? '' : '!'}]`;
  }

  if (irType.name === 'map' || irType.name === 'record' || irType.name === 'object') {
    return 'JSON';
  }

  const typeMap: Record<string, string> = {
    string: 'String',
    number: 'Float',
    integer: 'Int',
    int: 'Int',
    boolean: 'Boolean',
    bool: 'Boolean',
    date: 'Date',
    datetime: 'DateTime',
    uuid: 'UUID',
    email: 'String',
    url: 'String',
    uri: 'String',
    any: 'JSON',
  };

  return typeMap[irType.name] ?? 'String';
}

/**
 * Map an IR type to a GraphQL field type string, including nullability.
 */
function irTypeToFieldType(irType: IRType): string {
  const base = irTypeToGraphQL(irType);

  // Arrays already include inner nullability markers
  if (irType.name === 'array') {
    return irType.nullable ? base : `${base}!`;
  }

  return irType.nullable ? base : `${base}!`;
}

/**
 * Collect all custom scalars used across entity properties, commands, and events.
 */
function collectCustomScalars(ir: IR): Set<string> {
  const scalars = new Set<string>();

  function checkType(irType: IRType): void {
    const mapped = irTypeToGraphQL(irType);
    if (CUSTOM_SCALAR_TYPES.has(mapped)) {
      scalars.add(mapped);
    }
    if (irType.generic) {
      checkType(irType.generic);
    }
  }

  for (const entity of ir.entities) {
    for (const prop of entity.properties) {
      checkType(prop.type);
    }
    for (const computed of entity.computedProperties) {
      checkType(computed.type);
    }
  }

  for (const command of ir.commands) {
    for (const param of command.parameters) {
      checkType(param.type);
    }
    if (command.returns) {
      checkType(command.returns);
    }
  }

  for (const event of ir.events) {
    if (Array.isArray(event.payload)) {
      for (const field of event.payload) {
        checkType(field.type);
      }
    }
  }

  return scalars;
}

// ============================================================================
// Helpers
// ============================================================================

function toPascalCase(value: string): string {
  if (!value) return value;
  return value[0].toUpperCase() + value.slice(1);
}

function toCamelCase(value: string): string {
  if (!value) return value;
  return value[0].toLowerCase() + value.slice(1);
}

function pluralize(name: string): string {
  const lower = name.toLowerCase();
  if (
    lower.endsWith('s') ||
    lower.endsWith('sh') ||
    lower.endsWith('ch') ||
    lower.endsWith('x') ||
    lower.endsWith('z')
  ) {
    return name + 'es';
  }
  if (lower.endsWith('y') && !['a', 'e', 'i', 'o', 'u'].includes(lower[lower.length - 2])) {
    return name.slice(0, -1) + 'ies';
  }
  return name + 's';
}

/**
 * Convert an IRValue to a string representation for descriptions.
 */
function irValueToString(value: IRValue): string {
  switch (value.kind) {
    case 'string':
      return `"${value.value}"`;
    case 'number':
      return String(value.value);
    case 'boolean':
      return String(value.value);
    case 'null':
      return 'null';
    case 'array':
      return `[${value.elements.map(irValueToString).join(', ')}]`;
    case 'object': {
      const entries = Object.entries(value.properties).map(
        ([k, v]) => `${k}: ${irValueToString(v)}`,
      );
      return `{${entries.join(', ')}}`;
    }
  }
}

/**
 * Convert an IR expression to a human-readable string for descriptions.
 */
function expressionToString(expr: IRExpression): string {
  switch (expr.kind) {
    case 'literal':
      return irValueToString(expr.value);
    case 'identifier':
      return expr.name;
    case 'member':
      return `${expressionToString(expr.object)}.${expr.property}`;
    case 'binary':
      return `${expressionToString(expr.left)} ${expr.operator} ${expressionToString(expr.right)}`;
    case 'unary':
      return `${expr.operator}${expressionToString(expr.operand)}`;
    case 'call':
      return `${expressionToString(expr.callee)}(${expr.args.map(expressionToString).join(', ')})`;
    case 'conditional':
      return `${expressionToString(expr.condition)} ? ${expressionToString(expr.consequent)} : ${expressionToString(expr.alternate)}`;
    case 'array':
      return `[${expr.elements.map(expressionToString).join(', ')}]`;
    case 'object':
      return `{${expr.properties.map((p: { key: string; value: IRExpression }) => `${p.key}: ${expressionToString(p.value)}`).join(', ')}}`;
    case 'lambda':
      return `(${expr.params.join(', ')}) => ${expressionToString(expr.body)}`;
    default:
      return String(expr);
  }
}

/**
 * Escape a string for use in a GraphQL description (block string).
 */
function escapeDescription(text: string): string {
  return text.replace(/"""/g, '\\"""');
}

// ============================================================================
// Auth directive generation
// ============================================================================

/**
 * Derive an @auth directive string for an entity based on its policies.
 */
function buildAuthDirective(
  policyNames: string[],
  allPolicies: IRPolicy[],
  options: GraphQLProjectionOptions,
): string {
  if (options.includeAuthDirectives === false) return '';
  if (policyNames.length === 0) return '';

  // Resolve policy actions from policy names
  const actions = new Set<string>();
  for (const policyName of policyNames) {
    const policy = allPolicies.find((p) => p.name === policyName);
    if (policy) {
      actions.add(policy.action);
    }
  }

  if (actions.size === 0) return '';

  const actionsStr = Array.from(actions).sort().join(', ');
  return ` @auth(requires: [${actionsStr.toUpperCase()}])`;
}

// ============================================================================
// SDL generation
// ============================================================================

/**
 * Generate SDL for a single entity type.
 */
function generateEntityType(
  entity: IREntity,
  allPolicies: IRPolicy[],
  options: GraphQLProjectionOptions,
): string {
  const lines: string[] = [];

  // Type description
  const desc = entity.module
    ? `${entity.name} entity (module: ${entity.module})`
    : `${entity.name} entity`;
  lines.push(`"""${escapeDescription(desc)}"""`);

  // Type declaration with optional auth directive
  const authDir = buildAuthDirective(entity.policies, allPolicies, options);
  lines.push(`type ${entity.name}${authDir} {`);

  // Properties
  for (const prop of entity.properties) {
    const fieldType = irTypeToFieldType(prop.type);
    const descParts: string[] = [];
    if (prop.modifiers.includes('readonly')) descParts.push('Read-only');
    if (prop.modifiers.includes('unique')) descParts.push('Unique');
    if (prop.defaultValue !== undefined)
      descParts.push(`Default: ${irValueToString(prop.defaultValue)}`);

    const fieldDesc =
      descParts.length > 0 ? `  """${escapeDescription(descParts.join('. '))}"""\n` : '';
    lines.push(`${fieldDesc}  ${prop.name}: ${fieldType}`);
  }

  // Computed properties
  if (options.includeComputedProperties !== false) {
    for (const computed of entity.computedProperties) {
      const fieldType = irTypeToFieldType(computed.type);
      const exprStr = expressionToString(computed.expression);
      lines.push(`  """Computed: ${escapeDescription(exprStr)}"""`);
      lines.push(`  ${computed.name}: ${fieldType}`);
    }
  }

  // Relationships as fields
  for (const rel of entity.relationships) {
    switch (rel.kind) {
      case 'hasMany':
        lines.push(`  ${rel.name}: [${rel.target}!]!`);
        break;
      case 'hasOne':
      case 'belongsTo':
      case 'ref':
        lines.push(`  ${rel.name}: ${rel.target}`);
        break;
    }
  }

  lines.push('}');
  return lines.join('\n');
}

/**
 * Generate SDL for an enum type.
 */
function generateEnumType(irEnum: IREnum): string {
  const lines: string[] = [];
  lines.push(`"""${irEnum.name} enum"""`);
  lines.push(`enum ${irEnum.name} {`);
  for (const val of irEnum.values) {
    if (val.label) {
      lines.push(`  """${escapeDescription(val.label)}"""`);
    }
    lines.push(`  ${val.name}`);
  }
  lines.push('}');
  return lines.join('\n');
}

/**
 * Generate an input type for a command's parameters.
 */
function generateCommandInput(command: IRCommand): string | null {
  if (command.parameters.length === 0) return null;
  if (!command.entity) return null;

  const inputName = `${toPascalCase(command.entity)}${toPascalCase(command.name)}Input`;
  const lines: string[] = [];
  lines.push(`"""Input for ${command.entity}.${command.name} command"""`);
  lines.push(`input ${inputName} {`);

  for (const param of command.parameters) {
    const fieldType = irTypeToFieldType(param.type);
    // For input types: required params get !, optional get no !
    const actualType = param.required ? fieldType : fieldType.replace(/!$/, '');
    if (param.defaultValue !== undefined) {
      lines.push(`  """Default: ${escapeDescription(irValueToString(param.defaultValue))}"""`);
    }
    lines.push(`  ${param.name}: ${actualType}`);
  }

  lines.push('}');
  return lines.join('\n');
}

/**
 * Generate an event payload type for subscriptions.
 */
function generateEventPayloadType(event: IREvent): string {
  const typeName = `${toPascalCase(event.name)}Payload`;
  const lines: string[] = [];
  lines.push(`"""Payload for ${event.name} event (channel: ${event.channel})"""`);
  lines.push(`type ${typeName} {`);

  if (Array.isArray(event.payload)) {
    // Structured fields
    for (const field of event.payload as IREventField[]) {
      const fieldType = irTypeToFieldType(field.type);
      const actualType = field.required ? fieldType : fieldType.replace(/!$/, '');
      lines.push(`  ${field.name}: ${actualType}`);
    }
  } else {
    // Single type payload — wrap as `data` field
    const fieldType = irTypeToFieldType(event.payload as IRType);
    lines.push(`  data: ${fieldType}`);
  }

  lines.push('}');
  return lines.join('\n');
}

/**
 * Build the Query type from entities.
 */
function generateQueryType(entities: IREntity[]): string {
  if (entities.length === 0) return '';

  const lines: string[] = [];
  lines.push('type Query {');

  for (const entity of entities) {
    const camelName = toCamelCase(entity.name);
    const pluralName = toCamelCase(pluralize(entity.name));

    // List query
    lines.push(`  """List all ${entity.name} entities"""`);
    lines.push(`  ${pluralName}: [${entity.name}!]!`);

    // Detail query
    lines.push(`  """Get a single ${entity.name} by ID"""`);
    lines.push(`  ${camelName}(id: ID!): ${entity.name}`);
  }

  lines.push('}');
  return lines.join('\n');
}

/**
 * Build the Mutation type from commands.
 */
function generateMutationType(
  commands: IRCommand[],
  allPolicies: IRPolicy[],
  options: GraphQLProjectionOptions,
): string {
  const entityCommands = commands.filter((c) => c.entity);
  if (entityCommands.length === 0) return '';

  const lines: string[] = [];
  lines.push('type Mutation {');

  for (const command of entityCommands) {
    const mutationName = `${toCamelCase(command.entity!)}${toPascalCase(command.name)}`;
    const returnType = command.entity!;

    // Build description
    const descParts: string[] = [];
    descParts.push(`Execute ${command.name} on ${command.entity}`);

    if (options.includeGuardDescriptions !== false && command.guards.length > 0) {
      descParts.push(`Guards: ${command.guards.length} guard(s) evaluated in order`);
    }
    if (
      options.includeConstraintDescriptions !== false &&
      command.constraints &&
      command.constraints.length > 0
    ) {
      descParts.push(`Constraints: ${command.constraints.length} pre-execution constraint(s)`);
    }

    // Policy-based auth directive
    const commandPolicies = command.policies ?? [];
    const authDir = buildAuthDirective(commandPolicies, allPolicies, options);

    const desc = descParts.join('. ');
    lines.push(`  """${escapeDescription(desc)}"""`);

    // Build arguments
    if (command.parameters.length > 0) {
      const inputName = `${toPascalCase(command.entity!)}${toPascalCase(command.name)}Input`;
      lines.push(`  ${mutationName}(input: ${inputName}!): ${returnType}${authDir}`);
    } else {
      lines.push(`  ${mutationName}: ${returnType}${authDir}`);
    }
  }

  lines.push('}');
  return lines.join('\n');
}

/**
 * Build the Subscription type from events.
 */
function generateSubscriptionType(events: IREvent[]): string {
  if (events.length === 0) return '';

  const lines: string[] = [];
  lines.push('type Subscription {');

  for (const event of events) {
    const fieldName = toCamelCase(event.name);
    const payloadType = `${toPascalCase(event.name)}Payload`;
    lines.push(`  """Subscribe to ${event.name} events (channel: ${event.channel})"""`);
    lines.push(`  ${fieldName}: ${payloadType}!`);
  }

  lines.push('}');
  return lines.join('\n');
}

// ============================================================================
// Full schema assembly
// ============================================================================

/**
 * Build the complete GraphQL SDL from IR.
 */
function buildGraphQLSchema(
  ir: IR,
  options: GraphQLProjectionOptions,
): { sdl: string; diagnostics: ProjectionDiagnostic[] } {
  const diagnostics: ProjectionDiagnostic[] = [];
  const sections: string[] = [];

  // Sort for determinism
  const sortedEntities = [...ir.entities].sort((a, b) => a.name.localeCompare(b.name));
  const sortedCommands = [...ir.commands].sort((a, b) => {
    const aKey = `${a.entity ?? ''}.${a.name}`;
    const bKey = `${b.entity ?? ''}.${b.name}`;
    return aKey.localeCompare(bKey);
  });
  const sortedEvents = [...ir.events].sort((a, b) => a.name.localeCompare(b.name));
  const sortedEnums = [...ir.enums].sort((a, b) => a.name.localeCompare(b.name));

  // Header comment
  sections.push('# Generated by Manifest GraphQL Projection');
  sections.push('# Do not edit manually — regenerate from IR');

  // Custom scalars
  const customScalars = collectCustomScalars(ir);
  if (options.customScalars) {
    for (const name of Object.keys(options.customScalars)) {
      customScalars.add(name);
    }
  }
  if (customScalars.size > 0) {
    const scalarLines = Array.from(customScalars)
      .sort()
      .map((s) => `scalar ${s}`);
    sections.push(scalarLines.join('\n'));
  }

  // Auth directive definition (if policies exist and auth directives enabled)
  if (options.includeAuthDirectives !== false) {
    const hasPolicies =
      ir.policies.length > 0 ||
      ir.entities.some((e) => e.policies.length > 0) ||
      ir.commands.some((c) => c.policies && c.policies.length > 0);

    if (hasPolicies) {
      sections.push('directive @auth(requires: [String!]!) on OBJECT | FIELD_DEFINITION');
    }
  }

  // Enum types
  if (options.includeEnums !== false) {
    for (const irEnum of sortedEnums) {
      sections.push(generateEnumType(irEnum));
    }
  }

  // Entity types
  for (const entity of sortedEntities) {
    sections.push(generateEntityType(entity, ir.policies, options));
  }

  // Event payload types (before subscription type)
  if (options.includeSubscriptions !== false) {
    for (const event of sortedEvents) {
      sections.push(generateEventPayloadType(event));
    }
  }

  // Input types for commands
  if (options.includeInputTypes !== false) {
    for (const command of sortedCommands) {
      if (!command.entity) {
        diagnostics.push({
          severity: 'warning',
          code: 'COMMAND_NO_ENTITY',
          message: `Command "${command.name}" has no entity — skipped in GraphQL schema.`,
        });
        continue;
      }
      const inputType = generateCommandInput(command);
      if (inputType) {
        sections.push(inputType);
      }
    }
  }

  // Query type
  const queryType = generateQueryType(sortedEntities);
  if (queryType) {
    sections.push(queryType);
  }

  // Mutation type
  const mutationType = generateMutationType(sortedCommands, ir.policies, options);
  if (mutationType) {
    sections.push(mutationType);
  }

  // Subscription type
  if (options.includeSubscriptions !== false) {
    const subscriptionType = generateSubscriptionType(sortedEvents);
    if (subscriptionType) {
      sections.push(subscriptionType);
    }
  }

  const sdl = sections.join('\n\n') + '\n';
  return { sdl, diagnostics };
}

// ============================================================================
// Resolver stub generation
// ============================================================================

/**
 * Build TypeScript resolver stubs from IR.
 */
function buildResolverStubs(
  ir: IR,
  options: GraphQLProjectionOptions,
): { code: string; diagnostics: ProjectionDiagnostic[] } {
  const diagnostics: ProjectionDiagnostic[] = [];
  const runtimeImport = options.runtimeImportPath ?? '@/lib/manifest-runtime';
  const dbImport = options.databaseImportPath ?? '@/lib/database';

  const sortedEntities = [...ir.entities].sort((a, b) => a.name.localeCompare(b.name));
  const sortedCommands = [...ir.commands].sort((a, b) => {
    const aKey = `${a.entity ?? ''}.${a.name}`;
    const bKey = `${b.entity ?? ''}.${b.name}`;
    return aKey.localeCompare(bKey);
  });
  const sortedEvents = [...ir.events].sort((a, b) => a.name.localeCompare(b.name));

  const lines: string[] = [];

  // Header
  lines.push('/**');
  lines.push(' * Generated GraphQL resolver stubs from Manifest IR.');
  lines.push(' * Reads use direct database queries for performance.');
  lines.push(' * Writes use runtime.runCommand() to preserve policy/guard/constraint semantics.');
  lines.push(' */');
  lines.push('');
  lines.push(`import { createManifestRuntime } from '${runtimeImport}';`);
  lines.push(`import { database } from '${dbImport}';`);

  if (sortedEvents.length > 0 && options.includeSubscriptions !== false) {
    lines.push("import { PubSub } from 'graphql-subscriptions';");
    lines.push('');
    lines.push('const pubsub = new PubSub();');
  }

  lines.push('');

  // Query resolvers
  if (sortedEntities.length > 0) {
    lines.push('export const queryResolvers = {');

    for (const entity of sortedEntities) {
      const camelName = toCamelCase(entity.name);
      const pluralName = toCamelCase(pluralize(entity.name));
      const tableName = toCamelCase(entity.name);

      lines.push(
        `  ${pluralName}: async (_parent: unknown, _args: unknown, context: unknown) => {`,
      );
      lines.push(`    return database.${tableName}.findMany();`);
      lines.push('  },');
      lines.push('');
      lines.push(
        `  ${camelName}: async (_parent: unknown, args: { id: string }, context: unknown) => {`,
      );
      lines.push(`    return database.${tableName}.findUnique({ where: { id: args.id } });`);
      lines.push('  },');
      lines.push('');
    }

    lines.push('};');
    lines.push('');
  }

  // Mutation resolvers
  const entityCommands = sortedCommands.filter((c) => c.entity);
  if (entityCommands.length > 0) {
    lines.push('export const mutationResolvers = {');

    for (const command of entityCommands) {
      const mutationName = `${toCamelCase(command.entity!)}${toPascalCase(command.name)}`;
      const hasInput = command.parameters.length > 0;
      const inputType = hasInput ? `{ input: Record<string, unknown> }` : 'unknown';

      lines.push(
        `  ${mutationName}: async (_parent: unknown, args: ${inputType}, context: unknown) => {`,
      );
      lines.push(`    const runtime = createManifestRuntime(context);`);

      if (hasInput) {
        lines.push(
          `    return runtime.runCommand('${command.entity}', '${command.name}', args.input);`,
        );
      } else {
        lines.push(`    return runtime.runCommand('${command.entity}', '${command.name}', {});`);
      }

      lines.push('  },');
      lines.push('');
    }

    lines.push('};');
    lines.push('');
  }

  // Subscription resolvers
  if (sortedEvents.length > 0 && options.includeSubscriptions !== false) {
    lines.push('export const subscriptionResolvers = {');

    for (const event of sortedEvents) {
      const fieldName = toCamelCase(event.name);
      lines.push(`  ${fieldName}: {`);
      lines.push(`    subscribe: () => pubsub.asyncIterableIterator('${event.channel}'),`);
      lines.push('  },');
      lines.push('');
    }

    lines.push('};');
    lines.push('');
  }

  // Combined resolvers export
  lines.push('export const resolvers = {');
  if (sortedEntities.length > 0) {
    lines.push('  Query: queryResolvers,');
  }
  if (entityCommands.length > 0) {
    lines.push('  Mutation: mutationResolvers,');
  }
  if (sortedEvents.length > 0 && options.includeSubscriptions !== false) {
    lines.push('  Subscription: subscriptionResolvers,');
  }
  lines.push('};');
  lines.push('');

  return { code: lines.join('\n'), diagnostics };
}

// ============================================================================
// Projection implementation
// ============================================================================

/**
 * GraphQL SDL + resolver stubs projection.
 *
 * Generates GraphQL schema definitions and resolver stubs from Manifest IR.
 *
 * Surfaces:
 *   - graphql.schema → schema.graphql (SDL)
 *   - graphql.resolvers → resolvers.ts (TypeScript resolver stubs)
 */
export class GraphQLProjection implements ProjectionTarget {
  readonly name = 'graphql';
  readonly description =
    'GraphQL SDL and resolver stub generation from Manifest IR entities, commands, policies, and events';
  readonly surfaces = SURFACES;
  readonly descriptorMeta = GRAPHQL_DESCRIPTOR_META;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const options = (request.options ?? {}) as GraphQLProjectionOptions;

    switch (request.surface) {
      case SURFACE_SCHEMA: {
        const { sdl, diagnostics } = buildGraphQLSchema(ir, options);

        const artifact: ProjectionArtifact = {
          id: 'graphql.schema',
          pathHint: 'schema.graphql',
          contentType: 'graphql',
          code: sdl,
        };

        return { artifacts: [artifact], diagnostics };
      }

      case SURFACE_RESOLVERS: {
        if (options.includeResolverStubs === false) {
          return {
            artifacts: [],
            diagnostics: [
              {
                severity: 'info',
                code: 'RESOLVERS_DISABLED',
                message: 'Resolver stub generation is disabled via includeResolverStubs: false.',
              },
            ],
          };
        }

        const { code, diagnostics } = buildResolverStubs(ir, options);

        const artifact: ProjectionArtifact = {
          id: 'graphql.resolvers',
          pathHint: 'resolvers.ts',
          contentType: 'typescript',
          code,
        };

        return { artifacts: [artifact], diagnostics };
      }

      default:
        return {
          artifacts: [],
          diagnostics: [
            {
              severity: 'error',
              code: 'UNKNOWN_SURFACE',
              message: `Unknown surface: "${request.surface}". Available: graphql.schema, graphql.resolvers`,
            },
          ],
        };
    }
  }
}

// Re-export types
export type { GraphQLProjectionOptions } from './types';
