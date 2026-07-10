/**
 * Semantic gates for wire-existing-control — accept + verification + selection.
 */

import { describe, it, expect } from 'vitest';
import {
  contractFrom,
  fileMapFromRecord,
  inspectWiringConsumersSync,
  remediateWiringSync,
  planWiringRepairs,
  applyRepairPlan,
} from './remediate-test-fixtures.js';
import { verifyRepair } from './verifier.js';
import { DISMISS_BUTTON, MILESTONE_DOMAIN } from './wire-existing-control.fixtures.js';

describe('wire-existing-control semantic matching (accept)', () => {
  it('7. genuine same-entity completion control remains auto-fixable', async () => {
    const contract = await contractFrom(MILESTONE_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/action-milestones/[id]/page.tsx': `
        export function ActionMilestoneDetail({ milestoneId }: { milestoneId: string }) {
          const [completed, setCompleted] = useState(false);
          // local-only
          return (
            <div>
              <h1>ActionMilestone {milestoneId}</h1>
              <button
                data-manifest-capability="ActionMilestone.complete"
                onClick={() => setCompleted(true)}
              >
                Complete milestone
              </button>
            </div>
          );
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
      capabilityId: 'ActionMilestone.complete',
    });
    const plan = bundle.plans.find(p => p.repairKind === 'wire-existing-control');
    expect(plan?.automaticApplicationAllowed).toBe(true);
    expect(plan?.decision).toMatch(/auto-fixable|repairable-with-existing-pattern/);

    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'ActionMilestone.complete',
    });
    expect(result.applied.some(a => a.applied)).toBe(true);
    const patch = applyRepairPlan(plan!, files);
    expect(patch.ok).toBe(true);
    const content = [...patch.nextContents.values()][0]!;
    expect(content).toMatch(/actionMilestoneComplete/);
    expect(content).toContain('milestoneId');
    expect(content).toContain('Complete milestone');
  });

  it('8. post-repair verification checks semantic match, not only consumer existence', async () => {
    const contract = await contractFrom(MILESTONE_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/(mobile-kitchen)/kitchen/mobile/page.tsx': DISMISS_BUTTON,
    });
    const forged = {
      findingId: 'unwired:ActionMilestone.complete:forged',
      entity: 'ActionMilestone',
      command: 'complete',
      capabilityId: 'ActionMilestone.complete',
      repairKind: 'wire-existing-control' as const,
      decision: 'repairable-with-existing-pattern' as const,
      confidence: 'high' as const,
      automaticApplicationAllowed: true,
      rationale: 'forged unsafe wire',
      evidence: [],
      sourceFiles: ['apps/app/app/(mobile-kitchen)/kitchen/mobile/page.tsx'],
      consumerTrace: [{ file: 'apps/app/app/(mobile-kitchen)/kitchen/mobile/page.tsx' }],
      preconditions: [],
      postconditions: [
        {
          id: 'consumed',
          description: 'ActionMilestone.complete consumed after wiring',
          resolvedMismatchKinds: [] as [],
          requireConsumed: true,
        },
      ],
      edits: [
        {
          file: 'apps/app/app/(mobile-kitchen)/kitchen/mobile/page.tsx',
          description: 'wire dismiss',
          operation: {
            type: 'wire-control-to-binding' as const,
            controlSymbol: 'complete',
            bindingCallee: 'actionMilestoneComplete',
            ensureImport: {
              module: '@/app/lib/manifest-client.generated',
              names: ['actionMilestoneComplete'],
            },
          },
        },
      ],
      verificationMethod: 'reinspect' as const,
      priority: 50,
    };
    const patch = applyRepairPlan(forged, files);
    expect(patch.ok).toBe(true);
    const verification = verifyRepair(forged, contract, patch.nextContents, {
      roots: ['.'],
      strictCoverage: true,
    });
    expect(verification.ok).toBe(false);
    expect(verification.message).toMatch(
      /semantic|unrelated|identity|match|Binding .* not present|intent/i,
    );
  });

  it('9. one-defect mode skips unsafe unwired-control candidates', async () => {
    const contract = await contractFrom(MILESTONE_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/(mobile-kitchen)/kitchen/mobile/page.tsx': DISMISS_BUTTON,
    });
    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
    });
    const wireApplied = result.applied.filter(
      a => a.applied && a.findingId.includes('ActionMilestone.complete'),
    );
    expect(wireApplied).toHaveLength(0);
    expect(
      result.plans.some(
        p =>
          p.capabilityId === 'ActionMilestone.complete' &&
          p.decision === 'ambiguous-product-decision',
      ),
    ).toBe(true);
  });

  it('10. one-defect mode can continue to a safer proven contract repair', async () => {
    const contract = await contractFrom(MILESTONE_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/(mobile-kitchen)/kitchen/mobile/page.tsx': DISMISS_BUTTON,
      'apps/app/app/ui/create-task.tsx': `
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
    });
    expect(result.applied.some(a => a.applied)).toBe(true);
    const applied = result.applied.find(a => a.applied)!;
    expect(applied.findingId).toMatch(/wrong_input_shape|Task\.create/);
    expect(applied.findingId).not.toMatch(/ActionMilestone\.complete/);
    const dismissFile = files.get(
      'apps/app/app/(mobile-kitchen)/kitchen/mobile/page.tsx',
    )!;
    const after = applyRepairPlan(
      result.plans.find(p => p.findingId === applied.findingId)!,
      files,
    );
    expect(after.nextContents.get('apps/app/app/(mobile-kitchen)/kitchen/mobile/page.tsx')).toBe(
      dismissFile,
    );
    expect(after.nextContents.get('apps/app/app/ui/create-task.tsx')).toMatch(
      /tags:\s*parseList\(raw\)(?!\.join)/,
    );
  });
});
