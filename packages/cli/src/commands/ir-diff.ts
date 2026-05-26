import fs from 'node:fs/promises';
import chalk from 'chalk';
import ora from 'ora';
import { diffIR, generateMigration } from '@angriff36/manifest/ir-diff';
import type { IR } from '@angriff36/manifest/ir';

export interface DiffIROptions {
  json?: boolean;
  sql?: boolean;
  prisma?: boolean;
  output?: string;
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

function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function tableLine(label: string, value: string): string {
  return `${label.padEnd(26)} ${value}`;
}

async function loadIRFile(path: string): Promise<IR> {
  const content = await fs.readFile(path, 'utf-8');
  return JSON.parse(content) as IR;
}

export async function diffIRCommand(
  oldIRPath: string,
  newIRPath: string,
  options: DiffIROptions = {},
): Promise<void> {
  const spinner = createSpinner(`Comparing IR files`, !options.json);
  try {
    const [oldIR, newIR] = await Promise.all([
      loadIRFile(oldIRPath),
      loadIRFile(newIRPath),
    ]);
    spinner.stop();

    const report = diffIR(oldIR, newIR);
    const migration = generateMigration(report, oldIR, newIR);

    if (options.sql || options.prisma) {
      const output: Record<string, unknown> = {
        diff: report,
        migration: {
          sql: options.sql ? migration.sql : undefined,
          prisma: options.prisma ? migration.prisma : undefined,
          summary: migration.summary,
          warnings: migration.warnings,
        },
      };

      if (options.output) {
        await fs.writeFile(options.output, JSON.stringify(output, null, 2), 'utf-8');
        console.log(chalk.green(`Migration written to ${options.output}`));
      } else {
        printJson(output);
      }

      if (migration.warnings.length > 0 && !options.json) {
        console.log('');
        console.log(chalk.yellow('Warnings:'));
        for (const w of migration.warnings) {
          console.log(chalk.yellow(`  ⚠ ${w}`));
        }
      }

      if (report.summary.hasChanges) process.exit(1);
      return;
    }

    if (options.json) {
      printJson(report);
      if (report.summary.hasChanges) process.exit(1);
      return;
    }

    // Human-readable output
    console.log(chalk.bold('\nIR Diff Report'));
    console.log('');
    console.log(chalk.cyan('Files'));
    console.log(tableLine('Old IR', oldIRPath));
    console.log(tableLine('New IR', newIRPath));

    console.log('');
    console.log(chalk.bold('Summary'));

    const s = report.summary;
    if (!s.hasChanges) {
      console.log(chalk.green('  No differences detected between the two IR versions.'));
      return;
    }

    if (s.entitiesAdded + s.entitiesRemoved + s.entitiesChanged > 0) {
      console.log(tableLine('Entities',
        `+${s.entitiesAdded} -${s.entitiesRemoved} ~${s.entitiesChanged}`));
    }
    if (s.commandsAdded + s.commandsRemoved + s.commandsChanged > 0) {
      console.log(tableLine('Commands',
        `+${s.commandsAdded} -${s.commandsRemoved} ~${s.commandsChanged}`));
    }
    if (s.policiesAdded + s.policiesRemoved + s.policiesChanged > 0) {
      console.log(tableLine('Policies',
        `+${s.policiesAdded} -${s.policiesRemoved} ~${s.policiesChanged}`));
    }
    if (s.eventsAdded + s.eventsRemoved + s.eventsChanged > 0) {
      console.log(tableLine('Events',
        `+${s.eventsAdded} -${s.eventsRemoved} ~${s.eventsChanged}`));
    }
    if (s.storesAdded + s.storesRemoved + s.storesChanged > 0) {
      console.log(tableLine('Stores',
        `+${s.storesAdded} -${s.storesRemoved} ~${s.storesChanged}`));
    }
    if (s.modulesAdded + s.modulesRemoved > 0) {
      console.log(tableLine('Modules',
        `+${s.modulesAdded} -${s.modulesRemoved}`));
    }

    // Entity details
    for (const entity of report.entities) {
      console.log('');
      const color = entity.change === 'added' ? chalk.green
        : entity.change === 'removed' ? chalk.red
        : chalk.yellow;
      console.log(color(`  Entity: ${entity.name} [${entity.change}]`));

      if (entity.module) {
        console.log(`    module: ${entity.module.from ?? '(none)'} → ${entity.module.to ?? '(none)'}`);
      }
      for (const prop of entity.properties) {
        const propColor = prop.change === 'added' ? chalk.green
          : prop.change === 'removed' ? chalk.red
          : chalk.yellow;
        console.log(propColor(`    property: ${prop.name} [${prop.change}]`));
        if (prop.details?.type) {
          console.log(`      type: ${prop.details.type.from} → ${prop.details.type.to}`);
        }
        if (prop.details?.modifiers) {
          console.log(`      modifiers: [${prop.details.modifiers.from.join(', ')}] → [${prop.details.modifiers.to.join(', ')}]`);
        }
      }
      for (const cp of entity.computedProperties) {
        const cpColor = cp.change === 'added' ? chalk.green
          : cp.change === 'removed' ? chalk.red
          : chalk.yellow;
        console.log(cpColor(`    computed: ${cp.name} [${cp.change}]`));
      }
      for (const rel of entity.relationships) {
        const relColor = rel.change === 'added' ? chalk.green
          : rel.change === 'removed' ? chalk.red
          : chalk.yellow;
        console.log(relColor(`    relationship: ${rel.name} [${rel.change}]`));
        if (rel.details?.kind) {
          console.log(`      kind: ${rel.details.kind.from} → ${rel.details.kind.to}`);
        }
      }
      for (const con of entity.constraints) {
        const conColor = con.change === 'added' ? chalk.green
          : con.change === 'removed' ? chalk.red
          : chalk.yellow;
        console.log(conColor(`    constraint: ${con.name} [${con.change}]`));
      }
    }

    // Command details
    if (report.commands.length > 0) {
      console.log('');
      console.log(chalk.bold('Commands'));
      for (const cmd of report.commands) {
        const color = cmd.change === 'added' ? chalk.green
          : cmd.change === 'removed' ? chalk.red
          : chalk.yellow;
        console.log(color(`  ${cmd.name} [${cmd.change}]`));
        if (cmd.details?.entity) {
          console.log(`    entity: ${cmd.details.entity.from ?? '(none)'} → ${cmd.details.entity.to ?? '(none)'}`);
        }
      }
    }

    // Policy details
    if (report.policies.length > 0) {
      console.log('');
      console.log(chalk.bold('Policies'));
      for (const pol of report.policies) {
        const color = pol.change === 'added' ? chalk.green
          : pol.change === 'removed' ? chalk.red
          : chalk.yellow;
        console.log(color(`  ${pol.name} [${pol.change}]`));
      }
    }

    // Event details
    if (report.events.length > 0) {
      console.log('');
      console.log(chalk.bold('Events'));
      for (const evt of report.events) {
        const color = evt.change === 'added' ? chalk.green
          : evt.change === 'removed' ? chalk.red
          : chalk.yellow;
        console.log(color(`  ${evt.name} [${evt.change}]`));
      }
    }

    // Migration preview hint
    console.log('');
    console.log(chalk.bold('Migration'));
    console.log(chalk.gray('  Use --sql --prisma flags to generate migration scripts.'));

    if (migration.warnings.length > 0) {
      console.log('');
      console.log(chalk.yellow('Warnings:'));
      for (const w of migration.warnings) {
        console.log(chalk.yellow(`  ⚠ ${w}`));
      }
    }

    if (report.summary.hasChanges) process.exit(1);
  } catch (error) {
    spinner.fail(`diff ir-vs-ir failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
