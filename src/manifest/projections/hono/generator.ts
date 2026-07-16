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
  IRWebhook,
} from '../../ir';
import type {
  ProjectionTarget,
  ProjectionRequest,
  ProjectionResult,
  ProjectionArtifact,
  ProjectionDiagnostic,
} from '../interface';
import type { HonoProjectionOptions } from './types';
import type { RouteCasing } from '../shared/naming.js';
import { resolveLocalImportPathHint, generateRuntimeFactoryModule } from '../shared/companions.js';
import { resolveRouteContract, zodParamsSchemaName } from '../shared/route-contract.js';
import { HONO_DESCRIPTOR_META } from './descriptor-meta.js';


// ============================================================================
// Constants
// ============================================================================

const SURFACE_ROUTER = 'hono.router' as const;
const SURFACE_ENTITY = 'hono.entity' as const;
const SURFACE_TYPES = 'hono.types' as const;
const SURFACE_COMPANIONS = 'hono.companions' as const;
const SURFACE_WEBHOOKS = 'hono.webhooks' as const;
const SURFACE_ALL = 'hono.all' as const;

const SURFACES = [
  SURFACE_ROUTER,
  SURFACE_ENTITY,
  SURFACE_TYPES,
  SURFACE_COMPANIONS,
  SURFACE_WEBHOOKS,
  SURFACE_ALL,
] as const;

/** Package subpath for the runtime webhook handler (owned by src/manifest/webhooks). */
const WEBHOOKS_IMPORT = '@angriff36/manifest/webhooks';

/**
 * Directories that contain a generated router file carrying the unconditional
 * local imports (`./middleware/auth`, `./lib/manifest-runtime`). The monolithic
 * router is emitted at `src/routes.ts` (edge-deploy entry) while per-entity
 * routers are at `routes/<entity>.ts`, so a relative companion import resolves
 * to a DIFFERENT directory depending on which file imports it. The companion is
 * emitted at each location so the import resolves from both. See the projection
 * docs note on the `src/` vs `routes/` split.
 */
const IMPORTER_DIRS = ['src', 'routes'] as const;

// ============================================================================
// Defaults
// ============================================================================

interface NormalizedOptions {
  authImportPath: string;
  authProvider: 'clerk' | 'custom' | 'none';
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

function normalizeOptions(opts: HonoProjectionOptions): NormalizedOptions {
  return {
    authImportPath: opts.authImportPath ?? './middleware/auth',
    authProvider: opts.authProvider ?? 'custom',
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
    timestamp: 'string', // alias of datetime
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
    ? ir.entities.filter((e) => e.name === entityFilter)
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
    ? ir.commands.filter((c) => c.entity === entityFilter)
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
    lines.push(
      `   * Guards: ${command.guards.length} (evaluated in order, halts on first failure)`,
    );
    for (let i = 0; i < command.guards.length; i++) {
      lines.push(`   *   [${i}] ${expressionToString(command.guards[i])}`);
    }
  }

  if (command.constraints && command.constraints.length > 0) {
    lines.push(`   * Constraints: ${command.constraints.length}`);
  }

  const entityPolicies = policies.filter((p) => p.entity === entity.name);
  if (entityPolicies.length > 0) {
    lines.push(`   * Policies: ${entityPolicies.map((p) => p.name).join(', ')}`);
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
  // Route paths resolve through the shared contract so basePath actually
  // prefixes emitted routes and the entity segment/casing matches every other
  // projection (client, routes, react-query). Emitted paths are truthful for an
  // app mounted at root (`export default app`).
  const contract = resolveRouteContract({
    apiBasePath: options.basePath,
    routeCasing: options.routeCasing,
    routeSegments: options.routeSegments,
  });
  const lines: string[] = [];
  emitHonoListRoute(lines, entity, contract, options);
  lines.push('');
  emitHonoDetailRoute(lines, entity, contract, options);
  const entityCommands = commands
    .filter((c) => c.entity === entity.name)
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const command of entityCommands) {
    lines.push('');
    emitHonoCommandRoute(lines, entity, command, policies, contract, options);
  }
  return lines.join('\n');
}

function emitHonoListRoute(
  lines: string[],
  entity: IREntity,
  contract: ReturnType<typeof resolveRouteContract>,
  options: NormalizedOptions,
): void {
  if (options.includeComments) {
    lines.push('  /** List all ' + entity.name + ' entities */');
  }
  if (options.publicReads) {
    lines.push(`  app.get('${contract.listPath(entity.name)}', async (c) => {`);
  } else {
    lines.push(
      `  app.get('${contract.listPath(entity.name)}', ${options.authMiddlewareName}, async (c) => {`,
    );
  }
  lines.push(`    const runtime = await ${options.runtimeFactoryName}();`);
  if (options.includeTenantContext && !options.publicReads) {
    lines.push(`    const user = c.get('user');`);
    lines.push(
      `    const result = await runtime.list('${entity.name}', { ${options.tenantIdProperty}: user.${options.tenantIdProperty} });`,
    );
  } else {
    lines.push(`    const result = await runtime.list('${entity.name}');`);
  }
  lines.push('    return c.json(result);');
  lines.push('  });');
}

function emitHonoDetailRoute(
  lines: string[],
  entity: IREntity,
  contract: ReturnType<typeof resolveRouteContract>,
  options: NormalizedOptions,
): void {
  if (options.includeComments) {
    lines.push('  /** Get a single ' + entity.name + ' by ID */');
  }
  if (options.publicReads) {
    lines.push(`  app.get('${contract.detailPath(entity.name, 'colon')}', async (c) => {`);
  } else {
    lines.push(
      `  app.get('${contract.detailPath(entity.name, 'colon')}', ${options.authMiddlewareName}, async (c) => {`,
    );
  }
  lines.push(`    const id = c.req.param('id');`);
  lines.push(`    const runtime = await ${options.runtimeFactoryName}();`);
  if (options.includeTenantContext && !options.publicReads) {
    lines.push(`    const user = c.get('user');`);
    lines.push(
      `    const result = await runtime.get('${entity.name}', id, { ${options.tenantIdProperty}: user.${options.tenantIdProperty} });`,
    );
  } else {
    lines.push(`    const result = await runtime.get('${entity.name}', id);`);
  }
  lines.push('    if (!result) {');
  lines.push(
    `      return c.json({ error: { code: 'NOT_FOUND', message: '${entity.name} not found' } }, 404);`,
  );
  lines.push('    }');
  lines.push('    return c.json(result);');
  lines.push('  });');
}

function emitHonoCommandRoute(
  lines: string[],
  entity: IREntity,
  command: IRCommand,
  policies: IRPolicy[],
  contract: ReturnType<typeof resolveRouteContract>,
  options: NormalizedOptions,
): void {
  const hasValidation = !!options.validationImportPath;
  if (options.includeComments) {
    lines.push(generateCommandComment(command, entity, policies));
  }
  const commandSegment = toKebabCase(command.name);
  const schemaName =
    command.parameters.length > 0 ? zodParamsSchemaName(entity.name, command.name) : undefined;
  lines.push(
    `  app.post('${contract.entityBasePath(entity.name)}/${commandSegment}', ${options.authMiddlewareName}, async (c) => {`,
  );
  lines.push('    try {');
  emitHonoCommandBodyParse(lines, hasValidation, schemaName);
  lines.push(`      const runtime = await ${options.runtimeFactoryName}();`);
  lines.push(`      const user = c.get('user');`);
  const contextArg = options.includeTenantContext
    ? `, { user, ${options.tenantIdProperty}: user.${options.tenantIdProperty} }`
    : ', { user }';
  lines.push('      const instanceId = body.instanceId ?? body.id;');
  lines.push(
    `      const result = await runtime.runCommand('${entity.name}', '${command.name}', {`,
  );
  lines.push('        params,');
  lines.push('        instanceId,');
  lines.push(`      }${contextArg});`);
  lines.push('');
  lines.push('      return c.json(result);');
  lines.push('    } catch (err: unknown) {');
  emitHonoCommandErrorHandler(lines);
  lines.push('    }');
  lines.push('  });');
}

function emitHonoCommandBodyParse(
  lines: string[],
  hasValidation: boolean,
  schemaName: string | undefined,
): void {
  if (hasValidation && schemaName) {
    lines.push('      const body = await c.req.json();');
    lines.push(`      const parseResult = ${schemaName}.safeParse(body);`);
    lines.push('      if (!parseResult.success) {');
    lines.push('        return c.json({');
    lines.push(
      "          error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parseResult.error.issues },",
    );
    lines.push('        }, 400);');
    lines.push('      }');
    lines.push('      const params = parseResult.data;');
    return;
  }
  lines.push('      const body = await c.req.json();');
  lines.push('      const params = body;');
}

function emitHonoCommandErrorHandler(lines: string[]): void {
  lines.push("      if (err && typeof err === 'object' && 'code' in err) {");
  lines.push('        const e = err as { code: string; message?: string; status?: number };');
  lines.push("        const status = e.code === 'GUARD_FAILED' ? 403");
  lines.push("          : e.code === 'CONSTRAINT_VIOLATION' ? 422");
  lines.push("          : e.code === 'CONCURRENCY_CONFLICT' ? 409");
  lines.push("          : e.code === 'NOT_FOUND' ? 404");
  lines.push('          : 500;');
  lines.push(
    "        return c.json({ error: { code: e.code, message: e.message ?? 'Command failed' } }, status as any);",
  );
  lines.push('      }');
  lines.push(
    "      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);",
  );
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
      ? ir.entities.filter((e) => e.name === entityFilter)
      : ir.entities;
    const commands = entityFilter
      ? ir.commands.filter((c) => c.entity === entityFilter)
      : ir.commands;

    const schemaImports: string[] = [];
    for (const command of commands) {
      if (command.parameters.length > 0 && command.entity) {
        const entity = entities.find((e) => e.name === command.entity);
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
    ? ir.entities.filter((e) => e.name === entityFilter)
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
    const entityRoutes = generateHonoEntityRoutes(entity, ir.commands, ir.policies, options);
    lines.push(entityRoutes);
    lines.push('');
  }

  lines.push('export default app;');
  lines.push('');

  return { code: lines.join('\n'), diagnostics };
}

// ============================================================================
// Companion module generation (hono.companions surface)
// ============================================================================

/**
 * Runtime companion module: the router-facing factory.
 *
 * The generated routes call `runtime.list(entity, filter?)`,
 * `runtime.get(entity, id, filter?)`, and
 * `runtime.runCommand(entity, command, { params, instanceId }, ctx?)` — none of
 * which are RuntimeEngine's native shapes (`getAllInstances`, `getInstance`,
 * `runCommand(command, input, { entityName, instanceId })`). This module builds
 * the engine via the shared factory (emitted here as `createManifestEngine`) and
 * wraps it in a facade whose method shapes match the routes exactly.
 *
 * The facade factory is async; each route handler awaits it per request. This
 * text is intentionally identical to the Express projection's — the route call
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
  lines.push(
    '  list(entityName: string, filter?: Record<string, unknown>): Promise<ManifestListResult>;',
  );
  lines.push(
    '  get(entityName: string, id: string, filter?: Record<string, unknown>): Promise<ManifestInstanceResult>;',
  );
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
 * Auth companion middleware. Body varies by `authProvider`:
 * - `custom` (default): fail-closed stub until the app wires real auth
 * - `clerk`: reads `@hono/clerk-auth` getAuth (requires clerkMiddleware upstream)
 * - `none`: sets anonymous user and continues
 *
 * Per the projection's auth contract (hono/types.ts), the middleware sets
 * `c.set('user', ...)` and continues. Compiles against Hono's own types (+
 * Clerk package types when authProvider is clerk).
 */
function generateHonoAuthStub(options: NormalizedOptions): string {
  const name = options.authMiddlewareName;
  const lines: string[] = [];

  if (options.authProvider === 'none') {
    lines.push('// Auto-generated Manifest auth companion (authProvider: none).');
    lines.push('// DO NOT EDIT — generated by the Hono projection (companions surface).');
    lines.push('');
    lines.push("import type { MiddlewareHandler } from 'hono';");
    lines.push('');
    lines.push(`export const ${name}: MiddlewareHandler = async (c, next) => {`);
    lines.push("  c.set('user', { id: 'anonymous' });");
    lines.push('  await next();');
    lines.push('};');
    lines.push('');
    return lines.join('\n');
  }

  if (options.authProvider === 'clerk') {
    lines.push('// Auto-generated Manifest auth companion (authProvider: clerk).');
    lines.push('// DO NOT EDIT — generated by the Hono projection (companions surface).');
    lines.push('//');
    lines.push('// Requires `clerkMiddleware()` from `@hono/clerk-auth` mounted before');
    lines.push('// this middleware so `getAuth(c)` can resolve the session.');
    lines.push('');
    lines.push("import type { MiddlewareHandler } from 'hono';");
    lines.push("import { getAuth } from '@hono/clerk-auth';");
    lines.push('');
    lines.push(`export const ${name}: MiddlewareHandler = async (c, next) => {`);
    lines.push('  const auth = getAuth(c);');
    lines.push('  if (!auth?.userId) {');
    lines.push('    return c.json(');
    lines.push("      { error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },");
    lines.push('      401,');
    lines.push('    );');
    lines.push('  }');
    lines.push("  c.set('user', { id: auth.userId });");
    lines.push('  await next();');
    lines.push('};');
    lines.push('');
    return lines.join('\n');
  }

  // custom — fail-closed stub
  lines.push('// Auto-generated Manifest auth companion (fail-closed stub).');
  lines.push('// DO NOT EDIT — generated by the Hono projection (companions surface).');
  lines.push('//');
  lines.push("// Replace the body: authenticate the caller, then `c.set('user', { id, ... })`");
  lines.push('// and `await next()`. Until then every request is denied so unauthenticated');
  lines.push('// access cannot silently succeed.');
  lines.push('// Or set authProvider: "clerk" | "none" on the Hono projection options.');
  lines.push('');
  lines.push("import type { MiddlewareHandler } from 'hono';");
  lines.push('');
  lines.push(`export const ${name}: MiddlewareHandler = async (c) => {`);
  lines.push('  return c.json(');
  lines.push(
    `    { error: { code: 'UNAUTHORIZED', message: 'Auth not configured: implement ${name} in this module.' } },`,
  );
  lines.push('    401,');
  lines.push('  );');
  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

/**
 * Emit the companion modules the generated router imports but no other surface
 * writes: the runtime factory (always) and the auth middleware (always — the
 * router imports it unconditionally).
 *
 * Relative specifiers (`./lib/manifest-runtime`) resolve against the importing
 * router file's directory. The monolithic router is at `src/routes.ts` and
 * per-entity routers at `routes/<entity>.ts`, so each companion is emitted at
 * both resolved locations. A package specifier is skipped (never overwritten)
 * with an info diagnostic — that module is the app's to provide.
 */
function generateCompanions(ir: IR, options: NormalizedOptions): ProjectionResult {
  const artifacts: ProjectionArtifact[] = [];
  const diagnostics: ProjectionDiagnostic[] = [];

  if (!options.emitCompanions) {
    diagnostics.push({
      severity: 'info',
      code: 'COMPANIONS_DISABLED',
      message:
        'emitCompanions is false — no companion modules emitted (hand-written workflow preserved).',
    });
    return { artifacts, diagnostics };
  }

  const emit = (
    kind: string,
    importSpecifier: string,
    build: () => string,
    label: string,
  ): void => {
    // Package-ness is independent of the importer directory; probe once.
    const probe = resolveLocalImportPathHint(importSpecifier, {
      framework: 'hono',
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
        framework: 'hono',
        importerPathHint: `${dir}/importer.ts`,
      });
      if (resolved) pathHints.add(resolved);
    }
    const code = build();
    for (const pathHint of [...pathHints].sort((a, b) => a.localeCompare(b))) {
      const topDir = pathHint.split('/')[0];
      artifacts.push({
        id: `hono.companions.${kind}.${topDir}`,
        pathHint,
        contentType: 'typescript',
        code,
      });
    }
  };

  // Runtime factory — imported unconditionally by every router.
  emit(
    'runtime',
    options.runtimeImportPath,
    () => generateRuntimeCompanionModule(ir, options),
    'runtime factory',
  );

  // Auth middleware — imported unconditionally by every router.
  emit('auth', options.authImportPath, () => generateHonoAuthStub(options), 'auth middleware');

  return { artifacts, diagnostics };
}

// ============================================================================
// Webhook surface generation (hono.webhooks surface)
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
 * Emit a standalone Hono app that serves one route per declared webhook at its
 * DECLARED path (verbatim — no basePath prefix; webhook URLs are registered with
 * external providers and must not silently move). Each route reads the RAW body
 * (HMAC is computed over the exact bytes), bridges the request into the frozen
 * WebhookHttpRequest, and delegates to handleWebhookRequest — which owns
 * signature verification, idempotency, transform, and command dispatch.
 *
 * Webhook routes are emitted WITHOUT the requireAuth middleware: they
 * authenticate via their signature, not the app's auth. Emitted at
 * `src/webhooks.ts` so the relative `./lib/manifest-runtime` import resolves to
 * the companion the projection also emits under `src/`.
 */
function generateHonoWebhooks(ir: IR, options: NormalizedOptions): ProjectionResult {
  const webhooks: IRWebhook[] = ir.webhooks ?? [];
  const diagnostics: ProjectionDiagnostic[] = [];

  if (webhooks.length === 0) {
    diagnostics.push({
      severity: 'info',
      code: 'HONO_NO_WEBHOOKS',
      message: 'No webhooks declared in IR; skipping hono.webhooks surface.',
    });
    return { artifacts: [], diagnostics };
  }

  const engineFactory = engineFactoryName(options);
  const lines: string[] = [];

  if (options.emitHeader) {
    lines.push('/**');
    lines.push(' * Auto-generated by Manifest Hono projection (hono.webhooks surface).');
    lines.push(` * Generated at: ${options.generatedAt}`);
    lines.push(' *');
    lines.push(' * Webhooks authenticate via HMAC signature verification (per the IR webhook');
    lines.push(' * declaration), NOT the requireAuth middleware — these routes are emitted');
    lines.push(' * WITHOUT it. handleWebhookRequest verifies the signature over the RAW body');
    lines.push(' * before dispatching the command.');
    lines.push(' *');
    lines.push(' * Mount this app at the ROOT of your server so the declared paths (e.g.');
    lines.push(' * /webhooks/stripe) are served verbatim — webhook URLs are registered with');
    lines.push(' * external providers and must not move under basePath.');
    lines.push(' *');
    lines.push(' * DO NOT EDIT — regenerate with: manifest generate <ir> -p hono');
    lines.push(' */');
    lines.push('');
  }

  lines.push("import { Hono } from 'hono';");
  lines.push(`import { handleWebhookRequest } from '${WEBHOOKS_IMPORT}';`);
  lines.push(`import { ${engineFactory} } from '${options.runtimeImportPath}';`);
  lines.push('');
  lines.push('const app = new Hono();');
  lines.push('');

  for (const webhook of webhooks) {
    const method = (webhook.method ?? 'POST').toLowerCase();
    if (options.includeComments) {
      lines.push(`// Webhook "${webhook.name}" — ${method.toUpperCase()} ${webhook.path}`);
    }
    lines.push(`app.${method}('${webhook.path}', async (c) => {`);
    lines.push(
      '  // RAW body — HMAC is computed over the exact bytes; read text() before parsing.',
    );
    lines.push('  const rawBody = await c.req.text();');
    lines.push(`  const runtime = await ${engineFactory}();`);
    lines.push('  const result = await handleWebhookRequest(runtime, {');
    lines.push('    method: c.req.method,');
    lines.push(`    path: '${webhook.path}',`);
    lines.push('    headers: c.req.header(),');
    lines.push('    rawBody,');
    lines.push('    query: c.req.query(),');
    lines.push('  });');
    lines.push('  // Native Response so the exact HTTP status passes through (c.json narrows');
    lines.push('  // status to known codes).');
    lines.push('  return Response.json(result.body, { status: result.status });');
    lines.push('});');
    lines.push('');
  }

  lines.push('export default app;');
  lines.push('');

  return {
    artifacts: [
      {
        id: 'hono.webhooks',
        pathHint: 'src/webhooks.ts',
        contentType: 'typescript',
        code: lines.join('\n'),
      },
    ],
    diagnostics,
  };
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
  readonly description =
    'Hono route handlers optimized for edge runtimes (Cloudflare Workers, Vercel Edge, Deno Deploy)';
  readonly surfaces = SURFACES;
  readonly descriptorMeta = HONO_DESCRIPTOR_META;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const options = normalizeOptions((request.options ?? {}) as HonoProjectionOptions);

    switch (request.surface) {
      case SURFACE_ROUTER: {
        const { code, diagnostics } = generateHonoRouter(ir, options, request.entity);
        return {
          artifacts: [
            {
              id: request.entity ? `hono.router.${request.entity}` : 'hono.router',
              pathHint: request.entity
                ? `routes/${toEntitySegment(request.entity)}.ts`
                : 'src/routes.ts',
              contentType: 'typescript',
              code,
            },
          ],
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
          artifacts: [
            {
              id: `hono.entity.${request.entity}`,
              pathHint: `routes/${toEntitySegment(request.entity)}.ts`,
              contentType: 'typescript',
              code,
            },
          ],
          diagnostics,
        };
      }

      case SURFACE_TYPES: {
        const { code, diagnostics } = generateTypesSurface(ir, options, request.entity);
        return {
          artifacts: [
            {
              id: request.entity ? `hono.types.${request.entity}` : 'hono.types',
              pathHint: request.entity
                ? `types/${toEntitySegment(request.entity)}.ts`
                : 'types/manifest-types.ts',
              contentType: 'typescript',
              code,
            },
          ],
          diagnostics,
        };
      }

      case SURFACE_COMPANIONS: {
        return generateCompanions(ir, options);
      }

      case SURFACE_WEBHOOKS: {
        return generateHonoWebhooks(ir, options);
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
}

// Re-export types
export type { HonoProjectionOptions } from './types';
