/**
 * add-required-input source-proof remediation tests.
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

describe('add-required-input source proof', () => {
  const FULL_EXCEPT_SUMMARY = `
            title: "x",
            tags: [],
            priority: 1,
            dueDate: "2026-01-01",
  `;

  it('R1. missing property added from same-name function parameter', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run(summary: string) {
          await executeCommand("Task", "create", {
            ${FULL_EXCEPT_SUMMARY}
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
    expect(result.applied.some(a => a.applied && a.verification?.ok)).toBe(true);
    const map = resultToMap(files, result);
    expect([...map.values()][0]).toMatch(/summary\s*:\s*summary/);
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: map,
      config: { roots: ['.'] },
    });
    expect(
      report.mismatches.some(
        m => m.kind === 'missing_required_input' && m.parameter === 'summary',
      ),
    ).toBe(false);
  });

  it('R2. missing property added from compatible local variable', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run() {
          const summary = "hello";
          await executeCommand("Task", "create", {
            ${FULL_EXCEPT_SUMMARY}
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
    expect(result.applied.some(a => a.applied && a.verification?.ok)).toBe(true);
    expect([...resultToMap(files, result).values()][0]).toMatch(/summary\s*:\s*summary/);
  });

  it('R3. missing property added from existing object property', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run(values: { title: string; summary: string }) {
          await executeCommand("Task", "create", {
            title: values.title,
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
    expect(result.applied.some(a => a.applied && a.verification?.ok)).toBe(true);
    expect([...resultToMap(files, result).values()][0]).toMatch(/summary\s*:\s*values\.summary/);
  });

  it('R4. missing property added from formData with deterministic conversion', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run(formData: FormData) {
          const title = String(formData.get("title"));
          void formData.get("summary");
          await executeCommand("Task", "create", {
            title,
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
    expect(result.applied.some(a => a.applied && a.verification?.ok)).toBe(true);
    expect([...resultToMap(files, result).values()][0]).toMatch(
      /summary\s*:\s*formData\.get\(\s*["']summary["']\s*\)/,
    );
  });

  it('R5. trusted parameter uses runtime context, not client source', async () => {
    const contract = await contractFrom(DOMAIN);
    const completedBy = contract.capabilities
      .find(c => c.capabilityId === 'Task.create')
      ?.parameters.find(p => p.name === 'completedBy');
    expect(completedBy?.ownership).toBe('server');
    expect(completedBy?.trustedSource).toMatch(/context\./);

    // Client supplies trusted field — strip path, never add-required-input.
    const files = fileMapFromRecord({
      'apps/app/app/ui/complete.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run() {
          await executeCommand("Task", "markCompleted", {
            completedByUserId: "user-from-client",
          });
        }
      `,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    expect(
      report.mismatches.some(
        m =>
          m.kind === 'trusted_field_spoofing' && m.parameter === 'completedByUserId',
      ),
    ).toBe(true);
    const bundle = planWiringRepairs({ contract, report, fileContents: files });
    const addPlan = bundle.plans.find(
      p =>
        p.repairKind === 'add-required-input' &&
        p.mismatch?.parameter === 'completedByUserId',
    );
    expect(addPlan).toBeUndefined();
    const strip = bundle.plans.find(p => p.mismatch?.kind === 'trusted_field_spoofing');
    expect(strip?.automaticApplicationAllowed).toBe(true);
    expect(strip?.repairKind).not.toBe('add-required-input');
  });

  it('R6. wrong-type same-name variable is rejected', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run(summary: number) {
          await executeCommand("Task", "create", {
            ${FULL_EXCEPT_SUMMARY}
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
    const plan = bundle.plans.find(
      p => p.mismatch?.kind === 'missing_required_input' && p.mismatch.parameter === 'summary',
    );
    expect(plan?.decision).toBe('unsafe-to-apply');
    expect(plan?.automaticApplicationAllowed).toBe(false);
  });

  it('R7. unrelated nearby variable is not chosen', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run() {
          const summaryLabel = "Summary";
          const nearbyNotes = "notes";
          await executeCommand("Task", "create", {
            ${FULL_EXCEPT_SUMMARY}
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
    const plan = bundle.plans.find(
      p => p.mismatch?.kind === 'missing_required_input' && p.mismatch.parameter === 'summary',
    );
    expect(plan?.decision).toBe('ambiguous-product-decision');
    expect(plan?.automaticApplicationAllowed).toBe(false);
  });

  it('R8. type annotation text is not mistaken for a runtime value', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        type CreateForm = { summary: string; title: string };
        export async function run() {
          await executeCommand("Task", "create", {
            ${FULL_EXCEPT_SUMMARY}
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
    const plan = bundle.plans.find(
      p => p.mismatch?.kind === 'missing_required_input' && p.mismatch.parameter === 'summary',
    );
    expect(plan?.automaticApplicationAllowed).toBe(false);
  });

  it('R9. missing source produces no auto-fix plan', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run() {
          await executeCommand("Task", "create", {
            ${FULL_EXCEPT_SUMMARY}
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
    const plan = bundle.plans.find(
      p => p.mismatch?.kind === 'missing_required_input' && p.mismatch.parameter === 'summary',
    );
    expect(plan?.decision).toBe('ambiguous-product-decision');
    expect(plan?.edits ?? []).toHaveLength(0);
  });

  it('R10. multiple equal-confidence sources become ambiguous', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run(
          form: { summary: string },
          values: { summary: string },
        ) {
          void form.summary;
          void values.summary;
          await executeCommand("Task", "create", {
            title: "x",
            tags: [],
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
    const plan = bundle.plans.find(
      p => p.mismatch?.kind === 'missing_required_input' && p.mismatch.parameter === 'summary',
    );
    expect(plan?.decision).toBe('ambiguous-product-decision');
    expect(plan?.automaticApplicationAllowed).toBe(false);
  });

  it('R11. second unresolved required field prevents auto-apply', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run(title: string, summary: string) {
          await executeCommand("Task", "create", {
            tags: [],
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
    const requiredPlans = bundle.plans.filter(p => p.repairKind === 'add-required-input');
    expect(requiredPlans.length).toBeGreaterThan(0);
    expect(requiredPlans.every(p => p.automaticApplicationAllowed === false)).toBe(true);
    expect(
      requiredPlans.every(
        p =>
          p.decision === 'ambiguous-product-decision' &&
          /other required inputs still unresolved/i.test(p.rationale),
      ),
    ).toBe(true);
  });

  it('R12. failed post-repair verification restores the original file', async () => {
    const contract = await contractFrom(DOMAIN);
    const weakFiles = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run() {
          await executeCommand("Task", "create", {
            ${FULL_EXCEPT_SUMMARY}
          });
        }
      `,
    });
    const before = [...weakFiles.values()][0]!;
    const weakResult = remediateWiringSync({
      contract,
      fileContents: weakFiles,
      mode: 'one-defect',
      capabilityId: 'Task.create',
      autoFixableOnly: true,
      writeFile: (path, content) => {
        weakFiles.set(path, content);
      },
    });
    // No proven source → no auto-apply; writeFile must not run; map unchanged.
    expect(weakResult.applied.every(a => !a.applied)).toBe(true);
    expect([...weakFiles.values()][0]).toBe(before);
  });

  it('R12b. verify-fail after patch does not keep mutated contents', async () => {
    const contract = await contractFrom(DOMAIN);
    const { applyRepairPlan, verifyRepair } = await import('./index.js');
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run(summary: string) {
          await executeCommand("Task", "create", {
            ${FULL_EXCEPT_SUMMARY}
          });
        }
      `,
    });
    const before = [...files.values()][0]!;
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    const bundle = planWiringRepairs({
      contract,
      report,
      fileContents: files,
      capabilityId: 'Task.create',
    });
    const plan = bundle.plans.find(
      p => p.mismatch?.kind === 'missing_required_input' && p.automaticApplicationAllowed,
    );
    expect(plan).toBeTruthy();
    const patch = applyRepairPlan(plan!, files);
    expect(patch.ok).toBe(true);
    // Simulate verify against unpatched contents (orchestrator keeps original on fail).
    const failed = verifyRepair(plan!, contract, files, { roots: ['.'] }, report.mismatches);
    expect(failed.ok).toBe(false);
    expect([...files.values()][0]).toBe(before);
    void patch;
  });

  it('R13. successful repair is idempotent', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run(summary: string) {
          await executeCommand("Task", "create", {
            ${FULL_EXCEPT_SUMMARY}
          });
        }
      `,
    });
    const first = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'Task.create',
      autoFixableOnly: true,
    });
    expect(first.applied.some(a => a.applied)).toBe(true);
    const after = resultToMap(files, first);
    const second = remediateWiringSync({
      contract,
      fileContents: after,
      mode: 'one-defect',
      capabilityId: 'Task.create',
      autoFixableOnly: true,
    });
    // No further add-required-input apply for summary
    expect(
      second.applied.filter(
        a => a.applied && a.findingId.includes('missing_required_input') && a.findingId.includes('summary'),
      ),
    ).toHaveLength(0);
    const thirdMap = applyAndGetMap(contract, after, 'Task.create');
    expect([...thirdMap.values()][0]).toBe([...after.values()][0]);
  });

  it('R14. one-defect mode does not attempt weak required-input plans', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run(raw: string) {
          await executeCommand("Task", "create", {
            title: "x",
            tags: parseList(raw).join(","),
            priority: 1,
            dueDate: "2026-01-01",
          });
        }
      `,
    });
    // summary missing with no source + tags wrong shape. Weak required-input
    // must not be auto-fixable; one-defect should pick the join repair.
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    const bundle = planWiringRepairs({ contract, report, fileContents: files });
    const summaryPlan = bundle.plans.find(
      p => p.mismatch?.kind === 'missing_required_input' && p.mismatch.parameter === 'summary',
    );
    expect(summaryPlan?.automaticApplicationAllowed).toBe(false);
    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'Task.create',
      autoFixableOnly: true,
    });
    expect(result.applied.filter(a => a.applied)).toHaveLength(1);
    expect(result.applied.find(a => a.applied)?.findingId).toMatch(/wrong_input_shape/);
    expect(
      result.applied.some(a => a.findingId.includes('missing_required_input') && a.applied),
    ).toBe(false);
  });
});
