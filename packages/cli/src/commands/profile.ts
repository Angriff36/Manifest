/**
 * manifest profile command
 *
 * Profile command execution to identify performance bottlenecks.
 * Displays timing data for each execution phase and can export flame graph data.
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import Table from 'cli-table3';

// Import from the main Manifest package
async function loadRuntime() {
  const module = await import('@angriff36/manifest/runtime-engine');
  return {
    RuntimeEngine: module.RuntimeEngine,
    summarizeProfiles: module.summarizeProfiles,
    toFlameGraph: module.toFlameGraph,
  };
}

// Type imports
type CommandProfile = import('@angriff36/manifest/runtime-engine').CommandProfile;
type ProfileSummary = import('@angriff36/manifest/runtime-engine').ProfileSummary;

interface ProfileOptions {
  /** IR file to load */
  ir?: string;
  /** Output format for results */
  format?: 'table' | 'json' | 'flame';
  /** Number of times to run each command (for averaging) */
  iterations?: number;
  /** Specific command to profile */
  command?: string;
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
async function loadIR(irPath: string | undefined): Promise<unknown> {
  if (!irPath) {
    // Try to find the first .ir.json file
    const { glob } = await import('glob');
    const files = await glob('**/*.ir.json', {
      cwd: process.cwd(),
      ignore: ['node_modules/**', 'dist/**', '.next/**']
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
  return JSON.parse(content);
}

/**
 * Format a duration in milliseconds with appropriate precision
 */
function formatDuration(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(2)}μs`;
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
 * Print profiling summary as a table
 */
function printSummaryTable(summary: ProfileSummary): void {
  console.log('');
  console.log(chalk.bold('📊 Performance Profile Summary'));

  // Overview table
  console.log('');
  console.log(chalk.gray('Overview'));
  const overviewTable = new Table({
    head: [chalk.cyan('Metric'), chalk.cyan('Value')],
    colWidths: [25, 20],
  });

  overviewTable.push(
    ['Total Commands', summary.totalCommands.toString()],
    ['Total Duration', formatDuration(summary.totalDuration)],
    ['Average Duration', formatDuration(summary.averageDuration)],
    ['Slowest Command',
      chalk.yellow(`${summary.slowestCommand.entityName ? `${summary.slowestCommand.entityName}.` : ''}${summary.slowestCommand.commandName}`)
    ],
    ['Slowest Time', chalk.red(formatDuration(summary.slowestCommand.duration))],
    ['Fastest Command',
      chalk.green(`${summary.fastestCommand.entityName ? `${summary.fastestCommand.entityName}.` : ''}${summary.fastestCommand.commandName}`)
    ],
    ['Fastest Time', chalk.green(formatDuration(summary.fastestCommand.duration))],
  );

  console.log(overviewTable.toString());

  // Phase breakdown table
  if (summary.phaseStats.size > 0) {
    console.log('');
    console.log(chalk.gray('Phase Breakdown'));
    const phaseTable = new Table({
      head: [chalk.cyan('Phase'), chalk.cyan('Total'), chalk.cyan('Avg'), chalk.cyan('Max'), chalk.cyan('%')],
      colWidths: [20, 12, 12, 12, 10],
    });

    // Sort phases by total duration (slowest first)
    const sortedPhases = Array.from(summary.phaseStats.entries())
      .sort(([, a], [, b]) => b.totalDuration - a.totalDuration);

    for (const [phase, stats] of sortedPhases) {
      const phaseColor = stats.totalDuration > 10 ? 'yellow' : 'white';
      phaseTable.push(
        [
          { content: phase, color: phaseColor as 'white' | 'yellow' },
          formatDuration(stats.totalDuration),
          formatDuration(stats.averageDuration),
          formatDuration(stats.maxDuration),
          formatPercent(stats.percentOfTotal),
        ]
      );
    }

    console.log(phaseTable.toString());
  }

  // Slowest commands table
  if (summary.slowestCommands.length > 0) {
    console.log('');
    console.log(chalk.gray('Slowest Commands'));
    const slowestTable = new Table({
      head: [chalk.cyan('Command'), chalk.cyan('Duration')],
      colWidths: [40, 15],
    });

    for (const cmd of summary.slowestCommands) {
      slowestTable.push(
        [
          `${cmd.entityName ? `${cmd.entityName}.` : ''}${cmd.commandName}`,
          chalk.yellow(formatDuration(cmd.duration)),
        ]
      );
    }

    console.log(slowestTable.toString());
  }
}

/**
 * Export profiling data as JSON
 */
async function exportProfileData(
  profiles: Awaited<ReturnType<typeof import('@angriff36/manifest/runtime-engine').getProfiles>>,
  exportPath: string
): Promise<void> {
  const resolved = path.resolve(process.cwd(), exportPath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, JSON.stringify(profiles, null, 2), 'utf-8');
  console.log(chalk.green(`\n✓ Profile data exported to: ${resolved}`));
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

    // Initialize runtime with profiling
    spinner.start('Initializing runtime');
    const { RuntimeEngine, summarizeProfiles, toFlameGraph } = await loadRuntime();

    const runtime = new RuntimeEngine(ir as import('@angriff36/manifest').IR, {}, {
      profiling: {
        enabled: true,
        detailed: options.detailed ?? false,
      },
    });

    spinner.succeed('Runtime initialized');

    // If no command specified, just show that profiling is enabled
    if (!options.command) {
      console.log('');
      console.log(chalk.yellow('No command specified to profile.'));
      console.log(chalk.gray('Runtime is ready with profiling enabled.'));
      console.log(chalk.gray('Specify --command <name> to profile a specific command.'));
      console.log('');
      console.log(chalk.gray('Example:'));
      console.log(chalk.white('  manifest profile --command create --entity User --input \'{"name": "Test"}\''));
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
      await exportProfileData(profiles, options.export);
    }

    console.log('');
  } catch (error) {
    spinner.fail(`Profiling failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
