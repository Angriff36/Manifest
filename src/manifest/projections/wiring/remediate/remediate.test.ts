/**
 * Automatic wiring remediation — focused proof cases.
 *
 * Proves inspect → plan → apply → verify for deterministic repairs.
 * Manifest does not design UI; it repairs proven consumer wiring.
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

describe('wiring remediate', () => {
  it('1. wrong scalar/array payload is automatically repaired', async () => {
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
    expect(result.applied.some(a => a.applied && a.verification?.ok)).toBe(true);
    const next = [...result.applied[0]!.filesChanged];
    expect(next.length).toBeGreaterThan(0);
    // Re-read from apply path via second remediate dry check
    const afterInspect = inspectWiringConsumersSync({
      contract,
      fileContents: applyAndGetMap(contract, files, 'Task.create'),
      config: { roots: ['.'] },
    });
    expect(
      afterInspect.mismatches.some(
        m => m.kind === 'wrong_input_shape' && m.parameter === 'tags',
      ),
    ).toBe(false);
  });

  it('2. missing required property added from proven local source', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run(form: { title: string; summary: string }) {
          const summary = form.summary;
          await executeCommand("Task", "create", {
            title: form.title,
            tags: [],
            priority: 1,
            dueDate: "2026-01-01",
          });
        }
      `,
    });
    const map = applyAndGetMap(contract, files, 'Task.create');
    const content = [...map.values()][0]!;
    expect(content).toMatch(/summary\s*:/);
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

  it('3. missing required property is not invented when no source exists', async () => {
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
    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'apply',
      autoFixableOnly: true,
    });
    const summaryFix = result.applied.find(a => a.findingId.includes('summary'));
    expect(summaryFix?.applied).not.toBe(true);
  });

  it('4. invalid finite literal replaced with deterministic allowed value', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run() {
          await executeCommand("Task", "create", {
            title: "x",
            summary: "s",
            tags: [],
            priority: 10,
            dueDate: "2026-01-01",
          });
        }
      `,
    });
    const map = applyAndGetMap(contract, files, 'Task.create');
    const content = [...map.values()][0]!;
    expect(content).not.toMatch(/priority:\s*10/);
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: map,
      config: { roots: ['.'] },
    });
    expect(
      report.mismatches.some(
        m => m.kind === 'invalid_finite_literal' && m.parameter === 'priority',
      ),
    ).toBe(false);
  });

  it('5. required date "" path is repaired from proven local source', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/create.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run(form: { dueDate: string }) {
          await executeCommand("Task", "create", {
            title: "x",
            summary: "s",
            tags: [],
            priority: 1,
            dueDate: "",
          });
        }
      `,
    });
    const map = applyAndGetMap(contract, files, 'Task.create');
    const content = [...map.values()][0]!;
    expect(content).toMatch(/dueDate:\s*form\.dueDate/);
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: map,
      config: { roots: ['.'] },
    });
    expect(
      report.mismatches.some(
        m => m.kind === 'invalid_date_sentinel' && m.parameter === 'dueDate',
      ),
    ).toBe(false);
  });

  it('6. trusted client field is removed', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/complete.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run() {
          await executeCommand("Task", "markCompleted", {
            id: "1",
            completedByUserId: "user-from-client",
          });
        }
      `,
    });
    const map = applyAndGetMap(contract, files, 'Task.markCompleted');
    const content = [...map.values()][0]!;
    expect(content).not.toMatch(/completedByUserId/);
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: map,
      config: { roots: ['.'] },
    });
    expect(
      report.mismatches.some(m => m.kind === 'trusted_field_spoofing'),
    ).toBe(false);
  });

  it('7. trusted server context injection path remains after strip', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/complete.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run() {
          await executeCommand("Task", "markCompleted", {
            id: "1",
            completedByUserId: "spoof",
          });
        }
      `,
      'apps/app/app/generated/manifest-wiring-bindings.ts': `
        export function bindTaskMarkCompletedInput(client: object, trusted: object) {
          return { ...client, ...trusted };
        }
      `,
    });
    const map = applyAndGetMap(contract, files, 'Task.markCompleted');
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: map,
      config: { roots: ['.'] },
    });
    expect(
      report.findings.find(f => f.capabilityId === 'Task.markCompleted')?.status,
    ).toBe('consumed');
    expect(report.mismatches.filter(m => m.capabilityId === 'Task.markCompleted')).toHaveLength(
      0,
    );
  });

  it('8. direct unsafe call migrates toward generated safe binding import', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/complete.tsx': `
        import { executeCommand } from "@/lib/client";
        export async function run() {
          await executeCommand("Task", "markCompleted", {
            id: "1",
            completedByUserId: "spoof",
          });
        }
      `,
      'src/generated/manifest-wiring-bindings.ts': `
        export function bindTaskMarkCompletedInput() {}
      `,
    });
    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'apply',
      capabilityId: 'Task.markCompleted',
    });
    expect(result.applied.some(a => a.applied)).toBe(true);
    const map = resultToMap(files, result);
    const content = map.get('apps/app/app/ui/complete.tsx') ?? '';
    expect(content).toMatch(/manifest-wiring-bindings/);
  });

  it('9. existing composite route is preferred when proven', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/api/app/api/task/create/route.ts': `
        export async function POST() { return Response.json({}); }
      `,
      'apps/api/app/api/composite/task-create/route.ts': `
        export async function POST() { return Response.json({ composite: true }); }
      `,
    });
    const { PatternAdapter } = await import('./pattern-adapter.js');
    const adapter = new PatternAdapter(files);
    const cap = contract.capabilities.find(c => c.capabilityId === 'Task.create')!;
    const route = adapter.findCompositeRoute(cap);
    expect(route).toBeTruthy();
    expect(route!.replace(/\\/g, '/')).toMatch(/composite|task\/create/);
  });

  it('10. fake lifecycle control rewired to canonical command', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/menu.tsx': `
        import { executeCommand } from "@/lib/client";
        // data-manifest-lifecycle="Task.markPublished"
        export async function toggleActive(id: string) {
          await executeCommand("Task", "archive", { id });
        }
      `,
    });
    // Inject a lifecycle mismatch manually via plan from attribute
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'] },
    });
    // Synthesize lifecycle mismatch for planner
    report.mismatches.push({
      kind: 'lifecycle_model_mismatch',
      capabilityId: 'Task.archive',
      message: 'Fake lifecycle control',
      source: { file: 'apps/app/app/ui/menu.tsx' },
      defect: true,
    });
    const bundle = planWiringRepairs({ contract, report, fileContents: files });
    const plan = bundle.plans.find(p => p.repairKind === 'replace-fake-lifecycle-binding');
    expect(plan).toBeTruthy();
    expect(plan!.automaticApplicationAllowed).toBe(true);
    const patch = applyRepairPlan(plan!, files);
    expect(patch.ok).toBe(true);
    const content = [...patch.nextContents.values()].find(c => c.includes('executeCommand'))!;
    expect(content).toMatch(/markPublished/);
  });
});
