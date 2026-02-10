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
// Import from workspace packages (will be resolved at runtime)
// For now, we'll use dynamic imports since we're in ESM mode
let compileToIR;
async function loadCompiler() {
    if (!compileToIR) {
        // Try to import from workspace
        try {
            const module = await import('@manifest/compiler');
            compileToIR = module.compileToIR;
        }
        catch (error) {
            // Fallback to relative import for development
            const module = await import('../../../src/manifest/compiler.js');
            compileToIR = module.compileToIR;
        }
    }
    return compileToIR;
}
/**
 * Get all manifest files from source pattern
 */
async function getSourceFiles(source, globPattern) {
    if (globPattern) {
        const files = await glob(globPattern, { cwd: process.cwd() });
        return files.map(f => path.resolve(process.cwd(), f));
    }
    if (source) {
        const resolved = path.resolve(process.cwd(), source);
        const stat = await fs.stat(resolved).catch(() => null);
        if (stat && stat.isDirectory()) {
            // Directory: find all .manifest files
            const files = await glob('**/*.manifest', { cwd: resolved });
            return files.map(f => path.join(resolved, f));
        }
        return [resolved];
    }
    // No source specified: find all .manifest files in current directory
    const files = await glob('**/*.manifest', {
        cwd: process.cwd(),
        ignore: ['node_modules/**', 'dist/**', '.next/**']
    });
    return files.map(f => path.resolve(process.cwd(), f));
}
/**
 * Compile a single manifest file
 */
async function compileFile(sourceFile, options, spinner) {
    await loadCompiler();
    spinner.text = `Compiling ${path.relative(process.cwd(), sourceFile)}`;
    const source = await fs.readFile(sourceFile, 'utf-8');
    const { ir, diagnostics } = await compileToIR(source);
    // Determine output path
    let outputPath;
    if (options.output.endsWith('.json')) {
        // Direct file output
        outputPath = path.resolve(process.cwd(), options.output);
    }
    else {
        // Directory output
        const basename = path.basename(sourceFile, '.manifest');
        outputPath = path.resolve(process.cwd(), options.output, `${basename}.ir.json`);
    }
    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    // Prepare output
    const output = { ir };
    if (options.diagnostics && diagnostics.length > 0) {
        output.diagnostics = diagnostics;
    }
    // Write IR
    const json = options.pretty
        ? JSON.stringify(output, null, 2)
        : JSON.stringify(output);
    await fs.writeFile(outputPath, json, 'utf-8');
    spinner.succeed(`Compiled ${path.relative(process.cwd(), sourceFile)} → ${path.relative(process.cwd(), outputPath)}`);
    // Show diagnostics if present
    if (diagnostics && diagnostics.length > 0) {
        const hasErrors = diagnostics.some((d) => d.severity === 'error');
        const hasWarnings = diagnostics.some((d) => d.severity === 'warning');
        if (hasErrors) {
            console.error(chalk.red('  Errors:'));
            diagnostics
                .filter((d) => d.severity === 'error')
                .forEach((d) => {
                console.error(chalk.red(`    • ${d.message}`));
            });
        }
        if (hasWarnings) {
            console.warn(chalk.yellow('  Warnings:'));
            diagnostics
                .filter((d) => d.severity === 'warning')
                .forEach((d) => {
                console.warn(chalk.yellow(`    • ${d.message}`));
            });
        }
    }
}
/**
 * Compile command handler
 */
export async function compileCommand(source, options) {
    const spinner = ora('Preparing to compile').start();
    try {
        // Get source files
        const sourceFiles = await getSourceFiles(source, options.glob);
        if (sourceFiles.length === 0) {
            spinner.warn('No .manifest files found');
            console.log('  Create a .manifest file or specify a source with: manifest compile <source>');
            return;
        }
        spinner.info(`Found ${sourceFiles.length} .manifest file(s)`);
        // Compile each file
        let successCount = 0;
        let errorCount = 0;
        for (const sourceFile of sourceFiles) {
            const fileSpinner = ora().start();
            try {
                await compileFile(sourceFile, options, fileSpinner);
                successCount++;
            }
            catch (error) {
                fileSpinner.fail(`Failed to compile ${path.relative(process.cwd(), sourceFile)}: ${error.message}`);
                errorCount++;
            }
        }
        // Summary
        console.log('');
        if (errorCount === 0) {
            spinner.succeed(`Compiled ${successCount} file(s) successfully`);
        }
        else {
            spinner.warn(`Compiled ${successCount} file(s), ${errorCount} failed`);
            process.exit(1);
        }
    }
    catch (error) {
        spinner.fail(`Compilation failed: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}
//# sourceMappingURL=compile.js.map