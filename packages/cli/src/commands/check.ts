/**
 * manifest check command
 *
 * Runs compile + validate as a single verification workflow.
 */

import chalk from 'chalk';
import { compileCommand } from './compile.js';
import { validateCommand } from './validate.js';

interface CheckOptions {
  output?: string;
  glob?: string;
  diagnostics?: boolean;
  pretty?: boolean;
  schema?: string;
  strict?: boolean;
}

/**
 * Check command handler
 *
 * Compile .manifest files to IR, then validate generated IR.
 */
export async function checkCommand(
  source: string | undefined,
  options: CheckOptions = {}
): Promise<void> {
  const startedAt = Date.now();
  const validateTarget = options.output;

  await compileCommand(source, {
    output: options.output,
    glob: options.glob,
    diagnostics: options.diagnostics ?? false,
    pretty: options.pretty ?? true,
  });

  await validateCommand(validateTarget, {
    schema: options.schema,
    strict: options.strict ?? false,
  });

  const elapsedMs = Date.now() - startedAt;
  console.log('');
  console.log(chalk.bold.green(`✓ Check complete in ${elapsedMs}ms`));
}

