/**
 * manifest compile command — compiles .manifest sources to IR.
 */

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import type { IR } from '@angriff36/manifest/ir';
import type { ResolvedProvenanceConfig } from '@angriff36/manifest/config';
import { writeTextFile } from '../utils/dry-run-fs.js';

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
  /** Preview IR writes without touching the filesystem. */
  dryRun?: boolean;
  /**
   * Config G8 — skip `hooks.lifecycle.beforeCompile` (used when compileCommand
   * already ran hooks then auto-dispatches into compileMerged).
   */
  skipLifecycleHooks?: boolean;
}

async function resolveCompileGate(options: CompileOptions) {
  const { ValidationGatePolicy, resolveValidationFailOn } =
    await import('../utils/validation-gate-policy.js');
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
  code?: string;
  line?: number;
  column?: number;
}

async function collectValidationRuleDiagnostics(
  ir: IR | null | undefined,
): Promise<CompileDiagnostic[]> {
  if (!ir) return [];
  const { loadAllConfigs } = await import('../utils/config.js');
  const { runValidationRules } = await import('@angriff36/manifest/config');
  const { build } = await loadAllConfigs(process.cwd());
  return runValidationRules(ir, build?.validation?.rules).map((d) => ({
    severity: d.severity,
    message: d.code ? `${d.code}: ${d.message}` : d.message,
    code: d.code,
  }));
}

interface CompiledFile {
  filePath: string;
  outputPath: string;
  ir: IR | null;
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
  const { loadConfig } = await import('../utils/config.js');
  const { resolveProvenanceConfig } = await import('@angriff36/manifest/config');
  const cfg = await loadConfig(process.cwd());
  const provenance = resolveProvenanceConfig(cfg?.provenance);
  const result = await compileToIR(source, {
    sourcePath: filePath,
    naming: cfg?.naming,
    deterministicProvenance: provenance.deterministic,
  });
  const outputPath = await resolveOutputPath(filePath, options);

  return {
    filePath,
    outputPath,
    ir: result.ir,
    diagnostics: result.diagnostics || [],
  };
}

async function writeCompiledFile(
  compiled: CompiledFile,
  options: CompileOptions,
  spinner: Ora,
  provenancePolicy?: ResolvedProvenanceConfig,
): Promise<void> {
  const { stabilizeProvenance, evaluateProvenanceStale } = await import('../utils/provenance-lockfile.js');
  const { computeIRHash } = await loadCompiler();

  // Config G4 — check staleness BEFORE writing output
  if (provenancePolicy?.failIfStale && provenancePolicy.lockfile) {
    const stale = await evaluateProvenanceStale(
      process.cwd(),
      provenancePolicy,
      compiled.ir!.provenance,
    );
    if (stale) {
      spinner.fail(chalk.red(`Provenance check failed: ${stale}`));
      throw new Error(stale);
    }
  }

  await stabilizeProvenance(
    compiled.ir as IR,
    compiled.outputPath,
    computeIRHash,
    provenancePolicy?.deterministic ?? false,
  );

  const jsonContent = options.pretty
    ? JSON.stringify(compiled.ir, null, 2)
    : JSON.stringify(compiled.ir);

  await writeTextFile(compiled.outputPath, jsonContent, { dryRun: options.dryRun });

  const arrow = options.dryRun ? 'would →' : '→';
  spinner.succeed(
    `Compiled ${path.relative(process.cwd(), compiled.filePath)} ${arrow} ${path.relative(process.cwd(), compiled.outputPath)}`,
  );
}

function printDiagnostics(diagnostics: CompileDiagnostic[]): void {
  if (diagnostics.length === 0) return;
  console.log('');
  console.log(chalk.bold('Diagnostics:'));
  for (const d of diagnostics) {
    const location =
      d.line !== undefined ? ` [${d.line}${d.column !== undefined ? `:${d.column}` : ''}]` : '';
    const line = `  ${d.severity === 'error' ? '✖' : d.severity === 'warning' ? '⚠' : 'ℹ'}${location} ${d.message}`;
    if (d.severity === 'error') console.error(chalk.red(line));
    else if (d.severity === 'warning') console.warn(chalk.yellow(line));
    else console.log(chalk.gray(line));
  }
}

async function loadMultiCompiler() {
  const module = await import('@angriff36/manifest/multi-compiler');
  return { compileProjectToIR: module.compileProjectToIR };
}

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
    if (!options.dryRun && !options.skipLifecycleHooks) {
      const { runLifecycleHooksFromCwd } = await import('../utils/lifecycle-hooks.js');
      const hooksRan = await runLifecycleHooksFromCwd('beforeCompile', process.cwd());
      if (hooksRan.length > 0) {
        spinner.info(`Ran ${hooksRan.length} beforeCompile lifecycle hook(s)`);
      }
    }

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
      mergeIntegrity: cfg?.mergeIntegrity,
      provenance: cfg?.provenance,
    });

    // Print diagnostics (+ Config G2 validation.rules)
    const ruleDiags = await collectValidationRuleDiagnostics(result.ir as IR | null);
    const diagnostics = [...(result.diagnostics as CompileDiagnostic[]), ...ruleDiags];
    const errors = diagnostics.filter((d: CompileDiagnostic) => d.severity === 'error');
    const warnings = diagnostics.filter((d: CompileDiagnostic) => d.severity === 'warning');

    if (options.diagnostics || errors.length > 0 || ruleDiags.length > 0) {
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

    const { stabilizeProvenance, finalizeProvenanceLock, evaluateProvenanceStale } =
      await import('../utils/provenance-lockfile.js');
    const { computeIRHash } = await loadCompiler();
    const { resolveProvenanceConfig } = await import('@angriff36/manifest/config');
    const provenancePolicy = resolveProvenanceConfig(cfg?.provenance);

    // Config G4 — check staleness BEFORE writing any output
    const stale = await evaluateProvenanceStale(
      process.cwd(),
      provenancePolicy,
      result.ir!.provenance,
    );
    if (stale) {
      mergeSpinner.fail(chalk.red(`Provenance check failed: ${stale}`));
      process.exit(1);
    }

    await stabilizeProvenance(result.ir as IR, outputPath, computeIRHash, provenancePolicy.deterministic);
    const jsonContent = options.pretty
      ? JSON.stringify(result.ir, null, 2)
      : JSON.stringify(result.ir);
    await writeTextFile(outputPath, jsonContent, { dryRun: options.dryRun });

    const arrow = options.dryRun ? 'would →' : '→';
    mergeSpinner.succeed(
      `Merged ${result.sources.length} file(s) ${arrow} ${path.relative(process.cwd(), outputPath)}`,
    );

    // Config G4 — write lockfile only after IR is successfully written
    await finalizeProvenanceLock(result.ir as IR, { dryRun: options.dryRun, cwd: process.cwd() });

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
  options: Pick<CompileOptions, 'diagnostics' | 'pretty' | 'failOn' | 'dryRun'> = {},
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
    if (!options.dryRun && !options.skipLifecycleHooks) {
      const { runLifecycleHooksFromCwd } = await import('../utils/lifecycle-hooks.js');
      const hooksRan = await runLifecycleHooksFromCwd('beforeCompile', process.cwd());
      if (hooksRan.length > 0) {
        spinner.info(`Ran ${hooksRan.length} beforeCompile lifecycle hook(s)`);
      }
    }

    // Get manifest files
    const files = await getManifestFiles(source || '', options);

    // Multiple sources with a single .json output path would overwrite each
    // other (last file wins). Auto-merge into one IR artifact instead.
    if (files.length > 1 && options.output?.endsWith('.json')) {
      spinner.info(
        `Multiple sources with single JSON output — using merged compilation → ${options.output}`,
      );
      return compileMerged(source, { ...options, merge: true, skipLifecycleHooks: true });
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

    // Config G2 — per-file IR rule registry (additive)
    const ruleDiagnostics: CompileDiagnostic[] = [];
    for (const file of compiledFiles) {
      ruleDiagnostics.push(...(await collectValidationRuleDiagnostics(file.ir)));
    }

    const allErrors = [
      ...compileErrors,
      ...registryDiagnostics.filter((d) => d.severity === 'error'),
      ...ruleDiagnostics.filter((d) => d.severity === 'error'),
    ];
    const combined = [...allDiagnostics, ...registryDiagnostics, ...ruleDiagnostics];
    if (options.diagnostics || allErrors.length > 0 || ruleDiagnostics.length > 0) {
      printDiagnostics(combined);
    }

    const gate = await resolveCompileGate(options);
    const warningCount = combined.filter((d) => d.severity === 'warning').length;

    if (errorCount > 0 || allErrors.length > 0) {
      spinner.warn(`Compiled 0 file(s), ${errorCount + allErrors.length} failed`);
      if (gate.shouldExitNonZero(errorCount + allErrors.length, warningCount)) {
        process.exit(1);
      }
      return;
    }

    // Config G4 — load provenance policy for staleness checks
    const { loadConfig } = await import('../utils/config.js');
    const { resolveProvenanceConfig } = await import('@angriff36/manifest/config');
    const cfg = await loadConfig(process.cwd());
    const provenancePolicy = resolveProvenanceConfig(cfg?.provenance);

    let successCount = 0;
    for (const compiled of compiledFiles) {
      const fileSpinner = ora().start();
      await writeCompiledFile(compiled, options, fileSpinner, provenancePolicy);
      successCount++;
    }

    // Config G4 — lockfile for single-output compiles only (merge path has its own).
    if (successCount === 1) {
      const { finalizeProvenanceLock } = await import('../utils/provenance-lockfile.js');
      await finalizeProvenanceLock(compiledFiles[0]?.ir as IR | null, options);
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
