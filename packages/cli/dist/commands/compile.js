/**
 * manifest compile command
 *
 * Compiles .manifest source files to IR (Intermediate Representation).
 */
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';
import ora from 'ora';
// Import from the main Manifest package
async function loadCompiler() {
    const module = await import('@angriff36/manifest/ir-compiler');
    return {
        compileToIR: module.compileToIR,
        validateCommandIntentRegistry: module.validateCommandIntentRegistry,
    };
}
/**
 * Get all manifest files from source pattern
 */
async function getManifestFiles(source, options) {
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
async function resolveOutputPath(filePath, options) {
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
async function compileFileToIR(filePath, options, spinner) {
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
async function writeCompiledFile(compiled, options, spinner) {
    await fs.mkdir(path.dirname(compiled.outputPath), { recursive: true });
    const jsonContent = options.pretty
        ? JSON.stringify(compiled.ir, null, 2)
        : JSON.stringify(compiled.ir);
    await fs.writeFile(compiled.outputPath, jsonContent, 'utf-8');
    spinner.succeed(`Compiled ${path.relative(process.cwd(), compiled.filePath)} → ${path.relative(process.cwd(), compiled.outputPath)}`);
}
function printDiagnostics(diagnostics) {
    if (diagnostics.length === 0)
        return;
    console.log('');
    console.log(chalk.bold('Diagnostics:'));
    diagnostics.forEach((d) => {
        const location = d.line !== undefined ? ` [${d.line}${d.column !== undefined ? `:${d.column}` : ''}]` : '';
        if (d.severity === 'error') {
            console.error(chalk.red(`  ✖${location} ${d.message}`));
        }
        else if (d.severity === 'warning') {
            console.warn(chalk.yellow(`  ⚠${location} ${d.message}`));
        }
        else {
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
        async readFile(absPath) {
            return fs.readFile(absPath, 'utf-8');
        },
        resolvePath(fromDir, relativePath) {
            return path.resolve(fromDir, relativePath);
        },
        async fileExists(absPath) {
            try {
                await fs.access(absPath);
                return true;
            }
            catch {
                return false;
            }
        },
    };
}
/**
 * Find root manifest files (files not referenced by any other file's `use` declarations).
 * Uses regex extraction to avoid needing to import the full parser.
 */
async function findRootFiles(allFiles) {
    const usedPaths = new Set();
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
    const roots = allFiles.filter(f => !usedPaths.has(f));
    return roots.length > 0 ? roots : allFiles;
}
/**
 * Handle merged compilation (--merge flag)
 */
async function compileMerged(source, options) {
    const spinner = ora('Preparing merged compilation').start();
    try {
        const files = await getManifestFiles(source || '', options);
        if (files.length === 0) {
            spinner.warn('No .manifest files found');
            return;
        }
        spinner.info(`Found ${files.length} file(s) for merged compilation`);
        // Determine entry files
        let entries;
        if (options.entry) {
            const entryList = Array.isArray(options.entry) ? options.entry : [options.entry];
            entries = entryList.map(e => path.resolve(process.cwd(), e));
        }
        else {
            // Auto-detect: root files are those not referenced by any other file
            spinner.text = 'Detecting entry files...';
            entries = await findRootFiles(files);
        }
        spinner.info(`Using ${entries.length} entry file(s)`);
        const { compileProjectToIR } = await loadMultiCompiler();
        const host = createFsHost();
        const basePath = process.cwd();
        const mergeSpinner = ora('Compiling and merging...').start();
        const result = await compileProjectToIR({
            entries,
            host,
            useCache: true,
            basePath,
        });
        // Print diagnostics
        const diagnostics = result.diagnostics;
        const errors = diagnostics.filter((d) => d.severity === 'error');
        const warnings = diagnostics.filter((d) => d.severity === 'warning');
        if (options.diagnostics || errors.length > 0) {
            printDiagnostics(diagnostics);
        }
        if (errors.length > 0 || !result.ir) {
            mergeSpinner.fail(`Merge compilation failed with ${errors.length} error(s)`);
            process.exit(1);
        }
        // Write merged output
        const outputPath = options.output
            ? path.resolve(process.cwd(), options.output.endsWith('.json') ? options.output : path.join(options.output, 'merged.ir.json'))
            : path.resolve(process.cwd(), 'merged.ir.json');
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        const jsonContent = options.pretty
            ? JSON.stringify(result.ir, null, 2)
            : JSON.stringify(result.ir);
        await fs.writeFile(outputPath, jsonContent, 'utf-8');
        mergeSpinner.succeed(`Merged ${result.sources.length} file(s) → ${path.relative(process.cwd(), outputPath)}`);
        if (warnings.length > 0) {
            console.log(chalk.yellow(`  ${warnings.length} warning(s)`));
        }
    }
    catch (error) {
        spinner.fail(`Merge compilation failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}
/**
 * Compile command handler
 */
export async function compileCommand(source, options = {}) {
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
            spinner.info(`Multiple sources with single JSON output — using merged compilation → ${options.output}`);
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
        const compiledFiles = [];
        let errorCount = 0;
        for (const file of files) {
            const fileSpinner = ora().start();
            try {
                const compiled = await compileFileToIR(file, options, fileSpinner);
                compiledFiles.push(compiled);
                fileSpinner.succeed(`Checked ${path.relative(process.cwd(), file)}`);
            }
            catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                fileSpinner.fail(`Failed to compile ${path.relative(process.cwd(), file)}: ${msg}`);
                errorCount++;
            }
        }
        const allDiagnostics = compiledFiles.flatMap(file => file.diagnostics);
        const compileErrors = allDiagnostics.filter(d => d.severity === 'error');
        const { validateCommandIntentRegistry } = await loadCompiler();
        const registryDiagnostics = validateCommandIntentRegistry(compiledFiles.flatMap(file => {
            const ir = file.ir;
            return (ir?.commands || []).map(command => ({
                entity: command.entity,
                command: command.name,
                sourcePath: file.filePath,
            }));
        }));
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
    }
    catch (error) {
        spinner.fail(`Compilation failed: ${error instanceof Error ? error.message : String(error)}`);
        console.error(error);
        process.exit(1);
    }
}
//# sourceMappingURL=compile.js.map