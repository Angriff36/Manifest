/**
 * Sibling-call parameter binding proof for add-required-input.
 *
 * Live pattern: KitchenTask.complete/start missing userId while the same
 * component already passes userId: currentUserId on claim/release.
 */

import { describe, it, expect } from 'vitest';
import {
  contractFrom,
  REMEDIATE_DOMAIN as DOMAIN,
  applyAndGetMap,
  resultToMap,
  fileMapFromRecord,
  inspectWiringConsumersSync,
  remediateWiringSync,
  planWiringRepairs,
} from './remediate-test-fixtures.js';

/** Domain with instance command requiring userId (mirrors KitchenTask.complete). */
const TASK_ACTION_DOMAIN = `
entity Task {
  property required id: string
  property status: string = "open"
  property title: string = ""

  command start(userId: string) {
    mutate status = "in_progress"
  }

  command complete(userId: string) {
    mutate status = "done"
  }

  command claim(userId: string) {
    mutate status = "claimed"
  }

  store Task in memory
}
`;

describe('add-required-input sibling-proven parameter binding', () => {
  it('S1. unique sibling userId: currentUserId repairs missing userId', async () => {
    const contract = await contractFrom(TASK_ACTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/task-card.tsx': `
        import { taskComplete, taskClaim } from "@/lib/client";
        export function TaskCard({
          task,
          currentUserId,
        }: {
          task: { id: string };
          currentUserId: string;
        }) {
          const claim = async () => {
            await taskClaim({ id: task.id, userId: currentUserId });
          };
          const complete = async () => {
            await taskComplete({ id: task.id });
          };
          return <button onClick={() => void complete()}>Done</button>;
        }
      `,
    });
    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'Task.complete',
      autoFixableOnly: true,
    });
    expect(result.applied.some(a => a.applied && a.verification?.ok)).toBe(true);
    const after = [...resultToMap(files, result).values()][0]!;
    expect(after).toMatch(/taskComplete\(\{[^}]*userId\s*:\s*currentUserId/);
    expect(after).toMatch(/taskClaim\(\{[^}]*userId\s*:\s*currentUserId/);
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: resultToMap(files, result),
      config: { roots: ['.'] },
    });
    expect(
      report.mismatches.some(
        m =>
          m.kind === 'missing_required_input' &&
          m.capabilityId === 'Task.complete' &&
          m.parameter === 'userId',
      ),
    ).toBe(false);
  });

  it('S2. no sibling binding means no executable plan', async () => {
    const contract = await contractFrom(TASK_ACTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/task-card.tsx': `
        import { taskComplete } from "@/lib/client";
        export function TaskCard({ task }: { task: { id: string } }) {
          const complete = async () => {
            await taskComplete({ id: task.id });
          };
          return null;
        }
      `,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    const bundle = planWiringRepairs({ contract, report, fileContents: files });
    const plan = bundle.plans.find(
      p =>
        p.mismatch?.kind === 'missing_required_input' &&
        p.mismatch.parameter === 'userId',
    );
    expect(plan?.automaticApplicationAllowed).toBe(false);
  });

  it('S3. two distinct sibling expressions are ambiguous', async () => {
    const contract = await contractFrom(TASK_ACTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/task-card.tsx': `
        import { taskComplete, taskClaim, taskStart } from "@/lib/client";
        export function TaskCard({
          task,
          currentUserId,
          otherUserId,
        }: {
          task: { id: string };
          currentUserId: string;
          otherUserId: string;
        }) {
          const claim = async () => {
            await taskClaim({ id: task.id, userId: currentUserId });
          };
          const start = async () => {
            await taskStart({ id: task.id, userId: otherUserId });
          };
          const complete = async () => {
            await taskComplete({ id: task.id });
          };
          return null;
        }
      `,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    const bundle = planWiringRepairs({ contract, report, fileContents: files });
    const plan = bundle.plans.find(
      p =>
        p.mismatch?.kind === 'missing_required_input' &&
        p.capabilityId === 'Task.complete' &&
        p.mismatch.parameter === 'userId',
    );
    expect(plan?.automaticApplicationAllowed).toBe(false);
    expect(plan?.decision).toBe('ambiguous-product-decision');
  });

  it('S4. file-wide sibling outside enclosing component is rejected', async () => {
    const contract = await contractFrom(TASK_ACTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/task-card.tsx': `
        import { taskComplete, taskClaim } from "@/lib/client";
        export async function otherCard(currentUserId: string) {
          await taskClaim({ id: "x", userId: currentUserId });
        }
        export function TaskCard({ task }: { task: { id: string } }) {
          const complete = async () => {
            await taskComplete({ id: task.id });
          };
          return null;
        }
      `,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    const bundle = planWiringRepairs({ contract, report, fileContents: files });
    const plan = bundle.plans.find(
      p =>
        p.mismatch?.kind === 'missing_required_input' &&
        p.capabilityId === 'Task.complete',
    );
    expect(plan?.automaticApplicationAllowed).toBe(false);
  });

  it('S5. expression root not in closure is rejected', async () => {
    const contract = await contractFrom(TASK_ACTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/task-card.tsx': `
        import { taskComplete, taskClaim } from "@/lib/client";
        const orphanUserId = "u1";
        export function Helper() {
          return null;
        }
        export function TaskCard({ task }: { task: { id: string } }) {
          const claim = async () => {
            await taskClaim({ id: task.id, userId: orphanUserId });
          };
          const complete = async () => {
            await taskComplete({ id: task.id });
          };
          return null;
        }
      `,
    });
    // orphanUserId is module-scope; sibling scan is outermost callable = TaskCard,
    // which does not bind orphanUserId as param/local — rejected.
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    const bundle = planWiringRepairs({ contract, report, fileContents: files });
    const plan = bundle.plans.find(
      p =>
        p.mismatch?.kind === 'missing_required_input' &&
        p.capabilityId === 'Task.complete',
    );
    expect(plan?.automaticApplicationAllowed).toBe(false);
  });

  it('S6. patches only the intended capability call', async () => {
    const contract = await contractFrom(TASK_ACTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/task-card.tsx': `
        import { taskComplete, taskClaim, taskStart } from "@/lib/client";
        export function TaskCard({
          task,
          currentUserId,
        }: {
          task: { id: string };
          currentUserId: string;
        }) {
          const claim = async () => {
            await taskClaim({ id: task.id, userId: currentUserId });
          };
          const complete = async () => {
            await taskComplete({ id: task.id });
          };
          const start = async () => {
            await taskStart({ id: task.id });
          };
          return null;
        }
      `,
    });
    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'Task.complete',
      autoFixableOnly: true,
    });
    expect(result.applied.some(a => a.applied)).toBe(true);
    const after = [...resultToMap(files, result).values()][0]!;
    expect(after).toMatch(/taskComplete\(\{[^}]*userId\s*:\s*currentUserId/);
    // start still missing userId — not patched in this capability-scoped run
    expect(after).toMatch(/taskStart\(\{\s*id:\s*task\.id\s*\}\)/);
  });

  it('S7. stale sibling expression invalidates before patching', async () => {
    const contract = await contractFrom(TASK_ACTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/task-card.tsx': `
        import { taskComplete, taskClaim } from "@/lib/client";
        export function TaskCard({
          task,
          currentUserId,
        }: {
          task: { id: string };
          currentUserId: string;
        }) {
          const claim = async () => {
            await taskClaim({ id: task.id, userId: currentUserId });
          };
          const complete = async () => {
            await taskComplete({ id: task.id });
          };
          return null;
        }
      `,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    const bundle = planWiringRepairs({ contract, report, fileContents: files });
    const plan = bundle.plans.find(
      p =>
        p.mismatch?.kind === 'missing_required_input' &&
        p.automaticApplicationAllowed,
    );
    expect(plan).toBeTruthy();
    const stale = new Map(
      [...files.entries()].map(([k, v]) => [
        k,
        v
          .replace(/userId:\s*currentUserId/g, 'userId: "gone"')
          .replace(/\bcurrentUserId\b/g, 'renamedUserId'),
      ]),
    );
    const { applyRepairPlan } = await import('./index.js');
    const patch = applyRepairPlan(plan!, stale);
    expect(patch.ok).toBe(false);
  });

  it('S8. second run is idempotent', async () => {
    const contract = await contractFrom(TASK_ACTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/task-card.tsx': `
        import { taskComplete, taskClaim } from "@/lib/client";
        export function TaskCard({
          task,
          currentUserId,
        }: {
          task: { id: string };
          currentUserId: string;
        }) {
          const claim = async () => {
            await taskClaim({ id: task.id, userId: currentUserId });
          };
          const complete = async () => {
            await taskComplete({ id: task.id });
          };
          return null;
        }
      `,
    });
    const first = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'Task.complete',
      autoFixableOnly: true,
    });
    expect(first.applied.some(a => a.applied)).toBe(true);
    const after = resultToMap(files, first);
    const second = remediateWiringSync({
      contract,
      fileContents: after,
      mode: 'one-defect',
      capabilityId: 'Task.complete',
      autoFixableOnly: true,
    });
    expect(
      second.applied.filter(
        a =>
          a.applied &&
          a.findingId.includes('missing_required_input') &&
          a.findingId.includes('userId'),
      ),
    ).toHaveLength(0);
    expect([...applyAndGetMap(contract, after, 'Task.complete').values()][0]).toBe(
      [...after.values()][0],
    );
  });

  it('S9. one-defect prefers sibling-proven missing-input over unwired', async () => {
    const contract = await contractFrom(TASK_ACTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/task-card.tsx': `
        import { taskComplete, taskClaim } from "@/lib/client";
        export function TaskCard({
          task,
          currentUserId,
        }: {
          task: { id: string };
          currentUserId: string;
        }) {
          const claim = async () => {
            await taskClaim({ id: task.id, userId: currentUserId });
          };
          const complete = async () => {
            await taskComplete({ id: task.id });
          };
          return <button type="button">Publish</button>;
        }
      `,
    });
    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      autoFixableOnly: true,
    });
    const applied = result.applied.find(a => a.applied);
    expect(applied?.findingId).toMatch(/missing_required_input/);
    expect(applied?.findingId).toMatch(/userId/);
  });

  it('S10. REMEDIATE_DOMAIN create still uses same-name param (no sibling regression)', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run(summary: string) {
          await executeCommand("Task", "create", {
            title: "x",
            tags: [],
            priority: 1,
            dueDate: "2026-01-01",
          });
        }
      `,
    });
    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'Task.create',
      autoFixableOnly: true,
    });
    expect(result.applied.some(a => a.applied)).toBe(true);
    expect([...resultToMap(files, result).values()][0]).toMatch(/summary\s*:\s*summary/);
  });
});
