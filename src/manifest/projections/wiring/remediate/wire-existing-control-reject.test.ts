/**
 * Semantic gates for wire-existing-control — rejection cases.
 */

import { describe, it, expect } from 'vitest';
import {
  contractFrom,
  fileMapFromRecord,
  inspectWiringConsumersSync,
  remediateWiringSync,
  planWiringRepairs,
} from './remediate-test-fixtures.js';
import { DISMISS_BUTTON, MILESTONE_DOMAIN } from './wire-existing-control.fixtures.js';

describe('wire-existing-control semantic matching (reject)', () => {
  it('1. unrelated error-dismiss button is never used for an unwired command', async () => {
    const contract = await contractFrom(MILESTONE_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/(mobile-kitchen)/kitchen/mobile/page.tsx': DISMISS_BUTTON,
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
    const plan = bundle.plans.find(p => p.capabilityId === 'ActionMilestone.complete');
    expect(plan?.decision).toBe('ambiguous-product-decision');
    expect(plan?.automaticApplicationAllowed).toBe(false);
    expect(plan?.edits ?? []).toHaveLength(0);

    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'ActionMilestone.complete',
    });
    expect(result.applied.filter(a => a.applied)).toHaveLength(0);
    expect(files.get('apps/app/app/(mobile-kitchen)/kitchen/mobile/page.tsx')).toContain(
      'onClick={() => setError(null)}',
    );
    expect(files.get('apps/app/app/(mobile-kitchen)/kitchen/mobile/page.tsx')).not.toMatch(
      /actionMilestoneComplete/,
    );
  });

  it('2. arbitrary nearby button is not enough evidence', async () => {
    const contract = await contractFrom(MILESTONE_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/ui/dashboard.tsx': `
        export function Dashboard() {
          return (
            <div>
              <h1>ActionMilestone board</h1>
              <button onClick={() => console.log("ok")}>Refresh</button>
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
    const plan = bundle.plans.find(p => p.capabilityId === 'ActionMilestone.complete');
    expect(plan?.decision).toBe('ambiguous-product-decision');
    expect(plan?.automaticApplicationAllowed).toBe(false);
  });

  it('3. same file is not enough evidence', async () => {
    const contract = await contractFrom(MILESTONE_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/action-milestones/page.tsx': `
        export function ActionMilestoneList() {
          const milestones = [];
          return (
            <div>
              <h1>ActionMilestone list</h1>
              <button onClick={() => setFilter("all")}>Filter</button>
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
    const plan = bundle.plans.find(p => p.capabilityId === 'ActionMilestone.complete');
    expect(plan?.decision).toBe('ambiguous-product-decision');
    expect(plan?.automaticApplicationAllowed).toBe(false);
  });

  it('4. same page is not enough evidence', async () => {
    const contract = await contractFrom(MILESTONE_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/action-milestones/[id]/page.tsx': `
        export function ActionMilestoneDetail({ milestoneId }: { milestoneId: string }) {
          const [error, setError] = useState<string | null>(null);
          return (
            <div>
              <h1>ActionMilestone {milestoneId}</h1>
              <button onClick={() => setError(null)}>Dismiss</button>
              <p>Status open — complete when ready</p>
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
    const plan = bundle.plans.find(p => p.capabilityId === 'ActionMilestone.complete');
    expect(plan?.decision).toBe('ambiguous-product-decision');
    expect(plan?.automaticApplicationAllowed).toBe(false);
    expect(plan?.edits ?? []).toHaveLength(0);
  });

  it('5. missing entity identity blocks auto-apply for instance commands', async () => {
    const contract = await contractFrom(MILESTONE_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/action-milestones/board.tsx': `
        export function ActionMilestoneBoard() {
          return (
            <button
              data-manifest-capability="ActionMilestone.complete"
              onClick={noop}
            >
              Complete
            </button>
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
    const plan = bundle.plans.find(p => p.capabilityId === 'ActionMilestone.complete');
    expect(plan?.decision).toBe('ambiguous-product-decision');
    expect(plan?.automaticApplicationAllowed).toBe(false);
  });

  it('6. replacing unrelated local state behavior blocks auto-apply', async () => {
    const contract = await contractFrom(MILESTONE_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/action-milestones/[id]/page.tsx': `
        export function ActionMilestoneDetail({ milestoneId }: { milestoneId: string }) {
          const [error, setError] = useState<string | null>("x");
          return (
            <div>
              <h1>Complete ActionMilestone</h1>
              <Button onClick={() => setError(null)}>Dismiss</Button>
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
    const plan = bundle.plans.find(p => p.capabilityId === 'ActionMilestone.complete');
    expect(plan?.decision).toBe('ambiguous-product-decision');
    expect(plan?.automaticApplicationAllowed).toBe(false);
  });
});
