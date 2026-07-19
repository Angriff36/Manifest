/**
 * manifest ci-gate — Config G10 declarative drift gates.
 *
 * Runs the configured checks and exits non-zero on the first failure.
 * Does not change language semantics — only CI integrity.
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { glob } from 'glob';
import { DriftGatesResolver, type DriftGatesConfig } from '../utils/drift-gates.js';

export interface CiGateOptions {
  cwd?: string;
  /** Write the live effective config to the snapshot path (refresh), then exit 0. */
  writeSnapshot?: boolean;
  /** CLI overrides for driftGates fields. */
  failOnConfigDrift?: boolean;
  failOnGeneratedDrift?: boolean;
  effectiveConfigSnapshot?: string;
  pinIrSchemaVersion?: string;
}

export class CiGateRunner {
  constructor(
    private readonly cwd: string,
    private readonly options: CiGateOptions = {},
  ) {}

  async run(): Promise<{ ok: boolean; failures: string[] }> {
    const { loadAllConfigs } = await import('../utils/config.js');
    const { build } = await loadAllConfigs(this.cwd);
    const gates = new DriftGatesResolver().resolve(
      build.driftGates as DriftGatesConfig | undefined,
      {
        effectiveConfigSnapshot: this.options.effectiveConfigSnapshot,
        failOnConfigDrift: this.options.failOnConfigDrift,
        failOnGeneratedDrift: this.options.failOnGeneratedDrift,
        pinIrSchemaVersion: this.options.pinIrSchemaVersion,
      },
    );

    const failures: string[] = [];

    // Gate 0: config schema validity (always).
    const { validateConfig } = await import('../utils/config-validate.js');
    const validation = await validateConfig(build);
    if (!validation.ok) {
      failures.push(
        `config validate failed: ${validation.diagnostics.map((d) => d.message).join('; ')}`,
      );
      return { ok: false, failures };
    }

    const { loadEffectiveConfig } = await import('./config.js');
    const { json: liveJson } = await loadEffectiveConfig(this.cwd);

    if (this.options.writeSnapshot) {
      const snapPath = gates.effectiveConfigSnapshot;
      if (!snapPath) {
        failures.push(
          'Cannot --write-snapshot without driftGates.effectiveConfigSnapshot (or --snapshot).',
        );
        return { ok: false, failures };
      }
      const abs = path.resolve(this.cwd, snapPath);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, liveJson, 'utf-8');
      console.log(chalk.green(`Wrote effective config snapshot → ${snapPath}`));
      return { ok: true, failures: [] };
    }

    if (gates.failOnConfigDrift) {
      if (!gates.effectiveConfigSnapshot) {
        failures.push(
          'failOnConfigDrift is true but no effectiveConfigSnapshot path is configured.',
        );
      } else {
        const abs = path.resolve(this.cwd, gates.effectiveConfigSnapshot);
        let committed: string;
        try {
          committed = await fs.readFile(abs, 'utf-8');
        } catch {
          failures.push(
            `Missing effective config snapshot at ${gates.effectiveConfigSnapshot}. ` +
              `Run: manifest ci-gate --write-snapshot`,
          );
          committed = '';
        }
        if (committed && normalizeNewlines(committed) !== normalizeNewlines(liveJson)) {
          failures.push(
            `Effective config drifted from ${gates.effectiveConfigSnapshot}. ` +
              `Run: manifest ci-gate --write-snapshot && commit the snapshot.`,
          );
        }
      }
    }

    if (gates.pinIrSchemaVersion) {
      const irRoot = path.resolve(this.cwd, build.output ?? 'ir/');
      const irFiles = await glob('**/*.ir.json', {
        cwd: irRoot,
        absolute: true,
        nodir: true,
      }).catch(() => [] as string[]);
      for (const file of irFiles) {
        try {
          const raw = JSON.parse(await fs.readFile(file, 'utf-8')) as { version?: string };
          if (raw.version !== gates.pinIrSchemaVersion) {
            failures.push(
              `IR schema version mismatch in ${path.relative(this.cwd, file)}: ` +
                `expected ${gates.pinIrSchemaVersion}, got ${JSON.stringify(raw.version)}`,
            );
          }
        } catch (error: unknown) {
          failures.push(
            `Could not read IR ${path.relative(this.cwd, file)}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    if (gates.failOnGeneratedDrift) {
      const prevCwd = process.cwd();
      try {
        process.chdir(this.cwd);
        const { generateAllFromConfig } = await import('./generate.js');
        await generateAllFromConfig({ check: true });
      } catch (error: unknown) {
        failures.push(
          `Generated artifact drift: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        process.chdir(prevCwd);
      }
    }

    return { ok: failures.length === 0, failures };
  }
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

export async function ciGateCommand(options: CiGateOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  console.log(chalk.bold('\nmanifest ci-gate'));
  const runner = new CiGateRunner(cwd, options);
  const result = await runner.run();
  if (result.ok) {
    console.log(chalk.green('✔ All drift gates passed.'));
    return;
  }
  console.error(chalk.red(`\n${result.failures.length} gate(s) failed:`));
  for (const failure of result.failures) {
    console.error(chalk.red(`  • ${failure}`));
  }
  process.exit(1);
}
