/**
 * Pure IR → JSON Schema converter.
 * Converts IRType and IRValue to Draft-07 JSON Schema for OpenAPI/Anthropic/Vercel tool schemas.
 */

import type { IRType, IRValue, IRParameter } from '../ir';
import type { JsonSchema } from './types';

const PRIMITIVE_MAP: Record<string, string> = {
  String: 'string',
  Number: 'number',
  Boolean: 'boolean',
  ID: 'string',
  UUID: 'string',
  Money: 'number',
  Email: 'string',
  URL: 'string',
  JSON: 'object',
  Any: 'string',
  Date: 'string',
  DateTime: 'string',
};

const EMAIL_FORMAT = 'email';
const URL_FORMAT = 'uri';
const DATE_FORMAT = 'date-time';

/**
 * Convert an IRType to a minimal Draft-07 JSON Schema.
 *
 * Rules:
 * - Primitive scalar types → corresponding JSON type
 * - Array<T> → { type: 'array', items: <schema for T> }
 * - Nullable type → oneOf with null (permissive, includes the base type)
 * - Date/DateTime → string with date-time format
 * - Email → string with email format
 * - URL → string with uri format
 * - Unknown type name → { type: 'string' } (permissive best-effort)
 */
export function irTypeToJsonSchema(type: IRType): JsonSchema {
  const base = PRIMITIVE_MAP[type.name] ?? 'string';

  // Handle generic types (Array<T>)
  if (type.name === 'Array' && type.generic) {
    // Recurse for the element type (handle nested nullable inside array)
    return {
      type: 'array',
      items: irTypeToJsonSchema(type.generic),
    };
  }

  // Date/DateTime get date-time format
  if (type.name === 'Date' || type.name === 'DateTime') {
    return {
      type: 'string',
      format: DATE_FORMAT,
      'x-manifest-type': type.name,
    };
  }

  // Email gets email format
  if (type.name === 'Email') {
    return {
      type: 'string',
      format: EMAIL_FORMAT,
      'x-manifest-type': type.name,
    };
  }

  // URL gets uri format
  if (type.name === 'URL') {
    return {
      type: 'string',
      format: URL_FORMAT,
      'x-manifest-type': type.name,
    };
  }

  // Money maps to number
  if (type.name === 'Money') {
    return {
      type: 'number',
      'x-manifest-type': type.name,
    };
  }

  // Base schema before nullability wrapping
  const baseSchema: JsonSchema = {
    type: base,
    'x-manifest-type':
      type.name !== 'String' && type.name !== 'Number' && type.name !== 'Boolean'
        ? type.name
        : undefined,
  };

  // Null away the `x-manifest-type` key if not set (cleaner objects)
  if (!baseSchema['x-manifest-type']) {
    delete baseSchema['x-manifest-type'];
  }

  // Nullable: wrap in oneOf([...base..., { type: 'null' }])
  if (type.nullable) {
    return {
      oneOf: [baseSchema, { type: 'null' }],
    };
  }

  return baseSchema;
}

/**
 * Convert an array of IRParameters to a JSON Schema object with properties + required.
 */
export function irParametersToJsonSchema(params: IRParameter[]): JsonSchema {
  const required: string[] = [];
  const properties: Record<string, JsonSchema> = {};

  for (const p of params) {
    properties[p.name] = irTypeToJsonSchema(p.type);
    if (p.defaultValue !== undefined) {
      properties[p.name].default = irValueToJson(p.defaultValue);
    }
    if (p.required) {
      required.push(p.name);
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

/**
 * Convert an IRValue to a plain JSON value.
 * Used for populating schema default values.
 */
export function irValueToJson(v: IRValue): unknown {
  switch (v.kind) {
    case 'string':
    case 'number':
    case 'boolean':
      return v.value;
    case 'null':
      return null;
    case 'array':
      return v.elements.map(irValueToJson);
    case 'object':
      return Object.fromEntries(
        Object.entries(v.properties).map(([k, val]) => [k, irValueToJson(val)]),
      );
  }
}
