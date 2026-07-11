/**
 * Shared fixtures for wiring remediation tests.
 */

import { expect } from 'vitest';
import { compileToIR } from '../../../ir-compiler.js';
import { buildWiringContract } from '../contract-builder.js';
import { inspectWiringConsumersSync, fileMapFromRecord } from '../inspect/inspector.js';
import type { WiringContract } from '../types.js';
import { remediateWiringSync, planWiringRepairs, applyRepairPlan } from './index.js';

export async function contractFrom(source: string): Promise<WiringContract> {
  const { ir, diagnostics } = await compileToIR(source);
  const errors = diagnostics.filter((d) => d.severity === 'error');
  expect(errors, errors.map((e) => e.message).join('\n')).toHaveLength(0);
  expect(ir).not.toBeNull();
  return buildWiringContract(ir!);
}

export const REMEDIATE_DOMAIN = `
enum Priority { low, medium, high }

entity Task {
  property required id: string
  property status: string = "draft"
  property title: string = ""
  property tags: array<string> = []
  property priority: number = 1
  property dueDate: date = "2026-01-01"
  property completedBy: string = ""
  property summary: string = ""

  transition status from "draft" to ["published", "archived"]
  transition status from "published" to ["draft", "archived"]

  command create(
    title: string,
    summary: string,
    tags: array<string>,
    priority: number,
    dueDate: date,
    completedBy: string from context.actorId
  ) {
    constraint titleNonEmpty: length(title) >= 1 "title required"
    constraint priorityRange: between(priority, 1, 5) "priority 1-5"
    mutate title = title
    mutate summary = summary
    mutate tags = tags
    mutate priority = priority
    mutate dueDate = dueDate
    mutate completedBy = completedBy
  }

  command markPublished() {
    mutate status = "published"
  }

  command archive() {
    mutate status = "archived"
  }

  command markCompleted(completedByUserId: string from context.actorId) {
    mutate completedBy = completedByUserId
  }

  store Task in memory
}
`;

/** Apply repairs for a capability and return the resulting file map. */
export function applyAndGetMap(
  contract: WiringContract,
  files: Map<string, string>,
  capabilityId: string,
): Map<string, string> {
  const report = inspectWiringConsumersSync({
    contract,
    fileContents: files,
    config: { roots: ['.'] },
  });
  const bundle = planWiringRepairs({
    contract,
    report,
    fileContents: files,
    capabilityId,
  });
  let current = new Map(files);
  for (const plan of bundle.plans) {
    if (!plan.automaticApplicationAllowed) continue;
    const patch = applyRepairPlan(plan, current);
    if (patch.ok) current = patch.nextContents;
  }
  return current;
}

export function resultToMap(
  original: Map<string, string>,
  result: ReturnType<typeof remediateWiringSync>,
): Map<string, string> {
  let current = new Map(original);
  for (const plan of result.plans) {
    if (!result.applied.some((a) => a.findingId === plan.findingId && a.applied)) continue;
    const patch = applyRepairPlan(plan, current);
    if (patch.ok) current = patch.nextContents;
  }
  return current;
}

export {
  fileMapFromRecord,
  inspectWiringConsumersSync,
  remediateWiringSync,
  planWiringRepairs,
  applyRepairPlan,
};
export type { WiringContract };
