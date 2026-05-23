/**
 * Next.js App Router projection for Manifest IR.
 *
 * Generates Next.js API route handlers using App Router conventions.
 * Configurable for different auth providers and database setups.
 */

import type { IR, IREntity, IRCommand } from '../../ir';
import type {
  ProjectionTarget,
  ProjectionRequest,
  ProjectionResult,
  ProjectionDiagnostic,
  NextJsProjectionOptions,
} from '../interface';
import {
  NEXTJS_DEFAULTS,
  DEFAULT_TENANT_PROVIDER,
  DISPATCHER_DEFAULTS,
  CONCRETE_COMMAND_ROUTES_DEFAULTS,
} from './defaults';

/**
 * Re-export the canonical defaults so consumers of
 * `@angriff36/manifest/projections/nextjs` get the defaults from the same
 * entry point as the projection class. Anything that needs to render or
 * snapshot the defaults (CLI inspect, tests, downstream tooling) must use
 * these names, not redeclare them.
 */
export {
  NEXTJS_DEFAULTS,
  DEFAULT_TENANT_PROVIDER,
  DISPATCHER_DEFAULTS,
  CONCRETE_COMMAND_ROUTES_DEFAULTS,
  ROUTES_DEFAULTS,
  getManifestDefaultsSnapshot,
  type ManifestDefaultsSnapshot,
} from './defaults';

/**
 * Internal result shape used by private generation methods.
 */
interface CodeResult {
  code: string;
  diagnostics: ProjectionDiagnostic[];
}

/**
 * Normalized dispatcher options — every field required so generation paths
 * can branch without nullish-checks.
 */
interface NormalizedDispatcherOptions {
  enabled: boolean;
  executionMode: 'inline' | 'externalExecutor';
  executorImportPath: string;
  executorImportName: string;
  deriveInstanceId: boolean;
}

/**
 * Normalized concrete-command-routes policy.
 */
interface NormalizedConcreteCommandRoutesOptions {
  enabled: boolean;
  legacyAliasesOnly: boolean;
}

/**
 * Normalized options for internal use (all required, no outputPath).
 */
interface NormalizedNextJsOptions {
  authProvider: 'clerk' | 'nextauth' | 'custom' | 'none';
  authImportPath: string;
  databaseImportPath: string;
  responseImportPath: string;
  runtimeImportPath: string;
  includeTenantFilter: boolean;
  includeSoftDeleteFilter: boolean;
  tenantIdProperty: string;
  deletedAtProperty: string;
  appDir: string;
  strictMode: boolean;
  includeComments: boolean;
  indentSize: number;
  tenantProvider?: {
    importPath: string;
    functionName: string;
    lookupKey: 'orgId' | 'userId';
  };
  dispatcher: NormalizedDispatcherOptions;
  concreteCommandRoutes: NormalizedConcreteCommandRoutesOptions;
}

/**
 * Normalize user options with defaults from `./defaults`.
 *
 * Defaults are imported (not redeclared) so the projection, the CLI's
 * `manifest config print-defaults`, and the JSON schema all agree.
 */
function normalizeOptions(options?: NextJsProjectionOptions): NormalizedNextJsOptions {
  const dispatcher: NormalizedDispatcherOptions = {
    enabled: options?.dispatcher?.enabled ?? DISPATCHER_DEFAULTS.enabled,
    executionMode: options?.dispatcher?.executionMode ?? DISPATCHER_DEFAULTS.executionMode,
    executorImportPath: options?.dispatcher?.executorImportPath ?? DISPATCHER_DEFAULTS.executorImportPath,
    executorImportName: options?.dispatcher?.executorImportName ?? DISPATCHER_DEFAULTS.executorImportName,
    deriveInstanceId: options?.dispatcher?.deriveInstanceId ?? DISPATCHER_DEFAULTS.deriveInstanceId,
  };
  const concreteCommandRoutes: NormalizedConcreteCommandRoutesOptions = {
    enabled: options?.concreteCommandRoutes?.enabled ?? CONCRETE_COMMAND_ROUTES_DEFAULTS.enabled,
    legacyAliasesOnly:
      options?.concreteCommandRoutes?.legacyAliasesOnly ?? CONCRETE_COMMAND_ROUTES_DEFAULTS.legacyAliasesOnly,
  };
  return {
    authProvider: options?.authProvider ?? NEXTJS_DEFAULTS.authProvider,
    authImportPath: options?.authImportPath ?? NEXTJS_DEFAULTS.authImportPath,
    databaseImportPath: options?.databaseImportPath ?? NEXTJS_DEFAULTS.databaseImportPath,
    responseImportPath: options?.responseImportPath ?? NEXTJS_DEFAULTS.responseImportPath,
    runtimeImportPath: options?.runtimeImportPath ?? NEXTJS_DEFAULTS.runtimeImportPath,
    includeTenantFilter: options?.includeTenantFilter ?? NEXTJS_DEFAULTS.includeTenantFilter,
    includeSoftDeleteFilter: options?.includeSoftDeleteFilter ?? NEXTJS_DEFAULTS.includeSoftDeleteFilter,
    tenantIdProperty: options?.tenantIdProperty ?? NEXTJS_DEFAULTS.tenantIdProperty,
    deletedAtProperty: options?.deletedAtProperty ?? NEXTJS_DEFAULTS.deletedAtProperty,
    appDir: options?.appDir ?? NEXTJS_DEFAULTS.appDir,
    strictMode: options?.strictMode ?? NEXTJS_DEFAULTS.strictMode,
    includeComments: options?.includeComments ?? NEXTJS_DEFAULTS.includeComments,
    indentSize: options?.indentSize ?? NEXTJS_DEFAULTS.indentSize,
    tenantProvider: options?.tenantProvider ?? DEFAULT_TENANT_PROVIDER,
    dispatcher,
    concreteCommandRoutes,
  };
}

function toLowerCamelCase(value: string): string {
  if (!value) return value;
  return value[0].toLowerCase() + value.slice(1);
}

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function toEntitySegment(value: string): string {
  return value.toLowerCase();
}

/**
 * Generate an import statement with proper path handling.
 */
function generateImport(
  module: string,
  from: string
): string {
  return `import ${module} from "${from}";`;
}

/**
 * Generate the import line for the auth provider (empty string if none needed).
 */
function generateAuthImport(options: NormalizedNextJsOptions): string {
  const { authProvider, authImportPath } = options;

  switch (authProvider) {
    case 'clerk': {
      const clerkImport = authImportPath === '@/lib/auth' ? '@clerk/nextjs' : authImportPath;
      return generateImport('{ auth }', clerkImport);
    }
    case 'nextauth': {
      const nextAuthImport = authImportPath === '@/lib/auth' ? 'next-auth' : authImportPath;
      return generateImport('{ getServerSession }', nextAuthImport);
    }
    case 'custom':
      return generateImport('{ getUser }', authImportPath);
    case 'none':
    default:
      return '';
  }
}

/**
 * Generate the auth check body (no import statements).
 */
function generateAuthBody(options: NormalizedNextJsOptions): string {
  const { authProvider } = options;

  switch (authProvider) {
    case 'clerk': {
      const needsOrgId = options.tenantProvider?.lookupKey === 'orgId';
      const destructure = needsOrgId ? '{ orgId, userId }' : '{ userId }';
      const authGuard = needsOrgId
        ? 'if (!(userId && orgId)) {'
        : 'if (!userId) {';
      return `  const ${destructure} = await auth();
  ${authGuard}
    return manifestErrorResponse("Unauthorized", 401);
  }`;
    }

    case 'nextauth':
      return `  const session = await getServerSession();
  if (!session?.user?.id) {
    return manifestErrorResponse("Unauthorized", 401);
  }
  const userId = session.user.id;`;

    case 'custom':
      return `  const user = await getUser(request);
  if (!user?.id) {
    return manifestErrorResponse("Unauthorized", 401);
  }
  const userId = user.id;`;

    case 'none':
      return `  // Auth disabled - all requests allowed\n  const userId = "anonymous";`;

    default:
      return `  // Unknown auth provider - please implement\n  const userId = "unknown";`;
  }
}

/**
 * Generate tenant lookup code.
 */
function generateTenantLookup(options: NormalizedNextJsOptions): string {
  if (!options.includeTenantFilter) {
    return '';
  }

  if (options.tenantProvider) {
    const { functionName, lookupKey } = options.tenantProvider;
    return `
  const ${options.tenantIdProperty} = await ${functionName}(${lookupKey});

  if (!${options.tenantIdProperty}) {
    return manifestErrorResponse("Tenant not found", 400);
  }`;
  }

  return `
  const userMapping = await database.userTenantMapping.findUnique({
    where: { userId },
  });

  if (!userMapping) {
    return manifestErrorResponse("User not mapped to tenant", 400);
  }

  const { ${options.tenantIdProperty} } = userMapping;`;
}

/**
 * Generate Prisma query with filters.
 */
function generatePrismaQuery(
  entityName: string,
  options: NormalizedNextJsOptions
): string {
  const delegateName = toLowerCamelCase(entityName);
  const variableName = `${delegateName}s`;
  const { includeTenantFilter, includeSoftDeleteFilter, tenantIdProperty, deletedAtProperty } = options;

  const whereConditions: string[] = [];

  if (includeTenantFilter) {
    whereConditions.push(`${tenantIdProperty}`);
  }

  if (includeSoftDeleteFilter) {
    whereConditions.push(`${deletedAtProperty}: null`);
  }

  const whereClause = whereConditions.length > 0
    ? `where: {
        ${whereConditions.join(',\n        ')}
      },`
    : '';

  return `const ${variableName} = await database.${delegateName}.findMany({
    ${whereClause}
    orderBy: {
      createdAt: "desc",
    },
  });`;
}

/**
 * Convert IR type to TypeScript type.
 */
function irTypeToTsType(irType: { name: string; nullable: boolean }): string {
  const tsTypeMap: Record<string, string> = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    date: 'Date',
    datetime: 'Date',
    any: 'unknown',
    void: 'void',
  };

  const baseType = tsTypeMap[irType.name] || irType.name;
  return irType.nullable ? `${baseType} | null` : baseType;
}

/**
 * Generate TypeScript types from IR entity.
 */
function generateEntityTypes(entity: IREntity): string {
  const lines: string[] = [];

  lines.push(`export interface ${entity.name} {`);
  for (const prop of entity.properties) {
    const tsType = irTypeToTsType(prop.type);
    const isOptional = prop.modifiers.includes('optional') ||
                       prop.defaultValue !== undefined ||
                       prop.type.nullable;
    const optional = isOptional ? '?' : '';
    lines.push(`  ${prop.name}${optional}: ${tsType};`);
  }
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

/**
 * Next.js projection implementation.
 */
export class NextJsProjection implements ProjectionTarget {
  readonly name = 'nextjs';
  readonly description = 'Next.js App Router API routes with configurable auth and database support';
  readonly surfaces = ['nextjs.route', 'nextjs.detail', 'nextjs.command', 'nextjs.dispatcher', 'ts.types', 'ts.client'] as const;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const options = request.options as NextJsProjectionOptions | undefined;

    switch (request.surface) {
      case 'nextjs.route': {
        if (!request.entity) {
          return {
            artifacts: [],
            diagnostics: [{ severity: 'error', code: 'MISSING_ENTITY', message: 'surface "nextjs.route" requires entity' }],
          };
        }
        const result = this._route(ir, request.entity, options);
        if (result.diagnostics.some(d => d.severity === 'error')) {
          return { artifacts: [], diagnostics: result.diagnostics };
        }
        const opts = normalizeOptions(options);
        return {
          artifacts: [{
            id: `nextjs.route:${request.entity}`,
            pathHint: `${opts.appDir}/${toEntitySegment(request.entity)}/list/route.ts`,
            contentType: 'typescript',
            code: result.code,
          }],
          diagnostics: result.diagnostics,
        };
      }

      case 'nextjs.detail': {
        if (!request.entity) {
          return {
            artifacts: [],
            diagnostics: [{ severity: 'error', code: 'MISSING_ENTITY', message: 'surface "nextjs.detail" requires entity' }],
          };
        }
        const detailResult = this._detail(ir, request.entity, options);
        if (detailResult.diagnostics.some(d => d.severity === 'error')) {
          return { artifacts: [], diagnostics: detailResult.diagnostics };
        }
        const detailOpts = normalizeOptions(options);
        return {
          artifacts: [{
            id: `nextjs.detail:${request.entity}`,
            pathHint: `${detailOpts.appDir}/${toEntitySegment(request.entity)}/[id]/route.ts`,
            contentType: 'typescript',
            code: detailResult.code,
          }],
          diagnostics: detailResult.diagnostics,
        };
      }

      case 'nextjs.command': {
        if (!request.entity) {
          return {
            artifacts: [],
            diagnostics: [{ severity: 'error', code: 'MISSING_ENTITY', message: 'surface "nextjs.command" requires entity' }],
          };
        }
        if (!request.command) {
          return {
            artifacts: [],
            diagnostics: [{ severity: 'error', code: 'MISSING_COMMAND', message: 'surface "nextjs.command" requires command' }],
          };
        }
        const commandOpts = normalizeOptions(options);
        if (!commandOpts.concreteCommandRoutes.enabled) {
          return {
            artifacts: [],
            diagnostics: [{
              severity: 'info',
              code: 'CONCRETE_COMMAND_ROUTES_DISABLED',
              message: 'concreteCommandRoutes.enabled is false — skipping per-command route emission. Use nextjs.dispatcher instead.',
              entity: request.entity,
            }],
          };
        }
        const commandResult = this._command(ir, request.entity, request.command, options);
        if (commandResult.diagnostics.some(d => d.severity === 'error')) {
          return { artifacts: [], diagnostics: commandResult.diagnostics };
        }
        return {
          artifacts: [{
            id: `nextjs.command:${request.entity}.${request.command}`,
            pathHint: `${commandOpts.appDir}/${toEntitySegment(request.entity)}/${toKebabCase(request.command)}/route.ts`,
            contentType: 'typescript',
            code: commandResult.code,
          }],
          diagnostics: commandResult.diagnostics,
        };
      }

      case 'nextjs.dispatcher': {
        const dispatcherOpts = normalizeOptions(options);
        if (!dispatcherOpts.dispatcher.enabled) {
          return {
            artifacts: [],
            diagnostics: [{
              severity: 'info',
              code: 'DISPATCHER_DISABLED',
              message: 'dispatcher.enabled is false — skipping nextjs.dispatcher emission.',
            }],
          };
        }
        const dispatcherResult = this._dispatcher(options);
        if (dispatcherResult.diagnostics.some(d => d.severity === 'error')) {
          return { artifacts: [], diagnostics: dispatcherResult.diagnostics };
        }
        return {
          artifacts: [{
            id: 'nextjs.dispatcher',
            pathHint: `${dispatcherOpts.appDir}/manifest/[entity]/commands/[command]/route.ts`,
            contentType: 'typescript',
            code: dispatcherResult.code,
          }],
          diagnostics: dispatcherResult.diagnostics,
        };
      }

      case 'ts.types': {
        const result = this._types(ir);
        return {
          artifacts: [{
            id: 'ts.types',
            pathHint: 'src/types/manifest-generated.ts',
            contentType: 'typescript',
            code: result.code,
          }],
          diagnostics: result.diagnostics,
        };
      }

      case 'ts.client': {
        const result = this._client(ir);
        return {
          artifacts: [{
            id: 'ts.client',
            pathHint: 'src/lib/manifest-client.ts',
            contentType: 'typescript',
            code: result.code,
          }],
          diagnostics: result.diagnostics,
        };
      }

      default:
        return {
          artifacts: [],
          diagnostics: [{ severity: 'error', code: 'UNKNOWN_SURFACE', message: `Unknown surface: "${request.surface}"` }],
        };
    }
  }

  private _route(
    ir: IR,
    entityName: string,
    options?: NextJsProjectionOptions
  ): CodeResult {
    const diagnostics: ProjectionDiagnostic[] = [];
    const opts = normalizeOptions(options);

    // Find the entity in IR
    const entity = ir.entities.find(e => e.name === entityName);
    if (!entity) {
      diagnostics.push({
        severity: 'error',
        code: 'ENTITY_NOT_FOUND',
        message: `Entity "${entityName}" not found in IR. Available entities: ${ir.entities.map(e => e.name).join(', ')}`,
        entity: entityName,
      });
      return { code: '', diagnostics };
    }

    const code = this._generateGetRoute(entity, opts);
    return { code, diagnostics };
  }

  private _types(ir: IR): CodeResult {
    const lines: string[] = [];

    lines.push('// Auto-generated TypeScript types from Manifest IR');
    lines.push('// DO NOT EDIT - This file is generated from .manifest source');
    lines.push('');

    for (const entity of ir.entities) {
      lines.push(generateEntityTypes(entity));
    }

    return { code: lines.join('\n'), diagnostics: [] };
  }

  private _client(ir: IR): CodeResult {
    const lines: string[] = [];

    lines.push('// Auto-generated client SDK from Manifest IR');
    lines.push('// DO NOT EDIT - This file is generated from .manifest source');
    lines.push('');

    for (const entity of ir.entities) {
      const lowerEntity = entity.name.toLowerCase();
      const delegateName = toLowerCamelCase(entity.name);

      // List (findMany) function
      lines.push(`export async function get${entity.name}s(): Promise<${entity.name}[]> {`);
      lines.push(`  const response = await fetch(\`/api/${lowerEntity}/list\`);`);
      lines.push(`  if (!response.ok) {`);
      lines.push(`    throw new Error("Failed to fetch ${entity.name}s");`);
      lines.push(`  }`);
      lines.push(`  const data = await response.json();`);
      lines.push(`  return data.${delegateName}s;`);
      lines.push(`}`);
      lines.push('');

      // Detail (findUnique) function
      lines.push(`export async function get${entity.name}(id: string): Promise<${entity.name}> {`);
      lines.push(`  const response = await fetch(\`/api/${lowerEntity}/\${encodeURIComponent(id)}\`);`);
      lines.push(`  if (!response.ok) {`);
      lines.push(`    throw new Error("Failed to fetch ${entity.name}");`);
      lines.push(`  }`);
      lines.push(`  const data = await response.json();`);
      lines.push(`  return data.${delegateName};`);
      lines.push(`}`);
      lines.push('');
    }

    return { code: lines.join('\n'), diagnostics: [] };
  }

  private _command(
    ir: IR,
    entityName: string,
    commandName: string,
    options?: NextJsProjectionOptions
  ): CodeResult {
    const diagnostics: ProjectionDiagnostic[] = [];
    const opts = normalizeOptions(options);

    const entity = ir.entities.find(e => e.name === entityName);
    if (!entity) {
      diagnostics.push({
        severity: 'error',
        code: 'ENTITY_NOT_FOUND',
        message: `Entity "${entityName}" not found in IR. Available entities: ${ir.entities.map(e => e.name).join(', ')}`,
        entity: entityName,
      });
      return { code: '', diagnostics };
    }

    const entityCommands = ir.commands.filter(c => c.entity === entityName);
    const command = entityCommands.find(c => c.name === commandName);
    if (!command) {
      diagnostics.push({
        severity: 'error',
        code: 'COMMAND_NOT_FOUND',
        message: `Command "${commandName}" not found on entity "${entityName}". Available commands: ${entityCommands.map(c => c.name).join(', ')}`,
        entity: entityName,
      });
      return { code: '', diagnostics };
    }

    const code = this._generatePostCommandHandler(entity, command, opts);
    return { code, diagnostics };
  }

  /**
   * Generate POST command handler for an entity command.
   * Writes MUST flow through runtime.runCommand() to enforce guards, policies, and constraints.
   */
  private _generatePostCommandHandler(
    entity: IREntity,
    command: IRCommand,
    options: NormalizedNextJsOptions
  ): string {
    const { responseImportPath, runtimeImportPath, dispatcher } = options;
    const useExternalExecutor = dispatcher.executionMode === 'externalExecutor';

    const lines: string[] = [];

    lines.push(`// Auto-generated Next.js command handler for ${entity.name}.${command.name}`);
    lines.push('// Generated from Manifest IR - DO NOT EDIT');
    lines.push('//');
    if (options.concreteCommandRoutes.legacyAliasesOnly) {
      lines.push('// DEPRECATED ALIAS: this concrete per-command route is retained for');
      lines.push('// backwards compatibility only. The canonical write path is the');
      lines.push('// nextjs.dispatcher projection at:');
      lines.push('//   POST /api/manifest/[entity]/commands/[command]');
      lines.push('// See docs/spec/adapters.md § "Canonical Dispatcher (Transport Boundary)".');
      lines.push('//');
    }
    lines.push('// Writes MUST flow through runtime to enforce guards, policies, and constraints.');
    lines.push('');
    lines.push('import type { NextRequest } from "next/server";');
    lines.push(generateImport('{ manifestErrorResponse, manifestSuccessResponse, normalizeCommandResult }', responseImportPath));
    if (useExternalExecutor) {
      lines.push(generateImport(`{ ${dispatcher.executorImportName} }`, dispatcher.executorImportPath));
    } else {
      lines.push(generateImport('{ createManifestRuntime }', runtimeImportPath));
    }
    if (options.includeTenantFilter) {
      if (options.tenantProvider) {
        lines.push(generateImport(`{ ${options.tenantProvider.functionName} }`, options.tenantProvider.importPath));
      } else {
        lines.push(generateImport('{ database }', options.databaseImportPath));
      }
    }
    const authImport = generateAuthImport(options);
    if (authImport) lines.push(authImport);
    lines.push('');
    lines.push('export async function POST(request: NextRequest) {');
    lines.push('  try {');
    lines.push(generateAuthBody(options));
    const tenantLookup = generateTenantLookup(options);
    if (tenantLookup) lines.push(tenantLookup);
    lines.push('');
    lines.push('    const body = await request.json();');
    lines.push('');
    if (useExternalExecutor) {
      const tenantField = options.tenantIdProperty;
      const tenantValueExpr = options.includeTenantFilter ? tenantField : '"__no_tenant__"';
      lines.push(`    const result = await ${dispatcher.executorImportName}({`);
      lines.push(`      entityName: "${entity.name}",`);
      lines.push(`      commandName: "${command.name}",`);
      lines.push('      input: body,');
      lines.push('      context: {');
      if (options.includeTenantFilter) {
        lines.push(`        tenantId: ${tenantValueExpr},`);
        lines.push(`        orgId: ${tenantValueExpr},`);
      }
      lines.push('        actorId: userId,');
      lines.push('        requestId: request.headers.get("x-request-id") ?? undefined,');
      lines.push('        source: "route",');
      lines.push(`        user: { id: userId, ${tenantField}: ${tenantValueExpr} },`);
      lines.push('      },');
      lines.push('    });');
    } else {
      const tenantCtx = options.includeTenantFilter
        ? `{ user: { id: userId, ${options.tenantIdProperty}: ${options.tenantIdProperty} } }`
        : `{ user: { id: userId, ${options.tenantIdProperty}: "__no_tenant__" } }`;
      lines.push(`    const runtime = await createManifestRuntime(${tenantCtx});`);
      lines.push(`    const result = await runtime.runCommand("${command.name}", body, {`);
      lines.push(`      entityName: "${entity.name}",`);
      lines.push('    });');
    }
    lines.push('');
    lines.push(`    const normalized = normalizeCommandResult("${entity.name}", "${command.name}", result);`);
    lines.push('');
    lines.push('    if (!normalized.success) {');
    lines.push('      // Determine HTTP status based on diagnostic kind');
    lines.push('      const firstDiagnostic = normalized.diagnostics?.[0];');
    lines.push('      const status = firstDiagnostic?.kind === "policy_denial" ? 403');
    lines.push('        : firstDiagnostic?.kind === "guard_failure" ? 422');
    lines.push('        : firstDiagnostic?.kind === "constraint_block" ? 422');
    lines.push('        : 400;');
    lines.push('      return manifestErrorResponse({ error: normalized.error, diagnostics: normalized.diagnostics }, status);');
    lines.push('    }');
    lines.push('');
    lines.push('    return manifestSuccessResponse({ data: normalized.data, events: normalized.events, diagnostics: normalized.diagnostics });');
    lines.push('  } catch (error) {');
    lines.push(`    console.error("Error executing ${entity.name}.${command.name}:", error);`);
    lines.push('    return manifestErrorResponse("Internal server error", 500);');
    lines.push('  }');
    lines.push('}');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generate the canonical dispatcher route. Single dynamic file at
   *   <appDir>/manifest/[entity]/commands/[command]/route.ts
   * Resolves entity+command at request time and delegates to
   * RuntimeEngine.runCommand. Single canonical write path for governed
   * mutations; downstream integrations may add aliases or CI gates.
   */
  private _dispatcher(
    options?: NextJsProjectionOptions
  ): CodeResult {
    const opts = normalizeOptions(options);
    const code = this._generateDispatcherHandler(opts);
    return { code, diagnostics: [] };
  }

  private _generateDispatcherHandler(options: NormalizedNextJsOptions): string {
    const { responseImportPath, runtimeImportPath, dispatcher } = options;
    const useExternalExecutor = dispatcher.executionMode === 'externalExecutor';
    const lines: string[] = [];

    lines.push('// Auto-generated canonical Manifest dispatcher.');
    lines.push('// Generated from Manifest IR - DO NOT EDIT');
    lines.push('// Canonical write path for governed commands. Per-command');
    lines.push('// concrete routes (nextjs.command) are deprecated aliases');
    lines.push('// that delegate here.');
    if (useExternalExecutor) {
      lines.push('//');
      lines.push(`// executionMode = "externalExecutor": delegates to ${dispatcher.executorImportName}`);
      lines.push(`// imported from "${dispatcher.executorImportPath}". The dispatcher does NOT`);
      lines.push('// construct a Manifest runtime — the executor owns that.');
    }
    lines.push('');
    lines.push('import type { NextRequest } from "next/server";');
    lines.push(generateImport('{ manifestErrorResponse, manifestSuccessResponse, normalizeCommandResult }', responseImportPath));
    if (useExternalExecutor) {
      lines.push(generateImport(`{ ${dispatcher.executorImportName} }`, dispatcher.executorImportPath));
    } else {
      lines.push(generateImport('{ createManifestRuntime }', runtimeImportPath));
    }
    if (options.includeTenantFilter) {
      if (options.tenantProvider) {
        lines.push(generateImport(`{ ${options.tenantProvider.functionName} }`, options.tenantProvider.importPath));
      } else {
        lines.push(generateImport('{ database }', options.databaseImportPath));
      }
    }
    const authImport = generateAuthImport(options);
    if (authImport) lines.push(authImport);
    lines.push('');
    lines.push('// Next.js 15 App Router: dynamic route params are async.');
    lines.push('// See https://nextjs.org/docs/app/api-reference/file-conventions/route');
    lines.push('interface DispatcherContext {');
    lines.push('  params: Promise<{ entity: string; command: string }>;');
    lines.push('}');
    lines.push('');
    lines.push('export async function POST(request: NextRequest, ctx: DispatcherContext) {');
    lines.push('  try {');
    lines.push(generateAuthBody(options));
    const tenantLookup = generateTenantLookup(options);
    if (tenantLookup) lines.push(tenantLookup);
    lines.push('');
    lines.push('    const body = await request.json();');
    lines.push('    const { entity, command } = await ctx.params;');
    lines.push('');
    lines.push('    if (!entity || !command) {');
    lines.push('      return manifestErrorResponse("Missing entity or command in route", 400);');
    lines.push('    }');
    lines.push('');
    const tenantField = options.tenantIdProperty;
    const tenantValueExpr = options.includeTenantFilter ? tenantField : '"__no_tenant__"';
    if (useExternalExecutor) {
      // externalExecutor mode: delegate to app-owned executor; do NOT construct
      // a runtime inline. The executor receives full RuntimeContext + the
      // raw entity/command keys parsed from the URL, plus the input body.
      if (dispatcher.deriveInstanceId) {
        lines.push('    // deriveInstanceId: pull instanceId from common body locations.');
        lines.push('    const instanceId = typeof body?.instanceId === "string"');
        lines.push('      ? body.instanceId');
        lines.push('      : typeof body?.id === "string"');
        lines.push('        ? body.id');
        lines.push('        : undefined;');
        lines.push('');
      }
      lines.push(`    const result = await ${dispatcher.executorImportName}({`);
      lines.push('      entityName: entity,');
      lines.push('      commandName: command,');
      lines.push('      input: body,');
      if (dispatcher.deriveInstanceId) {
        lines.push('      instanceId,');
      }
      lines.push('      context: {');
      if (options.includeTenantFilter) {
        lines.push(`        tenantId: ${tenantValueExpr},`);
        lines.push(`        orgId: ${tenantValueExpr},`);
      }
      lines.push('        actorId: userId,');
      lines.push('        requestId: request.headers.get("x-request-id") ?? undefined,');
      lines.push('        source: "route",');
      lines.push(`        user: { id: userId, ${tenantField}: ${tenantValueExpr} },`);
      lines.push('      },');
      lines.push('    });');
    } else {
      // inline mode: construct the runtime per request and call runCommand.
      // Typed RuntimeContext: tenantId/orgId/actorId/requestId/source.
      // Legacy `user` shorthand preserved for downstream callers still
      // reading it; new code MUST prefer actorId.
      lines.push('    const runtime = await createManifestRuntime({');
      if (options.includeTenantFilter) {
        lines.push(`      tenantId: ${tenantValueExpr},`);
        lines.push(`      orgId: ${tenantValueExpr},`);
      }
      lines.push('      actorId: userId,');
      lines.push('      requestId: request.headers.get("x-request-id") ?? undefined,');
      lines.push('      source: "route",');
      lines.push(`      user: { id: userId, ${tenantField}: ${tenantValueExpr} },`);
      lines.push('    });');
      lines.push('');
      lines.push('    const result = await runtime.runCommand(command, body, {');
      lines.push('      entityName: entity,');
      lines.push('    });');
    }
    lines.push('');
    lines.push('    const normalized = normalizeCommandResult(entity, command, result);');
    lines.push('');
    lines.push('    if (!normalized.success) {');
    lines.push('      const firstDiagnostic = normalized.diagnostics?.[0];');
    lines.push('      const status = firstDiagnostic?.kind === "policy_denial" ? 403');
    lines.push('        : firstDiagnostic?.kind === "guard_failure" ? 422');
    lines.push('        : firstDiagnostic?.kind === "constraint_block" ? 422');
    lines.push('        : 400;');
    lines.push('      return manifestErrorResponse({ error: normalized.error, diagnostics: normalized.diagnostics }, status);');
    lines.push('    }');
    lines.push('');
    lines.push('    return manifestSuccessResponse({ data: normalized.data, events: normalized.events, diagnostics: normalized.diagnostics });');
    lines.push('  } catch (error) {');
    lines.push('    console.error("Manifest dispatcher error:", error);');
    lines.push('    return manifestErrorResponse("Internal server error", 500);');
    lines.push('  }');
    lines.push('}');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generate detail (getById) route handler for an entity.
   * Uses direct Prisma findUnique (bypassing runtime) for efficiency.
   */
  private _detail(
    ir: IR,
    entityName: string,
    options?: NextJsProjectionOptions
  ): CodeResult {
    const diagnostics: ProjectionDiagnostic[] = [];
    const opts = normalizeOptions(options);

    const entity = ir.entities.find(e => e.name === entityName);
    if (!entity) {
      diagnostics.push({
        severity: 'error',
        code: 'ENTITY_NOT_FOUND',
        message: `Entity "${entityName}" not found in IR. Available entities: ${ir.entities.map(e => e.name).join(', ')}`,
        entity: entityName,
      });
      return { code: '', diagnostics };
    }

    const code = this._generateDetailRoute(entity, opts);
    return { code, diagnostics };
  }

  /**
   * Generate GET route for an entity.
   * Uses direct Prisma query (bypassing runtime) for efficiency.
   */
  private _generateGetRoute(entity: IREntity, options: NormalizedNextJsOptions): string {
    const { databaseImportPath, responseImportPath } = options;
    const delegateName = toLowerCamelCase(entity.name);
    const variableName = `${delegateName}s`;

    const lines: string[] = [];

    // Add comment explaining the design decision
    lines.push(`// Auto-generated Next.js API route for ${entity.name}`);
    lines.push('// Generated from Manifest IR - DO NOT EDIT');
    lines.push('');
    lines.push('import type { NextRequest } from "next/server";');
    if (options.tenantProvider) {
      lines.push(generateImport(`{ ${options.tenantProvider.functionName} }`, options.tenantProvider.importPath));
      lines.push(generateImport(`{ database }`, databaseImportPath));
    } else {
      lines.push(generateImport(`{ database }`, databaseImportPath));
    }
    lines.push(generateImport(
      `{ manifestErrorResponse, manifestSuccessResponse }`,
      responseImportPath
    ));
    const authImport = generateAuthImport(options);
    if (authImport) lines.push(authImport);
    lines.push('');
    lines.push('export async function GET(request: NextRequest) {');
    lines.push('  try {');
    lines.push(generateAuthBody(options));
    lines.push(generateTenantLookup(options));
    lines.push('');
    lines.push(generatePrismaQuery(entity.name, options));
    lines.push('');
    lines.push(`    return manifestSuccessResponse({ ${variableName} });`);
  lines.push('  } catch (error) {');
    lines.push(`    console.error("Error fetching ${variableName}:", error);`);
    lines.push('    return manifestErrorResponse("Internal server error", 500);');
    lines.push('  }');
    lines.push('}');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generate GET detail route for a single entity instance.
   * Uses direct Prisma findUnique (bypassing runtime) for efficiency.
   */
  private _generateDetailRoute(entity: IREntity, options: NormalizedNextJsOptions): string {
    const { databaseImportPath, responseImportPath } = options;
    const delegateName = toLowerCamelCase(entity.name);

    const lines: string[] = [];

    lines.push(`// Auto-generated Next.js API detail route for ${entity.name}`);
    lines.push('// Generated from Manifest IR - DO NOT EDIT');
    lines.push('');
    lines.push('import type { NextRequest } from "next/server";');
    if (options.tenantProvider) {
      lines.push(generateImport(`{ ${options.tenantProvider.functionName} }`, options.tenantProvider.importPath));
      lines.push(generateImport(`{ database }`, databaseImportPath));
    } else {
      lines.push(generateImport(`{ database }`, databaseImportPath));
    }
    lines.push(generateImport(
      `{ manifestErrorResponse, manifestSuccessResponse }`,
      responseImportPath
    ));
    const authImport = generateAuthImport(options);
    if (authImport) lines.push(authImport);
    lines.push('');
    lines.push('export async function GET(');
    lines.push('  request: NextRequest,');
    lines.push('  { params }: { params: Promise<{ id: string }> }');
    lines.push(') {');
    lines.push('  try {');
    lines.push(generateAuthBody(options));
    lines.push(generateTenantLookup(options));
    lines.push('');
    lines.push('    const { id } = await params;');
    lines.push('');

    // Build the findUnique where clause
    const whereConditions: string[] = ['id'];
    if (options.includeTenantFilter) {
      whereConditions.push(options.tenantIdProperty);
    }
    if (options.includeSoftDeleteFilter) {
      whereConditions.push(`${options.deletedAtProperty}: null`);
    }

    const whereClause = whereConditions.length > 1
      ? `where: {
        ${whereConditions.join(',\n        ')}
      },`
      : `where: { id },`;

    lines.push(`    const ${delegateName} = await database.${delegateName}.findUnique({`);
    lines.push(`      ${whereClause}`);
    lines.push('    });');
    lines.push('');
    lines.push(`    if (!${delegateName}) {`);
    lines.push(`      return manifestErrorResponse("${entity.name} not found", 404);`);
    lines.push('    }');
    lines.push('');
    lines.push(`    return manifestSuccessResponse({ ${delegateName} });`);
    lines.push('  } catch (error) {');
    lines.push(`    console.error("Error fetching ${delegateName}:", error);`);
    lines.push('    return manifestErrorResponse("Internal server error", 500);');
    lines.push('  }');
    lines.push('}');
    lines.push('');

    return lines.join('\n');
  }
}
