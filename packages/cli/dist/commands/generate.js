/**
 * manifest generate command
 *
 * Generates code from IR using a projection.
 */
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';
import ora from 'ora';
// Dynamic imports for projections
let NextJsProjection;
let loadIR;
async function loadDependencies() {
    if (!NextJsProjection) {
        try {
            const projectionModule = await import('@manifest/projections');
            NextJsProjection = projectionModule.NextJsProjection;
        }
        catch (error) {
            // Fallback to relative import for development
            const projectionModule = await import('../../../src/manifest/projections/nextjs/generator.js');
            NextJsProjection = projectionModule.default;
        }
    }
    if (!loadIR) {
        try {
            const module = await import('@manifest/ir');
            loadIR = module.loadIR;
        }
        catch (error) {
            // Fallback to reading JSON directly
            loadIR = async (filePath) => {
                const content = await fs.readFile(filePath, 'utf-8');
                return JSON.parse(content);
            };
        }
    }
    return { NextJsProjection, loadIR };
}
/**
 * Get all IR files from input pattern
 */
async function getIRFiles(irInput) {
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
async function generateFromIR(irFile, options, spinner) {
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
            authProvider: options.auth,
            databaseImportPath: options.database,
            runtimeImportPath: options.runtime,
            responseImportPath: options.response,
        };
        const projection = new NextJsProjection(projectionOptions);
        // Generate based on surface
        if (options.surface === 'all') {
            // Generate all surfaces
            await generateAllSurfaces(projection, ir, outputDir, spinner);
        }
        else if (options.surface === 'route') {
            // Generate GET routes for all entities
            await generateRoutes(projection, ir, outputDir, spinner);
        }
        else if (options.surface === 'command') {
            // Generate POST routes for all commands
            await generateCommands(projection, ir, outputDir, spinner);
        }
        else if (options.surface === 'types') {
            // Generate TypeScript types
            await generateTypes(projection, ir, outputDir, spinner);
        }
        else if (options.surface === 'client') {
            // Generate client SDK
            await generateClient(projection, ir, outputDir, spinner);
        }
        else {
            throw new Error(`Unknown surface: ${options.surface}`);
        }
    }
    else {
        throw new Error(`Unknown projection: ${options.projection} (supported: nextjs)`);
    }
    spinner.succeed(`Generated ${options.projection} code from ${path.basename(irFile)}`);
}
/**
 * Generate all projection surfaces
 */
async function generateAllSurfaces(projection, ir, outputDir, spinner) {
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
async function generateRoutes(projection, ir, outputDir, spinner) {
    const entities = ir.entities || [];
    for (const entity of entities) {
        spinner.text = `Generating route for ${entity.name}...`;
        const result = projection.generate(ir, {
            surface: 'nextjs.route',
            entity: entity.name,
        });
        await writeProjectionResult(result, outputDir);
    }
}
/**
 * Generate POST routes for commands
 */
async function generateCommands(projection, ir, outputDir, spinner) {
    const commands = ir.commands || [];
    for (const command of commands) {
        spinner.text = `Generating command route for ${command.name}...`;
        if (command.entity) {
            const result = projection.generate(ir, {
                surface: 'nextjs.command',
                entity: command.entity,
                command: command.name,
            });
            await writeProjectionResult(result, outputDir);
        }
    }
}
/**
 * Generate TypeScript types
 */
async function generateTypes(projection, ir, outputDir, spinner) {
    spinner.text = 'Generating TypeScript types...';
    const result = projection.generate(ir, {
        surface: 'ts.types',
    });
    await writeProjectionResult(result, outputDir);
}
/**
 * Generate client SDK
 */
async function generateClient(projection, ir, outputDir, spinner) {
    spinner.text = 'Generating client SDK...';
    const result = projection.generate(ir, {
        surface: 'ts.client',
    });
    await writeProjectionResult(result, outputDir);
}
/**
 * Write projection result to file(s)
 */
async function writeProjectionResult(result, outputDir) {
    // Show diagnostics first (if any errors, we might still write files)
    if (result.diagnostics && result.diagnostics.length > 0) {
        result.diagnostics.forEach((d) => {
            if (d.severity === 'error') {
                console.error(chalk.red(`  Error: ${d.message}`));
            }
            else if (d.severity === 'warning') {
                console.warn(chalk.yellow(`  Warning: ${d.message}`));
            }
            else {
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
export async function generateCommand(ir, options) {
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
            }
            catch (error) {
                fileSpinner.fail(`Failed to generate from ${path.relative(process.cwd(), irFile)}: ${error.message}`);
                errorCount++;
            }
        }
        // Summary
        console.log('');
        if (errorCount === 0) {
            spinner.succeed(`Generated code from ${successCount} IR file(s)`);
        }
        else {
            spinner.warn(`Generated from ${successCount} file(s), ${errorCount} failed`);
            process.exit(1);
        }
    }
    catch (error) {
        spinner.fail(`Generation failed: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}
//# sourceMappingURL=generate.js.map