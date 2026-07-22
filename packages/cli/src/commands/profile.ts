/**
 * manifest profile command
 *
 * Profile command execution to identify performance bottlenecks.
 * Displays timing data for each execution phase and can export flame graph data.
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import type { IR } from '@angriff36/manifest/ir';
import type {
  CommandProfile,
  ProfileSummary,
  PhaseStats,
  ExecutionPhase,
} from '@angriff36/manifest/profiling';

// Dynamic imports for modules with side effects or not needed at type-check time
async function loadProfiling() {
  return await import('@angriff36/manifest/profiling');
}

interface ProfileOptions {
  /** IR file to load */
  ir?: string;
  /** Output format for results */
  format?: 'table' | 'json' | 'flame';
  /** Number of times to run each command (for averaging) */
  iterations?: number;
  /** Specific command to profile */
  command?: string;
  /** Preview --export write without touching the filesystem. */
  dryRun?: boolean;
  /** Entity name for the command */
  entity?: string;
  /** Input JSON for the command */
  input?: string;
  /** Export profiling data to file */
  export?: string;
  /** Include detailed per-operation timing */
  detailed?: boolean;
}

/**
 * Load IR from file
 */
async function loadIR(irPath: string | undefined): Promise<IR> {
  if (!irPath) {
    // Try to find the first .ir.json file
    const { glob } = await import('glob');
    const files = await glob('**/*.ir.json', {
      cwd: process.cwd(),
      ignore: ['node_modules/**', 'dist/**', '.next/**'],
    });

    if (files.length === 0) {
      throw new Error('No IR file found. Specify one with --ir <path>');
    }

    if (files.length > 1) {
      console.warn(`Found multiple IR files, using: ${files[0]}`);
    }

    irPath = files[0];
  }

  const resolved = path.resolve(process.cwd(), irPath);
  const content = await fs.readFile(resolved, 'utf-8');
  return JSON.parse(content) as IR;
}

/**
 * Format a duration in milliseconds with appropriate precision
 */
function formatDuration(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(2)}us`;
  }
  if (ms < 1000) {
    return `${ms.toFixed(2)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Format a percentage
 */
function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Pad a string to a given width for table formatting.
 */
function padRight(str: string, width: number): string {
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

/**
 * Print profiling summary as a formatted table
 */
function printSummaryTable(summary: ProfileSummary): void {
  console.log('');
  console.log(chalk.bold('Performance Profile Summary'));

  // Overview table
  console.log('');
  console.log(chalk.gray('Overview'));
  console.log(`  ${padRight('Metric', 25)} ${padRight('Value', 20)}`);
  console.log(`  ${'-'.repeat(25)} ${'-'.repeat(20)}`);
  console.log(`  ${padRight('Total Commands', 25)} ${summary.totalCommands}`);
  console.log(`  ${padRight('Total Duration', 25)} ${formatDuration(summary.totalDuration)}`);
  console.log(`  ${padRight('Average Duration', 25)} ${formatDuration(summary.averageDuration)}`);
  console.log(
    `  ${padRight('Slowest Command', 25)} ${chalk.yellow(`${summary.slowestCommand.entityName ? `${summary.slowestCommand.entityName}.` : ''}${summary.slowestCommand.commandName}`)}`,
  );
  console.log(
    `  ${padRight('Slowest Time', 25)} ${chalk.red(formatDuration(summary.slowestCommand.duration))}`,
  );
  console.log(
    `  ${padRight('Fastest Command', 25)} ${chalk.green(`${summary.fastestCommand.entityName ? `${summary.fastestCommand.entityName}.` : ''}${summary.fastestCommand.commandName}`)}`,
  );
  console.log(
    `  ${padRight('Fastest Time', 25)} ${chalk.green(formatDuration(summary.fastestCommand.duration))}`,
  );

  // Phase breakdown table
  if (summary.phaseStats.size > 0) {
    console.log('');
    console.log(chalk.gray('Phase Breakdown'));
    const colWidths = [20, 12, 12, 12, 10];
    console.log(
      `  ${padRight('Phase', colWidths[0])} ${padRight('Total', colWidths[1])} ${padRight('Avg', colWidths[2])} ${padRight('Max', colWidths[3])} ${padRight('%', colWidths[4])}`,
    );
    console.log(
      `  ${'-'.repeat(colWidths[0])} ${'-'.repeat(colWidths[1])} ${'-'.repeat(colWidths[2])} ${'-'.repeat(colWidths[3])} ${'-'.repeat(colWidths[4])}`,
    );

    // Sort phases by total duration (slowest first)
    const sortedPhases = Array.from(
      summary.phaseStats.entries() as IterableIterator<[ExecutionPhase, PhaseStats]>,
    ).sort(([, a], [, b]) => b.totalDuration - a.totalDuration);

    for (const [phase, stats] of sortedPhases) {
      const phaseStr =
        phase.length > colWidths[0] - 2 ? phase.slice(0, colWidths[0] - 2) + '..' : phase;
      const colorFn = stats.totalDuration > 10 ? chalk.yellow : chalk.white;
      console.log(
        `  ${colorFn(padRight(phaseStr, colWidths[0]))} ${padRight(formatDuration(stats.totalDuration), colWidths[1])} ${padRight(formatDuration(stats.averageDuration), colWidths[2])} ${padRight(formatDuration(stats.maxDuration), colWidths[3])} ${padRight(formatPercent(stats.percentOfTotal), colWidths[4])}`,
      );
    }
  }

  // Slowest commands table
  if (summary.slowestCommands.length > 0) {
    console.log('');
    console.log(chalk.gray('Slowest Commands'));
    console.log(`  ${padRight('Command', 40)} ${padRight('Duration', 15)}`);
    console.log(`  ${'-'.repeat(40)} ${'-'.repeat(15)}`);

    for (const cmd of summary.slowestCommands) {
      console.log(
        `  ${padRight(`${cmd.entityName ? `${cmd.entityName}.` : ''}${cmd.commandName}`, 40)} ${chalk.yellow(formatDuration(cmd.duration))}`,
      );
    }
  }
}

/**
 * Export profiling data as JSON
 */
async function exportProfileData(
  profiles: CommandProfile[],
  exportPath: string,
  dryRun?: boolean,
): Promise<void> {
  const resolved = path.resolve(process.cwd(), exportPath);
  const body = JSON.stringify(profiles, null, 2);
  const { writeTextFile } = await import('../utils/dry-run-fs.js');
  await writeTextFile(resolved, body, { dryRun });
  if (!dryRun) {
    console.log(chalk.green(`\nProfile data exported to: ${resolved}`));
  }
}

/**
 * Profile command handler
 */
export async function profileCommand(options: ProfileOptions = {}): Promise<void> {
  const spinner = ora('Loading IR').start();

  try {
    // Load IR
    const ir = await loadIR(options.ir);
    spinner.succeed(`Loaded IR`);

    // Load profiling functions
    const { summarizeProfiles, toFlameGraph } = await loadProfiling();

    // Initialize runtime with profiling
    spinner.start('Initializing runtime');
    const { RuntimeEngine } = await import('@angriff36/manifest/runtime-engine');

    const runtime = new RuntimeEngine(
      ir,
      {},
      {
        profiling: {
          enabled: true,
          detailed: options.detailed ?? false,
        },
      },
    );

    spinner.succeed('Runtime initialized');

    // If no command specified, just show that profiling is enabled
    if (!options.command) {
      console.log('');
      console.log(chalk.yellow('No command specified to profile.'));
      console.log(chalk.gray('Runtime is ready with profiling enabled.'));
      console.log(chalk.gray('Specify --command <name> to profile a specific command.'));
      console.log('');
      console.log(chalk.gray('Example:'));
      console.log(
        chalk.white(
          '  manifest profile --command create --entity User --input \'{"name": "Test"}\'',
        ),
      );
      console.log('');
      return;
    }

    // Parse input
    let input: Record<string, unknown> = {};
    if (options.input) {
      try {
        input = JSON.parse(options.input);
      } catch {
        spinner.fail('Invalid JSON in --input');
        process.exit(1);
      }
    }

    // Run the command multiple times if iterations specified
    const iterations = options.iterations ?? 1;
    spinner.start(`Running command ${iterations} time${iterations > 1 ? 's' : ''}`);

    for (let i = 0; i < iterations; i++) {
      await runtime.runCommand(options.command!, input, {
        entityName: options.entity,
      });
    }

    spinner.succeed(`Command executed ${iterations} time${iterations > 1 ? 's' : ''}`);

    // Get profiling results
    const profiles = runtime.getProfiles();

    if (profiles.length === 0) {
      console.log(chalk.yellow('\nNo profiling data collected.'));
      return;
    }

    // Generate summary
    const summary = summarizeProfiles(profiles);

    // Output results based on format
    if (options.format === 'json') {
      console.log(JSON.stringify({ summary, profiles }, null, 2));
    } else if (options.format === 'flame') {
      // Output flame graph data
      for (const profile of profiles) {
        console.log(JSON.stringify(toFlameGraph(profile), null, 2));
      }
    } else {
      printSummaryTable(summary);
    }

    // Export if requested
    if (options.export) {
      await exportProfileData(profiles, options.export, options.dryRun);
    }

    console.log('');
  } catch (error) {
    spinner.fail(`Profiling failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
