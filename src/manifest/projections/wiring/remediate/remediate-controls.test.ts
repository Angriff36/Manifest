/**
 * Wiring remediation tests — control wiring, invalidation, safety.
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
  applyRepairPlan,
} from './remediate-test-fixtures.js';

describe('wiring remediate (controls & safety)', () => {
  it('11. local-only control wired when exact capability match proven', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/archive-button.tsx': `
        export function ArchiveButton({ taskId }: { taskId: string }) {
          // local-only
          return <button data-manifest-capability="Task.archive" onClick={noop}>Archive task</button>;
        }
      `,
      'apps/app/app/lib/manifest-client.generated.ts': `
        export async function taskArchive(input: object = {}) { return undefined; }
      `,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'], strictCoverage: true },
    });
    const bundle = planWiringRepairs({
      contract,
      report,
      fileContents: files,
      capabilityId: 'Task.archive',
    });
    const plan = bundle.plans.find((p) => p.repairKind === 'wire-existing-control');
    expect(plan?.automaticApplicationAllowed).toBe(true);
    const patch = applyRepairPlan(plan!, files);
    expect(patch.ok).toBe(true);
    const content = [...patch.nextContents.values()][0]!;
    expect(content).toMatch(/taskArchive/);
  });

  it('12. generated invalidation added using react-query pattern', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/mutate.tsx': `
        import { useQueryClient } from "@tanstack/react-query";
        import { executeCommand } from "@/lib/client";
        export async function save(queryClient: ReturnType<typeof useQueryClient>) {
          await executeCommand("Task", "archive", { id: "1" });
        }
      `,
    });
    const cap = contract.capabilities.find((c) => c.capabilityId === 'Task.archive')!;
    const hints = cap.invalidation.map((i) => i.queryKeyHint);
    const { applyRepairPlan: apply } = await import('./patch-engine.js');
    const plan = {
      findingId: 'inv:Task.archive',
      entity: 'Task',
      command: 'archive',
      capabilityId: 'Task.archive',
      repairKind: 'add-invalidation' as const,
      decision: 'auto-fixable' as const,
      confidence: 'high' as const,
      automaticApplicationAllowed: true,
      rationale: 'test',
      evidence: [],
      sourceFiles: ['apps/app/app/ui/mutate.tsx'],
      consumerTrace: [],
      preconditions: [],
      postconditions: [],
      edits: [
        {
          file: 'apps/app/app/ui/mutate.tsx',
          description: 'add invalidation',
          operation: {
            type: 'add-invalidation-after-mutation' as const,
            capabilityId: 'Task.archive',
            queryKeyHints: hints.map((h) => JSON.stringify([h])),
            pattern: 'react-query' as const,
          },
        },
      ],
      verificationMethod: 'reinspect' as const,
      priority: 40,
    };
    const patch = apply(plan, files);
    expect(patch.ok).toBe(true);
    const content = [...patch.nextContents.values()][0]!;
    expect(content).toMatch(/invalidateQueries/);
  });

  it('13. visual JSX structure remains otherwise unchanged', async () => {
    const contract = await contractFrom(DOMAIN);
    const jsx = `
        export function Form() {
          return (
            <div className="form-root">
              <h1>Create</h1>
              <button type="submit">Save</button>
            </div>
          );
        }
    `;
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        ${jsx}
        export async function run(raw: string) {
          await executeCommand("Task", "create", {
            title: "x",
            summary: "s",
            tags: parseList(raw).join(","),
            priority: 1,
            dueDate: "2026-01-01",
          });
        }
      `,
    });
    const map = applyAndGetMap(contract, files, 'Task.create');
    const content = [...map.values()][0]!;
    expect(content).toContain('className="form-root"');
    expect(content).toContain('<h1>Create</h1>');
    expect(content).toContain('<button type="submit">Save</button>');
  });

  it('14. unrelated files are untouched', async () => {
    const contract = await contractFrom(DOMAIN);
    const unrelated = 'export const KEEP = true;\n';
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run(raw: string) {
          await executeCommand("Task", "create", {
            title: "x",
            summary: "s",
            tags: parseList(raw).join(","),
            priority: 1,
            dueDate: "2026-01-01",
          });
        }
      `,
      'apps/app/app/ui/unrelated.tsx': unrelated,
    });
    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'Task.create',
    });
    const map = resultToMap(files, result);
    expect(map.get('apps/app/app/ui/unrelated.tsx')).toBe(unrelated);
  });

  it('15. repeated apply is idempotent', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run(raw: string) {
          await executeCommand("Task", "create", {
            title: "x",
            summary: "s",
            tags: parseList(raw).join(","),
            priority: 1,
            dueDate: "2026-01-01",
          });
        }
      `,
    });
    const first = applyAndGetMap(contract, files, 'Task.create');
    const second = applyAndGetMap(contract, first, 'Task.create');
    expect([...second.values()][0]).toBe([...first.values()][0]);
  });

  it('16. ambiguous product placement is not auto-edited', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/page.tsx': `export function Page() { return null; }`,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'], strictCoverage: true },
    });
    const bundle = planWiringRepairs({
      contract,
      report,
      fileContents: files,
      capabilityId: 'Task.archive',
    });
    const plan = bundle.plans.find((p) => p.capabilityId === 'Task.archive');
    expect(plan?.decision).toBe('ambiguous-product-decision');
    expect(plan?.automaticApplicationAllowed).toBe(false);
  });

  it('17. low-confidence / unsafe plans are not auto-edited', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run() {
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
      mode: 'apply',
      autoFixableOnly: true,
    });
    // summary missing with no source → not applied
    expect(result.applied.filter((a) => a.findingId.includes('summary') && a.applied)).toHaveLength(
      0,
    );
  });

  it('18. post-repair inspection proves finding resolved', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run(raw: string) {
          await executeCommand("Task", "create", {
            title: "x",
            summary: "s",
            tags: parseList(raw).join(","),
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
    });
    expect(result.applied[0]?.verification?.findingResolved).toBe(true);
    expect(result.verification.allAppliedResolved).toBe(true);
  });

  it('19. one-defect mode patches only one defect', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run(raw: string) {
          await executeCommand("Task", "create", {
            title: "x",
            summary: "s",
            tags: parseList(raw).join(","),
            priority: 10,
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
    });
    expect(result.applied.filter((a) => a.applied)).toHaveLength(1);
  });

  it('20. stale patch plans fail safely when source changed after planning', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run(raw: string) {
          await executeCommand("Task", "create", {
            title: "x",
            summary: "s",
            tags: parseList(raw).join(","),
            priority: 1,
            dueDate: "2026-01-01",
          });
        }
      `,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    const bundle = planWiringRepairs({ contract, report, fileContents: files });
    const plan = bundle.plans.find((p) => p.mismatch?.kind === 'wrong_input_shape');
    expect(plan).toBeTruthy();
    // Mutate source so fromExpression is gone
    const mutated = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run(raw: string) {
          await executeCommand("Task", "create", {
            title: "x",
            summary: "s",
            tags: parseList(raw),
            priority: 1,
            dueDate: "2026-01-01",
          });
        }
      `,
    });
    const patch = applyRepairPlan(plan!, mutated);
    expect(patch.ok === false || patch.editsApplied === 0).toBe(true);
  });
});
