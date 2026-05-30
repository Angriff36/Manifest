/**
 * Express/Fastify projection for Manifest IR.
 *
 * Generates standalone router modules with typed request/response shapes,
 * auth middleware integration, and optional Zod request validation against
 * command parameter schemas.
 *
 * Surfaces:
 *   - express.router    → Complete router module with all entity routes
 *   - express.entity    → Single-entity router (entity-scoped)
 *   - express.types     → TypeScript request/response type definitions
 *   - express.all       → All surfaces combined
 *
 * The projection supports both Express and Fastify via the `framework` option.
 * Default is Express.
 */

import type {
  IR,
  IREntity,
  IRCommand,
  IRType,
  IRPolicy,
  IRExpression,
  IRValue,
} from '../../ir';
import type {
  ProjectionTarget,
  ProjectionRequest,
  ProjectionResult,
  ProjectionArtifact,
  ProjectionDiagnostic,
} from '../interface';
import type { ExpressProjectionOptions } from './types';

// ============================================================================
// Constants
// ============================================================================

const SURFACE_ROUTER = 'express.router' as const;
const SURFACE_ENTITY = 'express.entity' as const;
const SURFACE_TYPES = 'express.types' as const;
const SURFACE_ALL = 'express.all' as const;

const SURFACES = [SURFACE_ROUTER, SURFACE_ENTITY, SURFACE_TYPES, SURFACE_ALL] as const;

// ============================================================================
// Defaults
// ============================================================================

interface NormalizedOptions {
  framework: 'express' | 'fastify';
  authImportPath: string;
  authMiddlewareName: string;
  runtimeImportPath: string;
  runtimeFactoryName: string;
  validationImportPath: string | undefined;
  basePath: string;
  includeTenantContext: boolean;
  tenantIdProperty: string;
  emitTypes: boolean;
  emitHeader: boolean;
  publicReads: boolean;
  includeComments: boolean;
  generatedAt: string;
}

function normalizeOptions(opts: ExpressProjectionOptions): NormalizedOptions {
  return {
    framework: opts.framework ?? 'express',
    authImportPath: opts.authImportPath ?? './middleware/auth',
    authMiddlewareName: opts.authMiddlewareName ?? 'requireAuth',
    runtimeImportPath: opts.runtimeImportPath ?? './lib/manifest-runtime',
    runtimeFactoryName: opts.runtimeFactoryName ?? 'createManifestRuntime',
    validationImportPath: opts.validationImportPath,
    basePath: opts.basePath ?? '/api',
    includeTenantContext: opts.includeTenantContext ?? true,
    tenantIdProperty: opts.tenantIdProperty ?? 'tenantId',
    emitTypes: opts.emitTypes ?? true,
    emitHeader: opts.emitHeader ?? true,
    publicReads: opts.publicReads ?? false,
    includeComments: opts.includeComments ?? true,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
  };
}

// ============================================================================
// Type mapping: IR type → TypeScript type string
// ============================================================================

function irTypeToTs(irType: IRType): string {
  const baseMap: Record<string, string> = {
    string: 'string',
    number: 'number',
    integer: 'number',
    int: 'number',
    boolean: 'boolean',
    bool: 'boolean',
    date: 'string',
    datetime: 'string',
    uuid: 'string',
    email: 'string',
    url: 'string',
    uri: 'string',
    any: 'unknown',
    object: 'Record<string, unknown>',
    decimal: 'string',
  };

  let base: string;

  if (irType.name === 'array' && irType.generic) {
    base = `${irTypeToTs(irType.generic)}[]`;
  } else if (irType.name === 'map' && irType.generic) {
    base = `Record<string, ${irTypeToTs(irType.generic)}>`;
  } else if (irType.name === 'record') {
    base = 'Record<string, unknown>';
  } else {
    base = baseMap[irType.name] ?? 'unknown';
  }

  return irType.nullable ? `${base} | null` : base;
}

// ============================================================================
// Naming helpers
// ============================================================================

function toPascalCase(value: string): string {
  if (!value) return value;
  return value[0].toUpperCase() + value.slice(1);
}

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function toEntitySegment(name: string): string {
  return name.toLowerCase();
}

// ============================================================================
// Expression helpers (for comments)
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

function irValueToJson(value: IRValue): unknown {
  switch (value.kind) {
    case 'string': return value.value;
    case 'number': return value.value;
    case 'boolean': return value.value;
    case 'null': return null;
    case 'array': return value.elements.map(irValueToJson);
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
// Header generation
// ============================================================================

function emitHeader(options: NormalizedOptions): string {
  if (!options.emitHeader) return '';
  return [
    '/**',
    ` * Auto-generated by Manifest ${options.framework} projection.`,
    ` * Generated at: ${options.generatedAt}`,
    ' *',
    ' * DO NOT EDIT — regenerate with: manifest generate <ir> -p express',
    ' */',
    '',
  ].join('\n');
}

// ============================================================================
// Type generation (express.types surface)
// ============================================================================

function generateEntityType(entity: IREntity): string {
  const lines: string[] = [];

  lines.push(`export interface ${entity.name} {`);
  for (const prop of entity.properties) {
    const optional = !prop.modifiers.includes('required') ? '?' : '';
    lines.push(`  ${prop.name}${optional}: ${irTypeToTs(prop.type)};`);
  }
  for (const computed of entity.computedProperties) {
    lines.push(`  readonly ${computed.name}: ${irTypeToTs(computed.type)};`);
  }
  lines.push('}');

  return lines.join('\n');
}

function generateCommandParamsType(command: IRCommand): string {
  const lines: string[] = [];
  const typeName = `${toPascalCase(command.entity ?? 'Unknown')}${toPascalCase(command.name)}Params`;

  lines.push(`export interface ${typeName} {`);
  for (const param of command.parameters) {
    const optional = !param.required ? '?' : '';
    lines.push(`  ${param.name}${optional}: ${irTypeToTs(param.type)};`);
  }
  lines.push('}');

  return lines.join('\n');
}

function generateTypesSurface(
  ir: IR,
  options: NormalizedOptions,
  entityFilter?: string,
): { code: string; diagnostics: ProjectionDiagnostic[] } {
  const diagnostics: ProjectionDiagnostic[] = [];
  const lines: string[] = [];

  lines.push(emitHeader(options));

  const entities = entityFilter
    ? ir.entities.filter(e => e.name === entityFilter)
    : [...ir.entities].sort((a, b) => a.name.localeCompare(b.name));

  if (entityFilter && entities.length === 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'EXPRESS_ENTITY_NOT_FOUND',
      message: `Entity "${entityFilter}" not found in IR.`,
      entity: entityFilter,
    });
  }

  // Entity interfaces
  for (const entity of entities) {
    lines.push(generateEntityType(entity));
    lines.push('');
  }

  // Command parameter types
  const commands = entityFilter
    ? ir.commands.filter(c => c.entity === entityFilter)
    : [...ir.commands].sort((a, b) => {
        const aKey = `${a.entity ?? ''}.${a.name}`;
        const bKey = `${b.entity ?? ''}.${b.name}`;
        return aKey.localeCompare(bKey);
      });

  for (const command of commands) {
    if (command.parameters.length > 0) {
      lines.push(generateCommandParamsType(command));
      lines.push('');
    }
  }

  return { code: lines.join('\n').trimEnd() + '\n', diagnostics };
}

// ============================================================================
// Route handler generation
// ============================================================================

function generateCommandComment(
  command: IRCommand,
  entity: IREntity,
  policies: IRPolicy[],
): string {
  const lines: string[] = [];
  lines.push('  /**');
  lines.push(`   * ${toPascalCase(command.name)} command for ${entity.name}.`);

  if (command.guards.length > 0) {
    lines.push(`   * Guards: ${command.guards.length} (evaluated in order, halts on first failure)`);
    for (let i = 0; i < command.guards.length; i++) {
      lines.push(`   *   [${i}] ${expressionToString(command.guards[i])}`);
    }
  }

  if (command.constraints && command.constraints.length > 0) {
    lines.push(`   * Constraints: ${command.constraints.length}`);
  }

  const entityPolicies = policies.filter(p => p.entity === entity.name);
  if (entityPolicies.length > 0) {
    lines.push(`   * Policies: ${entityPolicies.map(p => p.name).join(', ')}`);
  }

  if (command.emits.length > 0) {
    lines.push(`   * Emits: ${command.emits.join(', ')}`);
  }

  lines.push('   */');
  return lines.join('\n');
}

function generateExpressEntityRouter(
  entity: IREntity,
  commands: IRCommand[],
  policies: IRPolicy[],
  options: NormalizedOptions,
): string {
  const segment = toEntitySegment(entity.name);
  const lines: string[] = [];
  const hasValidation = !!options.validationImportPath;

  // Entity-scoped commands
  const entityCommands = commands
    .filter(c => c.entity === entity.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  // GET list route
  if (options.includeComments) {
    lines.push('  /** List all ' + entity.name + ' entities */');
  }
  if (options.publicReads) {
    lines.push(`  router.get('/${segment}/list', async (req, res) => {`);
  } else {
    lines.push(`  router.get('/${segment}/list', ${options.authMiddlewareName}, async (req, res) => {`);
  }
  lines.push('    try {');
  lines.push(`      const runtime = ${options.runtimeFactoryName}();`);
  lines.push(`      const result = await runtime.list('${entity.name}'${options.includeTenantContext ? `, { ${options.tenantIdProperty}: req.user?.${options.tenantIdProperty} }` : ''});`);
  lines.push('      res.json(result);');
  lines.push('    } catch (err) {');
  lines.push('      res.status(500).json({ error: { code: \'INTERNAL_ERROR\', message: \'Internal server error\' } });');
  lines.push('    }');
  lines.push('  });');
  lines.push('');

  // GET detail route
  if (options.includeComments) {
    lines.push('  /** Get a single ' + entity.name + ' by ID */');
  }
  if (options.publicReads) {
    lines.push(`  router.get('/${segment}/:id', async (req, res) => {`);
  } else {
    lines.push(`  router.get('/${segment}/:id', ${options.authMiddlewareName}, async (req, res) => {`);
  }
  lines.push('    try {');
  lines.push(`      const runtime = ${options.runtimeFactoryName}();`);
  lines.push(`      const result = await runtime.get('${entity.name}', req.params.id${options.includeTenantContext ? `, { ${options.tenantIdProperty}: req.user?.${options.tenantIdProperty} }` : ''});`);
  lines.push('      if (!result) {');
  lines.push(`        return res.status(404).json({ error: { code: 'NOT_FOUND', message: '${entity.name} not found' } });`);
  lines.push('      }');
  lines.push('      res.json(result);');
  lines.push('    } catch (err) {');
  lines.push('      res.status(500).json({ error: { code: \'INTERNAL_ERROR\', message: \'Internal server error\' } });');
  lines.push('    }');
  lines.push('  });');

  // Command routes (POST)
  for (const command of entityCommands) {
    lines.push('');
    if (options.includeComments) {
      lines.push(generateCommandComment(command, entity, policies));
    }

    const commandSegment = toKebabCase(command.name);
    const paramsType = command.parameters.length > 0
      ? `${toPascalCase(entity.name)}${toPascalCase(command.name)}Params`
      : undefined;

    lines.push(`  router.post('/${segment}/${commandSegment}', ${options.authMiddlewareName}, async (req, res) => {`);
    lines.push('    try {');

    // Validation
    if (hasValidation && paramsType) {
      lines.push(`      const parseResult = ${paramsType}Schema.safeParse(req.body);`);
      lines.push('      if (!parseResult.success) {');
      lines.push('        return res.status(400).json({');
      lines.push("          error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parseResult.error.issues },");
      lines.push('        });');
      lines.push('      }');
      lines.push('      const params = parseResult.data;');
    } else {
      lines.push('      const params = req.body;');
    }

    // Runtime dispatch
    lines.push(`      const runtime = ${options.runtimeFactoryName}();`);

    const contextArg = options.includeTenantContext
      ? `, { user: req.user, ${options.tenantIdProperty}: req.user?.${options.tenantIdProperty} }`
      : ', { user: req.user }';

    // Instance ID extraction for non-create commands
    lines.push("      const instanceId = req.body.instanceId ?? req.body.id;");
    lines.push(`      const result = await runtime.runCommand('${entity.name}', '${command.name}', {`);
    lines.push('        params,');
    lines.push('        instanceId,');
    lines.push(`      }${contextArg});`);
    lines.push('');
    lines.push('      res.json(result);');
    lines.push('    } catch (err: unknown) {');
    lines.push("      if (err && typeof err === 'object' && 'code' in err) {");
    lines.push("        const e = err as { code: string; message?: string; status?: number };");
    lines.push("        const status = e.code === 'GUARD_FAILED' ? 403");
    lines.push("          : e.code === 'CONSTRAINT_VIOLATION' ? 422");
    lines.push("          : e.code === 'CONCURRENCY_CONFLICT' ? 409");
    lines.push("          : e.code === 'NOT_FOUND' ? 404");
    lines.push('          : 500;');
    lines.push("        return res.status(status).json({ error: { code: e.code, message: e.message ?? 'Command failed' } });");
    lines.push('      }');
    lines.push("      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });");
    lines.push('    }');
    lines.push('  });');
  }

  return lines.join('\n');
}

function generateFastifyEntityRouter(
  entity: IREntity,
  commands: IRCommand[],
  policies: IRPolicy[],
  options: NormalizedOptions,
): string {
  const segment = toEntitySegment(entity.name);
  const lines: string[] = [];
  const hasValidation = !!options.validationImportPath;

  const entityCommands = commands
    .filter(c => c.entity === entity.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  // GET list route
  if (options.includeComments) {
    lines.push('  /** List all ' + entity.name + ' entities */');
  }
  const listPreHandler = options.publicReads ? '' : `preHandler: [${options.authMiddlewareName}], `;
  lines.push(`  fastify.get('/${segment}/list', { ${listPreHandler}}, async (request, reply) => {`);
  lines.push(`    const runtime = ${options.runtimeFactoryName}();`);
  lines.push(`    const result = await runtime.list('${entity.name}'${options.includeTenantContext ? `, { ${options.tenantIdProperty}: request.user?.${options.tenantIdProperty} }` : ''});`);
  lines.push('    return result;');
  lines.push('  });');
  lines.push('');

  // GET detail route
  if (options.includeComments) {
    lines.push('  /** Get a single ' + entity.name + ' by ID */');
  }
  const getPreHandler = options.publicReads ? '' : `preHandler: [${options.authMiddlewareName}], `;
  lines.push(`  fastify.get('/${segment}/:id', { ${getPreHandler}}, async (request, reply) => {`);
  lines.push('    const { id } = request.params as { id: string };');
  lines.push(`    const runtime = ${options.runtimeFactoryName}();`);
  lines.push(`    const result = await runtime.get('${entity.name}', id${options.includeTenantContext ? `, { ${options.tenantIdProperty}: request.user?.${options.tenantIdProperty} }` : ''});`);
  lines.push('    if (!result) {');
  lines.push(`      reply.code(404);`);
  lines.push(`      return { error: { code: 'NOT_FOUND', message: '${entity.name} not found' } };`);
  lines.push('    }');
  lines.push('    return result;');
  lines.push('  });');

  // Command routes (POST)
  for (const command of entityCommands) {
    lines.push('');
    if (options.includeComments) {
      lines.push(generateCommandComment(command, entity, policies));
    }

    const commandSegment = toKebabCase(command.name);
    const paramsType = command.parameters.length > 0
      ? `${toPascalCase(entity.name)}${toPascalCase(command.name)}Params`
      : undefined;

    lines.push(`  fastify.post('/${segment}/${commandSegment}', { preHandler: [${options.authMiddlewareName}] }, async (request, reply) => {`);

    // Validation
    if (hasValidation && paramsType) {
      lines.push(`    const parseResult = ${paramsType}Schema.safeParse(request.body);`);
      lines.push('    if (!parseResult.success) {');
      lines.push('      reply.code(400);');
      lines.push("      return { error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parseResult.error.issues } };");
      lines.push('    }');
      lines.push('    const params = parseResult.data;');
    } else {
      lines.push('    const params = request.body;');
    }

    lines.push(`    const runtime = ${options.runtimeFactoryName}();`);

    const contextArg = options.includeTenantContext
      ? `, { user: request.user, ${options.tenantIdProperty}: request.user?.${options.tenantIdProperty} }`
      : ', { user: request.user }';

    lines.push("    const instanceId = (request.body as Record<string, unknown>)?.instanceId ?? (request.body as Record<string, unknown>)?.id;");
    lines.push(`    const result = await runtime.runCommand('${entity.name}', '${command.name}', {`);
    lines.push('      params,');
    lines.push('      instanceId,');
    lines.push(`    }${contextArg});`);
    lines.push('');
    lines.push('    return result;');
    lines.push('  });');
  }

  return lines.join('\n');
}

// ============================================================================
// Router surface generation
// ============================================================================

function generateExpressRouter(
  ir: IR,
  options: NormalizedOptions,
  entityFilter?: string,
): { code: string; diagnostics: ProjectionDiagnostic[] } {
  const diagnostics: ProjectionDiagnostic[] = [];
  const lines: string[] = [];
  const hasValidation = !!options.validationImportPath;
  const isExpress = options.framework === 'express';

  lines.push(emitHeader(options));

  // Imports
  if (isExpress) {
    if (options.emitTypes) {
      lines.push("import { Router } from 'express';");
      lines.push("import type { Request, Response } from 'express';");
    } else {
      lines.push("import { Router } from 'express';");
    }
  }

  lines.push(`import { ${options.authMiddlewareName} } from '${options.authImportPath}';`);
  lines.push(`import { ${options.runtimeFactoryName} } from '${options.runtimeImportPath}';`);

  if (hasValidation) {
    // Import schemas for validation
    const entities = entityFilter
      ? ir.entities.filter(e => e.name === entityFilter)
      : ir.entities;
    const commands = entityFilter
      ? ir.commands.filter(c => c.entity === entityFilter)
      : ir.commands;

    const schemaImports: string[] = [];
    for (const command of commands) {
      if (command.parameters.length > 0 && command.entity) {
        const entity = entities.find(e => e.name === command.entity);
        if (entity) {
          schemaImports.push(`${toPascalCase(command.entity)}${toPascalCase(command.name)}ParamsSchema`);
        }
      }
    }

    if (schemaImports.length > 0) {
      lines.push(`import { ${schemaImports.join(', ')} } from '${options.validationImportPath}';`);
    }
  }

  lines.push('');

  // Filter entities
  const entities = entityFilter
    ? ir.entities.filter(e => e.name === entityFilter)
    : [...ir.entities].sort((a, b) => a.name.localeCompare(b.name));

  if (entityFilter && entities.length === 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'EXPRESS_ENTITY_NOT_FOUND',
      message: `Entity "${entityFilter}" not found in IR.`,
      entity: entityFilter,
    });
  }

  if (isExpress) {
    // Express router module
    lines.push(`export function createManifestRouter(): Router {`);
    lines.push('  const router = Router();');
    lines.push('');

    for (const entity of entities) {
      const entityRoutes = generateExpressEntityRouter(
        entity,
        ir.commands,
        ir.policies,
        options,
      );
      lines.push(entityRoutes);
      lines.push('');
    }

    lines.push('  return router;');
    lines.push('}');
  } else {
    // Fastify plugin module
    lines.push("import type { FastifyInstance } from 'fastify';");
    lines.push('');
    lines.push('export async function manifestRoutes(fastify: FastifyInstance): Promise<void> {');

    for (const entity of entities) {
      const entityRoutes = generateFastifyEntityRouter(
        entity,
        ir.commands,
        ir.policies,
        options,
      );
      lines.push(entityRoutes);
      lines.push('');
    }

    lines.push('}');
  }

  lines.push('');

  return { code: lines.join('\n'), diagnostics };
}

// ============================================================================
// Projection class
// ============================================================================

/**
 * Express/Fastify route handler projection.
 *
 * Generates standalone router modules from Manifest IR with:
 * - Typed request/response shapes
 * - Auth middleware integration
 * - Optional Zod request validation
 * - Command dispatch through the Manifest runtime
 *
 * Supports both Express (Router) and Fastify (plugin) via the
 * `framework` option.
 */
export class ExpressProjection implements ProjectionTarget {
  readonly name = 'express';
  readonly description = 'Express/Fastify route handlers and middleware from IR entities and commands';
  readonly surfaces = SURFACES;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const options = normalizeOptions((request.options ?? {}) as ExpressProjectionOptions);

    switch (request.surface) {
      case SURFACE_ROUTER: {
        const { code, diagnostics } = generateExpressRouter(ir, options, request.entity);
        return {
          artifacts: [{
            id: request.entity ? `express.router.${request.entity}` : 'express.router',
            pathHint: request.entity
              ? `routes/${toEntitySegment(request.entity)}.ts`
              : 'routes/manifest-router.ts',
            contentType: 'typescript',
            code,
          }],
          diagnostics,
        };
      }

      case SURFACE_ENTITY: {
        if (!request.entity) {
          // Generate all entities, one artifact each
          const allArtifacts: ProjectionArtifact[] = [];
          const allDiagnostics: ProjectionDiagnostic[] = [];

          const entities = [...ir.entities].sort((a, b) => a.name.localeCompare(b.name));
          for (const entity of entities) {
            const { code, diagnostics } = generateExpressRouter(ir, options, entity.name);
            allArtifacts.push({
              id: `express.entity.${entity.name}`,
              pathHint: `routes/${toEntitySegment(entity.name)}.ts`,
              contentType: 'typescript',
              code,
            });
            allDiagnostics.push(...diagnostics);
          }
          return { artifacts: allArtifacts, diagnostics: allDiagnostics };
        }

        const { code, diagnostics } = generateExpressRouter(ir, options, request.entity);
        return {
          artifacts: [{
            id: `express.entity.${request.entity}`,
            pathHint: `routes/${toEntitySegment(request.entity)}.ts`,
            contentType: 'typescript',
            code,
          }],
          diagnostics,
        };
      }

      case SURFACE_TYPES: {
        const { code, diagnostics } = generateTypesSurface(ir, options, request.entity);
        return {
          artifacts: [{
            id: request.entity ? `express.types.${request.entity}` : 'express.types',
            pathHint: request.entity
              ? `types/${toEntitySegment(request.entity)}.ts`
              : 'types/manifest-types.ts',
            contentType: 'typescript',
            code,
          }],
          diagnostics,
        };
      }

      case SURFACE_ALL: {
        const allArtifacts: ProjectionArtifact[] = [];
        const allDiagnostics: ProjectionDiagnostic[] = [];

        // Router
        const router = generateExpressRouter(ir, options, request.entity);
        allArtifacts.push({
          id: request.entity ? `express.router.${request.entity}` : 'express.router',
          pathHint: request.entity
            ? `routes/${toEntitySegment(request.entity)}.ts`
            : 'routes/manifest-router.ts',
          contentType: 'typescript',
          code: router.code,
        });
        allDiagnostics.push(...router.diagnostics);

        // Types
        const types = generateTypesSurface(ir, options, request.entity);
        allArtifacts.push({
          id: request.entity ? `express.types.${request.entity}` : 'express.types',
          pathHint: request.entity
            ? `types/${toEntitySegment(request.entity)}.ts`
            : 'types/manifest-types.ts',
          contentType: 'typescript',
          code: types.code,
        });
        allDiagnostics.push(...types.diagnostics);

        return { artifacts: allArtifacts, diagnostics: allDiagnostics };
      }

      default:
        return {
          artifacts: [],
          diagnostics: [{
            severity: 'error',
            code: 'UNKNOWN_SURFACE',
            message: `Unknown surface: "${request.surface}". Available: ${SURFACES.join(', ')}`,
          }],
        };
    }
  }
}

// Re-export types
export type { ExpressProjectionOptions } from './types';
