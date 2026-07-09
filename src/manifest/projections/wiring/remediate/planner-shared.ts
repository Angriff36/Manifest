/**
 * Shared helpers for wiring repair planners.
 */

import type { WiringCommandDescriptor } from '../types.js';
import type { ContractMismatch, ConsumerEvidence } from '../inspect/types.js';
import type {
  RepairPlan,
  RepairDecisionClass,
  RepairKind,
  RepairEditSpec,
  RepairPrecondition,
} from './types.js';
import { fingerprintSnippet } from './ast-utils.js';

export function basePlan(
  mismatch: ContractMismatch,
  cap: WiringCommandDescriptor,
  evidence: ConsumerEvidence[],
  kind: RepairKind,
  findingId: string,
): Omit<
  RepairPlan,
  | 'decision'
  | 'confidence'
  | 'automaticApplicationAllowed'
  | 'rationale'
  | 'sourceFiles'
  | 'edits'
  | 'priority'
> & { edits: RepairEditSpec[]; priority: number; sourceFiles: string[] } {
  return {
    findingId,
    entity: cap.entity,
    command: cap.command,
    capabilityId: cap.capabilityId,
    repairKind: kind,
    mismatch,
    evidence,
    sourceFiles: [mismatch.source.file],
    consumerTrace: [mismatch.source, ...evidence.map(e => e.source)],
    preconditions: [],
    postconditions: [],
    edits: [],
    verificationMethod: 'reinspect',
    priority: 50,
  };
}

export function classify(
  plan: Omit<
    RepairPlan,
    'decision' | 'confidence' | 'automaticApplicationAllowed' | 'rationale' | 'sourceFiles'
  > & { sourceFiles?: string[]; rationale?: string },
  decision: RepairDecisionClass | 'low-confidence',
  rationale: string,
  sourceFiles: string[],
): RepairPlan {
  const normalized: RepairDecisionClass =
    decision === 'low-confidence' ? 'unsafe-to-apply' : decision;
  const allowed =
    normalized === 'auto-fixable' || normalized === 'repairable-with-existing-pattern';
  return {
    ...plan,
    decision: normalized,
    confidence: allowed ? 'high' : normalized === 'unsafe-to-apply' ? 'low' : 'medium',
    automaticApplicationAllowed: allowed,
    rationale,
    sourceFiles: sourceFiles.length ? sourceFiles : plan.sourceFiles ?? [],
  };
}

export function precondition(file: string, content: string, snippet: string): RepairPrecondition {
  return {
    id: `fp:${file}:${fingerprintSnippet(snippet)}`,
    description: `Source still contains expected snippet in ${file}`,
    sourceFingerprint: fingerprintSnippet(snippet || content.slice(0, 120)),
  };
}

export function findingIdOf(mismatch: ContractMismatch): string {
  return `${mismatch.kind}:${mismatch.capabilityId}:${mismatch.parameter ?? ''}:${mismatch.source.file}`;
}

export function priorityFor(kind: RepairKind, cap: WiringCommandDescriptor): number {
  const cmd = cap.command.toLowerCase();
  const isPrimary =
    cmd === 'create' || cmd === 'update' || cmd === 'delete' || cmd.startsWith('create');
  const base =
    kind === 'replace-payload-expression' || kind === 'add-required-input'
      ? 10
      : kind === 'move-trusted-input-server-side' || kind === 'migrate-to-safe-binding'
        ? 20
      : kind === 'replace-empty-date-sentinel' || kind === 'remove-invalid-literal'
        ? 15
      : kind === 'replace-fake-lifecycle-binding'
        ? 30
      : kind === 'add-invalidation'
        ? 40
      : kind === 'wire-existing-control'
        ? 50
        : 60;
  return isPrimary ? base : base + 5;
}

export function findNearbyAllowedLiteral(
  content: string,
  param: string,
  enumValues: string[] | undefined,
  min: number | undefined,
  max: number | undefined,
): string | undefined {
  if (enumValues) {
    for (const v of enumValues) {
      const re = new RegExp(`\\b${escapeRe(param)}\\s*[:=]\\s*["']${escapeRe(v)}["']`);
      if (re.test(content)) return JSON.stringify(v);
    }
  }
  if (typeof min === 'number' && typeof max === 'number') {
    for (let n = min; n <= max; n++) {
      const re = new RegExp(`\\b${escapeRe(param)}\\s*[:=]\\s*${n}\\b`);
      if (re.test(content)) return String(n);
    }
    if (max - min <= 4) return String(min);
  }
  return undefined;
}

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
