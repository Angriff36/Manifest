/**
 * Closure-scoped useState + proven numeric conversion for add-required-input.
 *
 * Mirrors Capsule Payment.refund: outer `useState` named like the missing
 * money/number param, with `const amount = Number(refundAmount)` in the handler.
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

const FULL_EXCEPT_PRIORITY = `
            title: "x",
            summary: "s",
            tags: [],
            dueDate: "2026-01-01",
  `;

describe('add-required-input closure useState + Number conversion', () => {
  it('C1. unique useState + Number alias repairs missing number input', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { useState } from "react";
        import { executeCommand } from "@/lib/client";
        export function CreateForm() {
          const [priority, setPriority] = useState("");
          const submit = async () => {
            const priorityNum = Number(priority);
            if (!priorityNum) return;
            await executeCommand("Task", "create", {
              ${FULL_EXCEPT_PRIORITY}
            });
          };
          return <button onClick={() => void submit()}>Go</button>;
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
    const after = [...resultToMap(files, result).values()][0]!;
    expect(after).toMatch(/priority\s*:\s*priorityNum/);
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: resultToMap(files, result),
      config: { roots: ['.'] },
    });
    expect(
      report.mismatches.some(
        m => m.kind === 'missing_required_input' && m.parameter === 'priority',
      ),
    ).toBe(false);
  });

  it('C2. no repair when useState exists but Number conversion does not', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { useState } from "react";
        import { executeCommand } from "@/lib/client";
        export function CreateForm() {
          const [priority, setPriority] = useState("");
          const submit = async () => {
            await executeCommand("Task", "create", {
              ${FULL_EXCEPT_PRIORITY}
            });
          };
          return <button onClick={() => void submit()}>Go</button>;
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
      p => p.mismatch?.kind === 'missing_required_input' && p.mismatch.parameter === 'priority',
    );
    expect(plan?.automaticApplicationAllowed).toBe(false);
  });

  it('C3. no repair when two Number aliases exist', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { useState } from "react";
        import { executeCommand } from "@/lib/client";
        export function CreateForm() {
          const [priority, setPriority] = useState("");
          const submit = async () => {
            const a = Number(priority);
            const b = Number(priority);
            void a; void b;
            await executeCommand("Task", "create", {
              ${FULL_EXCEPT_PRIORITY}
            });
          };
          return <button onClick={() => void submit()}>Go</button>;
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
      p => p.mismatch?.kind === 'missing_required_input' && p.mismatch.parameter === 'priority',
    );
    expect(plan?.automaticApplicationAllowed).toBe(false);
  });

  it('C4. file-wide same-name outside closure is not a source', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        const priority = 3;
        export function other() {
          return priority;
        }
        export async function run() {
          await executeCommand("Task", "create", {
            ${FULL_EXCEPT_PRIORITY}
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
      p => p.mismatch?.kind === 'missing_required_input' && p.mismatch.parameter === 'priority',
    );
    expect(plan?.automaticApplicationAllowed).toBe(false);
  });

  it('C5. does not invent a literal default for missing number', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run() {
          await executeCommand("Task", "create", {
            ${FULL_EXCEPT_PRIORITY}
          });
        }
      `,
    });
    const before = [...files.values()][0]!;
    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'Task.create',
      autoFixableOnly: true,
    });
    expect(result.applied.every(a => !a.applied)).toBe(true);
    expect([...files.values()][0]).toBe(before);
  });

  it('C6. patches only the intended capability call', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { useState } from "react";
        import { executeCommand } from "@/lib/client";
        export function CreateForm() {
          const [priority, setPriority] = useState("");
          const unrelated = { priority: 9 };
          const submit = async () => {
            const priorityNum = Number(priority);
            await executeCommand("Task", "create", {
              ${FULL_EXCEPT_PRIORITY}
            });
          };
          return <pre>{JSON.stringify(unrelated)}</pre>;
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
    const after = [...resultToMap(files, result).values()][0]!;
    expect(after).toMatch(/unrelated = \{ priority: 9 \}/);
    expect(after).toMatch(/executeCommand\([\s\S]*priority\s*:\s*priorityNum/);
  });

  it('C7. stale Number alias invalidates before patching', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { useState } from "react";
        import { executeCommand } from "@/lib/client";
        export function CreateForm() {
          const [priority, setPriority] = useState("");
          const submit = async () => {
            const priorityNum = Number(priority);
            await executeCommand("Task", "create", {
              ${FULL_EXCEPT_PRIORITY}
            });
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
        p.mismatch.parameter === 'priority' &&
        p.automaticApplicationAllowed,
    );
    expect(plan).toBeTruthy();
    // Stale the proven alias out of the file before apply.
    const stale = new Map(
      [...files.entries()].map(([k, v]) => [
        k,
        v.replace('const priorityNum = Number(priority);', 'const other = 1;'),
      ]),
    );
    const { applyRepairPlan } = await import('./index.js');
    const patch = applyRepairPlan(plan!, stale);
    expect(patch.ok).toBe(false);
  });

  it('C8. second run is idempotent after successful repair', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { useState } from "react";
        import { executeCommand } from "@/lib/client";
        export function CreateForm() {
          const [priority, setPriority] = useState("");
          const submit = async () => {
            const priorityNum = Number(priority);
            await executeCommand("Task", "create", {
              ${FULL_EXCEPT_PRIORITY}
            });
          };
          return null;
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
    expect(
      second.applied.filter(
        a =>
          a.applied &&
          a.findingId.includes('missing_required_input') &&
          a.findingId.includes('priority'),
      ),
    ).toHaveLength(0);
    expect([...applyAndGetMap(contract, after, 'Task.create').values()][0]).toBe(
      [...after.values()][0],
    );
  });

  it('C9. prefers proven missing-input over ambiguous unwired', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { useState } from "react";
        import { executeCommand } from "@/lib/client";
        export function CreateForm() {
          const [priority, setPriority] = useState("");
          const submit = async () => {
            const priorityNum = Number(priority);
            await executeCommand("Task", "create", {
              ${FULL_EXCEPT_PRIORITY}
            });
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
    expect(applied?.findingId).toMatch(/priority/);
  });

  it('C10. trusted/server-owned field is never filled from useState', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/complete.tsx': `
        import { useState } from "react";
        import { executeCommand } from "@/lib/client";
        export function CompleteForm() {
          const [completedByUserId, setCompletedByUserId] = useState("u1");
          const submit = async () => {
            await executeCommand("Task", "markCompleted", {});
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
    expect(
      bundle.plans.some(
        p =>
          p.repairKind === 'add-required-input' &&
          p.mismatch?.parameter === 'completedByUserId' &&
          p.automaticApplicationAllowed,
      ),
    ).toBe(false);
  });
});
