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
 * Compile command handler
 */
export async function compileCommand(source, options = {}) {
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