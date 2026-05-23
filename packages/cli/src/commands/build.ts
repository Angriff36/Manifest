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

interface BuildOptions {
  projection: string;
  surface: string;
  irOutput: string;
  codeOutput: string;
  glob?: string;
  auth: string;
  database: string;
  runtime: string;
  response: string;
  /** Forwarded to generate.ts so dispatcher/concreteCommandRoutes config flows through. */
  projectionOptionsFromConfig?: Record<string, unknown>;
}


/**
 * Build command handler
 *
 * Combines compile + generate in a single workflow.
 */
export async function buildCommand(
  source: string | undefined,
  options: BuildOptions
): Promise<void> {
  const spinner = ora('Manifest build workflow').start();

  try {
    // Step 1: Compile to IR
    spinner.text = 'Step 1/2: Compiling .manifest to IR...';

    // Run compile (silent mode, we handle output)
    const compileSpinner = ora('Compiling').start();

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
      projectionOptionsFromConfig: options.projectionOptionsFromConfig,
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

  } catch (error: unknown) {
    spinner.fail(`Build failed: ${error instanceof Error ? error.message : String(error)}`);
    console.error(error);
    process.exit(1);
  }
}
