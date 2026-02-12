/**
 * Next.js App Router projection for Manifest IR.
 *
 * Generates Next.js API route handlers using App Router conventions.
 * Configurable for different auth providers and database setups.
 */
/**
 * Default options for Next.js projection.
 */
const DEFAULT_OPTIONS = {
    authProvider: 'clerk',
    authImportPath: '@repo/auth/server',
    databaseImportPath: '@repo/database',
    responseImportPath: '@/lib/manifest-response',
    runtimeImportPath: '@/lib/manifest-runtime',
    includeTenantFilter: true,
    includeSoftDeleteFilter: true,
    tenantIdProperty: 'tenantId',
    deletedAtProperty: 'deletedAt',
    appDir: 'apps/api/app/api',
    strictMode: true,
};
const DEFAULT_TENANT_PROVIDER = {
    importPath: '@/app/lib/tenant',
    functionName: 'getTenantIdForOrg',
    lookupKey: 'orgId',
};
/**
 * Normalize user options with defaults.
 */
function normalizeOptions(options) {
    return {
        ...DEFAULT_OPTIONS,
        ...options,
        includeComments: options?.includeComments ?? true,
        indentSize: options?.indentSize ?? 2,
        tenantProvider: options?.tenantProvider ?? DEFAULT_TENANT_PROVIDER,
    };
}
function toLowerCamelCase(value) {
    if (!value)
        return value;
    return value[0].toLowerCase() + value.slice(1);
}
function toKebabCase(value) {
    return value
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/\s+/g, '-')
        .toLowerCase();
}
function toEntitySegment(value) {
    return value.toLowerCase();
}
/**
 * Generate an import statement with proper path handling.
 */
function generateImport(module, from) {
    return `import ${module} from "${from}";`;
}
/**
 * Generate the import line for the auth provider (empty string if none needed).
 */
function generateAuthImport(options) {
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
function generateAuthBody(options) {
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
function generateTenantLookup(options) {
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
function generatePrismaQuery(entityName, options) {
    const delegateName = toLowerCamelCase(entityName);
    const variableName = `${delegateName}s`;
    const { includeTenantFilter, includeSoftDeleteFilter, tenantIdProperty, deletedAtProperty } = options;
    const whereConditions = [];
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
function irTypeToTsType(irType) {
    const tsTypeMap = {
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
function generateEntityTypes(entity) {
    const lines = [];
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
export class NextJsProjection {
    name = 'nextjs';
    description = 'Next.js App Router API routes with configurable auth and database support';
    surfaces = ['nextjs.route', 'nextjs.command', 'ts.types', 'ts.client'];
    generate(ir, request) {
        const options = request.options;
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
                            pathHint: `${commandOpts.appDir}/${toEntitySegment(request.entity)}/${toKebabCase(request.command)}/route.ts`,
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
    _route(ir, entityName, options) {
        const diagnostics = [];
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
    _types(ir) {
        const lines = [];
        lines.push('// Auto-generated TypeScript types from Manifest IR');
        lines.push('// DO NOT EDIT - This file is generated from .manifest source');
        lines.push('');
        for (const entity of ir.entities) {
            lines.push(generateEntityTypes(entity));
        }
        return { code: lines.join('\n'), diagnostics: [] };
    }
    _client(ir) {
        const lines = [];
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
    _command(ir, entityName, commandName, options) {
        const diagnostics = [];
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
    _generatePostCommandHandler(entity, command, options) {
        const { responseImportPath, runtimeImportPath } = options;
        const lines = [];
        lines.push(`// Auto-generated Next.js command handler for ${entity.name}.${command.name}`);
        lines.push('// Generated from Manifest IR - DO NOT EDIT');
        lines.push('// Writes MUST flow through runtime to enforce guards, policies, and constraints');
        lines.push('');
        lines.push('import type { NextRequest } from "next/server";');
        lines.push(generateImport('{ createManifestRuntime }', runtimeImportPath));
        lines.push(generateImport('{ manifestSuccessResponse, manifestErrorResponse }', responseImportPath));
        if (options.includeTenantFilter) {
            if (options.tenantProvider) {
                lines.push(generateImport(`{ ${options.tenantProvider.functionName} }`, options.tenantProvider.importPath));
            }
            else {
                lines.push(generateImport('{ database }', options.databaseImportPath));
            }
        }
        const authImport = generateAuthImport(options);
        if (authImport)
            lines.push(authImport);
        lines.push('');
        lines.push('export async function POST(request: NextRequest) {');
        lines.push('  try {');
        lines.push(generateAuthBody(options));
        const tenantLookup = generateTenantLookup(options);
        if (tenantLookup)
            lines.push(tenantLookup);
        lines.push('');
        lines.push('    const body = await request.json();');
        lines.push('');
        const tenantCtx = options.includeTenantFilter
            ? `{ user: { id: userId, ${options.tenantIdProperty}: ${options.tenantIdProperty} } }`
            : `{ user: { id: userId, ${options.tenantIdProperty}: "__no_tenant__" } }`;
        lines.push(`    const runtime = await createManifestRuntime(${tenantCtx});`);
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
    _generateGetRoute(entity, options) {
        const { databaseImportPath, responseImportPath } = options;
        const delegateName = toLowerCamelCase(entity.name);
        const variableName = `${delegateName}s`;
        const lines = [];
        // Add comment explaining the design decision
        lines.push(`// Auto-generated Next.js API route for ${entity.name}`);
        lines.push('// Generated from Manifest IR - DO NOT EDIT');
        lines.push('');
        lines.push('import type { NextRequest } from "next/server";');
        if (options.tenantProvider) {
            lines.push(generateImport(`{ ${options.tenantProvider.functionName} }`, options.tenantProvider.importPath));
            lines.push(generateImport(`{ database }`, databaseImportPath));
        }
        else {
            lines.push(generateImport(`{ database }`, databaseImportPath));
        }
        lines.push(generateImport(`{ manifestSuccessResponse, manifestErrorResponse }`, responseImportPath));
        const authImport = generateAuthImport(options);
        if (authImport)
            lines.push(authImport);
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
}
//# sourceMappingURL=generator.js.map