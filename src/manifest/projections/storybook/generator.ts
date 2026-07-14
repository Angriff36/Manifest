/**
 * Storybook CSF3 projection for Manifest IR.
 *
 * Generates Component Story Format 3 stories and arg types from IR entities
 * and commands. Each entity gets a default story with all properties as
 * controls. Each command gets interaction stories demonstrating guard scenarios.
 *
 * Helps design teams preview UI states driven by real domain constraints.
 */

import type { IR, IREntity, IRCommand, IRProperty, IRType, IRValue, IRExpression } from '../../ir';
import { STORYBOOK_DESCRIPTOR_META } from './descriptor-meta.js';
import type {
  ProjectionTarget,
  ProjectionRequest,
  ProjectionResult,
  ProjectionArtifact,
  ProjectionDiagnostic,
} from '../interface';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface StorybookProjectionOptions {
  /**
   * Component import path pattern.
   * Use `{Entity}` as placeholder for entity PascalCase name.
   * Use `{Command}` as placeholder for command PascalCase name.
   * Default: '@/components/{Entity}'
   */
  componentImportPattern?: string;

  /** Storybook title prefix for story hierarchy (default: 'Manifest') */
  titlePrefix?: string;

  /** Whether to generate guard pass/fail interaction stories (default: true) */
  includeGuardScenarios?: boolean;

  /** Whether to generate constraint violation stories (default: true) */
  includeConstraintStories?: boolean;
}

interface NormalizedOptions {
  componentImportPattern: string;
  titlePrefix: string;
  includeGuardScenarios: boolean;
  includeConstraintStories: boolean;
}

function normalizeOptions(raw?: Record<string, unknown>): NormalizedOptions {
  const opts = (raw ?? {}) as Partial<StorybookProjectionOptions>;
  return {
    componentImportPattern: opts.componentImportPattern ?? '@/components/{Entity}',
    titlePrefix: opts.titlePrefix ?? 'Manifest',
    includeGuardScenarios: opts.includeGuardScenarios ?? true,
    includeConstraintStories: opts.includeConstraintStories ?? true,
  };
}

// ---------------------------------------------------------------------------
// Type mapping: IRType → Storybook control configuration
// ---------------------------------------------------------------------------

interface ControlConfig {
  control: string | { type: string; step?: number };
  options?: string[];
}

const BASE_CONTROL_MAP: Record<string, ControlConfig> = {
  string: { control: 'text' },
  text: { control: 'text' },
  uuid: { control: 'text' },
  email: { control: 'text' },
  url: { control: 'text' },
  boolean: { control: 'boolean' },
  bool: { control: 'boolean' },
  number: { control: { type: 'number' } },
  float: { control: { type: 'number', step: 0.1 } },
  decimal: { control: { type: 'number', step: 0.01 } },
  money: { control: { type: 'number', step: 0.01 } },
  int: { control: { type: 'number', step: 1 } },
  integer: { control: { type: 'number', step: 1 } },
  date: { control: 'date' },
  datetime: { control: 'date' },
};

function irTypeToControl(type: IRType, ir: IR): ControlConfig {
  // Check base type map
  const base = BASE_CONTROL_MAP[type.name];
  if (base) return base;

  // Check if it's an enum reference
  const enumDef = ir.enums.find((e) => e.name === type.name);
  if (enumDef) {
    return { control: 'select', options: enumDef.values.map((v) => v.name) };
  }

  // Array types
  if (type.name === 'array') {
    return { control: 'object' };
  }

  // Fallback for entity references and unknown types
  return { control: 'text' };
}

function controlToString(config: ControlConfig): string {
  const parts: string[] = [];
  if (typeof config.control === 'string') {
    parts.push(`control: '${config.control}'`);
  } else {
    const inner = Object.entries(config.control)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join(', ');
    parts.push(`control: { ${inner} }`);
  }
  if (config.options) {
    parts.push(`options: [${config.options.map((o) => `'${o}'`).join(', ')}]`);
  }
  return `{ ${parts.join(', ')} }`;
}

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

function irValueToLiteral(value: IRValue): string {
  switch (value.kind) {
    case 'string':
      return JSON.stringify(value.value);
    case 'number':
      return String(value.value);
    case 'boolean':
      return String(value.value);
    case 'null':
      return 'null';
    case 'array':
      return '[]';
    case 'object':
      return '{}';
    default:
      return "''";
  }
}

function defaultValueForType(type: IRType): string {
  const name = type.name;
  if (name === 'string' || name === 'text' || name === 'uuid' || name === 'email' || name === 'url')
    return "''";
  if (name === 'number' || name === 'float' || name === 'decimal' || name === 'money') return '0';
  if (name === 'int' || name === 'integer') return '0';
  if (name === 'boolean' || name === 'bool') return 'false';
  if (name === 'date' || name === 'datetime') return 'new Date().toISOString()';
  return "''";
}

function sampleValueForType(type: IRType, ir: IR): string {
  const name = type.name;
  if (name === 'string' || name === 'text') return "'sample'";
  if (name === 'uuid') return "'00000000-0000-0000-0000-000000000001'";
  if (name === 'email') return "'user@example.com'";
  if (name === 'url') return "'https://example.com'";
  if (name === 'number' || name === 'float' || name === 'decimal' || name === 'money') return '1';
  if (name === 'int' || name === 'integer') return '1';
  if (name === 'boolean' || name === 'bool') return 'true';
  if (name === 'date' || name === 'datetime') return "'2025-01-01T00:00:00.000Z'";
  // enum: use first value
  const enumDef = ir.enums.find((e) => e.name === name);
  if (enumDef && enumDef.values.length > 0) return `'${enumDef.values[0].name}'`;
  return "'sample'";
}

// ---------------------------------------------------------------------------
// Guard expression heuristic for pass/fail args
// ---------------------------------------------------------------------------

interface GuardArgs {
  pass: Record<string, string>;
  fail: Record<string, string>;
}

function analyzeGuardsForArgs(
  guards: IRExpression[],
  parameters: { name: string; type: IRType }[],
  ir: IR,
): GuardArgs {
  const pass: Record<string, string> = {};
  const fail: Record<string, string> = {};

  // Initialize with sample values for all params (pass) and empty/zero (fail)
  for (const param of parameters) {
    pass[param.name] = sampleValueForType(param.type, ir);
    fail[param.name] = defaultValueForType(param.type);
  }

  // Analyze first guard for specific fail scenario
  if (guards.length > 0) {
    const guard = guards[0];
    if (guard.kind === 'binary' && guard.operator === '!=') {
      // e.g., newStatus != ""
      const left = guard.left;
      const right = guard.right;
      if (left.kind === 'identifier' && right.kind === 'literal') {
        const paramName = left.name;
        const litValue = irValueToLiteral(right.value);
        fail[paramName] = litValue;
        // Ensure pass is different from the literal
        if (right.value.kind === 'string' && right.value.value === '') {
          pass[paramName] = "'valid-value'";
        } else if (right.value.kind === 'number' && right.value.value === 0) {
          pass[paramName] = '1';
        }
      }
    }
  }

  return { pass, fail };
}

// ---------------------------------------------------------------------------
// Code generation: Entity stories
// ---------------------------------------------------------------------------

function pascalCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function generateEntityStory(entity: IREntity, ir: IR, opts: NormalizedOptions): string {
  const name = entity.name;
  const componentPath = opts.componentImportPattern.replace(/\{Entity\}/g, name);
  const componentName = `${name}Card`;

  const lines: string[] = [];

  // Header
  lines.push(`// Auto-generated by Manifest Storybook projection`);
  lines.push(`// Entity: ${name}`);
  lines.push('');
  lines.push(`import type { Meta, StoryObj } from '@storybook/react';`);
  lines.push(`import { ${componentName} } from '${componentPath}';`);
  lines.push('');

  // ArgTypes
  lines.push('const argTypes = {');
  for (const prop of entity.properties) {
    if (prop.modifiers.includes('private')) continue;
    const config = irTypeToControl(prop.type, ir);
    const desc = descriptionForProperty(prop);
    lines.push(
      `  ${prop.name}: { ${controlToString(config).slice(2, -2)}, description: '${desc}' },`,
    );
  }
  // Computed properties — read-only
  for (const comp of entity.computedProperties) {
    lines.push(`  ${comp.name}: { control: false, description: 'Computed' },`);
  }
  lines.push('};');
  lines.push('');

  // Meta
  lines.push(`const meta: Meta<typeof ${componentName}> = {`);
  lines.push(`  title: '${opts.titlePrefix}/Entities/${name}',`);
  lines.push(`  component: ${componentName},`);
  lines.push('  argTypes,');
  if (entity.constraints.length > 0) {
    const constraintNames = entity.constraints.map((c) => `'${c.name}'`).join(', ');
    lines.push('  parameters: {');
    lines.push(`    manifest: { entity: '${name}', constraints: [${constraintNames}] },`);
    lines.push('  },');
  }
  lines.push('};');
  lines.push('');
  lines.push('export default meta;');
  lines.push('type Story = StoryObj<typeof meta>;');
  lines.push('');

  // Default story
  lines.push('export const Default: Story = {');
  lines.push('  args: {');
  for (const prop of entity.properties) {
    if (prop.modifiers.includes('private')) continue;
    const val = prop.defaultValue
      ? irValueToLiteral(prop.defaultValue)
      : defaultValueForType(prop.type);
    lines.push(`    ${prop.name}: ${val},`);
  }
  lines.push('  },');
  lines.push('};');

  // Complete story (with sample values for required fields)
  lines.push('');
  lines.push('export const Complete: Story = {');
  lines.push('  args: {');
  for (const prop of entity.properties) {
    if (prop.modifiers.includes('private')) continue;
    lines.push(`    ${prop.name}: ${sampleValueForType(prop.type, ir)},`);
  }
  lines.push('  },');
  lines.push('};');

  // Constraint violation story
  if (opts.includeConstraintStories && entity.constraints.length > 0) {
    const firstConstraint = entity.constraints[0];
    lines.push('');
    lines.push('export const ConstraintViolation: Story = {');
    lines.push('  args: {');
    for (const prop of entity.properties) {
      if (prop.modifiers.includes('private')) continue;
      lines.push(`    ${prop.name}: ${defaultValueForType(prop.type)},`);
    }
    lines.push('  },');
    lines.push('  parameters: {');
    lines.push(`    manifest: { constraintViolations: ['${firstConstraint.name}'] },`);
    lines.push('  },');
    lines.push('};');
  }

  lines.push('');
  return lines.join('\n');
}

function descriptionForProperty(prop: IRProperty): string {
  const parts: string[] = [];
  if (prop.modifiers.includes('required')) parts.push('required');
  if (prop.modifiers.includes('optional')) parts.push('optional');
  if (prop.modifiers.includes('unique')) parts.push('unique');
  if (prop.modifiers.includes('readonly')) parts.push('readonly');
  if (prop.defaultValue) parts.push(`default: ${irValueToLiteral(prop.defaultValue)}`);
  return parts.length > 0 ? parts.join(', ') : prop.type.name;
}

// ---------------------------------------------------------------------------
// Code generation: Command stories
// ---------------------------------------------------------------------------

function generateCommandStory(command: IRCommand, ir: IR, opts: NormalizedOptions): string {
  const name = pascalCase(command.name);
  const entityName = command.entity ?? 'Global';
  const componentPath = opts.componentImportPattern
    .replace(/\{Entity\}/g, `${entityName}/${name}Form`)
    .replace(/\{Command\}/g, name);
  const componentName = `${name}Form`;

  const lines: string[] = [];

  // Header
  lines.push(`// Auto-generated by Manifest Storybook projection`);
  lines.push(`// Command: ${command.name} on ${entityName}`);
  lines.push('');
  lines.push(`import type { Meta, StoryObj } from '@storybook/react';`);
  if (opts.includeGuardScenarios && command.guards.length > 0) {
    lines.push(`import { within, expect } from '@storybook/test';`);
  }
  lines.push(`import { ${componentName} } from '${componentPath}';`);
  lines.push('');

  // ArgTypes
  lines.push('const argTypes = {');
  for (const param of command.parameters) {
    const config = irTypeToControl(param.type, ir);
    const desc = param.required ? 'required' : 'optional';
    lines.push(
      `  ${param.name}: { ${controlToString(config).slice(2, -2)}, description: '${desc}' },`,
    );
  }
  lines.push('};');
  lines.push('');

  // Meta
  lines.push(`const meta: Meta<typeof ${componentName}> = {`);
  lines.push(`  title: '${opts.titlePrefix}/Commands/${entityName}/${name}',`);
  lines.push(`  component: ${componentName},`);
  lines.push('  argTypes,');
  if (command.guards.length > 0) {
    const guardExprs = command.guards.map((g) => `'${expressionToString(g)}'`).join(', ');
    lines.push('  parameters: {');
    lines.push(
      `    manifest: { command: '${command.name}', entity: '${entityName}', guards: [${guardExprs}] },`,
    );
    lines.push('  },');
  }
  lines.push('};');
  lines.push('');
  lines.push('export default meta;');
  lines.push('type Story = StoryObj<typeof meta>;');
  lines.push('');

  const guardArgs = analyzeGuardsForArgs(command.guards, command.parameters, ir);

  // GuardsPass story
  lines.push('export const GuardsPass: Story = {');
  lines.push('  args: {');
  for (const param of command.parameters) {
    lines.push(
      `    ${param.name}: ${guardArgs.pass[param.name] ?? sampleValueForType(param.type, ir)},`,
    );
  }
  lines.push('  },');
  if (opts.includeGuardScenarios && command.guards.length > 0) {
    lines.push('  play: async ({ canvasElement }) => {');
    lines.push('    const canvas = within(canvasElement);');
    lines.push(`    await expect(canvas.getByTestId('guard-status')).toHaveTextContent('pass');`);
    lines.push('  },');
  }
  lines.push('};');

  // GuardFails story
  if (opts.includeGuardScenarios && command.guards.length > 0) {
    lines.push('');
    lines.push('export const GuardFails: Story = {');
    lines.push('  args: {');
    for (const param of command.parameters) {
      lines.push(
        `    ${param.name}: ${guardArgs.fail[param.name] ?? defaultValueForType(param.type)},`,
      );
    }
    lines.push('  },');
    lines.push('  play: async ({ canvasElement }) => {');
    lines.push('    const canvas = within(canvasElement);');
    lines.push(`    await expect(canvas.getByTestId('guard-status')).toHaveTextContent('denied');`);
    lines.push('  },');
    lines.push('};');
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Expression serialization (for metadata display only)
// ---------------------------------------------------------------------------

function expressionToString(expr: IRExpression): string {
  switch (expr.kind) {
    case 'literal':
      return irValueToLiteral(expr.value);
    case 'identifier':
      return expr.name;
    case 'member':
      return `${expressionToString(expr.object)}.${expr.property}`;
    case 'binary':
      return `${expressionToString(expr.left)} ${expr.operator} ${expressionToString(expr.right)}`;
    case 'unary':
      return `${expr.operator}${expressionToString(expr.operand)}`;
    case 'call':
      return `${expressionToString(expr.callee)}(...)`;
    default:
      return '(...)';
  }
}

// ---------------------------------------------------------------------------
// StorybookProjection class
// ---------------------------------------------------------------------------

export class StorybookProjection implements ProjectionTarget {
  readonly name = 'storybook';
  readonly description = 'Storybook CSF3 stories with typed controls from IR entities and commands';
  readonly surfaces = ['storybook.entity', 'storybook.command', 'storybook.all'] as const;
  readonly descriptorMeta = STORYBOOK_DESCRIPTOR_META;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const opts = normalizeOptions(request.options);

    switch (request.surface) {
      case 'storybook.entity':
        return this._generateEntitySurface(ir, request, opts);
      case 'storybook.command':
        return this._generateCommandSurface(ir, request, opts);
      case 'storybook.all':
        return this._generateAllSurface(ir, request, opts);
      default:
        return {
          artifacts: [],
          diagnostics: [
            {
              severity: 'error',
              code: 'UNKNOWN_SURFACE',
              message: `Unknown surface "${request.surface}". Available: ${this.surfaces.join(', ')}`,
            },
          ],
        };
    }
  }

  private _generateEntitySurface(
    ir: IR,
    request: ProjectionRequest,
    opts: NormalizedOptions,
  ): ProjectionResult {
    const artifacts: ProjectionArtifact[] = [];
    const diagnostics: ProjectionDiagnostic[] = [];

    if (request.entity) {
      const entity = ir.entities.find((e) => e.name === request.entity);
      if (!entity) {
        return {
          artifacts: [],
          diagnostics: [
            {
              severity: 'error',
              code: 'ENTITY_NOT_FOUND',
              message: `Entity "${request.entity}" not found in IR`,
              entity: request.entity,
            },
          ],
        };
      }
      artifacts.push(this._entityArtifact(entity, ir, opts));
    } else {
      for (const entity of ir.entities) {
        artifacts.push(this._entityArtifact(entity, ir, opts));
      }
    }

    return { artifacts, diagnostics };
  }

  private _generateCommandSurface(
    ir: IR,
    request: ProjectionRequest,
    opts: NormalizedOptions,
  ): ProjectionResult {
    const artifacts: ProjectionArtifact[] = [];
    const diagnostics: ProjectionDiagnostic[] = [];

    if (request.command) {
      const command = ir.commands.find((c) => c.name === request.command);
      if (!command) {
        return {
          artifacts: [],
          diagnostics: [
            {
              severity: 'error',
              code: 'COMMAND_NOT_FOUND',
              message: `Command "${request.command}" not found in IR`,
            },
          ],
        };
      }
      artifacts.push(this._commandArtifact(command, ir, opts));
    } else {
      for (const command of ir.commands) {
        artifacts.push(this._commandArtifact(command, ir, opts));
      }
    }

    return { artifacts, diagnostics };
  }

  private _generateAllSurface(
    ir: IR,
    _request: ProjectionRequest,
    opts: NormalizedOptions,
  ): ProjectionResult {
    const artifacts: ProjectionArtifact[] = [];
    const diagnostics: ProjectionDiagnostic[] = [];

    for (const entity of ir.entities) {
      artifacts.push(this._entityArtifact(entity, ir, opts));
    }
    for (const command of ir.commands) {
      artifacts.push(this._commandArtifact(command, ir, opts));
    }

    return { artifacts, diagnostics };
  }

  private _entityArtifact(entity: IREntity, ir: IR, opts: NormalizedOptions): ProjectionArtifact {
    return {
      id: `storybook.entity.${entity.name}`,
      pathHint: `stories/${entity.name}.stories.tsx`,
      contentType: 'typescript',
      code: generateEntityStory(entity, ir, opts),
    };
  }

  private _commandArtifact(
    command: IRCommand,
    ir: IR,
    opts: NormalizedOptions,
  ): ProjectionArtifact {
    const entityName = command.entity ?? 'Global';
    return {
      id: `storybook.command.${command.name}`,
      pathHint: `stories/${entityName}/${pascalCase(command.name)}.stories.tsx`,
      contentType: 'typescript',
      code: generateCommandStory(command, ir, opts),
    };
  }
}
