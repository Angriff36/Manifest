#!/usr/bin/env node
/**
 * Manifest Projection CLI
 *
 * Usage:
 *   manifest-generate <target> <surface> <manifest-file> [entity] [command] [options]
 *
 * Examples:
 *   manifest-generate nextjs nextjs.route recipe.manifest Recipe --output route.ts
 *   manifest-generate nextjs nextjs.command recipe.manifest Recipe create --output route.ts
 *   manifest-generate nextjs ts.types recipe.manifest --output src/types/manifest.ts
 *
 * Generates platform-specific artifacts from Manifest IR using projections.
 */

import { compileToIR } from '../src/manifest/ir-compiler.js';
import {
  getProjection,
  listProjections,
  getProjectionNames,
} from '../src/manifest/projections/registry.js';
import type { NextJsProjectionOptions } from '../src/manifest/projections/interface.js';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

function printUsage(): void {
  console.error('Usage: manifest-generate <target> <surface> <manifest-file> [entity] [command] [options]');
  console.error('');
  console.error('Arguments:');
  console.error('  target        Projection target name (e.g., "nextjs")');
  console.error('  surface       Surface to generate (e.g., "nextjs.route", "nextjs.command", "ts.types")');
  console.error('  manifest-file Path to .manifest source file');
  console.error('  entity        Entity name (required for entity-scoped surfaces)');
  console.error('  command       Command name (required for nextjs.command surface)');
  console.error('');
  console.error('Options:');
  console.error('  --output <path>              Output file path (default: stdout)');
  console.error('  --auth-provider <provider>   Auth provider: clerk, nextauth, custom, none');
  console.error('  --auth-import <path>         Import path for auth (default: @/lib/auth)');
  console.error('  --db-import <path>           Import path for database (default: @/lib/database)');
  console.error('  --runtime-import <path>      Import path for runtime factory (default: @/lib/manifest-runtime)');
  console.error('  --response-import <path>     Import path for response helpers (default: @/lib/manifest-response)');
  console.error('  --tenant-provider <fn>       Tenant lookup function name (e.g. getTenantIdForOrg)');
  console.error('  --tenant-import <path>       Import path for tenant lookup function');
  console.error('  --tenant-lookup-key <key>    Auth field to pass to tenant lookup: orgId or userId');
  console.error('  --no-tenant-filter           Disable tenant filtering');
  console.error('  --list                       List available projections and surfaces');
  console.error('  --help                       Show this help message');
  console.error('');
  console.error('Available projections:');
  const names = getProjectionNames();
  if (names.length === 0) {
    console.error('  (none registered)');
  } else {
    const projections = listProjections();
    for (const p of projections) {
      console.error(`  ${p.name.padEnd(12)} ${p.description}`);
      if (p.surfaces.length > 0) {
        console.error(`               surfaces: ${p.surfaces.join(', ')}`);
      }
    }
  }
  console.error('');
  console.error('Examples:');
  console.error('  manifest-generate nextjs nextjs.route recipe.manifest Recipe --output route.ts');
  console.error('  manifest-generate nextjs ts.types recipe.manifest --output src/types/manifest.ts');
}

function parseArgs(args: string[]): {
  target?: string;
  surface?: string;
  manifestPath?: string;
  entity?: string;
  command?: string;
  outputPath?: string;
  list: boolean;
  help: boolean;
  options: NextJsProjectionOptions;
} {
  const result = {
    target: undefined as string | undefined,
    surface: undefined as string | undefined,
    manifestPath: undefined as string | undefined,
    entity: undefined as string | undefined,
    command: undefined as string | undefined,
    outputPath: undefined as string | undefined,
    list: false,
    help: false,
    options: {} as NextJsProjectionOptions,
  };

  // Accumulate tenantProvider pieces separately
  let tenantProviderFn: string | undefined;
  let tenantImportPath: string | undefined;
  let tenantLookupKey: 'orgId' | 'userId' | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--list') {
      result.list = true;
    } else if (arg === '--output' || arg === '-o') {
      result.outputPath = args[++i];
    } else if (arg === '--auth-provider') {
      result.options.authProvider = args[++i] as NextJsProjectionOptions['authProvider'];
    } else if (arg === '--auth-import') {
      result.options.authImportPath = args[++i];
    } else if (arg === '--db-import') {
      result.options.databaseImportPath = args[++i];
    } else if (arg === '--runtime-import') {
      result.options.runtimeImportPath = args[++i];
    } else if (arg === '--response-import') {
      result.options.responseImportPath = args[++i];
    } else if (arg === '--tenant-provider') {
      tenantProviderFn = args[++i];
    } else if (arg === '--tenant-import') {
      tenantImportPath = args[++i];
    } else if (arg === '--tenant-lookup-key') {
      tenantLookupKey = args[++i] as 'orgId' | 'userId';
    } else if (arg === '--no-tenant-filter') {
      result.options.includeTenantFilter = false;
    } else if (!result.target) {
      result.target = arg;
    } else if (!result.surface) {
      result.surface = arg;
    } else if (!result.manifestPath) {
      result.manifestPath = arg;
    } else if (!result.entity) {
      result.entity = arg;
    } else if (!result.command) {
      result.command = arg;
    } else {
      console.error(`Unknown argument: ${arg}`);
      result.help = true;
    }
  }

  if (tenantProviderFn && tenantImportPath) {
    result.options.tenantProvider = {
      functionName: tenantProviderFn,
      importPath: tenantImportPath,
      lookupKey: tenantLookupKey ?? 'userId',
    };
  }

  return result;
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

function getCanonicalCapsuleOutputPath(args: {
  surface?: string;
  entity?: string;
  command?: string;
}): string | null {
  if (!args.surface || !args.entity) {
    return null;
  }

  if (args.surface !== 'nextjs.route' && args.surface !== 'nextjs.command') {
    return null;
  }

  const entitySegment = toEntitySegment(args.entity);
  const commandSegment = toKebabCase(args.command ?? 'list');
  return join('apps', 'api', 'app', 'api', entitySegment, commandSegment, 'route.ts');
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  // Handle --help
  if (args.help) {
    printUsage();
    return 0;
  }

  // Handle --list
  if (args.list) {
    console.log('Available projections:');
    const projections = listProjections();
    if (projections.length === 0) {
      console.log('  (none registered)');
    } else {
      for (const p of projections) {
        console.log(`  ${p.name.padEnd(12)} ${p.description}`);
        if (p.surfaces.length > 0) {
          console.log(`               surfaces: ${p.surfaces.join(', ')}`);
        }
      }
    }
    return 0;
  }

  // Validate required arguments
  if (!args.target || !args.surface || !args.manifestPath) {
    console.error('Error: Missing required arguments');
    console.error('');
    printUsage();
    return 1;
  }

  // Get projection
  const projection = getProjection(args.target);
  if (!projection) {
    console.error(`Error: Projection "${args.target}" not found`);
    console.error('');
    console.error('Available projections:');
    const names = getProjectionNames();
    if (names.length === 0) {
      console.error('  (none registered)');
    } else {
      for (const name of names) {
        console.error(`  ${name}`);
      }
    }
    return 1;
  }

  // Read manifest source
  let source: string;
  try {
    source = readFileSync(args.manifestPath, 'utf-8');
  } catch (error) {
    console.error(`Error: Failed to read manifest file: ${args.manifestPath}`);
    if (error instanceof Error) {
      console.error(`  ${error.message}`);
    }
    return 1;
  }

  // Compile to IR
  const result = await compileToIR(source);

  // Handle compilation errors
  if (result.diagnostics.length > 0) {
    console.error('Error: Compilation failed');
    for (const diag of result.diagnostics) {
      const location = diag.line !== undefined
        ? `:${diag.line}${diag.column !== undefined ? `:${diag.column}` : ''}`
        : '';
      console.error(`  ${args.manifestPath}${location}: ${diag.severity} - ${diag.message}`);
    }
    return 1;
  }

  if (!result.ir) {
    console.error('Error: Compilation produced no IR (this should not happen)');
    return 1;
  }

  // Generate artifacts
  const genResult = projection.generate(result.ir, {
    surface: args.surface,
    entity: args.entity,
    command: args.command,
    options: Object.keys(args.options).length > 0 ? args.options : undefined,
  });

  // Handle generation errors
  if (genResult.diagnostics.length > 0) {
    const hasErrors = genResult.diagnostics.some(d => d.severity === 'error');
    for (const diag of genResult.diagnostics) {
      console.error(`  ${diag.severity}: ${diag.message}`);
      if (diag.code === 'MISSING_ENTITY' && !args.entity) {
        console.error(`  Hint: provide entity name as 4th argument`);
        console.error(`    manifest-generate ${args.target} ${args.surface} ${args.manifestPath} <EntityName>`);
      }
    }
    if (hasErrors) {
      return 1;
    }
  }

  if (genResult.artifacts.length === 0) {
    console.error('Error: Generation produced no artifacts');
    return 1;
  }

  // CLI writes first artifact (dev tool - single surface, single output)
  const artifact = genResult.artifacts[0];

  const canonicalOutputPath = getCanonicalCapsuleOutputPath(args);
  const outputPath = canonicalOutputPath ?? args.outputPath;

  if (outputPath) {
    try {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, artifact.code, 'utf-8');
      console.log(`Generated ${args.target} ${args.surface} -> ${outputPath}`);
    } catch (error) {
      console.error(`Error: Failed to write output file: ${outputPath}`);
      if (error instanceof Error) {
        console.error(`  ${error.message}`);
      }
      return 1;
    }
  } else {
    console.log(artifact.code);
  }

  return 0;
}

// Run CLI
main()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error('Unexpected error:');
    console.error(error);
    process.exit(1);
  });
