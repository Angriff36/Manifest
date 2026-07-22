/**
 * CLI command: manifest diff breaking <oldIR> <newIR>
 *
 * Classifies IR diffs as compatible/deprecated/breaking with consumer impact
 * analysis. Supports acknowledgments file for CI integration.
 */

import fs from 'node:fs/promises';
import chalk from 'chalk';
import ora from 'ora';
import { diffIR } from '@angriff36/manifest/ir-diff';
import { classifyBreakingChanges } from '@angriff36/manifest/breaking-change';
import type { IR } from '@angriff36/manifest/ir';
import type {
  AcknowledgmentsFile,
  BreakingChangeReport,
} from '@angriff36/manifest/breaking-change';

export interface BreakingChangeOptions {
  json?: boolean;
  ack?: string;
  ci?: boolean;
  output?: string;
  dryRun?: boolean;
}

function createSpinner(message: string, enabled: boolean) {
  if (!enabled) {
    return {
      text: message,
      stop() {},
      fail(_msg?: string) {},
    };
  }
  return ora(message).start();
}

function tableLine(label: string, value: string): string {
  return label.padEnd(26) + ' ' + value;
}

async function loadIRFile(path: string): Promise<IR> {
  const content = await fs.readFile(path, 'utf-8');
  return JSON.parse(content) as IR;
}

async function loadAcknowledgments(path: string): Promise<AcknowledgmentsFile | undefined> {
  try {
    const content = await fs.readFile(path, 'utf-8');
    const parsed = JSON.parse(content) as AcknowledgmentsFile;
    if (parsed.version !== 1) {
      throw new Error('Unsupported acknowledgments file version: ' + String(parsed.version));
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function printHumanReadableReport(
  report: BreakingChangeReport,
  oldPath: string,
  newPath: string,
  ackPath?: string,
): void {
  console.log(chalk.bold('\nBreaking Change Analysis'));
  console.log('');
  console.log(chalk.cyan('Files'));
  console.log(tableLine('Old IR', oldPath));
  console.log(tableLine('New IR', newPath));
  if (ackPath) console.log(tableLine('Acknowledgments', ackPath));

  console.log('');
  console.log(chalk.bold('Summary'));
  console.log(tableLine('Compatible changes', chalk.green(String(report.summary.compatible))));
  console.log(tableLine('Deprecated changes', chalk.yellow(String(report.summary.deprecated))));
  console.log(tableLine('Breaking changes', chalk.red(String(report.summary.breaking))));
  console.log(tableLine('Total', String(report.summary.total)));

  if (report.summary.breaking > 0) {
    console.log('');
    console.log(chalk.bold(chalk.red('Breaking Changes')));
    for (const change of report.classified.filter((c) => c.severity === 'breaking')) {
      const acked = report.acknowledged.includes(change);
      const marker = acked ? chalk.gray('[ACK]') : chalk.red('[NEW]');
      console.log('  ' + marker + ' ' + change.path);
      console.log('         ' + change.description);
      if (change.consumerImpact.length > 0) {
        console.log('         Impact: ' + change.consumerImpact.join(', '));
      }
    }
  }

  if (report.summary.deprecated > 0) {
    console.log('');
    console.log(chalk.bold(chalk.yellow('Deprecated Changes')));
    for (const change of report.classified.filter((c) => c.severity === 'deprecated')) {
      console.log('  ' + chalk.yellow('[DEP]') + ' ' + change.path);
      console.log('         ' + change.description);
    }
  }

  if (report.consumerImpact.commands.length > 0) {
    console.log('');
    console.log(chalk.bold('Affected Commands'));
    for (const cmd of report.consumerImpact.commands) {
      console.log('  - ' + cmd);
    }
  }

  if (report.consumerImpact.routes.length > 0) {
    console.log('');
    console.log(chalk.bold('Affected Routes'));
    for (const route of report.consumerImpact.routes) {
      console.log('  - ' + route);
    }
  }

  if (report.consumerImpact.projections.length > 0) {
    console.log('');
    console.log(chalk.bold('Affected Projections'));
    for (const proj of report.consumerImpact.projections) {
      console.log('  - ' + proj);
    }
  }

  if (report.unacknowledged.length > 0) {
    console.log('');
    console.log(
      chalk.yellow(
        '\n' + report.unacknowledged.length + ' unacknowledged breaking change(s) found.',
      ),
    );
    console.log(chalk.gray('Add entries to the acknowledgments file to suppress CI failures.'));
  } else if (report.summary.breaking > 0 && report.unacknowledged.length === 0) {
    console.log('');
    console.log(chalk.green('All breaking changes have been acknowledged.'));
  }
}

export async function breakingChangeCommand(
  oldIRPath: string,
  newIRPath: string,
  options: BreakingChangeOptions = {},
): Promise<BreakingChangeReport> {
  const spinner = createSpinner('Analyzing breaking changes', !options.json);
  try {
    const [oldIR, newIR] = await Promise.all([loadIRFile(oldIRPath), loadIRFile(newIRPath)]);
    spinner.stop();

    const diffReport = diffIR(oldIR, newIR);
    const acks = options.ack ? await loadAcknowledgments(options.ack) : undefined;
    const report = classifyBreakingChanges(diffReport, acks);

    if (options.json) {
      const output = JSON.stringify(report, null, 2);
      if (options.output) {
        const { writeTextFile } = await import('../utils/dry-run-fs.js');
        await writeTextFile(options.output, output, { dryRun: options.dryRun });
        if (!options.dryRun) {
          console.log(chalk.green('Report written to ' + options.output));
        }
      } else {
        console.log(output);
      }
    } else {
      if (options.output) {
        const body = JSON.stringify(report, null, 2);
        const { writeTextFile } = await import('../utils/dry-run-fs.js');
        await writeTextFile(options.output, body, { dryRun: options.dryRun });
        if (!options.dryRun) {
          console.log(chalk.green('Report written to ' + options.output));
        }
      }
      printHumanReadableReport(report, oldIRPath, newIRPath, options.ack);
    }

    // CI mode: exit non-zero on unacknowledged breaking changes
    if (options.ci && report.unacknowledged.length > 0) {
      process.exit(1);
    }

    return report;
  } catch (error) {
    spinner.fail(
      'diff breaking failed: ' + (error instanceof Error ? error.message : String(error)),
    );
    process.exit(1);
  }
}
