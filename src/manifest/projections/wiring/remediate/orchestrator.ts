/**
 * Wiring remediation orchestrator:
 * inspect → plan → apply → verify
 *
 * One-defect mode patches exactly one highest-priority auto-fixable finding.
 */

import type { WiringContract } from '../types.js';
import {
  inspectWiringConsumers,
  inspectWiringConsumersSync,
} from '../inspect/inspector.js';
import type { WiringInspectConfig, WiringInspectReport } from '../inspect/types.js';
import { planWiringRepairs } from './planner.js';
import { applyRepairPlan, applyRepairPlans } from './patch-engine.js';
import { verifyRepair } from './verifier.js';
import type {
  RemediateReport,
  RepairPlan,
  AppliedRepairResult,
} from './types.js';
import { WIRING_REMEDIATE_REPORT_SCHEMA } from './types.js';

export type RemediateMode = 'plan' | 'dry-run' | 'apply' | 'one-defect';

export interface RemediateOptions {
  contract: WiringContract;
  fileContents: Map<string, string>;
  inspectConfig?: Partial<WiringInspectConfig>;
  mode: RemediateMode;
  /** Apply only this capability. */
  capabilityId?: string;
  /** Apply only this finding id. */
  findingId?: string;
  /** When true, only auto-fixable (not repairable-with-existing-pattern). */
  autoFixableOnly?: boolean;
  /** Precomputed inspect report (optional). */
  report?: WiringInspectReport;
  /** Write mutated contents back via callback (disk apply). */
  writeFile?: (path: string, content: string) => void | Promise<void>;
}

export function remediateWiringSync(options: RemediateOptions): RemediateReport {
  const inspectConfig: WiringInspectConfig = {
    roots: options.inspectConfig?.roots ?? ['.'],
    ...options.inspectConfig,
  };

  const report =
    options.report ??
    inspectWiringConsumersSync({
      contract: options.contract,
      fileContents: options.fileContents,
      config: inspectConfig,
    });

  const bundle = planWiringRepairs({
    contract: options.contract,
    report,
    fileContents: options.fileContents,
    capabilityId: options.capabilityId,
    findingId: options.findingId,
  });

  let plans = bundle.plans;
  if (options.autoFixableOnly) {
    plans = plans.filter(p => p.decision === 'auto-fixable');
  }

  if (options.mode === 'plan') {
    return {
      $schema: WIRING_REMEDIATE_REPORT_SCHEMA,
      mode: 'plan',
      ok: true,
      plans,
      applied: [],
      changedFiles: [],
      unresolved: plans
        .filter(p => !p.automaticApplicationAllowed)
        .map(p => ({
          findingId: p.findingId,
          decision: p.decision,
          message: p.rationale,
        })),
      verification: { inspectedAfter: false, allAppliedResolved: true },
    };
  }

  // Prefer auto-fixable, then other automaticApplicationAllowed plans.
  // Within that, prefer repair kinds that reverse a proven wrong expression
  // over add-required-input (which often cites a symbol not in the payload file).
  const selectable = sortRepairCandidates(
    plans.filter(p => p.automaticApplicationAllowed),
  );

  if (options.mode === 'dry-run') {
    return {
      $schema: WIRING_REMEDIATE_REPORT_SCHEMA,
      mode: 'dry-run',
      ok: true,
      plans,
      applied: selectable.map(p => ({
        findingId: p.findingId,
        applied: false,
        skippedReason: 'dry-run',
        filesChanged: p.edits.map(e => e.file),
        editsApplied: 0,
      })),
      changedFiles: [...new Set(selectable.flatMap(p => p.edits.map(e => e.file)))],
      unresolved: plans
        .filter(p => !p.automaticApplicationAllowed)
        .map(p => ({
          findingId: p.findingId,
          decision: p.decision,
          message: p.rationale,
        })),
      verification: { inspectedAfter: false, allAppliedResolved: true },
    };
  }

  // apply / one-defect
  let current = new Map(options.fileContents);
  const applied: AppliedRepairResult[] = [];
  const changedFiles = new Set<string>();

  for (const plan of selectable) {
    const patch = applyRepairPlan(plan, current);
    if (!patch.ok) {
      applied.push({
        findingId: plan.findingId,
        applied: false,
        skippedReason: patch.skippedReason,
        filesChanged: [],
        editsApplied: 0,
      });
      // Skip unapplicable plans (one-defect keeps searching).
      continue;
    }

    const verification = verifyRepair(
      plan,
      options.contract,
      patch.nextContents,
      inspectConfig,
    );

    if (verification.ok === false) {
      // Patch applied in AST but reinspect still sees the defect — do not keep it.
      applied.push({
        findingId: plan.findingId,
        applied: false,
        skippedReason:
          verification.message ??
          'verification failed — finding still present after patch',
        filesChanged: [],
        editsApplied: 0,
        verification,
      });
      continue;
    }

    current = patch.nextContents;
    for (const f of patch.filesChanged) changedFiles.add(f);

    applied.push({
      findingId: plan.findingId,
      applied: true,
      filesChanged: patch.filesChanged,
      editsApplied: patch.editsApplied,
      verification,
    });

    if (options.writeFile) {
      for (const file of patch.filesChanged) {
        const content = current.get(file) ?? [...current.entries()].find(
          ([k]) => k.replace(/\\/g, '/') === file.replace(/\\/g, '/'),
        )?.[1];
        if (content !== undefined) {
          void options.writeFile(file, content);
        }
      }
    }

    // one-defect: stop after first verified successful apply
    if (options.mode === 'one-defect') break;
  }

  const allResolved = applied
    .filter(a => a.applied)
    .every(a => a.verification?.ok !== false);

  return {
    $schema: WIRING_REMEDIATE_REPORT_SCHEMA,
    mode: options.mode,
    ok: allResolved && applied.some(a => a.applied),
    plans,
    applied,
    changedFiles: [...changedFiles],
    unresolved: plans
      .filter(p => !p.automaticApplicationAllowed)
      .map(p => ({
        findingId: p.findingId,
        decision: p.decision,
        message: p.rationale,
      })),
    verification: {
      inspectedAfter: applied.some(a => a.verification !== undefined),
      allAppliedResolved: allResolved,
    },
  };
}

export async function remediateWiring(options: RemediateOptions): Promise<RemediateReport> {
  if (!options.report) {
    const report = await inspectWiringConsumers({
      contract: options.contract,
      fileContents: options.fileContents,
      roots: options.inspectConfig?.roots ?? ['.'],
      ...options.inspectConfig,
    });
    return remediateWiringSync({ ...options, report });
  }
  return remediateWiringSync(options);
}

export function selectNextAutoFixable(plans: RepairPlan[]): RepairPlan | undefined {
  return sortRepairCandidates(
    plans.filter(p => p.automaticApplicationAllowed),
  )[0];
}

/** Deterministic priority for one-defect candidate selection. */
function sortRepairCandidates(plans: RepairPlan[]): RepairPlan[] {
  const kindRank = (kind: string): number => {
    switch (kind) {
      case 'replace-payload-expression':
        return 0;
      case 'remove-invalid-literal':
        return 1;
      case 'replace-empty-date-sentinel':
        return 2;
      case 'move-trusted-input-server-side':
        return 3;
      case 'replace-fake-lifecycle-binding':
        return 4;
      case 'migrate-to-safe-binding':
        return 5;
      case 'add-invalidation':
        return 6;
      case 'wire-existing-control':
        return 7;
      case 'add-required-input':
        return 8;
      default:
        return 9;
    }
  };
  const decisionRank = (d: string): number =>
    d === 'auto-fixable' ? 0 : d === 'repairable-with-existing-pattern' ? 1 : 2;
  const confidenceRank = (c: string): number =>
    c === 'high' ? 0 : c === 'medium' ? 1 : 2;

  return [...plans].sort((a, b) => {
    const byDecision = decisionRank(a.decision) - decisionRank(b.decision);
    if (byDecision !== 0) return byDecision;
    const byKind = kindRank(a.repairKind) - kindRank(b.repairKind);
    if (byKind !== 0) return byKind;
    const byConf = confidenceRank(a.confidence) - confidenceRank(b.confidence);
    if (byConf !== 0) return byConf;
    return a.findingId.localeCompare(b.findingId);
  });
}

export function formatRemediateReportText(report: RemediateReport): string {
  const lines: string[] = [];
  lines.push(`Wiring remediate (${report.mode}) — ${report.ok ? 'OK' : 'INCOMPLETE'}`);
  lines.push(
    `Plans: ${report.plans.length} (applied ${report.applied.filter(a => a.applied).length})`,
  );
  if (report.changedFiles.length) {
    lines.push(`Changed files: ${report.changedFiles.join(', ')}`);
  }
  for (const a of report.applied) {
    const mark = a.applied ? '✓' : '·';
    lines.push(
      `${mark} ${a.findingId}` +
        (a.verification ? ` — ${a.verification.message}` : '') +
        (a.skippedReason ? ` (${a.skippedReason})` : ''),
    );
  }
  for (const u of report.unresolved) {
    lines.push(`✗ ${u.decision}: ${u.message}`);
  }
  return lines.join('\n');
}

export { applyRepairPlans };
