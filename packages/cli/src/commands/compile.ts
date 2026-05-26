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

// Import from the main Manifest package
async function loadCompiler() {
  const module = await import('@angriff36/manifest/ir-compiler');
  return {
    compileToIR: module.compileToIR,
    validateCommandIntentRegistry: module.validateCommandIntentRegistry,
  };
}

interface CompileOptions {
  output?: string;
  glob?: string;
  diagnostics?: boolean;
  pretty?: boolean;
}

/**
 * Get all manifest files from source pattern
 */
async function getManifestFiles(source: string, options: CompileOptions): Promise<string[]> {
  if (!source) {
    // Use glob pattern from options or default
    const pattern = options.glob || '**/*.manifest';
    const files = await glob(pattern, { cwd: process.cwd() });
    return files.map(f => path.resolve(process.cwd(), f));
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
  return files.map(f => path.resolve(resolved, f));
}

interface CompileDiagnostic { severity?: string; message?: string; line?: number; column?: number; }

interface CompiledFile {
  filePath: string;
  outputPath: string;
  ir: unknown;
  diagnostics: CompileDiagnostic[];
}

function getOutputPath(filePath: string, options: CompileOptions): string {
  if (options.output) {
    // Existing behavior: an existing output directory gets one IR file per source;
    // otherwise the output is treated as a direct file path.
    return path.resolve(options.output);
  }

  return filePath.replace(/\.manifest$/, '.ir.json');
}

async function resolveOutputPath(filePath: string, options: CompileOptions): Promise<string> {
  if (options.output) {
    const stat = await fs.stat(options.output).catch(() => null);
    if (stat?.isDirectory()) {
      const basename = path.basename(filePath, '.manifest');
      return path.resolve(options.output, `${basename}.ir.json`);
    }
    return getOutputPath(filePath, options);
  }
  return getOutputPath(filePath, options);
}

/**
 * Compile a single manifest file in memory. Writing is intentionally separate so
 * the whole manifest set can be checked for duplicate command intent first.
 */
async function compileFileToIR(
  filePath: string,
  options: CompileOptions,
  spinner: Ora
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

async function writeCompiledFile(compiled: CompiledFile, options: CompileOptions, spinner: Ora): Promise<void> {
  await fs.mkdir(path.dirname(compiled.outputPath), { recursive: true });

  const jsonContent = options.pretty
    ? JSON.stringify(compiled.ir, null, 2)
    : JSON.stringify(compiled.ir);

  await fs.writeFile(compiled.outputPath, jsonContent, 'utf-8');

  spinner.succeed(`Compiled ${path.relative(process.cwd(), compiled.filePath)} → ${path.relative(process.cwd(), compiled.outputPath)}`);
}

function printDiagnostics(diagnostics: CompileDiagnostic[]): void {
  if (diagnostics.length === 0) return;

  console.log('');
  console.log(chalk.bold('Diagnostics:'));
  diagnostics.forEach((d: CompileDiagnostic) => {
    const location = d.line !== undefined ? ` [${d.line}${d.column !== undefined ? `:${d.column}` : ''}]` : '';
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
 * Compile command handler
 */
export async function compileCommand(source: string | undefined, options: CompileOptions = {}): Promise<void> {
  const spinner = ora('Preparing to compile').start();

  try {
    // Get manifest files
    const files = await getManifestFiles(source || '', options);

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

    const allDiagnostics: CompileDiagnostic[] = compiledFiles.flatMap(file => file.diagnostics);
    const compileErrors = allDiagnostics.filter(d => d.severity === 'error');

    const { validateCommandIntentRegistry } = await loadCompiler();
    const registryDiagnostics = validateCommandIntentRegistry(compiledFiles.flatMap(file => {
      const ir = file.ir as { commands?: Array<{ entity?: string; name: string }> } | null;
      return (ir?.commands || []).map(command => ({
        entity: command.entity,
        command: command.name,
        sourcePath: file.filePath,
      }));
    })) as CompileDiagnostic[];

    const allErrors = [...compileErrors, ...registryDiagnostics.filter(d => d.severity === 'error')];
    if (options.diagnostics || allErrors.length > 0) {
      printDiagnostics([...allDiagnostics, ...registryDiagnostics]);
    }

    if (errorCount > 0 || allErrors.length > 0) {
      spinner.warn(`Compiled 0 file(s), ${errorCount + allErrors.length} failed`);
      process.exit(1);
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
  } catch (error: unknown) {
    spinner.fail(`Compilation failed: ${error instanceof Error ? error.message : String(error)}`);
    console.error(error);
    process.exit(1);
  }
}
