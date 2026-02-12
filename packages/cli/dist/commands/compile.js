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
    const module = await import('@manifest/runtime/ir-compiler');
    return module.compileToIR;
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
    // Directory: use glob pattern
    const pattern = options.glob || path.join(source, '**/*.manifest');
    const files = await glob(pattern, { cwd: process.cwd() });
    return files.map(f => path.resolve(process.cwd(), f));
}
/**
 * Compile a single manifest file
 */
async function compileFile(filePath, options, spinner) {
    const compileToIR = await loadCompiler();
    spinner.text = `Compiling ${path.relative(process.cwd(), filePath)}`;
    // Read source
    const source = await fs.readFile(filePath, 'utf-8');
    // Compile to IR
    const result = await compileToIR(source);
    // Determine output path
    let outputPath;
    if (options.output) {
        const stat = await fs.stat(options.output).catch(() => null);
        if (stat?.isDirectory()) {
            // Output to directory with same name
            const basename = path.basename(filePath, '.manifest');
            outputPath = path.resolve(options.output, `${basename}.ir.json`);
        }
        else {
            // Direct file output
            outputPath = path.resolve(options.output);
        }
    }
    else {
        // Default: same name, .ir.json extension
        outputPath = filePath.replace(/\.manifest$/, '.ir.json');
    }
    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    // Write IR
    const jsonContent = options.pretty
        ? JSON.stringify(result.ir, null, 2)
        : JSON.stringify(result.ir);
    await fs.writeFile(outputPath, jsonContent, 'utf-8');
    // Show diagnostics if requested
    if (options.diagnostics && result.diagnostics && result.diagnostics.length > 0) {
        console.log('');
        console.log(chalk.bold('Diagnostics:'));
        result.diagnostics.forEach((d) => {
            if (d.severity === 'error') {
                console.error(chalk.red(`  ✖ ${d.message}`));
            }
            else if (d.severity === 'warning') {
                console.warn(chalk.yellow(`  ⚠ ${d.message}`));
            }
            else {
                console.log(chalk.gray(`  ℹ ${d.message}`));
            }
        });
    }
    spinner.succeed(`Compiled ${path.relative(process.cwd(), filePath)} → ${path.relative(process.cwd(), outputPath)}`);
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
        // Compile each file
        let successCount = 0;
        let errorCount = 0;
        for (const file of files) {
            const fileSpinner = ora().start();
            try {
                await compileFile(file, options, fileSpinner);
                successCount++;
            }
            catch (error) {
                fileSpinner.fail(`Failed to compile ${path.relative(process.cwd(), file)}: ${error.message}`);
                errorCount++;
            }
        }
        // Summary
        console.log('');
        if (errorCount === 0) {
            spinner.succeed(`Compiled ${successCount} file(s)`);
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