/**
 * manifest compile command
 *
 * Compiles .manifest source files to IR (Intermediate Representation).
 */

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import type { IR } from '@angriff36/manifest/ir';

// Import from the main Manifest package
async function loadCompiler() {
  const module = await import('@angriff36/manifest/ir-compiler');
  return {
    compileToIR: module.compileToIR,
    validateCommandIntentRegistry: module.validateCommandIntentRegistry,
    computeIRHash: module.computeIRHash,
  };
}

interface CompileOptions {
  output?: string;
  glob?: string;
  diagnostics?: boolean;
  pretty?: boolean;
  merge?: boolean;
  entry?: string | string[];
  /** Config G2 / CLI — overrides config `validation.failOn`. */
  failOn?: string;
}

async function resolveCompileGate(options: CompileOptions) {
  const { ValidationGatePolicy, resolveValidationFailOn } = await import(
    '../utils/validation-gate-policy.js'
  );
  let configFailOn: unknown;
  try {
    const { loadAllConfigs } = await import('../utils/config.js');
    const { build } = await loadAllConfigs(process.cwd());
    configFailOn = build.validation?.failOn;
  } catch {
    // no config file — defaults apply
  }
  return new ValidationGatePolicy(resolveValidationFailOn(options.failOn, configFailOn));
}

/**
 * Get all manifest files from source pattern
 */
async function getManifestFiles(source: string, options: CompileOptions): Promise<string[]> {
  if (!source) {
    // Use glob pattern from options or default
    const pattern = options.glob || '**/*.manifest';
    const files = await glob(pattern, { cwd: process.cwd() });
    return files.map((f) => path.resolve(process.cwd(), f));
  }

  const resolved = path.resolve(process.cwd(), source);
  const stat = await fs.stat(resolved).catch(() => null);

  if (!stat) {
    throw new Error(`Source not found: ${source}`);
  }

  if (stat.isFile()) {
    return [resolved];
  }

  // Directory: glob inside the resolved directory (not project cwd)
  const pattern = options.glob || '**/*.manifest';
  const files = await glob(pattern, { cwd: resolved });
  return files.map((f) => path.resolve(resolved, f));
}

interface CompileDiagnostic {
  severity?: string;
  message?: string;
  line?: number;
  column?: number;
}

interface CompiledFile {
  filePath: string;
  outputPath: string;
  ir: unknown;
  diagnostics: CompileDiagnostic[];
}

async function resolveOutputPath(filePath: string, options: CompileOptions): Promise<string> {
  if (options.output) {
    // First check if output looks like a filename (ends with .json)
    if (options.output.endsWith('.json')) {
      // Explicitly a file - use as-is
      return path.resolve(options.output);
    }

    // Otherwise, treat as directory path. Create parent dirs if needed.
    const stat = await fs.stat(options.output).catch(() => null);
    if (stat?.isDirectory() || !stat) {
      // Either exists and is a directory, or doesn't exist (will be created as dir)
      // In both cases, create one IR file per source file
      const basename = path.basename(filePath, '.manifest');
      return path.resolve(options.output, `${basename}.ir.json`);
    }
    // If stat exists but is NOT a directory (is a file), treat output as file path
    return path.resolve(options.output);
  }
  return filePath.replace(/\.manifest$/, '.ir.json');
}

/**
 * Compile a single manifest file in memory. Writing is intentionally separate so
 * the whole manifest set can be checked for duplicate command intent first.
 */
async function compileFileToIR(
  filePath: string,
  options: CompileOptions,
  spinner: Ora,
): Promise<CompiledFile> {
  const { compileToIR } = await loadCompiler();

  spinner.text = `Compiling ${path.relative(process.cwd(), filePath)}`;

  const source = await fs.readFile(filePath, 'utf-8');
  const result = await compileToIR(source, { sourcePath: filePath });
  const outputPath = await resolveOutputPath(filePath, options);

  return {
    filePath,
    outputPath,
    ir: result.ir,
    diagnostics: result.diagnostics || [],
  };
}

/**
 * Idempotent provenance: if an existing output IR was produced from the SAME
 * source (identical contentHash), reuse its compiledAt and recompute irHash so
 * that re-running `manifest compile` on unchanged source is byte-identical
 * (zero git drift). A fresh timestamp only lands when the source actually
 * changed. compiledAt is part of the irHash input, so irHash is recomputed
 * against the reused timestamp to stay consistent.
 */
async function stabilizeProvenance(ir: IR, outputPath: string): Promise<void> {
  const priorRaw = await fs.readFile(outputPath, 'utf-8').catch(() => null);
  if (!priorRaw) return;
  let prior: { provenance?: { contentHash?: string; compiledAt?: string } };
  try {
    prior = JSON.parse(priorRaw);
  } catch {
    return;
  }
  if (
    ir.provenance?.contentHash &&
    prior.provenance?.contentHash === ir.provenance.contentHash &&
    prior.provenance?.compiledAt
  ) {
    ir.provenance.compiledAt = prior.provenance.compiledAt;
    const { computeIRHash } = await loadCompiler();
    ir.provenance.irHash = await computeIRHash(ir);
  }
}

async function writeCompiledFile(
  compiled: CompiledFile,
  options: CompileOptions,
  spinner: Ora,
): Promise<void> {
  await fs.mkdir(path.dirname(compiled.outputPath), { recursive: true });

  await stabilizeProvenance(compiled.ir as IR, compiled.outputPath);

  const jsonContent = options.pretty
    ? JSON.stringify(compiled.ir, null, 2)
    : JSON.stringify(compiled.ir);

  await fs.writeFile(compiled.outputPath, jsonContent, 'utf-8');

  spinner.succeed(
    `Compiled ${path.relative(process.cwd(), compiled.filePath)} → ${path.relative(process.cwd(), compiled.outputPath)}`,
  );
}

function printDiagnostics(diagnostics: CompileDiagnostic[]): void {
  if (diagnostics.length === 0) return;

  console.log('');
  console.log(chalk.bold('Diagnostics:'));
  diagnostics.forEach((d: CompileDiagnostic) => {
    const location =
      d.line !== undefined ? ` [${d.line}${d.column !== undefined ? `:${d.column}` : ''}]` : '';
    if (d.severity === 'error') {
      console.error(chalk.red(`  ✖${location} ${d.message}`));
    } else if (d.severity === 'warning') {
      console.warn(chalk.yellow(`  ⚠${location} ${d.message}`));
    } else {
      console.log(chalk.gray(`  ℹ${location} ${d.message}`));
    }
  });
}

/**
 * Load the multi-compiler for merged compilation
 */
async function loadMultiCompiler() {
  const module = await import('@angriff36/manifest/multi-compiler');
  return { compileProjectToIR: module.compileProjectToIR };
}

/**
 * Create a ResolverHost backed by the real filesystem
 */
function createFsHost() {
  return {
    async readFile(absPath: string): Promise<string> {
      return fs.readFile(absPath, 'utf-8');
    },
    resolvePath(fromDir: string, relativePath: string): string {
      return path.resolve(fromDir, relativePath);
    },
    async fileExists(absPath: string): Promise<boolean> {
      try {
        await fs.access(absPath);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Find root manifest files (files not referenced by any other file's `use` declarations).
 * Uses regex extraction to avoid needing to import the full parser.
 */
async function findRootFiles(allFiles: string[]): Promise<string[]> {
  const usedPaths = new Set<string>();
  const useRegex = /^\s*use\s+"([^"]+)"/gm;

  for (const file of allFiles) {
    const source = await fs.readFile(file, 'utf-8');
    let match;
    while ((match = useRegex.exec(source)) !== null) {
      const usePath = match[1];
      const dir = path.dirname(file);
      const resolved = path.resolve(dir, usePath);
      usedPaths.add(resolved);
    }
    useRegex.lastIndex = 0; // reset for next file
  }

  const roots = allFiles.filter((f) => !usedPaths.has(f));
  return roots.length > 0 ? roots : allFiles;
}

/**
 * Handle merged compilation (--merge flag)
 */
async function compileMerged(source: string | undefined, options: CompileOptions): Promise<void> {
  const spinner = ora('Preparing merged compilation').start();

  try {
    const files = await getManifestFiles(source || '', options);

    if (files.length === 0) {
      spinner.warn('No .manifest files found');
      return;
    }

    spinner.info(`Found ${files.length} file(s) for merged compilation`);

    // Determine entry files
    let entries: string[];
    if (options.entry) {
      const entryList = Array.isArray(options.entry) ? options.entry : [options.entry];
      entries = entryList.map((e) => path.resolve(process.cwd(), e));
    } else {
      // Auto-detect: root files are those not referenced by any other file
      spinner.text = 'Detecting entry files...';
      entries = await findRootFiles(files);
    }

    spinner.info(`Using ${entries.length} entry file(s)`);

    const { compileProjectToIR } = await loadMultiCompiler();
    const host = createFsHost();
    const basePath = process.cwd();

    const { loadConfig } = await import('../utils/config.js');
    const cfg = await loadConfig(basePath);

    const mergeSpinner = ora('Compiling and merging...').start();
    const result = await compileProjectToIR({
      entries,
      host,
      useCache: true,
      basePath,
      naming: cfg?.naming,
    });

    // Print diagnostics
    const diagnostics = result.diagnostics as CompileDiagnostic[];
    const errors = diagnostics.filter((d: CompileDiagnostic) => d.severity === 'error');
    const warnings = diagnostics.filter((d: CompileDiagnostic) => d.severity === 'warning');

    if (options.diagnostics || errors.length > 0) {
      printDiagnostics(diagnostics);
    }

    const gate = await resolveCompileGate(options);

    if (errors.length > 0 || !result.ir) {
      mergeSpinner.fail(`Merge compilation failed with ${errors.length} error(s)`);
      if (gate.shouldExitNonZero(errors.length, warnings.length)) {
        process.exit(1);
      }
      return;
    }

    // Write merged output
    const outputPath = options.output
      ? path.resolve(
          process.cwd(),
          options.output.endsWith('.json')
            ? options.output
            : path.join(options.output, 'merged.ir.json'),
        )
      : path.resolve(process.cwd(), 'merged.ir.json');

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await stabilizeProvenance(result.ir as IR, outputPath);
    const jsonContent = options.pretty
      ? JSON.stringify(result.ir, null, 2)
      : JSON.stringify(result.ir);
    await fs.writeFile(outputPath, jsonContent, 'utf-8');

    mergeSpinner.succeed(
      `Merged ${result.sources.length} file(s) → ${path.relative(process.cwd(), outputPath)}`,
    );

    if (warnings.length > 0) {
      console.log(chalk.yellow(`  ${warnings.length} warning(s)`));
    }

    if (gate.shouldExitNonZero(0, warnings.length)) {
      process.exit(1);
    }
  } catch (error: unknown) {
    spinner.fail(
      `Merge compilation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

/**
 * Config-driven merged compile — the symmetric partner to `generate --all`.
 *
 * Reads `manifest.config.yaml` (`src` glob + `output`) and produces ONE merged
 * IR, resolving `use` imports across files (e.g. a shared `_base.manifest` that
 * declares the tenant, roles, and mixin source entities). The per-file default
 * mode compiles each file in isolation, so any file that does
 * `use "../_base.manifest"` + `mixin TenantScoped` fails with "mixes unknown
 * entity"; this drives the merge path the project actually needs.
 *
 * `src` is typically a glob ("manifest/source/**\/*.manifest"), so it is fed
 * through the --glob channel. `output` may be a file (the merged IR path) or a
 * directory (writes `<output>/merged.ir.json`).
 */
export async function compileAllFromConfig(
  options: Pick<CompileOptions, 'diagnostics' | 'pretty' | 'failOn'> = {},
): Promise<void> {
  const { getConfig } = await import('../utils/config.js');
  const config = await getConfig(process.cwd());
  const src = config.src || '**/*.manifest';
  const output = config.output || 'ir/';
  await compileMerged('', { ...options, merge: true, glob: src, output });
}

/**
 * Compile command handler
 */
export async function compileCommand(
  source: string | undefined,
  options: CompileOptions = {},
): Promise<void> {
  // Dispatch to merge mode if --merge flag is set
  if (options.merge) {
    return compileMerged(source, options);
  }

  const spinner = ora('Preparing to compile').start();

  try {
    // Get manifest files
    const files = await getManifestFiles(source || '', options);

    // Multiple sources with a single .json output path would overwrite each
    // other (last file wins). Auto-merge into one IR artifact instead.
    if (files.length > 1 && options.output?.endsWith('.json')) {
      spinner.info(
        `Multiple sources with single JSON output — using merged compilation → ${options.output}`,
      );
      return compileMerged(source, { ...options, merge: true });
    }

    if (files.length === 0) {
      spinner.warn('No .manifest files found');
      console.log('  Create a .manifest file or specify a source pattern');
      return;
    }

    spinner.info(`Found ${files.length} file(s)`);

    // Compile every file in memory first. No IR is written until the whole
    // manifest set passes semantic checks.
    const compiledFiles: CompiledFile[] = [];
    let errorCount = 0;

    for (const file of files) {
      const fileSpinner = ora().start();
      try {
        const compiled = await compileFileToIR(file, options, fileSpinner);
        compiledFiles.push(compiled);
        fileSpinner.succeed(`Checked ${path.relative(process.cwd(), file)}`);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        fileSpinner.fail(`Failed to compile ${path.relative(process.cwd(), file)}: ${msg}`);
        errorCount++;
      }
    }

    const allDiagnostics: CompileDiagnostic[] = compiledFiles.flatMap((file) => file.diagnostics);
    const compileErrors = allDiagnostics.filter((d) => d.severity === 'error');

    const { validateCommandIntentRegistry } = await loadCompiler();
    const registryDiagnostics = validateCommandIntentRegistry(
      compiledFiles.flatMap((file) => {
        const ir = file.ir as { commands?: Array<{ entity?: string; name: string }> } | null;
        return (ir?.commands || []).map((command) => ({
          entity: command.entity,
          command: command.name,
          sourcePath: file.filePath,
        }));
      }),
    ) as CompileDiagnostic[];

    const allErrors = [
      ...compileErrors,
      ...registryDiagnostics.filter((d) => d.severity === 'error'),
    ];
    if (options.diagnostics || allErrors.length > 0) {
      printDiagnostics([...allDiagnostics, ...registryDiagnostics]);
    }

    const gate = await resolveCompileGate(options);
    const warningCount = allDiagnostics.filter((d) => d.severity === 'warning').length;

    if (errorCount > 0 || allErrors.length > 0) {
      spinner.warn(`Compiled 0 file(s), ${errorCount + allErrors.length} failed`);
      if (gate.shouldExitNonZero(errorCount + allErrors.length, warningCount)) {
        process.exit(1);
      }
      return;
    }

    let successCount = 0;
    for (const compiled of compiledFiles) {
      const fileSpinner = ora().start();
      await writeCompiledFile(compiled, options, fileSpinner);
      successCount++;
    }

    // Summary
    console.log('');
    spinner.succeed(`Compiled ${successCount} file(s)`);
    if (gate.shouldExitNonZero(0, warningCount)) {
      process.exit(1);
    }
  } catch (error: unknown) {
    spinner.fail(`Compilation failed: ${error instanceof Error ? error.message : String(error)}`);
    console.error(error);
    process.exit(1);
  }
}
