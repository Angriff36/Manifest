/**
 * Pydantic v2 projection for Manifest IR.
 *
 * Generates Pydantic BaseModel classes from IR entities and command parameters,
 * with field validators, type annotations, and JSON schema export.
 *
 * Surfaces:
 *   - pydantic.entity  → Entity BaseModel classes (one per entity or all)
 *   - pydantic.command → Command parameter models (one per command or all)
 *   - pydantic.models  → All models (entities + commands) in one artifact
 *
 * Reuses constraint analysis from `src/manifest/constraint-analysis.ts`
 * for field annotation generation (@field_validator, @model_validator).
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
  IREnum,
} from '../../ir';
import type {
  ProjectionTarget,
  ProjectionRequest,
  ProjectionResult,
  ProjectionDiagnostic,
  ProjectionArtifact,
} from '../interface';
import type { PydanticProjectionOptions } from './types';
import {
  analyzeConstraints,
  type NumericRange,
  type LengthConstraint,
  type PatternConstraint,
} from '../../constraint-analysis.js';

// ============================================================================
// Type mapping
// ============================================================================

/** IR type name → Python/Pydantic type annotation. Unknown types fall through to 'Any'. */
const TYPE_MAP: Record<string, string> = {
  string: 'str',
  text: 'str',
  boolean: 'bool',
  bool: 'bool',
  number: 'float',
  float: 'float',
  decimal: 'Decimal',
  money: 'Decimal',
  int: 'int',
  integer: 'int',
  bigint: 'int',
  date: 'date',
  datetime: 'datetime',
  uuid: 'UUID',
  email: 'str',
  url: 'str',
  uri: 'str',
  json: 'dict[str, Any] | Any',
  any: 'Any',
  bytes: 'bytes',
  object: 'dict[str, Any]',
};

/** Types that need Decimal import from decimal module */
const DECIMAL_TYPES = new Set(['decimal', 'money']);

/** Types that need UUID import from uuid module */
const UUID_TYPES = new Set(['uuid']);

/** Types that need date/datetime import from datetime module */
const DATETIME_TYPES = new Set(['date', 'datetime']);

// ============================================================================
// Helper types for tracking imports
// ============================================================================

interface ImportTracker {
  needsDatetime: boolean;
  needsTyping: boolean;
  needsUuid: boolean;
  needsDecimal: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

/** Convert an IRType to a Python type annotation string, handling generics recursively. */
function irTypeToPython(
  type: IRType,
  diagnostics: ProjectionDiagnostic[],
  imports: ImportTracker,
): string {
  // Handle generic types first (array, map) before TYPE_MAP lookup
  if (type.name === 'array' && type.generic) {
    imports.needsTyping = true;
    const inner = irTypeToPython(type.generic, diagnostics, imports);
    return `list[${inner}]`;
  }

  if (type.name === 'map' && type.generic) {
    imports.needsTyping = true;
    const inner = irTypeToPython(type.generic, diagnostics, imports);
    return `dict[str, ${inner}]`;
  }

  const base = TYPE_MAP[type.name];
  if (base === undefined) {
    diagnostics.push({
      severity: 'warning',
      code: 'PYDANTIC_UNKNOWN_TYPE',
      message: `Unknown IR type "${type.name}", falling back to Any`,
    });
    return 'Any';
  }

  // Track imports needed
  if (DATETIME_TYPES.has(type.name)) {
    imports.needsDatetime = true;
  }
  if (UUID_TYPES.has(type.name)) {
    imports.needsUuid = true;
  }
  if (DECIMAL_TYPES.has(type.name)) {
    imports.needsDecimal = true;
  }
  if (type.name === 'json' || type.name === 'object' || type.name === 'any') {
    imports.needsTyping = true;
  }

  return base;
}

/** Serialize an IRValue to a Python literal string. */
function irValueToPythonLiteral(value: IRValue): string {
  switch (value.kind) {
    case 'string':
      return JSON.stringify(value.value);
    case 'number':
      return String(value.value);
    case 'boolean':
      return value.value ? 'True' : 'False';
    case 'null':
      return 'None';
    case 'array':
      return `[${value.elements.map(irValueToPythonLiteral).join(', ')}]`;
    case 'object': {
      const entries = Object.entries(value.properties)
        .map(([k, v]) => `"${k}": ${irValueToPythonLiteral(v)}`);
      return `{${entries.join(', ')}}`;
    }
  }
}

/** PascalCase conversion for model names. */
function pascalCase(name: string): string {
  // Handle snake_case and kebab-case
  const words = name.replace(/-/g, '_').split('_');
  return words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
}

/** snake_case conversion for field names (Python convention). */
function snakeCase(name: string): string {
  // Convert camelCase to snake_case
  return name
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

// ============================================================================
// Constraint to Pydantic validator conversion
// ============================================================================

/** Generate field validator method for numeric range constraints. */
function numericRangeToValidator(range: NumericRange, fieldName: string): string | undefined {
  const parts: string[] = [];

  if (range.min !== undefined && range.max !== undefined) {
    parts.push(`    if v < ${range.min} or v > ${range.max}:`);
    parts.push(`        raise ValueError('must be between ${range.min} and ${range.max}')`);
  } else if (range.min !== undefined) {
    parts.push(`    if v < ${range.min}:`);
    parts.push(`        raise ValueError('must be at least ${range.min}')`);
  } else if (range.max !== undefined) {
    parts.push(`    if v > ${range.max}:`);
    parts.push(`        raise ValueError('must be at most ${range.max}')`);
  }

  if (parts.length === 0) return undefined;

  const methodName = `validate_${snakeCase(fieldName)}`;

  return [
    ``,
    `    @field_validator('${fieldName}')`,
    `    @classmethod`,
    `    def ${methodName}(cls, v: int) -> int:`,
    ...parts,
    `        return v`,
  ].join('\n');
}

/** Generate field validator method for length constraints. */
function lengthConstraintToValidator(lc: LengthConstraint, fieldName: string): string | undefined {
  const parts: string[] = [];

  if (lc.minLength !== undefined && lc.maxLength !== undefined) {
    parts.push(`    if len(v) < ${lc.minLength} or len(v) > ${lc.maxLength}:`);
    parts.push(`        raise ValueError('length must be between ${lc.minLength} and ${lc.maxLength}')`);
  } else if (lc.minLength !== undefined) {
    parts.push(`    if len(v) < ${lc.minLength}:`);
    parts.push(`        raise ValueError('length must be at least ${lc.minLength}')`);
  } else if (lc.maxLength !== undefined) {
    parts.push(`    if len(v) > ${lc.maxLength}:`);
    parts.push(`        raise ValueError('length must be at most ${lc.maxLength}')`);
  }

  if (parts.length === 0) return undefined;

  const methodName = `validate_${snakeCase(fieldName)}_length`;

  return [
    ``,
    `    @field_validator('${fieldName}')`,
    `    @classmethod`,
    `    def ${methodName}(cls, v: str) -> str:`,
    ...parts,
    `        return v`,
  ].join('\n');
}

/** Generate field validator method for pattern constraints. */
function patternConstraintToValidator(pc: PatternConstraint, fieldName: string): string | undefined {
  const methodName = `validate_${snakeCase(fieldName)}_pattern`;

  // Use Python's re module
  return [
    ``,
    `    @field_validator('${fieldName}')`,
    `    @classmethod`,
    `    def ${methodName}(cls, v: str) -> str:`,
    `        if not re.match(r'${pc.pattern}', v):`,
    `            raise ValueError('must match pattern: ${pc.pattern}')`,
    `        return v`,
  ].join('\n');
}

// ============================================================================
// Schema generation
// ============================================================================

interface EntitySchemaResult {
  /** Lines of code for the entity model */
  lines: string[];
  /** Entity PascalCase name (for type exports) */
  entityName: string;
  /** Whether entity has computed properties */
  hasComputed: boolean;
  /** Whether entity needs re import for validators */
  needsRe: boolean;
}

function generateEntityModel(
  entity: IREntity,
  analysisOptions: PydanticProjectionOptions,
  diagnostics: ProjectionDiagnostic[],
): EntitySchemaResult {
  const name = pascalCase(entity.name);
  const lines: string[] = [];
  const opts = normalizeOptions(analysisOptions);
  const imports: ImportTracker = {
    needsDatetime: opts.emitDatetimeImports !== false,
    needsTyping: opts.emitTypingImports !== false,
    needsUuid: opts.emitUuidImport !== false,
    needsDecimal: opts.emitDecimalImport !== false,
  };

  // Analyze constraints for this entity
  const analysis = analyzeConstraints(entity.constraints);

  // Build lookup: property name → constraint info
  const numericConstraints = new Map<string, NumericRange>();
  for (const range of analysis.numericRanges) {
    const prop = range.propertyPath.replace(/^self\./, '');
    numericConstraints.set(prop, range);
  }

  const lengthConstraints = new Map<string, LengthConstraint>();
  for (const lc of analysis.lengthConstraints) {
    const prop = lc.propertyPath.replace(/^self\./, '');
    lengthConstraints.set(prop, lc);
  }

  const patternConstraints = new Map<string, PatternConstraint[]>();
  for (const pc of analysis.patternConstraints) {
    const prop = pc.propertyPath.replace(/^self\./, '');
    const existing = patternConstraints.get(prop) ?? [];
    existing.push(pc);
    patternConstraints.set(prop, existing);
  }

  // Class declaration
  lines.push(`# Entity: ${entity.name}`);
  lines.push(`class ${name}(BaseModel):`);
  lines.push(`    \"\"\"${name} model from Manifest IR entity '${entity.name}'.\"\"\"`);
  lines.push('');

  // Generate properties
  for (const prop of entity.properties) {
    const propResult = generatePropertyLine(
      prop,
      numericConstraints,
      lengthConstraints,
      patternConstraints,
      diagnostics,
      imports,
      opts,
    );
    lines.push(...propResult.lines.map(l => '    ' + l));
  }

  // Add validators after all fields
  let needsRe = false;

  // Process numeric range constraints
  for (const [prop, constraint] of numericConstraints.entries()) {
    const validator = numericRangeToValidator(constraint, prop);
    if (validator) {
      lines.push(validator.replace(/\n/g, '\n    '));
    }
  }

  // Process length constraints
  for (const [prop, constraint] of lengthConstraints.entries()) {
    const validator = lengthConstraintToValidator(constraint, prop);
    if (validator) {
      lines.push(validator.replace(/\n/g, '\n    '));
    }
  }

  // Process pattern constraints
  for (const [prop, constraints] of patternConstraints.entries()) {
    needsRe = true;
    for (const pc of constraints) {
      const validator = patternConstraintToValidator(pc, prop);
      if (validator) {
        lines.push(validator.replace(/\n/g, '\n    '));
      }
    }
  }

  // Config class for JSON schema generation
  if (opts.emitJsonSchema) {
    lines.push('');
    lines.push('    class Config:');
    lines.push('        json_schema_extra = {\"example\": {}}');
  }

  // Computed properties
  if (opts.emitComputedFields && entity.computedProperties.length > 0) {
    lines.push('');
    for (const cp of entity.computedProperties) {
      const cpResult = generateComputedPropertyLine(cp, diagnostics, imports);
      for (const line of cpResult) {
        lines.push('    ' + line);
      }
    }
  }

  // JSON schema export
  if (opts.emitJsonSchema) {
    lines.push('');
    lines.push('');
    lines.push(`# JSON Schema for ${name}`);
    lines.push(`${name}JsonSchema = ${name}.model_json_schema()`);
  }

  return {
    lines,
    entityName: name,
    hasComputed: entity.computedProperties.length > 0,
    needsRe,
  };
}

interface PropertyLineResult {
  lines: string[];
}

function generatePropertyLine(
  prop: IRProperty,
  _numericConstraints: Map<string, NumericRange>,
  _lengthConstraints: Map<string, LengthConstraint>,
  _patternConstraints: Map<string, PatternConstraint[]>,
  diagnostics: ProjectionDiagnostic[],
  imports: ImportTracker,
  _opts: ReturnType<typeof normalizeOptions>,
): PropertyLineResult {
  const lines: string[] = [];
  const fieldName = snakeCase(prop.name);
  let typeAnnotation = irTypeToPython(prop.type, diagnostics, imports);

  // Handle optional (properties without 'required' modifier)
  const isRequired = prop.modifiers.includes('required');
  const hasDefault = prop.defaultValue !== undefined;
  const isNullable = prop.type.nullable;

  // Build the field declaration
  let fieldDecl = `${fieldName}: ${typeAnnotation}`;

  if (hasDefault) {
    // For fields with a default value, set the default
    fieldDecl += ` = ${irValueToPythonLiteral(prop.defaultValue!)}`;
  } else if (!isRequired && isNullable) {
    // For nullable optional fields without default: use Type | None = None
    imports.needsTyping = true;
    fieldDecl = `${fieldName}: ${typeAnnotation} | None = None`;
  } else if (!isRequired) {
    // For non-nullable optional fields without default: use Type | None = None
    imports.needsTyping = true;
    fieldDecl = `${fieldName}: ${typeAnnotation} | None = None`;
  }

  lines.push(fieldDecl);

  return { lines };
}

function generateComputedPropertyLine(
  cp: IRComputedProperty,
  diagnostics: ProjectionDiagnostic[],
  imports: ImportTracker,
): string[] {
  const lines: string[] = [];
  const fieldName = snakeCase(cp.name);
  let typeAnnotation = irTypeToPython(cp.type, diagnostics, imports);

  if (cp.type.nullable) {
    imports.needsTyping = true;
    typeAnnotation = `None | ${typeAnnotation}`;
  }

  lines.push(`# Computed property: ${cp.name} (expression: ${cp.expression.kind})`);
  lines.push(`@computed_field`);
  lines.push(`@property`);
  lines.push(`def ${fieldName}(self) -> ${typeAnnotation}:`);
  lines.push(`    \"\"\"Computed property from IR.\"\"\"`);
  lines.push(`    # TODO: Implement computed property logic from expression`);
  lines.push(`    raise NotImplementedError(\"Computed property '${cp.name}' not implemented\")`);

  return lines;
}

// ============================================================================
// Command model generation
// ============================================================================

function generateCommandModel(
  command: IRCommand,
  analysisOptions: PydanticProjectionOptions,
  diagnostics: ProjectionDiagnostic[],
): { lines: string[]; needsTyping: boolean } {
  const lines: string[] = [];
  const opts = normalizeOptions(analysisOptions);
  const imports: ImportTracker = {
    needsDatetime: opts.emitDatetimeImports !== false,
    needsTyping: opts.emitTypingImports !== false,
    needsUuid: opts.emitUuidImport !== false,
    needsDecimal: opts.emitDecimalImport !== false,
  };

  const name = pascalCase(command.name);
  const schemaName = `${name}Params`;

  // Command parameter model
  lines.push(`# Command: ${command.name}${command.entity ? ` on ${command.entity}` : ''}`);

  if (command.parameters.length === 0) {
    lines.push(`class ${schemaName}(BaseModel):`);
    lines.push(`    \"\"\"Parameter model for command '${command.name}'.\"\"\"`);
    lines.push(`    pass`);
  } else {
    lines.push(`class ${schemaName}(BaseModel):`);
    lines.push(`    \"\"\"Parameter model for command '${command.name}'.\"\"\"`);
    lines.push('');

    for (const param of command.parameters) {
      const paramResult = generateParameterLine(param, diagnostics, imports, opts);
      lines.push(...paramResult.lines.map(l => '    ' + l));
    }
  }

  // Return type model if command has a return type
  if (command.returns) {
    lines.push('');
    lines.push('');
    const returnExpr = irTypeToPython(command.returns, diagnostics, imports);
    const returnName = `${name}Return`;
    lines.push(`class ${returnName}(BaseModel):`);
    lines.push(`    \"\"\"Return type model for command '${command.name}'.\"\"\"`);
    lines.push(`    value: ${returnExpr}`);
  }

  return { lines, needsTyping: imports.needsTyping };
}

function generateParameterLine(
  param: IRParameter,
  diagnostics: ProjectionDiagnostic[],
  imports: ImportTracker,
  _opts: ReturnType<typeof normalizeOptions>,
): PropertyLineResult {
  const lines: string[] = [];
  const fieldName = snakeCase(param.name);
  let typeAnnotation = irTypeToPython(param.type, diagnostics, imports);

  const hasDefault = param.defaultValue !== undefined;
  const isNullable = param.type.nullable;

  let fieldDecl = `${fieldName}: ${typeAnnotation}`;

  if (hasDefault) {
    fieldDecl += ` = ${irValueToPythonLiteral(param.defaultValue!)}`;
  } else if (!param.required && isNullable) {
    imports.needsTyping = true;
    fieldDecl = `${fieldName}: ${typeAnnotation} | None = None`;
  } else if (!param.required) {
    imports.needsTyping = true;
    fieldDecl = `${fieldName}: ${typeAnnotation} | None = None`;
  }

  lines.push(fieldDecl);

  return { lines };
}

// ============================================================================
// Enum model generation
// ============================================================================

function generateEnumModel(enumDef: IREnum): string[] {
  const lines: string[] = [];
  const name = pascalCase(enumDef.name);

  lines.push(`# Enum: ${enumDef.name}`);
  lines.push(`class ${name}(str):`);
  lines.push(`    """${name} enum from Manifest IR enum '${enumDef.name}'."""`);
  lines.push('    ');

  for (const value of enumDef.values) {
    const pascalValue = pascalCase(value.name);
    if (value.label) {
      lines.push(`    ${pascalValue} = "${value.name}"  # ${value.label}`);
    } else {
      lines.push(`    ${pascalValue} = "${value.name}"`);
    }
  }

  return lines;
}

// ============================================================================
// Options normalization
// ============================================================================

function normalizeOptions(options?: PydanticProjectionOptions): {
  emitTypes: boolean;
  emitComputedFields: boolean;
  pydanticImportPath: string;
  emitDatetimeImports: boolean;
  emitTypingImports: boolean;
  emitUuidImport: boolean;
  emitDecimalImport: boolean;
  emitHeader: boolean;
  useFieldFunction: boolean;
  emitJsonSchema: boolean;
} {
  return {
    emitTypes: options?.emitTypes !== false,
    emitComputedFields: options?.emitComputedFields !== false,
    pydanticImportPath: options?.pydanticImportPath ?? 'pydantic',
    emitDatetimeImports: options?.emitDatetimeImports !== false,
    emitTypingImports: options?.emitTypingImports !== false,
    emitUuidImport: options?.emitUuidImport !== false,
    emitDecimalImport: options?.emitDecimalImport !== false,
    emitHeader: options?.emitHeader !== false,
    useFieldFunction: options?.useFieldFunction ?? false,
    emitJsonSchema: options?.emitJsonSchema ?? false,
  };
}

// ============================================================================
// Import generation
// ============================================================================

function generateImports(
  needsDatetime: boolean,
  needsTyping: boolean,
  needsUuid: boolean,
  needsDecimal: boolean,
  needsRe: boolean,
  needsComputedField: boolean,
  pydanticImportPath: string,
  emitHeader: boolean,
): string[] {
  const lines: string[] = [];

  if (emitHeader) {
    lines.push('# Auto-generated by Manifest Pydantic projection');
    lines.push(`# Generated at: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('# This code generates Pydantic v2 BaseModel classes from Manifest IR entities.');
    lines.push('# Pydantic v2 documentation: https://docs.pydantic.dev/');
    lines.push('');
  }

  // Standard library imports
  if (needsRe) {
    lines.push('import re');
  }

  lines.push('');

  // Pydantic imports
  lines.push(`from ${pydanticImportPath} import BaseModel, field_validator`);

  if (needsComputedField) {
    lines.push(`from ${pydanticImportPath} import computed_field`);
  }

  // Type imports
  const typeImports: string[] = [];
  if (needsTyping) {
    typeImports.push('Any');
  }

  if (typeImports.length > 0) {
    lines.push(`from typing import ${typeImports.join(', ')}`);
  }

  // Special type imports
  if (needsDatetime) {
    lines.push('from datetime import date, datetime');
  }
  if (needsUuid) {
    lines.push('from uuid import UUID');
  }
  if (needsDecimal) {
    lines.push('from decimal import Decimal');
  }

  lines.push('');
  lines.push('');

  return lines;
}

// ============================================================================
// Main projection class
// ============================================================================

export class PydanticProjection implements ProjectionTarget {
  readonly name = 'pydantic';
  readonly description = 'Pydantic v2 models for IR entities and commands with field validators and JSON schema export';
  readonly surfaces = ['pydantic.entity', 'pydantic.command', 'pydantic.models', 'pydantic.client'] as const;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const diagnostics: ProjectionDiagnostic[] = [];
    const opts = normalizeOptions(request.options as PydanticProjectionOptions | undefined);

    switch (request.surface) {
      case 'pydantic.entity':
        return this.generateEntitySurface(ir, request, opts, diagnostics);
      case 'pydantic.command':
        return this.generateCommandSurface(ir, request, opts, diagnostics);
      case 'pydantic.models':
        return this.generateAllSurface(ir, opts, diagnostics);
      case 'pydantic.client':
        return this.generateClientSurface(ir, opts, diagnostics);
      default:
        return {
          artifacts: [],
          diagnostics: [{
            severity: 'error',
            code: 'PYDANTIC_UNKNOWN_SURFACE',
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
          code: 'PYDANTIC_ENTITY_NOT_FOUND',
          message: `Entity "${request.entity}" not found in IR`,
          entity: request.entity,
        }],
      };
    }

    const artifacts: ProjectionArtifact[] = [];

    for (const entity of entities) {
      const result = generateEntityModel(entity, opts, diagnostics);
      const imports = generateImports(
        opts.emitDatetimeImports,
        opts.emitTypingImports,
        opts.emitUuidImport,
        opts.emitDecimalImport,
        result.needsRe,
        result.hasComputed,
        opts.pydanticImportPath,
        opts.emitHeader,
      );

      const code = [...imports, ...result.lines].join('\n');

      artifacts.push({
        id: `pydantic.entity.${entity.name}`,
        pathHint: `models/${entity.name}.py`,
        contentType: 'python',
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
          code: 'PYDANTIC_COMMAND_NOT_FOUND',
          message: `Command "${request.command}" not found in IR`,
        }],
      };
    }

    const artifacts: ProjectionArtifact[] = [];

    for (const command of commands) {
      const result = generateCommandModel(command, opts, diagnostics);
      const imports = generateImports(
        opts.emitDatetimeImports,
        result.needsTyping,
        opts.emitUuidImport,
        opts.emitDecimalImport,
        false,
        false,
        opts.pydanticImportPath,
        opts.emitHeader,
      );

      const code = [...imports, ...result.lines].join('\n');

      artifacts.push({
        id: `pydantic.command.${command.name}`,
        pathHint: `models/commands/${command.name}.py`,
        contentType: 'python',
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
    // Pre-scan imports to populate any side-effect state (regenerated as finalImports below)
    generateImports(
      opts.emitDatetimeImports,
      opts.emitTypingImports,
      opts.emitUuidImport,
      opts.emitDecimalImport,
      false, // will detect if any entity needs re
      false, // will detect if any entity has computed
      opts.pydanticImportPath,
      opts.emitHeader,
    );

    // Scan all entities to detect if we need re or computed_field
    let needsRe = false;
    let needsComputed = false;

    const lines: string[] = [];

    // Add all entity models
    for (const entity of ir.entities) {
      const result = generateEntityModel(entity, opts, diagnostics);
      if (result.needsRe) needsRe = true;
      if (result.hasComputed) needsComputed = true;
      lines.push(...result.lines);
      lines.push('');
      lines.push('');
    }

    // Add all command models
    for (const command of ir.commands) {
      const result = generateCommandModel(command, opts, diagnostics);
      lines.push(...result.lines);
      lines.push('');
      lines.push('');
    }

    // Add all enum models
    if (ir.enums && ir.enums.length > 0) {
      lines.push('# Enums');
      lines.push('');
      for (const enumDef of ir.enums) {
        const enumLines = generateEnumModel(enumDef);
        lines.push(...enumLines);
        lines.push('');
        lines.push('');
      }
    }

    // Regenerate imports with correct detection
    const finalImports = generateImports(
      opts.emitDatetimeImports,
      opts.emitTypingImports,
      opts.emitUuidImport,
      opts.emitDecimalImport,
      needsRe,
      needsComputed,
      opts.pydanticImportPath,
      opts.emitHeader,
    );

    const code = [...finalImports, ...lines].join('\n');

    return {
      artifacts: [{
        id: 'pydantic.models',
        pathHint: 'models/manifest_models.py',
        contentType: 'python',
        code,
      }],
      diagnostics,
    };
  }

  private generateClientSurface(
    ir: IR,
    opts: ReturnType<typeof normalizeOptions>,
    diagnostics: ProjectionDiagnostic[],
  ): ProjectionResult {
    const result = generatePythonClient(ir, opts, diagnostics);
    return {
      artifacts: [{
        id: 'pydantic.client',
        pathHint: 'client/manifest_client.py',
        contentType: 'python',
        code: result.code,
      }],
      diagnostics: result.diagnostics,
    };
  }
}

// ============================================================================
// Python Client SDK generation
// ============================================================================

interface ClientResult {
  code: string;
  diagnostics: ProjectionDiagnostic[];
}

function generatePythonClient(
  ir: IR,
  opts: ReturnType<typeof normalizeOptions>,
  diagnostics: ProjectionDiagnostic[],
): ClientResult {
  const lines: string[] = [];

  // Header
  if (opts.emitHeader) {
    lines.push('# Auto-generated Python client SDK from Manifest IR');
    lines.push(`# Generated at: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('# This code generates an async httpx-based client for Manifest entities and commands.');
    lines.push('# Compatible with Python 3.10+');
    lines.push('');
  }

  // Imports
  lines.push('import asyncio');
  lines.push('from typing import Any, Optional');
  lines.push('import httpx');
  lines.push('from pydantic import BaseModel');
  lines.push('');
  lines.push('');

  // Client class
  lines.push('class ManifestClient:');
  lines.push('    """');
  lines.push('    Async client for Manifest API with typed command invocation methods.');
  lines.push('    ');
  lines.push('    Example:');
  lines.push('        async with ManifestClient(base_url="http://localhost:3000") as client:');
  lines.push('            result = await client.create_user(email="user@example.com", name="John")');
  lines.push('    """');
  lines.push('');
  lines.push('');
  lines.push('    def __init__(self, base_url: str = "http://localhost:3000", api_key: Optional[str] = None):');
  lines.push('        self._base_url = base_url.rstrip("/")');
  lines.push('        self._api_key = api_key');
  lines.push('        self._client: Optional[httpx.AsyncClient] = None');
  lines.push('    ');
  lines.push('    async def __aenter__(self):');
  lines.push('        self._client = httpx.AsyncClient(');
  lines.push('            base_url=self._base_url,');
  lines.push('            headers={"Authorization": f"Bearer {self._api_key}"} if self._api_key else {},');
  lines.push('        )');
  lines.push('        return self');
  lines.push('    ');
  lines.push('    async def __aexit__(self, exc_type, exc_val, exc_tb):');
  lines.push('        if self._client:');
  lines.push('            await self._client.aclose()');
  lines.push('    ');
  lines.push('    async def _request(self, method: str, path: str, **kwargs) -> dict[str, Any]:');
  lines.push('        """Make an HTTP request and return the JSON response."""');
  lines.push('        if not self._client:');
  lines.push('            raise RuntimeError("Client not initialized. Use `async with ManifestClient(...) as client:`")');
  lines.push('        response = await self._client.request(method, path, **kwargs)');
  lines.push('        response.raise_for_status()');
  lines.push('        return response.json()');
  lines.push('    ');
  lines.push('    # Entity query methods');
  lines.push('');

  // Generate entity query methods
  for (const entity of ir.entities) {
    const lowerEntity = entity.name.toLowerCase();
    const snakeEntity = snakeCase(entity.name);

    // List method
    lines.push(`    async def list_${snakeEntity}s(self) -> list[dict[str, Any]]:`);
    lines.push(`        """Get all ${entity.name} entities."""`);
    lines.push(`        return await self._request("GET", "/api/${lowerEntity}/list")`);
    lines.push('');

    // Get by ID method
    lines.push(`    async def get_${snakeEntity}(self, id: str) -> dict[str, Any]:`);
    lines.push(`        """Get a ${entity.name} by ID."""`);
    lines.push(`        return await self._request("GET", f"/api/${lowerEntity}/{id}")`);
    lines.push('');
  }

  lines.push('    # Command invocation methods');
  lines.push('');

  // Generate command invocation methods
  for (const command of ir.commands) {
    if (!command.entity) continue; // Skip global commands for now

    const snakeCommand = snakeCase(command.name);

    lines.push(`    async def ${snakeCommand}(`);
    lines.push(`        self,`);
    lines.push(`        entity_id: Optional[str] = None,`);

    // Add parameters
    for (const param of command.parameters) {
      const snakeParam = snakeCase(param.name);
      const typeAnnotation = irTypeToPython(param.type, diagnostics, { needsDatetime: false, needsTyping: true, needsUuid: false, needsDecimal: false });

      if (!param.required) {
        lines.push(`        ${snakeParam}: ${typeAnnotation} | None = None,`);
      } else {
        lines.push(`        ${snakeParam}: ${typeAnnotation},`);
      }
    }

    lines.push(`    ) -> dict[str, Any]:`);
    lines.push(`        """Execute the ${command.name} command on ${command.entity}."""`);
    lines.push(`        payload = {`);

    for (const param of command.parameters) {
      const snakeParam = snakeCase(param.name);
      lines.push(`            "${param.name}": ${snakeParam},`);
    }

    lines.push(`        }`);
    lines.push(`        `);

    if (command.entity) {
      const lowerEntity = command.entity.toLowerCase();
      lines.push(`        # Filter out None values`);
      lines.push(`        payload = {k: v for k, v in payload.items() if v is not None}`);
      lines.push(`        return await self._request("POST", f"/api/${lowerEntity}/commands/${command.name}", json=payload)`);
    }

    lines.push('');
    lines.push('');
  }

  // Generate enum classes
  if (ir.enums && ir.enums.length > 0) {
    lines.push('');
    lines.push('');
    lines.push('# Enums');
    lines.push('');

    for (const enumDef of ir.enums) {
      lines.push(`class ${pascalCase(enumDef.name)}(str):`);
      for (const value of enumDef.values) {
        const pascalValue = pascalCase(value.name);
        lines.push(`    ${pascalValue} = "${value.name}"`);
      }
      lines.push('');
    }
  }

  // Generate standalone functions for convenience
  lines.push('');
  lines.push('');
  lines.push('# Convenience functions (create client implicitly)');
  lines.push('');
  lines.push('async def _get_default_client() -> ManifestClient:');
  lines.push('    """Get or create the default singleton client."""');
  lines.push('    if not hasattr(_get_default_client, "_client"):');
  lines.push('        _get_default_client._client = ManifestClient()  # type: ignore');
  lines.push('        await _get_default_client._client.__aenter__()  # type: ignore');
  lines.push('    return _get_default_client._client  # type: ignore');
  lines.push('');

  // Generate command functions
  for (const command of ir.commands) {
    if (!command.entity) continue;

    const snakeCommand = snakeCase(command.name);

    lines.push(`async def ${snakeCommand}(`);
    lines.push(`    base_url: str = "http://localhost:3000",`);
    lines.push(`    api_key: Optional[str] = None,`);

    for (const param of command.parameters) {
      const snakeParam = snakeCase(param.name);
      const typeAnnotation = irTypeToPython(param.type, diagnostics, { needsDatetime: false, needsTyping: true, needsUuid: false, needsDecimal: false });

      if (!param.required) {
        lines.push(`    ${snakeParam}: ${typeAnnotation} | None = None,`);
      } else {
        lines.push(`    ${snakeParam}: ${typeAnnotation},`);
      }
    }

    lines.push(`) -> dict[str, Any]:`);
    lines.push(`    """Execute the ${command.name} command."""`);
    lines.push(`    async with ManifestClient(base_url=base_url, api_key=api_key) as client:`);
    lines.push(`        return await client.${snakeCommand}(`);

    for (const param of command.parameters) {
      const snakeParam = snakeCase(param.name);
      lines.push(`            ${snakeParam}=${snakeParam},`);
    }

    lines.push(`        )`);
    lines.push('');
  }

  return { code: lines.join('\n'), diagnostics };
}
