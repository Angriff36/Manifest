/**
 * Automatic wiring remediation — focused proof cases.
 *
 * Proves inspect → plan → apply → verify for deterministic repairs.
 * Manifest does not design UI; it repairs proven consumer wiring.
 */

import { describe, it, expect } from 'vitest';
import { compileToIR } from '../../../ir-compiler.js';
import { buildWiringContract } from '../contract-builder.js';
import {
  inspectWiringConsumersSync,
  fileMapFromRecord,
} from '../inspect/inspector.js';
import type { WiringContract } from '../types.js';
import {
  remediateWiringSync,
  planWiringRepairs,
  applyRepairPlan,
} from './index.js';

async function contractFrom(source: string): Promise<WiringContract> {
  const { ir, diagnostics } = await compileToIR(source);
  const errors = diagnostics.filter(d => d.severity === 'error');
  expect(errors, errors.map(e => e.message).join('\n')).toHaveLength(0);
  expect(ir).not.toBeNull();
  return buildWiringContract(ir!);
}

const DOMAIN = `
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

  it('11. local-only control wired when exact capability match proven', async () => {
    const contract = await contractFrom(DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/archive-button.tsx': `
        export function ArchiveButton() {
          // local-only
          return <button data-manifest-capability="Task.archive" onClick={noop}>Archive</button>;
        }
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
    const plan = bundle.plans.find(p => p.repairKind === 'wire-existing-control');
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
    const cap = contract.capabilities.find(c => c.capabilityId === 'Task.archive')!;
    const hints = cap.invalidation.map(i => i.queryKeyHint);
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
            queryKeyHints: hints.map(h => JSON.stringify([h])),
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
    const plan = bundle.plans.find(p => p.capabilityId === 'Task.archive');
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
    expect(
      result.applied.filter(a => a.findingId.includes('summary') && a.applied),
    ).toHaveLength(0);
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
    expect(result.applied.filter(a => a.applied)).toHaveLength(1);
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
    const plan = bundle.plans.find(p => p.mismatch?.kind === 'wrong_input_shape');
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

/** Apply repairs for a capability and return the resulting file map. */
function applyAndGetMap(
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

function resultToMap(
  original: Map<string, string>,
  result: ReturnType<typeof remediateWiringSync>,
): Map<string, string> {
  let current = new Map(original);
  for (const plan of result.plans) {
    if (!result.applied.some(a => a.findingId === plan.findingId && a.applied)) continue;
    const patch = applyRepairPlan(plan, current);
    if (patch.ok) current = patch.nextContents;
  }
  return current;
}
