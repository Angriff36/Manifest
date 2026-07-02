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
  /**
   * `--check` drift mode: regenerate in memory and compare to the committed
   * files without writing; exit non-zero if any generated file differs.
   * `prettier --check` semantics.
   */
  check?: boolean;
  /**
   * When true, fail by throwing instead of calling process.exit(). Set by the
   * batch driver (generateAllFromConfig) so one projection's failure doesn't
   * abort the whole run — the batch aggregates and exits once.
   */
  throwOnError?: boolean;
}

/** Thrown by generateCommand under --check when files drift (throwOnError mode). */
class DriftError extends Error {
  constructor(public count: number) {
    super(`drift: ${count} file(s)`);
  }
}

// --check drift-mode state. Set once at the top of generateCommand and read in
// writeProjectionResult. A CLI invocation runs a single command, so a
// module-level flag is fine here and avoids threading the option through every
// generation helper signature.
let checkMode = false;
const driftedFiles: string[] = [];

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
    } else if (options.surface === 'companions') {
      // Generate the companion modules (runtime factory, response helpers, ...)
      await generateCompanions(projection, ir, outputDir, spinner, projectionOptions);
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
    // All other projections resolve through the registry. They expose
    // surface-driven generation only, so the CLI walks each surface
    // (globally and per-entity) and writes whatever artifacts come back.
    await generateWithRegistryProjection(ir, options, outputDir, spinner);
  }

  spinner.succeed(`Generated ${options.projection} code from ${path.basename(irFile)}`);
}

/**
 * Generate using any registry-registered projection (prisma, zod, kysely,
 * dynamodb, pydantic, dart, ...). Mirrors the surface-walking strategy of
 * the projection snapshot suite: call each surface once globally, then once
 * per entity, deduplicating artifacts by id and diagnostics by message.
 */
async function generateWithRegistryProjection(
  ir: IR,
  options: GenerateOptions,
  outputDir: string,
  spinner: Ora
): Promise<void> {
  const registry = await import('@angriff36/manifest/projections');
  const projection = registry.getProjection(options.projection);
  if (!projection) {
    const available = registry.getProjectionNames().sort().join(', ');
    throw new Error(`Unknown projection: ${options.projection} (available: ${available})`);
  }

  const projectionOptions: Record<string, unknown> = {
    ...(options.projectionOptionsFromConfig ?? {}),
  };

  // `--surface all` walks every surface; otherwise accept either the full
  // surface id ("kysely.types") or its short suffix ("types").
  const surfaces = options.surface === 'all'
    ? [...projection.surfaces]
    : projection.surfaces.filter(
        (s) => s === options.surface || s.endsWith(`.${options.surface}`)
      );
  if (surfaces.length === 0) {
    throw new Error(
      `Unknown surface: ${options.surface} (projection '${projection.name}' supports: ${projection.surfaces.join(', ')})`
    );
  }

  const seenArtifactIds = new Set<string>();
  for (const surface of surfaces) {
    spinner.text = `Generating ${surface}...`;

    const merged: ProjectionResult = { artifacts: [], diagnostics: [] };
    const collect = (result: ProjectionResult) => {
      for (const artifact of result.artifacts) {
        if (!seenArtifactIds.has(artifact.id)) {
          seenArtifactIds.add(artifact.id);
          merged.artifacts.push(artifact);
        }
      }
      for (const diag of result.diagnostics) {
        if (!merged.diagnostics.some((d) => d.message === diag.message && d.entity === diag.entity)) {
          merged.diagnostics.push(diag);
        }
      }
    };

    collect(projection.generate(ir, { surface, options: projectionOptions }));
    for (const entity of ir.entities ?? []) {
      collect(projection.generate(ir, { surface, entity: entity.name, options: projectionOptions }));
    }

    // The surface walk probes every surface globally and per-entity; scoped
    // surfaces answer the mismatched probes with "requires entity/command"
    // error diagnostics. Those are expected control flow here, so this call
    // site alone opts out of fail-on-error.
    await writeProjectionResult(merged, outputDir, { failOnError: false });
  }
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

  // Companion modules (runtime factory, response helpers, database client,
  // auth/tenant shims) so generated code compiles without hand-written glue.
  // The projection gates on emitCompanions (default true) and skips companions
  // whose configured import path is a package specifier.
  spinner.text = 'Generating companions...';
  await generateCompanions(projection, ir, outputDir, spinner, projectionOptions);

  spinner.text = 'Generating types...';
  await generateTypes(projection, ir, outputDir, spinner, projectionOptions);

  spinner.text = 'Generating client...';
  await generateClient(projection, ir, outputDir, spinner, projectionOptions);
}

/**
 * Generate the Next.js companion modules (runtime factory, response helpers,
 * database client, auth/tenant shims). Single non-entity-scoped surface.
 */
async function generateCompanions(
  projection: NextJsProjection,
  ir: IR,
  outputDir: string,
  spinner: Ora,
  projectionOptions: NextJsProjectionOptions
): Promise<void> {
  spinner.text = 'Generating companions...';
  const result = projection.generate(ir, {
    surface: 'nextjs.companions',
    options: projectionOptions as unknown as Record<string, unknown>,
  });
  await writeProjectionResult(result, outputDir);
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
  outputDir: string,
  opts: { failOnError?: boolean } = {}
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

  // An error diagnostic with nothing produced is a failed generation step,
  // not a warning to scroll past — fail the run instead of exiting 0 with
  // missing artifacts. (The registry surface walk opts out: its probe calls
  // legitimately produce "requires entity" errors.)
  const errors = (result.diagnostics ?? []).filter((d) => d.severity === 'error');
  if (opts.failOnError !== false && errors.length > 0 && result.artifacts.length === 0) {
    throw new Error(errors[0].message);
  }

  // Write each artifact
  for (const artifact of result.artifacts) {
    if (!artifact.pathHint) {
      console.warn(chalk.yellow(`  Artifact "${artifact.id}" has no path hint, skipping`));
      continue;
    }

    // Use pathHint directly (it may include subdirectories).
    //
    // appDir is resolved relative to outputDir. When a config sets both to
    // overlapping paths (e.g. output 'apps/api' + appDir 'apps/api/app/api'),
    // a naive resolve doubles the prefix → 'apps/api/apps/api/app/api'. That is
    // never intended, so strip the overlap and say so rather than write garbage.
    let hint = artifact.pathHint;
    // appDir is resolved relative to outputDir. When config sets both to
    // overlapping paths (e.g. output 'apps/api' + appDir 'apps/api/app/api'),
    // a naive resolve doubles the prefix → 'apps/api/apps/api/app/api'. Detect
    // it cwd-independently: if the hint's leading segments equal the output
    // dir's trailing segments, strip the overlap and say so — never write the
    // doubled path silently.
    const segs = (p: string): string[] => p.split(/[/\\]+/).filter(Boolean);
    const outSegs = segs(outputDir);
    const hintSegs = segs(hint);
    let overlap = Math.min(outSegs.length, hintSegs.length);
    for (; overlap > 0; overlap--) {
      if (outSegs.slice(outSegs.length - overlap).join('/') === hintSegs.slice(0, overlap).join('/')) break;
    }
    if (overlap > 0) {
      const collapsed = hintSegs.slice(overlap).join('/');
      console.warn(
        chalk.yellow(
          `  Note: artifact path '${hint}' duplicates output dir '${hintSegs.slice(0, overlap).join('/')}' — collapsed to '${collapsed}' (appDir is relative to output; drop the output prefix from appDir to silence this).`,
        ),
      );
      hint = collapsed;
    }
    const outputPath = path.resolve(outputDir, hint);

    if (checkMode) {
      // --check: compare generated code to the committed file without writing.
      // A missing file or any byte difference counts as drift.
      const existing = await fs.readFile(outputPath, 'utf-8').catch(() => null);
      if (existing !== artifact.code) {
        driftedFiles.push(path.relative(process.cwd(), outputPath));
      }
      continue;
    }

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

  // --check drift mode: compare generated code to committed files, no writes.
  checkMode = options.check ?? false;
  driftedFiles.length = 0;

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
    if (errorCount > 0) {
      spinner.warn(`Generated from ${successCount} file(s), ${errorCount} failed`);
      if (options.throwOnError) throw new Error(`${errorCount} IR file(s) failed to generate`);
      process.exit(1);
    }

    if (checkMode) {
      if (driftedFiles.length > 0) {
        console.error(chalk.red(`\n  Drift: ${driftedFiles.length} generated file(s) differ from committed:`));
        for (const f of driftedFiles) {
          console.error(chalk.red(`    • ${f}`));
        }
        console.error(chalk.red('  Run `manifest generate` (without --check) and commit the result.'));
        if (options.throwOnError) throw new DriftError(driftedFiles.length);
        process.exit(1);
      }
      spinner.succeed('No drift — generated code matches committed files.');
      return;
    }

    spinner.succeed(`Generated code from ${successCount} IR file(s)`);
  } catch (error: unknown) {
    if (options.throwOnError) throw error;
    spinner.fail(`Generation failed: ${error instanceof Error ? error.message : String(error)}`);
    console.error(error);
    process.exit(1);
  }
}

/**
 * Run every projection declared in manifest.config.yaml, in declaration order,
 * from the compiled IR — the one-command replacement for hand-chained per-
 * projection scripts. Aggregates failures/drift across projections and exits
 * once at the end.
 */
export async function generateAllFromConfig(options: { check?: boolean; irOverride?: string } = {}): Promise<void> {
  const { loadConfig } = await import('../utils/config.js');
  const config = await loadConfig(process.cwd());
  const projections = config?.projections ?? {};
  const names = Object.keys(projections);

  if (names.length === 0) {
    console.warn(chalk.yellow('No projections configured in manifest.config.yaml — nothing to generate.'));
    return;
  }

  // Default IR source is the config `output`. When that is a directory holding
  // many per-file IRs (e.g. merged IR + stale shards), single-file projections
  // (types/client/registries) would be written once per IR with last-write-wins.
  // An explicit IR path (the merged IR from `compile --all`) avoids that.
  const irSource = options.irOverride || config?.output || 'ir/';
  console.log(chalk.bold(`\nGenerating ${names.length} configured projection(s): ${names.join(', ')}`));
  console.log(chalk.gray(`  IR source: ${irSource}`));

  const failures: string[] = [];
  const drifted: string[] = [];

  for (const [name, projection] of Object.entries(projections)) {
    const output = projection?.output;
    if (!output) {
      console.warn(chalk.yellow(`\n→ ${name}: no output path configured — skipped.`));
      continue;
    }
    console.log(chalk.cyan(`\n→ ${name} → ${output}`));
    try {
      await generateCommand(irSource, {
        projection: name,
        surface: 'all',
        output,
        auth: undefined as unknown as string,
        database: undefined as unknown as string,
        runtime: undefined as unknown as string,
        response: undefined as unknown as string,
        projectionOptionsFromConfig: (projection.options ?? {}) as Record<string, unknown>,
        check: options.check,
        throwOnError: true,
      });
    } catch (error: unknown) {
      if (error instanceof DriftError) {
        drifted.push(name);
      } else {
        failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
      console.error(chalk.red(`  ${name} failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  console.log('');
  if (failures.length > 0) {
    console.error(chalk.red(`${failures.length} projection(s) failed:`));
    for (const f of failures) console.error(chalk.red(`  • ${f}`));
    process.exit(1);
  }
  if (drifted.length > 0) {
    console.error(chalk.red(`Drift in ${drifted.length} projection(s): ${drifted.join(', ')}`));
    console.error(chalk.red('  Run `manifest generate --all` (without --check) and commit the result.'));
    process.exit(1);
  }
  console.log(chalk.green(`✔ All ${names.length} projection(s) generated from ${irSource}.`));
}
