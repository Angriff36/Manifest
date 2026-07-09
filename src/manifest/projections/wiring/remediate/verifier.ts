/**
 * Post-repair verification — reinspect and prove the finding is resolved.
 */

import type { WiringContract } from '../types.js';
import {
  inspectWiringConsumersSync,
  type InspectWiringOptions,
} from '../inspect/inspector.js';
import type { WiringInspectConfig, ContractMismatch } from '../inspect/types.js';
import type { RepairPlan, RepairVerificationResult } from './types.js';

export function verifyRepair(
  plan: RepairPlan,
  contract: WiringContract,
  fileContents: Map<string, string>,
  inspectConfig?: Partial<WiringInspectConfig>,
  /** Mismatches observed before the patch — used to detect newly introduced defects. */
  baselineMismatches?: ContractMismatch[],
): RepairVerificationResult {
  const report = inspectWiringConsumersSync({
    contract,
    fileContents,
    config: {
      roots: inspectConfig?.roots ?? ['.'],
      ...inspectConfig,
    },
  });

  const remaining = report.mismatches.filter(m => mismatchMatchesPlan(m, plan));
  const finding = report.findings.find(f => f.capabilityId === plan.capabilityId);
  const requireConsumed = plan.postconditions.some(p => p.requireConsumed);
  const capabilityConsumed = finding?.status === 'consumed';

  const kindsRequired = new Set(
    plan.postconditions.flatMap(p => p.resolvedMismatchKinds),
  );
  const findingResolved =
    remaining.length === 0 &&
    (kindsRequired.size === 0 ||
      !report.mismatches.some(
        m =>
          m.capabilityId === plan.capabilityId &&
          kindsRequired.has(m.kind) &&
          (plan.mismatch?.parameter
            ? m.parameter === plan.mismatch.parameter
            : true),
      ));

  const baselineKeys = new Set(
    (baselineMismatches ?? []).map(mismatchKey),
  );
  const newDefects = report.mismatches.filter(m => {
    if (m.capabilityId !== plan.capabilityId || !m.defect) return false;
    if (mismatchMatchesPlan(m, plan)) return false;
    // Pre-existing defects for other parameters/kinds are not "new".
    if (baselineMismatches && baselineKeys.has(mismatchKey(m))) return false;
    if (!baselineMismatches) return false;
    return true;
  });

  const ok =
    findingResolved &&
    newDefects.length === 0 &&
    (!requireConsumed || capabilityConsumed === true);

  return {
    ok,
    findingResolved,
    capabilityConsumed,
    remainingMismatches: remaining,
    message: ok
      ? `Repair verified: ${plan.findingId} resolved`
      : `Repair incomplete: ${plan.findingId} — remaining ${remaining.length} mismatch(es)` +
        (newDefects.length
          ? `; introduced ${newDefects.length} new defect(s)`
          : '') +
        (requireConsumed && !capabilityConsumed ? '; capability not consumed' : ''),
  };
}

function mismatchKey(m: ContractMismatch): string {
  return `${m.kind}:${m.capabilityId}:${m.parameter ?? ''}:${m.source.file}`;
}

function mismatchMatchesPlan(m: ContractMismatch, plan: RepairPlan): boolean {
  if (m.capabilityId !== plan.capabilityId && m.capabilityId !== plan.mismatch?.capabilityId) {
    return false;
  }
  if (plan.mismatch) {
    if (m.kind !== plan.mismatch.kind) return false;
    if (plan.mismatch.parameter && m.parameter !== plan.mismatch.parameter) return false;
  }
  return true;
}

export async function verifyRepairAsync(
  plan: RepairPlan,
  options: InspectWiringOptions & { fileContents: Map<string, string> },
): Promise<RepairVerificationResult> {
  return verifyRepair(plan, options.contract, options.fileContents, options);
}
