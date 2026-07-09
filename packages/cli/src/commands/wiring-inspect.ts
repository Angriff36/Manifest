/**
 * manifest wiring-inspect
 *
 * Inspect application source against a Manifest wiring contract.
 * Proves real consumers, reports unwired/stale/mismatched capabilities.
 * Explicit registries are overrides — not the primary source of truth.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import {
  inspectWiringConsumers,
  formatInspectReportText,
  parseConsumersRegistry,
  type WiringContract,
  type WiringInspectReport,
  type WiringInspectConfig,
} from '@angriff36/manifest/projections/wiring';

export interface WiringInspectCommandOptions {
  contract: string;
  root?: string[];
  config?: string;
  overrides?: string;
  format?: 'text' | 'json';
  strict?: boolean;
  strictCoverage?: boolean;
  failOn?: string;
  exclude?: string[];
  include?: string[];
}

export async function wiringInspectCommand(
  options: WiringInspectCommandOptions,
): Promise<WiringInspectReport> {
  const contractPath = path.resolve(options.contract);
  const contractRaw = JSON.parse(await fs.readFile(contractPath, 'utf8')) as WiringContract;
  if (contractRaw.$schema !== 'manifest-wiring-contract/v1') {
    throw new Error(
      `Contract $schema must be "manifest-wiring-contract/v1" (got ${String(contractRaw.$schema)})`,
    );
  }

  let fileConfig: Partial<WiringInspectConfig> = {};
  if (options.config) {
    const raw = JSON.parse(await fs.readFile(path.resolve(options.config), 'utf8'));
    fileConfig = raw as Partial<WiringInspectConfig>;
  }

  const roots =
    options.root && options.root.length > 0
      ? options.root
      : fileConfig.roots && fileConfig.roots.length > 0
        ? fileConfig.roots
        : ['.'];

  let overrides = fileConfig.overrides;
  if (options.overrides) {
    const raw = JSON.parse(await fs.readFile(path.resolve(options.overrides), 'utf8'));
    overrides = parseConsumersRegistry(raw);
  }

  const failOn = options.failOn
    ? (options.failOn.split(',').map(s => s.trim()) as WiringInspectConfig['failOn'])
    : fileConfig.failOn;

  const report = await inspectWiringConsumers({
    contract: contractRaw,
    roots,
    include: options.include ?? fileConfig.include,
    exclude: options.exclude ?? fileConfig.exclude,
    generated: fileConfig.generated,
    tests: fileConfig.tests,
    docs: fileConfig.docs,
    framework: fileConfig.framework ?? 'nextjs-app-router',
    overrides,
    strictCoverage: options.strictCoverage ?? fileConfig.strictCoverage ?? false,
    failOn,
  });

  if (options.format === 'json') {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const text = formatInspectReportText(report);
    for (const line of text.split('\n')) {
      if (line.includes('✗')) console.log(chalk.red(line));
      else if (line.startsWith('✓')) console.log(chalk.green(line));
      else if (
        line === 'WORKING' ||
        line.startsWith('WORKING ') ||
        line === 'FEATURE_THEATRE' ||
        line.startsWith('FEATURE_THEATRE ') ||
        line === 'BUILT_BUT_UNWIRED' ||
        line.startsWith('BUILT_BUT_UNWIRED ') ||
        line === 'BROKEN_UNPROVEN' ||
        line.startsWith('BROKEN_UNPROVEN ')
      ) {
        console.log(chalk.bold(line));
      } else {
        console.log(line);
      }
    }
  }

  if (options.strict && !report.ok) {
    process.exitCode = 1;
  }
  return report;
}
