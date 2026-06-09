/**
 * Zod schema projection for Manifest IR.
 *
 * Generates `z.object()` validation schemas from IR entities and command parameters,
 * with constraint refinements (`.min()/.max()`) and type coercions.
 *
 * Surfaces:
 *   - zod.entity  → Entity property schemas (one per entity or all)
 *   - zod.command → Command parameter schemas (one per command or all)
 *   - zod.schemas → All schemas (entities + commands) in one artifact
 *
 * Reuses constraint analysis from `src/manifest/constraint-analysis.ts`
 * for `.min()/.max()` chain generation.
 */

import type {
  IR,
  IREntity,
  IRProperty,
  IRValue,
  IRCommand,
  IRType,
  IRComputedProperty,
  IRParameter,
} from '../../ir';
import type {
  ProjectionTarget,
  ProjectionRequest,
  ProjectionResult,
  ProjectionDiagnostic,
  ProjectionArtifact,
} from '../interface';
import type { ZodProjectionOptions } from './types';
import {
  analyzeConstraints,
  numericRangeToZodChain,
  lengthConstraintToZodChain,
  patternConstraintToZodChain,
} from '../../constraint-analysis.js';

// ============================================================================
// Type mapping
// ============================================================================

/** IR type name → Zod base expression. Unknown types fall through to z.unknown(). */
const TYPE_MAP: Record<string, string> = {
  string: 'z.string()',
  text: 'z.string()',
  boolean: 'z.boolean()',
  bool: 'z.boolean()',
  number: 'z.number()',
  float: 'z.number()',
  decimal: 'z.number()',
  money: 'z.number()',
  int: 'z.number().int()',
  integer: 'z.number().int()',
  bigint: 'z.bigint()',
  date: 'z.coerce.date()',
  datetime: 'z.coerce.date()',
  time: 'z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d$/)',
  duration: 'z.number()',
  uuid: 'z.string().uuid()',
  email: 'z.string().email()',
  url: 'z.string().url()',
  uri: 'z.string().url()',
  json: 'z.unknown()',
  any: 'z.unknown()',
  bytes: 'z.instanceof(Uint8Array)',
  object: 'z.record(z.unknown())',
};

// ============================================================================
// Helpers
// ============================================================================

/** Convert an IRType to a Zod expression string, handling generics recursively. */
function irTypeToZod(type: IRType, diagnostics: ProjectionDiagnostic[]): string {
  // Handle generic types first (array, map) before TYPE_MAP lookup
  if (type.name === 'array' && type.generic) {
    const inner = irTypeToZod(type.generic, diagnostics);
    return `z.array(${inner})`;
  }

  if (type.name === 'map' && type.generic) {
    const inner = irTypeToZod(type.generic, diagnostics);
    return `z.record(${inner})`;
  }

  const base = TYPE_MAP[type.name];
  if (base === undefined) {
    diagnostics.push({
      severity: 'warning',
      code: 'ZOD_UNKNOWN_TYPE',
      message: `Unknown IR type "${type.name}", falling back to z.unknown()`,
    });
    return 'z.unknown()';
  }

  return base;
}

/** Serialize an IRValue to a TypeScript literal string. */
function irValueToTsLiteral(value: IRValue): string {
  switch (value.kind) {
    case 'string': return JSON.stringify(value.value);
    case 'number': return String(value.value);
    case 'boolean': return String(value.value);
    case 'null': return 'null';
    case 'array': return `[${value.elements.map(irValueToTsLiteral).join(', ')}]`;
    case 'object': {
      const entries = Object.entries(value.properties)
        .map(([k, v]) => `${k}: ${irValueToTsLiteral(v)}`);
      return `{ ${entries.join(', ')} }`;
    }
  }
}

/** PascalCase conversion for schema/type names. */
function pascalCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ============================================================================
// Schema generation
// ============================================================================

interface EntitySchemaResult {
  /** Lines of code for the entity schema */
  lines: string[];
  /** Entity PascalCase name (for type exports) */
  entityName: string;
  /** Whether entity has computed properties */
  hasComputed: boolean;
}

function generateEntitySchema(
  entity: IREntity,
  analysisOptions: ZodProjectionOptions,
  diagnostics: ProjectionDiagnostic[],
): EntitySchemaResult {
  const name = pascalCase(entity.name);
  const lines: string[] = [];
  const opts = normalizeOptions(analysisOptions);

  // Analyze constraints for this entity
  const analysis = analyzeConstraints(entity.constraints);

  // Build lookup: property name → numeric range chain
  const numericChains = new Map<string, string>();
  for (const range of analysis.numericRanges) {
    const prop = range.propertyPath.replace(/^self\./, '');
    numericChains.set(prop, numericRangeToZodChain(range));
  }

  // Build lookup: property name → length chain
  const lengthChains = new Map<string, string>();
  for (const lc of analysis.lengthConstraints) {
    const prop = lc.propertyPath.replace(/^self\./, '');
    lengthChains.set(prop, lengthConstraintToZodChain(lc));
  }

  // Build lookup: property name → pattern chain
  const patternChains = new Map<string, string>();
  for (const pc of analysis.patternConstraints) {
    const prop = pc.propertyPath.replace(/^self\./, '');
    const existing = patternChains.get(prop) ?? '';
    patternChains.set(prop, existing + patternConstraintToZodChain(pc));
  }

  // Schema declaration
  lines.push(`// Entity: ${entity.name}`);
  lines.push(`export const ${name}Schema = z.object({`);

  for (const prop of entity.properties) {
    const propLine = generatePropertyLine(prop, numericChains, lengthChains, patternChains, diagnostics);
    lines.push(`  ${prop.name}: ${propLine},`);
  }

  lines.push('});');

  // Computed property extension
  if (opts.emitComputedSchemas && entity.computedProperties.length > 0) {
    lines.push('');
    lines.push(`// Computed: ${entity.name}`);
    lines.push(`export const ${name}ComputedSchema = ${name}Schema.extend({`);
    for (const cp of entity.computedProperties) {
      const cpLine = generateComputedPropertyLine(cp, diagnostics);
      lines.push(`  ${cp.name}: ${cpLine},`);
    }
    lines.push('});');
  }

  // Type exports
  if (opts.emitTypes) {
    lines.push('');
    lines.push(`export type ${name} = z.infer<typeof ${name}Schema>;`);
    if (opts.emitComputedSchemas && entity.computedProperties.length > 0) {
      lines.push(`export type ${name}WithComputed = z.infer<typeof ${name}ComputedSchema>;`);
    }
  }

  return {
    lines,
    entityName: name,
    hasComputed: entity.computedProperties.length > 0,
  };
}

function generatePropertyLine(
  prop: IRProperty,
  numericChains: Map<string, string>,
  lengthChains: Map<string, string>,
  patternChains: Map<string, string>,
  diagnostics: ProjectionDiagnostic[],
): string {
  let expr = irTypeToZod(prop.type, diagnostics);

  // Apply numeric range chain for numeric types
  const numChain = numericChains.get(prop.name);
  if (numChain) {
    expr += numChain;
  }

  // Apply length chain for string-like types
  const lenChain = lengthChains.get(prop.name);
  if (lenChain) {
    expr += lenChain;
  }

  // Apply pattern chain for string types
  const patChain = patternChains.get(prop.name);
  if (patChain) {
    expr += patChain;
  }

  // Nullable
  if (prop.type.nullable) {
    expr += '.nullable()';
  }

  // Optional (properties without 'required' modifier are optional)
  if (!prop.modifiers.includes('required')) {
    expr += '.optional()';
  }

  // Default value
  if (prop.defaultValue !== undefined) {
    expr += `.default(${irValueToTsLiteral(prop.defaultValue)})`;
  }

  return expr;
}

function generateComputedPropertyLine(
  cp: IRComputedProperty,
  diagnostics: ProjectionDiagnostic[],
): string {
  let expr = irTypeToZod(cp.type, diagnostics);

  if (cp.type.nullable) {
    expr += '.nullable()';
  }

  return expr;
}

// ============================================================================
// Command schema generation
// ============================================================================

function generateCommandSchema(
  command: IRCommand,
  analysisOptions: ZodProjectionOptions,
  diagnostics: ProjectionDiagnostic[],
): string[] {
  const lines: string[] = [];
  const opts = normalizeOptions(analysisOptions);
  const name = pascalCase(command.name);

  // Command parameter schema
  const schemaName = `${name}ParamsSchema`;
  lines.push(`// Command: ${command.name}${command.entity ? ` on ${command.entity}` : ''}`);

  if (command.parameters.length === 0) {
    lines.push(`export const ${schemaName} = z.object({});`);
  } else {
    lines.push(`export const ${schemaName} = z.object({`);
    for (const param of command.parameters) {
      const paramLine = generateParameterLine(param, diagnostics);
      lines.push(`  ${param.name}: ${paramLine},`);
    }
    lines.push('});');
  }

  // Type export
  if (opts.emitTypes) {
    lines.push('');
    lines.push(`export type ${name}Params = z.infer<typeof ${schemaName}>;`);
  }

  // Return type schema if command has a return type
  if (command.returns && opts.emitTypes) {
    const returnExpr = irTypeToZod(command.returns, diagnostics);
    lines.push(`export const ${name}ReturnSchema = ${returnExpr};`);
    lines.push(`export type ${name}Return = z.infer<typeof ${name}ReturnSchema>;`);
  }

  return lines;
}

function generateParameterLine(
  param: IRParameter,
  diagnostics: ProjectionDiagnostic[],
): string {
  let expr = irTypeToZod(param.type, diagnostics);

  if (param.type.nullable) {
    expr += '.nullable()';
  }

  if (!param.required) {
    expr += '.optional()';
  }

  if (param.defaultValue !== undefined) {
    expr += `.default(${irValueToTsLiteral(param.defaultValue)})`;
  }

  return expr;
}

// ============================================================================
// Options normalization
// ============================================================================

function normalizeOptions(options?: ZodProjectionOptions): {
  emitTypes: boolean;
  emitComputedSchemas: boolean;
  zodImportPath: string;
  emitHeader: boolean;
} {
  return {
    emitTypes: options?.emitTypes !== false,
    emitComputedSchemas: options?.emitComputedSchemas !== false,
    zodImportPath: options?.zodImportPath ?? 'zod',
    emitHeader: options?.emitHeader !== false,
  };
}

// ============================================================================
// Main projection class
// ============================================================================

export class ZodProjection implements ProjectionTarget {
  readonly name = 'zod';
  readonly description = 'Zod validation schemas for IR entities and command parameters';
  readonly surfaces = ['zod.entity', 'zod.command', 'zod.schemas'] as const;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const diagnostics: ProjectionDiagnostic[] = [];
    const opts = normalizeOptions(request.options as ZodProjectionOptions | undefined);

    switch (request.surface) {
      case 'zod.entity':
        return this.generateEntitySurface(ir, request, opts, diagnostics);
      case 'zod.command':
        return this.generateCommandSurface(ir, request, opts, diagnostics);
      case 'zod.schemas':
        return this.generateAllSurface(ir, opts, diagnostics);
      default:
        return {
          artifacts: [],
          diagnostics: [{
            severity: 'error',
            code: 'ZOD_UNKNOWN_SURFACE',
            message: `Unknown surface "${request.surface}". Expected one of: ${this.surfaces.join(', ')}`,
          }],
        };
    }
  }

  private generateEntitySurface(
    ir: IR,
    request: ProjectionRequest,
    opts: ReturnType<typeof normalizeOptions>,
    diagnostics: ProjectionDiagnostic[],
  ): ProjectionResult {
    const entities = request.entity
      ? ir.entities.filter(e => e.name === request.entity)
      : ir.entities;

    if (request.entity && entities.length === 0) {
      return {
        artifacts: [],
        diagnostics: [{
          severity: 'error',
          code: 'ZOD_ENTITY_NOT_FOUND',
          message: `Entity "${request.entity}" not found in IR`,
          entity: request.entity,
        }],
      };
    }

    const artifacts: ProjectionArtifact[] = [];

    for (const entity of entities) {
      const result = generateEntitySchema(entity, opts, diagnostics);
      const code = this.wrapWithImport(result.lines, opts);
      artifacts.push({
        id: `zod.entity.${entity.name}`,
        pathHint: `schemas/${entity.name}.schema.ts`,
        contentType: 'typescript',
        code,
      });
    }

    return { artifacts, diagnostics };
  }

  private generateCommandSurface(
    ir: IR,
    request: ProjectionRequest,
    opts: ReturnType<typeof normalizeOptions>,
    diagnostics: ProjectionDiagnostic[],
  ): ProjectionResult {
    const commands = request.command
      ? ir.commands.filter(c => c.name === request.command)
      : ir.commands;

    if (request.command && commands.length === 0) {
      return {
        artifacts: [],
        diagnostics: [{
          severity: 'error',
          code: 'ZOD_COMMAND_NOT_FOUND',
          message: `Command "${request.command}" not found in IR`,
        }],
      };
    }

    const artifacts: ProjectionArtifact[] = [];

    for (const command of commands) {
      const lines = generateCommandSchema(command, opts, diagnostics);
      const code = this.wrapWithImport(lines, opts);
      artifacts.push({
        id: `zod.command.${command.name}`,
        pathHint: `schemas/${command.name}.schema.ts`,
        contentType: 'typescript',
        code,
      });
    }

    return { artifacts, diagnostics };
  }

  private generateAllSurface(
    ir: IR,
    opts: ReturnType<typeof normalizeOptions>,
    diagnostics: ProjectionDiagnostic[],
  ): ProjectionResult {
    const lines: string[] = [];

    for (const entity of ir.entities) {
      const result = generateEntitySchema(entity, opts, diagnostics);
      lines.push(...result.lines);
      lines.push('');
    }

    for (const command of ir.commands) {
      const cmdLines = generateCommandSchema(command, opts, diagnostics);
      lines.push(...cmdLines);
      lines.push('');
    }

    const code = this.wrapWithImport(lines, opts);

    return {
      artifacts: [{
        id: 'zod.schemas',
        pathHint: 'schemas/manifest-schemas.ts',
        contentType: 'typescript',
        code,
      }],
      diagnostics,
    };
  }

  private wrapWithImport(lines: string[], opts: ReturnType<typeof normalizeOptions>): string {
    const parts: string[] = [];

    if (opts.emitHeader) {
      parts.push(`// Auto-generated by Manifest Zod projection`);
      parts.push(`// Generated at: ${new Date().toISOString()}`);
      parts.push('');
    }

    parts.push(`import { z } from '${opts.zodImportPath}';`);
    parts.push('');

    // Remove trailing empty lines from the input
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    parts.push(...lines);
    parts.push('');

    return parts.join('\n');
  }
}
