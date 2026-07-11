/**
 * Same-call runtime user.id proof for add-required-input.
 *
 * Live pattern: Proposal.remove body missing userId while the same
 * runManifestCommand already passes user: { id: user.id }.
 */

import { describe, it, expect } from 'vitest';
import {
  contractFrom,
  fileMapFromRecord,
  resultToMap,
  inspectWiringConsumersSync,
  remediateWiringSync,
  planWiringRepairs,
} from './remediate-test-fixtures.js';

const PROPOSAL_DOMAIN = `
entity Proposal {
  property required id: string
  property status: string = "draft"
  property removedBy: string = ""

  command remove(userId: string) {
    mutate status = "removed"
    mutate removedBy = userId
  }

  command send(userId: string) {
    mutate status = "sent"
    mutate removedBy = userId
  }

  store Proposal in memory
}

entity Task {
  property required id: string
  property status: string = "open"

  command complete(userId: string) {
    mutate status = "done"
  }

  store Task in memory
}
`;

const ACTION_PATH = 'apps/app/app/(sales)/crm/proposals/actions.ts';
const UI_PATH = 'apps/app/app/(sales)/crm/proposals/page.tsx';

const DELETE_ACTION = `
"use server";
import { runManifestCommand } from "@/lib/manifest-command";

async function requireCurrentUser() {
  return { id: "u1", tenantId: "t1", role: "admin" };
}

export async function deleteProposal(id: string) {
  const user = await requireCurrentUser();
  const result = await runManifestCommand({
    entity: "Proposal",
    command: "remove",
    body: { id },
    user: { id: user.id, tenantId: user.tenantId, role: user.role },
  });
  return result;
}
`;

const DELETE_UI = `
import { deleteProposal } from "./actions";

export function ProposalsPage() {
  return (
    <button type="button" onClick={() => void deleteProposal("p1")}>
      Delete
    </button>
  );
}
`;

function liveFiles(action = DELETE_ACTION): Map<string, string> {
  return fileMapFromRecord({
    [ACTION_PATH]: action,
    [UI_PATH]: DELETE_UI,
  });
}

function reportFor(contract: Awaited<ReturnType<typeof contractFrom>>, files: Map<string, string>) {
  return inspectWiringConsumersSync({
    contract,
    fileContents: files,
    config: { roots: ['.'] },
  });
}

describe('add-required-input same-call runtime user.id', () => {
  it('R1. user: { id: user.id } on same runManifestCommand repairs missing userId', async () => {
    const contract = await contractFrom(PROPOSAL_DOMAIN);
    const files = liveFiles();
    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'Proposal.remove',
      autoFixableOnly: true,
    });
    expect(result.applied.some((a) => a.applied && a.verification?.ok)).toBe(true);
    const after = resultToMap(files, result).get(ACTION_PATH)!;
    expect(after).toMatch(/body:\s*\{[^}]*userId\s*:\s*user\.id/);
    expect(after).toMatch(/user:\s*\{\s*id:\s*user\.id/);
    const report = reportFor(contract, resultToMap(files, result));
    expect(
      report.mismatches.some(
        (m) =>
          m.kind === 'missing_required_input' &&
          m.capabilityId === 'Proposal.remove' &&
          m.parameter === 'userId',
      ),
    ).toBe(false);
  });

  it('R2. no runtime user.id means rejection', async () => {
    const contract = await contractFrom(PROPOSAL_DOMAIN);
    const files = liveFiles(`
"use server";
import { runManifestCommand } from "@/lib/manifest-command";
export async function deleteProposal(id: string) {
  await runManifestCommand({
    entity: "Proposal",
    command: "remove",
    body: { id },
  });
}
`);
    const report = reportFor(contract, files);
    const bundle = planWiringRepairs({ contract, report, fileContents: files });
    const auto = bundle.plans.filter(
      (p) =>
        p.automaticApplicationAllowed &&
        p.repairKind === 'add-required-input' &&
        p.capabilityId === 'Proposal.remove',
    );
    expect(auto).toHaveLength(0);
  });

  it('R3. conflicting equal-rank sources reject', async () => {
    const contract = await contractFrom(PROPOSAL_DOMAIN);
    const files = liveFiles(`
"use server";
import { runManifestCommand } from "@/lib/manifest-command";
export async function deleteProposal(id: string) {
  const user = { id: "a", tenantId: "t", role: "r" };
  const actorId = "b";
  await runManifestCommand({
    entity: "Proposal",
    command: "remove",
    body: { id },
    user: { id: user.id, tenantId: user.tenantId, role: user.role },
  });
  await runManifestCommand({
    entity: "Proposal",
    command: "send",
    body: { id, userId: actorId },
    user: { id: user.id, tenantId: user.tenantId, role: user.role },
  });
}
`);
    const report = reportFor(contract, files);
    const bundle = planWiringRepairs({ contract, report, fileContents: files });
    const auto = bundle.plans.filter(
      (p) =>
        p.automaticApplicationAllowed &&
        p.repairKind === 'add-required-input' &&
        p.mismatch?.parameter === 'userId' &&
        p.capabilityId === 'Proposal.remove',
    );
    expect(auto).toHaveLength(0);
  });

  it('R4. different identity sibling does not block same-call runtime user.id', async () => {
    const contract = await contractFrom(PROPOSAL_DOMAIN);
    const files = liveFiles(`
"use server";
import { runManifestCommand } from "@/lib/manifest-command";
export async function deleteProposal(id: string, otherId: string) {
  const user = { id: "u1", tenantId: "t", role: "r" };
  await runManifestCommand({
    entity: "Proposal",
    command: "send",
    body: { id: otherId, userId: user.id },
    user: { id: user.id, tenantId: user.tenantId, role: user.role },
  });
  await runManifestCommand({
    entity: "Proposal",
    command: "remove",
    body: { id },
    user: { id: user.id, tenantId: user.tenantId, role: user.role },
  });
}
`);
    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'Proposal.remove',
      autoFixableOnly: true,
    });
    expect(result.applied.some((a) => a.applied)).toBe(true);
    const after = resultToMap(files, result).get(ACTION_PATH)!;
    expect(after).toMatch(/command:\s*"remove"[\s\S]*?body:\s*\{[^}]*userId\s*:\s*user\.id/);
  });

  it('R5. different entity runtime user does not repair Proposal.remove', async () => {
    const contract = await contractFrom(PROPOSAL_DOMAIN);
    const files = fileMapFromRecord({
      [ACTION_PATH]: `
"use server";
import { runManifestCommand } from "@/lib/manifest-command";
export async function completeTask(id: string) {
  const user = { id: "u1", tenantId: "t", role: "r" };
  await runManifestCommand({
    entity: "Task",
    command: "complete",
    body: { id },
    user: { id: user.id, tenantId: user.tenantId, role: user.role },
  });
}
export async function deleteProposal(id: string) {
  await runManifestCommand({
    entity: "Proposal",
    command: "remove",
    body: { id },
  });
}
`,
      [UI_PATH]: DELETE_UI,
    });
    const report = reportFor(contract, files);
    const bundle = planWiringRepairs({ contract, report, fileContents: files });
    expect(
      bundle.plans.some(
        (p) => p.automaticApplicationAllowed && p.capabilityId === 'Proposal.remove',
      ),
    ).toBe(false);
  });

  it('R6. cross-function user.id evidence is rejected', async () => {
    const contract = await contractFrom(PROPOSAL_DOMAIN);
    const files = fileMapFromRecord({
      [ACTION_PATH]: `
"use server";
import { runManifestCommand } from "@/lib/manifest-command";
export async function sendProposal(id: string) {
  const user = { id: "u1", tenantId: "t", role: "r" };
  await runManifestCommand({
    entity: "Proposal",
    command: "send",
    body: { id, userId: user.id },
    user: { id: user.id, tenantId: user.tenantId, role: user.role },
  });
}
export async function deleteProposal(id: string) {
  await runManifestCommand({
    entity: "Proposal",
    command: "remove",
    body: { id },
  });
}
`,
      [UI_PATH]: DELETE_UI,
    });
    const report = reportFor(contract, files);
    const bundle = planWiringRepairs({ contract, report, fileContents: files });
    expect(
      bundle.plans.some(
        (p) => p.automaticApplicationAllowed && p.capabilityId === 'Proposal.remove',
      ),
    ).toBe(false);
  });

  it('R7. file-wide same-name userId without same-call proof rejects', async () => {
    const contract = await contractFrom(PROPOSAL_DOMAIN);
    const files = liveFiles(`
"use server";
import { runManifestCommand } from "@/lib/manifest-command";
const userId = "file-wide";
export async function deleteProposal(id: string) {
  await runManifestCommand({
    entity: "Proposal",
    command: "remove",
    body: { id },
  });
}
`);
    const report = reportFor(contract, files);
    const bundle = planWiringRepairs({ contract, report, fileContents: files });
    expect(
      bundle.plans.some(
        (p) => p.automaticApplicationAllowed && p.capabilityId === 'Proposal.remove',
      ),
    ).toBe(false);
  });

  it('R8. same-call user.id usage is the lexical availability proof', async () => {
    const contract = await contractFrom(PROPOSAL_DOMAIN);
    const files = liveFiles();
    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      autoFixableOnly: true,
    });
    expect(result.applied.some((a) => a.applied)).toBe(true);
  });

  it('R9. incompatible typed local userId does not win over runtime user.id', async () => {
    const contract = await contractFrom(PROPOSAL_DOMAIN);
    const files = liveFiles(`
"use server";
import { runManifestCommand } from "@/lib/manifest-command";
export async function deleteProposal(id: string) {
  const user = { id: "u1", tenantId: "t", role: "r" };
  const userId: number = 42;
  await runManifestCommand({
    entity: "Proposal",
    command: "remove",
    body: { id },
    user: { id: user.id, tenantId: user.tenantId, role: user.role },
  });
  void userId;
}
`);
    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'Proposal.remove',
      autoFixableOnly: true,
    });
    expect(result.applied.some((a) => a.applied)).toBe(true);
    const after = resultToMap(files, result).get(ACTION_PATH)!;
    expect(after).toMatch(/userId\s*:\s*user\.id/);
    expect(after).not.toMatch(/body:\s*\{[^}]*userId\s*:\s*userId\b/);
  });

  it('R10. unproven guard not required when runtime user.id has no nullable type text', async () => {
    const contract = await contractFrom(PROPOSAL_DOMAIN);
    const files = liveFiles();
    const report = reportFor(contract, files);
    const bundle = planWiringRepairs({ contract, report, fileContents: files });
    const plan = bundle.plans.find(
      (p) =>
        p.automaticApplicationAllowed &&
        p.repairKind === 'add-required-input' &&
        p.capabilityId === 'Proposal.remove',
    );
    expect(plan).toBeDefined();
    expect(plan!.edits.some((e) => e.operation.type === 'insert-early-return-guard')).toBe(false);
  });

  it('R11. exact target call alone changes under one-defect', async () => {
    const contract = await contractFrom(PROPOSAL_DOMAIN);
    const files = liveFiles(`
"use server";
import { runManifestCommand } from "@/lib/manifest-command";
export async function deleteProposal(id: string) {
  const user = { id: "u1", tenantId: "t", role: "r" };
  await runManifestCommand({
    entity: "Proposal",
    command: "send",
    body: { id },
    user: { id: user.id, tenantId: user.tenantId, role: user.role },
  });
  await runManifestCommand({
    entity: "Proposal",
    command: "remove",
    body: { id },
    user: { id: user.id, tenantId: user.tenantId, role: user.role },
  });
}
`);
    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      autoFixableOnly: true,
    });
    expect(result.applied.filter((a) => a.applied)).toHaveLength(1);
    const after = resultToMap(files, result).get(ACTION_PATH)!;
    const userIdCount = (after.match(/userId\s*:/g) || []).length;
    expect(userIdCount).toBe(1);
  });

  it('R12. second run is idempotent', async () => {
    const contract = await contractFrom(PROPOSAL_DOMAIN);
    const files = liveFiles();
    const first = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      autoFixableOnly: true,
    });
    expect(first.applied.some((a) => a.applied)).toBe(true);
    const mid = resultToMap(files, first);
    const second = remediateWiringSync({
      contract,
      fileContents: mid,
      mode: 'one-defect',
      capabilityId: 'Proposal.remove',
      autoFixableOnly: true,
    });
    expect(second.applied.some((a) => a.applied)).toBe(false);
    expect(mid.get(ACTION_PATH)).toBe(resultToMap(mid, second).get(ACTION_PATH));
  });

  it('R13. post-repair inspect clears exact mismatch', async () => {
    const contract = await contractFrom(PROPOSAL_DOMAIN);
    const files = liveFiles();
    const before = reportFor(contract, files);
    expect(
      before.mismatches.some(
        (m) =>
          m.kind === 'missing_required_input' &&
          m.capabilityId === 'Proposal.remove' &&
          m.parameter === 'userId',
      ),
    ).toBe(true);
    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      autoFixableOnly: true,
    });
    const after = reportFor(contract, resultToMap(files, result));
    expect(
      after.mismatches.some(
        (m) =>
          m.kind === 'missing_required_input' &&
          m.capabilityId === 'Proposal.remove' &&
          m.parameter === 'userId',
      ),
    ).toBe(false);
  });

  it('R14. one-defect prefers proven runtime-user mismatch over unwired', async () => {
    const contract = await contractFrom(PROPOSAL_DOMAIN);
    const files = fileMapFromRecord({
      [ACTION_PATH]: DELETE_ACTION,
      [UI_PATH]: DELETE_UI,
      'apps/app/orphan.tsx': `
        export function Orphan() {
          return <button>no wiring</button>;
        }
      `,
    });
    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      autoFixableOnly: true,
    });
    expect(result.applied.some((a) => a.applied && a.findingId.includes('Proposal.remove'))).toBe(
      true,
    );
  });
});
