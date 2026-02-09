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
import { initCommand } from './commands/init.js';
import { getConfig } from './utils/config.js';

const program = new Command();

program
  .name('manifest')
  .description('Manifest language CLI - Compile, generate, and validate Manifest code')
  .version('0.3.8');

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
  .command('compile [source]')
  .description('Compile .manifest source to IR')
  .argument('[source]', 'Source .manifest file or glob pattern')
  .option('-o, --output <path>', 'Output directory or file path')
  .option('-g, --glob <pattern>', 'Glob pattern for multiple files (use with output directory)')
  .option('-d, --diagnostics', 'Include diagnostics in output', false)
  .option('--pretty', 'Pretty-print JSON output', true)
  .action(async (source, options) => {
    const config = await getConfig();
    if (!options.output && config.output) {
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
  .command('generate <ir>')
  .description('Generate code from IR using a projection')
  .argument('<ir>', 'IR file or directory')
  .option('-p, --projection <name>', 'Projection name (nextjs, ts.types, ts.client)', 'nextjs')
  .option('-s, --surface <name>', 'Projection surface (route, command, types, client, all)', 'all')
  .option('-o, --output <path>', 'Output directory')
  .option('--auth <provider>', 'Auth provider or import path')
  .option('--database <path>', 'Database import path')
  .option('--runtime <path>', 'Runtime import path')
  .option('--response <path>', 'Response helpers import path')
  .action(async (ir, options) => {
    const config = await getConfig();
    const nextJsOptions = config.projections?.nextjs?.options || {};

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
  .command('build [source]')
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
  .action(async (source, options) => {
    const config = await getConfig();
    const nextJsOptions = config.projections?.nextjs?.options || {};

    // Use CLI options, fall back to config, fall back to defaults
    const finalOptions = {
      ...options,
      auth: options.auth || nextJsOptions.authImportPath || nextJsOptions.authProvider || 'clerk',
      database: options.database || nextJsOptions.databaseImportPath || '@/lib/database',
      runtime: options.runtime || nextJsOptions.runtimeImportPath || '@/lib/manifest-runtime',
      response: options.response || nextJsOptions.responseImportPath || '@/lib/manifest-response',
      irOutput: options.irOutput || config.output || 'ir/',
      codeOutput: options.codeOutput || config.projections?.nextjs?.output || 'app/api/',
    };

    await buildCommand(source, finalOptions);
  });

/**
 * manifest validate [ir]
 *
 * Validate IR against schema.
 */
program
  .command('validate [ir]')
  .description('Validate IR against schema')
  .argument('[ir]', 'IR file or glob pattern')
  .option('--schema <path>', 'Schema path (default: docs/spec/ir/ir-v1.schema.json)')
  .option('--strict', 'Fail on warnings', false)
  .action(validateCommand);

/**
 * Run the CLI
 *
 * This function is exported so it can be called from the bin file.
 */
export async function runCli(): Promise<void> {
  await program.parseAsync(process.argv);
}

// Run CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((error) => {
    console.error('CLI error:', error);
    process.exit(1);
  });
}
