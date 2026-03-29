#!/usr/bin/env node

/**
 * Manifest CLI
 *
 * Command-line interface for the Manifest language.
 * Provides commands for compiling, generating code, and managing Manifest projects.
 */

import { Command } from 'commander';
import { compileCommand } from './commands/compile.js';
import { generateCommand } from './commands/generate.js';
import { buildCommand } from './commands/build.js';
import { validateCommand } from './commands/validate.js';
import { checkCommand } from './commands/check.js';
import { initCommand } from './commands/init.js';
import { scanCommand } from './commands/scan.js';
import { harnessCommand } from './commands/harness.js';
import { lintRoutesCommand } from './commands/lint-routes.js';
import { routesCommand } from './commands/routes.js';
import { auditRoutesCommand } from './commands/audit-routes.js';
import {
  cacheStatusCommand,
  doctorCommand,
  duplicatesCommand,
  inspectEntityCommand,
  runtimeCheckCommand,
  diffSourceVsIRCommand,
} from './commands/doctor.js';
import { getConfig } from './utils/config.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, normalize, dirname, join } from 'node:path';
import { realpath, readFile } from 'node:fs/promises';

/**
 * Read version from the root package.json at runtime so the CLI always
 * reports the same version as the published package — no manual sync needed.
 */
async function getPackageVersion(): Promise<string> {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // Traverse up from dist/ (or src/ in dev) to find the root package.json
    for (let dir = here, prev = ''; dir !== prev; prev = dir, dir = dirname(dir)) {
      try {
        const pkgPath = join(dir, 'package.json');
        const raw = await readFile(pkgPath, 'utf-8');
        const pkg = JSON.parse(raw) as { name?: string; version?: string };
        if (pkg.name === '@angriff36/manifest' && pkg.version) {
          return pkg.version;
        }
      } catch {
        // not found at this level, keep walking up
      }
    }
  } catch {
    // fall through
  }
  return '0.0.0';
}

const program = new Command();

const packageVersion = await getPackageVersion();

program
  .name('manifest')
  .description('Manifest language CLI - Compile, generate, and validate Manifest code')
  .version(packageVersion);

/**
 * manifest init
 *
 * Initialize Manifest configuration for your project.
 */
program
  .command('init')
  .description('Initialize Manifest configuration (interactive)')
  .option('-f, --force', 'Overwrite existing config file')
  .action(initCommand);

/**
 * manifest compile [source]
 *
 * Compile .manifest source files to IR (Intermediate Representation).
 */
program
  .command('compile')
  .description('Compile .manifest source to IR')
  .argument('[source]', 'Source .manifest file or glob pattern')
  .option('-o, --output <path>', 'Output directory or file path')
  .option('-g, --glob <pattern>', 'Glob pattern for multiple files (use with output directory)')
  .option('-d, --diagnostics', 'Include diagnostics in output', false)
  .option('--pretty', 'Pretty-print JSON output', true)
  .action(async (source, options = {}) => {
    const config = (await getConfig()) ?? {};
    if (!options.output && config?.output) {
      options.output = config.output;
    }
    await compileCommand(source, options);
  });

/**
 * manifest generate <ir>
 *
 * Generate code from IR using a projection.
 */
program
  .command('generate')
  .description('Generate code from IR using a projection')
  .argument('<ir>', 'IR file or directory')
  .option('-p, --projection <name>', 'Projection name (nextjs, ts.types, ts.client)', 'nextjs')
  .option('-s, --surface <name>', 'Projection surface (route, command, types, client, all)', 'all')
  .option('-o, --output <path>', 'Output directory')
  .option('--auth <provider>', 'Auth provider or import path')
  .option('--database <path>', 'Database import path')
  .option('--runtime <path>', 'Runtime import path')
  .option('--response <path>', 'Response helpers import path')
  .action(async (ir, options = {}) => {
    const config = (await getConfig()) ?? {};
    const nextJsOptions = config?.projections?.nextjs?.options || config?.projections?.['nextjs']?.options || {};

    // Use CLI options, fall back to config, fall back to defaults
    const finalOptions = {
      ...options,
      auth: options.auth || nextJsOptions.authImportPath || nextJsOptions.authProvider || 'clerk',
      database: options.database || nextJsOptions.databaseImportPath || '@/lib/database',
      runtime: options.runtime || nextJsOptions.runtimeImportPath || '@/lib/manifest-runtime',
      response: options.response || nextJsOptions.responseImportPath || '@/lib/manifest-response',
    };

    await generateCommand(ir, finalOptions);
  });

/**
 * manifest build [source]
 *
 * Compile .manifest to IR and generate code in one step.
 */
program
  .command('build')
  .description('Compile and generate in one step')
  .argument('[source]', 'Source .manifest file or glob pattern')
  .option('-p, --projection <name>', 'Projection name (nextjs, ts.types, ts.client)', 'nextjs')
  .option('-s, --surface <name>', 'Projection surface (route, command, types, client, all)', 'all')
  .option('--ir-output <path>', 'IR output directory')
  .option('--code-output <path>', 'Generated code output directory')
  .option('-g, --glob <pattern>', 'Glob pattern for multiple files')
  .option('--auth <provider>', 'Auth provider or import path')
  .option('--database <path>', 'Database import path')
  .option('--runtime <path>', 'Runtime import path')
  .option('--response <path>', 'Response helpers import path')
  .action(async (source, options = {}) => {
    const config = (await getConfig()) ?? {};
    const nextJsOptions = config?.projections?.nextjs?.options || config?.projections?.['nextjs']?.options || {};

    // Use CLI options, fall back to config, fall back to defaults
    const finalOptions = {
      ...options,
      auth: options.auth || nextJsOptions.authImportPath || nextJsOptions.authProvider || 'clerk',
      database: options.database || nextJsOptions.databaseImportPath || '@/lib/database',
      runtime: options.runtime || nextJsOptions.runtimeImportPath || '@/lib/manifest-runtime',
      response: options.response || nextJsOptions.responseImportPath || '@/lib/manifest-response',
      irOutput: options.irOutput || config?.output || 'ir/',
      codeOutput: options.codeOutput || config?.projections?.nextjs?.output || config?.projections?.['nextjs']?.output || 'generated/',
    };

    await buildCommand(source, finalOptions);
  });

/**
 * manifest validate [ir]
 *
 * Validate IR against schema.
 */
program
  .command('validate')
  .description('Validate IR against schema')
  .argument('[ir]', 'IR file or glob pattern')
  .option('--schema <path>', 'Schema path (default: docs/spec/ir/ir-v1.schema.json)')
  .option('--strict', 'Fail on warnings', false)
  .action(validateCommand);

/**
 * manifest check [source]
 *
 * Compile .manifest source and validate generated IR in one step.
 */
program
  .command('check')
  .description('Compile and validate in one step')
  .argument('[source]', 'Source .manifest file or glob pattern')
  .option('-o, --output <path>', 'IR output directory or file path')
  .option('-g, --glob <pattern>', 'Glob pattern for multiple files (use with output directory)')
  .option('-d, --diagnostics', 'Include diagnostics in compile output', false)
  .option('--pretty', 'Pretty-print JSON output', true)
  .option('--schema <path>', 'Schema path (default: docs/spec/ir/ir-v1.schema.json)')
  .option('--strict', 'Fail on warnings', false)
  .action(async (source, options = {}) => {
    const config = (await getConfig()) ?? {};
    if (!options.output && config?.output) {
      options.output = config.output;
    }
    await checkCommand(source, options);
  });

/**
 * manifest scan [source]
 *
 * Scan .manifest files for configuration issues before runtime.
 * Primary goal: "If scan passes, the code works."
 *
 * Checks:
 * - Policy coverage: Every command has a policy
 * - Store consistency: Store targets are recognized
 */
program
  .command('scan')
  .description('Scan manifest files for configuration issues')
  .argument('[source]', 'Source .manifest file or directory')
  .option('-g, --glob <pattern>', 'Glob pattern for manifest files', '**/*.manifest')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .option('--strict', 'Fail on warnings', false)
  .action(async (source, options = {}) => {
    await scanCommand(source, options);
  });

/**
 * manifest harness <manifest>
 *
 * Run a fixture-generator style test script against compiled IR and report
 * step/assertion pass-fail counts.
 */
program
  .command('harness')
  .description('Run IR harness script and report failed steps/assertions')
  .argument('<manifest>', 'Path to a .manifest file')
  .requiredOption('-s, --script <path>', 'Path to harness script JSON')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .action(async (manifest, options = {}) => {
    await harnessCommand(manifest, options);
  });

/**
 * manifest routes
 *
 * Compile all .manifest files and output the canonical route manifest.
 * Agent-accessible equivalent of the DevTools Route Surface tab.
 *
 * See docs/spec/manifest-vnext.md § "Canonical Routes (Normative)".
 */
program
  .command('routes')
  .description('Generate canonical route manifest from compiled IR')
  .option('-s, --src <pattern>', 'Source glob pattern for .manifest files')
  .option('-f, --format <format>', 'Output format (json, summary)', 'json')
  .option('-b, --base-path <path>', 'Base path prefix for routes', '/api')
  .action(async (options = {}) => {
    await routesCommand(options);
  });

/**
 * manifest lint-routes
 *
 * Scan client directories for hardcoded route strings.
 * Fails when violations are found — the enforcement layer for canonical routes.
 *
 * See docs/spec/manifest-vnext.md § "Canonical Routes (Normative)".
 */
program
  .command('lint-routes')
  .description('Scan for hardcoded route strings (canonical routes enforcement)')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .option('-c, --config <path>', 'Config file path')
  .action(async (options = {}) => {
    await lintRoutesCommand(options);
  });

/**
 * manifest audit-routes
 *
 * Audit generated/handwritten routes for Manifest boundary compliance:
 * - Writes should execute via runtime.runCommand
 * - Direct reads should include expected tenant/location/soft-delete filters
 */
program
  .command('audit-routes')
  .description('Audit route boundary compliance (runtime writes + scoped reads + ownership)')
  .option('-r, --root <path>', 'Root directory to audit', '.')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .option('--strict', 'Fail on warnings and enforce ownership rules as errors', false)
  .option('--tenant-field <name>', 'Tenant scope field name', 'tenantId')
  .option('--deleted-field <name>', 'Soft-delete field name', 'deletedAt')
  .option('--location-field <name>', 'Location scope field name', 'locationId')
  .option('--commands-manifest <path>', 'Path to commands manifest JSON (enables ownership rules)')
  .option('--exemptions <path>', 'Path to exemptions registry JSON')
  .action(async (options = {}) => {
    await auditRoutesCommand(options);
  });

/**
 * manifest inspect entity <EntityName>
 *
 * Inspect source manifests and precompiled IR for a single entity.
 */
const inspectProgram = program
  .command('inspect')
  .description('Inspect manifest source and compiled IR surfaces');

inspectProgram
  .command('entity')
  .description('Inspect a single entity across source manifests and precompiled IR')
  .argument('<entityName>', 'Entity name')
  .option('--json', 'JSON output', false)
  .option('--src <pattern>', 'Source manifest glob pattern')
  .option('--ir-root <path...>', 'Compiled IR root directory/directories')
  .action(async (entityName, options = {}) => {
    await inspectEntityCommand(entityName, options);
  });

/**
 * manifest diff source-vs-ir <EntityName>
 */
const diffProgram = program
  .command('diff')
  .description('Diff manifest source surfaces against precompiled IR');

diffProgram
  .command('source-vs-ir')
  .description('Compare source manifest parse output vs precompiled IR for an entity')
  .argument('<entityName>', 'Entity name')
  .option('--json', 'JSON output', false)
  .option('--src <pattern>', 'Source manifest glob pattern')
  .option('--ir-root <path...>', 'Compiled IR root directory/directories')
  .action(async (entityName, options = {}) => {
    await diffSourceVsIRCommand(entityName, options);
  });

/**
 * manifest duplicates
 */
program
  .command('duplicates')
  .description('Summarize duplicate merge reports (*.merge-report.json)')
  .option('--entity <name>', 'Filter duplicate entries by entity name/key')
  .option('--merge-report <pattern>', 'Override merge report glob pattern')
  .option('--json', 'JSON output', false)
  .action(async (options = {}) => {
    await duplicatesCommand(options);
  });

/**
 * manifest runtime-check <EntityName> <command>
 */
program
  .command('runtime-check')
  .description('Correlate route surface, source manifests, and precompiled IR for a command')
  .argument('<entityName>', 'Entity name')
  .argument('<commandName>', 'Command name')
  .option('--route <path>', 'Optional canonical route path to validate (exact match)')
  .option('--json', 'JSON output', false)
  .option('--src <pattern>', 'Source manifest glob pattern')
  .option('--ir-root <path...>', 'Compiled IR root directory/directories')
  .action(async (entityName, commandName, options = {}) => {
    await runtimeCheckCommand(entityName, commandName, options);
  });

/**
 * manifest cache-status
 */
program
  .command('cache-status')
  .description('Show offline cache guidance (precompiled IR timestamps + restart advice)')
  .option('--entity <name>', 'Optional entity context for guidance text')
  .option('--command <name>', 'Optional command context for guidance text')
  .option('--json', 'JSON output', false)
  .option('--ir-root <path...>', 'Compiled IR root directory/directories')
  .action(async (options = {}) => {
    await cacheStatusCommand(options);
  });

/**
 * manifest doctor
 */
program
  .command('doctor')
  .description('Run ranked offline diagnostics for source/IR/route drift and duplicate merges')
  .option('--entity <name>', 'Optional entity to focus the diagnosis')
  .option('--command <name>', 'Optional command to focus the diagnosis')
  .option('--route <path>', 'Optional route path for route-surface correlation')
  .option('--json', 'JSON output', false)
  .option('--src <pattern>', 'Source manifest glob pattern')
  .option('--ir-root <path...>', 'Compiled IR root directory/directories')
  .action(async (options = {}) => {
    await doctorCommand(options);
  });

/**
 * Run the CLI
 *
 * This function is exported so it can be called from the bin file.
 */
export async function runCli(): Promise<void> {
  await program.parseAsync(process.argv);
}

function normalizeForComparison(path: string): string {
  const normalizedPath = normalize(path);
  return process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath;
}

async function resolveRealPath(inputPath: string): Promise<string | undefined> {
  try {
    return await realpath(inputPath);
  } catch {
    return undefined;
  }
}

async function isDirectExecution(): Promise<boolean> {
  const modulePath = await resolveRealPath(fileURLToPath(import.meta.url));
  const argvEntry = process.argv[1];

  if (!modulePath) {
    return false;
  }

  if (argvEntry) {
    const argvResolvedPath = resolve(argvEntry);
    const argvPath = await resolveRealPath(argvResolvedPath);

    if (argvPath) {
      return normalizeForComparison(modulePath) === normalizeForComparison(argvPath);
    }

    // Fallback for shim/symlink bin paths that cannot be resolved.
    const normalizedArgv = normalizeForComparison(argvResolvedPath);
    if (normalizedArgv.includes('manifest') || normalizedArgv.endsWith('index.js')) {
      return true;
    }

    // ESM equivalent of "module is main".
    if (import.meta.url === pathToFileURL(argvResolvedPath).href) {
      return true;
    }
  }

  return false;
}

void isDirectExecution().then((shouldRun) => {
  if (shouldRun) {
    runCli().catch((error) => {
      console.error('CLI error:', error);
      process.exit(1);
    });
  }
});
