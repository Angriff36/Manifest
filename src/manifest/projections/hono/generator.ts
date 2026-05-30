/**
 * Hono projection for Manifest IR.
 *
 * Generates edge-runtime-optimized route handlers using Hono's typed
 * middleware and `c.var` / `c.get()` context for auth injection.
 * Produces a single deployable router file with zero Node.js dependencies,
 * targeting Cloudflare Workers, Vercel Edge, and Deno Deploy.
 *
 * Surfaces:
 *   - hono.router    -> Complete Hono app with all entity routes
 *   - hono.entity    -> Single-entity route group (entity-scoped)
 *   - hono.types     -> TypeScript request/response type definitions
 *   - hono.all       -> All surfaces combined
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
import type { HonoProjectionOptions } from './types';

// ============================================================================
// Constants
// ============================================================================

const SURFACE_ROUTER = 'hono.router' as const;
const SURFACE_ENTITY = 'hono.entity' as const;
const SURFACE_TYPES = 'hono.types' as const;
const SURFACE_ALL = 'hono.all' as const;

const SURFACES = [SURFACE_ROUTER, SURFACE_ENTITY, SURFACE_TYPES, SURFACE_ALL] as const;

// ============================================================================
// Defaults
// ============================================================================

interface NormalizedOptions {
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

function normalizeOptions(opts: HonoProjectionOptions): NormalizedOptions {
  return {
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
// Type mapping: IR type -> TypeScript type string
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
    ' * Auto-generated by Manifest Hono projection.',
    ` * Generated at: ${options.generatedAt}`,
    ' *',
    ' * Optimized for edge runtimes (Cloudflare Workers, Vercel Edge, Deno Deploy).',
    ' * Zero Node.js dependencies.',
    ' *',
    ' * DO NOT EDIT — regenerate with: manifest generate <ir> -p hono',
    ' */',
    '',
  ].join('\n');
}

// ============================================================================
// Type generation (hono.types surface)
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
      code: 'HONO_ENTITY_NOT_FOUND',
      message: `Entity "${entityFilter}" not found in IR.`,
      entity: entityFilter,
    });
  }

  // Hono Env type for typed context
  lines.push('/** Hono environment bindings for typed middleware context. */');
  lines.push('export type Env = {');
  lines.push('  Variables: {');
  lines.push('    user: AuthUser;');
  lines.push('  };');
  lines.push('};');
  lines.push('');
  lines.push('export interface AuthUser {');
  lines.push('  id: string;');
  if (options.includeTenantContext) {
    lines.push(`  ${options.tenantIdProperty}: string;`);
  }
  lines.push('  [key: string]: unknown;');
  lines.push('}');
  lines.push('');

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

function generateHonoEntityRoutes(
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
    lines.push(`  app.get('/${segment}/list', async (c) => {`);
  } else {
    lines.push(`  app.get('/${segment}/list', ${options.authMiddlewareName}, async (c) => {`);
  }
  lines.push(`    const runtime = ${options.runtimeFactoryName}();`);
  if (options.includeTenantContext && !options.publicReads) {
    lines.push(`    const user = c.get('user');`);
    lines.push(`    const result = await runtime.list('${entity.name}', { ${options.tenantIdProperty}: user.${options.tenantIdProperty} });`);
  } else if (options.includeTenantContext && options.publicReads) {
    lines.push(`    const result = await runtime.list('${entity.name}');`);
  } else {
    lines.push(`    const result = await runtime.list('${entity.name}');`);
  }
  lines.push('    return c.json(result);');
  lines.push('  });');
  lines.push('');

  // GET detail route
  if (options.includeComments) {
    lines.push('  /** Get a single ' + entity.name + ' by ID */');
  }
  if (options.publicReads) {
    lines.push(`  app.get('/${segment}/:id', async (c) => {`);
  } else {
    lines.push(`  app.get('/${segment}/:id', ${options.authMiddlewareName}, async (c) => {`);
  }
  lines.push(`    const id = c.req.param('id');`);
  lines.push(`    const runtime = ${options.runtimeFactoryName}();`);
  if (options.includeTenantContext && !options.publicReads) {
    lines.push(`    const user = c.get('user');`);
    lines.push(`    const result = await runtime.get('${entity.name}', id, { ${options.tenantIdProperty}: user.${options.tenantIdProperty} });`);
  } else {
    lines.push(`    const result = await runtime.get('${entity.name}', id);`);
  }
  lines.push('    if (!result) {');
  lines.push(`      return c.json({ error: { code: 'NOT_FOUND', message: '${entity.name} not found' } }, 404);`);
  lines.push('    }');
  lines.push('    return c.json(result);');
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

    lines.push(`  app.post('/${segment}/${commandSegment}', ${options.authMiddlewareName}, async (c) => {`);
    lines.push('    try {');

    // Validation
    if (hasValidation && paramsType) {
      lines.push('      const body = await c.req.json();');
      lines.push(`      const parseResult = ${paramsType}Schema.safeParse(body);`);
      lines.push('      if (!parseResult.success) {');
      lines.push('        return c.json({');
      lines.push("          error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parseResult.error.issues },");
      lines.push('        }, 400);');
      lines.push('      }');
      lines.push('      const params = parseResult.data;');
    } else {
      lines.push('      const body = await c.req.json();');
      lines.push('      const params = body;');
    }

    // Runtime dispatch
    lines.push(`      const runtime = ${options.runtimeFactoryName}();`);
    lines.push(`      const user = c.get('user');`);

    const contextArg = options.includeTenantContext
      ? `, { user, ${options.tenantIdProperty}: user.${options.tenantIdProperty} }`
      : ', { user }';

    lines.push("      const instanceId = body.instanceId ?? body.id;");
    lines.push(`      const result = await runtime.runCommand('${entity.name}', '${command.name}', {`);
    lines.push('        params,');
    lines.push('        instanceId,');
    lines.push(`      }${contextArg});`);
    lines.push('');
    lines.push('      return c.json(result);');
    lines.push('    } catch (err: unknown) {');
    lines.push("      if (err && typeof err === 'object' && 'code' in err) {");
    lines.push("        const e = err as { code: string; message?: string; status?: number };");
    lines.push("        const status = e.code === 'GUARD_FAILED' ? 403");
    lines.push("          : e.code === 'CONSTRAINT_VIOLATION' ? 422");
    lines.push("          : e.code === 'CONCURRENCY_CONFLICT' ? 409");
    lines.push("          : e.code === 'NOT_FOUND' ? 404");
    lines.push('          : 500;');
    lines.push("        return c.json({ error: { code: e.code, message: e.message ?? 'Command failed' } }, status as any);");
    lines.push('      }');
    lines.push("      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);");
    lines.push('    }');
    lines.push('  });');
  }

  return lines.join('\n');
}

// ============================================================================
// Router surface generation
// ============================================================================

function generateHonoRouter(
  ir: IR,
  options: NormalizedOptions,
  entityFilter?: string,
): { code: string; diagnostics: ProjectionDiagnostic[] } {
  const diagnostics: ProjectionDiagnostic[] = [];
  const lines: string[] = [];
  const hasValidation = !!options.validationImportPath;

  lines.push(emitHeader(options));

  // Imports — Hono core only, no Node.js deps
  lines.push("import { Hono } from 'hono';");
  if (options.emitTypes) {
    lines.push("import type { Context, MiddlewareHandler } from 'hono';");
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

  // Env type for typed context
  lines.push('/** Hono environment bindings for typed middleware context. */');
  if (options.emitTypes) {
    lines.push('type Env = {');
    lines.push('  Variables: {');
    lines.push('    user: {');
    lines.push('      id: string;');
    if (options.includeTenantContext) {
      lines.push(`      ${options.tenantIdProperty}: string;`);
    }
    lines.push('      [key: string]: unknown;');
    lines.push('    };');
    lines.push('  };');
    lines.push('};');
  }

  lines.push('');

  // Filter entities
  const entities = entityFilter
    ? ir.entities.filter(e => e.name === entityFilter)
    : [...ir.entities].sort((a, b) => a.name.localeCompare(b.name));

  if (entityFilter && entities.length === 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'HONO_ENTITY_NOT_FOUND',
      message: `Entity "${entityFilter}" not found in IR.`,
      entity: entityFilter,
    });
  }

  // App creation
  if (options.emitTypes) {
    lines.push('const app = new Hono<Env>();');
  } else {
    lines.push('const app = new Hono();');
  }
  lines.push('');

  for (const entity of entities) {
    if (options.includeComments) {
      lines.push(`// --- ${entity.name} routes ---`);
      lines.push('');
    }
    const entityRoutes = generateHonoEntityRoutes(
      entity,
      ir.commands,
      ir.policies,
      options,
    );
    lines.push(entityRoutes);
    lines.push('');
  }

  lines.push('export default app;');
  lines.push('');

  return { code: lines.join('\n'), diagnostics };
}

// ============================================================================
// Projection class
// ============================================================================

/**
 * Hono route handler projection.
 *
 * Generates edge-runtime-optimized route handlers from Manifest IR with:
 * - Typed middleware context via `c.get('user')`
 * - Auth middleware integration
 * - Optional Zod request validation
 * - Command dispatch through the Manifest runtime
 * - Zero Node.js dependencies
 *
 * Targets Cloudflare Workers, Vercel Edge, and Deno Deploy.
 */
export class HonoProjection implements ProjectionTarget {
  readonly name = 'hono';
  readonly description = 'Hono route handlers optimized for edge runtimes (Cloudflare Workers, Vercel Edge, Deno Deploy)';
  readonly surfaces = SURFACES;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const options = normalizeOptions((request.options ?? {}) as HonoProjectionOptions);

    switch (request.surface) {
      case SURFACE_ROUTER: {
        const { code, diagnostics } = generateHonoRouter(ir, options, request.entity);
        return {
          artifacts: [{
            id: request.entity ? `hono.router.${request.entity}` : 'hono.router',
            pathHint: request.entity
              ? `routes/${toEntitySegment(request.entity)}.ts`
              : 'src/routes.ts',
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
            const { code, diagnostics } = generateHonoRouter(ir, options, entity.name);
            allArtifacts.push({
              id: `hono.entity.${entity.name}`,
              pathHint: `routes/${toEntitySegment(entity.name)}.ts`,
              contentType: 'typescript',
              code,
            });
            allDiagnostics.push(...diagnostics);
          }
          return { artifacts: allArtifacts, diagnostics: allDiagnostics };
        }

        const { code, diagnostics } = generateHonoRouter(ir, options, request.entity);
        return {
          artifacts: [{
            id: `hono.entity.${request.entity}`,
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
            id: request.entity ? `hono.types.${request.entity}` : 'hono.types',
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
        const router = generateHonoRouter(ir, options, request.entity);
        allArtifacts.push({
          id: request.entity ? `hono.router.${request.entity}` : 'hono.router',
          pathHint: request.entity
            ? `routes/${toEntitySegment(request.entity)}.ts`
            : 'src/routes.ts',
          contentType: 'typescript',
          code: router.code,
        });
        allDiagnostics.push(...router.diagnostics);

        // Types
        const types = generateTypesSurface(ir, options, request.entity);
        allArtifacts.push({
          id: request.entity ? `hono.types.${request.entity}` : 'hono.types',
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
export type { HonoProjectionOptions } from './types';
