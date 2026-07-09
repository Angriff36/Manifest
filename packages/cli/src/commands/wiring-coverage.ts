/**
 * manifest wiring-coverage
 *
 * Compare a generated wiring contract against an application consumer registry.
 * Reports unwired capabilities and stale consumer references.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import {
  validateWiringCoverage,
  parseConsumersRegistry,
  type WiringContract,
  type WiringCoverageReport,
} from '@angriff36/manifest/projections/wiring';

export interface WiringCoverageOptions {
  contract: string;
  consumers: string;
  format?: 'text' | 'json';
  strict?: boolean;
}

export async function wiringCoverageCommand(
  options: WiringCoverageOptions,
): Promise<WiringCoverageReport> {
  const contractPath = path.resolve(options.contract);
  const consumersPath = path.resolve(options.consumers);
  const contractRaw = JSON.parse(await fs.readFile(contractPath, 'utf8')) as WiringContract;
  if (contractRaw.$schema !== 'manifest-wiring-contract/v1') {
    throw new Error(
      `Contract $schema must be "manifest-wiring-contract/v1" (got ${String(contractRaw.$schema)})`,
    );
  }
  const consumersRaw = JSON.parse(await fs.readFile(consumersPath, 'utf8'));
  const registry = parseConsumersRegistry(consumersRaw);
  const report = validateWiringCoverage(contractRaw, registry);

  if (options.format === 'json') {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(chalk.bold('Manifest wiring coverage'));
    console.log(
      `  capabilities=${report.summary.totalCapabilities} exposed=${report.summary.exposed} backend-only=${report.summary.backendOnly} deferred=${report.summary.deferred} unwired=${report.summary.unwired} stale=${report.summary.staleConsumers}`,
    );
    for (const f of report.findings.filter((finding) => finding.defect)) {
      console.log(chalk.red(`  ✗ [${f.status}] ${f.message}`));
    }
    if (report.ok) {
      console.log(chalk.green('  ✓ coverage ok'));
    }
  }

  if (options.strict && !report.ok) {
    process.exitCode = 1;
  }
  return report;
}
