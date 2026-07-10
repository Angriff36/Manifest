/**
 * Post-repair verification — reinspect and prove the finding is resolved.
 *
 * For wire-existing-control, consumer existence alone is not enough: the
 * semantic match that justified the control must still hold.
 */

import type { WiringContract } from '../types.js';
import {
  inspectWiringConsumersSync,
  type InspectWiringOptions,
} from '../inspect/inspector.js';
import type { WiringInspectConfig, ContractMismatch } from '../inspect/types.js';
import type { RepairPlan, RepairVerificationResult } from './types.js';
import { verifyWiredControlSemantics } from './control-semantic-match.js';

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
      !report.mismatches.some(m => {
        if (m.capabilityId !== plan.capabilityId) return false;
        if (!kindsRequired.has(m.kind)) return false;
        if (plan.repairKind === 'expand-partial-to-full-body') {
          return mismatchInPlanFiles(m, plan);
        }
        if (plan.mismatch?.parameter) {
          return m.parameter === plan.mismatch.parameter;
        }
        return true;
      }));

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

  const semantic = verifyWireExistingControlSemantics(plan, contract, fileContents);

  const ok =
    findingResolved &&
    newDefects.length === 0 &&
    (!requireConsumed || capabilityConsumed === true) &&
    semantic.ok;

  return {
    ok,
    findingResolved: findingResolved && semantic.ok,
    capabilityConsumed,
    remainingMismatches: remaining,
    message: ok
      ? `Repair verified: ${plan.findingId} resolved`
      : !semantic.ok
        ? `Repair incomplete: ${plan.findingId} — ${semantic.reason}`
        : `Repair incomplete: ${plan.findingId} — remaining ${remaining.length} mismatch(es)` +
          (newDefects.length
            ? `; introduced ${newDefects.length} new defect(s)`
            : '') +
          (requireConsumed && !capabilityConsumed ? '; capability not consumed' : ''),
  };
}

function verifyWireExistingControlSemantics(
  plan: RepairPlan,
  contract: WiringContract,
  fileContents: Map<string, string>,
): { ok: boolean; reason: string } {
  if (plan.repairKind !== 'wire-existing-control') {
    return { ok: true, reason: '' };
  }
  const cap = contract.capabilities.find(c => c.capabilityId === plan.capabilityId);
  if (!cap) {
    return { ok: false, reason: `Unknown capability ${plan.capabilityId}` };
  }
  const wireEdit = plan.edits.find(e => e.operation.type === 'wire-control-to-binding');
  if (!wireEdit || wireEdit.operation.type !== 'wire-control-to-binding') {
    return { ok: false, reason: 'wire-existing-control plan missing wire edit' };
  }
  const file = wireEdit.file;
  const content =
    fileContents.get(file) ??
    fileContents.get(file.replace(/\\/g, '/')) ??
    [...fileContents.entries()].find(
      ([k]) => k.replace(/\\/g, '/') === file.replace(/\\/g, '/'),
    )?.[1];
  if (!content) {
    return { ok: false, reason: `Patched file not loaded: ${file}` };
  }
  const verdict = verifyWiredControlSemantics(
    cap,
    file,
    content,
    wireEdit.operation.bindingCallee,
    wireEdit.operation.identityExpression,
  );
  return { ok: verdict.ok, reason: verdict.reason };
}

function mismatchKey(m: ContractMismatch): string {
  return `${m.kind}:${m.capabilityId}:${m.parameter ?? ''}:${m.source.file}`;
}

function mismatchMatchesPlan(m: ContractMismatch, plan: RepairPlan): boolean {
  if (m.capabilityId !== plan.capabilityId && m.capabilityId !== plan.mismatch?.capabilityId) {
    return false;
  }
  // Expand-partial resolves every missing_required_input at the edited call site(s).
  if (plan.repairKind === 'expand-partial-to-full-body') {
    if (m.kind !== 'missing_required_input') return false;
    return mismatchInPlanFiles(m, plan);
  }
  if (plan.mismatch) {
    if (m.kind !== plan.mismatch.kind) return false;
    if (plan.mismatch.parameter && m.parameter !== plan.mismatch.parameter) return false;
  }
  return true;
}

function mismatchInPlanFiles(m: ContractMismatch, plan: RepairPlan): boolean {
  const files = new Set(
    [...plan.sourceFiles, ...plan.edits.map(e => e.file)].map(normalizePath),
  );
  return files.has(normalizePath(m.source.file));
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

export async function verifyRepairAsync(
  plan: RepairPlan,
  options: InspectWiringOptions & { fileContents: Map<string, string> },
): Promise<RepairVerificationResult> {
  return verifyRepair(plan, options.contract, options.fileContents, options);
}
