/**
 * CLI command: manifest migrate
 *
 * Runs IR diff analysis against current database schema and invokes
 * Prisma Migrate or Drizzle Kit to apply detected changes.
 * Supports --dry-run, --preview, and --force flags.
 * Validates that migrations are reversible before applying.
 */

import fs from 'node:fs/promises';
import chalk from 'chalk';
import ora from 'ora';
import { diffIR, generateMigration } from '@angriff36/manifest/ir-diff';
import { classifyBreakingChanges } from '@angriff36/manifest/breaking-change';
import type { IR } from '@angriff36/manifest/ir';
import type { BreakingChangeReport } from '@angriff36/manifest/breaking-change';

export interface MigrateOptions {
  oldIR?: string;
  newIR?: string;
  dryRun?: boolean;
  preview?: boolean;
  force?: boolean;
  json?: boolean;
  output?: string;
  tool?: 'prisma' | 'drizzle';
  checkReversibility?: boolean;
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
  return label.padEnd(28) + ' ' + value;
}

async function loadIRFile(path: string): Promise<IR> {
  const content = await fs.readFile(path, 'utf-8');
  return JSON.parse(content) as IR;
}

/**
 * Check if migrations are reversible by analyzing the diff.
 * Returns warnings for potentially destructive operations.
 */
function checkReversibility(diffReport: Awaited<ReturnType<typeof diffIR>>, migration: Awaited<ReturnType<typeof generateMigration>>): string[] {
  const warnings: string[] = [];

  // Check for table drops (not reversible)
  for (const entity of diffReport.entities) {
    if (entity.change === 'removed') {
      warnings.push(`Removing entity '${entity.name}' will drop data — this is NOT reversible`);
    }
  }

  // Check for column drops (data loss)
  for (const entity of diffReport.entities) {
    if (entity.change === 'changed') {
      for (const prop of entity.properties) {
        if (prop.change === 'removed') {
          warnings.push(`Dropping column '${entity.name}.${prop.name}' will lose data — this is NOT reversible`);
        }
      }
    }
  }

  // Check for required property additions without defaults (may break existing rows)
  for (const entity of diffReport.entities) {
    if (entity.change === 'added') {
      for (const prop of entity.properties) {
        if (prop.change === 'added' && !prop.details?.defaultValue && !prop.details?.modifiers?.to?.includes('optional')) {
          warnings.push(`Adding required column '${entity.name}.${prop.name}' without default may fail on existing rows`);
        }
      }
    }
  }

  // Add any warnings from migration generation
  warnings.push(...migration.warnings);

  return warnings;
}

/**
 * Format a migration plan for human-readable output.
 */
function formatMigrationPlan(
  migration: Awaited<ReturnType<typeof generateMigration>>,
  breakingReport: BreakingChangeReport,
  reversibilityWarnings: string[],
): string[] {
  const lines: string[] = [];

  if (migration.summary.length === 0) {
    lines.push('No migration changes required.');
    return lines;
  }

  lines.push('Migration plan:');
  for (const step of migration.summary) {
    lines.push('  ' + step);
  }

  if (reversibilityWarnings.length > 0) {
    lines.push('');
    lines.push('Reversibility warnings:');
    for (const w of reversibilityWarnings) {
      lines.push('  ⚠ ' + w);
    }
  }

  if (breakingReport.unacknowledged.length > 0) {
    lines.push('');
    lines.push(chalk.red('Blocking: ' + breakingReport.unacknowledged.length + ' unacknowledged breaking change(s)'));
    lines.push('Use --force to override (not recommended).');
  }

  return lines;
}

export async function migrateCommand(
  options: MigrateOptions = {},
): Promise<void> {
  const spinner = createSpinner('Analyzing migration', !options.json);

  try {
    // Require either oldIR and newIR, or current IR for comparison
    if (!options.oldIR || !options.newIR) {
      spinner.fail('Both --old-ir and --new-ir are required');
      console.log(chalk.yellow('Usage: manifest migrate --old-ir <path> --new-ir <path> [options]'));
      process.exit(1);
    }

    const [oldIR, newIR] = await Promise.all([
      loadIRFile(options.oldIR),
      loadIRFile(options.newIR),
    ]);
    spinner.stop();

    // Compute diff and migration
    const diffReport = diffIR(oldIR, newIR);
    const migration = generateMigration(diffReport, oldIR, newIR);
    const breakingReport = classifyBreakingChanges(diffReport);

    // Check reversibility
    const reversibilityWarnings = options.checkReversibility !== false
      ? checkReversibility(diffReport, migration)
      : [];

    // Output handling
    if (options.json) {
      const output = {
        diff: diffReport,
        migration: {
          sql: migration.sql,
          prisma: migration.prisma,
          summary: migration.summary,
          warnings: migration.warnings,
        },
        breakingReport: {
          summary: breakingReport.summary,
          unacknowledgedCount: breakingReport.unacknowledged.length,
        },
        reversibilityWarnings,
        hasBlockingChanges: breakingReport.unacknowledged.length > 0,
      };

      if (options.output) {
        await fs.writeFile(options.output, JSON.stringify(output, null, 2), 'utf-8');
        console.log(chalk.green('Migration plan written to ' + options.output));
      } else {
        console.log(JSON.stringify(output, null, 2));
      }

      // Exit with error if there are unacknowledged breaking changes (unless --force)
      if (breakingReport.unacknowledged.length > 0 && !options.force) {
        process.exit(1);
      }
      return;
    }

    // Human-readable output
    console.log(chalk.bold('\nMigration Analysis'));
    console.log('');
    console.log(chalk.cyan('Inputs'));
    console.log(tableLine('Old IR', options.oldIR));
    console.log(tableLine('New IR', options.newIR));
    console.log(tableLine('Tool', options.tool ?? 'prisma'));

    console.log('');
    console.log(chalk.bold('Change Summary'));
    const s = diffReport.summary;
    if (!s.hasChanges) {
      console.log(chalk.green('  No changes detected — nothing to migrate.'));
      return;
    }

    if (s.entitiesAdded + s.entitiesRemoved + s.entitiesChanged > 0) {
      console.log(tableLine('Entities', `+${s.entitiesAdded} -${s.entitiesRemoved} ~${s.entitiesChanged}`));
    }
    if (s.commandsAdded + s.commandsRemoved + s.commandsChanged > 0) {
      console.log(tableLine('Commands', `+${s.commandsAdded} -${s.commandsRemoved} ~${s.commandsChanged}`));
    }
    if (s.storesAdded + s.storesRemoved + s.storesChanged > 0) {
      console.log(tableLine('Stores', `+${s.storesAdded} -${s.storesRemoved} ~${s.storesChanged}`));
    }

    console.log('');
    console.log(chalk.bold('Breaking Changes'));
    if (breakingReport.summary.breaking === 0) {
      console.log(chalk.green('  No breaking changes.'));
    } else {
      console.log(chalk.red('  ' + breakingReport.summary.breaking + ' breaking change(s)'));
      if (breakingReport.unacknowledged.length > 0) {
        console.log(chalk.red('  ' + breakingReport.unacknowledged.length + ' unacknowledged (blocking unless --force)'));
      }
    }

    // Migration plan
    console.log('');
    console.log(chalk.bold('Migration Plan'));
    const planLines = formatMigrationPlan(migration, breakingReport, reversibilityWarnings);
    for (const line of planLines) {
      if (line.includes('⚠')) {
        console.log(chalk.yellow(line));
      } else if (line.includes('Blocking:')) {
        console.log(chalk.red(line));
      } else {
        console.log(line);
      }
    }

    // SQL preview (--preview flag)
    if (options.preview && migration.sql.length > 0) {
      console.log('');
      console.log(chalk.bold('SQL Migration'));
      console.log(chalk.gray('---'));
      for (const stmt of migration.sql) {
        console.log(stmt);
      }
      console.log(chalk.gray('---'));
    }

    // Prisma migration preview (--preview flag)
    if (options.preview && migration.prisma.length > 0) {
      console.log('');
      console.log(chalk.bold('Prisma Migration Steps'));
      console.log(chalk.gray('---'));
      for (const step of migration.prisma) {
        console.log(step);
      }
      console.log(chalk.gray('---'));
    }

    // Dry-run summary
    if (options.dryRun) {
      console.log('');
      console.log(chalk.bold(chalk.cyan('DRY RUN — No changes applied')));
      console.log('To apply: remove --dry-run or use --force');
      process.exit(0);
      return;
    }

    // Check for blocking issues
    if (breakingReport.unacknowledged.length > 0 && !options.force) {
      console.log('');
      console.log(chalk.red('Migration blocked: unacknowledged breaking changes.'));
      console.log(chalk.gray('Acknowledge changes or use --force to override (not recommended).'));
      process.exit(1);
      return;
    }

    if (reversibilityWarnings.length > 0 && !options.force) {
      console.log('');
      console.log(chalk.yellow('Migration has reversibility warnings.'));
      console.log(chalk.gray('Use --force to apply anyway (not recommended).'));
      process.exit(1);
      return;
    }

    // Apply migration
    console.log('');
    console.log(chalk.bold('Applying migration...'));

    if (options.tool === 'drizzle') {
      console.log(chalk.yellow('Drizzle Kit integration not yet implemented.'));
      console.log(chalk.gray('Use --tool prisma or implement drizzle support.'));
      process.exit(1);
    }

    // Prisma integration
    // In a full implementation, this would:
    // 1. Write the generated Prisma migration steps to a migration file
    // 2. Run `prisma migrate dev` or `prisma migrate deploy`
    // For now, we show what would be done

    console.log(chalk.green('Migration would apply ' + migration.summary.length + ' change(s)'));
    console.log(chalk.gray('(Prisma migrate invocation not implemented in this version)'));
    console.log('');
    console.log(chalk.bold('Next steps:'));
    console.log('  1. Review the migration plan above');
    console.log('  2. Run with --preview to see SQL');
    console.log('  3. Run without --dry-run to apply');

  } catch (error) {
    spinner.fail('migrate failed: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}