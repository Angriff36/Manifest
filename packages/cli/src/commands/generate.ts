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
import type {
  NextJsProjection,
  ProjectionResult,
  ProjectionDiagnostic,
  NextJsProjectionOptions,
} from '@angriff36/manifest/projections/nextjs';
import type { IR } from '@angriff36/manifest/ir';

// Import from the main Manifest package
async function loadDependencies() {
  const projectionModule = await import('@angriff36/manifest/projections/nextjs');
  const NextJsProjection = projectionModule.NextJsProjection;

  // IR is just JSON, load it directly
  const loadIR = async (filePath: string) => {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  };

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
  /**
   * Pre-resolved projection options sourced from manifest.config.{yaml,ts}.
   * The CLI layer in index.ts merges these with --auth/--database/etc.
   * flag overrides before invoking generateCommand.
   *
   * Keeping this generic (`Record<string, unknown>`) means we never have
   * to update GenerateOptions when new projection-level config keys land
   * — the projection's normalizeOptions is the contract.
   */
  projectionOptionsFromConfig?: Record<string, unknown>;
}

// Local type aliases: use the real projection types from the main
// package. The CLI is a thin wrapper — `projection.generate(ir, request)`
// returns the canonical ProjectionResult.

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
    // Full projection options = user config (incl. dispatcher.*, concreteCommandRoutes.*)
    // overlaid with CLI flag overrides (--auth, --database, --runtime, --response).
    // Unset keys fall through to NEXTJS_DEFAULTS inside the projection.
    const projectionOptions: Record<string, unknown> = {
      ...(options.projectionOptionsFromConfig ?? {}),
      // CLI flags win when explicitly provided. The CLI layer in index.ts
      // already substitutes config values for missing flags, so any value
      // arriving here represents an active intent.
      ...(options.auth !== undefined ? { authProvider: options.auth as unknown } : {}),
      ...(options.database !== undefined ? { databaseImportPath: options.database } : {}),
      ...(options.runtime !== undefined ? { runtimeImportPath: options.runtime } : {}),
      ...(options.response !== undefined ? { responseImportPath: options.response } : {}),
    };

    const projection = new NextJsProjection();

    // Generate based on surface
    if (options.surface === 'all') {
      // Generate all surfaces (including the canonical dispatcher)
      await generateAllSurfaces(projection, ir, outputDir, spinner, projectionOptions);
    } else if (options.surface === 'route') {
      // Generate GET routes for all entities
      await generateRoutes(projection, ir, outputDir, spinner, projectionOptions);
    } else if (options.surface === 'command') {
      // Generate POST routes for all commands
      await generateCommands(projection, ir, outputDir, spinner, projectionOptions);
    } else if (options.surface === 'dispatcher') {
      // Generate the canonical dispatcher route
      await generateDispatcher(projection, ir, outputDir, spinner, projectionOptions);
    } else if (options.surface === 'types') {
      // Generate TypeScript types
      await generateTypes(projection, ir, outputDir, spinner, projectionOptions);
    } else if (options.surface === 'client') {
      // Generate client SDK
      await generateClient(projection, ir, outputDir, spinner, projectionOptions);
    } else {
      throw new Error(`Unknown surface: ${options.surface}`);
    }
  } else {
    throw new Error(`Unknown projection: ${options.projection} (supported: nextjs)`);
  }

  spinner.succeed(`Generated ${options.projection} code from ${path.basename(irFile)}`);
}

/**
 * Generate all projection surfaces.
 *
 * The dispatcher is the canonical write surface and is always emitted
 * (unless `dispatcher.enabled: false`). Per-command concrete routes are
 * **opt-in** (`concreteCommandRoutes.enabled: true`) — by default
 * `--surface all` does NOT emit them, per the goal of dispatcher-only
 * canonical writes. Read routes respect `readRoutes.enabled`.
 *
 * The projection itself returns info-diagnostics when these gates are
 * closed, but skipping at the CLI layer avoids spamming the spinner with
 * "skipped" lines for every entity/command.
 */
async function generateAllSurfaces(
  projection: NextJsProjection,
  ir: IR,
  outputDir: string,
  spinner: Ora,
  projectionOptions: NextJsProjectionOptions
): Promise<void> {
  const readRoutesEnabled = projectionOptions?.readRoutes?.enabled !== false; // default true
  const dispatcherEnabled = projectionOptions?.dispatcher?.enabled !== false; // default true
  const concreteCommandsEnabled = projectionOptions?.concreteCommandRoutes?.enabled === true; // default false (opt-in)

  if (readRoutesEnabled) {
    spinner.text = 'Generating routes...';
    await generateRoutes(projection, ir, outputDir, spinner, projectionOptions);
  } else {
    spinner.info('Skipping read routes (readRoutes.enabled: false)');
  }

  if (concreteCommandsEnabled) {
    spinner.text = 'Generating concrete command routes (opt-in)...';
    await generateCommands(projection, ir, outputDir, spinner, projectionOptions);
  } else {
    spinner.info('Skipping concrete per-command routes (concreteCommandRoutes.enabled: false — dispatcher is canonical)');
  }

  if (dispatcherEnabled) {
    spinner.text = 'Generating dispatcher...';
    await generateDispatcher(projection, ir, outputDir, spinner, projectionOptions);
  } else {
    spinner.info('Skipping dispatcher (dispatcher.enabled: false)');
  }

  spinner.text = 'Generating types...';
  await generateTypes(projection, ir, outputDir, spinner, projectionOptions);

  spinner.text = 'Generating client...';
  await generateClient(projection, ir, outputDir, spinner, projectionOptions);
}

/**
 * Generate the canonical Manifest dispatcher route. Single artifact at
 * `<appDir>/manifest/[entity]/commands/[command]/route.ts`.
 */
async function generateDispatcher(
  projection: NextJsProjection,
  ir: IR,
  outputDir: string,
  spinner: Ora,
  projectionOptions: NextJsProjectionOptions
): Promise<void> {
  spinner.text = 'Generating dispatcher...';
  const result = projection.generate(ir, {
    surface: 'nextjs.dispatcher',
    options: projectionOptions as unknown as Record<string, unknown>,
  });
  await writeProjectionResult(result, outputDir);
}

/**
 * Generate GET routes for entities
 */
async function generateRoutes(
  projection: NextJsProjection,
  ir: IR,
  outputDir: string,
  spinner: Ora,
  projectionOptions: NextJsProjectionOptions
): Promise<void> {
  const entities = ir.entities || [];

  for (const entity of entities) {
    spinner.text = `Generating route for ${entity.name}...`;

    const result = projection.generate(ir, {
      surface: 'nextjs.route',
      entity: entity.name,
      options: projectionOptions as unknown as Record<string, unknown>,
    });
    await writeProjectionResult(result, outputDir);
  }
}

/**
 * Generate POST routes for commands
 */
async function generateCommands(
  projection: NextJsProjection,
  ir: IR,
  outputDir: string,
  spinner: Ora,
  projectionOptions: NextJsProjectionOptions
): Promise<void> {
  const commands = ir.commands || [];

  for (const command of commands) {
    spinner.text = `Generating command route for ${command.name}...`;

    if (command.entity) {
      const result = projection.generate(ir, {
        surface: 'nextjs.command',
        entity: command.entity,
        command: command.name,
        options: projectionOptions as unknown as Record<string, unknown>,
      });
      await writeProjectionResult(result, outputDir);
    }
  }
}

/**
 * Generate TypeScript types
 */
async function generateTypes(
  projection: NextJsProjection,
  ir: IR,
  outputDir: string,
  spinner: Ora,
  projectionOptions: NextJsProjectionOptions
): Promise<void> {
  spinner.text = 'Generating TypeScript types...';

  const result = projection.generate(ir, {
    surface: 'ts.types',
    options: projectionOptions as unknown as Record<string, unknown>,
  });
  await writeProjectionResult(result, outputDir);
}

/**
 * Generate client SDK
 */
async function generateClient(
  projection: NextJsProjection,
  ir: IR,
  outputDir: string,
  spinner: Ora,
  projectionOptions: NextJsProjectionOptions
): Promise<void> {
  spinner.text = 'Generating client SDK...';

  const result = projection.generate(ir, {
    surface: 'ts.client',
    options: projectionOptions as unknown as Record<string, unknown>,
  });
  await writeProjectionResult(result, outputDir);
}

/**
 * Write projection result to file(s)
 */
async function writeProjectionResult(
  result: ProjectionResult,
  outputDir: string
): Promise<void> {
  // Show diagnostics first (if any errors, we might still write files)
  if (result.diagnostics && result.diagnostics.length > 0) {
    result.diagnostics.forEach((d: ProjectionDiagnostic) => {
      if (d.severity === 'error') {
        console.error(chalk.red(`  Error: ${d.message}`));
      } else if (d.severity === 'warning') {
        console.warn(chalk.yellow(`  Warning: ${d.message}`));
      } else {
        console.log(chalk.gray(`  Info: ${d.message}`));
      }
    });
  }

  // Write each artifact
  for (const artifact of result.artifacts) {
    if (!artifact.pathHint) {
      console.warn(chalk.yellow(`  Artifact "${artifact.id}" has no path hint, skipping`));
      continue;
    }

    // Use pathHint directly (it may include subdirectories)
    const outputPath = path.resolve(outputDir, artifact.pathHint);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, artifact.code, 'utf-8');

    console.log(chalk.gray(`  → ${path.relative(process.cwd(), outputPath)}`));
  }

  if (result.artifacts.length === 0 && result.diagnostics.length === 0) {
    console.warn(chalk.yellow(`  No artifacts generated`));
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
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        fileSpinner.fail(`Failed to generate from ${path.relative(process.cwd(), irFile)}: ${msg}`);
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
  } catch (error: unknown) {
    spinner.fail(`Generation failed: ${error instanceof Error ? error.message : String(error)}`);
    console.error(error);
    process.exit(1);
  }
}
