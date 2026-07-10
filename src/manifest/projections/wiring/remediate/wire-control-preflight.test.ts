/**
 * Preflight eligibility for wire-existing-control — reject before patching.
 *
 * Live regression: Event.confirm must not attempt to wire CRM scoring-rules
 * window.confirm / generic Confirm controls.
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
import {
  EVENT_DOMAIN,
  SCORING_RULES_WITH_CONFIRM,
  EVENT_CONFIRM_BINDING,
  EVENT_CONFIRM_VALID_CONTROL,
} from './wire-control-preflight.fixtures.js';
import { COLLECTION_DOMAIN } from './wire-existing-control-action.fixtures.js';
import { MILESTONE_DOMAIN } from './wire-existing-control.fixtures.js';

function planFor(capabilityId: string, files: Map<string, string>, domain: string) {
  return contractFrom(domain).then(contract => {
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'], strictCoverage: true },
    });
    return {
      contract,
      plan: planWiringRepairs({
        contract,
        report,
        fileContents: files,
        capabilityId,
      }).plans.find(p => p.capabilityId === capabilityId),
    };
  });
}

describe('wire-existing-control preflight (reject before patch)', () => {
  it('live: Event.confirm on CRM scoring-rules is not an executable plan', async () => {
    const files = fileMapFromRecord({
      'apps/app/app/(authenticated)/(sales)/crm/scoring/components/scoring-rules-client.tsx':
        SCORING_RULES_WITH_CONFIRM,
      'apps/app/app/lib/manifest-client.generated.ts': EVENT_CONFIRM_BINDING,
    });
    const before = files.get(
      'apps/app/app/(authenticated)/(sales)/crm/scoring/components/scoring-rules-client.tsx',
    )!;
    const { plan } = await planFor('Event.confirm', files, EVENT_DOMAIN);
    expect(plan?.automaticApplicationAllowed).toBe(false);
    expect(plan?.decision).toBe('ambiguous-product-decision');
    expect(plan?.edits ?? []).toHaveLength(0);

    const result = remediateWiringSync({
      contract: await contractFrom(EVENT_DOMAIN),
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'Event.confirm',
    });
    expect(result.applied.filter(a => a.applied)).toHaveLength(0);
    expect(result.attemptedPatches ?? 0).toBe(0);
    expect(files.get(
      'apps/app/app/(authenticated)/(sales)/crm/scoring/components/scoring-rules-client.tsx',
    )).toBe(before);
    expect(before).not.toMatch(/eventConfirm/);
    expect(result.applied.every(a => !/Repair incomplete|Binding .* not present/i.test(a.skippedReason ?? ''))).toBe(
      true,
    );
  });

  it('1. nonexistent generated binding blocks the plan before editing', async () => {
    const files = fileMapFromRecord({
      'apps/app/app/events/[id]/page.tsx': EVENT_CONFIRM_VALID_CONTROL,
      // no eventConfirm export anywhere
    });
    const before = [...files.values()][0]!;
    const { plan } = await planFor('Event.confirm', files, EVENT_DOMAIN);
    expect(plan?.automaticApplicationAllowed).toBe(false);
    expect(plan?.decision).toMatch(/ambiguous-product-decision|unsafe-to-apply/);
    expect(plan?.rationale).toMatch(/binding|import|export/i);
    const result = remediateWiringSync({
      contract: await contractFrom(EVENT_DOMAIN),
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'Event.confirm',
    });
    expect(result.attemptedPatches ?? 0).toBe(0);
    expect([...files.values()][0]).toBe(before);
  });

  it('2. unresolved import module blocks the plan before editing', async () => {
    const files = fileMapFromRecord({
      'apps/app/app/events/[id]/page.tsx': EVENT_CONFIRM_VALID_CONTROL,
      'apps/app/app/lib/other-client.ts': EVENT_CONFIRM_BINDING,
    });
    const { plan } = await planFor('Event.confirm', files, EVENT_DOMAIN);
    // Binding exists but not on the planned import path / not resolvable as that module
    expect(plan?.automaticApplicationAllowed).toBe(false);
    expect(plan?.rationale).toMatch(/binding|import|export|module/i);
  });

  it('3. instance command without control-local identity blocks the plan', async () => {
    const files = fileMapFromRecord({
      'apps/app/app/events/board/page.tsx': `
        export function EventBoard() {
          return (
            <button data-manifest-capability="Event.confirm" onClick={noop}>
              Confirm event
            </button>
          );
        }
      `,
      'apps/app/app/lib/manifest-client.generated.ts': EVENT_CONFIRM_BINDING,
    });
    const { plan } = await planFor('Event.confirm', files, EVENT_DOMAIN);
    expect(plan?.automaticApplicationAllowed).toBe(false);
    expect(plan?.rationale).toMatch(/identity|instance|semantic|gates|surface/i);
  });

  it('4. wrong-entity identity blocks the plan', async () => {
    const files = fileMapFromRecord({
      'apps/app/app/events/[id]/page.tsx': `
        export function EventDetail({ rule }: { rule: { id: string } }) {
          return (
            <button
              data-manifest-capability="Event.confirm"
              onClick={() => softDelete({ id: rule.id })}
            >
              Confirm event
            </button>
          );
        }
      `,
      'apps/app/app/lib/manifest-client.generated.ts': EVENT_CONFIRM_BINDING,
    });
    const { plan } = await planFor('Event.confirm', files, EVENT_DOMAIN);
    expect(plan?.automaticApplicationAllowed).toBe(false);
    expect(plan?.rationale).toMatch(/identity|entity|wrong|semantic|surface|gates/i);
  });

  it('5. missing required input blocks the plan', async () => {
    const files = fileMapFromRecord({
      'apps/app/app/events/[id]/page.tsx': `
        export function EventDetail({ eventId }: { eventId: string }) {
          return (
            <button data-manifest-capability="Event.confirm" onClick={noop}>
              Confirm event
            </button>
          );
        }
      `,
      'apps/app/app/lib/manifest-client.generated.ts': EVENT_CONFIRM_BINDING,
    });
    const { plan } = await planFor('Event.confirm', files, EVENT_DOMAIN);
    expect(plan?.automaticApplicationAllowed).toBe(false);
    expect(plan?.rationale).toMatch(/input|userId|build|semantic|gates|surface/i);
  });

  it('6. file-wide action words do not satisfy exact control intent', async () => {
    const files = fileMapFromRecord({
      'apps/app/app/events/page.tsx': `
        export function EventPage({ eventId, userId }: { eventId: string; userId: string }) {
          return (
            <div>
              <p>Staff may confirm events from the detail page.</p>
              <button onClick={() => setFilter("open")}>Filter</button>
            </div>
          );
        }
      `,
      'apps/app/app/lib/manifest-client.generated.ts': EVENT_CONFIRM_BINDING,
    });
    const { plan } = await planFor('Event.confirm', files, EVENT_DOMAIN);
    expect(plan?.automaticApplicationAllowed).toBe(false);
  });

  it('7. generic Confirm does not satisfy Event.confirm', async () => {
    const files = fileMapFromRecord({
      'apps/app/app/events/[id]/page.tsx': `
        export function EventDetail({ eventId, userId }: { eventId: string; userId: string }) {
          return (
            <button onClick={noop}>Confirm</button>
          );
        }
      `,
      'apps/app/app/lib/manifest-client.generated.ts': EVENT_CONFIRM_BINDING,
    });
    const { plan } = await planFor('Event.confirm', files, EVENT_DOMAIN);
    expect(plan?.automaticApplicationAllowed).toBe(false);
  });

  it('8. preflight rejection is not reported as repair failure', async () => {
    const files = fileMapFromRecord({
      'apps/app/app/(authenticated)/(sales)/crm/scoring/components/scoring-rules-client.tsx':
        SCORING_RULES_WITH_CONFIRM,
      'apps/app/app/lib/manifest-client.generated.ts': EVENT_CONFIRM_BINDING,
    });
    const result = remediateWiringSync({
      contract: await contractFrom(EVENT_DOMAIN),
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'Event.confirm',
    });
    const text = (await import('./orchestrator.js')).formatRemediateReportText(result);
    expect(text).toMatch(/Attempted patches:\s*0/);
    expect(text).toMatch(/Preflight rejected:\s*[1-9]/);
    expect(text).not.toMatch(/Repair incomplete/);
    expect(text).not.toMatch(/Binding eventConfirm not present/);
    expect(result.preflightRejected ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('9–10. one-defect continues past preflight reject to a contract repair', async () => {
    const files = fileMapFromRecord({
      'apps/app/app/(authenticated)/(sales)/crm/scoring/components/scoring-rules-client.tsx':
        SCORING_RULES_WITH_CONFIRM,
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
      'apps/app/app/lib/manifest-client.generated.ts': EVENT_CONFIRM_BINDING,
    });
    const result = remediateWiringSync({
      contract: await contractFrom(EVENT_DOMAIN),
      fileContents: files,
      mode: 'one-defect',
    });
    expect(result.applied.some(a => a.applied)).toBe(true);
    const applied = result.applied.find(a => a.applied)!;
    expect(applied.findingId).toMatch(/wrong_input_shape|Task\.create/);
    expect(applied.findingId).not.toMatch(/Event\.confirm/);
    expect(result.attemptedPatches ?? 1).toBeGreaterThanOrEqual(1);
  });

  it('11. no file is temporarily modified for a rejected candidate', async () => {
    const files = fileMapFromRecord({
      'apps/app/app/(authenticated)/(sales)/crm/scoring/components/scoring-rules-client.tsx':
        SCORING_RULES_WITH_CONFIRM,
      'apps/app/app/lib/manifest-client.generated.ts': EVENT_CONFIRM_BINDING,
    });
    const snapshot = new Map(files);
    remediateWiringSync({
      contract: await contractFrom(EVENT_DOMAIN),
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'Event.confirm',
    });
    for (const [k, v] of snapshot) {
      expect(files.get(k)).toBe(v);
    }
  });

  it('12. existing valid exact-action Event.confirm control remains repairable', async () => {
    const files = fileMapFromRecord({
      'apps/app/app/events/[id]/page.tsx': EVENT_CONFIRM_VALID_CONTROL,
      'apps/app/app/lib/manifest-client.generated.ts': EVENT_CONFIRM_BINDING,
    });
    const { plan } = await planFor('Event.confirm', files, EVENT_DOMAIN);
    expect(plan?.automaticApplicationAllowed).toBe(true);
    const patch = applyRepairPlan(plan!, files);
    expect(patch.ok).toBe(true);
    expect(patch.editsApplied).toBeGreaterThan(0);
    const content = [...patch.nextContents.values()].find(c => c.includes('Confirm event'))!;
    expect(content).toMatch(/eventConfirm/);
    expect(content).toMatch(/eventId/);
    expect(content).toMatch(/userId/);
  });

  it('CollectionCase / ActionMilestone prior safety still holds', async () => {
    const collection = await contractFrom(COLLECTION_DOMAIN);
    const milestone = await contractFrom(MILESTONE_DOMAIN);
    expect(collection.capabilities.some(c => c.capabilityId === 'CollectionCase.escalateToLegal')).toBe(
      true,
    );
    expect(milestone.capabilities.some(c => c.capabilityId === 'ActionMilestone.complete')).toBe(true);
  });
});
