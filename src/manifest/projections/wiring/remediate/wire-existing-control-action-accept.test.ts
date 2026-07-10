/**
 * Action-intent proof for wire-existing-control — accept exact matches.
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
import { COLLECTION_DOMAIN, NEW_CASE_BUTTON_PAGE } from './wire-existing-control-action.fixtures.js';
import { DISMISS_BUTTON, MILESTONE_DOMAIN } from './wire-existing-control.fixtures.js';

describe('wire-existing-control action-intent (accept)', () => {
  it('1. exact Escalate to legal control with case id can auto-apply', async () => {
    const contract = await contractFrom(COLLECTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/collection-cases/[id]/page.tsx': `
        export function CollectionCaseDetail({ caseId }: { caseId: string }) {
          return (
            <div>
              <h1>CollectionCase {caseId}</h1>
              <button
                data-manifest-capability="CollectionCase.escalateToLegal"
                onClick={noop}
              >
                Escalate to legal
              </button>
            </div>
          );
        }
      `,
      'apps/app/app/lib/manifest-client.generated.ts': `
        export async function collectionCaseEscalateToLegal(input: object = {}) { return undefined; }
      `,
    });
    const plan = planWiringRepairs({
      contract,
      report: inspectWiringConsumersSync({
        contract,
        fileContents: files,
        config: { roots: ['.'], strictCoverage: true },
      }),
      fileContents: files,
      capabilityId: 'CollectionCase.escalateToLegal',
    }).plans.find(p => p.repairKind === 'wire-existing-control');
    expect(plan?.automaticApplicationAllowed).toBe(true);

    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'CollectionCase.escalateToLegal',
    });
    expect(result.applied.some(a => a.applied)).toBe(true);
    const content = [...applyRepairPlan(plan!, files).nextContents.values()][0]!;
    expect(content).toMatch(/collectionCaseEscalateToLegal/);
    expect(content).toMatch(/caseId/);
    expect(content).not.toMatch(/collectionCaseEscalateToLegal\(\s*\{\s*\}\s*\)/);
    expect(content).toContain('Escalate to legal');
  });

  it('2. existing handler named for the exact action can auto-apply', async () => {
    const contract = await contractFrom(COLLECTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/collection-cases/[id]/page.tsx': `
        export function CollectionCaseDetail({ caseId }: { caseId: string }) {
          function handleEscalateToLegal() {
            // local-only placeholder
          }
          return (
            <button onClick={handleEscalateToLegal}>
              Escalate to legal
            </button>
          );
        }
      `,
      'apps/app/app/lib/manifest-client.generated.ts': `
        export async function collectionCaseEscalateToLegal(input: object = {}) { return undefined; }
      `,
    });
    const plan = planWiringRepairs({
      contract,
      report: inspectWiringConsumersSync({
        contract,
        fileContents: files,
        config: { roots: ['.'], strictCoverage: true },
      }),
      fileContents: files,
      capabilityId: 'CollectionCase.escalateToLegal',
    }).plans.find(p => p.repairKind === 'wire-existing-control');
    expect(plan?.automaticApplicationAllowed).toBe(true);
    const patch = applyRepairPlan(plan!, files);
    expect(patch.ok).toBe(true);
    const content = [...patch.nextContents.values()][0]!;
    expect(content).toMatch(/collectionCaseEscalateToLegal/);
    expect(content).toMatch(/caseId/);
  });

  it('3. one-defect skips false escalate candidate and prefers contract repair', async () => {
    const contract = await contractFrom(COLLECTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/collection-cases/page.tsx': NEW_CASE_BUTTON_PAGE,
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
    expect(applied.findingId).not.toMatch(/escalateToLegal|CollectionCase/);
    expect(
      applyRepairPlan(
        result.plans.find(p => p.findingId === applied.findingId)!,
        files,
      ).nextContents.get('apps/app/app/collection-cases/page.tsx'),
    ).toContain('setCreateDialogOpen(true)');
  });

  it('4. ActionMilestone dismiss button still remains unchanged', async () => {
    const contract = await contractFrom(MILESTONE_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/(mobile-kitchen)/kitchen/mobile/page.tsx': DISMISS_BUTTON,
    });
    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'ActionMilestone.complete',
    });
    expect(result.applied.filter(a => a.applied)).toHaveLength(0);
    expect(files.get('apps/app/app/(mobile-kitchen)/kitchen/mobile/page.tsx')).toContain(
      'setError(null)',
    );
  });
});
