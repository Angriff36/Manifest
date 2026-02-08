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
}

/**
 * Default options for Next.js projection.
 */
const DEFAULT_OPTIONS: Omit<NormalizedNextJsOptions, 'includeComments' | 'indentSize'> = {
  authProvider: 'custom',
  authImportPath: '@/lib/auth',
  databaseImportPath: '@/lib/database',
  responseImportPath: '@/lib/manifest-response',
  runtimeImportPath: '@/lib/manifest-runtime',
  includeTenantFilter: true,
  includeSoftDeleteFilter: true,
  tenantIdProperty: 'tenantId',
  deletedAtProperty: 'deletedAt',
  appDir: 'app/api',
  strictMode: true,
};

/**
 * Normalize user options with defaults.
 */
function normalizeOptions(options?: NextJsProjectionOptions): NormalizedNextJsOptions {
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    includeComments: options?.includeComments ?? true,
    indentSize: options?.indentSize ?? 2,
  };
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
    case 'clerk':
      return `  const { userId } = await auth();
  if (!userId) {
    return manifestErrorResponse("Unauthorized", 401);
  }`;

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
  const { includeTenantFilter } = options;

  if (!includeTenantFilter) {
    return '';
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
  const lowerEntity = entityName.toLowerCase();
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

  return `const ${lowerEntity}s = await database.${lowerEntity}.findMany({
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
  readonly surfaces = ['nextjs.route', 'nextjs.command', 'ts.types', 'ts.client'] as const;

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
            pathHint: `${opts.appDir}/${request.entity.toLowerCase()}/route.ts`,
            contentType: 'typescript',
            code: result.code,
          }],
          diagnostics: result.diagnostics,
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
        const commandResult = this._command(ir, request.entity, request.command, options);
        if (commandResult.diagnostics.some(d => d.severity === 'error')) {
          return { artifacts: [], diagnostics: commandResult.diagnostics };
        }
        const commandOpts = normalizeOptions(options);
        return {
          artifacts: [{
            id: `nextjs.command:${request.entity}.${request.command}`,
            pathHint: `${commandOpts.appDir}/${request.entity.toLowerCase()}/commands/${request.command}/route.ts`,
            contentType: 'typescript',
            code: commandResult.code,
          }],
          diagnostics: commandResult.diagnostics,
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
      lines.push(`export async function get${entity.name}s(): Promise<${entity.name}[]> {`);
      lines.push(`  const response = await fetch(\`/api/${lowerEntity}\`);`);
      lines.push(`  if (!response.ok) {`);
      lines.push(`    throw new Error("Failed to fetch ${entity.name}s");`);
      lines.push(`  }`);
      lines.push(`  const data = await response.json();`);
      lines.push(`  return data.${lowerEntity}s;`);
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
    const { responseImportPath, runtimeImportPath } = options;

    const lines: string[] = [];

    lines.push(`// Auto-generated Next.js command handler for ${entity.name}.${command.name}`);
    lines.push('// Generated from Manifest IR - DO NOT EDIT');
    lines.push('// Writes MUST flow through runtime to enforce guards, policies, and constraints');
    lines.push('');
    lines.push('import { NextRequest } from "next/server";');
    lines.push(generateImport('{ createManifestRuntime }', runtimeImportPath));
    lines.push(generateImport('{ manifestSuccessResponse, manifestErrorResponse }', responseImportPath));
    if (options.includeTenantFilter) {
      lines.push(generateImport('{ database }', options.databaseImportPath));
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
    const tenantCtx = options.includeTenantFilter
      ? `{ user: { id: userId, ${options.tenantIdProperty}: ${options.tenantIdProperty} } }`
      : '{ user: { id: userId } }';
    lines.push(`    const runtime = createManifestRuntime(${tenantCtx});`);
    lines.push(`    const result = await runtime.runCommand("${command.name}", body, {`);
    lines.push(`      entityName: "${entity.name}",`);
    lines.push('    });');
    lines.push('');
    lines.push('    if (!result.success) {');
    lines.push('      if (result.policyDenial) {');
    lines.push('        return manifestErrorResponse(`Access denied: ${result.policyDenial.policyName}`, 403);');
    lines.push('      }');
    lines.push('      if (result.guardFailure) {');
    lines.push('        return manifestErrorResponse(`Guard ${result.guardFailure.index} failed: ${result.guardFailure.formatted}`, 422);');
    lines.push('      }');
    lines.push('      return manifestErrorResponse(result.error ?? "Command failed", 400);');
    lines.push('    }');
    lines.push('');
    lines.push('    return manifestSuccessResponse({ result: result.result, events: result.emittedEvents });');
    lines.push('  } catch (error) {');
    lines.push(`    console.error("Error executing ${entity.name}.${command.name}:", error);`);
    lines.push('    return manifestErrorResponse("Internal server error", 500);');
    lines.push('  }');
    lines.push('}');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generate GET route for an entity.
   * Uses direct Prisma query (bypassing runtime) for efficiency.
   */
  private _generateGetRoute(entity: IREntity, options: NormalizedNextJsOptions): string {
    const { databaseImportPath, responseImportPath } = options;
    const lowerEntity = entity.name.toLowerCase();

    const lines: string[] = [];

    // Add comment explaining the design decision
    lines.push(`// Auto-generated Next.js API route for ${entity.name}`);
    lines.push('// Generated from Manifest IR - DO NOT EDIT');
    lines.push('');
    lines.push('import { NextRequest } from "next/server";');
    lines.push(generateImport(`{ database }`, databaseImportPath));
    lines.push(generateImport(
      `{ manifestSuccessResponse, manifestErrorResponse }`,
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
    lines.push(`    return manifestSuccessResponse({ ${lowerEntity}s });`);
    lines.push('  } catch (error) {');
    lines.push(`    console.error("Error fetching ${lowerEntity}s:", error);`);
    lines.push('    return manifestErrorResponse("Internal server error", 500);');
    lines.push('  }');
    lines.push('}');
    lines.push('');

    return lines.join('\n');
  }
}
