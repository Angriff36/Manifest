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
  READ_ROUTES_DEFAULTS,
} from './defaults.js';
import { resolveTableName, type NamingConventionInput } from '../shared/naming.js';

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
  READ_ROUTES_DEFAULTS,
  ROUTES_DEFAULTS,
  getManifestDefaultsSnapshot,
  type ManifestDefaultsSnapshot,
} from './defaults.js';

// Re-export the projection-interface types so downstream consumers of
// `@angriff36/manifest/projections/nextjs` can type the projection
// boundary without reaching into '../interface' directly. CLI commands
// (build.ts, generate.ts) consume these to type their `projection.generate`
// pass-through helpers.
export type {
  ProjectionRequest,
  ProjectionArtifact,
  ProjectionDiagnostic,
  ProjectionResult,
  ProjectionTarget,
  NextJsProjectionOptions,
} from '../interface';

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
  path: string;
}

/**
 * Normalized concrete-command-routes policy.
 */
interface NormalizedConcreteCommandRoutesOptions {
  enabled: boolean;
  legacyAliasesOnly: boolean;
}

/**
 * Normalized read-routes policy.
 */
interface NormalizedReadRoutesOptions {
  enabled: boolean;
  directDbReads: boolean;
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
  unauthorizedStatus: number;
  tenantProvider?: {
    importPath: string;
    functionName: string;
    lookupKey: 'orgId' | 'userId';
  };
  dispatcher: NormalizedDispatcherOptions;
  concreteCommandRoutes: NormalizedConcreteCommandRoutesOptions;
  readRoutes: NormalizedReadRoutesOptions;
  paths: {
    typesFile: string;
    clientFile: string;
    hooksDir: string;
    sharedRuntimeFile: string;
  };
  sharedRuntimeImportPath: string;
  naming?: NamingConventionInput;
  accessorNames: Record<string, string>;
  routeSegments: Record<string, string>;
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
    path: options?.dispatcher?.path ?? DISPATCHER_DEFAULTS.path,
  };
  const concreteCommandRoutes: NormalizedConcreteCommandRoutesOptions = {
    enabled: options?.concreteCommandRoutes?.enabled ?? CONCRETE_COMMAND_ROUTES_DEFAULTS.enabled,
    legacyAliasesOnly:
      options?.concreteCommandRoutes?.legacyAliasesOnly ?? CONCRETE_COMMAND_ROUTES_DEFAULTS.legacyAliasesOnly,
  };
  const readRoutes: NormalizedReadRoutesOptions = {
    enabled: options?.readRoutes?.enabled ?? READ_ROUTES_DEFAULTS.enabled,
    directDbReads: options?.readRoutes?.directDbReads ?? READ_ROUTES_DEFAULTS.directDbReads,
  };

  // Resolve artifact paths from generatedDir (default: 'src').
  // Individual path overrides take precedence.
  const generatedDir = options?.generatedDir ?? 'src';
  const paths = {
    typesFile: options?.paths?.typesFile ?? `${generatedDir}/types/manifest-generated.ts`,
    clientFile: options?.paths?.clientFile ?? `${generatedDir}/lib/manifest-client.ts`,
    hooksDir: options?.paths?.hooksDir ?? `${generatedDir}/hooks`,
    sharedRuntimeFile: options?.paths?.sharedRuntimeFile ?? `${generatedDir}/lib/manifest-shared-runtime.ts`,
  };

  // Derive the import path for the shared-runtime module from its pathHint.
  // e.g. 'src/lib/manifest-shared-runtime.ts' → '@/lib/manifest-shared-runtime'
  const sharedRuntimeImportPath = pathHintToImport(paths.sharedRuntimeFile);

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
    unauthorizedStatus: options?.unauthorizedStatus ?? NEXTJS_DEFAULTS.unauthorizedStatus,
    tenantProvider: options?.tenantProvider ?? DEFAULT_TENANT_PROVIDER,
    dispatcher,
    concreteCommandRoutes,
    readRoutes,
    paths,
    sharedRuntimeImportPath,
    naming: options?.naming,
    accessorNames: options?.accessorNames ?? {},
    routeSegments: options?.routeSegments ?? {},
  };
}

/**
 * Convert a pathHint (e.g. 'src/lib/manifest-shared-runtime.ts') to a
 * TypeScript import alias (e.g. '@/lib/manifest-shared-runtime').
 */
function pathHintToImport(pathHint: string): string {
  return '@/' + pathHint.replace(/^src\//, '').replace(/\.ts$/, '');
}

/**
 * True when any entity in the IR is flagged `realtime`. Realtime is a
 * projection hint only (docs/spec/semantics.md, "Realtime Entities"): when
 * present, SSE surfaces are emitted and inline command surfaces switch to
 * the shared singleton engine so subscriptions can observe command events.
 */
function hasRealtimeEntities(ir: IR): boolean {
  return ir.entities.some(e => e.realtime === true);
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
 * Database accessor name for an entity (`database.<accessor>` in generated
 * read routes). Resolution: explicit `accessorNames` override → `naming`
 * convention (table-name resolution, e.g. snake_case plural for Kysely/raw
 * SQL clients) → camelCased entity name (Prisma delegate convention).
 *
 * Response field names and local variables deliberately do NOT use this —
 * the HTTP API contract stays camelCase regardless of physical DB naming.
 */
function resolveDbAccessor(entityName: string, options: NormalizedNextJsOptions): string {
  const explicit = options.accessorNames[entityName];
  if (explicit) return explicit;
  if (options.naming) return resolveTableName(entityName, options.naming);
  return toLowerCamelCase(entityName);
}

/**
 * URL path segment for an entity in generated route pathHints and client
 * fetch paths. Resolution: explicit `routeSegments` override → lowercased
 * entity name (legacy behavior).
 */
function resolveRouteSegment(entityName: string, options: NormalizedNextJsOptions): string {
  return options.routeSegments[entityName] ?? toEntitySegment(entityName);
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
 *
 * The unauthorized status is wired from `options.unauthorizedStatus` so apps
 * can standardise on 403 (avoiding existence leak) without forking the
 * generator. Thrown errors from the auth helper are NOT handled here — the
 * caller is expected to wrap this body in a try/catch that maps any
 * exception to the same unauthorized status, per goal step 4.
 */
function generateAuthBody(options: NormalizedNextJsOptions): string {
  const { authProvider, unauthorizedStatus } = options;
  const status = unauthorizedStatus;

  switch (authProvider) {
    case 'clerk': {
      const needsOrgId = options.tenantProvider?.lookupKey === 'orgId';
      const destructure = needsOrgId ? '{ orgId, userId }' : '{ userId }';
      const authGuard = needsOrgId
        ? 'if (!(userId && orgId)) {'
        : 'if (!userId) {';
      return `  const ${destructure} = await auth();
  ${authGuard}
    return manifestErrorResponse({ error: "Unauthorized", diagnostics: [] }, ${status});
  }`;
    }

    case 'nextauth':
      return `  const session = await getServerSession();
  if (!session?.user?.id) {
    return manifestErrorResponse({ error: "Unauthorized", diagnostics: [] }, ${status});
  }
  const userId = session.user.id;`;

    case 'custom':
      return `  const user = await getUser(request);
  if (!user?.id) {
    return manifestErrorResponse({ error: "Unauthorized", diagnostics: [] }, ${status});
  }
  const userId = user.id;`;

    case 'none':
      return `  // Auth disabled - all requests allowed\n  const userId = "anonymous";`;

    default:
      return `  // Unknown auth provider - please implement\n  const userId = "unknown";`;
  }
}

/**
 * Tag every emitted runtime error block with a stable Manifest response
 * shape (`{ error, diagnostics }`) at status 500. Auth failures map to
 * `unauthorizedStatus` via a separate branch; transport/runtime failures
 * always carry this shape so downstream clients can rely on it.
 */
function emitRuntimeErrorReturn(unauthorizedStatus: number, opName: string): string[] {
  return [
    '  } catch (error) {',
    '    // Auth helpers (clerk, next-auth, custom) may throw on invalid/expired',
    '    // tokens. Goal step 4: auth failures MUST NEVER surface as 500.',
    '    const isAuthError = error instanceof Error && (',
    '      /unauth/i.test(error.message) ||',
    '      /token/i.test(error.message) ||',
    '      /session/i.test(error.message)',
    '    );',
    '    if (isAuthError) {',
    `      return manifestErrorResponse({ error: "Unauthorized", diagnostics: [] }, ${unauthorizedStatus});`,
    '    }',
    `    console.error(${JSON.stringify(opName)}, error);`,
    '    return manifestErrorResponse(',
    '      { error: "Internal server error", diagnostics: [{ kind: "runtime_error", message: error instanceof Error ? error.message : String(error) }] },',
    '      500,',
    '    );',
    '  }',
  ];
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
    return manifestErrorResponse({ error: "Tenant not found", diagnostics: [] }, 400);
  }`;
  }

  return `
  const userMapping = await database.userTenantMapping.findUnique({
    where: { userId },
  });

  if (!userMapping) {
    return manifestErrorResponse({ error: "User not mapped to tenant", diagnostics: [] }, 400);
  }

  const { ${options.tenantIdProperty} } = userMapping;`;
}

/**
 * True when the entity declares a property with the given name.
 *
 * Read-query generation is field-aware: a filter or orderBy clause may only
 * reference a column the entity actually has. Emitting `deletedAt: null` or
 * `orderBy: { createdAt }` for an entity without those columns produces a
 * query Prisma rejects at runtime ("Unknown argument deletedAt").
 */
function entityHasProperty(entity: IREntity, propertyName: string): boolean {
  return entity.properties.some((p) => p.name === propertyName);
}

/**
 * Generate Prisma query with filters.
 *
 * Field-aware: the soft-delete filter and the orderBy column are only emitted
 * when the entity declares them. Without this, every generated read route
 * assumes soft-delete + creation timestamps exist on every entity.
 */
function generatePrismaQuery(
  entity: IREntity,
  options: NormalizedNextJsOptions
): string {
  const accessorName = resolveDbAccessor(entity.name, options);
  const variableName = `${toLowerCamelCase(entity.name)}s`;
  const { includeTenantFilter, includeSoftDeleteFilter, tenantIdProperty, deletedAtProperty } = options;

  const whereConditions: string[] = [];

  if (includeTenantFilter) {
    whereConditions.push(`${tenantIdProperty}`);
  }

  // Soft-delete filter only when the entity actually declares the column.
  if (includeSoftDeleteFilter && entityHasProperty(entity, deletedAtProperty)) {
    whereConditions.push(`${deletedAtProperty}: null`);
  }

  const whereClause = whereConditions.length > 0
    ? `where: {
        ${whereConditions.join(',\n        ')}
      },`
    : '';

  // orderBy must reference a real column. Prefer createdAt when present;
  // otherwise fall back to the always-present id so the query stays valid.
  const orderByField = entityHasProperty(entity, 'createdAt') ? 'createdAt' : 'id';

  return `const ${variableName} = await database.${accessorName}.findMany({
    ${whereClause}
    orderBy: {
      ${orderByField}: "desc",
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
  readonly surfaces = ['nextjs.route', 'nextjs.detail', 'nextjs.command', 'nextjs.dispatcher', 'nextjs.subscribe', 'nextjs.subscriptionHook', 'nextjs.sharedRuntime', 'ts.types', 'ts.client'] as const;

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
        const opts = normalizeOptions(options);
        if (!opts.readRoutes.enabled) {
          return {
            artifacts: [],
            diagnostics: [{
              severity: 'info',
              code: 'READ_ROUTES_DISABLED',
              message: 'readRoutes.enabled is false — skipping nextjs.route emission.',
              entity: request.entity,
            }],
          };
        }
        const result = this._route(ir, request.entity, options);
        if (result.diagnostics.some(d => d.severity === 'error')) {
          return { artifacts: [], diagnostics: result.diagnostics };
        }
        return {
          artifacts: [{
            id: `nextjs.route:${request.entity}`,
            pathHint: `${opts.appDir}/${resolveRouteSegment(request.entity, opts)}/list/route.ts`,
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
        const detailOpts = normalizeOptions(options);
        if (!detailOpts.readRoutes.enabled) {
          return {
            artifacts: [],
            diagnostics: [{
              severity: 'info',
              code: 'READ_ROUTES_DISABLED',
              message: 'readRoutes.enabled is false — skipping nextjs.detail emission.',
              entity: request.entity,
            }],
          };
        }
        const detailResult = this._detail(ir, request.entity, options);
        if (detailResult.diagnostics.some(d => d.severity === 'error')) {
          return { artifacts: [], diagnostics: detailResult.diagnostics };
        }
        return {
          artifacts: [{
            id: `nextjs.detail:${request.entity}`,
            pathHint: `${detailOpts.appDir}/${resolveRouteSegment(request.entity, detailOpts)}/[id]/route.ts`,
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
            pathHint: `${commandOpts.appDir}/${resolveRouteSegment(request.entity, commandOpts)}/${toKebabCase(request.command)}/route.ts`,
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
        const dispatcherResult = this._dispatcher(ir, options);
        if (dispatcherResult.diagnostics.some(d => d.severity === 'error')) {
          return { artifacts: [], diagnostics: dispatcherResult.diagnostics };
        }
        // dispatcher.path is relative to appDir (joined directly; the
        // default starts with '/' so we don't double-slash on appDir).
        const dispatcherPathHint = `${dispatcherOpts.appDir}${dispatcherOpts.dispatcher.path}`;
        return {
          artifacts: [{
            id: 'nextjs.dispatcher',
            pathHint: dispatcherPathHint,
            contentType: 'typescript',
            code: dispatcherResult.code,
          }],
          diagnostics: dispatcherResult.diagnostics,
        };
      }

      case 'nextjs.subscribe': {
        if (!request.entity) {
          return {
            artifacts: [],
            diagnostics: [{ severity: 'error', code: 'MISSING_ENTITY', message: 'surface "nextjs.subscribe" requires entity' }],
          };
        }
        const subscribeOpts = normalizeOptions(options);
        const subscribeResult = this._subscribe(ir, request.entity, options);
        if (subscribeResult.diagnostics.some(d => d.severity === 'error') || !subscribeResult.code) {
          return { artifacts: [], diagnostics: subscribeResult.diagnostics };
        }
        return {
          artifacts: [{
            id: `nextjs.subscribe:${request.entity}`,
            pathHint: `${subscribeOpts.appDir}/${resolveRouteSegment(request.entity, subscribeOpts)}/subscribe/route.ts`,
            contentType: 'typescript',
            code: subscribeResult.code,
          }],
          diagnostics: subscribeResult.diagnostics,
        };
      }

      case 'nextjs.subscriptionHook': {
        if (!request.entity) {
          return {
            artifacts: [],
            diagnostics: [{ severity: 'error', code: 'MISSING_ENTITY', message: 'surface "nextjs.subscriptionHook" requires entity' }],
          };
        }
        const opts = normalizeOptions(options);
        const hookResult = this._subscriptionHook(ir, request.entity, opts);
        if (hookResult.diagnostics.some(d => d.severity === 'error') || !hookResult.code) {
          return { artifacts: [], diagnostics: hookResult.diagnostics };
        }
        return {
          artifacts: [{
            id: `nextjs.subscriptionHook:${request.entity}`,
            pathHint: `${opts.paths.hooksDir}/use${request.entity}Subscription.ts`,
            contentType: 'typescript',
            code: hookResult.code,
          }],
          diagnostics: hookResult.diagnostics,
        };
      }

      case 'nextjs.sharedRuntime': {
        const opts = normalizeOptions(options);
        const sharedResult = this._sharedRuntime(ir, options);
        if (!sharedResult.code) {
          return { artifacts: [], diagnostics: sharedResult.diagnostics };
        }
        return {
          artifacts: [{
            id: 'nextjs.sharedRuntime',
            pathHint: opts.paths.sharedRuntimeFile,
            contentType: 'typescript',
            code: sharedResult.code,
          }],
          diagnostics: sharedResult.diagnostics,
        };
      }

      case 'ts.types': {
        const opts = normalizeOptions(options);
        const result = this._types(ir);
        return {
          artifacts: [{
            id: 'ts.types',
            pathHint: opts.paths.typesFile,
            contentType: 'typescript',
            code: result.code,
          }],
          diagnostics: result.diagnostics,
        };
      }

      case 'ts.client': {
        const opts = normalizeOptions(options);
        const result = this._client(ir, opts);
        return {
          artifacts: [{
            id: 'ts.client',
            pathHint: opts.paths.clientFile,
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

  private _client(ir: IR, options: NormalizedNextJsOptions): CodeResult {
    const lines: string[] = [];

    lines.push('// Auto-generated client SDK from Manifest IR');
    lines.push('// DO NOT EDIT - This file is generated from .manifest source');
    lines.push('');

    for (const entity of ir.entities) {
      const lowerEntity = resolveRouteSegment(entity.name, options);
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

    const code = this._generatePostCommandHandler(entity, command, opts, hasRealtimeEntities(ir));
    return { code, diagnostics };
  }

  /**
   * Generate POST command handler for an entity command.
   * Writes MUST flow through runtime.runCommand() to enforce guards, policies, and constraints.
   */
  private _generatePostCommandHandler(
    entity: IREntity,
    command: IRCommand,
    options: NormalizedNextJsOptions,
    useSharedRuntime: boolean
  ): string {
    const { responseImportPath, runtimeImportPath, dispatcher } = options;
    const useExternalExecutor = dispatcher.executionMode === 'externalExecutor';
    // Realtime SSE requires command execution and subscriptions to share ONE
    // engine; inline mode switches to the generated shared-runtime accessor.
    // externalExecutor mode is unaffected — the executor owns runtime
    // construction (and should use getSharedRuntime() itself).
    const useShared = useSharedRuntime && !useExternalExecutor;

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
    } else if (useShared) {
      lines.push(generateImport('{ getSharedRuntime }', options.sharedRuntimeImportPath));
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
    if (dispatcher.deriveInstanceId) {
      // Goal step 4: non-create commands must extract instanceId from the
      // request. Extract universally — create commands ignore it harmlessly.
      lines.push('    const instanceId = typeof body?.instanceId === "string"');
      lines.push('      ? body.instanceId');
      lines.push('      : typeof body?.id === "string"');
      lines.push('        ? body.id');
      lines.push('        : undefined;');
      lines.push('');
    }
    if (useExternalExecutor) {
      const tenantField = options.tenantIdProperty;
      const tenantValueExpr = options.includeTenantFilter ? tenantField : '"__no_tenant__"';
      lines.push(`    const result = await ${dispatcher.executorImportName}({`);
      lines.push(`      entityName: "${entity.name}",`);
      lines.push(`      commandName: "${command.name}",`);
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
      const tenantCtx = options.includeTenantFilter
        ? `{ user: { id: userId, ${options.tenantIdProperty}: ${options.tenantIdProperty} } }`
        : `{ user: { id: userId, ${options.tenantIdProperty}: "__no_tenant__" } }`;
      if (useShared) {
        lines.push('    const runtime = await getSharedRuntime();');
        lines.push(`    runtime.replaceContext(${tenantCtx});`);
      } else {
        lines.push(`    const runtime = await createManifestRuntime(${tenantCtx});`);
      }
      lines.push(`    const result = await runtime.runCommand("${command.name}", body, {`);
      lines.push(`      entityName: "${entity.name}",`);
      if (dispatcher.deriveInstanceId) {
        // runtime-engine.ts runCommand accepts { entityName?, instanceId? }
        // as its third arg — pass instanceId through for non-create commands.
        lines.push('      instanceId,');
      }
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
    for (const errLine of emitRuntimeErrorReturn(
      options.unauthorizedStatus,
      `Error executing ${entity.name}.${command.name}:`,
    )) {
      lines.push(errLine);
    }
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
    ir: IR,
    options?: NextJsProjectionOptions
  ): CodeResult {
    const opts = normalizeOptions(options);
    const code = this._generateDispatcherHandler(opts, hasRealtimeEntities(ir));
    return { code, diagnostics: [] };
  }

  private _generateDispatcherHandler(options: NormalizedNextJsOptions, useSharedRuntime: boolean): string {
    const { responseImportPath, runtimeImportPath, dispatcher } = options;
    const useExternalExecutor = dispatcher.executionMode === 'externalExecutor';
    // Realtime SSE requires command execution and subscriptions to share ONE
    // engine; inline mode switches to the generated shared-runtime accessor.
    const useShared = useSharedRuntime && !useExternalExecutor;
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
    } else if (useShared) {
      lines.push(generateImport('{ getSharedRuntime }', options.sharedRuntimeImportPath));
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
    // Goal step 4: extract instanceId universally when deriveInstanceId is on
    // (default). Non-create commands (release, archive, update, ...) need
    // this; create commands ignore it harmlessly. Body shape preference:
    // body.instanceId, then body.id, then undefined.
    if (dispatcher.deriveInstanceId) {
      lines.push('    const instanceId = typeof body?.instanceId === "string"');
      lines.push('      ? body.instanceId');
      lines.push('      : typeof body?.id === "string"');
      lines.push('        ? body.id');
      lines.push('        : undefined;');
      lines.push('');
    }
    if (useExternalExecutor) {
      // externalExecutor mode: delegate to app-owned executor; do NOT construct
      // a runtime inline. The executor receives full RuntimeContext + the
      // raw entity/command keys parsed from the URL, plus the input body.
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
      // inline mode: construct (or reuse the shared singleton) runtime and
      // call runCommand. Typed RuntimeContext: tenantId/orgId/actorId/
      // requestId/source. Legacy `user` shorthand preserved for downstream
      // callers still reading it; new code MUST prefer actorId.
      if (useShared) {
        lines.push('    const runtime = await getSharedRuntime();');
        lines.push('    runtime.replaceContext({');
      } else {
        lines.push('    const runtime = await createManifestRuntime({');
      }
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
      if (dispatcher.deriveInstanceId) {
        // runtime-engine.ts runCommand options accept instanceId — pass it
        // through so non-create commands route to the correct instance.
        lines.push('      instanceId,');
      }
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
    for (const errLine of emitRuntimeErrorReturn(
      options.unauthorizedStatus,
      'Manifest dispatcher error:',
    )) {
      lines.push(errLine);
    }
    lines.push('}');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generate the SSE subscription route for a realtime entity.
   * GET <appDir>/<entity>/subscribe/route.ts — streams runtime events whose
   * subject.entity matches, over the shared singleton engine.
   */
  private _subscribe(
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
    if (entity.realtime !== true) {
      diagnostics.push({
        severity: 'info',
        code: 'REALTIME_NOT_ENABLED',
        message: `Entity "${entityName}" is not flagged \`realtime\` — skipping SSE subscription route.`,
        entity: entityName,
      });
      return { code: '', diagnostics };
    }

    const lines: string[] = [];
    lines.push(`// Auto-generated SSE subscription route for ${entity.name}.`);
    lines.push('// Generated from Manifest IR - DO NOT EDIT');
    lines.push('//');
    lines.push(`// Streams runtime events for realtime entity "${entity.name}" over`);
    lines.push('// Server-Sent Events. Uses the shared singleton engine so command');
    lines.push('// routes and subscriptions observe the same event stream.');
    lines.push('// Requires a long-lived, single-instance deployment');
    lines.push('// (docs/spec/semantics.md § "Realtime Entities").');
    lines.push('');
    lines.push('import type { NextRequest } from "next/server";');
    lines.push(generateImport('{ manifestErrorResponse }', opts.responseImportPath));
    lines.push(generateImport('{ getSharedRuntime }', opts.sharedRuntimeImportPath));
    const authImport = generateAuthImport(opts);
    if (authImport) lines.push(authImport);
    lines.push('');
    lines.push('export async function GET(request: NextRequest) {');
    lines.push('  try {');
    lines.push(generateAuthBody(opts));
    lines.push('');
    lines.push('    const runtime = await getSharedRuntime();');
    lines.push('    const encoder = new TextEncoder();');
    lines.push('');
    lines.push('    const stream = new ReadableStream({');
    lines.push('      start(controller) {');
    lines.push(`        const unsubscribe = runtime.subscribe("${entity.name}", (event) => {`);
    lines.push('          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\\n\\n`));');
    lines.push('        });');
    lines.push('        const close = () => {');
    lines.push('          unsubscribe();');
    lines.push('          try {');
    lines.push('            controller.close();');
    lines.push('          } catch {');
    lines.push('            // stream already closed');
    lines.push('          }');
    lines.push('        };');
    lines.push('        request.signal.addEventListener("abort", close);');
    lines.push('      },');
    lines.push('    });');
    lines.push('');
    lines.push('    return new Response(stream, {');
    lines.push('      headers: {');
    lines.push('        "Content-Type": "text/event-stream",');
    lines.push('        "Cache-Control": "no-cache, no-transform",');
    lines.push('        Connection: "keep-alive",');
    lines.push('      },');
    lines.push('    });');
    for (const errLine of emitRuntimeErrorReturn(
      opts.unauthorizedStatus,
      `Error subscribing to ${entity.name}:`,
    )) {
      lines.push(errLine);
    }
    lines.push('}');
    lines.push('');

    return { code: lines.join('\n'), diagnostics };
  }

  /**
   * Generate a typed client-side EventSource hook for a realtime entity,
   * with exponential-backoff reconnect.
   */
  private _subscriptionHook(ir: IR, entityName: string, options: NormalizedNextJsOptions): CodeResult {
    const diagnostics: ProjectionDiagnostic[] = [];

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
    if (entity.realtime !== true) {
      diagnostics.push({
        severity: 'info',
        code: 'REALTIME_NOT_ENABLED',
        message: `Entity "${entityName}" is not flagged \`realtime\` — skipping subscription hook.`,
        entity: entityName,
      });
      return { code: '', diagnostics };
    }

    const name = entity.name;
    const subscribePath = `/api/${resolveRouteSegment(name, options)}/subscribe`;
    const code = `"use client";

// Auto-generated subscription hook for ${name}.
// Generated from Manifest IR - DO NOT EDIT
//
// Subscribes to ${subscribePath} (SSE) with typed payloads and
// exponential-backoff reconnect.

import { useEffect, useRef, useState } from "react";

/** Event payload delivered for ${name} subscriptions. */
export interface ${name}SubscriptionEvent {
  name: string;
  channel: string;
  payload: unknown;
  timestamp: number;
  subject?: { entity?: string; command?: string; instanceId?: string };
}

export interface Use${name}SubscriptionOptions {
  /** Called for every event observed for ${name}. */
  onEvent?: (event: ${name}SubscriptionEvent) => void;
  /** Initial reconnect delay in ms (doubles per attempt). Default 1000. */
  initialRetryDelayMs?: number;
  /** Reconnect delay ceiling in ms. Default 30000. */
  maxRetryDelayMs?: number;
}

export function use${name}Subscription(options: Use${name}SubscriptionOptions = {}) {
  const { onEvent, initialRetryDelayMs = 1000, maxRetryDelayMs = 30000 } = options;
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<${name}SubscriptionEvent | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = initialRetryDelayMs;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      source = new EventSource("${subscribePath}");
      source.onopen = () => {
        setConnected(true);
        retryDelay = initialRetryDelayMs;
      };
      source.onmessage = (message) => {
        const event = JSON.parse(message.data) as ${name}SubscriptionEvent;
        setLastEvent(event);
        onEventRef.current?.(event);
      };
      source.onerror = () => {
        setConnected(false);
        source?.close();
        source = null;
        if (disposed) return;
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, maxRetryDelayMs);
      };
    };

    connect();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, [initialRetryDelayMs, maxRetryDelayMs]);

  return { connected, lastEvent };
}
`;
    return { code, diagnostics };
  }

  /**
   * Generate the module-scoped singleton runtime accessor. Emitted only when
   * the IR contains at least one realtime entity — SSE routes and command
   * routes must share ONE engine instance for subscriptions to observe
   * command events (the event stream is per-engine and in-memory).
   */
  private _sharedRuntime(ir: IR, options?: NextJsProjectionOptions): CodeResult {
    const diagnostics: ProjectionDiagnostic[] = [];
    if (!hasRealtimeEntities(ir)) {
      diagnostics.push({
        severity: 'info',
        code: 'REALTIME_NOT_ENABLED',
        message: 'No entity is flagged `realtime` — skipping shared runtime accessor.',
      });
      return { code: '', diagnostics };
    }

    const opts = normalizeOptions(options);
    const code = `// Auto-generated shared Manifest runtime accessor.
// Generated from Manifest IR - DO NOT EDIT
//
// Realtime SSE requires command execution and subscriptions to observe the
// SAME engine instance: the event stream is per-engine and in-memory. This
// module memoizes ONE runtime per server process.
//
// Deployment constraint: requires a long-lived, single-instance Node server.
// Serverless / multi-instance fan-out needs an external event bus (out of
// scope). See docs/spec/semantics.md § "Realtime Entities".

import { createManifestRuntime } from "${opts.runtimeImportPath}";

type SharedRuntime = Awaited<ReturnType<typeof createManifestRuntime>>;

let sharedRuntimePromise: Promise<SharedRuntime> | null = null;

/**
 * Returns the module-scoped singleton runtime. Request handlers MUST set
 * per-request context via runtime.replaceContext() before runCommand.
 */
export function getSharedRuntime(): Promise<SharedRuntime> {
  if (!sharedRuntimePromise) {
    sharedRuntimePromise = createManifestRuntime({});
  }
  return sharedRuntimePromise;
}
`;
    return { code, diagnostics };
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
    if (options.readRoutes.directDbReads) {
      lines.push(generatePrismaQuery(entity, options));
    } else {
      // directDbReads disabled: emit a stub that returns an empty list and
      // a diagnostic telling the app to wire its own read source.
      lines.push(`    // readRoutes.directDbReads = false: emit no inline Prisma call.`);
      lines.push(`    // Wire your read source here and assign to \`${variableName}\`.`);
      lines.push(`    const ${variableName}: unknown[] = [];`);
    }
    lines.push('');
    lines.push(`    return manifestSuccessResponse({ ${variableName} });`);
    for (const errLine of emitRuntimeErrorReturn(
      options.unauthorizedStatus,
      `Error fetching ${variableName}:`,
    )) {
      lines.push(errLine);
    }
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
    const accessorName = resolveDbAccessor(entity.name, options);

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

    // Build the where clause and pick the correct Prisma method.
    // Prisma 7: findUnique REQUIRES the where to be a unique constraint
    // (just `id` for typical schemas). Multi-field filters need findFirst.
    // The previous template emitted findUnique({ where: { id, tenantId,
    // deletedAt } }) which fails type-check on Prisma 7. Goal step 5.
    const whereConditions: string[] = ['id'];
    if (options.includeTenantFilter) {
      whereConditions.push(options.tenantIdProperty);
    }
    // Soft-delete filter only when the entity actually declares the column.
    if (options.includeSoftDeleteFilter && entityHasProperty(entity, options.deletedAtProperty)) {
      whereConditions.push(`${options.deletedAtProperty}: null`);
    }
    const isMultiField = whereConditions.length > 1;
    const prismaMethod = isMultiField ? 'findFirst' : 'findUnique';
    const whereClause = isMultiField
      ? `where: {
        ${whereConditions.join(',\n        ')}
      },`
      : `where: { id },`;

    if (options.readRoutes.directDbReads) {
      lines.push(`    // Using ${prismaMethod} — ${isMultiField ? 'multi-field filter (tenant/soft-delete) requires findFirst on Prisma 7+' : 'single id is a unique constraint'}.`);
      lines.push(`    const ${delegateName} = await database.${accessorName}.${prismaMethod}({`);
      lines.push(`      ${whereClause}`);
      lines.push('    });');
    } else {
      lines.push(`    // readRoutes.directDbReads = false: emit no inline Prisma call.`);
      lines.push(`    // Wire your read source here and assign to \`${delegateName}\`.`);
      lines.push(`    const ${delegateName}: unknown = null;`);
    }
    lines.push('');
    lines.push(`    if (!${delegateName}) {`);
    lines.push(`      return manifestErrorResponse({ error: "${entity.name} not found", diagnostics: [] }, 404);`);
    lines.push('    }');
    lines.push('');
    lines.push(`    return manifestSuccessResponse({ ${delegateName} });`);
    for (const errLine of emitRuntimeErrorReturn(
      options.unauthorizedStatus,
      `Error fetching ${delegateName}:`,
    )) {
      lines.push(errLine);
    }
    lines.push('}');
    lines.push('');

    return lines.join('\n');
  }
}
