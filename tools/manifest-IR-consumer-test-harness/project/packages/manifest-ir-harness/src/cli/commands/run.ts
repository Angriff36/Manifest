import { Command } from 'commander';
import { readFile, writeFile } from 'node:fs/promises';
import { runScript } from '../../core/executor.js';
import { validateScript } from '../../core/validator.js';
import { formatOutput } from '../../core/output-formatter.js';
import type { IR, TestScript } from '../../types/index.js';

export const runCommand = new Command('run')
  .description('Run a test script against a Manifest IR or source')
  .option('--ir <path>', 'Path to IR JSON file')
  .option('--manifest <path>', 'Path to Manifest source file')
  .requiredOption('--script <path>', 'Path to test script JSON')
  .option('--output <path>', 'Write results to a file')
  .option('--snapshot', 'Output in snapshot-friendly format (normalized timestamps)')
  .action(async (options: { ir?: string; manifest?: string; script: string; output?: string; snapshot?: boolean }) => {
    if (!options.ir && !options.manifest) {
      console.error('Error: Either --ir or --manifest must be specified');
      process.exit(1);
    }

    if (options.ir && options.manifest) {
      console.error('Error: Specify either --ir or --manifest, not both');
      process.exit(1);
    }

    let scriptContent: string;
    try {
      scriptContent = await readFile(options.script, 'utf-8');
    } catch {
      console.error(`Error: Could not read script file: ${options.script}`);
      process.exit(1);
    }

    let script: TestScript;
    try {
      script = JSON.parse(scriptContent) as TestScript;
    } catch {
      console.error(`Error: Script file is not valid JSON: ${options.script}`);
      process.exit(1);
    }

    const validation = validateScript(script);
    if (!validation.valid) {
      console.error('Script validation failed:');
      for (const err of validation.errors) {
        console.error(`  - ${err}`);
      }
      process.exit(1);
    }

    try {
      let irSource: IR | undefined;
      let manifestSource: string | undefined;
      let sourcePath: string;

      if (options.ir) {
        const irContent = await readFile(options.ir, 'utf-8');
        irSource = JSON.parse(irContent) as IR;
        sourcePath = options.ir;
      } else {
        manifestSource = await readFile(options.manifest!, 'utf-8');
        sourcePath = options.manifest!;
      }

      const result = await runScript({
        irSource,
        manifestSource,
        script,
        sourcePath,
        scriptPath: options.script,
        timestamp: options.snapshot ? '[TIMESTAMP]' : undefined,
      });

      const formatted = formatOutput(result);

      if (options.output) {
        await writeFile(options.output, formatted + '\n', 'utf-8');
        console.log(`Results written to ${options.output}`);
      } else {
        console.log(formatted);
      }

      if (result.summary.failed > 0) {
        process.exit(1);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Execution error: ${message}`);
      process.exit(1);
    }
  });
