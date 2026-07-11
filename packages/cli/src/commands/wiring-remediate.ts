/**
 * manifest wiring-remediate
 *
 * Inspect → plan → apply → verify automatic wiring repairs.
 * One-defect mode patches exactly one highest-confidence auto-fixable finding.
 *
 * Manifest does not design the UI — it repairs proven consumer wiring.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import {
  inspectWiringConsumers,
  remediateWiringSync,
  formatRemediateReportText,
  parseConsumersRegistry,
  loadApplicationSources,
  applyRepairPlan,
  type WiringContract,
  type WiringInspectConfig,
  type RemediateMode,
} from '@angriff36/manifest/projections/wiring';

export interface WiringRemediateCommandOptions {
  contract: string;
  root?: string[];
  config?: string;
  overrides?: string;
  format?: 'text' | 'json';
  mode?: 'plan' | 'dry-run' | 'apply' | 'one-defect';
  capability?: string;
  finding?: string;
  autoFixableOnly?: boolean;
  include?: string[];
  exclude?: string[];
  /** Write patches to disk (apply / one-defect). Default true for apply modes. */
  write?: boolean;
}

export async function wiringRemediateCommand(
  options: WiringRemediateCommandOptions,
): Promise<void> {
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

  const cwd = process.cwd();
  let fileContents = await loadApplicationSources(roots, cwd);
  if (options.include && options.include.length > 0) {
    const includes = options.include.map((p) => p.toLowerCase());
    fileContents = new Map(
      [...fileContents.entries()].filter(([file]) =>
        includes.some((p) => file.toLowerCase().includes(p)),
      ),
    );
  }

  const mode = (options.mode ?? 'plan') as RemediateMode;
  const shouldWrite = options.write !== false && (mode === 'apply' || mode === 'one-defect');

  const inspectConfig: WiringInspectConfig = {
    roots,
    include: options.include ?? fileConfig.include,
    exclude: options.exclude ?? fileConfig.exclude,
    generated: fileConfig.generated,
    tests: fileConfig.tests,
    docs: fileConfig.docs,
    framework: fileConfig.framework ?? 'nextjs-app-router',
    overrides,
    strictCoverage: fileConfig.strictCoverage ?? false,
    failOn: fileConfig.failOn,
  };

  const report = await inspectWiringConsumers({
    contract: contractRaw,
    fileContents,
    ...inspectConfig,
  });

  const result = remediateWiringSync({
    contract: contractRaw,
    fileContents,
    inspectConfig,
    mode,
    capabilityId: options.capability,
    findingId: options.finding,
    autoFixableOnly: options.autoFixableOnly ?? false,
    report,
  });

  if (shouldWrite && result.applied.some((a) => a.applied)) {
    let current = fileContents;
    for (const plan of result.plans) {
      if (!result.applied.some((a) => a.findingId === plan.findingId && a.applied)) continue;
      const patch = applyRepairPlan(plan, current);
      if (!patch.ok) continue;
      current = patch.nextContents;
      for (const file of patch.filesChanged) {
        const content =
          current.get(file) ??
          [...current.entries()].find(
            ([k]) => k.replace(/\\/g, '/') === file.replace(/\\/g, '/'),
          )?.[1];
        if (content === undefined) continue;
        const abs = path.isAbsolute(file) ? file : path.resolve(cwd, file);
        await fs.writeFile(abs, content, 'utf8');
      }
    }
  }

  if (options.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const text = formatRemediateReportText(result);
    for (const line of text.split('\n')) {
      if (line.includes('✗')) console.log(chalk.red(line));
      else if (line.startsWith('✓')) console.log(chalk.green(line));
      else console.log(line);
    }
    if (result.applied[0]?.verification) {
      console.log('');
      console.log(
        result.applied[0].verification.ok
          ? chalk.green('Manifest repaired the wiring')
          : chalk.yellow('Verification incomplete'),
      );
    }
    for (const u of result.unresolved.slice(0, 5)) {
      if (u.decision === 'ambiguous-product-decision') {
        console.log(
          chalk.yellow('Manifest cannot safely determine product placement: ' + u.message),
        );
      }
    }
  }

  if ((mode === 'apply' || mode === 'one-defect') && !result.ok) {
    process.exitCode = 1;
  }
}
