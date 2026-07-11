/**
 * Sibling-binding safety: same-entity, guard narrowing, VendorCatalog regression.
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

entity StaffMember {
  property required id: string
  property name: string = ""

  command assign(userId: string) {
    mutate name = userId
  }

  store StaffMember in memory
}

entity VendorCatalog {
  property required id: string
  property reason: string = ""
  property active: boolean = true

  command updatePrice(reason: string) {
    mutate reason = reason
  }

  command deactivate(reason: string) {
    mutate active = false
  }

  store VendorCatalog in memory
}
`;

describe('sibling-binding entity/guard safety', () => {
  it('E1. different entity sibling userId is rejected', async () => {
    const contract = await contractFrom(TASK_ACTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/task-card.tsx': `
        import { taskComplete, staffMemberAssign } from "@/lib/client";
        export function TaskCard({
          task,
          currentUserId,
        }: {
          task: { id: string };
          currentUserId: string;
        }) {
          const assign = async () => {
            await staffMemberAssign({ id: task.id, userId: currentUserId });
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
      (p) =>
        p.mismatch?.kind === 'missing_required_input' &&
        p.capabilityId === 'Task.complete' &&
        p.mismatch.parameter === 'userId',
    );
    expect(plan?.automaticApplicationAllowed).toBe(false);
  });

  it('E2. VendorCatalog deactivate must not reuse costReason from different id', async () => {
    const contract = await contractFrom(TASK_ACTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/catalog.tsx': `
        import { vendorCatalogDeactivate, vendorCatalogUpdatePrice } from "@/lib/client";
        export function Catalog({
          deactivateTarget,
          costTarget,
          costReason,
        }: {
          deactivateTarget: { id: string };
          costTarget: { id: string };
          costReason: string;
        }) {
          const updatePrice = async () => {
            await vendorCatalogUpdatePrice({ id: costTarget.id, reason: costReason });
          };
          const deactivate = async () => {
            await vendorCatalogDeactivate({ id: deactivateTarget.id });
          };
          return null;
        }
      `,
    });
    const before = files.get('apps/app/app/ui/catalog.tsx')!;
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    const bundle = planWiringRepairs({ contract, report, fileContents: files });
    const plan = bundle.plans.find(
      (p) =>
        p.mismatch?.kind === 'missing_required_input' &&
        p.capabilityId === 'VendorCatalog.deactivate',
    );
    expect(plan?.automaticApplicationAllowed).toBe(false);
    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'VendorCatalog.deactivate',
      autoFixableOnly: true,
    });
    expect(result.applied.some((a) => a.applied)).toBe(false);
    expect([...resultToMap(files, result).values()][0]).toBe(before);
  });

  it('E3. nullable source with sibling guard inserts guard then property', async () => {
    const contract = await contractFrom(TASK_ACTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/task-card.tsx': `
        import { taskComplete, taskClaim } from "@/lib/client";
        export function TaskCard({
          task,
          currentUserId,
        }: {
          task: { id: string };
          currentUserId?: string | null;
        }) {
          const claim = async () => {
            if (!currentUserId) {
              return;
            }
            await taskClaim({ id: task.id, userId: currentUserId });
          };
          const complete = async () => {
            await taskComplete({ id: task.id });
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
    expect(result.applied.some((a) => a.applied && a.verification?.ok)).toBe(true);
    const after = [...resultToMap(files, result).values()][0]!;
    expect(after).toMatch(/const complete = async \(\) => \{\s*if \(!currentUserId\)/);
    expect(after).toMatch(/taskComplete\(\{[^}]*userId\s*:\s*currentUserId/);
    expect(after).toMatch(/taskClaim\(\{[^}]*userId\s*:\s*currentUserId/);
  });

  it('E4. nullable source without sibling guard is rejected', async () => {
    const contract = await contractFrom(TASK_ACTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/task-card.tsx': `
        import { taskComplete, taskClaim } from "@/lib/client";
        export function TaskCard({
          task,
          currentUserId,
        }: {
          task: { id: string };
          currentUserId?: string | null;
        }) {
          const claim = async () => {
            await taskClaim({ id: task.id, userId: currentUserId as string });
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
      (p) => p.mismatch?.kind === 'missing_required_input' && p.capabilityId === 'Task.complete',
    );
    expect(plan?.automaticApplicationAllowed).toBe(false);
  });

  it('E5. incompatible non-null type is rejected', async () => {
    const contract = await contractFrom(TASK_ACTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/task-card.tsx': `
        import { taskComplete, taskClaim } from "@/lib/client";
        export function TaskCard({
          task,
          currentUserId,
        }: {
          task: { id: string };
          currentUserId: number;
        }) {
          const claim = async () => {
            await taskClaim({ id: task.id, userId: String(currentUserId) });
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
      (p) => p.mismatch?.kind === 'missing_required_input' && p.capabilityId === 'Task.complete',
    );
    // Sibling expression is String(currentUserId) — unique; target needs userId.
    // No same-expression sibling binding of currentUserId alone.
    expect(plan?.automaticApplicationAllowed).toBe(false);
  });

  it('E6. same-name field elsewhere in file without shared identity rejects', async () => {
    const contract = await contractFrom(TASK_ACTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/task-card.tsx': `
        import { taskComplete, taskClaim } from "@/lib/client";
        export function Other({ currentUserId }: { currentUserId: string }) {
          return null;
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
      (p) => p.mismatch?.kind === 'missing_required_input' && p.capabilityId === 'Task.complete',
    );
    expect(plan?.automaticApplicationAllowed).toBe(false);
  });

  it('E7. named props type (TaskCardProps) still allows sibling string binding', async () => {
    const contract = await contractFrom(TASK_ACTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/task-card.tsx': `
        import { taskComplete, taskClaim } from "@/lib/client";
        type TaskCardProps = {
          task: { id: string };
          currentUserId?: string | null;
        };
        export function TaskCard({ task, currentUserId }: TaskCardProps) {
          const claim = async () => {
            if (!currentUserId) return;
            await taskClaim({ id: task.id, userId: currentUserId });
          };
          const complete = async () => {
            if (!currentUserId) return;
            await taskComplete({ id: task.id });
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
    expect(result.applied.some((a) => a.applied && a.verification?.ok)).toBe(true);
    expect([...resultToMap(files, result).values()][0]).toMatch(
      /taskComplete\(\{[^}]*userId\s*:\s*currentUserId/,
    );
  });
});
