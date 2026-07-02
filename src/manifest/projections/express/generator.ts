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
  IRWebhook,
} from '../../ir';
import type {
  ProjectionTarget,
  ProjectionRequest,
  ProjectionResult,
  ProjectionArtifact,
  ProjectionDiagnostic,
} from '../interface';
import type { ExpressProjectionOptions } from './types';
import type { RouteCasing } from '../shared/naming.js';
import { resolveLocalImportPathHint, generateRuntimeFactoryModule } from '../shared/companions';
import { resolveRouteContract, zodParamsSchemaName } from '../shared/route-contract.js';

// ============================================================================
// Constants
// ============================================================================

const SURFACE_ROUTER = 'express.router' as const;
const SURFACE_ENTITY = 'express.entity' as const;
const SURFACE_TYPES = 'express.types' as const;
const SURFACE_COMPANIONS = 'express.companions' as const;
const SURFACE_WEBHOOKS = 'express.webhooks' as const;
const SURFACE_ALL = 'express.all' as const;

const SURFACES = [SURFACE_ROUTER, SURFACE_ENTITY, SURFACE_TYPES, SURFACE_COMPANIONS, SURFACE_WEBHOOKS, SURFACE_ALL] as const;

/** Package subpath for the runtime webhook handler (owned by src/manifest/webhooks). */
const WEBHOOKS_IMPORT = '@angriff36/manifest/webhooks';

/**
 * Directories that contain a generated router file carrying the unconditional
 * local imports (`./middleware/auth`, `./lib/manifest-runtime`). Both the
 * monolithic router (`routes/manifest-router.ts`) and the per-entity routers
 * (`routes/<entity>.ts`) — Express and Fastify alike — live under `routes/`,
 * so relative companion imports resolve to a single location.
 */
const IMPORTER_DIRS = ['routes'] as const;

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
  routeCasing: RouteCasing | undefined;
  routeSegments: Record<string, string> | undefined;
  includeTenantContext: boolean;
  tenantIdProperty: string;
  emitTypes: boolean;
  emitHeader: boolean;
  publicReads: boolean;
  includeComments: boolean;
  generatedAt: string;
  emitCompanions: boolean;
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
    routeCasing: opts.routeCasing,
    routeSegments: opts.routeSegments,
    includeTenantContext: opts.includeTenantContext ?? true,
    tenantIdProperty: opts.tenantIdProperty ?? 'tenantId',
    emitTypes: opts.emitTypes ?? true,
    emitHeader: opts.emitHeader ?? true,
    publicReads: opts.publicReads ?? false,
    includeComments: opts.includeComments ?? true,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    emitCompanions: opts.emitCompanions ?? true,
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
  // Route paths resolve through the shared contract so basePath actually
  // prefixes emitted routes and the entity segment/casing matches every other
  // projection (client, routes, react-query).
  const contract = resolveRouteContract({
    apiBasePath: options.basePath,
    routeCasing: options.routeCasing,
    routeSegments: options.routeSegments,
  });
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
    lines.push(`  router.get('${contract.listPath(entity.name)}', async (req, res) => {`);
  } else {
    lines.push(`  router.get('${contract.listPath(entity.name)}', ${options.authMiddlewareName}, async (req, res) => {`);
  }
  lines.push('    try {');
  lines.push(`      const runtime = await ${options.runtimeFactoryName}();`);
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
    lines.push(`  router.get('${contract.detailPath(entity.name, 'colon')}', async (req, res) => {`);
  } else {
    lines.push(`  router.get('${contract.detailPath(entity.name, 'colon')}', ${options.authMiddlewareName}, async (req, res) => {`);
  }
  lines.push('    try {');
  lines.push(`      const runtime = await ${options.runtimeFactoryName}();`);
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
    const schemaName = command.parameters.length > 0
      ? zodParamsSchemaName(entity.name, command.name)
      : undefined;

    lines.push(`  router.post('${contract.entityBasePath(entity.name)}/${commandSegment}', ${options.authMiddlewareName}, async (req, res) => {`);
    lines.push('    try {');

    // Validation
    if (hasValidation && schemaName) {
      lines.push(`      const parseResult = ${schemaName}.safeParse(req.body);`);
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
    lines.push(`      const runtime = await ${options.runtimeFactoryName}();`);

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
  // Route paths resolve through the shared contract (basePath + entity segment
  // casing), identical to the Express router above.
  const contract = resolveRouteContract({
    apiBasePath: options.basePath,
    routeCasing: options.routeCasing,
    routeSegments: options.routeSegments,
  });
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
  lines.push(`  fastify.get('${contract.listPath(entity.name)}', { ${listPreHandler}}, async (request, reply) => {`);
  lines.push(`    const runtime = await ${options.runtimeFactoryName}();`);
  lines.push(`    const result = await runtime.list('${entity.name}'${options.includeTenantContext ? `, { ${options.tenantIdProperty}: request.user?.${options.tenantIdProperty} }` : ''});`);
  lines.push('    return result;');
  lines.push('  });');
  lines.push('');

  // GET detail route
  if (options.includeComments) {
    lines.push('  /** Get a single ' + entity.name + ' by ID */');
  }
  const getPreHandler = options.publicReads ? '' : `preHandler: [${options.authMiddlewareName}], `;
  lines.push(`  fastify.get('${contract.detailPath(entity.name, 'colon')}', { ${getPreHandler}}, async (request, reply) => {`);
  lines.push('    const { id } = request.params as { id: string };');
  lines.push(`    const runtime = await ${options.runtimeFactoryName}();`);
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
    const schemaName = command.parameters.length > 0
      ? zodParamsSchemaName(entity.name, command.name)
      : undefined;

    lines.push(`  fastify.post('${contract.entityBasePath(entity.name)}/${commandSegment}', { preHandler: [${options.authMiddlewareName}] }, async (request, reply) => {`);

    // Validation
    if (hasValidation && schemaName) {
      lines.push(`    const parseResult = ${schemaName}.safeParse(request.body);`);
      lines.push('    if (!parseResult.success) {');
      lines.push('      reply.code(400);');
      lines.push("      return { error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parseResult.error.issues } };");
      lines.push('    }');
      lines.push('    const params = parseResult.data;');
    } else {
      lines.push('    const params = request.body;');
    }

    lines.push(`    const runtime = await ${options.runtimeFactoryName}();`);

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
          schemaImports.push(zodParamsSchemaName(command.entity, command.name));
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
// Companion module generation (express.companions surface)
// ============================================================================

/**
 * Runtime companion module: the router-facing factory.
 *
 * The generated routers call `runtime.list(entity, filter?)`,
 * `runtime.get(entity, id, filter?)`, and
 * `runtime.runCommand(entity, command, { params, instanceId }, ctx?)` — none of
 * which are RuntimeEngine's native shapes (it exposes `getAllInstances`,
 * `getInstance`, and `runCommand(command, input, { entityName, instanceId })`).
 * This module builds the engine via the shared factory (emitted here as
 * `createManifestEngine`) and wraps it in a facade whose method shapes match the
 * routes exactly, so generated output runs unmodified against the companion.
 *
 * The facade factory is async; each route handler awaits it per request. This
 * text is intentionally identical to the Hono projection's — the route call
 * shapes are the same across both frameworks.
 */
function generateRuntimeCompanionModule(ir: IR, options: NormalizedOptions): string {
  // The shared factory emits an exported engine factory; keep its name distinct
  // from the user-facing facade name to avoid a duplicate-declaration collision.
  const engineFactory =
    options.runtimeFactoryName === 'createManifestEngine'
      ? 'createManifestEngineInternal'
      : 'createManifestEngine';

  const lines: string[] = [];
  lines.push(generateRuntimeFactoryModule({ ir, exportName: engineFactory }).trimEnd());
  lines.push('');
  lines.push('// ── Router-facing runtime facade ────────────────────────────────────────');
  lines.push('// Adapts RuntimeEngine to the argument shapes the generated routes call.');
  lines.push('// AWAIT: the factory is async (it builds a RuntimeEngine); each handler awaits');
  lines.push(`// it per request — \`const runtime = await ${options.runtimeFactoryName}();\`.`);
  lines.push('');
  lines.push('type ManifestListResult = Awaited<ReturnType<RuntimeEngine["getAllInstances"]>>;');
  lines.push('type ManifestInstanceResult = Awaited<ReturnType<RuntimeEngine["getInstance"]>>;');
  lines.push('type ManifestCommandResult = Awaited<ReturnType<RuntimeEngine["runCommand"]>>;');
  lines.push('');
  lines.push('/** The runtime surface the generated routes consume. */');
  lines.push('export interface ManifestRuntime {');
  lines.push('  list(entityName: string, filter?: Record<string, unknown>): Promise<ManifestListResult>;');
  lines.push('  get(entityName: string, id: string, filter?: Record<string, unknown>): Promise<ManifestInstanceResult>;');
  lines.push('  runCommand(');
  lines.push('    entityName: string,');
  lines.push('    commandName: string,');
  lines.push('    payload: { params?: Record<string, unknown>; instanceId?: string },');
  lines.push('    context?: Record<string, unknown>,');
  lines.push('  ): Promise<ManifestCommandResult>;');
  lines.push('}');
  lines.push('');
  lines.push(`export async function ${options.runtimeFactoryName}(`);
  lines.push('  context: ManifestContext = {},');
  lines.push('): Promise<ManifestRuntime> {');
  lines.push(`  const engine = await ${engineFactory}(context);`);
  lines.push('  return {');
  lines.push('    async list(entityName, filter) {');
  lines.push('      if (filter) engine.replaceContext(filter as unknown as ManifestContext);');
  lines.push('      return engine.getAllInstances(entityName);');
  lines.push('    },');
  lines.push('    async get(entityName, id, filter) {');
  lines.push('      if (filter) engine.replaceContext(filter as unknown as ManifestContext);');
  lines.push('      return engine.getInstance(entityName, id);');
  lines.push('    },');
  lines.push('    async runCommand(entityName, commandName, payload, ctx) {');
  lines.push('      if (ctx) engine.replaceContext(ctx as unknown as ManifestContext);');
  lines.push('      return engine.runCommand(commandName, payload?.params ?? {}, {');
  lines.push('        entityName,');
  lines.push('        instanceId: payload?.instanceId,');
  lines.push('      });');
  lines.push('    },');
  lines.push('  };');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

/**
 * Fail-closed auth middleware stub. The router imports `authMiddlewareName`
 * from `authImportPath` unconditionally; this is the module that satisfies it.
 * It compiles against only the framework's own types and denies every request
 * until the app wires real auth — an unfinished stub must never allow access.
 *
 * Express emits a `RequestHandler`; Fastify emits a `preHandler` hook (the
 * router registers it as `preHandler: [requireAuth]`).
 */
function generateExpressAuthStub(options: NormalizedOptions): string {
  const name = options.authMiddlewareName;
  const lines: string[] = [];
  lines.push('// Auto-generated Manifest auth companion (fail-closed stub).');
  lines.push('// DO NOT EDIT — generated by the Express projection (companions surface).');
  lines.push('//');
  lines.push('// Replace the body: authenticate the caller, attach the identity to the');
  lines.push('// request (so handlers can read it), and continue. Until then every request');
  lines.push('// is denied so unauthenticated access cannot silently succeed.');
  lines.push('');

  if (options.framework === 'fastify') {
    lines.push("import type { FastifyRequest, FastifyReply } from 'fastify';");
    lines.push('');
    lines.push(`export async function ${name}(_request: FastifyRequest, reply: FastifyReply): Promise<void> {`);
    lines.push('  reply.code(401).send({');
    lines.push(`    error: { code: 'UNAUTHORIZED', message: 'Auth not configured: implement ${name} in this module.' },`);
    lines.push('  });');
    lines.push('}');
  } else {
    lines.push("import type { RequestHandler } from 'express';");
    lines.push('');
    lines.push(`export const ${name}: RequestHandler = (_req, res) => {`);
    lines.push('  res.status(401).json({');
    lines.push(`    error: { code: 'UNAUTHORIZED', message: 'Auth not configured: implement ${name} in this module.' },`);
    lines.push('  });');
    lines.push('};');
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Emit the companion modules the generated router imports but no other surface
 * writes: the runtime factory (always) and the auth middleware (always — the
 * router imports it unconditionally).
 *
 * Relative specifiers (`./lib/manifest-runtime`) resolve against the importing
 * router file's directory. Every Express/Fastify router lives under `routes/`,
 * so each companion resolves to a single location. A package specifier is
 * skipped (never overwritten) with an info diagnostic — that module is the
 * app's to provide.
 */
function generateCompanions(ir: IR, options: NormalizedOptions): ProjectionResult {
  const artifacts: ProjectionArtifact[] = [];
  const diagnostics: ProjectionDiagnostic[] = [];

  if (!options.emitCompanions) {
    diagnostics.push({
      severity: 'info',
      code: 'COMPANIONS_DISABLED',
      message: 'emitCompanions is false — no companion modules emitted (hand-written workflow preserved).',
    });
    return { artifacts, diagnostics };
  }

  const emit = (kind: string, importSpecifier: string, build: () => string, label: string): void => {
    // Package-ness is independent of the importer directory; probe once.
    const probe = resolveLocalImportPathHint(importSpecifier, {
      framework: 'express',
      importerPathHint: `${IMPORTER_DIRS[0]}/importer.ts`,
    });
    if (!probe) {
      diagnostics.push({
        severity: 'info',
        code: 'COMPANION_SKIPPED_PACKAGE_PATH',
        message: `Skipping ${label} companion — "${importSpecifier}" is a package specifier, not a local module. That module is yours to provide.`,
      });
      return;
    }
    // Resolve against every importer directory; emit the module at each distinct
    // location so the relative import resolves from every router file.
    const pathHints = new Set<string>();
    for (const dir of IMPORTER_DIRS) {
      const resolved = resolveLocalImportPathHint(importSpecifier, {
        framework: 'express',
        importerPathHint: `${dir}/importer.ts`,
      });
      if (resolved) pathHints.add(resolved);
    }
    const code = build();
    for (const pathHint of [...pathHints].sort()) {
      const topDir = pathHint.split('/')[0];
      artifacts.push({ id: `express.companions.${kind}.${topDir}`, pathHint, contentType: 'typescript', code });
    }
  };

  // Runtime factory — imported unconditionally by every router.
  emit('runtime', options.runtimeImportPath, () => generateRuntimeCompanionModule(ir, options), 'runtime factory');

  // Auth middleware — imported unconditionally by every router.
  emit('auth', options.authImportPath, () => generateExpressAuthStub(options), 'auth middleware');

  return { artifacts, diagnostics };
}

// ============================================================================
// Webhook surface generation (express.webhooks surface)
// ============================================================================

/**
 * The RuntimeEngine factory the webhook routes call. The companions surface
 * emits BOTH the router-facing facade (`runtimeFactoryName`, default
 * `createManifestRuntime`) and the raw engine factory (`createManifestEngine`)
 * from the runtime module; webhooks need the raw RuntimeEngine (that is what
 * `handleWebhookRequest` consumes), so they import the engine factory. The name
 * mirrors generateRuntimeCompanionModule's collision-avoidance exactly.
 */
function engineFactoryName(options: NormalizedOptions): string {
  return options.runtimeFactoryName === 'createManifestEngine'
    ? 'createManifestEngineInternal'
    : 'createManifestEngine';
}

/**
 * Emit an Express Router that serves one route per declared webhook at its
 * DECLARED path (verbatim — no basePath prefix; webhook URLs are registered with
 * external providers and must not silently move). Each route captures the RAW
 * body with `express.raw` (HMAC is computed over the exact bytes the provider
 * signed — the JSON body-parser would destroy them), bridges the request into
 * the frozen WebhookHttpRequest, and delegates to handleWebhookRequest, which
 * owns signature verification, idempotency, transform, and command dispatch.
 *
 * Webhook routes are emitted WITHOUT the requireAuth middleware: they
 * authenticate via their signature, not the app's auth. Emitted at
 * `routes/webhooks.ts` so the relative `./lib/manifest-runtime` import resolves
 * to the companion the projection also emits under `routes/`.
 *
 * Fastify is not auto-emitted: raw-body capture there needs the external
 * `fastify-raw-body` plugin, which cannot be wired deterministically from the
 * projection. An info diagnostic explains the gap.
 */
function generateExpressWebhooks(ir: IR, options: NormalizedOptions): ProjectionResult {
  const webhooks: IRWebhook[] = ir.webhooks ?? [];
  const diagnostics: ProjectionDiagnostic[] = [];

  if (webhooks.length === 0) {
    diagnostics.push({
      severity: 'info',
      code: 'EXPRESS_NO_WEBHOOKS',
      message: 'No webhooks declared in IR; skipping express.webhooks surface.',
    });
    return { artifacts: [], diagnostics };
  }

  if (options.framework === 'fastify') {
    diagnostics.push({
      severity: 'info',
      code: 'EXPRESS_WEBHOOKS_FASTIFY_UNSUPPORTED',
      message:
        'Fastify webhook routes need raw-body capture (the fastify-raw-body plugin) for HMAC ' +
        'signature verification, which cannot be wired deterministically from the projection. ' +
        'Use framework: "express" for webhook emission, or add fastify-raw-body and bridge to ' +
        'handleWebhookRequest from @angriff36/manifest/webhooks manually.',
    });
    return { artifacts: [], diagnostics };
  }

  const engineFactory = engineFactoryName(options);
  const lines: string[] = [];

  if (options.emitHeader) {
    lines.push('/**');
    lines.push(` * Auto-generated by Manifest ${options.framework} projection (express.webhooks surface).`);
    lines.push(` * Generated at: ${options.generatedAt}`);
    lines.push(' *');
    lines.push(' * Webhooks authenticate via HMAC signature verification (per the IR webhook');
    lines.push(' * declaration), NOT the requireAuth middleware — these routes are emitted');
    lines.push(' * WITHOUT it. handleWebhookRequest verifies the signature over the RAW body');
    lines.push(' * before dispatching the command.');
    lines.push(' *');
    lines.push(' * Mount this router at the ROOT of your app so the declared paths (e.g.');
    lines.push(' * /webhooks/stripe) are served verbatim — webhook URLs are registered with');
    lines.push(' * external providers and must not move under a mount prefix.');
    lines.push(' *');
    lines.push(' * DO NOT EDIT — regenerate with: manifest generate <ir> -p express');
    lines.push(' */');
    lines.push('');
  }

  lines.push("import express, { Router } from 'express';");
  if (options.emitTypes) {
    lines.push("import type { Request, Response } from 'express';");
  }
  lines.push(`import { handleWebhookRequest } from '${WEBHOOKS_IMPORT}';`);
  lines.push(`import { ${engineFactory} } from '${options.runtimeImportPath}';`);
  lines.push('');
  lines.push('export function createManifestWebhookRouter(): Router {');
  lines.push('  const router = Router();');
  lines.push('');

  const handlerSig = options.emitTypes ? '(req: Request, res: Response)' : '(req, res)';

  for (const webhook of webhooks) {
    const method = (webhook.method ?? 'POST').toLowerCase();
    if (options.includeComments) {
      lines.push(`  // Webhook "${webhook.name}" — ${method.toUpperCase()} ${webhook.path}`);
    }
    // express.raw captures the exact bytes so HMAC verification sees what the
    // provider signed; requireAuth is intentionally NOT applied.
    lines.push(`  router.${method}('${webhook.path}', express.raw({ type: '*/*' }), async ${handlerSig} => {`);
    lines.push('    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString(\'utf8\') : \'\';');
    lines.push(`    const runtime = await ${engineFactory}();`);
    lines.push('    const result = await handleWebhookRequest(runtime, {');
    lines.push('      method: req.method,');
    lines.push(`      path: '${webhook.path}',`);
    lines.push('      headers: req.headers,');
    lines.push('      rawBody,');
    lines.push('      query: req.query as Record<string, string | undefined>,');
    lines.push('    });');
    lines.push('    res.status(result.status).json(result.body);');
    lines.push('  });');
    lines.push('');
  }

  lines.push('  return router;');
  lines.push('}');
  lines.push('');

  return {
    artifacts: [{ id: 'express.webhooks', pathHint: 'routes/webhooks.ts', contentType: 'typescript', code: lines.join('\n') }],
    diagnostics,
  };
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

      case SURFACE_COMPANIONS: {
        return generateCompanions(ir, options);
      }

      case SURFACE_WEBHOOKS: {
        return generateExpressWebhooks(ir, options);
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
