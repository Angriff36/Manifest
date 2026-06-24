import type { ErrorObject } from 'ajv';
import type { ValidationDiagnostic } from './validate-ai-types.js';

export function formatAjvDiagnostic(error: ErrorObject): ValidationDiagnostic {
  const field = error.instancePath
    ? error.instancePath.replace(/^\//, '').replaceAll('/', '.')
    : 'root';
  const params = (error.params ?? {}) as Record<string, unknown>;

  switch (error.keyword) {
    case 'required': {
      const missing = (params.missingProperty as string | undefined) ?? '';
      const prefix = error.instancePath ? `${field}.` : '';
      return {
        code: 'SCHEMA_REQUIRED',
        message: `Missing required field: ${prefix}${missing}`,
        severity: 'error',
        category: 'schema',
        path: error.instancePath || '/',
        suggestion: `Add the "${missing}" field at "${field}". Check docs/spec/ir/ir-v1.schema.json for the expected shape.`,
      };
    }
    case 'additionalProperties': {
      const extra = (params.additionalProperty as string | undefined) ?? '';
      return {
        code: 'SCHEMA_ADDITIONAL_PROPERTY',
        message: `Unknown field: ${field}.${extra}`,
        severity: 'error',
        category: 'schema',
        path: `${error.instancePath || '/'}/${extra}`,
        suggestion: `Remove the "${extra}" field. The IR schema has additionalProperties: false — only defined fields are allowed.`,
      };
    }
    case 'type':
      return {
        code: 'SCHEMA_TYPE',
        message: `${field} must be of type ${params.type as string}`,
        severity: 'error',
        category: 'schema',
        path: error.instancePath || '/',
        suggestion: `Change the value at "${field}" to type "${params.type as string}".`,
      };
    case 'const':
      return {
        code: 'SCHEMA_CONST',
        message: `${field} must be ${JSON.stringify(params.allowedValue)}`,
        severity: 'error',
        category: 'schema',
        path: error.instancePath || '/',
        suggestion: `Set "${field}" to the exact value ${JSON.stringify(params.allowedValue)}.`,
      };
    case 'enum': {
      const allowed = ((params.allowedValues as unknown[]) ?? []).map(v => JSON.stringify(v)).join(', ');
      return {
        code: 'SCHEMA_ENUM',
        message: `${field} must be one of: ${allowed}`,
        severity: 'error',
        category: 'schema',
        path: error.instancePath || '/',
        suggestion: `Change "${field}" to one of: ${allowed}.`,
      };
    }
    case 'oneOf':
      return {
        code: 'SCHEMA_ONE_OF',
        message: `${field} must match exactly one of the allowed shapes`,
        severity: 'error',
        category: 'schema',
        path: error.instancePath || '/',
        suggestion: `Check the union type definition at "${field}" in docs/spec/ir/ir-v1.schema.json. The value must match exactly one variant.`,
      };
    default:
      return {
        code: 'SCHEMA_UNKNOWN',
        message: `${field}: ${error.message ?? 'validation error'}`,
        severity: 'error',
        category: 'schema',
        path: error.instancePath || '/',
      };
  }
}
