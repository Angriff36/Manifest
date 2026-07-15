/**
 * OpenAPI 3.1 projection for Manifest IR.
 *
 * Generates a complete OpenAPI 3.1.0 specification from Manifest IR entities,
 * commands, and routes with JSON Schema-typed request/response bodies.
 *
 * Features:
 * - Entity CRUD operations (GET list, GET detail, POST create via commands)
 * - Command POST endpoints with typed request/response bodies
 * - Security schemes for auth integration
 * - Constraint error response shapes
 * - Operation IDs derived from entity/command names
 * - JSON Schema types for all properties
 *
 * Surfaces:
 *   - openapi.spec → openapi.json (complete OpenAPI 3.1.0 spec)
 *
 * See docs/spec/manifest-vnext.md for route derivation rules.
 */

import type {
  IR,
  IREntity,
  IRCommand,
  IRType,
  IRPolicy,
  IRExpression,
  IRValue,
  IRValueObject,
} from '../../ir';
import type {
  ProjectionTarget,
  ProjectionRequest,
  ProjectionResult,
  ProjectionDiagnostic,
  ProjectionArtifact,
} from '../interface';
import type { OpenApiProjectionOptions } from './types';
import { OPENAPI_DESCRIPTOR_META } from './descriptor-meta.js';


// ============================================================================
// OpenAPI 3.1 Types (inline to avoid external dependencies)
// ============================================================================

/** JSON Schema type used within OpenAPI 3.1 */
interface JsonSchema {
  type?: string | string[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  required?: string[];
  nullable?: boolean;
  format?: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  readOnly?: boolean;
  writeOnly?: boolean;
  $ref?: string;
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  anyOf?: JsonSchema[];
}

/** OpenAPI 3.1 Operation Object (simplified) */
interface OpenApiOperation {
  operationId: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Array<{
    name: string;
    in: string;
    required?: boolean;
    schema: JsonSchema;
    description?: string;
  }>;
  requestBody?: {
    content: Record<string, { schema: JsonSchema }>;
    required?: boolean;
    description?: string;
  };
  responses: Record<
    string,
    {
      description: string;
      content?: Record<string, { schema: JsonSchema }>;
    }
  >;
  security?: Array<Record<string, string[]>> | null;
  deprecated?: boolean;
}

// ============================================================================
// Surface identifiers
// ============================================================================

const SURFACE_SPEC = 'openapi.spec' as const;
const SURFACES = [SURFACE_SPEC] as const;

// ============================================================================
// Type mapping: IR type → JSON Schema
// ============================================================================

/**
 * Map a Manifest IR type to a JSON Schema object.
 *
 * @param irType - The IR type to map.
 * @param valueObjectMap - Lookup of known IRValueObject definitions.  When the
 *   type name matches an entry, a `$ref` to `#/components/schemas/{name}` is
 *   returned instead of the generic `{ type: 'string' }` fallback.
 */
function irTypeToJsonSchema(
  irType: IRType,
  valueObjectMap?: Map<string, IRValueObject>,
): JsonSchema {
  const base: JsonSchema = {};

  // Map generic types first (array, map, etc.)
  if (irType.name === 'array' && irType.generic) {
    base.type = 'array';
    base.items = irTypeToJsonSchema(irType.generic, valueObjectMap);
    return base;
  }

  if (irType.name === 'map' && irType.generic) {
    base.type = 'object';
    base.additionalProperties = irTypeToJsonSchema(irType.generic, valueObjectMap);
    return base;
  }

  if (irType.name === 'record') {
    base.type = 'object';
    base.additionalProperties = true;
    return base;
  }

  // Scalar type mapping
  const typeMap: Record<string, JsonSchema> = {
    string: { type: 'string' },
    number: { type: 'number' },
    integer: { type: 'integer' },
    int: { type: 'integer' },
    boolean: { type: 'boolean' },
    bool: { type: 'boolean' },
    date: { type: 'string', format: 'date' },
    datetime: { type: 'string', format: 'date-time' },
    timestamp: { type: 'string', format: 'date-time' }, // alias of datetime
    uuid: { type: 'string', format: 'uuid' },
    email: { type: 'string', format: 'email' },
    url: { type: 'string', format: 'uri' },
    uri: { type: 'string', format: 'uri' },
    any: {},
    object: { type: 'object', additionalProperties: true },
    // Native json type: a JSON document — object-shaped for OpenAPI consumers
    // (previously fell through the unknown-type branch and emitted string).
    json: { type: 'object', additionalProperties: true },
  };

  const mapped = typeMap[irType.name];
  if (mapped) {
    Object.assign(base, mapped);
  } else if (valueObjectMap?.has(irType.name)) {
    // Value-object type: reference the component schema by name.
    // The schema itself is registered in components/schemas by buildOpenApiSpec.
    return { $ref: `#/components/schemas/${irType.name}` };
  } else {
    // Unknown type — treat as string
    base.type = 'string';
  }

  return base;
}

/**
 * Map an IR type to a JSON Schema, handling nullable.
 */
function irTypeToSchema(irType: IRType, valueObjectMap?: Map<string, IRValueObject>): JsonSchema {
  const schema = irTypeToJsonSchema(irType, valueObjectMap);
  if (irType.nullable) {
    // OpenAPI 3.1 uses type arrays for nullable
    if (schema.type && typeof schema.type === 'string') {
      schema.type = [schema.type, 'null'];
    } else if (!schema.type) {
      // any type stays open (covers $ref and {} schemas)
    }
  }
  return schema;
}

// ============================================================================
// Helpers
// ============================================================================

function toEntitySegment(name: string): string {
  return name.toLowerCase();
}

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function toPascalCase(value: string): string {
  if (!value) return value;
  return value[0].toUpperCase() + value.slice(1);
}

function toCamelCase(value: string): string {
  if (!value) return value;
  return value[0].toLowerCase() + value.slice(1);
}

function pluralize(name: string): string {
  if (
    name.endsWith('s') ||
    name.endsWith('sh') ||
    name.endsWith('ch') ||
    name.endsWith('x') ||
    name.endsWith('z')
  ) {
    return name + 'es';
  }
  if (name.endsWith('y') && !['a', 'e', 'i', 'o', 'u'].includes(name[name.length - 2])) {
    return name.slice(0, -1) + 'ies';
  }
  return name + 's';
}

/**
 * Convert an IRValue default to a JSON-compatible value.
 */
function irValueToJson(value: IRValue): unknown {
  switch (value.kind) {
    case 'string':
      return value.value;
    case 'number':
      return value.value;
    case 'boolean':
      return value.value;
    case 'null':
      return null;
    case 'array':
      return value.elements.map(irValueToJson);
    case 'object': {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value.properties)) {
        obj[k] = irValueToJson(v);
      }
      return obj;
    }
  }
}

// ============================================================================
// Schema generation
// ============================================================================

/**
 * Build a JSON Schema for a value object's properties (registered in
 * components/schemas so entity/command schemas can reference it via $ref).
 */
function buildValueObjectSchema(
  vo: IRValueObject,
  valueObjectMap: Map<string, IRValueObject>,
): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const prop of vo.properties) {
    const schema = irTypeToSchema(prop.type, valueObjectMap);
    properties[prop.name] = schema;
    if (prop.modifiers.includes('required')) {
      required.push(prop.name);
    }
  }

  const schema: JsonSchema = {
    type: 'object',
    properties,
    additionalProperties: false,
  };

  if (required.length > 0) {
    schema.required = required;
  }

  return schema;
}

/**
 * Build a JSON Schema for an entity's properties (for response bodies).
 */
function buildEntitySchema(
  entity: IREntity,
  _options?: OpenApiProjectionOptions,
  valueObjectMap?: Map<string, IRValueObject>,
): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const prop of entity.properties) {
    const schema = irTypeToSchema(prop.type, valueObjectMap);
    if (prop.defaultValue !== undefined) {
      schema.default = irValueToJson(prop.defaultValue);
    }
    if (prop.modifiers.includes('readonly')) {
      schema.readOnly = true;
    }
    properties[prop.name] = schema;
    if (prop.modifiers.includes('required')) {
      required.push(prop.name);
    }
  }

  // Include computed properties as readOnly
  for (const computed of entity.computedProperties) {
    const schema = irTypeToSchema(computed.type, valueObjectMap);
    schema.readOnly = true;
    schema.description = `Computed: ${expressionToString(computed.expression)}`;
    properties[computed.name] = schema;
  }

  const schema: JsonSchema = {
    type: 'object',
    properties,
    additionalProperties: false,
  };

  if (required.length > 0) {
    schema.required = required;
  }

  return schema;
}

/**
 * Build a JSON Schema for creating/updating an entity (request body).
 * Excludes readOnly properties and computed properties.
 */
function buildEntityWriteSchema(
  entity: IREntity,
  valueObjectMap?: Map<string, IRValueObject>,
): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const prop of entity.properties) {
    // Skip readOnly in write schemas
    if (prop.modifiers.includes('readonly')) continue;

    const schema = irTypeToSchema(prop.type, valueObjectMap);
    if (prop.defaultValue !== undefined) {
      schema.default = irValueToJson(prop.defaultValue);
    }
    properties[prop.name] = schema;
    if (prop.modifiers.includes('required')) {
      required.push(prop.name);
    }
  }

  const schema: JsonSchema = {
    type: 'object',
    properties,
    additionalProperties: false,
  };

  if (required.length > 0) {
    schema.required = required;
  }

  return schema;
}

/**
 * Build a JSON Schema for command parameters (request body).
 */
function buildCommandRequestSchema(
  command: IRCommand,
  valueObjectMap?: Map<string, IRValueObject>,
): JsonSchema {
  if (command.parameters.length === 0) {
    return { type: 'object', properties: {}, additionalProperties: false };
  }

  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const param of command.parameters) {
    const schema = irTypeToSchema(param.type, valueObjectMap);
    if (param.defaultValue !== undefined) {
      schema.default = irValueToJson(param.defaultValue);
    }
    properties[param.name] = schema;
    if (param.required) {
      required.push(param.name);
    }
  }

  const schema: JsonSchema = {
    type: 'object',
    properties,
    additionalProperties: false,
  };

  if (required.length > 0) {
    schema.required = required;
  }

  return schema;
}

// ============================================================================
// Constraint error schema
// ============================================================================

/**
 * Build the standard constraint error response schema.
 */
function buildConstraintErrorSchema(): JsonSchema {
  return {
    type: 'object',
    properties: {
      error: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Machine-readable error code' },
          message: { type: 'string', description: 'Human-readable error message' },
          constraintViolations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                code: { type: 'string', description: 'Constraint code' },
                constraintName: { type: 'string', description: 'Constraint name' },
                severity: { type: 'string', enum: ['ok', 'warn', 'block'] },
                message: { type: 'string', description: 'Constraint violation message' },
                passed: { type: 'boolean', description: 'Whether constraint passed' },
                expression: { type: 'string', description: 'Constraint expression that failed' },
              },
              required: ['code', 'constraintName', 'severity', 'passed'],
            },
          },
        },
        required: ['code', 'message'],
      },
    },
    required: ['error'],
  };
}

/**
 * Build the guard failure response schema.
 */
function buildGuardFailureSchema(): JsonSchema {
  return {
    type: 'object',
    properties: {
      error: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Guard failure code' },
          message: { type: 'string', description: 'Which guard failed' },
          guardIndex: { type: 'integer', description: 'Index of the failing guard' },
          expression: { type: 'string', description: 'Guard expression that evaluated to false' },
        },
        required: ['code', 'message'],
      },
    },
    required: ['error'],
  };
}

/**
 * Build the concurrency conflict response schema.
 */
function buildConcurrencyConflictSchema(): JsonSchema {
  return {
    type: 'object',
    properties: {
      error: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Conflict code' },
          message: { type: 'string', description: 'Conflict description' },
          entityType: { type: 'string' },
          entityId: { type: 'string' },
          expectedVersion: { type: 'integer' },
          actualVersion: { type: 'integer' },
        },
        required: ['code', 'message'],
      },
    },
    required: ['error'],
  };
}

// ============================================================================
// Expression to string (for descriptions)
// ============================================================================

/**
 * Convert an IR expression to a human-readable string.
 */
function expressionToString(expr: IRExpression): string {
  switch (expr.kind) {
    case 'literal':
      return JSON.stringify(irValueToJson(expr.value));
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

// ============================================================================
// Operation generation
// ============================================================================

/**
 * Build standard error responses for operations.
 */
function buildStandardResponses(
  options: OpenApiProjectionOptions,
  entityName?: string,
): Record<string, { description: string; content?: Record<string, { schema: JsonSchema }> }> {
  const responses: Record<
    string,
    { description: string; content?: Record<string, { schema: JsonSchema }> }
  > = {
    '401': {
      description: 'Unauthorized — authentication required',
    },
    '403': {
      description: 'Forbidden — insufficient permissions',
    },
    '500': {
      description: 'Internal server error',
    },
  };

  if (options.includeConstraintErrors !== false && entityName) {
    responses['422'] = {
      description: 'Unprocessable entity — constraint violation',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ConstraintErrorResponse' },
        },
      },
    };

    responses['409'] = {
      description: 'Conflict — concurrency conflict or guard failure',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/GuardFailureResponse' },
        },
      },
    };
  }

  return responses;
}

/**
 * Derive security requirements for an operation based on entity policies.
 */
function deriveSecurityRequirements(
  entity: IREntity,
  _allPolicies: IRPolicy[],
  options: OpenApiProjectionOptions,
): Array<Record<string, string[]>> | undefined {
  if (options.includeAuth === false) return undefined;
  if (options.includePolicySecurity === false) return undefined;
  if (!options.securitySchemes || Object.keys(options.securitySchemes).length === 0)
    return undefined;

  // If the entity has policies, operations require security
  if (entity.policies.length > 0 || (entity.defaultPolicies && entity.defaultPolicies.length > 0)) {
    const schemeNames = Object.keys(options.securitySchemes);
    if (schemeNames.length > 0) {
      return [{ [schemeNames[0]]: [] }];
    }
  }

  return undefined;
}

/**
 * Generate GET /{entity}/list operation.
 */
function buildListOperation(
  entity: IREntity,
  basePath: string,
  options: OpenApiProjectionOptions,
  allPolicies: IRPolicy[],
): { path: string; operation: OpenApiOperation } {
  const segment = toEntitySegment(entity.name);
  const path = `${basePath}/${segment}/list`;

  const security = deriveSecurityRequirements(entity, allPolicies, options);

  const responses: Record<
    string,
    { description: string; content?: Record<string, { schema: JsonSchema }> }
  > = {
    '200': {
      description: `List of ${entity.name} entities`,
      content: {
        'application/json': {
          schema: {
            type: 'array',
            items: { $ref: `#/components/schemas/${entity.name}` },
          },
        },
      },
    },
    ...buildStandardResponses(options, entity.name),
  };

  return {
    path,
    operation: {
      operationId: `list${pluralize(entity.name)}`,
      summary: `List all ${toEntitySegment(pluralize(entity.name))}`,
      tags: [entity.name],
      responses,
      ...(security ? { security } : {}),
    },
  };
}

/**
 * Generate GET /{entity}/:id operation.
 */
function buildGetOperation(
  entity: IREntity,
  basePath: string,
  options: OpenApiProjectionOptions,
  allPolicies: IRPolicy[],
): { path: string; operation: OpenApiOperation } {
  const segment = toEntitySegment(entity.name);
  const path = `${basePath}/${segment}/{id}`;

  const security = deriveSecurityRequirements(entity, allPolicies, options);

  const responses: Record<
    string,
    { description: string; content?: Record<string, { schema: JsonSchema }> }
  > = {
    '200': {
      description: `A single ${entity.name} entity`,
      content: {
        'application/json': {
          schema: { $ref: `#/components/schemas/${entity.name}` },
        },
      },
    },
    '404': {
      description: `${entity.name} not found`,
    },
    ...buildStandardResponses(options, entity.name),
  };

  return {
    path,
    operation: {
      operationId: `get${entity.name}`,
      summary: `Get a ${entity.name} by ID`,
      tags: [entity.name],
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: `Unique identifier of the ${entity.name}`,
        },
      ],
      responses,
      ...(security ? { security } : {}),
    },
  };
}

/**
 * Generate POST command operation.
 */
function buildCommandOperation(
  command: IRCommand,
  entity: IREntity | undefined,
  basePath: string,
  options: OpenApiProjectionOptions,
  allPolicies: IRPolicy[],
  valueObjectMap?: Map<string, IRValueObject>,
): { path: string; operation: OpenApiOperation } | null {
  if (!command.entity) return null;

  const segment = toEntitySegment(command.entity);
  const commandSegment = toKebabCase(command.name);
  const path = `${basePath}/${segment}/${commandSegment}`;

  const security = entity ? deriveSecurityRequirements(entity, allPolicies, options) : undefined;

  // Build request body
  const requestSchema = buildCommandRequestSchema(command, valueObjectMap);

  // Build response
  const responseSchema = command.returns
    ? irTypeToSchema(command.returns, valueObjectMap)
    : entity
      ? { $ref: `#/components/schemas/${entity.name}` }
      : { type: 'object', additionalProperties: true };

  const responses: Record<
    string,
    { description: string; content?: Record<string, { schema: JsonSchema }> }
  > = {
    '200': {
      description: `Result of ${command.name} command`,
      content: {
        'application/json': {
          schema: responseSchema,
        },
      },
    },
    ...buildStandardResponses(options, command.entity),
  };

  // Build description from guards/constraints
  const descParts: string[] = [];
  if (command.guards.length > 0) {
    descParts.push(`Guards: ${command.guards.length} guard(s) evaluated in order.`);
  }
  if (command.constraints && command.constraints.length > 0) {
    descParts.push(`Constraints: ${command.constraints.length} pre-execution constraint(s).`);
  }

  return {
    path,
    operation: {
      operationId: `${toCamelCase(command.entity)}${toPascalCase(command.name)}`,
      summary: `Execute ${command.name} on ${command.entity}`,
      description: descParts.length > 0 ? descParts.join(' ') : undefined,
      tags: [command.entity],
      requestBody: {
        content: {
          'application/json': {
            schema: requestSchema,
          },
        },
        required: true,
        description: `Parameters for ${command.name} command`,
      },
      responses,
      ...(security ? { security } : {}),
    },
  };
}

// ============================================================================
// Full spec assembly
// ============================================================================

/**
 * Build the complete OpenAPI 3.1.0 spec from IR.
 */
function buildOpenApiSpec(
  ir: IR,
  options: OpenApiProjectionOptions,
): { spec: Record<string, unknown>; diagnostics: ProjectionDiagnostic[] } {
  const diagnostics: ProjectionDiagnostic[] = [];
  const basePath = options.basePath ?? '/api';
  const includeConstraintErrors = options.includeConstraintErrors !== false;

  // Build entity lookup
  const entityByName = new Map<string, IREntity>();
  for (const entity of ir.entities) {
    entityByName.set(entity.name, entity);
  }

  // Build value-object lookup so type-mapping functions can emit $ref instead
  // of the generic { type: 'string' } fallback.
  const valueObjectMap = new Map<string, IRValueObject>((ir.values ?? []).map((v) => [v.name, v]));

  // Build title
  const title =
    options.info?.title ??
    (ir.modules.length > 0 && ir.modules[0].name
      ? `${toPascalCase(ir.modules[0].name)} API`
      : 'Manifest API');
  const version = options.info?.version ?? ir.provenance.schemaVersion ?? '1.0.0';

  // Collect all paths
  const paths: Record<string, Record<string, OpenApiOperation>> = {};

  // Sort entities and commands for determinism
  const sortedEntities = [...ir.entities].sort((a, b) => a.name.localeCompare(b.name));
  const sortedCommands = [...ir.commands].sort((a, b) => {
    const aKey = `${a.entity ?? ''}.${a.name}`;
    const bKey = `${b.entity ?? ''}.${b.name}`;
    return aKey.localeCompare(bKey);
  });

  // Generate entity read operations (GET list + GET detail)
  for (const entity of sortedEntities) {
    const listOp = buildListOperation(entity, basePath, options, ir.policies);
    if (!paths[listOp.path]) paths[listOp.path] = {};
    paths[listOp.path].get = listOp.operation;

    const getOp = buildGetOperation(entity, basePath, options, ir.policies);
    if (!paths[getOp.path]) paths[getOp.path] = {};
    paths[getOp.path].get = getOp.operation;
  }

  // Generate command operations (POST)
  for (const command of sortedCommands) {
    if (!command.entity) {
      diagnostics.push({
        severity: 'warning',
        code: 'COMMAND_NO_ENTITY',
        message: `Command "${command.name}" has no entity — skipped in OpenAPI spec.`,
      });
      continue;
    }

    const entity = entityByName.get(command.entity);
    const cmdOp = buildCommandOperation(
      command,
      entity,
      basePath,
      options,
      ir.policies,
      valueObjectMap,
    );
    if (cmdOp) {
      if (!paths[cmdOp.path]) paths[cmdOp.path] = {};
      paths[cmdOp.path].post = cmdOp.operation;
    }
  }

  // Build schemas in components
  const schemas: Record<string, JsonSchema> = {};

  // Register value object schemas first so entity schemas can reference them
  for (const vo of ir.values ?? []) {
    schemas[vo.name] = buildValueObjectSchema(vo, valueObjectMap);
  }

  for (const entity of sortedEntities) {
    schemas[entity.name] = buildEntitySchema(entity, options, valueObjectMap);
    schemas[`${entity.name}Write`] = buildEntityWriteSchema(entity, valueObjectMap);
  }

  for (const command of sortedCommands) {
    if (command.parameters.length > 0 && command.entity) {
      schemas[`${toPascalCase(command.entity)}${toPascalCase(command.name)}Request`] =
        buildCommandRequestSchema(command, valueObjectMap);
    }
  }

  // Add error response schemas
  if (includeConstraintErrors) {
    schemas['ConstraintErrorResponse'] = buildConstraintErrorSchema();
    schemas['GuardFailureResponse'] = buildGuardFailureSchema();
    schemas['ConcurrencyConflictResponse'] = buildConcurrencyConflictSchema();
  }

  // Build components
  const components: Record<string, unknown> = {
    schemas,
  };

  if (options.securitySchemes && Object.keys(options.securitySchemes).length > 0) {
    components.securitySchemes = options.securitySchemes;
  }

  // Build spec
  const spec: Record<string, unknown> = {
    openapi: '3.1.0',
    info: {
      title,
      version,
      ...(options.info?.description ? { description: options.info.description } : {}),
      ...(options.info?.contact ? { contact: options.info.contact } : {}),
      ...(options.info?.license ? { license: options.info.license } : {}),
    },
    ...(options.servers && options.servers.length > 0 ? { servers: options.servers } : {}),
    paths,
    components,
  };

  // Global security
  if (options.security && options.security.length > 0) {
    spec.security = options.security.map((s) => ({ [s.ref]: [] }));
  }

  return { spec, diagnostics };
}

// ============================================================================
// Projection Implementation
// ============================================================================

/**
 * OpenAPI 3.1 projection.
 *
 * Generates a complete OpenAPI 3.1.0 specification from Manifest IR.
 *
 * Surfaces:
 *   - openapi.spec → openapi.json
 */
export class OpenApiProjection implements ProjectionTarget {
  readonly name = 'openapi';
  readonly description =
    'OpenAPI 3.1.0 spec generation from Manifest IR entities, commands, and routes';
  readonly surfaces = SURFACES;
  readonly descriptorMeta = OPENAPI_DESCRIPTOR_META;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const options = (request.options ?? {}) as OpenApiProjectionOptions;

    switch (request.surface) {
      case SURFACE_SPEC: {
        const { spec, diagnostics } = buildOpenApiSpec(ir, options);

        const artifact: ProjectionArtifact = {
          id: 'openapi.spec',
          pathHint: 'openapi.json',
          contentType: 'json',
          code: JSON.stringify(spec, null, 2),
        };

        return {
          artifacts: [artifact],
          diagnostics,
        };
      }

      default:
        return {
          artifacts: [],
          diagnostics: [
            {
              severity: 'error',
              code: 'UNKNOWN_SURFACE',
              message: `Unknown surface: "${request.surface}". Available: openapi.spec`,
            },
          ],
        };
    }
  }
}

// Re-export types
export type { OpenApiProjectionOptions, OpenApiSecurityScheme } from './types';
