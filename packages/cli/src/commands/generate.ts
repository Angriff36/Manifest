/**
 * manifest generate command
 *
 * Generates code from IR using a projection.
 */

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import type { ProjectionResult } from '@manifest/projections';

// Dynamic imports for projections
let NextJsProjection: any;
let loadIR: any;

async function loadDependencies() {
  if (!NextJsProjection) {
    try {
      const projectionModule = await import('@manifest/projections');
      NextJsProjection = projectionModule.NextJsProjection;
    } catch (error) {
      // Fallback to relative import for development
      const projectionModule = await import('../../../src/manifest/projections/nextjs/generator.js');
      NextJsProjection = projectionModule.default;
    }
  }

  if (!loadIR) {
    try {
      const module = await import('@manifest/ir');
      loadIR = module.loadIR;
    } catch (error) {
      // Fallback to reading JSON directly
      loadIR = async (filePath: string) => {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
      };
    }
  }

  return { NextJsProjection, loadIR };
}

interface GenerateOptions {
  projection: string;
  surface: string;
  output: string;
  auth: string;
  database: string;
  runtime: string;
  response: string;
}

/**
 * Get all IR files from input pattern
 */
async function getIRFiles(irInput: string): Promise<string[]> {
  const resolved = path.resolve(process.cwd(), irInput);
  const stat = await fs.stat(resolved).catch(() => null);

  if (!stat) {
    throw new Error(`IR path not found: ${irInput}`);
  }

  if (stat.isFile()) {
    return [resolved];
  }

  // Directory: find all .ir.json files
  const files = await glob('**/*.ir.json', { cwd: resolved });
  return files.map(f => path.join(resolved, f));
}

/**
 * Generate code from a single IR file
 */
async function generateFromIR(
  irFile: string,
  options: GenerateOptions,
  spinner: Ora
): Promise<void> {
  const { NextJsProjection, loadIR } = await loadDependencies();

  spinner.text = `Loading IR from ${path.relative(process.cwd(), irFile)}`;

  // Load IR
  const ir = await loadIR(irFile);

  // Determine output directory
  const outputDir = path.resolve(process.cwd(), options.output);
  await fs.mkdir(outputDir, { recursive: true });

  // Create projection
  spinner.text = `Creating ${options.projection} projection`;

  if (options.projection === 'nextjs') {
    const projectionOptions = {
      authProvider: options.auth as any,
      databaseImportPath: options.database,
      runtimeImportPath: options.runtime,
      responseImportPath: options.response,
      outputPath: outputDir,
    };

    const projection = new NextJsProjection(projectionOptions);

    // Generate based on surface
    if (options.surface === 'all') {
      // Generate all surfaces
      await generateAllSurfaces(projection, ir, outputDir, spinner);
    } else if (options.surface === 'route') {
      // Generate GET routes for all entities
      await generateRoutes(projection, ir, outputDir, spinner);
    } else if (options.surface === 'command') {
      // Generate POST routes for all commands
      await generateCommands(projection, ir, outputDir, spinner);
    } else if (options.surface === 'types') {
      // Generate TypeScript types
      await generateTypes(projection, ir, outputDir, spinner);
    } else if (options.surface === 'client') {
      // Generate client SDK
      await generateClient(projection, ir, outputDir, spinner);
    } else {
      throw new Error(`Unknown surface: ${options.surface}`);
    }
  } else {
    throw new Error(`Unknown projection: ${options.projection} (supported: nextjs)`);
  }

  spinner.succeed(`Generated ${options.projection} code from ${path.basename(irFile)}`);
}

/**
 * Generate all projection surfaces
 */
async function generateAllSurfaces(
  projection: any,
  ir: any,
  outputDir: string,
  spinner: Ora
): Promise<void> {
  spinner.text = 'Generating routes...';
  await generateRoutes(projection, ir, outputDir, spinner);

  spinner.text = 'Generating commands...';
  await generateCommands(projection, ir, outputDir, spinner);

  spinner.text = 'Generating types...';
  await generateTypes(projection, ir, outputDir, spinner);

  spinner.text = 'Generating client...';
  await generateClient(projection, ir, outputDir, spinner);
}

/**
 * Generate GET routes for entities
 */
async function generateRoutes(
  projection: any,
  ir: any,
  outputDir: string,
  spinner: Ora
): Promise<void> {
  const entities = ir.entities || [];

  for (const entity of entities) {
    spinner.text = `Generating route for ${entity.name}...`;

    const result = projection.generateRoute(ir, entity.name);
    await writeProjectionResult(result, outputDir, entity.name, 'route');
  }
}

/**
 * Generate POST routes for commands
 */
async function generateCommands(
  projection: any,
  ir: any,
  outputDir: string,
  spinner: Ora
): Promise<void> {
  const commands = ir.commands || [];

  for (const command of commands) {
    spinner.text = `Generating command route for ${command.name}...`;

    if (command.entity) {
      const result = projection.generateRoute(ir, command.entity, command.name);
      await writeProjectionResult(result, outputDir, command.entity, command.name);
    }
  }
}

/**
 * Generate TypeScript types
 */
async function generateTypes(
  projection: any,
  ir: any,
  outputDir: string,
  spinner: Ora
): Promise<void> {
  spinner.text = 'Generating TypeScript types...';

  const result = projection.generateTypes(ir);
  await writeProjectionResult(result, outputDir, 'types', 'types');
}

/**
 * Generate client SDK
 */
async function generateClient(
  projection: any,
  ir: any,
  outputDir: string,
  spinner: Ora
): Promise<void> {
  spinner.text = 'Generating client SDK...';

  const result = projection.generateClient(ir);
  await writeProjectionResult(result, outputDir, 'client', 'client');
}

/**
 * Write projection result to file
 */
async function writeProjectionResult(
  result: ProjectionResult,
  outputDir: string,
  name: string,
  type: string
): Promise<void> {
  if (!result.filePath) {
    console.warn(chalk.yellow(`  No file path for ${name} ${type}`));
    return;
  }

  const outputPath = path.resolve(outputDir, path.basename(result.filePath));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, result.code, 'utf-8');

  console.log(chalk.gray(`  → ${path.relative(process.cwd(), outputPath)}`));

  // Show diagnostics if any
  if (result.diagnostics && result.diagnostics.length > 0) {
    result.diagnostics.forEach((d: any) => {
      if (d.severity === 'error') {
        console.error(chalk.red(`  Error: ${d.message}`));
      } else if (d.severity === 'warning') {
        console.warn(chalk.yellow(`  Warning: ${d.message}`));
      }
    });
  }
}

/**
 * Generate command handler
 */
export async function generateCommand(
  ir: string,
  options: GenerateOptions
): Promise<void> {
  const spinner = ora('Preparing to generate').start();

  try {
    // Get IR files
    const irFiles = await getIRFiles(ir);

    if (irFiles.length === 0) {
      spinner.warn('No IR files found');
      console.log('  Generate IR first with: manifest compile <source>');
      return;
    }

    spinner.info(`Found ${irFiles.length} IR file(s)`);

    // Generate from each IR file
    let successCount = 0;
    let errorCount = 0;

    for (const irFile of irFiles) {
      const fileSpinner = ora().start();
      try {
        await generateFromIR(irFile, options, fileSpinner);
        successCount++;
      } catch (error: any) {
        fileSpinner.fail(`Failed to generate from ${path.relative(process.cwd(), irFile)}: ${error.message}`);
        errorCount++;
      }
    }

    // Summary
    console.log('');
    if (errorCount === 0) {
      spinner.succeed(`Generated code from ${successCount} IR file(s)`);
    } else {
      spinner.warn(`Generated from ${successCount} file(s), ${errorCount} failed`);
      process.exit(1);
    }
  } catch (error: any) {
    spinner.fail(`Generation failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}
