/**
 * manifest build command
 *
 * Compiles .manifest to IR and generates code in one step.
 */
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { compileCommand } from './compile.js';
import { generateCommand } from './generate.js';
/**
 * Build command handler
 *
 * Combines compile + generate in a single workflow.
 */
export async function buildCommand(source, options) {
    const spinner = ora('Manifest build workflow').start();
    try {
        // Step 1: Compile to IR
        spinner.text = 'Step 1/2: Compiling .manifest to IR...';
        // Run compile (silent mode, we handle output)
        const compileSpinner = ora('Compiling').start();
        // Collect IR files that would be generated
        const irFiles = [];
        // For now, we'll call compileCommand but capture the output
        // In a real implementation, we'd make compileCommand return the IR files
        await compileCommand(source, {
            output: options.irOutput,
            glob: options.glob,
            diagnostics: false,
            pretty: true,
        });
        compileSpinner.succeed('Compiled to IR');
        // Step 2: Generate code from IR
        spinner.text = 'Step 2/2: Generating code from IR...';
        await generateCommand(options.irOutput, {
            projection: options.projection,
            surface: options.surface,
            output: options.codeOutput,
            auth: options.auth,
            database: options.database,
            runtime: options.runtime,
            response: options.response,
        });
        spinner.succeed(`Build complete: IR → ${options.irOutput}, Code → ${options.codeOutput}`);
        // Show summary
        console.log('');
        console.log(chalk.bold('Build Summary:'));
        console.log(`  IR output:  ${path.relative(process.cwd(), options.irOutput)}`);
        console.log(`  Code output: ${path.relative(process.cwd(), options.codeOutput)}`);
        console.log(`  Projection: ${options.projection}`);
        console.log(`  Surface:    ${options.surface}`);
        console.log('');
    }
    catch (error) {
        spinner.fail(`Build failed: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}
//# sourceMappingURL=build.js.map