/**
 * SvelteKit projection for Manifest IR.
 *
 * Generates SvelteKit server routes (+server.ts) and load functions
 * (+page.server.ts) from IR commands and entity reads. Mirrors the
 * Next.js App Router projection but targets SvelteKit conventions:
 *
 *   - +server.ts            → API route (GET/POST) emitting `RequestHandler`s
 *   - +page.server.ts       → `PageServerLoad` for SSR data and form `actions`
 *   - $lib/* aliases        → `src/lib` imports
 *   - type-safe `PageData`  → via the generated `./$types` module
 *
 * Surfaces:
 *   - sveltekit.server  → +server.ts for an entity (GET list/detail, POST dispatch)
 *   - sveltekit.load    → +page.server.ts (`load` + `actions`) for an entity page
 *   - sveltekit.command → +server.ts dedicated to a single command POST
 *   - sveltekit.types   → TypeScript types for entities, commands, results
 *   - sveltekit.client  → $lib client utilities (response helpers, fetch wrappers)
 *
 * Writes always flow through the Manifest runtime so guards, policies,
 * and constraints stay authoritative. Reads MAY bypass the runtime for
 * performance (Prisma-style direct queries) when a database client is
 * configured.
 *
 * Registers as the `sveltekit` projection in the canonical registry.
 */

import type { IR, IREntity, IRCommand, IRType, IRPolicy, IRExpression, IRValue } from '../../ir';
import type {
  ProjectionTarget,
  ProjectionRequest,
  ProjectionResult,
  ProjectionDiagnostic,
} from '../interface';
import type { SvelteKitProjectionOptions } from './types';
import { resolveLocalImportPathHint, generateRuntimeFactoryModule } from '../shared/companions.js';
import { SVELTEKIT_DESCRIPTOR_META } from './descriptor-meta.js';

// ============================================================================
// Surface constants
// ============================================================================

const SURFACE_SERVER = 'sveltekit.server' as const;
const SURFACE_LOAD = 'sveltekit.load' as const;
const SURFACE_COMMAND = 'sveltekit.command' as const;
const SURFACE_TYPES = 'sveltekit.types' as const;
const SURFACE_CLIENT = 'sveltekit.client' as const;
const SURFACE_COMPANIONS = 'sveltekit.companions' as const;

const SURFACES = [
  SURFACE_SERVER,
  SURFACE_LOAD,
  SURFACE_COMMAND,
  SURFACE_TYPES,
  SURFACE_CLIENT,
  SURFACE_COMPANIONS,
] as const;

// ============================================================================
// Normalized options
// ============================================================================

interface NormalizedOptions {
  authProvider: 'lucia' | 'auth-js' | 'custom' | 'none';
  authImportPath: string;
  runtimeImportPath: string;
  runtimeFactoryName: string;
  databaseImportPath: string;
  validationImportPath: string | undefined;
  routesDir: string;
  includeTenantFilter: boolean;
  includeSoftDeleteFilter: boolean;
  tenantIdProperty: string;
  deletedAtProperty: string;
  strictMode: boolean;
  includeComments: boolean;
  unauthorizedStatus: number;
  tenantProvider?: {
    importPath: string;
    functionName: string;
    lookupKey: 'orgId' | 'userId';
  };
  emitFormActions: boolean;
  emitTypeImports: boolean;
  emitCompanions: boolean;
}

/**
 * Default values for the SvelteKit projection.
 */
export const SVELTEKIT_DEFAULTS = {
  authProvider: 'lucia' as const,
  authImportPath: '$lib/server/auth',
  runtimeImportPath: '$lib/server/manifest-runtime',
  runtimeFactoryName: 'createManifestRuntime',
  databaseImportPath: '$lib/server/database',
  routesDir: 'src/routes',
  includeTenantFilter: true,
  includeSoftDeleteFilter: true,
  tenantIdProperty: 'tenantId',
  deletedAtProperty: 'deletedAt',
  strictMode: true,
  includeComments: true,
  unauthorizedStatus: 401,
  emitFormActions: true,
  emitTypeImports: true,
  emitCompanions: true,
};

/**
 * When `ir.tenant` is declared and options omit tenant fields, filtering stays
 * on (historical SvelteKit default) and the property name follows the IR.
 * Explicit options always win.
 */
function normalizeOptions(opts: SvelteKitProjectionOptions = {}, ir?: IR): NormalizedOptions {
  return {
    authProvider: opts.authProvider ?? SVELTEKIT_DEFAULTS.authProvider,
    authImportPath: opts.authImportPath ?? SVELTEKIT_DEFAULTS.authImportPath,
    runtimeImportPath: opts.runtimeImportPath ?? SVELTEKIT_DEFAULTS.runtimeImportPath,
    runtimeFactoryName: opts.runtimeFactoryName ?? SVELTEKIT_DEFAULTS.runtimeFactoryName,
    databaseImportPath: opts.databaseImportPath ?? SVELTEKIT_DEFAULTS.databaseImportPath,
    validationImportPath: opts.validationImportPath,
    routesDir: opts.routesDir ?? SVELTEKIT_DEFAULTS.routesDir,
    includeTenantFilter:
      opts.includeTenantFilter ??
      (ir?.tenant ? true : SVELTEKIT_DEFAULTS.includeTenantFilter),
    includeSoftDeleteFilter:
      opts.includeSoftDeleteFilter ?? SVELTEKIT_DEFAULTS.includeSoftDeleteFilter,
    tenantIdProperty:
      opts.tenantIdProperty ?? ir?.tenant?.property ?? SVELTEKIT_DEFAULTS.tenantIdProperty,
    deletedAtProperty: opts.deletedAtProperty ?? SVELTEKIT_DEFAULTS.deletedAtProperty,
    strictMode: opts.strictMode ?? SVELTEKIT_DEFAULTS.strictMode,
    includeComments: opts.includeComments ?? SVELTEKIT_DEFAULTS.includeComments,
    unauthorizedStatus: opts.unauthorizedStatus ?? SVELTEKIT_DEFAULTS.unauthorizedStatus,
    tenantProvider: opts.tenantProvider,
    emitFormActions: opts.emitFormActions ?? SVELTEKIT_DEFAULTS.emitFormActions,
    emitTypeImports: opts.emitTypeImports ?? SVELTEKIT_DEFAULTS.emitTypeImports,
    emitCompanions: opts.emitCompanions ?? SVELTEKIT_DEFAULTS.emitCompanions,
  };
}

// ============================================================================
// Naming helpers
// ============================================================================

function toPascalCase(value: string): string {
  if (!value) return value;
  return value[0].toUpperCase() + value.slice(1);
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

function toRouteSegment(value: string): string {
  return toKebabCase(value);
}

// ============================================================================
// Type mapping: IR type → TypeScript
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
    void: 'void',
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
// Expression / value pretty-printer (for header comments only)
// ============================================================================

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
      return `{${expr.properties
        .map(
          (p: { key: string; value: IRExpression }) => `${p.key}: ${expressionToString(p.value)}`,
        )
        .join(', ')}}`;
    case 'lambda':
      return `(${expr.params.join(', ')}) => ${expressionToString(expr.body)}`;
    default:
      return String(expr);
  }
}

// ============================================================================
// Header
// ============================================================================

function emitHeader(options: NormalizedOptions, target: string): string {
  if (!options.includeComments) return '';
  return [
    '/**',
    ` * Auto-generated SvelteKit ${target}`,
    ' * Generated from Manifest IR — DO NOT EDIT',
    ' *',
    ' * Writes flow through the Manifest runtime to enforce',
    ' * guards, policies, and constraints. Reads MAY bypass the runtime',
    ' * when a database client is configured.',
    ' *',
    ' * Regenerate with: manifest generate <ir> -p sveltekit',
    ' */',
    '',
  ].join('\n');
}

// ============================================================================
// Auth import / body generation
// ============================================================================

function generateAuthImports(options: NormalizedOptions): string {
  switch (options.authProvider) {
    case 'lucia':
      return `import { lucia } from "${options.authImportPath}";`;
    case 'auth-js':
      return `import { getServerSession } from "${options.authImportPath}";`;
    case 'custom':
      return `import { requireUser } from "${options.authImportPath}";`;
    case 'none':
    default:
      return '';
  }
}

/**
 * Auth body for `+server.ts` style handlers (using `event.locals`/`event.request`).
 * Produces lines that resolve a `userId` (and optionally `orgId`) plus an
 * unauthorized short-circuit returning the configured status code.
 */
function generateServerAuthBody(options: NormalizedOptions): string {
  const status = options.unauthorizedStatus;
  switch (options.authProvider) {
    case 'lucia':
      return [
        `  const session = event.locals.session;`,
        `  if (!session?.user?.id) {`,
        `    return json({ error: "Unauthorized", diagnostics: [] }, { status: ${status} });`,
        `  }`,
        `  const userId = session.user.id;`,
      ].join('\n');
    case 'auth-js':
      return [
        `  const session = await getServerSession(event);`,
        `  if (!session?.user?.id) {`,
        `    return json({ error: "Unauthorized", diagnostics: [] }, { status: ${status} });`,
        `  }`,
        `  const userId = session.user.id;`,
      ].join('\n');
    case 'custom':
      return [
        `  const user = await requireUser(event);`,
        `  if (!user?.id) {`,
        `    return json({ error: "Unauthorized", diagnostics: [] }, { status: ${status} });`,
        `  }`,
        `  const userId = user.id;`,
      ].join('\n');
    case 'none':
    default:
      return [`  // Auth disabled — all requests allowed`, `  const userId = "anonymous";`].join(
        '\n',
      );
  }
}

/**
 * Auth body for `+page.server.ts` style loaders (`load` and form `actions`).
 * Uses redirect/error helpers instead of inline JSON responses since the
 * SvelteKit convention is to throw `redirect()` / `error()` from server load
 * functions.
 */
function generateLoadAuthBody(options: NormalizedOptions): string {
  const status = options.unauthorizedStatus;
  switch (options.authProvider) {
    case 'lucia':
      return [
        `  const session = event.locals.session;`,
        `  if (!session?.user?.id) {`,
        `    throw redirect(${status === 401 ? '302' : status}, "/login");`,
        `  }`,
        `  const userId = session.user.id;`,
      ].join('\n');
    case 'auth-js':
      return [
        `  const session = await getServerSession(event);`,
        `  if (!session?.user?.id) {`,
        `    throw redirect(${status === 401 ? '302' : status}, "/login");`,
        `  }`,
        `  const userId = session.user.id;`,
      ].join('\n');
    case 'custom':
      return [
        `  const user = await requireUser(event);`,
        `  if (!user?.id) {`,
        `    throw redirect(${status === 401 ? '302' : status}, "/login");`,
        `  }`,
        `  const userId = user.id;`,
      ].join('\n');
    case 'none':
    default:
      return [`  // Auth disabled — all requests allowed`, `  const userId = "anonymous";`].join(
        '\n',
      );
  }
}

// ============================================================================
// Tenant resolution
// ============================================================================

function generateTenantLookup(options: NormalizedOptions, jsonReturn: boolean): string {
  if (!options.includeTenantFilter) return '';

  if (options.tenantProvider) {
    const { functionName, lookupKey } = options.tenantProvider;
    return [
      ``,
      `  const ${options.tenantIdProperty} = await ${functionName}(${lookupKey});`,
      `  if (!${options.tenantIdProperty}) {`,
      jsonReturn
        ? `    return json({ error: "Tenant not found", diagnostics: [] }, { status: 400 });`
        : `    throw error(400, "Tenant not found");`,
      `  }`,
    ].join('\n');
  }

  return [
    ``,
    `  const userMapping = await database.userTenantMapping.findUnique({`,
    `    where: { userId },`,
    `  });`,
    `  if (!userMapping) {`,
    jsonReturn
      ? `    return json({ error: "User not mapped to tenant", diagnostics: [] }, { status: 400 });`
      : `    throw error(400, "User not mapped to tenant");`,
    `  }`,
    `  const { ${options.tenantIdProperty} } = userMapping;`,
  ].join('\n');
}

// ============================================================================
// Prisma-style direct read helpers
// ============================================================================

function entityHasProperty(entity: IREntity, propertyName: string): boolean {
  return entity.properties.some((p) => p.name === propertyName);
}

function generateListReadQuery(entity: IREntity, options: NormalizedOptions): string {
  const delegate = toLowerCamelCase(entity.name);
  const variable = `${delegate}s`;
  const conditions: string[] = [];

  if (options.includeTenantFilter) {
    conditions.push(options.tenantIdProperty);
  }
  if (options.includeSoftDeleteFilter && entityHasProperty(entity, options.deletedAtProperty)) {
    conditions.push(`${options.deletedAtProperty}: null`);
  }

  const whereClause = conditions.length ? `where: { ${conditions.join(', ')} },` : '';

  const orderByField = entityHasProperty(entity, 'createdAt') ? 'createdAt' : 'id';

  return [
    `  const ${variable} = await database.${delegate}.findMany({`,
    `    ${whereClause}`,
    `    orderBy: { ${orderByField}: "desc" },`,
    `  });`,
  ].join('\n');
}

// ============================================================================
// Command comment block
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

// ============================================================================
// Imports
// ============================================================================

interface ImportFlags {
  includeJson: boolean;
  includeError: boolean;
  includeRedirect: boolean;
  includeFail: boolean;
  includeRuntime: boolean;
  includeDatabase: boolean;
  includeTypes: 'server' | 'load' | 'none';
}

function generateImports(options: NormalizedOptions, flags: ImportFlags): string {
  const lines = [
    ...svelteKitCoreImports(flags),
    ...svelteKitTypeImports(options, flags),
    ...svelteKitRuntimeImports(options, flags),
  ];
  if (lines.length > 0) lines.push('');
  return lines.join('\n');
}

function svelteKitCoreImports(flags: ImportFlags): string[] {
  const skitParts: string[] = [];
  if (flags.includeJson) skitParts.push('json');
  if (flags.includeError) skitParts.push('error');
  if (flags.includeRedirect) skitParts.push('redirect');
  if (flags.includeFail) skitParts.push('fail');
  if (skitParts.length === 0) return [];
  return [`import { ${skitParts.join(', ')} } from "@sveltejs/kit";`];
}

function svelteKitTypeImports(options: NormalizedOptions, flags: ImportFlags): string[] {
  if (!options.emitTypeImports || flags.includeTypes === 'none') return [];
  if (flags.includeTypes === 'server') {
    return [`import type { RequestHandler } from "./$types";`];
  }
  return [`import type { Actions, PageServerLoad } from "./$types";`];
}

function svelteKitRuntimeImports(options: NormalizedOptions, flags: ImportFlags): string[] {
  const lines: string[] = [];
  if (flags.includeDatabase) {
    lines.push(`import { database } from "${options.databaseImportPath}";`);
  }
  if (flags.includeRuntime) {
    lines.push(`import { ${options.runtimeFactoryName} } from "${options.runtimeImportPath}";`);
  }
  const authImport = generateAuthImports(options);
  if (authImport) lines.push(authImport);
  // Tenant provider — handlers call it (generateTenantLookup) when configured.
  if (options.includeTenantFilter && options.tenantProvider) {
    lines.push(
      `import { ${options.tenantProvider.functionName} } from "${options.tenantProvider.importPath}";`,
    );
  }
  return lines;
}

// ============================================================================
// +server.ts generator (sveltekit.server)
// ============================================================================

function generateServerFile(entity: IREntity, ir: IR, options: NormalizedOptions): string {
  const lines: string[] = [];
  lines.push(emitHeader(options, `+server.ts route for ${entity.name}`));

  lines.push(
    generateImports(options, {
      includeJson: true,
      includeError: false,
      includeRedirect: false,
      includeFail: false,
      includeRuntime: true,
      includeDatabase: true,
      includeTypes: 'server',
    }),
  );

  // GET → list
  lines.push(`/**`);
  lines.push(` * GET /${toRouteSegment(entity.name)} — list ${entity.name} entities`);
  lines.push(` */`);
  lines.push(`export const GET: RequestHandler = async (event) => {`);
  lines.push('  try {');
  lines.push(generateServerAuthBody(options));
  const listTenant = generateTenantLookup(options, /* jsonReturn */ true);
  if (listTenant) lines.push(listTenant);
  lines.push('');
  lines.push(generateListReadQuery(entity, options));
  lines.push('');
  lines.push(`    return json({ ${toLowerCamelCase(entity.name)}s });`);
  lines.push('  } catch (err) {');
  lines.push(`    console.error("Error fetching ${toLowerCamelCase(entity.name)}s:", err);`);
  lines.push('    return json(');
  lines.push('      { error: "Internal server error", diagnostics: [] },');
  lines.push('      { status: 500 }');
  lines.push('    );');
  lines.push('  }');
  lines.push('};');
  lines.push('');

  // POST → dispatch a command on this entity
  // Body shape: { command: string, params?: object, instanceId?: string }
  const entityCommands = ir.commands.filter((c) => c.entity === entity.name).map((c) => c.name);

  lines.push(`/**`);
  lines.push(
    ` * POST /${toRouteSegment(entity.name)} — dispatch a Manifest command on ${entity.name}.`,
  );
  if (entityCommands.length > 0) {
    lines.push(` * Available commands: ${entityCommands.join(', ')}`);
  }
  lines.push(' * Body: { command: string, params?: object, instanceId?: string }');
  lines.push(` */`);
  lines.push(`export const POST: RequestHandler = async (event) => {`);
  lines.push('  try {');
  lines.push(generateServerAuthBody(options));
  const writeTenant = generateTenantLookup(options, /* jsonReturn */ true);
  if (writeTenant) lines.push(writeTenant);
  lines.push('');
  lines.push('    const body = await event.request.json();');
  lines.push('    const { command, params, instanceId } = body ?? {};');
  lines.push('    if (typeof command !== "string" || command.length === 0) {');
  lines.push('      return json(');
  lines.push('        { error: "Missing command name", diagnostics: [] },');
  lines.push('        { status: 400 }');
  lines.push('      );');
  lines.push('    }');
  lines.push('');

  const userCtx = options.includeTenantFilter
    ? `{ user: { id: userId, ${options.tenantIdProperty} } }`
    : `{ user: { id: userId } }`;

  lines.push(`    const runtime = await ${options.runtimeFactoryName}(${userCtx});`);
  lines.push(`    const result = await runtime.runCommand("${entity.name}", command, {`);
  lines.push('      params: params ?? {},');
  lines.push('      instanceId,');
  lines.push('    });');
  lines.push('');
  lines.push('    if (!result.success) {');
  lines.push('      const firstDiagnostic = result.diagnostics?.[0];');
  lines.push('      const status = firstDiagnostic?.kind === "policy_denial" ? 403');
  lines.push('        : firstDiagnostic?.kind === "guard_failure" ? 422');
  lines.push('        : firstDiagnostic?.kind === "constraint_block" ? 422');
  lines.push('        : firstDiagnostic?.kind === "concurrency_conflict" ? 409');
  lines.push('        : 400;');
  lines.push('      return json(');
  lines.push('        { error: result.error, diagnostics: result.diagnostics },');
  lines.push('        { status }');
  lines.push('      );');
  lines.push('    }');
  lines.push('');
  lines.push('    return json({');
  lines.push('      data: result.data,');
  lines.push('      events: result.events,');
  lines.push('      diagnostics: result.diagnostics,');
  lines.push('    });');
  lines.push('  } catch (err) {');
  lines.push(`    console.error("Error dispatching command on ${entity.name}:", err);`);
  lines.push('    return json(');
  lines.push('      { error: "Internal server error", diagnostics: [] },');
  lines.push('      { status: 500 }');
  lines.push('    );');
  lines.push('  }');
  lines.push('};');
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// +page.server.ts generator (sveltekit.load)
// ============================================================================

function generateLoadFile(entity: IREntity, ir: IR, options: NormalizedOptions): string {
  const lines: string[] = [];
  lines.push(emitHeader(options, `+page.server.ts loader for ${entity.name}`));

  lines.push(
    generateImports(options, {
      includeJson: false,
      includeError: true,
      includeRedirect: true,
      includeFail: options.emitFormActions,
      includeRuntime: options.emitFormActions,
      includeDatabase: true,
      includeTypes: 'load',
    }),
  );

  // load function
  const variable = `${toLowerCamelCase(entity.name)}s`;
  lines.push(`/**`);
  lines.push(` * SvelteKit PageServerLoad for the ${entity.name} list page. Returns`);
  lines.push(' * type-safe `PageData` consumed by the corresponding +page.svelte.');
  lines.push(` */`);
  lines.push(`export const load: PageServerLoad = async (event) => {`);
  lines.push(generateLoadAuthBody(options));
  const loadTenant = generateTenantLookup(options, /* jsonReturn */ false);
  if (loadTenant) lines.push(loadTenant);
  lines.push('');
  lines.push(generateListReadQuery(entity, options));
  lines.push('');
  lines.push(`  return { ${variable} };`);
  lines.push(`};`);
  lines.push('');

  if (options.emitFormActions) {
    const entityCommands = ir.commands
      .filter((c) => c.entity === entity.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    lines.push(`/**`);
    lines.push(' * SvelteKit form actions — POST-only handlers backing progressive');
    lines.push(' * enhancement <form action="?/commandName" method="POST"> submissions.');
    lines.push(' * Each action validates input via the Manifest runtime so guards, policies,');
    lines.push(' * and constraints remain authoritative.');
    lines.push(` */`);
    lines.push('export const actions: Actions = {');

    if (entityCommands.length === 0) {
      lines.push('  // No commands declared for this entity.');
    }

    for (const command of entityCommands) {
      lines.push(generateCommandComment(command, entity, ir.policies));
      lines.push(`  ${command.name}: async (event) => {`);
      lines.push('    try {');
      lines.push(generateServerAuthBody(options));
      const actionTenant = generateTenantLookup(options, /* jsonReturn */ true);
      if (actionTenant) lines.push(actionTenant);
      lines.push('');
      lines.push('      const formData = await event.request.formData();');
      lines.push('      const params = Object.fromEntries(formData);');
      lines.push('      const instanceId =');
      lines.push(
        '        (typeof params.instanceId === "string" ? params.instanceId : undefined) ??',
      );
      lines.push('        (typeof params.id === "string" ? params.id : undefined);');
      lines.push('');

      const userCtx = options.includeTenantFilter
        ? `{ user: { id: userId, ${options.tenantIdProperty} } }`
        : `{ user: { id: userId } }`;

      lines.push(`      const runtime = await ${options.runtimeFactoryName}(${userCtx});`);
      lines.push(
        `      const result = await runtime.runCommand("${entity.name}", "${command.name}", {`,
      );
      lines.push('        params,');
      lines.push('        instanceId,');
      lines.push('      });');
      lines.push('');
      lines.push('      if (!result.success) {');
      lines.push('        const firstDiagnostic = result.diagnostics?.[0];');
      lines.push('        const status = firstDiagnostic?.kind === "policy_denial" ? 403');
      lines.push('          : firstDiagnostic?.kind === "guard_failure" ? 422');
      lines.push('          : firstDiagnostic?.kind === "constraint_block" ? 422');
      lines.push('          : firstDiagnostic?.kind === "concurrency_conflict" ? 409');
      lines.push('          : 400;');
      lines.push('        return fail(status, {');
      lines.push('          error: result.error,');
      lines.push('          diagnostics: result.diagnostics,');
      lines.push('        });');
      lines.push('      }');
      lines.push('');
      lines.push('      return {');
      lines.push('        success: true,');
      lines.push('        data: result.data,');
      lines.push('        events: result.events,');
      lines.push('        diagnostics: result.diagnostics,');
      lines.push('      };');
      lines.push('    } catch (err) {');
      lines.push(`      console.error("Error executing ${command.name}:", err);`);
      lines.push('      return fail(500, {');
      lines.push('        error: "Internal server error",');
      lines.push('        diagnostics: [],');
      lines.push('      });');
      lines.push('    }');
      lines.push('  },');
      lines.push('');
    }

    lines.push('};');
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// +server.ts dedicated command route (sveltekit.command)
// ============================================================================

function generateCommandServerFile(
  entity: IREntity,
  command: IRCommand,
  ir: IR,
  options: NormalizedOptions,
): string {
  const lines: string[] = [];
  lines.push(emitHeader(options, `+server.ts route for ${entity.name}.${command.name}`));

  lines.push(
    generateImports(options, {
      includeJson: true,
      includeError: false,
      includeRedirect: false,
      includeFail: false,
      includeRuntime: true,
      includeDatabase: false,
      includeTypes: 'server',
    }),
  );

  lines.push(generateCommandComment(command, entity, ir.policies).replace(/^ {2}/gm, ''));
  lines.push(`export const POST: RequestHandler = async (event) => {`);
  lines.push('  try {');
  lines.push(generateServerAuthBody(options));
  const cmdTenant = generateTenantLookup(options, /* jsonReturn */ true);
  if (cmdTenant) lines.push(cmdTenant);
  lines.push('');
  lines.push('    const body = await event.request.json().catch(() => ({}));');
  lines.push('    const instanceId =');
  lines.push('      (typeof body?.instanceId === "string" ? body.instanceId : undefined) ??');
  lines.push('      (typeof body?.id === "string" ? body.id : undefined);');
  lines.push('');

  const userCtx = options.includeTenantFilter
    ? `{ user: { id: userId, ${options.tenantIdProperty} } }`
    : `{ user: { id: userId } }`;

  lines.push(`    const runtime = await ${options.runtimeFactoryName}(${userCtx});`);
  lines.push(`    const result = await runtime.runCommand("${entity.name}", "${command.name}", {`);
  lines.push('      params: body ?? {},');
  lines.push('      instanceId,');
  lines.push('    });');
  lines.push('');
  lines.push('    if (!result.success) {');
  lines.push('      const firstDiagnostic = result.diagnostics?.[0];');
  lines.push('      const status = firstDiagnostic?.kind === "policy_denial" ? 403');
  lines.push('        : firstDiagnostic?.kind === "guard_failure" ? 422');
  lines.push('        : firstDiagnostic?.kind === "constraint_block" ? 422');
  lines.push('        : firstDiagnostic?.kind === "concurrency_conflict" ? 409');
  lines.push('        : 400;');
  lines.push('      return json(');
  lines.push('        { error: result.error, diagnostics: result.diagnostics },');
  lines.push('        { status }');
  lines.push('      );');
  lines.push('    }');
  lines.push('');
  lines.push('    return json({');
  lines.push('      data: result.data,');
  lines.push('      events: result.events,');
  lines.push('      diagnostics: result.diagnostics,');
  lines.push('    });');
  lines.push('  } catch (err) {');
  lines.push(`    console.error("Error executing ${entity.name}.${command.name}:", err);`);
  lines.push('    return json(');
  lines.push('      { error: "Internal server error", diagnostics: [] },');
  lines.push('      { status: 500 }');
  lines.push('    );');
  lines.push('  }');
  lines.push('};');
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// sveltekit.types — entity / command / result types
// ============================================================================

function generateEntityInterface(entity: IREntity): string {
  const lines: string[] = [];
  lines.push(`export interface ${entity.name} {`);
  for (const prop of entity.properties) {
    const optional =
      prop.modifiers.includes('optional') || prop.defaultValue !== undefined || prop.type.nullable;
    const sigil = optional ? '?' : '';
    lines.push(`  ${prop.name}${sigil}: ${irTypeToTs(prop.type)};`);
  }
  for (const computed of entity.computedProperties) {
    lines.push(`  readonly ${computed.name}: ${irTypeToTs(computed.type)};`);
  }
  lines.push('}');
  return lines.join('\n');
}

function generateCommandParamsInterface(command: IRCommand): string {
  const lines: string[] = [];
  const entity = command.entity ?? 'Unknown';
  const name = `${toPascalCase(entity)}${toPascalCase(command.name)}Params`;
  lines.push(`export interface ${name} {`);
  for (const param of command.parameters) {
    const sigil = param.required ? '' : '?';
    lines.push(`  ${param.name}${sigil}: ${irTypeToTs(param.type)};`);
  }
  lines.push('}');
  return lines.join('\n');
}

function generateTypesFile(ir: IR, options: NormalizedOptions): string {
  const lines: string[] = [];
  lines.push(emitHeader(options, 'TypeScript types for SvelteKit routes'));

  lines.push('/** Diagnostic emitted by the Manifest runtime when a command fails. */');
  lines.push('export interface ManifestDiagnostic {');
  lines.push('  kind: string;');
  lines.push('  message: string;');
  lines.push('  [key: string]: unknown;');
  lines.push('}');
  lines.push('');

  lines.push('/** Standardized success payload returned by +server.ts POST handlers. */');
  lines.push('export interface ManifestActionResult<T = unknown> {');
  lines.push('  success: boolean;');
  lines.push('  data?: T;');
  lines.push('  error?: string;');
  lines.push('  events?: unknown[];');
  lines.push('  diagnostics?: ManifestDiagnostic[];');
  lines.push('}');
  lines.push('');

  const sortedEntities = [...ir.entities].sort((a, b) => a.name.localeCompare(b.name));
  for (const entity of sortedEntities) {
    lines.push(generateEntityInterface(entity));
    lines.push('');
  }

  const sortedCommands = [...ir.commands]
    .filter((c) => c.parameters.length > 0)
    .sort((a, b) => {
      const ak = `${a.entity ?? ''}.${a.name}`;
      const bk = `${b.entity ?? ''}.${b.name}`;
      return ak.localeCompare(bk);
    });

  for (const command of sortedCommands) {
    lines.push(generateCommandParamsInterface(command));
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

// ============================================================================
// sveltekit.client — $lib client utilities
// ============================================================================

function generateClientFile(options: NormalizedOptions): string {
  const lines: string[] = [];
  lines.push(emitHeader(options, '$lib client utilities for SvelteKit'));

  lines.push('import type { ManifestActionResult, ManifestDiagnostic } from "./manifest-types";');
  lines.push('');

  lines.push('/**');
  lines.push(' * Invoke a Manifest command via the SvelteKit +server.ts dispatch route.');
  lines.push(' * Use this from client components after `enhance` is not appropriate.');
  lines.push(' */');
  lines.push('export async function invokeManifestCommand<T = unknown>(');
  lines.push('  entity: string,');
  lines.push('  command: string,');
  lines.push('  params: Record<string, unknown> = {},');
  lines.push('  instanceId?: string,');
  lines.push('  fetchImpl: typeof fetch = fetch,');
  lines.push('): Promise<ManifestActionResult<T>> {');
  lines.push('  const segment = entity');
  lines.push('    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")');
  lines.push('    .toLowerCase();');
  lines.push('  const response = await fetchImpl(`/${segment}`, {');
  lines.push('    method: "POST",');
  lines.push('    headers: { "Content-Type": "application/json" },');
  lines.push('    body: JSON.stringify({ command, params, instanceId }),');
  lines.push('  });');
  lines.push(
    '  const payload = (await response.json().catch(() => ({}))) as ManifestActionResult<T>;',
  );
  lines.push('  if (!response.ok && payload.success === undefined) {');
  lines.push('    return {');
  lines.push('      success: false,');
  lines.push(
    '      error: (payload as unknown as { error?: string }).error ?? response.statusText,',
  );
  lines.push(
    '      diagnostics: (payload as unknown as { diagnostics?: ManifestDiagnostic[] }).diagnostics ?? [],',
  );
  lines.push('    };');
  lines.push('  }');
  lines.push('  return payload;');
  lines.push('}');
  lines.push('');

  lines.push('/**');
  lines.push(' * Normalize a runtime command result into the ManifestActionResult shape.');
  lines.push(' */');
  lines.push('export function normalizeCommandResult<T = unknown>(');
  lines.push('  result: unknown,');
  lines.push('): ManifestActionResult<T> {');
  lines.push('  const r = result as Partial<ManifestActionResult<T>> & { error?: string };');
  lines.push('  if (r && typeof r.success === "boolean") {');
  lines.push('    return r as ManifestActionResult<T>;');
  lines.push('  }');
  lines.push('  return {');
  lines.push('    success: !r?.error,');
  lines.push('    data: r?.data as T | undefined,');
  lines.push('    error: r?.error,');
  lines.push('    events: r?.events ?? [],');
  lines.push('    diagnostics: r?.diagnostics ?? [],');
  lines.push('  };');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// sveltekit.companions — modules generated routes import but no surface writes
// ============================================================================

/**
 * Resolve which auth symbol/import the generated routes expect and whether it
 * points at a local module worth stubbing. Mirrors `generateAuthImports`:
 * lucia/auth-js/custom all import from `authImportPath` (a `$lib` alias by
 * default → local); `none` imports nothing.
 */
function authCompanionSpec(
  options: NormalizedOptions,
): { importSpecifier: string; kind: 'lucia' | 'getServerSession' | 'requireUser' } | null {
  switch (options.authProvider) {
    case 'lucia':
      return { importSpecifier: options.authImportPath, kind: 'lucia' };
    case 'auth-js':
      return { importSpecifier: options.authImportPath, kind: 'getServerSession' };
    case 'custom':
      return { importSpecifier: options.authImportPath, kind: 'requireUser' };
    case 'none':
    default:
      return null;
  }
}

/** Prisma client singleton (globalThis dev-reuse) for direct reads. */
function generateDatabaseCompanion(): string {
  return [
    '// Auto-generated Prisma client singleton for SvelteKit.',
    '// DO NOT EDIT — generated by the SvelteKit projection (companions surface).',
    '//',
    '// globalThis reuse so dev hot-reload does not exhaust DB connections.',
    '',
    'import { PrismaClient } from "@prisma/client";',
    '',
    'const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };',
    '',
    'export const database = globalForPrisma.prisma ?? new PrismaClient();',
    '',
    'if (process.env.NODE_ENV !== "production") {',
    '  globalForPrisma.prisma = database;',
    '}',
    '',
  ].join('\n');
}

/**
 * Fail-closed auth companion matching the symbol `generateAuthImports` imports.
 *
 * For auth-js/custom the exported function throws with a "wire your provider"
 * message so unfinished auth never silently allows access. Lucia is different:
 * the generated route bodies read `event.locals.session` (populated by the
 * app's hooks.server.ts), not the imported `lucia` binding — so this only needs
 * to satisfy the `import { lucia }` and document that wiring.
 */
function generateAuthCompanion(kind: 'lucia' | 'getServerSession' | 'requireUser'): string {
  const lines: string[] = [];
  lines.push('// Auto-generated Manifest auth companion (fail-closed stub).');
  lines.push('// Replace the body: resolve the caller from the request/session and return');
  lines.push('// the identity. Until then this throws (or, for lucia, requires hooks.server.ts)');
  lines.push('// so unauthenticated access cannot silently succeed.');
  lines.push('');
  if (kind === 'lucia') {
    lines.push('// The generated +server.ts / +page.server.ts bodies read');
    lines.push('// `event.locals.session`, which your `hooks.server.ts` must populate from');
    lines.push('// this Lucia instance. Replace the placeholder with your configured Lucia.');
    lines.push('export const lucia = {');
    lines.push('  // Wire your Lucia instance here (see https://lucia-auth.com).');
    lines.push('} as Record<string, unknown>;');
  } else if (kind === 'getServerSession') {
    lines.push('export async function getServerSession(');
    lines.push('  _event: unknown,');
    lines.push('): Promise<{ user: { id: string } } | null> {');
    lines.push('  throw new Error(');
    lines.push(
      '    "Manifest auth companion stub: implement getServerSession() to resolve the session. Return { user: { id } } or null.",',
    );
    lines.push('  );');
    lines.push('}');
  } else {
    lines.push('export async function requireUser(_event: unknown): Promise<{ id: string }> {');
    lines.push('  throw new Error(');
    lines.push(
      '    "Manifest auth companion stub: implement requireUser() to resolve the authenticated user or throw a redirect.",',
    );
    lines.push('  );');
    lines.push('}');
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Tenant lookup companion. Emitted only when a custom `tenantProvider` is
 * configured (whose function the handlers now import). Implements the
 * `userTenantMapping` lookup via the database companion and throws a clear
 * error when that delegate is absent. Mirrors the Next.js `_companionTenantModule`.
 */
function generateTenantCompanion(options: NormalizedOptions): string {
  const provider = options.tenantProvider!;
  const fn = provider.functionName;
  const key = provider.lookupKey;
  return [
    '// Auto-generated Manifest tenant lookup companion for SvelteKit.',
    '// DO NOT EDIT — generated by the SvelteKit projection (companions surface).',
    '//',
    `// Maps ${key} → tenantId via database.userTenantMapping. Replace the body if`,
    '// your schema resolves tenants differently.',
    '',
    `import { database } from "${options.databaseImportPath}";`,
    '',
    `export async function ${fn}(${key}: string): Promise<string | null> {`,
    '  const delegate = (database as unknown as {',
    `    userTenantMapping?: { findUnique(args: { where: { ${key}: string } }): Promise<{ tenantId: string } | null> };`,
    '  }).userTenantMapping;',
    '  if (!delegate?.findUnique) {',
    '    throw new Error(',
    `      "Manifest tenant companion: 'database.userTenantMapping' is unavailable. Implement ${fn} to map ${key} to a tenantId for your schema.",`,
    '    );',
    '  }',
    `  const mapping = await delegate.findUnique({ where: { ${key} } });`,
    '  return mapping?.tenantId ?? null;',
    '}',
    '',
  ].join('\n');
}

/**
 * Emit the companion modules generated SvelteKit code imports but no other
 * surface writes: the runtime factory (`createManifestRuntime`), the Prisma
 * client, and (for local providers) an auth stub. Each lands at the pathHint
 * derived from its CONFIGURED import path. A companion whose import path is a
 * package specifier is skipped — that module is the user's. When
 * `emitCompanions` is false, nothing is emitted.
 */
function generateCompanions(ir: IR, options: NormalizedOptions): ProjectionResult {
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

  const emit = (id: string, importSpecifier: string, build: () => string, label: string): void => {
    const pathHint = resolveLocalImportPathHint(importSpecifier, { framework: 'sveltekit' });
    if (!pathHint) {
      diagnostics.push({
        severity: 'info',
        code: 'COMPANION_SKIPPED_PACKAGE_PATH',
        message: `Skipping ${label} companion — "${importSpecifier}" is a package specifier, not a local module. That module is yours to provide.`,
      });
      return;
    }
    artifacts.push({ id, pathHint, contentType: 'typescript', code: build() });
  };

  // 1. Runtime factory — always. +server.ts / +page.server.ts / command routes
  //    import the factory under options.runtimeFactoryName; thread it through so
  //    the emitted export name matches the import.
  emit(
    'sveltekit.companions.runtime',
    options.runtimeImportPath,
    () => generateRuntimeFactoryModule({ ir, exportName: options.runtimeFactoryName }),
    'runtime factory',
  );

  // 2. Database client — always. The +server.ts GET and +page.server.ts load
  //    import { database } for direct reads and the default tenant lookup.
  emit(
    'sveltekit.companions.database',
    options.databaseImportPath,
    () => generateDatabaseCompanion(),
    'database client',
  );

  // 3. Auth stub — only when the auth import resolves to a LOCAL module. lucia
  //    (default), auth-js, and custom import from authImportPath (a $lib alias
  //    by default → local); none imports nothing.
  const spec = authCompanionSpec(options);
  if (spec) {
    emit(
      'sveltekit.companions.auth',
      spec.importSpecifier,
      () => generateAuthCompanion(spec.kind),
      'auth',
    );
  }

  // 4. Tenant lookup helper — only when a custom tenantProvider is configured
  //    (handlers then import its function). The default path inlines the
  //    userTenantMapping lookup via the database companion, so nothing to emit.
  if (options.includeTenantFilter && options.tenantProvider) {
    emit(
      'sveltekit.companions.tenant',
      options.tenantProvider.importPath,
      () => generateTenantCompanion(options),
      'tenant lookup',
    );
  }

  return { artifacts, diagnostics };
}

// ============================================================================
// Surface dispatchers
// ============================================================================

function entityNotFoundDiagnostic(entityName: string, ir: IR): ProjectionDiagnostic {
  return {
    severity: 'error',
    code: 'ENTITY_NOT_FOUND',
    message: `Entity "${entityName}" not found in IR. Available entities: ${ir.entities
      .map((e) => e.name)
      .join(', ')}`,
    entity: entityName,
  };
}

function commandNotFoundDiagnostic(
  entityName: string,
  commandName: string,
  ir: IR,
): ProjectionDiagnostic {
  const entityCommands = ir.commands.filter((c) => c.entity === entityName).map((c) => c.name);
  return {
    severity: 'error',
    code: 'COMMAND_NOT_FOUND',
    message: `Command "${commandName}" not found on entity "${entityName}". Available commands: ${entityCommands.join(', ')}`,
    entity: entityName,
  };
}

// ============================================================================
// Projection class
// ============================================================================

/**
 * SvelteKit projection.
 *
 * Emits `+server.ts` API routes, `+page.server.ts` loaders with form
 * `actions`, and supporting type / client artifacts that integrate with
 * the Manifest runtime. Mirrors the Next.js App Router projection's
 * semantics while honouring SvelteKit-specific conventions.
 */
export class SvelteKitProjection implements ProjectionTarget {
  readonly name = 'sveltekit';
  readonly description =
    'SvelteKit +server.ts routes and +page.server.ts loaders with form actions, $lib imports, and type-safe PageData';
  readonly surfaces = SURFACES;
  readonly descriptorMeta = SVELTEKIT_DESCRIPTOR_META;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const options = normalizeOptions((request.options ?? {}) as SvelteKitProjectionOptions, ir);

    switch (request.surface) {
      case SURFACE_SERVER: {
        if (!request.entity) {
          return {
            artifacts: [],
            diagnostics: [
              {
                severity: 'error',
                code: 'MISSING_ENTITY',
                message: `surface "${SURFACE_SERVER}" requires entity`,
              },
            ],
          };
        }
        const entity = ir.entities.find((e) => e.name === request.entity);
        if (!entity) {
          return {
            artifacts: [],
            diagnostics: [entityNotFoundDiagnostic(request.entity, ir)],
          };
        }
        const code = generateServerFile(entity, ir, options);
        return {
          artifacts: [
            {
              id: `sveltekit.server:${request.entity}`,
              pathHint: `${options.routesDir}/${toRouteSegment(request.entity)}/+server.ts`,
              contentType: 'typescript',
              code,
            },
          ],
          diagnostics: [],
        };
      }

      case SURFACE_LOAD: {
        if (!request.entity) {
          return {
            artifacts: [],
            diagnostics: [
              {
                severity: 'error',
                code: 'MISSING_ENTITY',
                message: `surface "${SURFACE_LOAD}" requires entity`,
              },
            ],
          };
        }
        const entity = ir.entities.find((e) => e.name === request.entity);
        if (!entity) {
          return {
            artifacts: [],
            diagnostics: [entityNotFoundDiagnostic(request.entity, ir)],
          };
        }
        const code = generateLoadFile(entity, ir, options);
        return {
          artifacts: [
            {
              id: `sveltekit.load:${request.entity}`,
              pathHint: `${options.routesDir}/${toRouteSegment(request.entity)}/+page.server.ts`,
              contentType: 'typescript',
              code,
            },
          ],
          diagnostics: [],
        };
      }

      case SURFACE_COMMAND: {
        if (!request.entity) {
          return {
            artifacts: [],
            diagnostics: [
              {
                severity: 'error',
                code: 'MISSING_ENTITY',
                message: `surface "${SURFACE_COMMAND}" requires entity`,
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
                message: `surface "${SURFACE_COMMAND}" requires command`,
              },
            ],
          };
        }
        const entity = ir.entities.find((e) => e.name === request.entity);
        if (!entity) {
          return {
            artifacts: [],
            diagnostics: [entityNotFoundDiagnostic(request.entity, ir)],
          };
        }
        const command = ir.commands.find(
          (c) => c.entity === request.entity && c.name === request.command,
        );
        if (!command) {
          return {
            artifacts: [],
            diagnostics: [commandNotFoundDiagnostic(request.entity, request.command, ir)],
          };
        }
        const code = generateCommandServerFile(entity, command, ir, options);
        return {
          artifacts: [
            {
              id: `sveltekit.command:${request.entity}.${request.command}`,
              pathHint: `${options.routesDir}/${toRouteSegment(
                request.entity,
              )}/commands/${toRouteSegment(request.command)}/+server.ts`,
              contentType: 'typescript',
              code,
            },
          ],
          diagnostics: [],
        };
      }

      case SURFACE_TYPES: {
        const code = generateTypesFile(ir, options);
        return {
          artifacts: [
            {
              id: 'sveltekit.types',
              pathHint: 'src/lib/manifest-types.ts',
              contentType: 'typescript',
              code,
            },
          ],
          diagnostics: [],
        };
      }

      case SURFACE_CLIENT: {
        const code = generateClientFile(options);
        return {
          artifacts: [
            {
              id: 'sveltekit.client',
              pathHint: 'src/lib/manifest-client.ts',
              contentType: 'typescript',
              code,
            },
          ],
          diagnostics: [],
        };
      }

      case SURFACE_COMPANIONS: {
        return generateCompanions(ir, options);
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

// Re-export types for downstream consumers
export type { SvelteKitProjectionOptions } from './types';
