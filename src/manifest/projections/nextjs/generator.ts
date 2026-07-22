/**
 * Next.js App Router projection for Manifest IR.
 *
 * Generates Next.js API route handlers using App Router conventions.
 * Configurable for different auth providers and database setups.
 */

import type { IR, IRCommand, IREntity, IREnum, IRType } from '../../ir';
import type {
  NextJsProjectionOptions,
  ProjectionDiagnostic,
  ProjectionRequest,
  ProjectionResult,
  ProjectionTarget,
} from '../interface';
import { generateRuntimeFactoryModule, resolveLocalImportPathHint } from '../shared/companions.js';
import { resolveRuntimeFactoryFanIn } from '../../runtime-config.js';
import {
  type NamingConventionInput,
  type RouteCasing,
  resolveTableName,
} from '../shared/naming.js';
import {
  detailEnvelopeKey,
  listEnvelopeKey,
  type RouteContract,
  resolveEntitySegment,
  resolveRouteContract,
} from '../shared/route-contract.js';
import { irTypeToTypeScript } from '../shared/typescript-types.js';
import {
  CONCRETE_COMMAND_ROUTES_DEFAULTS,
  DEFAULT_TENANT_PROVIDER,
  DISPATCHER_DEFAULTS,
  NEXTJS_DEFAULTS,
  READ_ROUTES_DEFAULTS,
  REALTIME_DEFAULTS,
} from './defaults.js';
import { generateScheduleCronRoutes } from './schedule-generator.js';
import { generateWebhookRoutes } from './webhook-generator.js';
import { NEXTJS_DESCRIPTOR_META } from './descriptor-meta.js';

// Re-export the projection-interface types so downstream consumers of
// `@angriff36/manifest/projections/nextjs` can type the projection
// boundary without reaching into '../interface' directly. CLI commands
// (build.ts, generate.ts) consume these to type their `projection.generate`
// pass-through helpers.
export type {
  NextJsProjectionOptions,
  ProjectionArtifact,
  ProjectionDiagnostic,
  ProjectionRequest,
  ProjectionResult,
  ProjectionTarget,
} from '../interface';
/**
 * Re-export the canonical defaults so consumers of
 * `@angriff36/manifest/projections/nextjs` get the defaults from the same
 * entry point as the projection class. Anything that needs to render or
 * snapshot the defaults (CLI inspect, tests, downstream tooling) must use
 * these names, not redeclare them.
 */
export {
  CONCRETE_COMMAND_ROUTES_DEFAULTS,
  DEFAULT_TENANT_PROVIDER,
  DISPATCHER_DEFAULTS,
  getManifestDefaultsSnapshot,
  type ManifestDefaultsSnapshot,
  NEXTJS_DEFAULTS,
  READ_ROUTES_DEFAULTS,
  ROUTES_DEFAULTS,
} from './defaults.js';

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
  deriveInstanceId: boolean;
  enabled: boolean;
  executionMode: 'inline' | 'externalExecutor';
  executorImportName: string;
  executorImportPath: string;
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
  directDbReads: boolean;
  enabled: boolean;
}

/**
 * Normalized realtime (SSE) delivery policy.
 */
interface NormalizedRealtimeOptions {
  requireEventBus: boolean;
}

/**
 * Normalized options for internal use (all required, no outputPath).
 */
interface NormalizedNextJsOptions {
  accessorNames: Record<string, string>;
  /** Explicit client/dispatcher URL bases; undefined ⇒ contract derives from appDir. */
  apiBasePath?: string;
  appDir: string;
  authImportPath: string;
  authProvider: 'clerk' | 'nextauth' | 'custom' | 'none';
  /** Resolved ts.client fetch adapter (host-provided auth fetch), if configured. */
  clientFetchAdapter?: { importPath: string; importName: string };
  concreteCommandRoutes: NormalizedConcreteCommandRoutesOptions;
  databaseImportPath: string;
  dateSerialization: 'date' | 'iso-string';
  deletedAtProperty: string;
  dispatcher: NormalizedDispatcherOptions;
  dispatcherBasePath?: string;
  emitCompanions: boolean;
  includeComments: boolean;
  includeSoftDeleteFilter: boolean;
  includeTenantFilter: boolean;
  indentSize: number;
  naming?: NamingConventionInput;
  paths: {
    typesFile: string;
    clientFile: string;
    hooksDir: string;
    sharedRuntimeFile: string;
  };
  readRoutes: NormalizedReadRoutesOptions;
  realtime: NormalizedRealtimeOptions;
  responseImportPath: string;
  routeCasing: RouteCasing;
  routeSegments: Record<string, string>;
  /** IR module name per entity — feeds route-contract module nesting. */
  entityModules: Record<string, string>;
  runtimeConfigImport?: string;
  /** Config G7 — from top-level `runtime` via `__manifestRuntime`. */
  runtimeFanIn: ReturnType<typeof resolveRuntimeFactoryFanIn>;
  runtimeImportPath: string;
  sharedRuntimeImportPath: string;
  strictMode: boolean;
  tenantIdProperty: string;
  tenantProvider?: {
    importPath: string;
    functionName: string;
    lookupKey: 'orgId' | 'userId';
  };
  unauthorizedStatus: number;
}

/**
 * Normalize user options with defaults from `./defaults`.
 *
 * Defaults are imported (not redeclared) so the projection, the CLI's
 * `manifest config print-defaults`, and the JSON schema all agree.
 *
 * When `ir.tenant` is declared and the caller does not set tenant options,
 * tenant filtering turns on and the property name follows the IR (same
 * pattern as Convex/Prisma). Explicit options always win.
 */
function normalizeOptions(options?: NextJsProjectionOptions, ir?: IR): NormalizedNextJsOptions {
  const dispatcher: NormalizedDispatcherOptions = {
    enabled: options?.dispatcher?.enabled ?? DISPATCHER_DEFAULTS.enabled,
    executionMode: options?.dispatcher?.executionMode ?? DISPATCHER_DEFAULTS.executionMode,
    executorImportPath:
      options?.dispatcher?.executorImportPath ?? DISPATCHER_DEFAULTS.executorImportPath,
    executorImportName:
      options?.dispatcher?.executorImportName ?? DISPATCHER_DEFAULTS.executorImportName,
    deriveInstanceId: options?.dispatcher?.deriveInstanceId ?? DISPATCHER_DEFAULTS.deriveInstanceId,
    path: options?.dispatcher?.path ?? DISPATCHER_DEFAULTS.path,
  };
  const concreteCommandRoutes: NormalizedConcreteCommandRoutesOptions = {
    enabled: options?.concreteCommandRoutes?.enabled ?? CONCRETE_COMMAND_ROUTES_DEFAULTS.enabled,
    legacyAliasesOnly:
      options?.concreteCommandRoutes?.legacyAliasesOnly ??
      CONCRETE_COMMAND_ROUTES_DEFAULTS.legacyAliasesOnly,
  };
  const readRoutes: NormalizedReadRoutesOptions = {
    enabled: options?.readRoutes?.enabled ?? READ_ROUTES_DEFAULTS.enabled,
    directDbReads: options?.readRoutes?.directDbReads ?? READ_ROUTES_DEFAULTS.directDbReads,
  };
  const realtime: NormalizedRealtimeOptions = {
    requireEventBus: options?.realtime?.requireEventBus ?? REALTIME_DEFAULTS.requireEventBus,
  };

  // Resolve artifact paths from generatedDir (default: 'src').
  // Individual path overrides take precedence.
  const generatedDir = options?.generatedDir ?? 'src';
  const paths = {
    typesFile: options?.paths?.typesFile ?? `${generatedDir}/types/manifest-generated.ts`,
    clientFile: options?.paths?.clientFile ?? `${generatedDir}/lib/manifest-client.ts`,
    hooksDir: options?.paths?.hooksDir ?? `${generatedDir}/hooks`,
    sharedRuntimeFile:
      options?.paths?.sharedRuntimeFile ?? `${generatedDir}/lib/manifest-shared-runtime.ts`,
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
    includeTenantFilter:
      options?.includeTenantFilter ??
      (ir?.tenant ? true : NEXTJS_DEFAULTS.includeTenantFilter),
    includeSoftDeleteFilter:
      options?.includeSoftDeleteFilter ?? NEXTJS_DEFAULTS.includeSoftDeleteFilter,
    tenantIdProperty:
      options?.tenantIdProperty ?? ir?.tenant?.property ?? NEXTJS_DEFAULTS.tenantIdProperty,
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
    realtime,
    paths,
    sharedRuntimeImportPath,
    naming: options?.naming,
    accessorNames: options?.accessorNames ?? {},
    routeSegments: options?.routeSegments ?? {},
    entityModules: Object.fromEntries(
      (ir?.entities ?? [])
        .filter((e) => typeof e.module === 'string' && e.module.trim().length > 0)
        .map((e) => [e.name, e.module as string]),
    ),
    routeCasing: options?.routeCasing ?? NEXTJS_DEFAULTS.routeCasing,
    dateSerialization: options?.dateSerialization ?? NEXTJS_DEFAULTS.dateSerialization,
    emitCompanions: options?.emitCompanions ?? NEXTJS_DEFAULTS.emitCompanions,
    runtimeConfigImport: options?.runtimeConfigImport,
    runtimeFanIn: resolveRuntimeFactoryFanIn(options as Record<string, unknown> | undefined),
    apiBasePath: options?.apiBasePath,
    dispatcherBasePath: options?.dispatcherBasePath,
    clientFetchAdapter: options?.client?.fetchAdapter
      ? {
          importPath: options.client.fetchAdapter.importPath,
          importName: options.client.fetchAdapter.importName ?? 'apiFetch',
        }
      : undefined,
  };
}

/**
 * Build the cross-projection route contract from normalized options. This is the
 * single source of truth for entity URL segments, the api/dispatcher URL bases,
 * route pathHints, and read-envelope keys: the generated client SDK and the
 * emitted route files both resolve their paths from THIS, so a client can never
 * target a URL no route serves (the drift the 2026-07-01 audit flagged).
 */
function buildRouteContract(options: NormalizedNextJsOptions): RouteContract {
  return resolveRouteContract({
    appDir: options.appDir,
    apiBasePath: options.apiBasePath,
    dispatcherBasePath: options.dispatcherBasePath,
    routeSegments: options.routeSegments,
    routeCasing: options.routeCasing,
    dispatcherRoutePath: options.dispatcher.path,
  });
}

/**
 * Convert a pathHint (e.g. 'src/lib/manifest-shared-runtime.ts') to a
 * TypeScript import alias (e.g. '@/lib/manifest-shared-runtime').
 */
function pathHintToImport(pathHint: string): string {
  return '@/' + pathHint.replace(/^src\//, '').replace(/\.ts$/, '');
}

function relativeArtifactImport(importer: string, target: string): string {
  const from = importer.replace(/\\/g, '/').split('/').slice(0, -1);
  const to = target.replace(/\\/g, '/').replace(/\.ts$/, '').split('/');
  while (from.length > 0 && to.length > 0 && from[0] === to[0]) {
    from.shift();
    to.shift();
  }
  const specifier = [...from.map(() => '..'), ...to].join('/');
  return specifier.startsWith('.') ? specifier : `./${specifier}`;
}

/**
 * True when any entity in the IR is flagged `realtime`. Realtime is a
 * projection hint only (docs/spec/semantics.md, "Realtime Entities"): when
 * present, SSE surfaces are emitted and inline command surfaces switch to
 * the shared singleton engine so subscriptions can observe command events.
 */
function hasRealtimeEntities(ir: IR): boolean {
  return ir.entities.some((e) => e.realtime === true);
}

function toLowerCamelCase(value: string): string {
  if (!value) {
    return value;
  }
  return value[0].toLowerCase() + value.slice(1);
}

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function capitalizeFirst(value: string): string {
  if (!value) {
    return value;
  }
  return value[0].toUpperCase() + value.slice(1);
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
  if (explicit) {
    return explicit;
  }
  if (options.naming) {
    return resolveTableName(entityName, options.naming);
  }
  return toLowerCamelCase(entityName);
}

/**
 * URL path segment for an entity in generated route pathHints and client
 * fetch paths. Resolution: explicit `routeSegments` override (used verbatim) →
 * entity name normalized per `routeCasing` (default `lowercase`, legacy behavior).
 */
function resolveRouteSegment(entityName: string, options: NormalizedNextJsOptions): string {
  return resolveEntitySegment(entityName, {
    routeSegments: options.routeSegments,
    routeCasing: options.routeCasing,
  });
}

/**
 * Generate an import statement with proper path handling.
 */
function generateImport(module: string, from: string): string {
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
      const authGuard = needsOrgId ? 'if (!(userId && orgId)) {' : 'if (!userId) {';
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
function generatePrismaQuery(entity: IREntity, options: NormalizedNextJsOptions): string {
  const accessorName = resolveDbAccessor(entity.name, options);
  const variableName = listEnvelopeKey(entity.name);
  const { includeTenantFilter, includeSoftDeleteFilter, tenantIdProperty, deletedAtProperty } =
    options;

  const whereConditions: string[] = [];

  if (includeTenantFilter) {
    whereConditions.push(`${tenantIdProperty}`);
  }

  // Soft-delete filter only when the entity actually declares the column.
  if (includeSoftDeleteFilter && entityHasProperty(entity, deletedAtProperty)) {
    whereConditions.push(`${deletedAtProperty}: null`);
  }

  const whereClause =
    whereConditions.length > 0
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
function irTypeToTsType(
  irType: {
    name: string;
    nullable: boolean;
    generic?: { name: string; nullable: boolean; generic?: unknown };
  },
  dateAsString = false,
): string {
  return irTypeToTypeScript(irType as IRType, dateAsString);
}

/**
 * Generate TypeScript types from IR entity.
 */
function generateEnumType(e: IREnum): string {
  const members = e.values.map((v) => JSON.stringify(v.name)).join(' | ');
  return `export type ${e.name} = ${members};`;
}

function generateEntityTypes(entity: IREntity, dateAsString = false): string {
  const lines: string[] = [];

  lines.push(`export interface ${entity.name} {`);
  for (const prop of entity.properties) {
    const tsType = irTypeToTsType(prop.type, dateAsString);
    const isOptional =
      prop.modifiers.includes('optional') || prop.defaultValue !== undefined || prop.type.nullable;
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
  readonly description =
    'Next.js App Router API routes with configurable auth and database support';
  readonly surfaces = [
    'nextjs.route',
    'nextjs.detail',
    'nextjs.command',
    'nextjs.dispatcher',
    'nextjs.subscribe',
    'nextjs.subscriptionHook',
    'nextjs.sharedRuntime',
    'nextjs.schedule',
    'nextjs.webhook',
    'nextjs.companions',
    'ts.types',
    'ts.client',
  ] as const;
  readonly descriptorMeta = NEXTJS_DESCRIPTOR_META;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const options = request.options as NextJsProjectionOptions | undefined;

    switch (request.surface) {
      case 'nextjs.route': {
        if (!request.entity) {
          return {
            artifacts: [],
            diagnostics: [
              {
                severity: 'error',
                code: 'MISSING_ENTITY',
                message: 'surface "nextjs.route" requires entity',
              },
            ],
          };
        }
        const opts = normalizeOptions(options, ir);
        if (!opts.readRoutes.enabled) {
          return {
            artifacts: [],
            diagnostics: [
              {
                severity: 'info',
                code: 'READ_ROUTES_DISABLED',
                message: 'readRoutes.enabled is false — skipping nextjs.route emission.',
                entity: request.entity,
              },
            ],
          };
        }
        const result = this._route(ir, request.entity, options);
        if (result.diagnostics.some((d) => d.severity === 'error')) {
          return { artifacts: [], diagnostics: result.diagnostics };
        }
        return {
          artifacts: [
            {
              id: `nextjs.route:${request.entity}`,
              pathHint: `${opts.appDir}/${resolveRouteSegment(request.entity, opts)}/list/route.ts`,
              contentType: 'typescript',
              code: result.code,
            },
          ],
          diagnostics: result.diagnostics,
        };
      }

      case 'nextjs.detail': {
        if (!request.entity) {
          return {
            artifacts: [],
            diagnostics: [
              {
                severity: 'error',
                code: 'MISSING_ENTITY',
                message: 'surface "nextjs.detail" requires entity',
              },
            ],
          };
        }
        const detailOpts = normalizeOptions(options, ir);
        if (!detailOpts.readRoutes.enabled) {
          return {
            artifacts: [],
            diagnostics: [
              {
                severity: 'info',
                code: 'READ_ROUTES_DISABLED',
                message: 'readRoutes.enabled is false — skipping nextjs.detail emission.',
                entity: request.entity,
              },
            ],
          };
        }
        const detailResult = this._detail(ir, request.entity, options);
        if (detailResult.diagnostics.some((d) => d.severity === 'error')) {
          return { artifacts: [], diagnostics: detailResult.diagnostics };
        }
        return {
          artifacts: [
            {
              id: `nextjs.detail:${request.entity}`,
              pathHint: `${detailOpts.appDir}/${resolveRouteSegment(request.entity, detailOpts)}/[id]/route.ts`,
              contentType: 'typescript',
              code: detailResult.code,
            },
          ],
          diagnostics: detailResult.diagnostics,
        };
      }

      case 'nextjs.command': {
        if (!request.entity) {
          return {
            artifacts: [],
            diagnostics: [
              {
                severity: 'error',
                code: 'MISSING_ENTITY',
                message: 'surface "nextjs.command" requires entity',
              },
            ],
          };
        }
        if (!request.command) {
          return {
            artifacts: [],
            diagnostics: [
              {
                severity: 'error',
                code: 'MISSING_COMMAND',
                message: 'surface "nextjs.command" requires command',
              },
            ],
          };
        }
        const commandOpts = normalizeOptions(options, ir);
        if (!commandOpts.concreteCommandRoutes.enabled) {
          return {
            artifacts: [],
            diagnostics: [
              {
                severity: 'info',
                code: 'CONCRETE_COMMAND_ROUTES_DISABLED',
                message:
                  'concreteCommandRoutes.enabled is false — skipping per-command route emission. Use nextjs.dispatcher instead.',
                entity: request.entity,
              },
            ],
          };
        }
        const commandResult = this._command(ir, request.entity, request.command, options);
        if (commandResult.diagnostics.some((d) => d.severity === 'error')) {
          return { artifacts: [], diagnostics: commandResult.diagnostics };
        }
        return {
          artifacts: [
            {
              id: `nextjs.command:${request.entity}.${request.command}`,
              pathHint: `${commandOpts.appDir}/${resolveRouteSegment(request.entity, commandOpts)}/${toKebabCase(request.command)}/route.ts`,
              contentType: 'typescript',
              code: commandResult.code,
            },
          ],
          diagnostics: commandResult.diagnostics,
        };
      }

      case 'nextjs.dispatcher': {
        const dispatcherOpts = normalizeOptions(options, ir);
        if (!dispatcherOpts.dispatcher.enabled) {
          return {
            artifacts: [],
            diagnostics: [
              {
                severity: 'info',
                code: 'DISPATCHER_DISABLED',
                message: 'dispatcher.enabled is false — skipping nextjs.dispatcher emission.',
              },
            ],
          };
        }
        const dispatcherResult = this._dispatcher(ir, options);
        if (dispatcherResult.diagnostics.some((d) => d.severity === 'error')) {
          return { artifacts: [], diagnostics: dispatcherResult.diagnostics };
        }
        // Route the dispatcher pathHint through the contract so the emitted
        // file location and the client's dispatcher URL derive from one place.
        const dispatcherPathHint = buildRouteContract(dispatcherOpts).dispatcherRoutePathHint();
        return {
          artifacts: [
            {
              id: 'nextjs.dispatcher',
              pathHint: dispatcherPathHint,
              contentType: 'typescript',
              code: dispatcherResult.code,
            },
          ],
          diagnostics: dispatcherResult.diagnostics,
        };
      }

      case 'nextjs.subscribe': {
        if (!request.entity) {
          return {
            artifacts: [],
            diagnostics: [
              {
                severity: 'error',
                code: 'MISSING_ENTITY',
                message: 'surface "nextjs.subscribe" requires entity',
              },
            ],
          };
        }
        const subscribeOpts = normalizeOptions(options, ir);
        const subscribeResult = this._subscribe(ir, request.entity, options);
        if (
          subscribeResult.diagnostics.some((d) => d.severity === 'error') ||
          !subscribeResult.code
        ) {
          return { artifacts: [], diagnostics: subscribeResult.diagnostics };
        }
        return {
          artifacts: [
            {
              id: `nextjs.subscribe:${request.entity}`,
              pathHint: `${subscribeOpts.appDir}/${resolveRouteSegment(request.entity, subscribeOpts)}/subscribe/route.ts`,
              contentType: 'typescript',
              code: subscribeResult.code,
            },
          ],
          diagnostics: subscribeResult.diagnostics,
        };
      }

      case 'nextjs.subscriptionHook': {
        if (!request.entity) {
          return {
            artifacts: [],
            diagnostics: [
              {
                severity: 'error',
                code: 'MISSING_ENTITY',
                message: 'surface "nextjs.subscriptionHook" requires entity',
              },
            ],
          };
        }
        const opts = normalizeOptions(options, ir);
        const hookResult = this._subscriptionHook(ir, request.entity, opts);
        if (hookResult.diagnostics.some((d) => d.severity === 'error') || !hookResult.code) {
          return { artifacts: [], diagnostics: hookResult.diagnostics };
        }
        return {
          artifacts: [
            {
              id: `nextjs.subscriptionHook:${request.entity}`,
              pathHint: `${opts.paths.hooksDir}/use${request.entity}Subscription.ts`,
              contentType: 'typescript',
              code: hookResult.code,
            },
          ],
          diagnostics: hookResult.diagnostics,
        };
      }

      case 'nextjs.sharedRuntime': {
        const opts = normalizeOptions(options, ir);
        const sharedResult = this._sharedRuntime(ir, options);
        if (!sharedResult.code) {
          return { artifacts: [], diagnostics: sharedResult.diagnostics };
        }
        return {
          artifacts: [
            {
              id: 'nextjs.sharedRuntime',
              pathHint: opts.paths.sharedRuntimeFile,
              contentType: 'typescript',
              code: sharedResult.code,
            },
          ],
          diagnostics: sharedResult.diagnostics,
        };
      }

      case 'nextjs.schedule': {
        const scheduleOpts = normalizeOptions(options, ir);
        return generateScheduleCronRoutes(ir, {
          runtimeImportPath: scheduleOpts.runtimeImportPath,
          appDir: scheduleOpts.appDir,
        });
      }

      case 'nextjs.webhook': {
        const webhookOpts = normalizeOptions(options, ir);
        return generateWebhookRoutes(ir, {
          runtimeImportPath: webhookOpts.runtimeImportPath,
          appDir: webhookOpts.appDir,
        });
      }

      case 'nextjs.companions': {
        const companionOpts = normalizeOptions(options, ir);
        return this._companions(ir, companionOpts);
      }

      case 'ts.types': {
        const opts = normalizeOptions(options, ir);
        const result = this._types(ir, opts.dateSerialization === 'iso-string');
        return {
          artifacts: [
            {
              id: 'ts.types',
              pathHint: opts.paths.typesFile,
              contentType: 'typescript',
              code: result.code,
            },
          ],
          diagnostics: result.diagnostics,
        };
      }

      case 'ts.client': {
        const opts = normalizeOptions(options, ir);
        const result = this._client(ir, opts);
        return {
          artifacts: [
            {
              id: 'ts.client',
              pathHint: opts.paths.clientFile,
              contentType: 'typescript',
              code: result.code,
            },
          ],
          diagnostics: result.diagnostics,
        };
      }

      default:
        return {
          artifacts: [],
          diagnostics: [
            {
              severity: 'error',
              code: 'UNKNOWN_SURFACE',
              message: `Unknown surface: "${request.surface}"`,
            },
          ],
        };
    }
  }

  private _route(ir: IR, entityName: string, options?: NextJsProjectionOptions): CodeResult {
    const diagnostics: ProjectionDiagnostic[] = [];
    const opts = normalizeOptions(options, ir);

    // Find the entity in IR
    const entity = ir.entities.find((e) => e.name === entityName);
    if (!entity) {
      diagnostics.push({
        severity: 'error',
        code: 'ENTITY_NOT_FOUND',
        message: `Entity "${entityName}" not found in IR. Available entities: ${ir.entities.map((e) => e.name).join(', ')}`,
        entity: entityName,
      });
      return { code: '', diagnostics };
    }

    const code = this._generateGetRoute(entity, opts);
    return { code, diagnostics };
  }

  private _types(ir: IR, dateAsString = false): CodeResult {
    const lines: string[] = [];

    lines.push('// Auto-generated TypeScript types from Manifest IR');
    lines.push('// DO NOT EDIT - This file is generated from .manifest source');
    lines.push('');
    // Enum declarations (string-literal unions) precede entities that
    // reference them. Previously omitted → enum-typed properties referenced
    // undeclared names (compile error).
    for (const e of ir.enums ?? []) {
      lines.push(generateEnumType(e));
      lines.push('');
    }

    for (const entity of ir.entities) {
      lines.push(generateEntityTypes(entity, dateAsString));
    }

    return { code: lines.join('\n'), diagnostics: [] };
  }

  /**
   * Generate the plain-TypeScript client SDK: typed list/detail read callers and
   * typed command callers. Every URL comes from the shared route contract (so it
   * tracks appDir/routeSegments/routeCasing and can never desync from the emitted
   * routes) and every envelope key comes from the same helper the server routes
   * use. Command callers POST the canonical dispatcher at its RAW entity/command
   * path and return the dispatcher's response envelope.
   */
  private _client(ir: IR, options: NormalizedNextJsOptions): CodeResult {
    const contract = buildRouteContract(options);
    const adapter = options.clientFetchAdapter;
    const dateAsString = options.dateSerialization === 'iso-string';
    // Commands are entity-scoped in the dispatcher; skip any orphan commands.
    const commands = ir.commands.filter((c) => c.entity);

    const lines: string[] = [];

    lines.push('// Auto-generated client SDK from Manifest IR');
    lines.push('// DO NOT EDIT - This file is generated from .manifest source');
    lines.push('');
    if (ir.entities.length > 0) {
      lines.push(
        `import type { ${ir.entities.map((entity) => entity.name).join(', ')} } from '${relativeArtifactImport(options.paths.clientFile, options.paths.typesFile)}';`,
      );
      lines.push('');
    }

    // Optional host-provided fetch adapter (auth/credentials). Aliased to
    // apiFetch so read + command call sites are identical to the inline path.
    if (adapter) {
      const binding =
        adapter.importName === 'apiFetch' ? 'apiFetch' : `${adapter.importName} as apiFetch`;
      lines.push(`import { ${binding} } from ${JSON.stringify(adapter.importPath)};`);
      lines.push('');
    }

    // Command response envelope — the exact success body the dispatcher returns
    // ({ data, events, diagnostics }); on failure apiFetch throws. Emitted only
    // when the IR has commands.
    if (commands.length > 0) {
      lines.push('/** The command response body returned by the Manifest dispatcher. */');
      lines.push('export interface ManifestCommandResponse<T = unknown> {');
      lines.push('  data?: T;');
      lines.push('  events?: unknown[];');
      lines.push(
        '  diagnostics?: Array<{ kind?: string; code?: string; message?: string; [key: string]: unknown }>;',
      );
      lines.push('  error?: string;');
      lines.push('}');
      lines.push('');
    }

    // Inline default fetch helper (throws on non-2xx, surfacing the Manifest
    // error envelope's `error` field). Skipped when a fetchAdapter is imported.
    if (!adapter) {
      lines.push('async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {');
      lines.push('  const response = await fetch(url, init);');
      lines.push('  if (!response.ok) {');
      lines.push(
        '    const body = await response.json().catch(() => ({} as { error?: string; message?: string }));',
      );
      lines.push(
        '    throw new Error(body.error || body.message || `Request failed: ${response.status}`);',
      );
      lines.push('  }');
      lines.push('  return response.json();');
      lines.push('}');
      lines.push('');
    }

    for (const entity of ir.entities) {
      const listKey = contract.listEnvelopeKey(entity.name);
      const detailKey = contract.detailEnvelopeKey(entity.name);

      // List (findMany) function
      lines.push(`export async function get${entity.name}s(): Promise<${entity.name}[]> {`);
      lines.push(
        `  const data = await apiFetch<{ ${listKey}: ${entity.name}[] }>(\`${contract.listPath(entity.name)}\`);`,
      );
      lines.push(`  return data.${listKey};`);
      lines.push('}');
      lines.push('');

      // Detail (findUnique) function
      lines.push(`export async function get${entity.name}(id: string): Promise<${entity.name}> {`);
      lines.push(
        `  const data = await apiFetch<{ ${detailKey}: ${entity.name} }>(\`${contract.entityBasePath(entity.name)}/\${encodeURIComponent(id)}\`);`,
      );
      lines.push(`  return data.${detailKey};`);
      lines.push('}');
      lines.push('');
    }

    // Command callers — POST the canonical dispatcher. The request body carries
    // the command params plus an optional instanceId (the dispatcher reads
    // body.instanceId / body.id to address non-create commands).
    for (const command of commands) {
      const entityName = command.entity as string;
      const fnName = `${toLowerCamelCase(entityName)}${capitalizeFirst(command.name)}`;
      const hasParams = command.parameters.length > 0;
      const inputType = hasParams
        ? `{ ${command.parameters
            .map(
              (p) => `${p.name}${p.required ? '' : '?'}: ${irTypeToTsType(p.type, dateAsString)}`,
            )
            .join('; ')} }`
        : 'Record<string, never>';
      const returnType = command.returns
        ? irTypeToTsType(command.returns, dateAsString)
        : 'unknown';
      const url = contract.dispatcherInvocationPath(entityName, command.name);

      lines.push(`export async function ${fnName}(`);
      lines.push(`  input${hasParams ? '' : '?'}: ${inputType},`);
      lines.push('  options?: { instanceId?: string },');
      lines.push(`): Promise<ManifestCommandResponse<${returnType}>> {`);
      lines.push(`  return apiFetch<ManifestCommandResponse<${returnType}>>(\`${url}\`, {`);
      lines.push(`    method: "POST",`);
      lines.push(`    headers: { "Content-Type": "application/json" },`);
      lines.push('    body: JSON.stringify({ ...input, instanceId: options?.instanceId }),');
      lines.push('  });');
      lines.push('}');
      lines.push('');
    }

    return { code: lines.join('\n'), diagnostics: [] };
  }

  private _command(
    ir: IR,
    entityName: string,
    commandName: string,
    options?: NextJsProjectionOptions,
  ): CodeResult {
    const diagnostics: ProjectionDiagnostic[] = [];
    const opts = normalizeOptions(options, ir);

    const entity = ir.entities.find((e) => e.name === entityName);
    if (!entity) {
      diagnostics.push({
        severity: 'error',
        code: 'ENTITY_NOT_FOUND',
        message: `Entity "${entityName}" not found in IR. Available entities: ${ir.entities.map((e) => e.name).join(', ')}`,
        entity: entityName,
      });
      return { code: '', diagnostics };
    }

    const entityCommands = ir.commands.filter((c) => c.entity === entityName);
    const command = entityCommands.find((c) => c.name === commandName);
    if (!command) {
      diagnostics.push({
        severity: 'error',
        code: 'COMMAND_NOT_FOUND',
        message: `Command "${commandName}" not found on entity "${entityName}". Available commands: ${entityCommands.map((c) => c.name).join(', ')}`,
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
    useSharedRuntime: boolean,
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
    lines.push(
      generateImport(
        '{ manifestErrorResponse, manifestSuccessResponse, normalizeCommandResult }',
        responseImportPath,
      ),
    );
    if (useExternalExecutor) {
      lines.push(
        generateImport(`{ ${dispatcher.executorImportName} }`, dispatcher.executorImportPath),
      );
    } else if (useShared) {
      lines.push(generateImport('{ getSharedRuntime }', options.sharedRuntimeImportPath));
    } else {
      lines.push(generateImport('{ createManifestRuntime }', runtimeImportPath));
    }
    if (options.includeTenantFilter) {
      if (options.tenantProvider) {
        lines.push(
          generateImport(
            `{ ${options.tenantProvider.functionName} }`,
            options.tenantProvider.importPath,
          ),
        );
      } else {
        lines.push(generateImport('{ database }', options.databaseImportPath));
      }
    }
    const authImport = generateAuthImport(options);
    if (authImport) {
      lines.push(authImport);
    }
    lines.push('');
    lines.push('export async function POST(request: NextRequest) {');
    lines.push('  try {');
    lines.push(generateAuthBody(options));
    const tenantLookup = generateTenantLookup(options);
    if (tenantLookup) {
      lines.push(tenantLookup);
    }
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
    lines.push(
      `    const normalized = normalizeCommandResult("${entity.name}", "${command.name}", result);`,
    );
    lines.push('');
    lines.push('    if (!normalized.success) {');
    lines.push('      // Determine HTTP status based on diagnostic kind');
    lines.push('      const firstDiagnostic = normalized.diagnostics?.[0];');
    lines.push('      const status = firstDiagnostic?.kind === "policy_denial" ? 403');
    lines.push('        : firstDiagnostic?.kind === "guard_failure" ? 422');
    lines.push('        : firstDiagnostic?.kind === "constraint_block" ? 422');
    lines.push('        : 400;');
    lines.push(
      '      return manifestErrorResponse({ error: normalized.error ?? "Command failed", diagnostics: normalized.diagnostics ?? [] }, status);',
    );
    lines.push('    }');
    lines.push('');
    lines.push(
      '    return manifestSuccessResponse({ data: normalized.data, events: normalized.events, diagnostics: normalized.diagnostics });',
    );
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
  private _dispatcher(ir: IR, options?: NextJsProjectionOptions): CodeResult {
    const opts = normalizeOptions(options, ir);
    const code = this._generateDispatcherHandler(opts, hasRealtimeEntities(ir));
    return { code, diagnostics: [] };
  }

  private _generateDispatcherHandler(
    options: NormalizedNextJsOptions,
    useSharedRuntime: boolean,
  ): string {
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
      lines.push(
        `// executionMode = "externalExecutor": delegates to ${dispatcher.executorImportName}`,
      );
      lines.push(`// imported from "${dispatcher.executorImportPath}". The dispatcher does NOT`);
      lines.push('// construct a Manifest runtime — the executor owns that.');
    }
    lines.push('');
    lines.push('import type { NextRequest } from "next/server";');
    lines.push(
      generateImport(
        '{ manifestErrorResponse, manifestSuccessResponse, normalizeCommandResult }',
        responseImportPath,
      ),
    );
    if (useExternalExecutor) {
      lines.push(
        generateImport(`{ ${dispatcher.executorImportName} }`, dispatcher.executorImportPath),
      );
    } else if (useShared) {
      lines.push(generateImport('{ getSharedRuntime }', options.sharedRuntimeImportPath));
    } else {
      lines.push(generateImport('{ createManifestRuntime }', runtimeImportPath));
    }
    if (options.includeTenantFilter) {
      if (options.tenantProvider) {
        lines.push(
          generateImport(
            `{ ${options.tenantProvider.functionName} }`,
            options.tenantProvider.importPath,
          ),
        );
      } else {
        lines.push(generateImport('{ database }', options.databaseImportPath));
      }
    }
    const authImport = generateAuthImport(options);
    if (authImport) {
      lines.push(authImport);
    }
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
    if (tenantLookup) {
      lines.push(tenantLookup);
    }
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
    lines.push(
      '      return manifestErrorResponse({ error: normalized.error ?? "Command failed", diagnostics: normalized.diagnostics ?? [] }, status);',
    );
    lines.push('    }');
    lines.push('');
    lines.push(
      '    return manifestSuccessResponse({ data: normalized.data, events: normalized.events, diagnostics: normalized.diagnostics });',
    );
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
  private _subscribe(ir: IR, entityName: string, options?: NextJsProjectionOptions): CodeResult {
    const diagnostics: ProjectionDiagnostic[] = [];
    const opts = normalizeOptions(options, ir);

    const entity = ir.entities.find((e) => e.name === entityName);
    if (!entity) {
      diagnostics.push({
        severity: 'error',
        code: 'ENTITY_NOT_FOUND',
        message: `Entity "${entityName}" not found in IR. Available entities: ${ir.entities.map((e) => e.name).join(', ')}`,
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
    if (authImport) {
      lines.push(authImport);
    }
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
    lines.push(
      '          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\\n\\n`));',
    );
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
  private _subscriptionHook(
    ir: IR,
    entityName: string,
    options: NormalizedNextJsOptions,
  ): CodeResult {
    const diagnostics: ProjectionDiagnostic[] = [];

    const entity = ir.entities.find((e) => e.name === entityName);
    if (!entity) {
      diagnostics.push({
        severity: 'error',
        code: 'ENTITY_NOT_FOUND',
        message: `Entity "${entityName}" not found in IR. Available entities: ${ir.entities.map((e) => e.name).join(', ')}`,
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

    const opts = normalizeOptions(options, ir);
    // When no eventBus is configured on the runtime, the singleton either fails
    // loud (requireEventBus) or warns once and continues single-instance. The
    // positive path (bus present → connectEventBus) is identical either way.
    const noBusBranch = opts.realtime.requireEventBus
      ? `    throw new Error(
      "Manifest realtime: realtime.requireEventBus is enabled but no eventBus is configured on the runtime. " +
        "Configure an eventBus in RuntimeOptions (createManifestRuntime) to enable multi-instance SSE delivery, " +
        "or unset realtime.requireEventBus.",
    );`
      : `    console.warn(
      "Manifest realtime: no eventBus configured; SSE delivery is single-instance only " +
        "(events from other instances/processes will not reach this stream)",
    );`;
    const requireNote = opts.realtime.requireEventBus
      ? `//
// realtime.requireEventBus is ON: this singleton THROWS at init when no bus is
// present, so a deployment that advertises multi-instance realtime fails loud
// at startup instead of silently degrading to single-instance delivery.
`
      : '';
    const code = `// Auto-generated shared Manifest runtime accessor.
// Generated from Manifest IR - DO NOT EDIT
//
// Realtime SSE requires command execution and subscriptions to observe the
// SAME engine instance: the event stream is per-engine and in-memory. This
// module memoizes ONE runtime per server process.
//
// Multi-instance / serverless fan-out: configure an \`eventBus\` in the runtime
// factory's RuntimeOptions (createManifestRuntime). When one is present this
// accessor calls \`runtime.connectEventBus()\` ONCE at init, subscribing this
// process to remote events so they reach local SSE subscribers. Without a bus,
// delivery is single-instance only (this process's own events).
${requireNote}// See docs/spec/semantics.md § "Realtime Entities".

import { createManifestRuntime } from "${opts.runtimeImportPath}";


type SharedRuntime = Awaited<ReturnType<typeof createManifestRuntime>>;

let sharedRuntimePromise: Promise<SharedRuntime> | null = null;

/**
 * Build the singleton runtime and, if an eventBus is configured, subscribe
 * this process to it so events from other instances reach local SSE streams.
 */
async function initSharedRuntime(): Promise<SharedRuntime> {
  const runtime = await createManifestRuntime({});
  if (runtime.hasEventBus()) {
    // Subscribe once, at init — the SSE route streams from this same engine.
    await runtime.connectEventBus();
  } else {
${noBusBranch}
  }
  return runtime;
}

/**
 * Returns the module-scoped singleton runtime. Request handlers MUST set
 * per-request context via runtime.replaceContext() before runCommand.
 */
export function getSharedRuntime(): Promise<SharedRuntime> {
  if (!sharedRuntimePromise) {
    sharedRuntimePromise = initSharedRuntime();
  }
  return sharedRuntimePromise;
}
`;
    return { code, diagnostics };
  }

  /**
   * Generate the companion modules that generated route/dispatcher code
   * imports but no other surface writes: the runtime factory, the HTTP
   * envelope helpers, the Prisma client, an auth stub, and a tenant lookup.
   * Each lands at the pathHint derived from its CONFIGURED import path — so a
   * custom `responseImportPath: '@/shared/rsp'` places the module at
   * 'shared/rsp.ts'. A companion whose import path is a package specifier is
   * skipped (never emitted at a colliding wrong path) — that module is the
   * user's. When `emitCompanions` is false, nothing is emitted.
   */
  private _companions(ir: IR, options: NormalizedNextJsOptions): ProjectionResult {
    const diagnostics: ProjectionDiagnostic[] = [];
    const artifacts: ProjectionResult['artifacts'] = [];

    if (!options.emitCompanions) {
      diagnostics.push({
        severity: 'info',
        code: 'COMPANIONS_DISABLED',
        message:
          'emitCompanions is false — no companion modules emitted (hand-written workflow preserved).',
      });
      return { artifacts, diagnostics };
    }

    // Resolve a configured import specifier to its emission pathHint and push
    // the built module. Skip (with an info diagnostic) when the specifier is a
    // package the user owns rather than a local alias.
    const emit = (
      id: string,
      importSpecifier: string,
      build: () => string,
      label: string,
    ): void => {
      const pathHint = resolveLocalImportPathHint(importSpecifier, {
        framework: 'nextjs',
      });
      if (!pathHint) {
        diagnostics.push({
          severity: 'info',
          code: 'COMPANION_SKIPPED_PACKAGE_PATH',
          message: `Skipping ${label} companion — "${importSpecifier}" is a package specifier, not a local module. That module is yours to provide.`,
        });
        return;
      }
      artifacts.push({
        id,
        pathHint,
        contentType: 'typescript',
        code: build(),
      });
    };

    // 1. Runtime factory — always. Inline command/dispatcher routes, the
    //    shared-runtime accessor, and the schedule surface all import it.
    emit(
      'nextjs.companions.runtime',
      options.runtimeImportPath,
      () =>
        generateRuntimeFactoryModule({
          ir,
          ...options.runtimeFanIn,
          runtimeConfigImport:
            options.runtimeConfigImport ?? options.runtimeFanIn.runtimeConfigImport,
        }),
      'runtime factory',
    );

    // 2. HTTP envelope helpers — always. Every route and the dispatcher import
    //    manifestSuccessResponse / manifestErrorResponse / normalizeCommandResult.
    emit(
      'nextjs.companions.response',
      options.responseImportPath,
      () => this._companionResponseModule(),
      'response helpers',
    );

    // 3. Database client — when read routes are emitted (they import
    //    { database }) or the tenant companion needs it for the lookup.
    if (options.readRoutes.enabled || options.includeTenantFilter) {
      emit(
        'nextjs.companions.database',
        options.databaseImportPath,
        () => this._companionDatabaseModule(),
        'database client',
      );
    }

    // 4. Auth stub — only when the auth import resolves to a LOCAL module.
    //    The 'custom' provider (getUser from '@/lib/auth') always does; clerk
    //    and next-auth default to package imports and get skipped by `emit`.
    const authSpec = this._authCompanionSpec(options);
    if (authSpec) {
      emit(
        'nextjs.companions.auth',
        authSpec.importSpecifier,
        () => this._companionAuthStub(authSpec.kind),
        'auth',
      );
    }

    // 5. Tenant lookup helper — only when tenant filtering is on. normalizeOptions
    //    always sets tenantProvider (DEFAULT_TENANT_PROVIDER), so this emits the
    //    module the generated tenant lookup call imports.
    if (options.includeTenantFilter && options.tenantProvider) {
      emit(
        'nextjs.companions.tenant',
        options.tenantProvider.importPath,
        () => this._companionTenantModule(options),
        'tenant lookup',
      );
    }

    return { artifacts, diagnostics };
  }

  /**
   * Resolve which auth symbol/import the generated routes expect and whether it
   * points at a local module worth stubbing. Mirrors `generateAuthImport`:
   * clerk/next-auth default to package imports (returned here, but skipped
   * downstream because their path is a package); 'custom' points at an app
   * module; 'none' imports nothing.
   */
  private _authCompanionSpec(options: NormalizedNextJsOptions): {
    importSpecifier: string;
    kind: 'getUser' | 'getServerSession' | 'clerkAuth';
  } | null {
    switch (options.authProvider) {
      case 'custom':
        return { importSpecifier: options.authImportPath, kind: 'getUser' };
      case 'nextauth':
        return {
          importSpecifier:
            options.authImportPath === '@/lib/auth' ? 'next-auth' : options.authImportPath,
          kind: 'getServerSession',
        };
      case 'clerk':
        return {
          importSpecifier:
            options.authImportPath === '@/lib/auth' ? '@clerk/nextjs' : options.authImportPath,
          kind: 'clerkAuth',
        };
      case 'none':
      default:
        return null;
    }
  }

  /** Canonical HTTP envelope module (next/server NextResponse). */
  private _companionResponseModule(): string {
    const lines: string[] = [];
    lines.push('// Auto-generated Manifest HTTP envelope helpers for Next.js.');
    lines.push('// DO NOT EDIT — generated by the Next.js projection (companions surface).');
    lines.push('//');
    lines.push('// The response contract shared by generated routes, the dispatcher, and');
    lines.push('// downstream clients: success/error envelopes + normalizeCommandResult over');
    lines.push('// a RuntimeEngine command result.');
    lines.push('');
    lines.push('import { NextResponse } from "next/server";');
    lines.push('');
    lines.push('export interface ManifestDiagnostic {');
    lines.push('  kind?: string;');
    lines.push('  code?: string;');
    lines.push('  message?: string;');
    lines.push('  [key: string]: unknown;');
    lines.push('}');
    lines.push('');
    lines.push('export interface ManifestCommandResult<T = unknown> {');
    lines.push('  success: boolean;');
    lines.push('  data?: T;');
    lines.push('  error?: string;');
    lines.push('  events?: unknown[];');
    lines.push('  diagnostics?: ManifestDiagnostic[];');
    lines.push('}');
    lines.push('');
    lines.push('/** JSON success envelope. The body object is serialized as-is. */');
    lines.push('export function manifestSuccessResponse(body: unknown, init?: ResponseInit) {');
    lines.push('  return NextResponse.json(body, init);');
    lines.push('}');
    lines.push('');
    lines.push(
      '/** JSON error envelope. Accepts a bare message or a { error, diagnostics } body. */',
    );
    lines.push('export function manifestErrorResponse(');
    lines.push('  error: string | { error: string; diagnostics: ManifestDiagnostic[] },');
    lines.push('  status: number,');
    lines.push('  init?: ResponseInit,');
    lines.push(') {');
    lines.push('  const body = typeof error === "string" ? { error, diagnostics: [] } : error;');
    lines.push('  return NextResponse.json(body, { ...init, status });');
    lines.push('}');
    lines.push('');
    lines.push('/**');
    lines.push(' * Normalize a RuntimeEngine command result into the stable envelope shape.');
    lines.push(' * entityName/commandName are accepted for call-site symmetry (and future');
    lines.push(' * logging); the current implementation does not branch on them.');
    lines.push(' */');
    lines.push('export function normalizeCommandResult<T = unknown>(');
    lines.push('  entityName: string,');
    lines.push('  commandName: string,');
    lines.push('  result: unknown,');
    lines.push('): ManifestCommandResult<T> {');
    lines.push('  void entityName;');
    lines.push('  void commandName;');
    lines.push(
      '  const r = (result ?? {}) as Partial<ManifestCommandResult<T>> & { error?: string };',
    );
    lines.push('  if (typeof r.success === "boolean") {');
    lines.push('    return {');
    lines.push('      success: r.success,');
    lines.push('      data: r.data,');
    lines.push('      error: r.error,');
    lines.push('      events: r.events ?? [],');
    lines.push('      diagnostics: r.diagnostics ?? [],');
    lines.push('    };');
    lines.push('  }');
    lines.push('  return {');
    lines.push('    success: !r.error,');
    lines.push('    data: r.data,');
    lines.push('    error: r.error,');
    lines.push('    events: r.events ?? [],');
    lines.push('    diagnostics: r.diagnostics ?? [],');
    lines.push('  };');
    lines.push('}');
    lines.push('');
    return lines.join('\n');
  }

  /** Prisma client singleton (standard globalThis dev-reuse pattern). */
  private _companionDatabaseModule(): string {
    const lines: string[] = [];
    lines.push('// Auto-generated Prisma client singleton for Next.js.');
    lines.push('// DO NOT EDIT — generated by the Next.js projection (companions surface).');
    lines.push('//');
    lines.push('// globalThis reuse so dev hot-reload does not exhaust DB connections.');
    lines.push('');
    lines.push('import { PrismaClient } from "@prisma/client";');
    lines.push('');
    lines.push('const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };');
    lines.push('');
    lines.push('export const database = globalForPrisma.prisma ?? new PrismaClient();');
    lines.push('');
    lines.push('if (process.env.NODE_ENV !== "production") {');
    lines.push('  globalForPrisma.prisma = database;');
    lines.push('}');
    lines.push('');
    return lines.join('\n');
  }

  /**
   * Fail-closed auth stub. Compiles (correct types so routes type-check) but
   * throws at runtime with a "wire your auth provider" message so unfinished
   * auth never silently allows access.
   */
  private _companionAuthStub(kind: 'getUser' | 'getServerSession' | 'clerkAuth'): string {
    const lines: string[] = [];
    lines.push('// Auto-generated Manifest auth companion (fail-closed stub).');
    lines.push('// Replace the body: resolve the caller from the request/session and return');
    lines.push('// the identity. Until then this throws so unauthenticated access cannot');
    lines.push('// silently succeed.');
    lines.push('');
    if (kind === 'getUser') {
      lines.push('import type { NextRequest } from "next/server";');
      lines.push('');
      lines.push(
        'export async function getUser(_request: NextRequest): Promise<{ id: string } | null> {',
      );
      lines.push('  throw new Error(');
      lines.push(
        '    "Manifest auth companion stub: implement getUser() to resolve the authenticated user from the request. Return { id } or null.",',
      );
      lines.push('  );');
      lines.push('}');
    } else if (kind === 'getServerSession') {
      lines.push(
        'export async function getServerSession(): Promise<{ user: { id: string } } | null> {',
      );
      lines.push('  throw new Error(');
      lines.push(
        '    "Manifest auth companion stub: implement getServerSession() to resolve the session. Return { user: { id } } or null.",',
      );
      lines.push('  );');
      lines.push('}');
    } else {
      lines.push(
        'export async function auth(): Promise<{ userId: string | null; orgId: string | null }> {',
      );
      lines.push('  throw new Error(');
      lines.push(
        '    "Manifest auth companion stub: implement auth() to resolve { userId, orgId } from the request.",',
      );
      lines.push('  );');
      lines.push('}');
    }
    lines.push('');
    return lines.join('\n');
  }

  /**
   * Tenant lookup helper. Implements the `userTenantMapping` lookup the
   * generated tenant filtering assumes, via the database companion, and throws
   * a clear error when that delegate is absent so the assumption is explicit.
   */
  private _companionTenantModule(options: NormalizedNextJsOptions): string {
    const provider = options.tenantProvider!;
    const fn = provider.functionName;
    const key = provider.lookupKey;
    const lines: string[] = [];
    lines.push('// Auto-generated Manifest tenant lookup companion for Next.js.');
    lines.push('// DO NOT EDIT — generated by the Next.js projection (companions surface).');
    lines.push('//');
    lines.push(`// Maps ${key} → tenantId via database.userTenantMapping. Replace the body if`);
    lines.push('// your schema resolves tenants differently.');
    lines.push('');
    lines.push(generateImport('{ database }', options.databaseImportPath));
    lines.push('');
    lines.push(`export async function ${fn}(${key}: string): Promise<string | null> {`);
    lines.push('  const delegate = (database as unknown as {');
    lines.push(
      `    userTenantMapping?: { findUnique(args: { where: { ${key}: string } }): Promise<{ tenantId: string } | null> };`,
    );
    lines.push('  }).userTenantMapping;');
    lines.push('  if (!delegate?.findUnique) {');
    lines.push('    throw new Error(');
    lines.push(
      `      "Manifest tenant companion: 'database.userTenantMapping' is unavailable. Implement ${fn} to map ${key} to a tenantId for your schema.",`,
    );
    lines.push('    );');
    lines.push('  }');
    lines.push(`  const mapping = await delegate.findUnique({ where: { ${key} } });`);
    lines.push('  return mapping?.tenantId ?? null;');
    lines.push('}');
    lines.push('');
    return lines.join('\n');
  }

  /**
   * Generate detail (getById) route handler for an entity.
   * Uses direct Prisma findUnique (bypassing runtime) for efficiency.
   */
  private _detail(ir: IR, entityName: string, options?: NextJsProjectionOptions): CodeResult {
    const diagnostics: ProjectionDiagnostic[] = [];
    const opts = normalizeOptions(options, ir);

    const entity = ir.entities.find((e) => e.name === entityName);
    if (!entity) {
      diagnostics.push({
        severity: 'error',
        code: 'ENTITY_NOT_FOUND',
        message: `Entity "${entityName}" not found in IR. Available entities: ${ir.entities.map((e) => e.name).join(', ')}`,
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
    const variableName = listEnvelopeKey(entity.name);

    const lines: string[] = [];

    // Add comment explaining the design decision
    lines.push(`// Auto-generated Next.js API route for ${entity.name}`);
    lines.push('// Generated from Manifest IR - DO NOT EDIT');
    lines.push('');
    lines.push('import type { NextRequest } from "next/server";');
    // The tenant provider is only called when tenant filtering is on
    // (generateTenantLookup gates on includeTenantFilter). Importing it
    // otherwise leaves an unused — and, since the tenant companion is only
    // emitted when filtering is on, dangling — import in the generated route.
    if (options.includeTenantFilter && options.tenantProvider) {
      lines.push(
        generateImport(
          `{ ${options.tenantProvider.functionName} }`,
          options.tenantProvider.importPath,
        ),
      );
    }
    lines.push(generateImport('{ database }', databaseImportPath));
    lines.push(
      generateImport('{ manifestErrorResponse, manifestSuccessResponse }', responseImportPath),
    );
    const authImport = generateAuthImport(options);
    if (authImport) {
      lines.push(authImport);
    }
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
      lines.push('    // readRoutes.directDbReads = false: emit no inline Prisma call.');
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
    const delegateName = detailEnvelopeKey(entity.name);
    const accessorName = resolveDbAccessor(entity.name, options);

    const lines: string[] = [];

    lines.push(`// Auto-generated Next.js API detail route for ${entity.name}`);
    lines.push('// Generated from Manifest IR - DO NOT EDIT');
    lines.push('');
    lines.push('import type { NextRequest } from "next/server";');
    // The tenant provider is only called when tenant filtering is on
    // (generateTenantLookup gates on includeTenantFilter). Importing it
    // otherwise leaves an unused — and, since the tenant companion is only
    // emitted when filtering is on, dangling — import in the generated route.
    if (options.includeTenantFilter && options.tenantProvider) {
      lines.push(
        generateImport(
          `{ ${options.tenantProvider.functionName} }`,
          options.tenantProvider.importPath,
        ),
      );
    }
    lines.push(generateImport('{ database }', databaseImportPath));
    lines.push(
      generateImport('{ manifestErrorResponse, manifestSuccessResponse }', responseImportPath),
    );
    const authImport = generateAuthImport(options);
    if (authImport) {
      lines.push(authImport);
    }
    lines.push('');
    lines.push('export async function GET(');
    // Underscore-prefixed: no detail-route body variant consumes the request,
    // and consumers with noUnusedParameters flagged the dead param (TS6133)
    // in every emitted file. The prefix is TypeScript's unused-param opt-out.
    lines.push('  _request: NextRequest,');
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
      : 'where: { id },';

    if (options.readRoutes.directDbReads) {
      lines.push(
        `    // Using ${prismaMethod} — ${isMultiField ? 'multi-field filter (tenant/soft-delete) requires findFirst on Prisma 7+' : 'single id is a unique constraint'}.`,
      );
      lines.push(`    const ${delegateName} = await database.${accessorName}.${prismaMethod}({`);
      lines.push(`      ${whereClause}`);
      lines.push('    });');
    } else {
      lines.push('    // readRoutes.directDbReads = false: emit no inline Prisma call.');
      lines.push(`    // Wire your read source here and assign to \`${delegateName}\`.`);
      lines.push(`    const ${delegateName}: unknown = null;`);
    }
    lines.push('');
    lines.push(`    if (!${delegateName}) {`);
    lines.push(
      `      return manifestErrorResponse({ error: "${entity.name} not found", diagnostics: [] }, 404);`,
    );
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
