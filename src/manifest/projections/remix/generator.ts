/**
 * Remix projection for Manifest IR.
 *
 * Generates Remix (v2 and React Router v7) route handlers with:
 * - Loader functions for data fetching (entity reads)
 * - Action functions for command execution (mutations)
 * - Proper Response helpers (json, redirect)
 * - Session-based auth integration
 * - Error boundary exports
 *
 * Follows Remix file-based routing conventions:
 * - app/routes/entities.$entity.tsx (list view)
 * - app/routes/entities.$entity.$id.tsx (detail view)
 * - app/routes/entities.$entity.$id.$command.tsx (command actions)
 */

import type { IR, IREntity, IRCommand } from '../../ir';
import type {
  ProjectionTarget,
  ProjectionRequest,
  ProjectionResult,
  ProjectionDiagnostic,
  RemixProjectionOptions,
} from '../interface';

/**
 * Re-export the projection-interface types so downstream consumers of
 * `@angriff36/manifest/projections/remix` can type the projection
 * boundary without reaching into '../interface' directly.
 */
export type {
  ProjectionRequest,
  ProjectionArtifact,
  ProjectionDiagnostic,
  ProjectionResult,
  ProjectionTarget,
} from '../interface';

/**
 * Internal result shape used by private generation methods.
 */
interface CodeResult {
  code: string;
  diagnostics: ProjectionDiagnostic[];
}

/**
 * Normalized options for internal use (all required, no outputPath).
 */
interface NormalizedRemixOptions {
  authProvider: 'clerk' | 'remix-auth' | 'custom' | 'none';
  authImportPath: string;
  databaseImportPath: string;
  responseImportPath: string;
  runtimeImportPath: string;
  sessionStoragePath: string;
  includeTenantFilter: boolean;
  includeSoftDeleteFilter: boolean;
  tenantIdProperty: string;
  deletedAtProperty: string;
  routesDir: string;
  strictMode: boolean;
  includeComments: boolean;
  includeErrorBoundary: boolean;
  unauthorizedStatus: number;
  remixVersion: 'v2' | 'v7';
  tenantProvider?: {
    importPath: string;
    functionName: string;
    lookupKey: 'orgId' | 'userId';
  };
}

/**
 * Default values for Remix projection options.
 */
export const REMIX_DEFAULTS = {
  authProvider: 'remix-auth' as const,
  authImportPath: '~/utils/auth.server',
  databaseImportPath: '~/utils/database.server',
  responseImportPath: '~/utils/remix-response',
  runtimeImportPath: '~/utils/manifest-runtime',
  sessionStoragePath: '~/utils/session.server',
  includeTenantFilter: true,
  includeSoftDeleteFilter: true,
  tenantIdProperty: 'tenantId',
  deletedAtProperty: 'deletedAt',
  routesDir: 'app/routes',
  strictMode: true,
  includeComments: true,
  includeErrorBoundary: true,
  unauthorizedStatus: 401,
  remixVersion: 'v2' as const,
};

/**
 * Normalize user options with defaults.
 */
function normalizeOptions(options?: RemixProjectionOptions): NormalizedRemixOptions {
  return {
    authProvider: options?.authProvider ?? REMIX_DEFAULTS.authProvider,
    authImportPath: options?.authImportPath ?? REMIX_DEFAULTS.authImportPath,
    databaseImportPath: options?.databaseImportPath ?? REMIX_DEFAULTS.databaseImportPath,
    responseImportPath: options?.responseImportPath ?? REMIX_DEFAULTS.responseImportPath,
    runtimeImportPath: options?.runtimeImportPath ?? REMIX_DEFAULTS.runtimeImportPath,
    sessionStoragePath: options?.sessionStoragePath ?? REMIX_DEFAULTS.sessionStoragePath,
    includeTenantFilter: options?.includeTenantFilter ?? REMIX_DEFAULTS.includeTenantFilter,
    includeSoftDeleteFilter: options?.includeSoftDeleteFilter ?? REMIX_DEFAULTS.includeSoftDeleteFilter,
    tenantIdProperty: options?.tenantIdProperty ?? REMIX_DEFAULTS.tenantIdProperty,
    deletedAtProperty: options?.deletedAtProperty ?? REMIX_DEFAULTS.deletedAtProperty,
    routesDir: options?.routesDir ?? REMIX_DEFAULTS.routesDir,
    strictMode: options?.strictMode ?? REMIX_DEFAULTS.strictMode,
    includeComments: options?.includeComments ?? REMIX_DEFAULTS.includeComments,
    includeErrorBoundary: options?.includeErrorBoundary ?? REMIX_DEFAULTS.includeErrorBoundary,
    unauthorizedStatus: options?.unauthorizedStatus ?? REMIX_DEFAULTS.unauthorizedStatus,
    remixVersion: options?.remixVersion ?? REMIX_DEFAULTS.remixVersion,
    tenantProvider: options?.tenantProvider,
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
 * Generate the import line for the auth provider.
 */
function generateAuthImport(options: NormalizedRemixOptions): string {
  const { authProvider, authImportPath } = options;

  switch (authProvider) {
    case 'clerk': {
      const clerkImport = authImportPath === '~/utils/auth.server' ? '@clerk/remix' : authImportPath;
      return generateImport('{ getAuth }', clerkImport);
    }
    case 'remix-auth': {
      return generateImport('{ authenticator }', authImportPath);
    }
    case 'custom':
      return generateImport('{ getUser, requireUser }', authImportPath);
    case 'none':
    default:
      return '';
  }
}

/**
 * Generate the auth check body for Remix loaders/actions.
 */
function generateAuthBody(options: NormalizedRemixOptions): string {
  const { authProvider, unauthorizedStatus } = options;
  const status = unauthorizedStatus;

  switch (authProvider) {
    case 'clerk': {
      const needsOrgId = options.tenantProvider?.lookupKey === 'orgId';
      const destructure = needsOrgId ? '{ orgId, userId }' : '{ userId }';
      const authGuard = needsOrgId
        ? 'if (!(userId && orgId)) {'
        : 'if (!userId) {';
      return `  const ${destructure} = await getAuth(request);
  ${authGuard}
    throw redirect("/login", { status: ${status} });
  }`;
    }

    case 'remix-auth':
      return `  const session = await authenticator.isAuthenticated(request, {
    failureRedirect: "/login",
  });
  if (!session?.user?.id) {
    throw redirect("/login", { status: ${status} });
  }
  const userId = session.user.id;`;

    case 'custom':
      return `  const user = await getUser(request);
  if (!user?.id) {
    throw redirect("/login", { status: ${status} });
  }
  const userId = user.id;`;

    case 'none':
      return `  // Auth disabled - all requests allowed
  const userId = "anonymous";`;

    default:
      return `  // Unknown auth provider - please implement
  const userId = "unknown";`;
  }
}

/**
 * Generate tenant lookup code.
 */
function generateTenantLookup(options: NormalizedRemixOptions): string {
  if (!options.includeTenantFilter) {
    return '';
  }

  if (options.tenantProvider) {
    const { functionName, lookupKey } = options.tenantProvider;
    return `
  const ${options.tenantIdProperty} = await ${functionName}(${lookupKey});

  if (!${options.tenantIdProperty}) {
    return json(
      { error: "Tenant not found", diagnostics: [] },
      { status: 400 }
    );
  }`;
  }

  return `
  const userMapping = await database.userTenantMapping.findUnique({
    where: { userId },
  });

  if (!userMapping) {
    return json(
      { error: "User not mapped to tenant", diagnostics: [] },
      { status: 400 }
    );
  }

  const { ${options.tenantIdProperty} } = userMapping;`;
}

/**
 * True when the entity declares a property with the given name.
 */
function entityHasProperty(entity: IREntity, propertyName: string): boolean {
  return entity.properties.some((p) => p.name === propertyName);
}

/**
 * Generate Prisma query with filters for Remix loaders.
 */
function generatePrismaQuery(
  entity: IREntity,
  options: NormalizedRemixOptions
): string {
  const delegateName = toLowerCamelCase(entity.name);
  const variableName = `${delegateName}s`;
  const { includeTenantFilter, includeSoftDeleteFilter, tenantIdProperty, deletedAtProperty } = options;

  const whereConditions: string[] = [];

  if (includeTenantFilter) {
    whereConditions.push(`${tenantIdProperty}`);
  }

  if (includeSoftDeleteFilter && entityHasProperty(entity, deletedAtProperty)) {
    whereConditions.push(`${deletedAtProperty}: null`);
  }

  const whereClause = whereConditions.length > 0
    ? `where: {
        ${whereConditions.join(',\n        ')}
      },`
    : '';

  const orderByField = entityHasProperty(entity, 'createdAt') ? 'createdAt' : 'id';

  return `const ${variableName} = await database.${delegateName}.findMany({
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
 * Generate error boundary export for Remix routes.
 */
function generateErrorBoundary(entityName?: string): string {
  const entityText = entityName ? ` for ${entityName}` : '';
  return `
export function ErrorBoundary() {
  const error = useRouteError();
  console.error("Route error${entityText}:", error);

  return (
    <div className="error-container">
      <h1>Something went wrong</h1>
      <p>Please try again later.</p>
    </div>
  );
}`;
}

/**
 * Generate loader function for entity list routes.
 */
function generateListLoader(
  entity: IREntity,
  options: NormalizedRemixOptions
): string {
  const delegateName = toLowerCamelCase(entity.name);
  const variableName = `${delegateName}s`;
  const lines: string[] = [];

  lines.push(`export async function loader({ request }: LoaderFunctionArgs) {`);
  lines.push('  try {');
  lines.push(generateAuthBody(options));
  const tenantLookup = generateTenantLookup(options);
  if (tenantLookup) lines.push(tenantLookup);
  lines.push('');
  lines.push(generatePrismaQuery(entity, options));
  lines.push('');
  lines.push(`    return json({ ${variableName} });`);
  lines.push('  } catch (error) {');
  lines.push(`    console.error(\`Error fetching ${variableName}:\`, error);`);
  lines.push('    return json(');
  lines.push('      { error: "Internal server error", diagnostics: [] },');
  lines.push('      { status: 500 }');
  lines.push('    );');
  lines.push('  }');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate loader function for entity detail routes.
 */
function generateDetailLoader(
  entity: IREntity,
  options: NormalizedRemixOptions
): string {
  const delegateName = toLowerCamelCase(entity.name);
  const lines: string[] = [];

  lines.push(`export async function loader({ request, params }: LoaderFunctionArgs) {`);
  lines.push('  try {');
  lines.push(generateAuthBody(options));
  const tenantLookup = generateTenantLookup(options);
  if (tenantLookup) lines.push(tenantLookup);
  lines.push('');
  lines.push('    const { id } = params;');
  lines.push('');
  lines.push('    if (!id) {');
  lines.push('      return json(');
  lines.push('        { error: "Missing id parameter", diagnostics: [] },');
  lines.push('        { status: 400 }');
  lines.push('      );');
  lines.push('    }');
  lines.push('');

  const whereConditions: string[] = ['id'];
  if (options.includeTenantFilter) {
    whereConditions.push(options.tenantIdProperty);
  }
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

  lines.push(`    const ${delegateName} = await database.${delegateName}.${prismaMethod}({`);
  lines.push(`      ${whereClause}`);
  lines.push('    });');
  lines.push('');
  lines.push(`    if (!${delegateName}) {`);
  lines.push('      return json(');
  lines.push(`        { error: "${entity.name} not found", diagnostics: [] },`);
  lines.push('        { status: 404 }');
  lines.push('      );');
  lines.push('    }');
  lines.push('');
  lines.push(`    return json({ ${delegateName} });`);
  lines.push('  } catch (error) {');
  lines.push(`    console.error(\`Error fetching \${delegateName}:\`, error);`);
  lines.push('    return json(');
  lines.push('      { error: "Internal server error", diagnostics: [] },');
  lines.push('      { status: 500 }');
  lines.push('    );');
  lines.push('  }');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate action function for command routes.
 */
function generateCommandAction(
  entity: IREntity,
  command: IRCommand,
  options: NormalizedRemixOptions
): string {
  const lines: string[] = [];

  lines.push(`export async function action({ request, params }: ActionFunctionArgs) {`);
  lines.push('  try {');
  lines.push(generateAuthBody(options));
  const tenantLookup = generateTenantLookup(options);
  if (tenantLookup) lines.push(tenantLookup);
  lines.push('');
  lines.push('    const formData = await request.formData();');
  lines.push('    const body = Object.fromEntries(formData);');
  lines.push('');
  lines.push('    const instanceId = params?.id;');
  lines.push('');

  const tenantCtx = options.includeTenantFilter
    ? `{ user: { id: userId, ${options.tenantIdProperty}: ${options.tenantIdProperty} } }`
    : `{ user: { id: userId, ${options.tenantIdProperty}: "__no_tenant__" } }`;

  lines.push(`    const runtime = await createManifestRuntime(${tenantCtx});`);
  lines.push(`    const result = await runtime.runCommand("${command.name}", body, {`);
  lines.push(`      entityName: "${entity.name}",`);
  lines.push('      instanceId,');
  lines.push('    });');
  lines.push('');
  lines.push('    if (!result.success) {');
  lines.push('      const firstDiagnostic = result.diagnostics?.[0];');
  lines.push('      const status = firstDiagnostic?.kind === "policy_denial" ? 403');
  lines.push('        : firstDiagnostic?.kind === "guard_failure" ? 422');
  lines.push('        : firstDiagnostic?.kind === "constraint_block" ? 422');
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
  lines.push('  } catch (error) {');
  lines.push('    const isAuthError = error instanceof Error && (');
  lines.push('      /unauth/i.test(error.message) ||');
  lines.push('      /token/i.test(error.message) ||');
  lines.push('      /session/i.test(error.message)');
  lines.push('    );');
  lines.push('    if (isAuthError) {');
  lines.push(`      throw redirect("/login", { status: ${options.unauthorizedStatus} });`);
  lines.push('    }');
  lines.push(`    console.error(\`Error executing \${command.name}:\`, error);`);
  lines.push('    return json(');
  lines.push('      { error: "Internal server error", diagnostics: [] },');
  lines.push('      { status: 500 }');
  lines.push('    );');
  lines.push('  }');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate the imports section for a Remix route file.
 */
function generateImports(
  options: NormalizedRemixOptions,
  includeLoader: boolean,
  includeAction: boolean
): string {
  const lines: string[] = [];

  // Core Remix imports
  const remixImports: string[] = [];
  if (includeLoader) remixImports.push('LoaderFunctionArgs', 'json');
  if (includeAction) remixImports.push('ActionFunctionArgs', 'redirect');
  if (options.includeErrorBoundary) remixImports.push('useRouteError');
  if (includeLoader || includeAction) remixImports.push('type Route');

  lines.push(generateImport(`{ ${remixImports.join(', ')} }`, '@remix-run/node'));

  // Type imports for React Router v7 compatibility
  if (options.remixVersion === 'v7') {
    const v7Types: string[] = [];
    if (includeLoader) v7Types.push('type LoaderFunctionArgs');
    if (includeAction) v7Types.push('type ActionFunctionArgs');
    if (v7Types.length > 0) {
      lines.push(generateImport(`{ ${v7Types.join(', ')} }`, 'react-router'));
    }
  }

  // Database import
  lines.push(generateImport('{ database }', options.databaseImportPath));

  // Runtime import for actions
  if (includeAction) {
    lines.push(generateImport('{ createManifestRuntime }', options.runtimeImportPath));
  }

  // Auth imports
  const authImport = generateAuthImport(options);
  if (authImport) lines.push(authImport);

  lines.push('');
  return lines.join('\n');
}

/**
 * Generate a complete list route file for an entity.
 */
function generateListRouteFile(
  entity: IREntity,
  options: NormalizedRemixOptions
): string {
  const lines: string[] = [];

  // File header comment
  if (options.includeComments) {
    lines.push(`// Auto-generated Remix route for ${entity.name} list view`);
    lines.push('// Generated from Manifest IR - DO NOT EDIT');
    lines.push('');
  }

  // Imports
  lines.push(generateImports(options, true, false));

  // Route type declaration
  if (options.strictMode) {
    lines.push(`type Route = typeof import("@remix-run/react/routes").GenericRoute;`);
    lines.push('');
  }

  // Loader
  lines.push(generateListLoader(entity, options));

  // Default export (placeholder component)
  lines.push(`export default function ${entity.name}ListRoute() {`);
  lines.push('  // This is a placeholder - implement your UI in the component');
  lines.push(`  // Loader data is available via useLoaderData<typeof loader>()`);
  lines.push(`  return <div>TODO: Implement ${entity.name} list view</div>;`);
  lines.push('}');
  lines.push('');

  // Error boundary
  if (options.includeErrorBoundary) {
    lines.push(generateErrorBoundary(entity.name));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate a complete detail route file for an entity.
 */
function generateDetailRouteFile(
  entity: IREntity,
  options: NormalizedRemixOptions
): string {
  const lines: string[] = [];

  // File header comment
  if (options.includeComments) {
    lines.push(`// Auto-generated Remix route for ${entity.name} detail view`);
    lines.push('// Generated from Manifest IR - DO NOT EDIT');
    lines.push('');
  }

  // Imports
  lines.push(generateImports(options, true, false));

  // Route type declaration
  if (options.strictMode) {
    lines.push(`type Route = typeof import("@remix-run/react/routes").GenericRoute;`);
    lines.push('');
  }

  // Loader
  lines.push(generateDetailLoader(entity, options));

  // Default export (placeholder component)
  lines.push(`export default function ${entity.name}DetailRoute() {`);
  lines.push('  // This is a placeholder - implement your UI in the component');
  lines.push(`  // Loader data is available via useLoaderData<typeof loader>()`);
  lines.push(`  return <div>TODO: Implement ${entity.name} detail view</div>;`);
  lines.push('}');
  lines.push('');

  // Error boundary
  if (options.includeErrorBoundary) {
    lines.push(generateErrorBoundary(entity.name));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate a complete command route file for an entity.
 */
function generateCommandRouteFile(
  entity: IREntity,
  command: IRCommand,
  options: NormalizedRemixOptions
): string {
  const lines: string[] = [];

  // File header comment
  if (options.includeComments) {
    lines.push(`// Auto-generated Remix route for ${entity.name}.${command.name}`);
    lines.push('// Generated from Manifest IR - DO NOT EDIT');
    lines.push('// Writes MUST flow through runtime to enforce guards, policies, and constraints.');
    lines.push('');
  }

  // Imports
  lines.push(generateImports(options, false, true));

  // Route type declaration
  if (options.strictMode) {
    lines.push(`type Route = typeof import("@remix-run/react/routes").GenericRoute;`);
    lines.push('');
  }

  // Action
  lines.push(generateCommandAction(entity, command, options));

  // Default export (placeholder component - typically a redirect or form)
  lines.push(`export default function ${entity.name}${command.name}Route() {`);
  lines.push('  // This is a placeholder - typically redirects or renders a form');
  lines.push('  // Use useActionData<typeof action>() to access action results');
  lines.push(`  return <div>TODO: Implement ${command.name} form or redirect</div>;`);
  lines.push('}');
  lines.push('');

  // Error boundary
  if (options.includeErrorBoundary) {
    lines.push(generateErrorBoundary(`${entity.name}.${command.name}`));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate TypeScript type definitions file.
 */
function generateTypesFile(ir: IR): CodeResult {
  const lines: string[] = [];

  lines.push('// Auto-generated TypeScript types from Manifest IR');
  lines.push('// DO NOT EDIT - This file is generated from .manifest source');
  lines.push('');
  lines.push('import type {');
  lines.push('  ManifestLoaderData,');
  lines.push('  ManifestActionResult,');
  lines.push('  ManifestDiagnostic,');
  lines.push('} from "~/utils/manifest-types";');
  lines.push('');

  for (const entity of ir.entities) {
    lines.push(generateEntityTypes(entity));
  }

  return { code: lines.join('\n'), diagnostics: [] };
}

/**
 * Remix projection implementation.
 */
export class RemixProjection implements ProjectionTarget {
  readonly name = 'remix';
  readonly description = 'Remix v2 and React Router v7 route handlers with loaders, actions, and Response helpers';
  readonly surfaces = [
    'remix.list',
    'remix.detail',
    'remix.command',
    'remix.types',
    'remix.client',
  ] as const;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const options = request.options as RemixProjectionOptions | undefined;

    switch (request.surface) {
      case 'remix.list': {
        if (!request.entity) {
          return {
            artifacts: [],
            diagnostics: [{ severity: 'error', code: 'MISSING_ENTITY', message: 'surface "remix.list" requires entity' }],
          };
        }
        const opts = normalizeOptions(options);
        const entity = ir.entities.find(e => e.name === request.entity);
        if (!entity) {
          return {
            artifacts: [],
            diagnostics: [{
              severity: 'error',
              code: 'ENTITY_NOT_FOUND',
              message: `Entity "${request.entity}" not found in IR. Available entities: ${ir.entities.map(e => e.name).join(', ')}`,
              entity: request.entity,
            }],
          };
        }
        const code = generateListRouteFile(entity, opts);
        return {
          artifacts: [{
            id: `remix.list:${request.entity}`,
            pathHint: `${opts.routesDir}/entities.${toKebabCase(request.entity)}.tsx`,
            contentType: 'typescript',
            code,
          }],
          diagnostics: [],
        };
      }

      case 'remix.detail': {
        if (!request.entity) {
          return {
            artifacts: [],
            diagnostics: [{ severity: 'error', code: 'MISSING_ENTITY', message: 'surface "remix.detail" requires entity' }],
          };
        }
        const opts = normalizeOptions(options);
        const entity = ir.entities.find(e => e.name === request.entity);
        if (!entity) {
          return {
            artifacts: [],
            diagnostics: [{
              severity: 'error',
              code: 'ENTITY_NOT_FOUND',
              message: `Entity "${request.entity}" not found in IR. Available entities: ${ir.entities.map(e => e.name).join(', ')}`,
              entity: request.entity,
            }],
          };
        }
        const code = generateDetailRouteFile(entity, opts);
        return {
          artifacts: [{
            id: `remix.detail:${request.entity}`,
            pathHint: `${opts.routesDir}/entities.${toKebabCase(request.entity)}.$id.tsx`,
            contentType: 'typescript',
            code,
          }],
          diagnostics: [],
        };
      }

      case 'remix.command': {
        if (!request.entity) {
          return {
            artifacts: [],
            diagnostics: [{ severity: 'error', code: 'MISSING_ENTITY', message: 'surface "remix.command" requires entity' }],
          };
        }
        if (!request.command) {
          return {
            artifacts: [],
            diagnostics: [{ severity: 'error', code: 'MISSING_COMMAND', message: 'surface "remix.command" requires command' }],
          };
        }
        const opts = normalizeOptions(options);
        const entity = ir.entities.find(e => e.name === request.entity);
        if (!entity) {
          return {
            artifacts: [],
            diagnostics: [{
              severity: 'error',
              code: 'ENTITY_NOT_FOUND',
              message: `Entity "${request.entity}" not found in IR. Available entities: ${ir.entities.map(e => e.name).join(', ')}`,
              entity: request.entity,
            }],
          };
        }
        const entityCommands = ir.commands.filter(c => c.entity === request.entity);
        const command = entityCommands.find(c => c.name === request.command);
        if (!command) {
          return {
            artifacts: [],
            diagnostics: [{
              severity: 'error',
              code: 'COMMAND_NOT_FOUND',
              message: `Command "${request.command}" not found on entity "${request.entity}". Available commands: ${entityCommands.map(c => c.name).join(', ')}`,
              entity: request.entity,
            }],
          };
        }
        const code = generateCommandRouteFile(entity, command, opts);
        return {
          artifacts: [{
            id: `remix.command:${request.entity}.${request.command}`,
            pathHint: `${opts.routesDir}/entities.${toKebabCase(request.entity)}.$id.${toKebabCase(request.command)}.tsx`,
            contentType: 'typescript',
            code,
          }],
          diagnostics: [],
        };
      }

      case 'remix.types': {
        const result = generateTypesFile(ir);
        return {
          artifacts: [{
            id: 'remix.types',
            pathHint: 'app/types/manifest-generated.ts',
            contentType: 'typescript',
            code: result.code,
          }],
          diagnostics: result.diagnostics,
        };
      }

      case 'remix.client': {
        const result = this._generateClient(ir);
        return {
          artifacts: [{
            id: 'remix.client',
            pathHint: 'app/lib/manifest-client.ts',
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

  /**
   * Generate client utilities for Remix apps.
   */
  private _generateClient(_ir: IR): CodeResult {
    const lines: string[] = [];

    lines.push('// Auto-generated client utilities for Manifest');
    lines.push('// DO NOT EDIT - This file is generated from .manifest source');
    lines.push('');
    lines.push('import { json, redirect } from "@remix-run/node";');
    lines.push('import type { ManifestActionResult } from "~/types/manifest-generated";');
    lines.push('');

    // Response helpers
    lines.push('/**');
    lines.push(' * Standardized success response helper for Remix routes.');
    lines.push(' */');
    lines.push('export function manifestSuccessResponse(');
    lines.push('  data: unknown,');
    lines.push('  init?: ResponseInit');
    lines.push(') {');
    lines.push('  return json(data, init);');
    lines.push('}');
    lines.push('');

    lines.push('/**');
    lines.push(' * Standardized error response helper for Remix routes.');
    lines.push(' */');
    lines.push('export function manifestErrorResponse(');
    lines.push('  error: string | { error: string; diagnostics: unknown[] },');
    lines.push('  status: number,');
    lines.push('  init?: ResponseInit');
    lines.push(') {');
    lines.push('  const body = typeof error === "string" ? { error, diagnostics: [] } : error;');
    lines.push('  return json(body, { ...init, status });');
    lines.push('}');
    lines.push('');

    lines.push('/**');
    lines.push(' * Normalize command result from Manifest runtime.');
    lines.push(' */');
    lines.push('export function normalizeCommandResult(');
    lines.push('  entityName: string,');
    lines.push('  commandName: string,');
    lines.push('  result: unknown');
    lines.push('): ManifestActionResult {');
    lines.push('  // Type assertion for runtime result');
    lines.push('  const r = result as ManifestActionResult | { success?: boolean; data?: unknown; error?: string };');
    lines.push('');
    lines.push('  if ("success" in r && typeof r.success === "boolean") {');
    lines.push('    return r as ManifestActionResult;');
    lines.push('  }');
    lines.push('');
    lines.push('  // Legacy format without explicit success field');
    lines.push('  return {');
    lines.push('    success: !r.error,');
    lines.push('    data: r.data,');
    lines.push('    error: r.error,');
    lines.push('    events: [],');
    lines.push('    diagnostics: [],');
    lines.push('  };');
    lines.push('}');
    lines.push('');

    return { code: lines.join('\n'), diagnostics: [] };
  }
}
