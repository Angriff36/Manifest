/**
 * manifest audit constitution
 *
 * Umbrella command that runs every constitution detector and aggregates
 * findings. Under --strict, any error finding causes a non-zero exit.
 *
 * Authority: docs/capsule-pro/constitution.md §6, §9, §11, §13, §17.
 */

import path from 'node:path';
import chalk from 'chalk';
import type { AuditFinding, Detector, DetectorContext } from '../audit/types';
import { directWritesDetector } from '../audit/direct-writes';
import { eventFabricationDetector } from '../audit/event-fabrication';
import { routeDriftDetector } from '../audit/route-drift';
import { missingTestsDetector } from '../audit/missing-tests';
import { bypassViolationsDetector } from '../audit/bypass-violations';

export interface AuditConstitutionOptions {
  root?: string;
  only?: string;
  format?: 'text' | 'json';
  strict?: boolean;
  commandsRegistry?: string;
  bypassRegistry?: string;
}

export interface AuditConstitutionResult {
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

export async function auditConstitutionCommand(
  options: AuditConstitutionOptions = {}
): Promise<AuditConstitutionResult> {
  const root = path.resolve(process.cwd(), options.root ?? '.');
  const detectors = selectDetectors(options.only);

  const ctx: DetectorContext = {
    root,
    commandsRegistry: options.commandsRegistry,
    bypassRegistry: options.bypassRegistry,
  };

  const findings: AuditFinding[] = [];
  const detectorsRun: string[] = [];
  for (const detector of detectors) {
    detectorsRun.push(detector.name);
    findings.push(...(await detector.run(ctx)));
  }

  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const warningCount = findings.filter((f) => f.severity === 'warning').length;
  const result: AuditConstitutionResult = { findings, errorCount, warningCount, detectorsRun };

  if (options.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (findings.length === 0) {
      console.log(chalk.green('Constitution audit clean.'));
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
