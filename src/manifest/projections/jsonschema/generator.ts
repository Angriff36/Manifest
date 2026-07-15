/**
 * JSON Schema projection for Manifest IR.
 *
 * Generates JSON Schema documents (drafts 7, 2019-09, 2020-12) from IR entity
 * definitions. Maps Manifest property types, modifiers, defaults, and
 * constraints to JSON Schema keywords (`pattern`, `minimum`, `maximum`,
 * `required`, `enum`, `minLength`, `maxLength`).
 *
 * Produces one schema file per entity.
 *
 * Surfaces:
 *   - jsonschema.entity  → single entity schema (requires `entity` in request)
 *   - jsonschema.schemas → all entity schemas as separate artifacts
 */

import type { IR, IREntity, IRType, IRValue, IRExpression, IREnum } from '../../ir';
import type {
  ProjectionTarget,
  ProjectionRequest,
  ProjectionResult,
  ProjectionDiagnostic,
  ProjectionArtifact,
} from '../interface';
import { analyzeConstraints } from '../../constraint-analysis.js';
import type { JsonSchemaProjectionOptions } from './types';
import { JSONSCHEMA_DESCRIPTOR_META } from './descriptor-meta.js';


// ============================================================================
// Constants
// ============================================================================

const SURFACE_ENTITY = 'jsonschema.entity' as const;
const SURFACE_SCHEMAS = 'jsonschema.schemas' as const;
const SURFACES = [SURFACE_ENTITY, SURFACE_SCHEMAS] as const;

/** $schema URIs per draft version */
const DRAFT_SCHEMA_URIS: Record<string, string> = {
  'draft-07': 'http://json-schema.org/draft-07/schema#',
  '2019-09': 'https://json-schema.org/draft/2019-09/schema',
  '2020-12': 'https://json-schema.org/draft/2020-12/schema',
};

// ============================================================================
// Options normalisation
// ============================================================================

interface NormalizedOptions {
  draft: 'draft-07' | '2019-09' | '2020-12';
  includeComputed: boolean;
  strictAdditionalProperties: boolean;
  baseUri?: string;
}

function normalizeOptions(raw?: JsonSchemaProjectionOptions): NormalizedOptions {
  return {
    draft: raw?.draft ?? 'draft-07',
    includeComputed: raw?.includeComputed !== false,
    strictAdditionalProperties: raw?.strictAdditionalProperties !== false,
    baseUri: raw?.baseUri,
  };
}

// ============================================================================
// Type mapping: IR type → JSON Schema
// ============================================================================

/** JSON Schema object type (subset used during generation) */
interface JsonSchemaObj {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type?: string | string[];
  items?: JsonSchemaObj;
  properties?: Record<string, JsonSchemaObj>;
  additionalProperties?: boolean | JsonSchemaObj;
  required?: string[];
  format?: string;
  enum?: unknown[];
  default?: unknown;
  readOnly?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  // 2019-09+ prefixItems kept as `items` for simplicity since we only
  // emit homogeneous arrays.
}

/**
 * Map a Manifest IR type to a JSON Schema type object.
 */
function irTypeToJsonSchema(
  irType: IRType,
  enumsByName: Map<string, IREnum>,
  diagnostics: ProjectionDiagnostic[],
  entityName?: string,
): JsonSchemaObj {
  // Generic: array<T>
  if (irType.name === 'array' && irType.generic) {
    return {
      type: 'array',
      items: irTypeToJsonSchema(irType.generic, enumsByName, diagnostics, entityName),
    };
  }

  // Generic: map<V>
  if (irType.name === 'map' && irType.generic) {
    return {
      type: 'object',
      additionalProperties: irTypeToJsonSchema(
        irType.generic,
        enumsByName,
        diagnostics,
        entityName,
      ),
    };
  }

  if (irType.name === 'record') {
    return { type: 'object', additionalProperties: true };
  }

  // Check if type name references an enum
  const enumDef = enumsByName.get(irType.name);
  if (enumDef) {
    return {
      type: 'string',
      enum: enumDef.values.map((v) => v.name),
    };
  }

  // Scalar type mapping
  const SCALAR_MAP: Record<string, JsonSchemaObj> = {
    string: { type: 'string' },
    text: { type: 'string' },
    number: { type: 'number' },
    float: { type: 'number' },
    decimal: { type: 'number' },
    int: { type: 'integer' },
    integer: { type: 'integer' },
    bigint: { type: 'integer' },
    boolean: { type: 'boolean' },
    bool: { type: 'boolean' },
    date: { type: 'string', format: 'date' },
    datetime: { type: 'string', format: 'date-time' },
    timestamp: { type: 'string', format: 'date-time' }, // alias of datetime
    time: { type: 'string', format: 'time' },
    duration: { type: 'number' },
    uuid: { type: 'string', format: 'uuid' },
    email: { type: 'string', format: 'email' },
    url: { type: 'string', format: 'uri' },
    uri: { type: 'string', format: 'uri' },
    json: {},
    any: {},
    object: { type: 'object', additionalProperties: true },
    bytes: { type: 'string', format: 'byte' },
  };

  const mapped = SCALAR_MAP[irType.name];
  if (mapped) return { ...mapped };

  diagnostics.push({
    severity: 'warning',
    code: 'UNKNOWN_TYPE',
    message: `Unknown IR type "${irType.name}" — mapping to string`,
    entity: entityName,
  });
  return { type: 'string' };
}

/**
 * Handle nullable: wrap type with null union.
 *
 * - draft-07: uses `type: [original, "null"]` (array form)
 * - 2019-09/2020-12: same pattern (array type union)
 */
function applyNullable(schema: JsonSchemaObj, irType: IRType): JsonSchemaObj {
  if (!irType.nullable) return schema;
  if (schema.type && typeof schema.type === 'string') {
    schema.type = [schema.type, 'null'];
  }
  // If no `type` (e.g. "any"/"json"), leave as-is
  return schema;
}

// ============================================================================
// Value conversion
// ============================================================================

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
// Expression to string (for descriptions)
// ============================================================================

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
// Entity schema generation
// ============================================================================

/**
 * Strip the "self." prefix from a property path for constraint matching.
 */
function stripSelfPrefix(path: string): string {
  return path.startsWith('self.') ? path.slice(5) : path;
}

/**
 * Build a JSON Schema document for a single entity.
 */
function buildEntitySchema(
  entity: IREntity,
  enumsByName: Map<string, IREnum>,
  opts: NormalizedOptions,
  diagnostics: ProjectionDiagnostic[],
): JsonSchemaObj {
  const properties: Record<string, JsonSchemaObj> = {};
  const required: string[] = [];

  // Analyze constraints to extract static bounds
  const analysis = analyzeConstraints(entity.constraints);

  // Build lookup maps by property name (stripped of "self." prefix)
  const numericByProp = new Map<string, { min?: number; max?: number }>();
  for (const range of analysis.numericRanges) {
    const prop = stripSelfPrefix(range.propertyPath);
    numericByProp.set(prop, { min: range.min, max: range.max });
  }

  const lengthByProp = new Map<string, { minLength?: number; maxLength?: number }>();
  for (const lc of analysis.lengthConstraints) {
    const prop = stripSelfPrefix(lc.propertyPath);
    lengthByProp.set(prop, { minLength: lc.minLength, maxLength: lc.maxLength });
  }

  const patternByProp = new Map<string, string[]>();
  for (const pc of analysis.patternConstraints) {
    const prop = stripSelfPrefix(pc.propertyPath);
    const existing = patternByProp.get(prop) ?? [];
    existing.push(pc.pattern);
    patternByProp.set(prop, existing);
  }

  // Regular properties
  for (const prop of entity.properties) {
    let schema = irTypeToJsonSchema(prop.type, enumsByName, diagnostics, entity.name);
    schema = applyNullable(schema, prop.type);

    // Default value
    if (prop.defaultValue !== undefined) {
      schema.default = irValueToJson(prop.defaultValue);
    }

    // Readonly modifier
    if (prop.modifiers.includes('readonly')) {
      schema.readOnly = true;
    }

    // Apply numeric range constraints
    const numRange = numericByProp.get(prop.name);
    if (numRange) {
      if (numRange.min !== undefined) schema.minimum = numRange.min;
      if (numRange.max !== undefined) schema.maximum = numRange.max;
    }

    // Apply length constraints
    const lenConstraint = lengthByProp.get(prop.name);
    if (lenConstraint) {
      if (lenConstraint.minLength !== undefined) schema.minLength = lenConstraint.minLength;
      if (lenConstraint.maxLength !== undefined) schema.maxLength = lenConstraint.maxLength;
    }

    // Apply pattern constraints (use first pattern for JSON Schema `pattern` keyword)
    const patterns = patternByProp.get(prop.name);
    if (patterns && patterns.length > 0) {
      schema.pattern = patterns[0];
    }

    // Required modifier
    if (prop.modifiers.includes('required')) {
      required.push(prop.name);
    }

    properties[prop.name] = schema;
  }

  // Computed properties (readOnly)
  if (opts.includeComputed) {
    for (const computed of entity.computedProperties) {
      let schema = irTypeToJsonSchema(computed.type, enumsByName, diagnostics, entity.name);
      schema = applyNullable(schema, computed.type);
      schema.readOnly = true;
      schema.description = `Computed: ${expressionToString(computed.expression)}`;
      properties[computed.name] = schema;
    }
  }

  // Assemble document
  const doc: JsonSchemaObj = {
    $schema: DRAFT_SCHEMA_URIS[opts.draft],
    title: entity.name,
    type: 'object',
    properties,
  };

  if (opts.baseUri) {
    doc.$id = `${opts.baseUri}/${entity.name}.schema.json`;
  }

  if (required.length > 0) {
    doc.required = required;
  }

  if (opts.strictAdditionalProperties) {
    doc.additionalProperties = false;
  }

  return doc;
}

// ============================================================================
// Projection class
// ============================================================================

/**
 * JSON Schema projection.
 *
 * Generates JSON Schema documents from Manifest IR entity definitions.
 *
 * Surfaces:
 *   - jsonschema.entity  → single entity schema (entity name required)
 *   - jsonschema.schemas → all entity schemas
 */
export class JsonSchemaProjection implements ProjectionTarget {
  readonly name = 'jsonschema';
  readonly description =
    'JSON Schema (draft-07/2019-09/2020-12) generation from Manifest IR entities';
  readonly surfaces = SURFACES;
  readonly descriptorMeta = JSONSCHEMA_DESCRIPTOR_META;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const opts = normalizeOptions(request.options as JsonSchemaProjectionOptions | undefined);
    const diagnostics: ProjectionDiagnostic[] = [];

    // Build enum lookup
    const enumsByName = new Map<string, IREnum>();
    for (const e of ir.enums) {
      enumsByName.set(e.name, e);
    }

    switch (request.surface) {
      case SURFACE_ENTITY:
        return this.generateEntitySurface(ir, request, opts, enumsByName, diagnostics);
      case SURFACE_SCHEMAS:
        return this.generateAllSurface(ir, opts, enumsByName, diagnostics);
      default:
        return {
          artifacts: [],
          diagnostics: [
            {
              severity: 'error',
              code: 'UNKNOWN_SURFACE',
              message: `Unknown surface: "${request.surface}". Available: ${SURFACES.join(', ')}`,
            },
          ],
        };
    }
  }

  private generateEntitySurface(
    ir: IR,
    request: ProjectionRequest,
    opts: NormalizedOptions,
    enumsByName: Map<string, IREnum>,
    diagnostics: ProjectionDiagnostic[],
  ): ProjectionResult {
    if (!request.entity) {
      // When no entity specified, generate all entities (same as schemas surface)
      return this.generateAllSurface(ir, opts, enumsByName, diagnostics);
    }

    const entity = ir.entities.find((e) => e.name === request.entity);
    if (!entity) {
      return {
        artifacts: [],
        diagnostics: [
          {
            severity: 'error',
            code: 'ENTITY_NOT_FOUND',
            message: `Entity "${request.entity}" not found in IR`,
          },
        ],
      };
    }

    const schema = buildEntitySchema(entity, enumsByName, opts, diagnostics);
    const artifact: ProjectionArtifact = {
      id: `jsonschema.entity.${entity.name}`,
      pathHint: `schemas/${entity.name}.schema.json`,
      contentType: 'json',
      code: JSON.stringify(schema, null, 2),
    };

    return { artifacts: [artifact], diagnostics };
  }

  private generateAllSurface(
    ir: IR,
    opts: NormalizedOptions,
    enumsByName: Map<string, IREnum>,
    diagnostics: ProjectionDiagnostic[],
  ): ProjectionResult {
    const artifacts: ProjectionArtifact[] = [];

    // Sort for determinism
    const sortedEntities = [...ir.entities].sort((a, b) => a.name.localeCompare(b.name));

    for (const entity of sortedEntities) {
      const schema = buildEntitySchema(entity, enumsByName, opts, diagnostics);
      artifacts.push({
        id: `jsonschema.entity.${entity.name}`,
        pathHint: `schemas/${entity.name}.schema.json`,
        contentType: 'json',
        code: JSON.stringify(schema, null, 2),
      });
    }

    return { artifacts, diagnostics };
  }
}

// Re-export types
export type { JsonSchemaProjectionOptions } from './types';
