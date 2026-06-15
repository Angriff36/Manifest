/**
 * manifest audit-governance
 *
 * Umbrella command that runs every governance detector and aggregates
 * findings. Under --strict, any error finding causes a non-zero exit.
 *
 * Bundled detectors:
 *   direct-writes        — flag direct ORM writes outside runtime adapters
 *   event-fabrication    — flag semantic event creation outside runtime
 *   route-drift          — flag per-command routes that bypass the dispatcher
 *   missing-tests        — flag governed commands without conformance/test refs
 *   bypass-violations    — cross-check direct writes against the bypass registry
 *
 * Detector wiring is application-neutral: detectors read a compiled IR
 * (or paths supplied via flags) and emit findings against the inspected
 * repo root. Downstream governance policies pick which findings are
 * actionable via the bypass registry and CI configuration.
 */

import path from 'node:path';
import chalk from 'chalk';
import type { AuditFinding, Detector, DetectorContext } from '../audit/types.js';
import { directWritesDetector } from '../audit/direct-writes.js';
import { eventFabricationDetector } from '../audit/event-fabrication.js';
import { routeDriftDetector } from '../audit/route-drift.js';
import { missingTestsDetector } from '../audit/missing-tests.js';
import { bypassViolationsDetector } from '../audit/bypass-violations.js';

export interface AuditGovernanceOptions {
  root?: string;
  only?: string;
  format?: 'text' | 'json';
  strict?: boolean;
  commandsRegistry?: string;
  bypassRegistry?: string;
  /** ORM client identifier the direct-write detectors match on (default: prisma). */
  writeReceiver?: string;
}

export interface AuditGovernanceResult {
  findings: AuditFinding[];
  errorCount: number;
  warningCount: number;
  detectorsRun: string[];
}

const ALL_DETECTORS: Detector[] = [
  directWritesDetector,
  eventFabricationDetector,
  routeDriftDetector,
  missingTestsDetector,
  bypassViolationsDetector,
];

function selectDetectors(only?: string): Detector[] {
  if (!only) return ALL_DETECTORS;
  const requested = new Set(only.split(',').map((s) => s.trim()).filter(Boolean));
  const selected = ALL_DETECTORS.filter((d) => requested.has(d.name));
  // If `--only` is given but no detector name matches, return empty so the
  // caller can decide whether that is a misconfiguration.
  return selected;
}

export async function auditGovernanceCommand(
  options: AuditGovernanceOptions = {}
): Promise<AuditGovernanceResult> {
  const root = path.resolve(process.cwd(), options.root ?? '.');
  const detectors = selectDetectors(options.only);

  const ctx: DetectorContext = {
    root,
    commandsRegistry: options.commandsRegistry,
    bypassRegistry: options.bypassRegistry,
    writeReceiver: options.writeReceiver,
  };

  const findings: AuditFinding[] = [];
  const detectorsRun: string[] = [];
  for (const detector of detectors) {
    detectorsRun.push(detector.name);
    findings.push(...(await detector.run(ctx)));
  }

  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const warningCount = findings.filter((f) => f.severity === 'warning').length;
  const result: AuditGovernanceResult = { findings, errorCount, warningCount, detectorsRun };

  if (options.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (findings.length === 0) {
      console.log(chalk.green('Governance audit clean.'));
    } else {
      for (const f of findings) {
        const tag = f.severity === 'error' ? chalk.red('error') : chalk.yellow('warning');
        const loc = f.file ? ` [${f.file}]` : '';
        console.log(`${tag} ${f.detector} ${f.code}: ${f.message}${loc}`);
      }
    }
    console.log(
      chalk.gray(`Detectors: ${detectorsRun.join(', ')} — ${errorCount} errors, ${warningCount} warnings`)
    );
  }
  return result;
}
